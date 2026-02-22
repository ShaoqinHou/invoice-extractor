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
  /** Which extraction tier produced this result: 1=pymupdf4llm, 2=tesseract, 3=paddle */
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
 * Three-tier strategy:
 * 1. pymupdf4llm (~1 sec) — text-layer extraction, PDF only, works for clean PDFs
 * 2. Tesseract OCR on rendered images (~3 sec) — for broken fonts, clean scans, photos
 * 3. PaddleOCR PP-StructureV3 on same rendered images (~10 sec) — deep learning for poor quality input
 *
 * For PDFs: Ghostscript renders the pages (handles Type3 fonts correctly).
 * For images (HEIC, JPG, PNG, etc.): image is used directly as a single page.
 * Rendering is shared between tiers 2 and 3 — render once, reuse images.
 *
 * Both tier 2 and tier 3 benefit from text-layer cross-reference when available
 * (the LLM verification step in the pipeline uses textLayerRef for both).
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
 * Run the OCR pipeline (tier 2 → tier 3) on pre-rendered page images.
 *
 * Both tiers get textLayerRef attached when available, so the downstream
 * LLM verification step can cross-reference regardless of which tier produced the result.
 */
async function runOcrPipeline(
  imageDir: string,
  textLayerResult: PdfExtraction | null,
  textLayerBroken: boolean,
): Promise<PdfExtraction> {
  try {
    // Tier 2: Tesseract OCR
    const tesseractResult = await runTesseract(imageDir);
    const quality = assessQuality(tesseractResult, textLayerResult);

    if (quality.accept) {
      console.log(`Tesseract accepted (${quality.reason})`);
      const result: PdfExtraction = {
        fullText: tesseractResult.fullText,
        pages: tesseractResult.pages,
        totalPages: tesseractResult.totalPages,
        ocrTier: 2,
      };
      if (textLayerBroken && textLayerResult) {
        result.textLayerRef = textLayerResult.fullText;
      }
      cleanupImageDir(imageDir);
      return result;
    }

    console.log(`Tesseract rejected (${quality.reason}) — escalating to PaddleOCR`);

    // Tier 3: PaddleOCR PP-StructureV3 (deskew + deep learning OCR)
    // Produces clean formatted text with items and prices on the same line.
    const paddleResult = await runPaddleOcr(imageDir);
    if (textLayerBroken && textLayerResult) {
      paddleResult.textLayerRef = textLayerResult.fullText;
    }
    paddleResult.ocrTier = 3;
    return paddleResult;
  } finally {
    cleanupImageDir(imageDir);
  }
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

/** Run PaddleOCR PP-StructureV3: deskew + OCR → clean formatted text. */
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
 * Re-extract using a specific OCR tier (2=Tesseract, 3=PaddleOCR).
 * Used for targeted reprocessing when the user wants a higher-quality extraction.
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
      const tesseractResult = await runTesseract(imageDir);
      const result: PdfExtraction = {
        fullText: tesseractResult.fullText,
        pages: tesseractResult.pages,
        totalPages: tesseractResult.totalPages,
        ocrTier: 2,
      };
      if (textLayerRef) result.textLayerRef = textLayerRef;
      return result;
    }

    // Tier 3: PaddleOCR
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
