import { describe, it, expect } from 'vitest';
import { generateDisplayName } from '../displayName';

describe('generateDisplayName', () => {
  it('generates full display name with all fields', () => {
    const result = generateDisplayName({
      invoice_date: '2024-03-15',
      supplier_name: 'Acme Corp',
      invoice_number: 'INV-001',
      total_amount: 123.45,
      entries: [],
      original_filename: 'invoice.pdf',
    });
    expect(result).toBe('20240315 Acme Corp INV-001 $123.45');
  });

  it('handles missing invoice date', () => {
    const result = generateDisplayName({
      invoice_date: null,
      supplier_name: 'Acme Corp',
      invoice_number: 'INV-001',
      total_amount: 50.0,
      entries: [],
      original_filename: 'invoice.pdf',
    });
    expect(result).toBe('Acme Corp INV-001 $50.00');
  });

  it('handles missing supplier name', () => {
    const result = generateDisplayName({
      invoice_date: '2024-01-01',
      supplier_name: null,
      invoice_number: 'INV-002',
      total_amount: 99.99,
      entries: [],
      original_filename: 'invoice.pdf',
    });
    expect(result).toBe('20240101 INV-002 $99.99');
  });

  it('handles missing amount', () => {
    const result = generateDisplayName({
      invoice_date: '2024-06-01',
      supplier_name: 'Telstra',
      invoice_number: null,
      total_amount: null,
      entries: [],
      original_filename: 'invoice.pdf',
    });
    expect(result).toBe('20240601 Telstra');
  });

  it('falls back to filename when all fields null', () => {
    const result = generateDisplayName({
      invoice_date: null,
      supplier_name: null,
      invoice_number: null,
      total_amount: null,
      entries: [],
      original_filename: 'my-invoice.pdf',
    });
    expect(result).toBe('my-invoice');
  });

  it('strips date separators (slashes)', () => {
    const result = generateDisplayName({
      invoice_date: '2024/03/15',
      supplier_name: 'Test',
      invoice_number: null,
      total_amount: null,
      entries: [],
      original_filename: 'x.pdf',
    });
    expect(result).toBe('20240315 Test');
  });

  it('collapses whitespace in supplier name', () => {
    const result = generateDisplayName({
      invoice_date: null,
      supplier_name: '  Acme   Corp  ',
      invoice_number: null,
      total_amount: null,
      entries: [],
      original_filename: 'x.pdf',
    });
    expect(result).toBe('Acme Corp');
  });

  it('handles zero amount', () => {
    const result = generateDisplayName({
      invoice_date: null,
      supplier_name: 'Test',
      invoice_number: null,
      total_amount: 0,
      entries: [],
      original_filename: 'x.pdf',
    });
    expect(result).toBe('Test $0.00');
  });
});
