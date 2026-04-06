import type { EntryRow } from '../components/EditableEntriesTable';

const SUMMARY_TYPES = new Set(['subtotal', 'total', 'due', 'tax', 'discount', 'adjustment']);

export interface ValidationResult {
  /** globalIndex → tooltip message for entry amount cells */
  entryIssues: Map<number, string>;
  /** 'total' | 'gst' → tooltip message for header fields */
  headerIssues: Map<string, string>;
}

/**
 * Client-side arithmetic validation of invoice entries.
 * Computed reactively from current values — edits auto-clear highlights.
 */
export function validateEntries(
  entries: EntryRow[],
  totalAmount: string,
  gstAmount: string,
  currency: string,
): ValidationResult {
  const entryIssues = new Map<number, string>();
  const headerIssues = new Map<string, string>();

  // ── Per-entry: rate × qty ≈ amount ──
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.amount == null || !entry.attrs) continue;

    const attrs = entry.attrs as Record<string, unknown>;
    const unitPrice = toNumber(attrs.unit_price ?? attrs.unit_rate ?? attrs.rate);
    const qty = toNumber(attrs.unit_amount ?? attrs.quantity ?? attrs.qty);

    if (unitPrice != null && qty != null) {
      const expected = round2(unitPrice * qty);
      const diff = Math.abs(expected - entry.amount);
      if (diff > 0.02) {
        entryIssues.set(i,
          `${qty} × $${unitPrice.toFixed(2)} = $${expected.toFixed(2)} but amount is $${entry.amount.toFixed(2)} (diff: $${diff.toFixed(2)})`
        );
      }
    }
  }

  // ── Sum of line items ≈ totalAmount ──
  const total = parseFloat(totalAmount);
  if (!isNaN(total)) {
    const lineItems = entries.filter(
      e => e.amount != null && !SUMMARY_TYPES.has(e.entry_type ?? ''),
    );
    if (lineItems.length > 0) {
      const sum = round2(lineItems.reduce((acc, e) => acc + (e.amount ?? 0), 0));
      const diff = Math.abs(sum - total);
      if (diff > 1.00) {
        headerIssues.set('total',
          `Line items sum $${sum.toFixed(2)} ≠ total $${total.toFixed(2)} (diff: $${diff.toFixed(2)})`
        );
      }
    }
  }

  // ── GST ≈ 15% for NZD ──
  const gst = parseFloat(gstAmount);
  if (!isNaN(total) && !isNaN(gst) && (currency || 'NZD').toUpperCase() === 'NZD') {
    const expectedGst = round2(total * 3 / 23);
    const gstDiff = Math.abs(expectedGst - gst);
    const tolerance = Math.max(1.00, expectedGst * 0.05);
    if (gstDiff > tolerance) {
      headerIssues.set('gst',
        `GST $${gst.toFixed(2)} doesn't match 15% of $${total.toFixed(2)} (expected ~$${expectedGst.toFixed(2)})`
      );
    }
  }

  return { entryIssues, headerIssues };
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? null : n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
