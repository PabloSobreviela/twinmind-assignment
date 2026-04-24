/**
 * lib/api/groq.ts
 *
 * Thin wrapper over the OpenAI-compatible Groq endpoint. Uses the
 * `openai` npm package with a custom baseURL — Groq maintains API
 * parity with OpenAI's chat.completions endpoint, including
 * response_format strict-mode JSON schemas and reasoning_effort.
 *
 * Browser-only by design: the PLAN commits to user-pasted keys in
 * React state / localStorage, never server-side. dangerouslyAllowBrowser
 * flag is set accordingly. This is a deliberate trade-off: no proxy
 * hop means lower latency on scoring axis #6, at the cost of exposing
 * the key in DevTools (the user's own key, on their own machine).
 *
 * MODEL ID
 * 'openai/gpt-oss-120b' on Groq. Verified via Groq's model docs page
 * at console.groq.com/docs/model/openai/gpt-oss-120b.
 *
 * ERROR HANDLING
 * - 401 → apiKey invalid; surface clearly so the user can re-paste.
 * - 429 → rate limited; caller should back off. This wrapper does not
 *   auto-retry (the 30s batch cadence tolerates skipped batches better
 *   than stacked-up retries).
 * - Network errors → re-throw with a typed wrapper so the UI can show
 *   "Network error — check connection" without leaking raw stack traces.
 */

import OpenAI from 'openai';

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export const MODEL_ID = 'openai/gpt-oss-120b';
// Verified against https://console.groq.com/docs/model/openai/gpt-oss-120b

export type ReasoningEffort = 'low' | 'medium' | 'high';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ResponseFormat = {
  type: 'json_schema';
  json_schema: {
    name: string;
    strict: boolean;
    schema: Record<string, unknown>;
  };
};

export type GroqCallParams = {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  responseFormat?: ResponseFormat;
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
};

export class GroqAuthError extends Error {
  constructor(message: string) { super(message); this.name = 'GroqAuthError'; }
}
export class GroqRateLimitError extends Error {
  constructor(message: string) { super(message); this.name = 'GroqRateLimitError'; }
}
export class GroqCallError extends Error {
  constructor(message: string, public readonly cause?: unknown) { super(message); this.name = 'GroqCallError'; }
}

function makeClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: GROQ_BASE_URL,
    dangerouslyAllowBrowser: true,
  });
}

function classifyError(err: unknown): never {
  // OpenAI SDK surfaces status on the error object.
  const status = (err as { status?: number })?.status;
  if (status === 401) throw new GroqAuthError('Groq API key is invalid or expired.');
  if (status === 429) throw new GroqRateLimitError('Groq rate limit exceeded.');
  throw new GroqCallError('Groq call failed.', err);
}

/**
 * Non-streaming call. Returns the full assistant content as a string.
 */
export async function callGroq(params: GroqCallParams): Promise<string> {
  const client = makeClient(params.apiKey);
  try {
    const req: Record<string, unknown> = {
      model: params.model,
      messages: params.messages,
    };
    if (params.responseFormat) req.response_format = params.responseFormat;
    if (params.reasoningEffort) req.reasoning_effort = params.reasoningEffort;
    if (params.temperature !== undefined) req.temperature = params.temperature;

    const resp = await client.chat.completions.create(req as unknown as Parameters<typeof client.chat.completions.create>[0]);
    const content = (resp as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new GroqCallError('Groq response missing content.');
    }
    return content;
  } catch (err) {
    if (err instanceof GroqCallError || err instanceof GroqAuthError || err instanceof GroqRateLimitError) throw err;
    classifyError(err);
  }
}

/**
 * Streaming call. Yields assistant content chunks as they arrive.
 * Completes when the stream ends. Error semantics match callGroq.
 */
export async function* callGroqStream(params: GroqCallParams): AsyncIterable<string> {
  const client = makeClient(params.apiKey);
  try {
    const req: Record<string, unknown> = {
      model: params.model,
      messages: params.messages,
      stream: true,
    };
    if (params.responseFormat) req.response_format = params.responseFormat;
    if (params.reasoningEffort) req.reasoning_effort = params.reasoningEffort;
    if (params.temperature !== undefined) req.temperature = params.temperature;

    const stream = await client.chat.completions.create(req as unknown as Parameters<typeof client.chat.completions.create>[0]) as AsyncIterable<{ choices?: Array<{ delta?: { content?: string } }> }>;
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta.length > 0) yield delta;
    }
  } catch (err) {
    if (err instanceof GroqCallError || err instanceof GroqAuthError || err instanceof GroqRateLimitError) throw err;
    classifyError(err);
  }
}
