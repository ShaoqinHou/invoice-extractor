import { getDb } from '../../db/client';
import { invoices } from '../../db/schema';
import { saveUploadedFile, computeFileHash } from '../storage/files';
import { generateDisplayName } from '../../utils/displayName';
import { getPipelineQueue } from './PipelineQueue';

export interface ProcessResult {
  id: number;
  display_name: string;
}

export interface StartResult {
  id: number;
  display_name: string;
  file_hash: string;
}

/**
 * Start processing: save file, create DB row with status 'queued',
 * enqueue into the PipelineQueue for controlled processing.
 *
 * Returns immediately with invoice ID. The pipeline queue processes
 * jobs respecting tier concurrency limits and OCR mutex.
 */
export async function startProcessing(buffer: Buffer, filename: string, hash: string): Promise<StartResult> {
  const db = getDb();

  const filePath = await saveUploadedFile(buffer, filename);

  const initialDisplayName = generateDisplayName({
    invoice_date: null,
    supplier_name: null,
    invoice_number: null,
    entries: [],
    original_filename: filename,
  });

  const row = db
    .insert(invoices)
    .values({
      original_filename: filename,
      display_name: initialDisplayName,
      file_path: filePath,
      upload_date: new Date().toISOString(),
      status: 'queued',
      file_hash: hash,
    })
    .returning({ id: invoices.id })
    .get();

  // Enqueue into the pipeline queue — processed in order with concurrency limits
  getPipelineQueue().enqueue({ invoiceId: row.id, filePath });

  return { id: row.id, display_name: initialDisplayName, file_hash: hash };
}

/**
 * Legacy synchronous pipeline — kept for backward compatibility.
 */
export async function processInvoice(file: File): Promise<ProcessResult> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = computeFileHash(buffer);
  const result = await startProcessing(buffer, file.name, hash);
  return { id: result.id, display_name: result.display_name };
}
