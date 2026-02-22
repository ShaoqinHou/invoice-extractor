import { getDb } from '@/lib/db/client';
import { invoices, invoiceEntries } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { PdfViewer } from '@/components/PdfViewer';
import { ReviewForm } from '@/components/ReviewForm';
import { ReviewLayout } from '@/components/ReviewLayout';

export const dynamic = 'force-dynamic';

export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoiceId = parseInt(id, 10);
  if (isNaN(invoiceId)) notFound();

  const db = getDb();
  const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!invoice) notFound();

  const entries = db
    .select()
    .from(invoiceEntries)
    .where(eq(invoiceEntries.invoice_id, invoiceId))
    .orderBy(invoiceEntries.sort_order)
    .all();

  const formData = {
    id: invoice.id,
    display_name: invoice.display_name,
    supplier_name: invoice.supplier_name,
    invoice_number: invoice.invoice_number,
    invoice_date: invoice.invoice_date,
    total_amount: invoice.total_amount,
    gst_amount: invoice.gst_amount,
    currency: invoice.currency,
    gst_number: invoice.gst_number,
    due_date: invoice.due_date,
    notes: invoice.notes,
    ocr_tier: invoice.ocr_tier,
    status: invoice.status,
    exception_type: invoice.exception_type,
    exception_details: invoice.exception_details,
    entries: entries.map(e => ({
      label: e.label,
      amount: e.amount,
      entry_type: e.entry_type,
      attrs: e.attrs,
    })),
  };

  return (
    <ReviewLayout
      left={<PdfViewer invoiceId={invoice.id} filename={invoice.original_filename} />}
      right={<ReviewForm invoice={formData} />}
    />
  );
}
