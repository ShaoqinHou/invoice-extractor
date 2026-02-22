import type Anthropic from '@anthropic-ai/sdk';
import { getInvoiceJsonSchema } from './schema';

export function getToolDefinitions(): Anthropic.Tool[] {
  return [
    {
      name: 'get_page_text',
      description: 'Get the extracted text from a specific page of the PDF',
      input_schema: {
        type: 'object' as const,
        properties: {
          page: { type: 'number', description: 'Page number (1-indexed)' },
        },
        required: ['page'],
      },
    },
    {
      name: 'search_text',
      description: 'Search for a pattern in the full document text. Returns all matching lines with context.',
      input_schema: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Text or pattern to search for (case-insensitive)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_text_around',
      description: 'Get lines surrounding a keyword to understand context',
      input_schema: {
        type: 'object' as const,
        properties: {
          keyword: { type: 'string', description: 'Keyword to find' },
          context_lines: { type: 'number', description: 'Number of lines before and after (default 5)' },
        },
        required: ['keyword'],
      },
    },
    {
      name: 'submit_invoice',
      description: 'Submit the final extracted invoice data. Call this ONCE when extraction is complete.',
      input_schema: getInvoiceJsonSchema() as Anthropic.Tool['input_schema'],
    },
  ];
}

export interface ToolContext {
  fullText: string;
  pages: string[];
}

/**
 * Execute a tool call locally and return the result string.
 */
export function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): string {
  switch (toolName) {
    case 'get_page_text': {
      const page = input.page as number;
      if (page < 1 || page > ctx.pages.length) {
        return `Error: Page ${page} does not exist. Document has ${ctx.pages.length} pages.`;
      }
      return ctx.pages[page - 1];
    }

    case 'search_text': {
      const query = (input.query as string).toLowerCase();
      const lines = ctx.fullText.split('\n');
      const matches: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(query)) {
          const start = Math.max(0, i - 1);
          const end = Math.min(lines.length - 1, i + 1);
          const context = lines.slice(start, end + 1).map((l, j) => `${start + j + 1}: ${l}`);
          matches.push(context.join('\n'));
        }
      }
      if (matches.length === 0) {
        return `No matches found for "${input.query}".`;
      }
      return `Found ${matches.length} match(es):\n\n${matches.join('\n---\n')}`;
    }

    case 'get_text_around': {
      const keyword = (input.keyword as string).toLowerCase();
      const contextLines = (input.context_lines as number) || 5;
      const lines = ctx.fullText.split('\n');
      const idx = lines.findIndex(l => l.toLowerCase().includes(keyword));
      if (idx === -1) {
        return `Keyword "${input.keyword}" not found in document.`;
      }
      const start = Math.max(0, idx - contextLines);
      const end = Math.min(lines.length - 1, idx + contextLines);
      return lines.slice(start, end + 1).map((l, i) => `${start + i + 1}: ${l}`).join('\n');
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}
