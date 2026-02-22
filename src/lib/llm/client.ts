import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null;
let _workingModel: string | null = null;

const DEFAULT_BASE_URL = 'https://api.z.ai/api/anthropic';
const MODEL_CANDIDATES = [
  process.env.ZAI_MODEL || 'glm-5',
  'glm-4.7',
  'claude-sonnet-4-20250514',
  'claude-haiku-4-5-20251001',
];

export function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ZAI_API_KEY;
    if (!apiKey) {
      throw new Error('ZAI_API_KEY environment variable is required.');
    }
    _client = new Anthropic({
      apiKey,
      baseURL: process.env.ZAI_BASE_URL || DEFAULT_BASE_URL,
    });
  }
  return _client;
}

/**
 * Detect a working model name by sending a tiny test message.
 * Caches the result for the process lifetime.
 */
export async function getWorkingModel(): Promise<string> {
  if (_workingModel) return _workingModel;

  const client = getClient();

  for (const model of MODEL_CANDIDATES) {
    try {
      await client.messages.create({
        model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'hi' }],
      });
      _workingModel = model;
      console.log(`LLM model detected: ${model}`);
      return model;
    } catch (error) {
      console.warn(`Model "${model}" failed:`, error instanceof Error ? error.message : error);
    }
  }

  throw new Error(`No working model found. Tried: ${MODEL_CANDIDATES.join(', ')}`);
}

/** Override model for testing */
export function setWorkingModel(model: string) {
  _workingModel = model;
}
