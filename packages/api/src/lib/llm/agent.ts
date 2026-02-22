import type Anthropic from '@anthropic-ai/sdk';
import { getClient, getWorkingModel } from './client';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts';
import { getToolDefinitions, executeTool, type ToolContext } from './tools';
import { InvoiceExtractionSchema, type InvoiceExtraction } from './schema';

const MAX_TURNS = 10;

/**
 * Repair malformed LLM tool input. Some API proxies produce garbled JSON keys.
 * Extracts the entries array from any mangled key containing "entries".
 */
function repairToolInput(input: Record<string, unknown>): Record<string, unknown> {
  const repaired = { ...input };

  // If 'entries' is already a proper array, nothing to do
  if (Array.isArray(repaired.entries) && repaired.entries.length > 0) {
    return repaired;
  }

  // Look for mangled keys that contain 'entries'
  for (const key of Object.keys(repaired)) {
    if (key !== 'entries' && key.includes('entries') && Array.isArray(repaired[key])) {
      repaired.entries = repaired[key];
      delete repaired[key];
      break;
    }
  }

  // Also clean up any keys that look garbled (contain control chars or backslashes)
  for (const key of Object.keys(repaired)) {
    if (/[\\"]/.test(key) || key.includes('.,')) {
      delete repaired[key];
    }
  }

  return repaired;
}

export interface AgentResult {
  extraction: InvoiceExtraction;
  rawConversation: string;
  turns: number;
}

/**
 * Run the agentic extraction loop. The LLM receives the full text and has tools
 * to investigate the document. It calls submit_invoice when done.
 */
export async function agenticExtract(
  fullText: string,
  pages: string[],
): Promise<AgentResult> {
  const client = getClient();
  const model = await getWorkingModel();
  const tools = getToolDefinitions();
  const ctx: ToolContext = { fullText, pages };

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: buildUserPrompt(fullText, pages.length) },
  ];

  const conversationLog: unknown[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model,
      system: SYSTEM_PROMPT,
      messages,
      tools,
      max_tokens: 4096,
      temperature: 0,
    });

    conversationLog.push({ role: 'assistant', content: response.content, stop_reason: response.stop_reason });

    // Check for submit_invoice call
    const submitBlock = response.content.find(
      (b): b is Anthropic.ContentBlock & { type: 'tool_use'; name: string; input: unknown } =>
        b.type === 'tool_use' && b.name === 'submit_invoice',
    );

    if (submitBlock) {
      const extraction = InvoiceExtractionSchema.parse(repairToolInput(submitBlock.input as Record<string, unknown>));

      // Still need to respond with tool_result for submit_invoice to be well-formed
      // but we're done — just return.
      return {
        extraction,
        rawConversation: JSON.stringify(conversationLog, null, 2),
        turns: turn + 1,
      };
    }

    // If no tool calls at all, the model finished without submitting
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ContentBlock & { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
        b.type === 'tool_use',
    );

    if (toolUseBlocks.length === 0) {
      // Model produced text but no tool call — prompt it to call submit_invoice
      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: 'Please call submit_invoice with the extracted data. Do not provide text — use the tool.',
      });
      conversationLog.push({ role: 'user', content: '[system: prompted to call submit_invoice]' });
      continue;
    }

    // Execute all tool calls and feed results back
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      if (block.name === 'submit_invoice') {
        // Already handled above, but just in case of multiple tool calls
        const extraction = InvoiceExtractionSchema.parse(block.input);
        return {
          extraction,
          rawConversation: JSON.stringify(conversationLog, null, 2),
          turns: turn + 1,
        };
      }

      const result = executeTool(block.name, block.input, ctx);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: result,
      });
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
    conversationLog.push({ role: 'tool_results', results: toolResults.map(r => ({ id: r.tool_use_id, content: r.content })) });
  }

  throw new Error(`LLM did not submit invoice data within ${MAX_TURNS} turns.`);
}
