import { describe, it, expect } from 'vitest';
import { InvoiceExtractionSchema, InvoiceEntrySchema } from '@/lib/llm/schema';

describe('InvoiceExtractionSchema', () => {
  it('accepts a minimal valid extraction', () => {
    const result = InvoiceExtractionSchema.parse({});
    expect(result.currency).toBe('NZD');
    expect(result.entries).toEqual([]);
  });

  it('accepts a full extraction', () => {
    const result = InvoiceExtractionSchema.parse({
      invoice_date: '2024-03-13',
      supplier_name: '2degrees',
      invoice_number: '110068728',
      total_amount: 72.21,
      gst_amount: 9.42,
      currency: 'NZD',
      entries: [
        { label: 'Unlimited Fibre 300 Broadband', amount: 97.00, type: 'charge' },
        { label: 'Loyalty Discount', amount: -15.00, type: 'discount' },
        { label: 'Pay Monthly Discount', amount: -10.00, type: 'discount' },
        { label: 'Credit Card Surcharge', amount: 0.21, type: 'charge' },
      ],
    });
    expect(result.supplier_name).toBe('2degrees');
    expect(result.total_amount).toBe(72.21);
    expect(result.entries).toHaveLength(4);
    expect(result.entries[1].amount).toBe(-15.00);
  });

  it('coerces null amounts correctly', () => {
    const result = InvoiceExtractionSchema.parse({
      total_amount: null,
      gst_amount: null,
    });
    expect(result.total_amount).toBeNull();
    expect(result.gst_amount).toBeNull();
  });

  it('coerces numeric invoice_number to string', () => {
    const result = InvoiceExtractionSchema.parse({
      invoice_number: 110068728,
    });
    expect(result.invoice_number).toBe('110068728');
  });

  it('rejects invalid amount type', () => {
    expect(() =>
      InvoiceExtractionSchema.parse({ total_amount: 'not a number' }),
    ).toThrow();
  });
});

describe('InvoiceEntrySchema', () => {
  it('accepts minimal entry', () => {
    const result = InvoiceEntrySchema.parse({ label: 'Test' });
    expect(result.label).toBe('Test');
    expect(result.amount).toBeUndefined();
  });

  it('accepts entry with attrs', () => {
    const result = InvoiceEntrySchema.parse({
      label: 'Electricity',
      amount: 42.50,
      type: 'charge',
      attrs: { meter_number: 'M123', tariff: 'T11' },
    });
    expect(result.attrs).toEqual({ meter_number: 'M123', tariff: 'T11' });
  });
});
