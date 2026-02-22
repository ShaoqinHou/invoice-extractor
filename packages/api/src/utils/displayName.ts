import type { InvoiceEntryExtraction } from '../lib/llm/schema';

/**
 * Generate a display name for an invoice: "YYYYMMDD SupplierName InvoiceNo $Amount"
 * Falls back gracefully when fields are missing.
 * Finds the "total" or "due" entry amount from the entries list.
 */
export function generateDisplayName(params: {
  invoice_date: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
  total_amount?: number | null;
  entries: InvoiceEntryExtraction[];
  original_filename: string;
}): string {
  const parts: string[] = [];

  if (params.invoice_date) {
    const dateStr = params.invoice_date.replace(/[-/]/g, '').slice(0, 8);
    if (/^\d{8}$/.test(dateStr)) {
      parts.push(dateStr);
    }
  }

  if (params.supplier_name) {
    const clean = params.supplier_name.trim().replace(/\s+/g, ' ');
    if (clean) parts.push(clean);
  }

  if (params.invoice_number) {
    const clean = params.invoice_number.trim();
    if (clean) parts.push(clean);
  }

  // Prefer the explicit total_amount field, fall back to entry-based search
  const totalAmount = params.total_amount ?? findPrimaryAmount(params.entries);
  if (totalAmount !== null) {
    parts.push(`$${totalAmount.toFixed(2)}`);
  }

  if (parts.length === 0) {
    return params.original_filename.replace(/\.pdf$/i, '');
  }

  return parts.join(' ');
}

/** Find the primary amount from entries — the number that best represents what the customer pays. */
function findPrimaryAmount(entries: InvoiceEntryExtraction[]): number | null {
  // Priority: last "due" entry → last "total" entry → last entry with a positive amount
  // Use the *last* matching entry because the final total is typically at the end,
  // while earlier "due" entries (like "Balance still owing: $0") are intermediate subtotals.
  const dueEntries = entries.filter(e => e.type === 'due' && e.amount != null && e.amount > 0);
  if (dueEntries.length > 0) return dueEntries[dueEntries.length - 1].amount!;

  const totalEntries = entries.filter(e => e.type === 'total' && e.amount != null && e.amount > 0);
  if (totalEntries.length > 0) return totalEntries[totalEntries.length - 1].amount!;

  // Fall back to the last entry with a positive amount
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].amount != null && entries[i].amount! > 0) {
      return entries[i].amount!;
    }
  }

  return null;
}
