import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { extractPdfText } from '@/lib/pdf/extract';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Create a minimal valid PDF file for testing
function createMinimalPdf(text: string): Buffer {
  const content = `1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj

4 0 obj
<< /Length ${13 + text.length} >>
stream
BT /F1 12 Tf (${text}) Tj ET
endstream
endobj

5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
${String(296 + text.length).padStart(10, '0')} 00000 n

trailer
<< /Size 6 /Root 1 0 R >>
startxref
${356 + text.length}
%%EOF`;

  return Buffer.from(`%PDF-1.4\n${content}`, 'utf-8');
}

let tempDir: string;
let tempPdfPath: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-test-'));
  tempPdfPath = path.join(tempDir, 'test.pdf');
  fs.writeFileSync(tempPdfPath, createMinimalPdf('Hello Invoice'));
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('extractPdfText', () => {
  it('extracts text from a minimal PDF', async () => {
    const result = await extractPdfText(tempPdfPath);

    expect(result.totalPages).toBe(1);
    expect(result.pages).toHaveLength(1);
    expect(result.fullText).toContain('Hello Invoice');
  }, 60_000);

  it('returns correct structure', async () => {
    const result = await extractPdfText(tempPdfPath);

    expect(result).toHaveProperty('fullText');
    expect(result).toHaveProperty('pages');
    expect(result).toHaveProperty('totalPages');
    expect(typeof result.fullText).toBe('string');
    expect(Array.isArray(result.pages)).toBe(true);
    expect(typeof result.totalPages).toBe('number');
  }, 60_000);
});
