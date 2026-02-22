import { describe, it, expect } from 'vitest';
import { executeTool, type ToolContext } from '@/lib/llm/tools';

const mockCtx: ToolContext = {
  fullText: [
    'Invoice Number: INV-001',
    'Date: 2024-03-15',
    'Supplier: Acme Corp',
    '',
    'Item: Widget x 10 @ $13.68',
    'Item: Gadget x 5 @ $20.00',
    '',
    'Subtotal: $236.80',
    'GST: $23.68',
    'Total: $260.48',
  ].join('\n'),
  pages: [
    'Page 1: Invoice Number: INV-001\nDate: 2024-03-15\nSupplier: Acme Corp',
    'Page 2: Item: Widget x 10\nItem: Gadget x 5\nSubtotal: $236.80\nGST: $23.68\nTotal: $260.48',
  ],
};

describe('executeTool', () => {
  describe('get_page_text', () => {
    it('returns page text for valid page', () => {
      const result = executeTool('get_page_text', { page: 1 }, mockCtx);
      expect(result).toContain('Page 1');
      expect(result).toContain('INV-001');
    });

    it('returns page 2', () => {
      const result = executeTool('get_page_text', { page: 2 }, mockCtx);
      expect(result).toContain('Widget');
    });

    it('returns error for invalid page', () => {
      const result = executeTool('get_page_text', { page: 3 }, mockCtx);
      expect(result).toContain('Error');
      expect(result).toContain('does not exist');
    });

    it('returns error for page 0', () => {
      const result = executeTool('get_page_text', { page: 0 }, mockCtx);
      expect(result).toContain('Error');
    });
  });

  describe('search_text', () => {
    it('finds matching lines', () => {
      const result = executeTool('search_text', { query: 'Invoice' }, mockCtx);
      expect(result).toContain('INV-001');
      expect(result).toContain('1 match');
    });

    it('is case-insensitive', () => {
      const result = executeTool('search_text', { query: 'acme' }, mockCtx);
      expect(result).toContain('Acme Corp');
    });

    it('returns no matches message', () => {
      const result = executeTool('search_text', { query: 'nonexistent' }, mockCtx);
      expect(result).toContain('No matches');
    });

    it('finds multiple matches', () => {
      const result = executeTool('search_text', { query: 'Item' }, mockCtx);
      expect(result).toContain('2 match');
    });
  });

  describe('get_text_around', () => {
    it('returns surrounding lines', () => {
      const result = executeTool('get_text_around', { keyword: 'GST', context_lines: 2 }, mockCtx);
      expect(result).toContain('Subtotal');
      expect(result).toContain('Total');
      expect(result).toContain('GST');
    });

    it('returns not found message', () => {
      const result = executeTool('get_text_around', { keyword: 'missing' }, mockCtx);
      expect(result).toContain('not found');
    });

    it('uses default context lines', () => {
      const result = executeTool('get_text_around', { keyword: 'Supplier' }, mockCtx);
      expect(result).toContain('Invoice Number');
    });
  });

  describe('unknown tool', () => {
    it('returns unknown tool message', () => {
      const result = executeTool('nonexistent', {}, mockCtx);
      expect(result).toContain('Unknown tool');
    });
  });
});
