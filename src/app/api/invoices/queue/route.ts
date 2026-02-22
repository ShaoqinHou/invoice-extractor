import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { invoices } from '@/lib/db/schema';
import { inArray, desc } from 'drizzle-orm';

const PROCESSING_STATUSES = ['queued', 'uploading', 'extracting', 'processing', 'verifying'];

export async function GET() {
  const db = getDb();
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

  return NextResponse.json(queue);
}
