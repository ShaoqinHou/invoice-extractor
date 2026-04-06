import { describe, it, expect } from 'vitest';
import { validateEntries } from '../validateEntries';
import type { EntryRow } from '../../components/EditableEntriesTable';

function makeEntry(overrides: Partial<EntryRow> = {}): EntryRow {
  return { label: 'Item', amount: null, entry_type: 'charge', ...overrides };
}

describe('validateEntries', () => {
  describe('per-entry arithmetic', () => {
    it('reports no issue when rate × qty equals amount', () => {
      const entries = [makeEntry({
        amount: 30,
        attrs: { unit_price: 10, unit_amount: 3 },
      })];
      const { entryIssues } = validateEntries(entries, '30', '0', 'NZD');
      expect(entryIssues.size).toBe(0);
    });

    it('reports issue when rate × qty differs from amount by more than $0.02', () => {
      const entries = [makeEntry({
        amount: 25,
        attrs: { unit_price: 10, unit_amount: 3 },
      })];
      const { entryIssues } = validateEntries(entries, '25', '0', 'NZD');
      expect(entryIssues.size).toBe(1);
      const issue = entryIssues.get(0)!;
      expect(issue.message).toContain('$30.00');
      expect(issue.message).toContain('$25.00');
      expect(issue.involvedAttrs).toEqual(new Set(['unit_price', 'unit_amount']));
      expect(issue.expectedAmount).toBe(30);
      expect(issue.expectedRate).toBeCloseTo(8.33, 1); // 25 / 3
    });

    it('allows ±$0.02 rounding tolerance', () => {
      const entries = [makeEntry({
        amount: 10.01,
        attrs: { unit_price: 10.005, unit_amount: 1 },
      })];
      const { entryIssues } = validateEntries(entries, '10.01', '0', 'NZD');
      expect(entryIssues.size).toBe(0);
    });

    it('handles alternate attr keys: unit_rate, quantity', () => {
      const entries = [makeEntry({
        amount: 20,
        attrs: { unit_rate: 5, quantity: 4 },
      })];
      const { entryIssues } = validateEntries(entries, '20', '0', 'NZD');
      expect(entryIssues.size).toBe(0);
    });

    it('includes actual attr keys in involvedAttrs', () => {
      const entries = [makeEntry({
        amount: 10,
        attrs: { rate: 5, qty: 3 },
      })];
      const { entryIssues } = validateEntries(entries, '10', '0', 'NZD');
      expect(entryIssues.size).toBe(1);
      expect(entryIssues.get(0)!.involvedAttrs).toEqual(new Set(['rate', 'qty']));
    });

    it('handles alternate attr keys: rate, qty', () => {
      const entries = [makeEntry({
        amount: 15,
        attrs: { rate: 3, qty: 5 },
      })];
      const { entryIssues } = validateEntries(entries, '15', '0', 'NZD');
      expect(entryIssues.size).toBe(0);
    });

    it('skips entries without rate or qty attrs', () => {
      const entries = [makeEntry({ amount: 10, attrs: { unit: 'kg' } })];
      const { entryIssues } = validateEntries(entries, '10', '0', 'NZD');
      expect(entryIssues.size).toBe(0);
    });

    it('skips entries with null amount', () => {
      const entries = [makeEntry({ amount: null, attrs: { unit_price: 10, unit_amount: 3 } })];
      const { entryIssues } = validateEntries(entries, '0', '0', 'NZD');
      expect(entryIssues.size).toBe(0);
    });

    it('skips entries with no attrs', () => {
      const entries = [makeEntry({ amount: 10 })];
      const { entryIssues } = validateEntries(entries, '10', '0', 'NZD');
      expect(entryIssues.size).toBe(0);
    });

    it('sets expectedRate to null when qty is 0', () => {
      const entries = [makeEntry({
        amount: 25,
        attrs: { unit_price: 10, unit_amount: 0 },
      })];
      // rate × 0 = 0, diff from 25 > 0.02, so issue flagged
      const { entryIssues } = validateEntries(entries, '25', '0', 'NZD');
      expect(entryIssues.size).toBe(1);
      expect(entryIssues.get(0)!.expectedAmount).toBe(0);
      expect(entryIssues.get(0)!.expectedRate).toBeNull();
    });
  });

  describe('sum check', () => {
    it('reports no issue when sum matches total', () => {
      const entries = [
        makeEntry({ amount: 60 }),
        makeEntry({ amount: 40 }),
      ];
      const { headerIssues } = validateEntries(entries, '100', '0', 'NZD');
      expect(headerIssues.has('total')).toBe(false);
    });

    it('allows ±$0.10 tolerance', () => {
      const entries = [
        makeEntry({ amount: 60 }),
        makeEntry({ amount: 40.05 }),
      ];
      const { headerIssues } = validateEntries(entries, '100', '0', 'NZD');
      expect(headerIssues.has('total')).toBe(false);
    });

    it('reports issue when sum differs from total by more than $0.10', () => {
      const entries = [
        makeEntry({ amount: 60 }),
        makeEntry({ amount: 40 }),
      ];
      const { headerIssues } = validateEntries(entries, '100.50', '0', 'NZD');
      expect(headerIssues.has('total')).toBe(true);
      expect(headerIssues.get('total')).toContain('$100.00');
      expect(headerIssues.get('total')).toContain('$100.50');
    });

    it('excludes summary entries from sum', () => {
      const entries = [
        makeEntry({ amount: 100 }),
        makeEntry({ amount: 100, entry_type: 'total' }),
        makeEntry({ amount: 15, entry_type: 'tax' }),
      ];
      const { headerIssues } = validateEntries(entries, '100', '15', 'NZD');
      expect(headerIssues.has('total')).toBe(false);
    });

    it('does not report when totalAmount is empty', () => {
      const entries = [makeEntry({ amount: 100 })];
      const { headerIssues } = validateEntries(entries, '', '0', 'NZD');
      expect(headerIssues.has('total')).toBe(false);
    });
  });

  describe('GST check', () => {
    it('reports no issue when GST is 15% for NZD', () => {
      // total 115, GST should be 115 * 3/23 = 15
      const entries = [makeEntry({ amount: 115 })];
      const { headerIssues } = validateEntries(entries, '115', '15', 'NZD');
      expect(headerIssues.has('gst')).toBe(false);
    });

    it('reports issue when GST is wrong for NZD', () => {
      const entries = [makeEntry({ amount: 115 })];
      const { headerIssues } = validateEntries(entries, '115', '25', 'NZD');
      expect(headerIssues.has('gst')).toBe(true);
      expect(headerIssues.get('gst')).toContain('$25.00');
    });

    it('skips GST check for non-NZD currencies', () => {
      const entries = [makeEntry({ amount: 115 })];
      const { headerIssues } = validateEntries(entries, '115', '25', 'USD');
      expect(headerIssues.has('gst')).toBe(false);
    });

    it('skips GST check when gstAmount is empty', () => {
      const entries = [makeEntry({ amount: 115 })];
      const { headerIssues } = validateEntries(entries, '115', '', 'NZD');
      expect(headerIssues.has('gst')).toBe(false);
    });
  });

  describe('combined', () => {
    it('returns empty maps for empty entries', () => {
      const { entryIssues, headerIssues } = validateEntries([], '', '', 'NZD');
      expect(entryIssues.size).toBe(0);
      expect(headerIssues.size).toBe(0);
    });

    it('reports multiple entry issues', () => {
      const entries = [
        makeEntry({ amount: 25, attrs: { unit_price: 10, unit_amount: 3 } }),
        makeEntry({ amount: 10, attrs: { unit_price: 5, unit_amount: 3 } }),
      ];
      const { entryIssues } = validateEntries(entries, '35', '0', 'NZD');
      expect(entryIssues.size).toBe(2);
      expect(entryIssues.has(0)).toBe(true);
      expect(entryIssues.has(1)).toBe(true);
    });
  });
});
