import { z } from 'zod';

/** Accept string or number, coerce to string. Handles LLMs returning numeric-looking IDs as numbers. */
const coerceString = z.union([z.string(), z.number().transform(String)]).nullable().optional();

export const InvoiceEntrySchema = z.object({
  label: z.string(),
  amount: z.number().nullable().optional(),
  type: z.string().optional(),
  attrs: z.record(z.string(), z.any()).nullable().optional(),
});

export const InvoiceExtractionSchema = z.object({
  invoice_date: coerceString,
  supplier_name: coerceString,
  invoice_number: coerceString,
  total_amount: z.number().nullable().optional(),
  gst_amount: z.number().nullable().optional(),
  currency: z.string().optional().default('NZD'),
  gst_number: coerceString,
  due_date: coerceString,
  entries: z.array(InvoiceEntrySchema).optional().default([]),
  notes: z.union([z.string(), z.number().transform(String)]).nullable().optional(),
});

export type InvoiceExtraction = z.infer<typeof InvoiceExtractionSchema>;
export type InvoiceEntryExtraction = z.infer<typeof InvoiceEntrySchema>;

/** Convert Zod schema to JSON Schema for LLM tool definition */
export function getInvoiceJsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      invoice_date: { type: ['string', 'null'], description: 'Invoice/document date in YYYY-MM-DD format' },
      supplier_name: { type: ['string', 'null'], description: 'Name of the supplier/vendor. Look at URLs, emails, bank labels, footer text — not just the header.' },
      invoice_number: { type: ['string', 'null'], description: 'Invoice, reference, or account number — whichever best identifies this document' },
      total_amount: { type: ['number', 'null'], description: 'Total value of goods/services. For retail receipts with exchange vouchers or store credits, use the subtotal (before payment adjustments). For invoices/bills, use the amount due. Null if not clearly present.' },
      gst_amount: { type: ['number', 'null'], description: 'GST/VAT/sales tax amount if shown separately. Null if not shown.' },
      gst_number: { type: ['string', 'null'], description: 'Supplier GST/VAT/tax registration number if shown. Null if not shown.' },
      due_date: { type: ['string', 'null'], description: 'Payment due date in YYYY-MM-DD format if shown. Null if not shown.' },
      currency: { type: 'string', description: 'ISO currency code. Detect from country signals: tax system, addresses, phone formats.' },
      entries: {
        type: 'array',
        description: 'The financial breakdown of this document. Each entry is one meaningful line — a charge, discount, tax, total, or any other financial fact. Capture everything the document shows.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Short, clear name for this entry. Use the document\'s own wording where possible.' },
            amount: { type: ['number', 'null'], description: 'Dollar amount. Negative for credits/discounts. Null if this entry has no amount (e.g., an info-only entry like a meter reading or account number).' },
            type: { type: 'string', description: 'Category that groups related entries. Use descriptive names for the service/product (broadband, electricity, gas, water, phone, hosting, labour, materials, subscription, freight). Use "charge" only for one-off items. Summary rows use: subtotal, tax, total, due, adjustment, discount, info.' },
            attrs: {
              type: ['object', 'null'],
              description: 'Additional structured details for this entry. Use clean key-value pairs — not prose. IMPORTANT: within the same type group, use CONSISTENT keys across all entries so they form clean table columns. Examples: {"quantity": 6, "unit": "kL", "unit_rate": 2.142}, {"period": "2024-07-14 to 2024-08-13"}, {"kwh": 234, "unit_rate": 0.1932}. Only include what the document explicitly shows.',
            },
          },
          required: ['label'],
        },
      },
      notes: { type: ['string', 'null'], description: 'Brief observations about the document — anything worth noting for the reader. Ambiguities, conditional amounts, unusual structure.' },
    },
  };
}
