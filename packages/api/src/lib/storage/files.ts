import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
// UPLOAD_DIR is set to absolute path by index.ts, or fallback to PROJECT_ROOT/uploads
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(PROJECT_ROOT, 'uploads');
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '20', 10)) * 1024 * 1024;

export function getUploadDir(): string {
  return path.resolve(UPLOAD_DIR);
}

export function getMaxFileSize(): number {
  return MAX_FILE_SIZE;
}

/**
 * Compute MD5 hash of file content for deduplication.
 */
export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/**
 * Save a PDF file to the uploads directory.
 * Returns the relative path from project root.
 */
export async function saveUploadedFile(
  buffer: Buffer,
  originalFilename: string,
): Promise<string> {
  const uploadDir = getUploadDir();
  await fs.mkdir(uploadDir, { recursive: true });

  const hash = crypto.randomBytes(8).toString('hex');
  const safeName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filename = `${Date.now()}_${hash}_${safeName}`;
  const filePath = path.join(uploadDir, filename);

  await fs.writeFile(filePath, buffer);

  return `uploads/${filename}`;
}

/**
 * Read a previously saved PDF file.
 */
export async function readUploadedFile(relativePath: string): Promise<Buffer> {
  // relativePath is like "uploads/filename.pdf" — resolve relative to project root
  const fullPath = path.resolve(PROJECT_ROOT, relativePath);
  return fs.readFile(fullPath);
}

const ACCEPTED_EXTENSIONS = new Set([
  '.pdf', '.heic', '.heif', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.webp',
]);

/**
 * Validate an uploaded file (PDF or image).
 */
export function validateUpload(file: File): { valid: boolean; error?: string } {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  if (!ACCEPTED_EXTENSIONS.has(ext)) {
    return { valid: false, error: `Unsupported file type. Accepted: PDF, HEIC, JPG, PNG, TIFF, BMP, WebP.` };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024)}MB.` };
  }
  if (file.size === 0) {
    return { valid: false, error: 'File is empty.' };
  }
  return { valid: true };
}
