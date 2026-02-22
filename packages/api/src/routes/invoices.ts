import { Hono } from 'hono';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { invoices, invoiceEntries, settings } from '../db/schema';
import { desc, eq, and, like, gte, lte, inArray, or, sql, asc } from 'drizzle-orm';
import { validateUpload, computeFileHash, readUploadedFile, getUploadDir } from '../lib/storage/files';
import { startProcessing } from '../lib/pipeline/process';
import { agenticExtract } from '../lib/llm/agent';
import { verifyOcrExtraction } from '../lib/llm/verify';
import { extractPdfText, extractWithTier } from '../lib/pdf/extract';
import { generateDisplayName } from '../utils/displayName';
import { getScheduler } from '../lib/pipeline/PipelineQueue';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);

// ── MIME type map for file serving ──────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
};

// ── Download helpers ─────────────────────────────────────────────────────

const SUMMARY_TYPES = new Set(['subtotal', 'total', 'due', 'tax', 'discount', 'adjustment']);

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

interface EntryRow {
  label: string;
  amount: number | null;
  entry_type: string | null;
  attrs: unknown;
}

interface InvoiceRow {
  id: number;
  display_name: string;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total_amount: number | null;
  gst_amount: number | null;
  currency: string | null;
}

interface InvoiceData {
  inv: InvoiceRow;
  entries: EntryRow[];
}

interface EntryGroup {
  type: string;
  entries: EntryRow[];
}

interface GroupedResult {
  groups: EntryGroup[];
  summaryEntries: EntryRow[];
}

function groupEntries(entries: EntryRow[]): GroupedResult {
  const groupMap = new Map<string, EntryRow[]>();
  const order: string[] = [];
  const summaryEntries: EntryRow[] = [];

  for (const entry of entries) {
    const type = entry.entry_type ?? 'other';
    if (SUMMARY_TYPES.has(type)) {
      summaryEntries.push(entry);
      continue;
    }
    if (!groupMap.has(type)) {
      groupMap.set(type, []);
      order.push(type);
    }
    groupMap.get(type)!.push(entry);
  }

  const groups = order.map(type => ({ type, entries: groupMap.get(type)! }));
  return { groups, summaryEntries };
}

function collectAttrsKeys(entries: EntryRow[]): string[] {
  const keyCounts = new Map<string, number>();
  for (const entry of entries) {
    const attrs = parseAttrs(entry.attrs);
    for (const key of Object.keys(attrs)) {
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
  }
  return [...keyCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key);
}

function parseAttrs(attrs: unknown): Record<string, unknown> {
  if (!attrs) return {};
  if (typeof attrs === 'object' && !Array.isArray(attrs)) return attrs as Record<string, unknown>;
  if (typeof attrs === 'string') {
    try { return JSON.parse(attrs); } catch { return {}; }
  }
  return {};
}

function esc(s: string): string {
  return s.replace(/"/g, '""');
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\- ]/g, '_').slice(0, 100);
}

function buildInvoiceCsv(inv: InvoiceRow, entries: EntryRow[]): string {
  const lines: string[] = [];

  lines.push(`"Invoice","${esc(inv.display_name)}"`);
  if (inv.supplier_name) lines.push(`"Supplier","${esc(inv.supplier_name)}"`);
  if (inv.invoice_number) lines.push(`"Invoice #","${esc(inv.invoice_number)}"`);
  if (inv.invoice_date) lines.push(`"Date","${esc(inv.invoice_date)}"`);
  if (inv.currency) lines.push(`"Currency","${esc(inv.currency)}"`);
  lines.push('');

  if (entries.length === 0) {
    if (inv.total_amount != null) lines.push(`"Total","${inv.total_amount}"`);
    if (inv.gst_amount != null) lines.push(`"GST","${inv.gst_amount}"`);
    return lines.join('\n');
  }

  const { groups, summaryEntries } = groupEntries(entries);

  for (const group of groups) {
    const allAttrsKeys = collectAttrsKeys(group.entries);
    lines.push(`"${esc(titleCase(group.type))}"`);
    const headers = ['Entry', 'Amount', ...allAttrsKeys];
    lines.push(headers.map(h => `"${esc(h)}"`).join(','));
    for (const entry of group.entries) {
      const attrs = parseAttrs(entry.attrs);
      const row = [
        esc(entry.label),
        entry.amount != null ? String(entry.amount) : '',
        ...allAttrsKeys.map(k => esc(String(attrs[k] ?? ''))),
      ];
      lines.push(row.map(v => `"${v}"`).join(','));
    }
    lines.push('');
  }

  if (summaryEntries.length > 0) {
    for (const entry of summaryEntries) {
      lines.push(`"${esc(entry.label)}","${entry.amount != null ? entry.amount : ''}"`);
    }
    lines.push('');
  }

  if (inv.total_amount != null) lines.push(`"Total","${inv.total_amount}"`);
  if (inv.gst_amount != null) lines.push(`"GST","${inv.gst_amount}"`);

  return lines.join('\n');
}

async function buildExcelBuffer(data: InvoiceData[]): Promise<Buffer> {
  const ExcelJSModule = await import('exceljs');
  const ExcelJS = ExcelJSModule.default ?? ExcelJSModule;
  const workbook = new ExcelJS.Workbook();

  for (const { inv, entries } of data) {
    const sheetName = sanitizeFilename(inv.display_name).slice(0, 31);
    const sheet = workbook.addWorksheet(sheetName);

    sheet.addRow(['Invoice', inv.display_name]);
    if (inv.supplier_name) sheet.addRow(['Supplier', inv.supplier_name]);
    if (inv.invoice_number) sheet.addRow(['Invoice #', inv.invoice_number]);
    if (inv.invoice_date) sheet.addRow(['Date', inv.invoice_date]);
    if (inv.currency) sheet.addRow(['Currency', inv.currency]);
    sheet.addRow([]);

    if (entries.length > 0) {
      const { groups, summaryEntries } = groupEntries(entries);

      for (const group of groups) {
        const allAttrsKeys = collectAttrsKeys(group.entries);
        const groupRow = sheet.addRow([titleCase(group.type)]);
        groupRow.font = { bold: true };
        const headerRow = sheet.addRow(['Entry', 'Amount', ...allAttrsKeys]);
        headerRow.font = { italic: true };
        headerRow.eachCell(cell => {
          cell.border = { bottom: { style: 'thin' } };
        });
        for (const entry of group.entries) {
          const attrs = parseAttrs(entry.attrs);
          sheet.addRow([
            entry.label,
            entry.amount,
            ...allAttrsKeys.map(k => {
              const v = attrs[k];
              return v != null ? (typeof v === 'number' ? v : String(v)) : '';
            }),
          ]);
        }
        sheet.addRow([]);
      }

      if (summaryEntries.length > 0) {
        for (const entry of summaryEntries) {
          const r = sheet.addRow([entry.label, entry.amount]);
          r.font = { bold: true };
        }
        sheet.addRow([]);
      }
    }

    if (inv.total_amount != null) {
      const r = sheet.addRow(['Total', inv.total_amount]);
      r.font = { bold: true };
    }
    if (inv.gst_amount != null) sheet.addRow(['GST', inv.gst_amount]);

    sheet.columns.forEach(col => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: false }, cell => {
        const len = String(cell.value ?? '').length;
        if (len > maxLen) maxLen = len;
      });
      col.width = Math.min(maxLen + 2, 40);
    });
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ── Settings helpers ─────────────────────────────────────────────────────

const SETTING_DEFAULTS: Record<string, unknown> = {
  tier_concurrency: 2,
  worker_idle_minutes: 5,
};

const SETTING_VALIDATORS: Record<string, (v: unknown) => boolean> = {
  tier_concurrency: (v) => typeof v === 'number' && v >= 1 && v <= 4 && Number.isInteger(v),
  worker_idle_minutes: (v) => typeof v === 'number' && v >= 1 && v <= 30 && Number.isInteger(v),
};

// ── Route factory ────────────────────────────────────────────────────────

export function invoiceRoutes(db: BetterSQLite3Database) {
  return new Hono()

    // ── GET /api/invoices/awaiting — MUST be before /:id ──────────
    .get('/api/invoices/awaiting', (c) => {
      const REVIEW_STATUSES = ['draft', 'exception'];
      const awaiting = db
        .select({
          id: invoices.id,
          display_name: invoices.display_name,
          original_filename: invoices.original_filename,
          status: invoices.status,
          supplier_name: invoices.supplier_name,
          invoice_date: invoices.invoice_date,
          total_amount: invoices.total_amount,
          ocr_tier: invoices.ocr_tier,
          upload_date: invoices.upload_date,
          exception_type: invoices.exception_type,
          exception_details: invoices.exception_details,
        })
        .from(invoices)
        .where(inArray(invoices.status, REVIEW_STATUSES))
        .orderBy(desc(invoices.id))
        .all();

      const countResult = db
        .select({ count: sql<number>`count(*)` })
        .from(invoices)
        .where(inArray(invoices.status, REVIEW_STATUSES))
        .all();

      return c.json({
        invoices: awaiting,
        count: countResult[0]?.count ?? 0,
      });
    })

    // ── GET /api/invoices/queue — MUST be before /:id ─────────────
    .get('/api/invoices/queue', (c) => {
      const PROCESSING_STATUSES = ['queued', 'uploading', 'extracting', 'processing', 'verifying'];
      const queue = db
        .select({
          id: invoices.id,
          display_name: invoices.display_name,
          original_filename: invoices.original_filename,
          status: invoices.status,
          upload_date: invoices.upload_date,
          error_message: invoices.error_message,
        })
        .from(invoices)
        .where(inArray(invoices.status, PROCESSING_STATUSES))
        .orderBy(desc(invoices.id))
        .all();

      return c.json({ invoices: queue });
    })

    // ── GET /api/invoices/download — MUST be before /:id ──────────
    .get('/api/invoices/download', async (c) => {
      const idsParam = c.req.query('ids');
      if (!idsParam) {
        return c.json({ error: 'Missing ids parameter' }, 400);
      }

      const ids = [...new Set(idsParam.split(',').map(Number).filter(n => !isNaN(n)))];
      if (ids.length === 0) {
        return c.json({ error: 'No valid ids' }, 400);
      }

      const format = c.req.query('format') ?? 'csv';

      const invoiceRows = db.select().from(invoices).where(inArray(invoices.id, ids)).all();
      if (invoiceRows.length === 0) {
        return c.json({ error: 'No invoices found' }, 404);
      }

      const invoiceData: InvoiceData[] = invoiceRows.map(inv => {
        const entries = db
          .select()
          .from(invoiceEntries)
          .where(eq(invoiceEntries.invoice_id, inv.id))
          .orderBy(invoiceEntries.sort_order)
          .all();
        return { inv: inv as InvoiceRow, entries };
      });

      if (format === 'xlsx') {
        const buf = await buildExcelBuffer(invoiceData);
        const filename = invoiceData.length === 1
          ? `${sanitizeFilename(invoiceData[0].inv.display_name)}.xlsx`
          : `invoices_${new Date().toISOString().slice(0, 10)}.xlsx`;
        return c.body(buf, 200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        });
      }

      // CSV
      const csvParts = invoiceData.map(({ inv, entries }) => buildInvoiceCsv(inv, entries));
      const csv = csvParts.join('\n');
      const filename = invoiceData.length === 1
        ? `${sanitizeFilename(invoiceData[0].inv.display_name)}.csv`
        : `invoices_${new Date().toISOString().slice(0, 10)}.csv`;

      return c.body(csv, 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      });
    })

    // ── GET /api/invoices — list with filters ──────────────────────
    .get('/api/invoices', (c) => {
      const status = c.req.query('status');
      const search = c.req.query('search');
      const invoiceDateFrom = c.req.query('invoice_date_from');
      const invoiceDateTo = c.req.query('invoice_date_to');
      const uploadDateFrom = c.req.query('upload_date_from');
      const uploadDateTo = c.req.query('upload_date_to');

      const conditions = [];

      if (status) {
        const statuses = status.split(',');
        conditions.push(inArray(invoices.status, statuses));
      }

      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          or(
            like(invoices.supplier_name, pattern),
            like(invoices.invoice_number, pattern),
            like(invoices.display_name, pattern),
            like(invoices.notes, pattern),
          )
        );
      }

      if (invoiceDateFrom) conditions.push(gte(invoices.invoice_date, invoiceDateFrom));
      if (invoiceDateTo) conditions.push(lte(invoices.invoice_date, invoiceDateTo));
      if (uploadDateFrom) conditions.push(gte(invoices.upload_date, uploadDateFrom));
      if (uploadDateTo) conditions.push(lte(invoices.upload_date, uploadDateTo));

      const query = db.select().from(invoices).orderBy(desc(invoices.id));
      const all = conditions.length > 0
        ? query.where(and(...conditions)).all()
        : query.all();

      return c.json(all);
    })

    // ── POST /api/invoices — upload a file ─────────────────────────
    .post('/api/invoices', async (c) => {
      try {
        const formData = await c.req.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
          return c.json({ error: 'No file provided.' }, 400);
        }

        const validation = validateUpload(file);
        if (!validation.valid) {
          return c.json({ error: validation.error }, 400);
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const hash = computeFileHash(buffer);

        // Check for duplicate
        const existing = db.select({ id: invoices.id, display_name: invoices.display_name })
          .from(invoices)
          .where(eq(invoices.file_hash, hash))
          .get();

        if (existing) {
          return c.json(
            { error: 'Duplicate file detected.', existing_id: existing.id, existing_name: existing.display_name },
            409,
          );
        }

        const result = await startProcessing(buffer, file.name, hash);

        return c.json(
          { id: result.id, display_name: result.display_name },
          202,
        );
      } catch (error) {
        console.error('Upload error:', error);
        return c.json(
          { error: error instanceof Error ? error.message : 'Upload failed.' },
          500,
        );
      }
    })

    // ── GET /api/invoices/:id — detail with entries ────────────────
    .get('/api/invoices/:id', (c) => {
      const invoiceId = parseInt(c.req.param('id'), 10);
      if (isNaN(invoiceId)) {
        return c.json({ error: 'Invalid ID' }, 400);
      }

      const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
      if (!invoice) {
        return c.json({ error: 'Not found' }, 404);
      }

      const entries = db
        .select()
        .from(invoiceEntries)
        .where(eq(invoiceEntries.invoice_id, invoiceId))
        .orderBy(invoiceEntries.sort_order)
        .all();

      return c.json({ ...invoice, entries });
    })

    // ── PUT /api/invoices/:id — update fields + entries ────────────
    .put('/api/invoices/:id', async (c) => {
      const invoiceId = parseInt(c.req.param('id'), 10);
      if (isNaN(invoiceId)) {
        return c.json({ error: 'Invalid ID' }, 400);
      }

      const existing = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
      if (!existing) {
        return c.json({ error: 'Not found' }, 404);
      }

      const body = await c.req.json();
      const { entries: entryUpdates, ...fields } = body;

      if (Object.keys(fields).length > 0) {
        db.update(invoices).set(fields).where(eq(invoices.id, invoiceId)).run();
      }

      if (Array.isArray(entryUpdates)) {
        db.delete(invoiceEntries).where(eq(invoiceEntries.invoice_id, invoiceId)).run();
        for (let i = 0; i < entryUpdates.length; i++) {
          const entry = entryUpdates[i];
          db.insert(invoiceEntries)
            .values({
              invoice_id: invoiceId,
              label: entry.label,
              amount: entry.amount ?? null,
              entry_type: entry.entry_type ?? null,
              attrs: entry.attrs ?? null,
              sort_order: i,
            })
            .run();
        }
      }

      const updated = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
      const updatedEntries = db
        .select()
        .from(invoiceEntries)
        .where(eq(invoiceEntries.invoice_id, invoiceId))
        .orderBy(invoiceEntries.sort_order)
        .all();

      return c.json({ ...updated, entries: updatedEntries });
    })

    // ── DELETE /api/invoices/:id ───────────────────────────────────
    .delete('/api/invoices/:id', (c) => {
      const invoiceId = parseInt(c.req.param('id'), 10);
      if (isNaN(invoiceId)) {
        return c.json({ error: 'Invalid ID' }, 400);
      }

      db.delete(invoices).where(eq(invoices.id, invoiceId)).run();
      return c.json({ deleted: true });
    })

    // ── POST /api/invoices/:id/approve ────────────────────────────
    .post('/api/invoices/:id/approve', async (c) => {
      const invoiceId = parseInt(c.req.param('id'), 10);
      if (isNaN(invoiceId)) {
        return c.json({ error: 'Invalid ID' }, 400);
      }

      const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
      if (!invoice) {
        return c.json({ error: 'Not found' }, 404);
      }

      // Apply any edits from request body
      try {
        const body = await c.req.json();
        if (body && typeof body === 'object') {
          const { entries: entryUpdates, ...fields } = body;

          const allowedFields = ['display_name', 'supplier_name', 'invoice_number', 'invoice_date', 'total_amount', 'gst_amount', 'currency', 'notes', 'gst_number', 'due_date'];
          const updates: Record<string, unknown> = {};
          for (const key of allowedFields) {
            if (key in fields) {
              updates[key] = fields[key];
            }
          }

          if (Object.keys(updates).length > 0) {
            db.update(invoices).set(updates).where(eq(invoices.id, invoiceId)).run();
          }

          if (Array.isArray(entryUpdates)) {
            db.delete(invoiceEntries).where(eq(invoiceEntries.invoice_id, invoiceId)).run();
            for (let i = 0; i < entryUpdates.length; i++) {
              const entry = entryUpdates[i];
              db.insert(invoiceEntries)
                .values({
                  invoice_id: invoiceId,
                  label: entry.label,
                  amount: entry.amount ?? null,
                  entry_type: entry.entry_type ?? null,
                  attrs: entry.attrs ?? null,
                  sort_order: i,
                })
                .run();
            }
          }
        }
      } catch { /* no body — just approve as-is */ }

      // Set status to approved, clear exception fields
      db.update(invoices)
        .set({
          status: 'approved',
          approved_date: new Date().toISOString(),
          exception_type: null,
          exception_details: null,
        })
        .where(eq(invoices.id, invoiceId))
        .run();

      // Find next awaiting invoice for auto-advance
      const next = db
        .select({ id: invoices.id })
        .from(invoices)
        .where(inArray(invoices.status, ['draft', 'exception']))
        .orderBy(asc(invoices.id))
        .limit(1)
        .get();

      return c.json({
        approved: true,
        nextId: next?.id ?? null,
      });
    })

    // ── GET /api/invoices/:id/file — serve the raw file ───────────
    .get('/api/invoices/:id/file', async (c) => {
      const invoiceId = parseInt(c.req.param('id'), 10);
      if (isNaN(invoiceId)) {
        return c.json({ error: 'Invalid ID' }, 400);
      }

      const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
      if (!invoice) {
        return c.json({ error: 'Not found' }, 404);
      }

      if (!invoice.file_path) {
        return c.json({ error: 'No file available' }, 404);
      }

      try {
        const ext = path.extname(invoice.original_filename).toLowerCase();

        // HEIC/HEIF: browsers can't render these — convert to JPEG for preview
        if (ext === '.heic' || ext === '.heif') {
          const jpegPath = invoice.file_path.replace(/\.(heic|heif)$/i, '.preview.jpg');
          const fullJpegPath = path.resolve(getUploadDir(), '..', jpegPath);

          // Convert once and cache
          if (!fs.existsSync(fullJpegPath)) {
            const fullOrigPath = path.resolve(getUploadDir(), '..', invoice.file_path);
            await execFileAsync('python', ['-c', [
              'from pillow_heif import register_heif_opener; register_heif_opener()',
              'from PIL import Image',
              'import sys',
              'img = Image.open(sys.argv[1])',
              'if img.mode not in ("RGB", "L"): img = img.convert("RGB")',
              'img.save(sys.argv[2], "JPEG", quality=90)',
            ].join('\n'), fullOrigPath, fullJpegPath], { timeout: 30_000 });
          }

          const jpegBuffer = fs.readFileSync(fullJpegPath);
          const baseName = path.basename(invoice.original_filename, path.extname(invoice.original_filename));
          const safeHeicName = `${baseName.replace(/[^\x20-\x7E]/g, '_')}.jpg`;
          const encodedHeicName = encodeURIComponent(`${baseName}.jpg`);
          return c.body(jpegBuffer, 200, {
            'Content-Type': 'image/jpeg',
            'Content-Disposition': `inline; filename="${safeHeicName}"; filename*=UTF-8''${encodedHeicName}`,
            'Cache-Control': 'private, max-age=3600',
          });
        }

        const buffer = await readUploadedFile(invoice.file_path);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const safeName = invoice.original_filename.replace(/[^\x20-\x7E]/g, '_');
        const encodedName = encodeURIComponent(invoice.original_filename);

        return c.body(buffer, 200, {
          'Content-Type': contentType,
          'Content-Disposition': `inline; filename="${safeName}"; filename*=UTF-8''${encodedName}`,
          'Cache-Control': 'private, max-age=3600',
        });
      } catch (err) {
        console.error('File serve error:', err);
        return c.json({ error: 'File not found on disk' }, 404);
      }
    })

    // ── POST /api/invoices/:id/reprocess ──────────────────────────
    .post('/api/invoices/:id/reprocess', async (c) => {
      const invoiceId = parseInt(c.req.param('id'), 10);
      if (isNaN(invoiceId)) {
        return c.json({ error: 'Invalid ID' }, 400);
      }

      const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
      if (!invoice) {
        return c.json({ error: 'Not found' }, 404);
      }

      if (!invoice.file_path) {
        return c.json({ error: 'No PDF file available to reprocess.' }, 400);
      }

      // Parse optional tier from request body
      let targetTier: 2 | 3 | undefined;
      try {
        const body = await c.req.json();
        if (body.tier === 2 || body.tier === 3) {
          targetTier = body.tier;
        }
      } catch { /* no body or invalid JSON — use default extraction */ }

      try {
        // Delete old entries
        db.delete(invoiceEntries).where(eq(invoiceEntries.invoice_id, invoiceId)).run();

        // Re-extract text from file
        db.update(invoices)
          .set({ status: 'extracting' })
          .where(eq(invoices.id, invoiceId))
          .run();

        const extraction = targetTier
          ? await extractWithTier(invoice.file_path, targetTier)
          : await extractPdfText(invoice.file_path);

        db.update(invoices)
          .set({ status: 'processing', raw_extracted_text: extraction.fullText, ocr_tier: extraction.ocrTier })
          .where(eq(invoices.id, invoiceId))
          .run();

        // Re-run LLM on fresh extraction
        const result = await agenticExtract(extraction.fullText, extraction.pages);
        let ext = result.extraction;

        // OCR verification when text layer reference is available
        if (extraction.textLayerRef) {
          db.update(invoices)
            .set({ status: 'verifying' })
            .where(eq(invoices.id, invoiceId))
            .run();

          try {
            const verification = await verifyOcrExtraction(ext, extraction.textLayerRef);
            if (verification.corrections.length > 0) {
              console.log(`OCR verification corrected ${verification.corrections.length} issue(s):`, verification.corrections);
              ext = verification.corrected;
              const correctionNote = `OCR corrections applied: ${verification.corrections.join('; ')}`;
              ext.notes = ext.notes ? `${ext.notes}\n\n${correctionNote}` : correctionNote;
            }
          } catch (verifyError) {
            console.warn('OCR verification failed, using original extraction:', verifyError);
          }
        }

        const displayName = generateDisplayName({
          invoice_date: ext.invoice_date ?? null,
          supplier_name: ext.supplier_name ?? null,
          invoice_number: ext.invoice_number ?? null,
          entries: ext.entries ?? [],
          original_filename: invoice.original_filename,
        });

        db.update(invoices)
          .set({
            display_name: displayName,
            invoice_date: ext.invoice_date ?? null,
            supplier_name: ext.supplier_name ?? null,
            invoice_number: ext.invoice_number ?? null,
            total_amount: ext.total_amount ?? null,
            gst_amount: ext.gst_amount ?? null,
            currency: ext.currency ?? 'NZD',
            gst_number: ext.gst_number ?? null,
            due_date: ext.due_date ?? null,
            notes: ext.notes ?? null,
            raw_llm_response: result.rawConversation,
            status: 'draft',
            error_message: null,
          })
          .where(eq(invoices.id, invoiceId))
          .run();

        if (ext.entries && ext.entries.length > 0) {
          for (let i = 0; i < ext.entries.length; i++) {
            const entry = ext.entries[i];
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

        return c.json({ success: true, display_name: displayName });
      } catch (error) {
        db.update(invoices)
          .set({
            status: 'error',
            error_message: error instanceof Error ? error.message : 'Reprocess failed.',
          })
          .where(eq(invoices.id, invoiceId))
          .run();
        return c.json(
          { error: error instanceof Error ? error.message : 'Reprocess failed.' },
          500,
        );
      }
    })

    // ── GET /api/settings ─────────────────────────────────────────
    .get('/api/settings', (c) => {
      const rows = db.select().from(settings).all();

      const result: Record<string, unknown> = { ...SETTING_DEFAULTS };
      for (const row of rows) {
        if (row.key in SETTING_DEFAULTS) {
          result[row.key] = row.value;
        }
      }

      return c.json(result);
    })

    // ── PUT /api/settings ─────────────────────────────────────────
    .put('/api/settings', async (c) => {
      const body = await c.req.json() as Record<string, unknown>;
      const errors: string[] = [];

      for (const [key, value] of Object.entries(body)) {
        const validator = SETTING_VALIDATORS[key];
        if (!validator) {
          errors.push(`Unknown setting: ${key}`);
          continue;
        }
        if (!validator(value)) {
          errors.push(`Invalid value for ${key}: ${JSON.stringify(value)}`);
          continue;
        }

        const existing = db.select().from(settings).where(eq(settings.key, key)).get();
        if (existing) {
          db.update(settings)
            .set({ value: value as number })
            .where(eq(settings.key, key))
            .run();
        } else {
          db.insert(settings)
            .values({ key, value: value as number })
            .run();
        }
      }

      if (errors.length > 0) {
        return c.json({ errors }, 400);
      }

      // Apply settings to the running pipeline queue immediately
      try {
        const scheduler = getScheduler();
        if (body.tier_concurrency !== undefined) {
          scheduler.updateConfig(body.tier_concurrency as number);
        }
        if (body.worker_idle_minutes !== undefined) {
          scheduler.updateConfig(undefined, (body.worker_idle_minutes as number) * 60 * 1000);
        }
      } catch {
        // Pipeline queue might not be initialized yet — settings saved for next startup
      }

      return c.json({ ok: true });
    });
}
