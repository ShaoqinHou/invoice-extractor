import { getClient, getWorkingModel } from './client';
import { InvoiceExtractionSchema, type InvoiceExtraction } from './schema';

/**
 * Cross-check OCR-extracted structured data against the PDF's text layer.
 *
 * When Docling OCR is used (because the text layer has broken fonts), the OCR
 * can misread characters — e.g. "$" as "S" or "8", missing commas, swapped
 * digits. The text layer, while partially garbled, often has correct numbers
 * in the readable sections.
 *
 * This function sends both the extracted JSON and the text-layer reference to
 * the LLM, asking it to spot and correct any OCR misreadings.
 */
export async function verifyOcrExtraction(
  extraction: InvoiceExtraction,
  textLayerRef: string,
): Promise<{ corrected: InvoiceExtraction; corrections: string[] }> {
  const client = getClient();
  const model = await getWorkingModel();

  const extractionJson = JSON.stringify(extraction, null, 2);

  const response = await client.messages.create({
    model,
    system: `You are a data verification assistant. Your job is to cross-check OCR-extracted invoice data against a PDF text layer to catch OCR misreadings.

The text layer may have some garbled sections (broken fonts produce garbage characters like replacement symbols), but the READABLE parts — especially numbers, dates, and reference codes — are often more accurate than OCR output.

Common OCR errors to look for:
- "$" misread as "S", "8", or "5"
- Commas misread or dropped (e.g. "5995.12" vs "5,995.12")
- Digits swapped or misread (e.g. "8602" vs "$602")
- Parentheses for negatives misread
- "O" vs "0" in reference numbers

Respond with a JSON object containing:
- "corrected": the full corrected extraction (same schema as input, with fixes applied)
- "corrections": array of strings describing each correction made (empty if none needed)

If everything looks correct, return the original extraction unchanged with an empty corrections array.`,
    messages: [{
      role: 'user',
      content: `Here is the structured data extracted via OCR from an invoice:

<extracted_data>
${extractionJson}
</extracted_data>

Here is the raw text layer from the same PDF (some parts may be garbled, but numbers in readable sections are reliable):

<text_layer>
${textLayerRef}
</text_layer>

Cross-check the extracted data against the text layer. Focus on:
1. All amounts/numbers in entries — are they correct?
2. Reference numbers, account numbers, invoice numbers
3. Dates
4. Supplier name

Return the corrected JSON.`,
    }],
    max_tokens: 4096,
  });

  // Extract the JSON from the response
  const textContent = response.content.find(b => b.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return { corrected: extraction, corrections: [] };
  }

  try {
    // Find JSON in the response (might be wrapped in markdown code block)
    let jsonStr = textContent.text;
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      // Try to find raw JSON object
      const start = jsonStr.indexOf('{');
      const end = jsonStr.lastIndexOf('}');
      if (start >= 0 && end > start) {
        jsonStr = jsonStr.slice(start, end + 1);
      }
    }

    const parsed = JSON.parse(jsonStr);
    const corrected = InvoiceExtractionSchema.parse(parsed.corrected || parsed);
    const corrections: string[] = Array.isArray(parsed.corrections) ? parsed.corrections : [];

    return { corrected, corrections };
  } catch (err) {
    console.warn('OCR verification response parsing failed, using original extraction:', err);
    return { corrected: extraction, corrections: [] };
  }
}
