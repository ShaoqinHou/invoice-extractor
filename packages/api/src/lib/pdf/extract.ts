import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

export interface PdfExtraction {
  fullText: string;
  pages: string[];
  totalPages: number;
  /** When OCR fallback was used, this holds the raw text-layer output for cross-checking. */
  textLayerRef?: string;
  /** Which extraction tier produced this result: 1=pymupdf4llm, 2=VLM OCR, 3=legacy paddle */
  ocrTier: 1 | 2 | 3;
}

export interface TesseractConfidence {
  mean: number;
  per_page: number[];
  low_confidence_words: number;
  total_words: number;
}

export interface TesseractResult {
  fullText: string;
  pages: string[];
  totalPages: number;
  confidence: TesseractConfidence;
  error?: string;
}

const SCRIPTS_DIR = path.join(PROJECT_ROOT, 'scripts');
const PYMUPDF_SCRIPT = path.join(SCRIPTS_DIR, 'pymupdf4llm_extract.py');
const GS_RENDER_SCRIPT = path.join(SCRIPTS_DIR, 'gs_render.py');
const IMAGE_TO_PAGES_SCRIPT = path.join(SCRIPTS_DIR, 'image_to_pages.py');
const TESSERACT_SCRIPT = path.join(SCRIPTS_DIR, 'tesseract_ocr.py');
const PADDLE_SCRIPT = path.join(SCRIPTS_DIR, 'paddle_ocr.py');
const VLM_PREPROCESS_SCRIPT = path.join(SCRIPTS_DIR, 'vlm_preprocess.py');

/** Supported image extensions (non-PDF documents that go straight to OCR). */
export const IMAGE_EXTENSIONS = new Set([
  '.heic', '.heif', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.webp',
]);

/**
 * Strict quality thresholds for Tesseract (tier 2).
 *
 * Watercare (our hardest clean-scan PDF) scores 88.1% mean, 7.8% low-conf ratio.
 * We set the bar just below that — anything noticeably worse gets escalated to Docling.
 */
const MIN_CONFIDENCE = 80;
const MAX_LOW_CONFIDENCE_RATIO = 0.10;
const MIN_TEXT_LENGTH = 50;
const MIN_NUMBER_MATCH_RATIO = 0.5;

/**
 * Extract text from a document (PDF or image).
 *
 * Two-tier strategy:
 * 1. pymupdf4llm (~1 sec) — text-layer extraction, PDF only, works for clean PDFs
 * 2. VLM OCR (~6 sec) — preprocess (orient + unwarp) then glm-4.6v-flash vision model
 *
 * For PDFs: Ghostscript renders the pages (handles Type3 fonts correctly).
 * For images (HEIC, JPG, PNG, etc.): image is used directly as a single page.
 *
 * Legacy tier 2 (Tesseract) and tier 3 (PaddleOCR) functions are preserved
 * in this file but not used in the main pipeline.
 */
export async function extractPdfText(filePath: string): Promise<PdfExtraction> {
  const absolutePath = path.resolve(PROJECT_ROOT, filePath);
  const ext = path.extname(absolutePath).toLowerCase();
  const isImage = IMAGE_EXTENSIONS.has(ext);

  // For image files, skip pymupdf4llm entirely — go straight to OCR
  if (isImage) {
    console.log(`Image file detected (${ext}) — using OCR pipeline directly`);
    return extractFromImages(absolutePath);
  }

  // PDF path: try text-layer first, then OCR pipeline
  return extractFromPdf(absolutePath);
}

/** Extract from a PDF: try text layer first, fall back to OCR pipeline. */
async function extractFromPdf(absolutePath: string): Promise<PdfExtraction> {
  // Tier 1: Try fast pymupdf4llm
  let textLayerResult: PdfExtraction | null = null;
  let textLayerBroken = false;

  try {
    textLayerResult = await runPymupdf(absolutePath);
    const hasCidGarbage = textLayerResult.fullText.includes('(cid:');
    const replacementCount = (textLayerResult.fullText.match(/\ufffd/g) || []).length;
    const hasReplacementGarbage = replacementCount > 20;
    const hasMinimalText = textLayerResult.fullText.trim().length < 100;

    if (!hasCidGarbage && !hasReplacementGarbage && !hasMinimalText) {
      return { ...textLayerResult, ocrTier: 1 as const };
    }

    textLayerBroken = hasCidGarbage || hasReplacementGarbage;
    const reason = hasMinimalText ? 'minimal text (possibly scanned/image PDF)'
      : `broken text (cid:${hasCidGarbage}, replacements:${replacementCount})`;
    console.log(`pymupdf4llm: ${reason} — falling back to OCR pipeline`);
  } catch {
    console.log('pymupdf4llm failed — falling back to OCR pipeline');
  }

  // Render pages with Ghostscript (shared between tier 2 and 3)
  let imageDir: string;
  try {
    imageDir = await renderWithGhostscript(absolutePath);
  } catch (gsError) {
    throw new Error(`Ghostscript rendering failed: ${gsError instanceof Error ? gsError.message : gsError}`);
  }

  return runOcrPipeline(imageDir, textLayerResult, textLayerBroken);
}

/** Extract from an image file: convert to page image, then run OCR pipeline. */
async function extractFromImages(absolutePath: string): Promise<PdfExtraction> {
  let imageDir: string;
  try {
    imageDir = await convertImageToPages(absolutePath);
  } catch (err) {
    throw new Error(`Image conversion failed: ${err instanceof Error ? err.message : err}`);
  }

  // No text layer for image files
  return runOcrPipeline(imageDir, null, false);
}

/**
 * Run the OCR pipeline on pre-rendered page images.
 *
 * Tier 2: VLM OCR — preprocess (orient + unwarp) then glm-4.6v-flash.
 * Falls back to legacy Tesseract → PaddleOCR chain if VLM is unavailable.
 */
async function runOcrPipeline(
  imageDir: string,
  textLayerResult: PdfExtraction | null,
  textLayerBroken: boolean,
): Promise<PdfExtraction> {
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

/**
 * Primary OCR: VLM (no fallback — errors propagate so we can diagnose).
 * Legacy fallback is available but disabled by default.
 * Set ENABLE_OCR_FALLBACK=true to enable PaddleOCR fallback on VLM failure.
 */
export async function runVlmOcrWithFallback(imageDir: string): Promise<PdfExtraction> {
  if (!process.env.ZAI_API_KEY) {
    console.log('Tier 2: ZAI_API_KEY not set, using PaddleOCR fallback');
    return runLegacyOcrPipeline(imageDir);
  }

  const fallbackEnabled = process.env.ENABLE_OCR_FALLBACK === 'true';

  try {
    console.log('Tier 2: VLM OCR (preprocess + glm-4.6v-flash)...');
    const result = await runVlmOcr(imageDir);
    result.ocrTier = 2;
    console.log('VLM OCR succeeded');
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (fallbackEnabled) {
      console.warn('VLM OCR failed, falling back to PaddleOCR:', msg);
      return runLegacyOcrPipeline(imageDir);
    }
    console.error('VLM OCR failed (no fallback):', msg);
    throw e;
  }
}

/** Legacy OCR fallback: PaddleOCR directly (Tesseract skipped). */
async function runLegacyOcrPipeline(imageDir: string): Promise<PdfExtraction> {
  console.log('Legacy fallback: running PaddleOCR directly...');
  const paddleResult = await runPaddleOcr(imageDir);
  paddleResult.ocrTier = 3;
  return paddleResult;
}

/** Render PDF pages to images with Ghostscript. Returns the image directory path. */
export async function renderWithGhostscript(pdfPath: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync('python', [GS_RENDER_SCRIPT, pdfPath], {
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  const result = parseJson<{ image_dir: string; images: string[]; totalPages: number }>(stdout, stderr);
  return result.image_dir;
}

/** Convert an image file (HEIC, JPG, etc.) to a page image directory. */
export async function convertImageToPages(imagePath: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync('python', [IMAGE_TO_PAGES_SCRIPT, imagePath], {
    timeout: 60_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  const result = parseJson<{ image_dir: string; images: string[]; totalPages: number }>(stdout, stderr);
  return result.image_dir;
}

/** Run Tesseract OCR on pre-rendered images. */
async function runTesseract(imageDir: string): Promise<TesseractResult> {
  const { stdout, stderr } = await execFileAsync('python', [TESSERACT_SCRIPT, imageDir], {
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return parseJson<TesseractResult>(stdout, stderr);
}

/** Legacy: Run PaddleOCR on pre-rendered images → clean formatted text. */
async function runPaddleOcr(imageDir: string): Promise<PdfExtraction> {
  const { stdout, stderr } = await execFileAsync('python', [PADDLE_SCRIPT, imageDir], {
    timeout: 300_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  const result = parseJson<{ fullText: string; pages: string[]; totalPages: number }>(stdout, stderr);
  return {
    fullText: result.fullText,
    pages: result.pages,
    totalPages: result.totalPages,
    ocrTier: 3,
  };
}

/**
 * Run VLM OCR via glm-4.6v-flash: send page images to the vision model for text extraction.
 *
 * Uses the OpenAI-compatible endpoint at z.ai (free tier model).
 * Produces cleaner output than PaddleOCR for most receipt/invoice images.
 *
 * Preprocessing pipeline (via vlm_preprocess.py):
 * 1. Orientation detection (PP-LCNet) — auto-rotate 0/90/180/270
 * 2. Unwarping (UVDoc) — flatten curved/folded documents
 * 3. JPEG q90, capped at 5MB — maximize quality for VLM
 * Falls back to simple resize if PaddleX is unavailable.
 */
async function runVlmOcr(imageDir: string): Promise<PdfExtraction> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) throw new Error('ZAI_API_KEY required for VLM OCR');

  // Count page images
  let pageCount = 0;
  while (fs.existsSync(path.join(imageDir, `page_${pageCount + 1}.png`))) {
    pageCount++;
  }
  if (pageCount === 0) {
    throw new Error(`No page_*.png images found in ${imageDir}`);
  }

  // Preprocess: orient + unwarp + JPEG (or fall back to simple resize)
  const pageBase64s = await preprocessImagesForVlm(imageDir, pageCount);

  const VLM_MODEL = 'glm-4.6v-flash';
  const VLM_ENDPOINT = 'https://api.z.ai/api/paas/v4/chat/completions';
  const VLM_PROMPT = `Extract ALL text from this document image exactly as it appears, preserving layout.
Rules:
- Each line of text should be its own line in your output
- Items and their prices should be on the same line, separated by spaces
- Preserve all numbers, prices, dates, and codes exactly
- Include headers, footers, barcodes text, everything visible
- Output ONLY the raw extracted text, no commentary, no markdown formatting`;

  const pageTexts: string[] = [];

  for (let i = 0; i < pageBase64s.length; i++) {
    try {
      const payload = {
        model: VLM_MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${pageBase64s[i]}` } },
            { type: 'text', text: VLM_PROMPT },
          ],
        }],
        stream: false,
        max_tokens: 4096,
      };

      const resp = await fetch(VLM_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120_000),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`VLM API ${resp.status}: ${errText}`);
      }

      const result = await resp.json() as {
        choices: { message: { content: string } }[];
      };
      const text = result.choices?.[0]?.message?.content?.trim() || '[No VLM output]';
      pageTexts.push(text);
    } catch (e) {
      // Re-throw so runVlmOcrWithFallback can catch and fall back to legacy OCR
      throw e;
    }
  }

  const fullText = pageTexts.join('\n\n---\n\n');
  return {
    fullText,
    pages: pageTexts,
    totalPages: pageCount,
    ocrTier: 2,
  };
}

/**
 * Preprocess page images for VLM: orientation correction, unwarping, JPEG conversion.
 *
 * Tries the full PaddleX pipeline (vlm_preprocess.py) first. If unavailable
 * (PaddleX not installed, model download fails, etc.), falls back to simple
 * Pillow resize — still produces usable JPEG, just without orient/unwarp.
 *
 * Returns an array of base64-encoded JPEG strings, one per page.
 */
async function preprocessImagesForVlm(imageDir: string, pageCount: number): Promise<string[]> {
  // Try full preprocessing pipeline (orient + unwarp + JPEG q90)
  try {
    console.log('VLM preprocess: running orientation + unwarping pipeline...');
    const { stdout, stderr } = await execFileAsync('python', [VLM_PREPROCESS_SCRIPT, imageDir], {
      timeout: 300_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (stderr) {
      // Log preprocessing details (model loading, rotation info, etc.)
      for (const line of stderr.split('\n').filter(Boolean)) {
        console.log(`  ${line.trim()}`);
      }
    }
    const result = parseJson<{ pages: { page: number; file: string; rotated: number; unwarped: boolean }[] }>(stdout, stderr);

    // Read preprocessed JPEGs as base64
    const base64s: string[] = [];
    for (const pageInfo of result.pages) {
      const jpegPath = path.join(imageDir, pageInfo.file);
      const buf = fs.readFileSync(jpegPath);
      base64s.push(buf.toString('base64'));
    }
    console.log(`VLM preprocess: ${base64s.length} pages ready`);
    return base64s;
  } catch (e) {
    console.warn('VLM preprocess pipeline failed, using simple resize fallback:', e instanceof Error ? e.message : e);
  }

  // Fallback: simple Pillow resize (no orient/unwarp, but still works)
  const base64s: string[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const imgPath = path.join(imageDir, `page_${i}.png`);
    base64s.push(await resizeImageForVlm(imgPath, 2000));
  }
  return base64s;
}

/** Run pymupdf4llm text-layer extraction. */
async function runPymupdf(pdfPath: string): Promise<PdfExtraction> {
  const { stdout, stderr } = await execFileAsync('python', [PYMUPDF_SCRIPT, pdfPath], {
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  const result = parseJson<{ fullText: string; pages: string[]; totalPages: number }>(stdout, stderr);
  return {
    fullText: result.fullText,
    pages: result.pages,
    totalPages: result.totalPages,
    ocrTier: 1,
  };
}

/**
 * Re-extract using a specific OCR tier.
 * Tier 2 = VLM OCR (primary), Tier 3 = legacy PaddleOCR (manual override).
 * Used for targeted reprocessing when the user wants a different extraction.
 */
export async function extractWithTier(filePath: string, targetTier: 2 | 3): Promise<PdfExtraction> {
  const absolutePath = path.resolve(PROJECT_ROOT, filePath);
  const ext = path.extname(absolutePath).toLowerCase();
  const isImage = IMAGE_EXTENSIONS.has(ext);

  // Render page images
  let imageDir: string;
  if (isImage) {
    imageDir = await convertImageToPages(absolutePath);
  } else {
    imageDir = await renderWithGhostscript(absolutePath);
  }

  // Get text layer ref for PDFs (best effort)
  let textLayerRef: string | undefined;
  if (!isImage) {
    try {
      const pymupdfResult = await runPymupdf(absolutePath);
      const hasCidGarbage = pymupdfResult.fullText.includes('(cid:');
      const replacementCount = (pymupdfResult.fullText.match(/\ufffd/g) || []).length;
      if (hasCidGarbage || replacementCount > 20) {
        textLayerRef = pymupdfResult.fullText;
      }
    } catch { /* no text layer ref available */ }
  }

  try {
    if (targetTier === 2) {
      // Tier 2: VLM OCR (with full legacy fallback)
      const result = await runVlmOcrWithFallback(imageDir);
      if (textLayerRef) result.textLayerRef = textLayerRef;
      return result;
    }

    // Tier 3: legacy PaddleOCR (manual override)
    const paddleResult = await runPaddleOcr(imageDir);
    paddleResult.ocrTier = 3;
    if (textLayerRef) paddleResult.textLayerRef = textLayerRef;
    return paddleResult;
  } finally {
    cleanupImageDir(imageDir);
  }
}

/**
 * Assess whether Tesseract output is good enough or needs Docling escalation.
 *
 * Strict thresholds — Watercare (88.1% confidence, 7.8% low-conf) is roughly the line.
 * Anything noticeably worse gets escalated to Docling's deep learning pipeline.
 *
 * For image documents (no text layer), rely on confidence + text density.
 * For digital PDFs with text layer, also cross-reference extracted numbers.
 */
export function assessQuality(
  tesseract: TesseractResult,
  textLayer: PdfExtraction | null,
): { accept: boolean; reason: string } {
  const conf = tesseract.confidence;

  // Check 1: Mean confidence — must be ≥80%
  if (conf.mean < MIN_CONFIDENCE) {
    return { accept: false, reason: `confidence ${conf.mean}% < ${MIN_CONFIDENCE}% threshold` };
  }

  // Check 2: Low-confidence word ratio — must be ≤10%
  if (conf.total_words > 0) {
    const lowRatio = conf.low_confidence_words / conf.total_words;
    if (lowRatio > MAX_LOW_CONFIDENCE_RATIO) {
      const pct = Math.round(lowRatio * 100);
      return { accept: false, reason: `${pct}% low-confidence words > ${MAX_LOW_CONFIDENCE_RATIO * 100}% threshold` };
    }
  }

  // Check 3: Minimum text extracted
  if (tesseract.fullText.trim().length < MIN_TEXT_LENGTH) {
    return { accept: false, reason: `extracted text too short (${tesseract.fullText.trim().length} < ${MIN_TEXT_LENGTH} chars)` };
  }

  // Check 4: Cross-reference numbers with text layer when available
  if (textLayer && textLayer.fullText.trim().length > 100) {
    const textLayerNumbers = extractNumbers(textLayer.fullText);
    const tesseractNumbers = extractNumbers(tesseract.fullText);

    if (textLayerNumbers.length > 3) {
      const matched = textLayerNumbers.filter(n => tesseractNumbers.includes(n)).length;
      const matchRatio = matched / textLayerNumbers.length;

      if (matchRatio < MIN_NUMBER_MATCH_RATIO) {
        return {
          accept: false,
          reason: `number cross-ref: ${matched}/${textLayerNumbers.length} matched (${Math.round(matchRatio * 100)}% < ${MIN_NUMBER_MATCH_RATIO * 100}%)`,
        };
      }
    }
  }

  return { accept: true, reason: `confidence ${conf.mean}%, ${conf.low_confidence_words}/${conf.total_words} low-conf words` };
}

/**
 * Assess whether pymupdf4llm text-layer output is usable or needs OCR fallback.
 * Returns { accept, reason, textLayerBroken }.
 */
export function assessPymupdfQuality(fullText: string): { accept: boolean; reason: string; textLayerBroken: boolean } {
  const hasCidGarbage = fullText.includes('(cid:');
  const replacementCount = (fullText.match(/\ufffd/g) || []).length;
  const hasReplacementGarbage = replacementCount > 20;
  const hasMinimalText = fullText.trim().length < 100;

  if (!hasCidGarbage && !hasReplacementGarbage && !hasMinimalText) {
    return { accept: true, reason: 'text layer OK', textLayerBroken: false };
  }

  const textLayerBroken = hasCidGarbage || hasReplacementGarbage;
  const reason = hasMinimalText
    ? 'minimal text (possibly scanned/image PDF)'
    : `broken text (cid:${hasCidGarbage}, replacements:${replacementCount})`;

  return { accept: false, reason, textLayerBroken };
}

/** Extract distinct number-like patterns from text for cross-referencing. */
function extractNumbers(text: string): string[] {
  const matches = text.match(/\d[\d,.\-/]+\d/g) || [];
  return [...new Set(matches.map(m => m.replace(/[$,]/g, '')))];
}

/** Parse JSON from script stdout, handling non-JSON prefix and errors. */
function parseJson<T>(stdout: string, stderr: string): T {
  try {
    const jsonStart = stdout.indexOf('{');
    const jsonStr = jsonStart >= 0 ? stdout.slice(jsonStart) : stdout;
    const result = JSON.parse(jsonStr) as T & { error?: string };
    if (result.error) {
      throw new Error(`Script error: ${result.error}`);
    }
    return result;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Script error:')) throw e;
    let errMsg = stderr?.trim() || 'No output from script';
    try {
      const parsed = JSON.parse(errMsg);
      errMsg = parsed.error || errMsg;
    } catch { /* use raw stderr */ }
    throw new Error(`Script failed: ${errMsg}`);
  }
}

/**
 * Resize an image to fit within maxDim pixels (longest side) and return as JPEG base64.
 * Uses Python/Pillow since sharp is not installed. Avoids sending oversized images
 * to the VLM API (5MB limit, token cost scales with pixel area).
 */
async function resizeImageForVlm(imgPath: string, maxDim: number): Promise<string> {
  const script = `
import sys, io, base64
from PIL import Image
img = Image.open(sys.argv[1])
ratio = ${maxDim} / max(img.size)
if ratio < 1:
    img = img.resize((int(img.size[0]*ratio), int(img.size[1]*ratio)), Image.LANCZOS)
if img.mode in ('RGBA', 'P'):
    img = img.convert('RGB')
buf = io.BytesIO()
img.save(buf, format='JPEG', quality=85)
sys.stdout.write(base64.b64encode(buf.getvalue()).decode('ascii'))
`;
  const { stdout } = await execFileAsync('python', ['-c', script, imgPath], {
    timeout: 30_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout;
}

/** Clean up temporary image directory. */
export function cleanupImageDir(imageDir: string): void {
  try {
    const files = fs.readdirSync(imageDir);
    for (const file of files) {
      fs.unlinkSync(path.join(imageDir, file));
    }
    fs.rmdirSync(imageDir);
  } catch { /* best effort cleanup */ }
}
