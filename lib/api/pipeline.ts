/**
 * lib/api/pipeline.ts
 *
 * Orchestrator for the two live flows:
 *   runBatch(state)         → classifier → routing → 3 parallel generators → Batch
 *   runChat(state, input)   → streaming chat completion (card-click or typed)
 *
 * STATE MUTATION CONTRACT
 * - runBatch mutates state.entityPool (via applyEntityDelta) after classifier
 *   returns, before generators run — generators see the merged pool.
 * - runBatch does NOT push to state.batches. Caller appends the returned
 *   Batch once the batch is confirmed (e.g. after rendering to UI).
 *   Render-then-commit: if rendering fails, state isn't corrupted.
 * - runChat does NOT mutate state.
 *
 * CHAT HISTORY CONTRACT (important — affects caller-side UI wiring)
 * Caller appends RAW input strings to state.chatHistory — NOT the
 * transcript-wrapped form that runChat actually sends to the API. Use
 * chatHistoryEntryFromInput(input) from prompts/chat.ts to produce the
 * canonical raw string:
 *   - user_question → the plain userMessage string
 *   - card_click   → the "Expanding on this suggestion:\n..." body
 *                    (no transcript preamble)
 *
 * runChat wraps ONLY the current turn with the <session_transcript>
 * preamble. Older turns in chatHistory stay slim. The transcript grows
 * across the session but doesn't duplicate into history on every turn —
 * preserves system-prompt cache hits and prevents token ballooning.
 * (5 turns × 50k-char transcript without this split = 250k redundant
 * chars; with the split, transcript appears exactly once per batch.)
 *
 * After streaming completes, the caller does:
 *   state.chatHistory.push({ role: 'user',      content: chatHistoryEntryFromInput(input) });
 *   state.chatHistory.push({ role: 'assistant', content: <accumulated stream> });
 *
 * TEMPERATURES (call-site, not prompt-level)
 *   classifier: 0.2 — stability. Classifier output drives routing;
 *     flipping state mid-conversation wastes a batch.
 *   generators: 0.7 — diversity. Locked rationale in shared.ts.
 *   chat:       0.5 — balance. Too low rubber-stamps the card; too
 *     high drifts from the committed preview.
 *
 * REASONING EFFORT
 *   classifier + generators: low (speed matters at 30s cadence)
 *   chat:                    high (quality matters post-click)
 */

import {
  CLASSIFIER_SYSTEM_PROMPT,
  CLASSIFIER_USER_TEMPLATE,
} from '../prompts/classifier';
import { QUESTION_SYSTEM_PROMPT } from '../prompts/generators/question';
import { TALKING_SYSTEM_PROMPT }  from '../prompts/generators/talking';
import { ANSWER_SYSTEM_PROMPT }   from '../prompts/generators/answer';
import { FACT_SYSTEM_PROMPT }     from '../prompts/generators/fact';
import { generatorUserTemplate } from '../prompts/generators/shared';
import {
  CHAT_SYSTEM_PROMPT,
  chatCardClickUserMessage,
  chatUserQuestionMessage,
  chatHistoryEntryFromInput,
  type ChatInput,
} from '../prompts/chat';
import { resolveMix } from '../routing/suggestionMix';
import { applyEntityDelta } from '../state/entityPool';
import {
  formatEntityPool,
  formatPreviousBatchTuples,
  formatRollingWindow,
  formatClassifierOutput,
  formatFullTranscript,
  type ClassifierOutput,
  type SessionEntity,
  type TranscriptChunk,
  type Batch,
  type Tuple,
} from '../format/promptInputs';
import {
  callGroq,
  callGroqStream,
  MODEL_ID,
  type ChatMessage,
} from './groq';
import {
  classifierSchema,
  GENERATOR_SCHEMAS,
} from './schemas';
import type { SuggestionType } from '../types';

// Re-export chat-side helpers the caller needs for history management.
export { chatHistoryEntryFromInput };
export type { ChatInput };

const GENERATOR_SYSTEM_PROMPTS: Record<SuggestionType, string> = {
  question: QUESTION_SYSTEM_PROMPT,
  talking:  TALKING_SYSTEM_PROMPT,
  answer:   ANSWER_SYSTEM_PROMPT,
  fact:     FACT_SYSTEM_PROMPT,
};

export type Card = {
  type: SuggestionType;
  preview: string;
  full_context: string;
  grounded_in: string[];
  tuple: Tuple;
};

export type PipelineState = {
  apiKey: string;
  transcript: TranscriptChunk[];
  entityPool: SessionEntity[];
  batches: Batch[];
  chatHistory: ChatMessage[]; // Raw-input form; see CHAT HISTORY CONTRACT above.
  settings: {
    rollingWindowSeconds: number;
    antiRepetitionBatchCount: number;
    fullSessionCharLimit: number;
  };
};

// -------------------- runBatch --------------------

export async function runBatch(state: PipelineState, nowTs: number): Promise<Batch> {
  const rollingWindow   = formatRollingWindow(state.transcript, state.settings.rollingWindowSeconds);
  const poolBeforeDelta = formatEntityPool(state.entityPool);
  const previousTuples  = formatPreviousBatchTuples(state.batches, state.settings.antiRepetitionBatchCount);

  const classifierStart = Date.now();
  const classifierRaw = await callGroq({
    apiKey: state.apiKey,
    model: MODEL_ID,
    messages: [
      { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
      {
        role: 'user',
        content: CLASSIFIER_USER_TEMPLATE({
          rollingWindow,
          sessionEntities: poolBeforeDelta,
          previousBatchTuples: previousTuples,
        }),
      },
    ],
    responseFormat: { type: 'json_schema', json_schema: classifierSchema },
    reasoningEffort: 'low',
    temperature: 0.2,
  });
  const classifierLatencyMs = Date.now() - classifierStart;
  const classifier: ClassifierOutput = JSON.parse(classifierRaw);

  applyEntityDelta(state.entityPool, classifier.session_entities_delta, nowTs);

  const mix = resolveMix(classifier);

  const poolAfterDelta  = formatEntityPool(state.entityPool);
  const classifierBlock = formatClassifierOutput(classifier);
  const generatorUserMsg = generatorUserTemplate({
    classifierOutput: classifierBlock,
    rollingWindow,
    sessionEntities: poolAfterDelta,
    previousBatchTuples: previousTuples,
  });

  const generatorResults = await Promise.all(
    mix.map(async (type) => {
      const start = Date.now();
      const raw = await callGroq({
        apiKey: state.apiKey,
        model: MODEL_ID,
        messages: [
          { role: 'system', content: GENERATOR_SYSTEM_PROMPTS[type] },
          { role: 'user', content: generatorUserMsg },
        ],
        responseFormat: { type: 'json_schema', json_schema: GENERATOR_SCHEMAS[type] },
        reasoningEffort: 'low',
        temperature: 0.7,
      });
      const latencyMs = Date.now() - start;
      const parsed = JSON.parse(raw) as Omit<Card, 'type'>;
      return { card: { type, ...parsed } as Card, latencyMs };
    })
  );

  return {
    ts: nowTs,
    cards: generatorResults.map((r) => ({ ...r.card })),
    classifier,
    classifierLatencyMs,
    generatorLatenciesMs: generatorResults.map((r) => r.latencyMs),
    rollingWindowSnapshot: rollingWindow,
    mix,
  };
}

// -------------------- runChat --------------------

/**
 * Stream a chat response. Does NOT mutate state.
 *
 * state.chatHistory contains raw user inputs (not transcript-wrapped).
 * This function wraps ONLY the current turn with <session_transcript>
 * before sending. See CHAT HISTORY CONTRACT in the file JSDoc for how
 * the caller should persist the turn after streaming completes.
 */
export async function* runChat(
  state: PipelineState,
  input: ChatInput,
): AsyncIterable<string> {
  const sessionTranscript = formatFullTranscript(state.transcript, state.settings.fullSessionCharLimit);

  const currentUserContent =
    input.kind === 'card_click'
      ? chatCardClickUserMessage({
          sessionTranscript,
          preview: input.preview,
          fullContext: input.fullContext,
        })
      : chatUserQuestionMessage({
          sessionTranscript,
          userMessage: input.userMessage,
        });

  const messages: ChatMessage[] = [
    { role: 'system', content: CHAT_SYSTEM_PROMPT },
    ...state.chatHistory, // raw-input form; no transcript preamble in prior turns
    { role: 'user', content: currentUserContent },
  ];

  yield* callGroqStream({
    apiKey: state.apiKey,
    model: MODEL_ID,
    messages,
    reasoningEffort: 'high',
    temperature: 0.5,
  });
}
