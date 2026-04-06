import type { EntryRow } from '../components/EditableEntriesTable';

const SUMMARY_TYPES = new Set(['subtotal', 'total', 'due', 'tax', 'discount', 'adjustment']);

export interface EntryIssue {
  message: string;
  /** Attr keys involved in the mismatch (e.g. unit_price, unit_amount) — highlight these cells too */
  involvedAttrs: Set<string>;
  /** rate × qty — what the amount should be if rate is correct */
  expectedAmount: number;
  /** amount ÷ qty — what the rate should be if amount is correct (null when qty is 0) */
  expectedRate: number | null;
  /** amount ÷ rate — what the qty should be if amount is correct (null when rate is 0) */
  expectedQty: number | null;
}

export interface ValidationResult {
  /** globalIndex → issue details for entry cells */
  entryIssues: Map<number, EntryIssue>;
  /** 'total' | 'gst' → tooltip message for header fields */
  headerIssues: Map<string, string>;
}

/** Attr key aliases — maps all variants to the normalized key used in the table */
const QTY_KEYS = ['unit_amount', 'quantity', 'qty'] as const;
const PRICE_KEYS = ['unit_price', 'unit_rate', 'rate'] as const;

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
  const entryIssues = new Map<number, EntryIssue>();
  const headerIssues = new Map<string, string>();

  // ── Per-entry: rate × qty ≈ amount ──
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.amount == null || !entry.attrs) continue;

    const attrs = entry.attrs as Record<string, unknown>;

    // Find which key is actually used for price and qty
    const priceKey = PRICE_KEYS.find(k => attrs[k] != null);
    const qtyKey = QTY_KEYS.find(k => attrs[k] != null);

    if (!priceKey || !qtyKey) continue;

    const unitPrice = toNumber(attrs[priceKey]);
    const qty = toNumber(attrs[qtyKey]);

    if (unitPrice != null && qty != null) {
      const discount = findDiscountPercent(attrs);
      const expected = round2(unitPrice * qty * (1 - discount / 100));
      const diff = Math.abs(expected - entry.amount);
      if (diff > 0.02) {
        entryIssues.set(i, {
          message: `${qty} × $${unitPrice.toFixed(2)}${discount ? ` - ${discount}%` : ''} = $${expected.toFixed(2)} but amount is $${entry.amount.toFixed(2)} (diff: $${diff.toFixed(2)})`,
          involvedAttrs: new Set([priceKey, qtyKey]),
          expectedAmount: expected,
          expectedRate: qty !== 0 ? round2(entry.amount / qty) : null,
          expectedQty: unitPrice !== 0 ? round2(entry.amount / unitPrice) : null,
        });
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
      if (diff > 0.10) {
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

/** Find a discount percentage in extra attrs (e.g. extra1="23.00%", extra1_label="Discount") */
function findDiscountPercent(attrs: Record<string, unknown>): number {
  for (let i = 1; i <= 5; i++) {
    const label = String(attrs[`extra${i}_label`] ?? '').toLowerCase();
    if (label === 'discount') {
      const val = String(attrs[`extra${i}`] ?? '');
      const pct = parseFloat(val.replace('%', ''));
      if (!isNaN(pct)) return pct;
    }
  }
  return 0;
}
