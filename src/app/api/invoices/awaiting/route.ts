import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { invoices } from '@/lib/db/schema';
import { inArray, desc, sql } from 'drizzle-orm';

export async function GET() {
  const db = getDb();

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

  return NextResponse.json({
    invoices: awaiting,
    count: countResult[0]?.count ?? 0,
  });
}
