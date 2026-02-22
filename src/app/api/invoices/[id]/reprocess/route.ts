import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { invoices, invoiceEntries } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { agenticExtract } from '@/lib/llm/agent';
import { verifyOcrExtraction } from '@/lib/llm/verify';
import { extractPdfText, extractWithTier } from '@/lib/pdf/extract';
import { generateDisplayName } from '@/utils/displayName';

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

  if (!invoice.file_path) {
    return NextResponse.json({ error: 'No PDF file available to reprocess.' }, { status: 400 });
  }

  // Parse optional tier from request body
  let targetTier: 2 | 3 | undefined;
  try {
    const body = await request.json();
    if (body.tier === 2 || body.tier === 3) {
      targetTier = body.tier;
    }
  } catch { /* no body or invalid JSON — use default extraction */ }

  try {
    // Delete old entries
    db.delete(invoiceEntries).where(eq(invoiceEntries.invoice_id, invoiceId)).run();

    // Re-extract text from PDF
    db.update(invoices)
      .set({ status: 'extracting' })
      .where(eq(invoices.id, invoiceId))
      .run();

    const extraction = targetTier
      ? await extractWithTier(invoice.file_path, targetTier)
      : await extractPdfText(invoice.file_path);

    db.update(invoices)
      .set({ status: 'processing', raw_extracted_text: extraction.fullText, ocr_tier: extraction.ocrTier })
      .where(eq(invoices.id, invoiceId))
      .run();

    // Re-run LLM on fresh extraction
    const result = await agenticExtract(extraction.fullText, extraction.pages);
    let ext = result.extraction;

    // OCR verification when text layer reference is available
    if (extraction.textLayerRef) {
      db.update(invoices)
        .set({ status: 'verifying' })
        .where(eq(invoices.id, invoiceId))
        .run();

      try {
        const verification = await verifyOcrExtraction(ext, extraction.textLayerRef);
        if (verification.corrections.length > 0) {
          console.log(`OCR verification corrected ${verification.corrections.length} issue(s):`, verification.corrections);
          ext = verification.corrected;
          const correctionNote = `OCR corrections applied: ${verification.corrections.join('; ')}`;
          ext.notes = ext.notes ? `${ext.notes}\n\n${correctionNote}` : correctionNote;
        }
      } catch (verifyError) {
        console.warn('OCR verification failed, using original extraction:', verifyError);
      }
    }

    const displayName = generateDisplayName({
      invoice_date: ext.invoice_date ?? null,
      supplier_name: ext.supplier_name ?? null,
      invoice_number: ext.invoice_number ?? null,
      entries: ext.entries ?? [],
      original_filename: invoice.original_filename,
    });

    db.update(invoices)
      .set({
        display_name: displayName,
        invoice_date: ext.invoice_date ?? null,
        supplier_name: ext.supplier_name ?? null,
        invoice_number: ext.invoice_number ?? null,
        total_amount: ext.total_amount ?? null,
        gst_amount: ext.gst_amount ?? null,
        currency: ext.currency ?? 'NZD',
        gst_number: ext.gst_number ?? null,
        due_date: ext.due_date ?? null,
        notes: ext.notes ?? null,
        raw_llm_response: result.rawConversation,
        status: 'draft',
        error_message: null,
      })
      .where(eq(invoices.id, invoiceId))
      .run();

    // Store new entries
    if (ext.entries && ext.entries.length > 0) {
      for (let i = 0; i < ext.entries.length; i++) {
        const entry = ext.entries[i];
        db.insert(invoiceEntries)
          .values({
            invoice_id: invoiceId,
            label: entry.label,
            amount: entry.amount ?? null,
            entry_type: entry.type ?? null,
            attrs: entry.attrs ?? null,
            sort_order: i,
          })
          .run();
      }
    }

    return NextResponse.json({ success: true, display_name: displayName });
  } catch (error) {
    db.update(invoices)
      .set({
        status: 'error',
        error_message: error instanceof Error ? error.message : 'Reprocess failed.',
      })
      .where(eq(invoices.id, invoiceId))
      .run();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Reprocess failed.' },
      { status: 500 },
    );
  }
}
