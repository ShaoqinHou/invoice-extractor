import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { invoices, invoiceEntries } from '@/lib/db/schema';
import { eq, and, gt, asc, inArray } from 'drizzle-orm';

export async function POST(
  request: NextRequest,
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

  // Apply any edits from request body
  try {
    const body = await request.json();
    if (body && typeof body === 'object') {
      const { entries: entryUpdates, ...fields } = body;

      // Update invoice fields if provided
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

  return NextResponse.json({
    approved: true,
    nextId: next?.id ?? null,
  });
}
