import type { InvoiceExtraction } from '../llm/schema';

/** Entry types that represent summary rows, not actual line items */
const SUMMARY_TYPES = new Set(['subtotal', 'tax', 'total', 'due', 'adjustment', 'discount', 'info']);

interface ValidationResult {
  issues: string[];
}

/**
 * Pure arithmetic validation of extracted invoice data.
 * Checks line-item math, total consistency, and GST reasonableness.
 * Returns a list of human-readable issue strings (empty = all good).
 */
export function validateExtraction(ext: InvoiceExtraction): ValidationResult {
  const issues: string[] = [];

  const entries = ext.entries ?? [];

  // ── Check 1: Per-entry arithmetic (unit_price × quantity ≈ amount) ──
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.amount == null || !entry.attrs) continue;

    const attrs = entry.attrs as Record<string, unknown>;
    const unitPrice = toNumber(attrs.unit_price ?? attrs.unit_rate ?? attrs.rate);
    const quantity = toNumber(attrs.unit_amount ?? attrs.quantity ?? attrs.qty);

    if (unitPrice != null && quantity != null) {
      const expected = round2(unitPrice * quantity);
      const diff = Math.abs(expected - entry.amount);
      if (diff > 0.02) {
        issues.push(
          `Item ${i + 1} "${entry.label}": ${quantity} × $${unitPrice.toFixed(2)} = $${expected.toFixed(2)} but amount is $${entry.amount.toFixed(2)} (diff: $${diff.toFixed(2)})`
        );
      }
    }
  }

  // ── Check 2: Sum of line items ≈ total_amount ──
  const lineItems = entries.filter(e => e.amount != null && !SUMMARY_TYPES.has(e.type ?? ''));
  if (ext.total_amount != null && lineItems.length > 0) {
    const sum = round2(lineItems.reduce((acc, e) => acc + (e.amount ?? 0), 0));
    const diff = Math.abs(sum - ext.total_amount);
    if (diff > 1.00) {
      issues.push(
        `Line items sum $${sum.toFixed(2)} ≠ total $${ext.total_amount.toFixed(2)} (diff: $${diff.toFixed(2)})`
      );
    }
  }

  // ── Check 3: total_amount present ──
  if (ext.total_amount == null) {
    issues.push('Total amount is missing');
  }

  // ── Check 4: GST reasonableness (NZ = 15%) ──
  if (ext.total_amount != null && ext.gst_amount != null) {
    const currency = (ext.currency ?? 'NZD').toUpperCase();
    if (currency === 'NZD') {
      // GST-inclusive total: GST should be 3/23 of total (i.e. 15% on the pre-GST amount)
      const expectedGst = round2(ext.total_amount * 3 / 23);
      const gstDiff = Math.abs(expectedGst - ext.gst_amount);
      // Allow ±$1 or ±5% of expected GST, whichever is larger
      const tolerance = Math.max(1.00, expectedGst * 0.05);
      if (gstDiff > tolerance) {
        issues.push(
          `GST $${ext.gst_amount.toFixed(2)} doesn't match 15% of total $${ext.total_amount.toFixed(2)} (expected ~$${expectedGst.toFixed(2)}, diff: $${gstDiff.toFixed(2)})`
        );
      }
    }
  }

  return { issues };
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? null : n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
