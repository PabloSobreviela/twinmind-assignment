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
 * ERROR HANDLING — round-4c upgrade
 * Previous classifyError dropped the API error message into err.cause,
 * leaving the user-facing GroqCallError.message generic ("Groq call
 * failed."). When runBatch threw at the catch site in useSession's
 * runBatchNow, the console showed "Batch failed: GroqCallError: Groq
 * call failed." — opaque to the diagnostic.
 *
 * Round-4c classifyError surfaces the SDK error's message, error.code,
 * status, and (truncated) body in the GroqCallError.message itself. So
 * a structured-output schema rejection now logs as:
 *   GroqCallError: Groq call failed [status=400 code=invalid_request_error]: Invalid schema for response_format ...
 * That is the diagnostic surface.
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
  const e = err as {
    status?: number;
    message?: string;
    error?: { message?: string; type?: string; code?: string };
    body?: unknown;
  };
  const status = e.status;
  const apiMessage = e.error?.message ?? e.message ?? 'unknown error';
  const apiCode = e.error?.code ? ` code=${e.error.code}` : '';
  const bodyStr = e.body ? ` body=${JSON.stringify(e.body).slice(0, 500)}` : '';

  if (status === 401) {
    throw new GroqAuthError(`Groq API key is invalid or expired. ${apiMessage}`);
  }
  if (status === 429) {
    throw new GroqRateLimitError(`Groq rate limit exceeded. ${apiMessage}`);
  }
  throw new GroqCallError(
    `Groq call failed [status=${status ?? 'none'}${apiCode}]: ${apiMessage}${bodyStr}`,
    err,
  );
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
