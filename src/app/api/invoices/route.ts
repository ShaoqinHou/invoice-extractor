import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { invoices } from '@/lib/db/schema';
import { desc, eq, and, like, gte, lte, inArray, or, sql } from 'drizzle-orm';
import { validateUpload, computeFileHash } from '@/lib/storage/files';
import { startProcessing } from '@/lib/pipeline/process';

export async function GET(request: NextRequest) {
  const db = getDb();
  const url = request.nextUrl;

  const status = url.searchParams.get('status');
  const search = url.searchParams.get('search');
  const invoiceDateFrom = url.searchParams.get('invoice_date_from');
  const invoiceDateTo = url.searchParams.get('invoice_date_to');
  const uploadDateFrom = url.searchParams.get('upload_date_from');
  const uploadDateTo = url.searchParams.get('upload_date_to');

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

  if (invoiceDateFrom) {
    conditions.push(gte(invoices.invoice_date, invoiceDateFrom));
  }
  if (invoiceDateTo) {
    conditions.push(lte(invoices.invoice_date, invoiceDateTo));
  }
  if (uploadDateFrom) {
    conditions.push(gte(invoices.upload_date, uploadDateFrom));
  }
  if (uploadDateTo) {
    conditions.push(lte(invoices.upload_date, uploadDateTo));
  }

  const query = db.select().from(invoices).orderBy(desc(invoices.id));
  const all = conditions.length > 0
    ? query.where(and(...conditions)).all()
    : query.all();

  return NextResponse.json(all);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }

    const validation = validateUpload(file);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const hash = computeFileHash(buffer);

    // Check for duplicate
    const db = getDb();
    const existing = db.select({ id: invoices.id, display_name: invoices.display_name })
      .from(invoices)
      .where(eq(invoices.file_hash, hash))
      .get();

    if (existing) {
      return NextResponse.json(
        { error: 'Duplicate file detected.', existing_id: existing.id, existing_name: existing.display_name },
        { status: 409 },
      );
    }

    const result = await startProcessing(buffer, file.name, hash);

    return NextResponse.json(
      { id: result.id, display_name: result.display_name },
      { status: 202 },
    );
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed.' },
      { status: 500 },
    );
  }
}
