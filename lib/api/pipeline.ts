/**
 * lib/api/pipeline.ts
 *
 * Orchestrator for the two live flows:
 *   runBatch(state)         → classifier → routing → 3 parallel generators → Batch
 *   runChat(state, input)   → streaming chat completion (card-click or typed)
 *
 * ROUND-4a EDITS
 * - PipelineState gains optional `prompts` override map. Defaults to the
 *   shipped system prompts; round 5's settings UI lets the user supply
 *   alternatives. The override plumbing ships now so round 5 is a UI
 *   change only.
 * - Card type gains `id`. Stamped via generateCardId() at parse time.
 *   Used by the chat-side ChatTurn audit (source_card_id) so the replay
 *   harness can correlate card-click chats back to their originating card.
 *   generateCardId falls back from crypto.randomUUID to Math.random for
 *   Node <19 — Vitest runs in Node and Card-construction will end up in
 *   round-4b tests; the fallback removes a Node-version landmine.
 *
 * STATE MUTATION CONTRACT (unchanged from round 3)
 * - runBatch mutates state.entityPool (via applyEntityDelta) after classifier
 *   returns, before generators run — generators see the merged pool.
 * - runBatch does NOT push to state.batches. Caller appends the returned
 *   Batch once confirmed (render-then-commit).
 * - runChat does NOT mutate state.
 *
 * CHAT HISTORY CONTRACT (unchanged from round 3) — see round-3 docs.
 *
 * TEMPERATURES (unchanged)  classifier 0.2 / generators 0.7 / chat 0.5.
 * REASONING EFFORT (unchanged)  classifier+generators low / chat high.
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

export { chatHistoryEntryFromInput };
export type { ChatInput };

const DEFAULT_GENERATOR_SYSTEM_PROMPTS: Record<SuggestionType, string> = {
  question: QUESTION_SYSTEM_PROMPT,
  talking:  TALKING_SYSTEM_PROMPT,
  answer:   ANSWER_SYSTEM_PROMPT,
  fact:     FACT_SYSTEM_PROMPT,
};

/**
 * Generates a card correlation token. Prefers crypto.randomUUID when
 * available (modern browsers and Node 19+); falls back to a base36
 * concatenation of Math.random and Date.now for older Node runtimes
 * (Vitest may run on Node 18, where randomUUID is unavailable).
 *
 * Card IDs are correlation tokens for the export audit trail, NOT
 * security tokens — the fallback's lower entropy is acceptable.
 */
function generateCardId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2) + Date.now().toString(36)
  );
}

export type Card = {
  id: string;
  type: SuggestionType;
  preview: string;
  full_context: string;
  grounded_in: string[];
  tuple: Tuple;
};

/**
 * Optional per-prompt overrides. Any field left undefined falls back to
 * the shipped default. Used by the round-5 settings UI to let users
 * edit prompts at runtime; ships in round 4a as plumbing only.
 */
export type PromptOverrides = {
  classifier?: string;
  question?: string;
  talking?: string;
  answer?: string;
  fact?: string;
  chat?: string;
};

export type PipelineState = {
  apiKey: string;
  transcript: TranscriptChunk[];
  entityPool: SessionEntity[];
  batches: Batch[];
  chatHistory: ChatMessage[]; // Raw-input form; see CHAT HISTORY CONTRACT in round-3 docs.
  settings: {
    rollingWindowSeconds: number;
    antiRepetitionBatchCount: number;
    fullSessionCharLimit: number;
  };
  prompts?: PromptOverrides;
};

// -------------------- runBatch --------------------

export async function runBatch(state: PipelineState, nowTs: number): Promise<Batch> {
  const rollingWindow   = formatRollingWindow(state.transcript, state.settings.rollingWindowSeconds);
  const poolBeforeDelta = formatEntityPool(state.entityPool);
  const previousTuples  = formatPreviousBatchTuples(state.batches, state.settings.antiRepetitionBatchCount);

  const classifierSystem = state.prompts?.classifier ?? CLASSIFIER_SYSTEM_PROMPT;

  const classifierStart = Date.now();
  const classifierRaw = await callGroq({
    apiKey: state.apiKey,
    model: MODEL_ID,
    messages: [
      { role: 'system', content: classifierSystem },
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

  const generatorSystemFor = (type: SuggestionType): string =>
    state.prompts?.[type] ?? DEFAULT_GENERATOR_SYSTEM_PROMPTS[type];

  const generatorResults = await Promise.all(
    mix.map(async (type) => {
      const start = Date.now();
      const raw = await callGroq({
        apiKey: state.apiKey,
        model: MODEL_ID,
        messages: [
          { role: 'system', content: generatorSystemFor(type) },
          { role: 'user', content: generatorUserMsg },
        ],
        responseFormat: { type: 'json_schema', json_schema: GENERATOR_SCHEMAS[type] },
        reasoningEffort: 'low',
        temperature: 0.7,
      });
      const latencyMs = Date.now() - start;
      const parsed = JSON.parse(raw) as Omit<Card, 'type' | 'id'>;
      const card: Card = { id: generateCardId(), type, ...parsed };
      return { card, latencyMs };
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

  const chatSystem = state.prompts?.chat ?? CHAT_SYSTEM_PROMPT;

  const messages: ChatMessage[] = [
    { role: 'system', content: chatSystem },
    ...state.chatHistory,
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
