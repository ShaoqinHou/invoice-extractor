import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { invoices, invoiceEntries } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const invoiceId = parseInt(id, 10);
  if (isNaN(invoiceId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  const db = getDb();
  const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!invoice) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const entries = db
    .select()
    .from(invoiceEntries)
    .where(eq(invoiceEntries.invoice_id, invoiceId))
    .orderBy(invoiceEntries.sort_order)
    .all();

  return NextResponse.json({ ...invoice, entries });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const invoiceId = parseInt(id, 10);
  if (isNaN(invoiceId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  const db = getDb();
  const existing = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await request.json();
  const { entries: entryUpdates, ...fields } = body;

  // Update invoice fields
  if (Object.keys(fields).length > 0) {
    db.update(invoices).set(fields).where(eq(invoices.id, invoiceId)).run();
  }

  // Update entries if provided
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

  return NextResponse.json({ ...updated, entries: updatedEntries });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const invoiceId = parseInt(id, 10);
  if (isNaN(invoiceId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  const db = getDb();
  db.delete(invoices).where(eq(invoices.id, invoiceId)).run();
  return NextResponse.json({ deleted: true });
}
