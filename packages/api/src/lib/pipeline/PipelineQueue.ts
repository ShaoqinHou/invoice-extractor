import { getDb } from '../../db/client';
import { invoices, invoiceEntries, settings } from '../../db/schema';
import { eq } from 'drizzle-orm';
import {
  IMAGE_EXTENSIONS,
  renderWithGhostscript,
  convertImageToPages,
  cleanupImageDir,
  assessPymupdfQuality,
  runVlmOcrWithFallback,
  type PdfExtraction,
} from '../pdf/extract';
import { agenticExtract } from '../llm/agent';
import { verifyOcrExtraction } from '../llm/verify';
import { generateDisplayName } from '../../utils/displayName';
import { WorkerManager } from './WorkerManager';
import path from 'path';
import { fileURLToPath } from 'url';
import type { InvoiceExtraction } from '../llm/schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
import { normalizeAllEntryAttrs } from './normalizeAttrs';

// ─── Semaphore ──────────────────────────────────────────────────────────

class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    if (this.waiting.length > 0) {
      const next = this.waiting.shift()!;
      next();
    } else {
      this.permits++;
    }
  }

  /** Update max permits (for settings changes). Releases extra permits if increased. */
  updatePermits(newMax: number): void {
    const diff = newMax - (this.permits + this.waiting.length);
    if (diff > 0) {
      this.permits += diff;
      // Wake up waiting jobs if permits are now available
      while (this.permits > 0 && this.waiting.length > 0) {
        this.permits--;
        const next = this.waiting.shift()!;
        next();
      }
    }
  }
}

// ─── Job type ───────────────────────────────────────────────────────────

interface PipelineJob {
  invoiceId: number;
  filePath: string;
}

// ─── Pipeline Queue ─────────────────────────────────────────────────────

export class PipelineQueue {
  private queue: PipelineJob[] = [];
  private tierSemaphore: Semaphore;
  private ocrMutex: Semaphore;
  private processing = false;

  /** Persistent Python workers — spawned on first use, stay alive between jobs. */
  readonly pymupdfWorker: WorkerManager;
  readonly ocrWorker: WorkerManager;

  constructor(tierConcurrency = 2, workerIdleMs = 5 * 60 * 1000) {
    this.tierSemaphore = new Semaphore(tierConcurrency);
    this.ocrMutex = new Semaphore(1);
    this.pymupdfWorker = new WorkerManager('pymupdf_worker.py', 'pymupdf', workerIdleMs);
    this.ocrWorker = new WorkerManager('ocr_worker.py', 'ocr', workerIdleMs);
  }

  /** Enqueue a job for processing. Non-blocking — starts the processing loop if not running. */
  enqueue(job: PipelineJob): void {
    this.queue.push(job);
    this.processLoop();
  }

  /** Update concurrency settings (from settings page). */
  updateConfig(tierConcurrency?: number, workerIdleMs?: number): void {
    if (tierConcurrency !== undefined) {
      this.tierSemaphore.updatePermits(tierConcurrency);
    }
    if (workerIdleMs !== undefined) {
      this.pymupdfWorker.idleTimeoutMs = workerIdleMs;
      this.ocrWorker.idleTimeoutMs = workerIdleMs;
    }
  }

  /** Main processing loop — picks jobs from queue, respects tier semaphore. */
  private async processLoop(): Promise<void> {
    if (this.processing) return; // loop already running
    this.processing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift()!;

      // Acquire a tier slot — blocks if at max concurrency
      await this.tierSemaphore.acquire();

      // Process job in background — release tier slot when done
      this.processJob(job)
        .catch((err) => {
          console.error(`Pipeline job failed for invoice ${job.invoiceId}:`, err);
        })
        .finally(() => {
          this.tierSemaphore.release();
        });
    }

    this.processing = false;
  }

  /** Process a single invoice through the full pipeline. */
  private async processJob(job: PipelineJob): Promise<void> {
    const db = getDb();
    const { invoiceId, filePath } = job;

    try {
      // ─── Stage 1: Classification + Text Extraction ───────────────
      db.update(invoices)
        .set({ status: 'extracting' })
        .where(eq(invoices.id, invoiceId))
        .run();

      const absolutePath = path.resolve(PROJECT_ROOT, filePath);
      const ext = path.extname(absolutePath).toLowerCase();
      const isImage = IMAGE_EXTENSIONS.has(ext);

      let extraction: PdfExtraction;

      if (isImage) {
        // Images → straight to OCR
        extraction = await this.extractImage(absolutePath);
      } else {
        // PDF → try text layer first
        extraction = await this.extractPdf(absolutePath);
      }

      db.update(invoices)
        .set({ raw_extracted_text: extraction.fullText, ocr_tier: extraction.ocrTier })
        .where(eq(invoices.id, invoiceId))
        .run();

      // ─── Stage 2: LLM Agentic Extraction ────────────────────────
      db.update(invoices)
        .set({ status: 'processing' })
        .where(eq(invoices.id, invoiceId))
        .run();

      let llmResult: { extraction: InvoiceExtraction; rawConversation: string };
      try {
        llmResult = await agenticExtract(extraction.fullText, extraction.pages);
      } catch (llmError) {
        console.error('LLM extraction failed:', llmError);
        db.update(invoices)
          .set({
            status: 'draft',
            notes: `LLM extraction failed: ${llmError instanceof Error ? llmError.message : 'Unknown error'}. Raw text preserved.`,
          })
          .where(eq(invoices.id, invoiceId))
          .run();
        return;
      }

      // ─── Stage 3: OCR Verification ──────────────────────────────
      let ext2 = llmResult.extraction;
      if (extraction.textLayerRef) {
        db.update(invoices)
          .set({ status: 'verifying' })
          .where(eq(invoices.id, invoiceId))
          .run();

        try {
          const verification = await verifyOcrExtraction(ext2, extraction.textLayerRef);
          if (verification.corrections.length > 0) {
            console.log(`OCR verification corrected ${verification.corrections.length} issue(s)`);
            ext2 = verification.corrected;
            const correctionNote = `OCR corrections applied: ${verification.corrections.join('; ')}`;
            ext2.notes = ext2.notes ? `${ext2.notes}\n\n${correctionNote}` : correctionNote;
          }
        } catch (verifyError) {
          console.warn('OCR verification failed, using original extraction:', verifyError);
        }
      }

      // ─── Stage 4: Store ──────────────────────────────────────────
      const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
      const displayName = generateDisplayName({
        invoice_date: ext2.invoice_date ?? null,
        supplier_name: ext2.supplier_name ?? null,
        invoice_number: ext2.invoice_number ?? null,
        total_amount: ext2.total_amount ?? null,
        entries: ext2.entries ?? [],
        original_filename: invoice?.original_filename ?? 'unknown',
      });

      db.update(invoices)
        .set({
          display_name: displayName,
          invoice_date: ext2.invoice_date ?? null,
          supplier_name: ext2.supplier_name ?? null,
          invoice_number: ext2.invoice_number ?? null,
          total_amount: ext2.total_amount ?? null,
          gst_amount: ext2.gst_amount ?? null,
          currency: ext2.currency ?? 'NZD',
          gst_number: ext2.gst_number ?? null,
          due_date: ext2.due_date ?? null,
          notes: ext2.notes ?? null,
          raw_llm_response: llmResult.rawConversation,
          status: 'draft',
        })
        .where(eq(invoices.id, invoiceId))
        .run();

      // Normalize attrs to standardized format
      const normalizedEntries = ext2.entries ? normalizeAllEntryAttrs(ext2.entries) : [];

      if (normalizedEntries.length > 0) {
        for (let i = 0; i < normalizedEntries.length; i++) {
          const entry = normalizedEntries[i];
          db.insert(invoiceEntries)
            .values({
              invoice_id: invoiceId,
              label: entry.label,
              amount: entry.amount ?? null,
              entry_type: entry.type ?? null,
              attrs: entry.attrs ?? null,
              sort_order: i,
            })
            .run();
        }
      }
    } catch (error) {
      db.update(invoices)
        .set({
          status: 'error',
          error_message: error instanceof Error ? error.message : 'Unknown error',
        })
        .where(eq(invoices.id, invoiceId))
        .run();
    }
  }

  /** Extract text from a PDF: pymupdf worker → assess quality → OCR if needed. */
  private async extractPdf(absolutePath: string): Promise<PdfExtraction> {
    // Tier 1: Try persistent pymupdf worker
    let textLayerResult: PdfExtraction | null = null;
    let textLayerBroken = false;

    try {
      const result = await this.pymupdfWorker.request({ pdfPath: absolutePath }) as {
        fullText: string;
        pages: string[];
        totalPages: number;
      };

      textLayerResult = {
        fullText: result.fullText,
        pages: result.pages,
        totalPages: result.totalPages,
        ocrTier: 1 as const,
      };

      const quality = assessPymupdfQuality(result.fullText);
      if (quality.accept) {
        return textLayerResult;
      }

      textLayerBroken = quality.textLayerBroken;
      console.log(`pymupdf: ${quality.reason} — falling back to OCR`);
    } catch {
      console.log('pymupdf worker failed — falling back to OCR');
    }

    // Render pages with Ghostscript
    const imageDir = await renderWithGhostscript(absolutePath);
    try {
      const result = await runVlmOcrWithFallback(imageDir);
      if (textLayerBroken && textLayerResult) {
        result.textLayerRef = textLayerResult.fullText;
      }
      return result;
    } finally {
      cleanupImageDir(imageDir);
    }
  }

  /** Extract text from an image file: convert to pages → VLM OCR (with legacy fallback). */
  private async extractImage(absolutePath: string): Promise<PdfExtraction> {
    const imageDir = await convertImageToPages(absolutePath);
    try {
      return await runVlmOcrWithFallback(imageDir);
    } finally {
      cleanupImageDir(imageDir);
    }
  }

  /** Send rendered images to the persistent OCR worker. */
  private async runOcrWorker(
    imageDir: string,
    textLayerResult: PdfExtraction | null,
    textLayerBroken: boolean,
  ): Promise<PdfExtraction> {
    // Acquire OCR mutex — only 1 OCR at a time (RAM constraint)
    await this.ocrMutex.acquire();

    try {
      const request: Record<string, unknown> = { imageDir };
      if (textLayerBroken && textLayerResult) {
        request.textLayerRef = textLayerResult.fullText;
      }

      const result = await this.ocrWorker.request(request) as {
        fullText: string;
        pages: string[];
        totalPages: number;
        ocrTier: 2 | 3;
      };

      const extraction: PdfExtraction = {
        fullText: result.fullText,
        pages: result.pages,
        totalPages: result.totalPages,
        ocrTier: result.ocrTier,
      };

      if (textLayerBroken && textLayerResult) {
        extraction.textLayerRef = textLayerResult.fullText;
      }

      return extraction;
    } finally {
      this.ocrMutex.release();
      cleanupImageDir(imageDir);
    }
  }

  /** Shut down all workers (for graceful server shutdown). */
  shutdown(): void {
    this.pymupdfWorker.shutdown();
    this.ocrWorker.shutdown();
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────

let _instance: PipelineQueue | null = null;

/** Get the global PipelineQueue singleton. Loads settings from DB on first call. */
export function getPipelineQueue(): PipelineQueue {
  if (!_instance) {
    // Load settings from DB
    let tierConcurrency = 2;
    let workerIdleMs = 5 * 60 * 1000;

    try {
      const db = getDb();
      const tierSetting = db.select().from(settings).where(eq(settings.key, 'tier_concurrency')).get();
      if (tierSetting?.value != null) {
        const val = Number(tierSetting.value);
        if (val >= 1 && val <= 4) tierConcurrency = val;
      }
      const idleSetting = db.select().from(settings).where(eq(settings.key, 'worker_idle_minutes')).get();
      if (idleSetting?.value != null) {
        const val = Number(idleSetting.value);
        if (val >= 1 && val <= 30) workerIdleMs = val * 60 * 1000;
      }
    } catch {
      // DB not ready yet — use defaults
    }

    _instance = new PipelineQueue(tierConcurrency, workerIdleMs);
  }
  return _instance;
}

/** Get the singleton for external config updates. */
export function getScheduler(): PipelineQueue {
  return getPipelineQueue();
}
