/**
 * lib/api/schemas.ts
 *
 * JSON schemas for strict-mode response_format on Groq / GPT-OSS 120B.
 *
 * Per the locked Strategist decision: FOUR SEPARATE GENERATOR SCHEMAS,
 * each pinning tuple.action as a const. Catches action-string drift at
 * the API boundary before downstream tuple-matching logic ever sees it.
 * Do not collapse into one shared schema with an enum — that weakens
 * enforcement to post-hoc runtime assertion.
 *
 * STRICT MODE CONSTRAINTS (OpenAI spec; Groq is OpenAI-compatible)
 * - Every object: additionalProperties: false, and ALL property keys
 *   listed in required.
 * - Nullable fields: type: ['X', 'null']; key still required, value may be null.
 * - NOT SUPPORTED in strict mode: minItems, maxItems, minLength, maxLength,
 *   minimum, maximum, pattern, default, format.
 *
 * Length / cardinality contracts (preview ≤160 chars, exactly-3 recommended_mix,
 * grounded_in ≥1) are enforced by the PROMPTS, not the schemas. Do not try to
 * add minItems here — Groq rejects the schema at call time.
 */

import type { SuggestionType } from '../types';

// -------------------- Classifier --------------------

export const classifierSchema = {
  name: 'ClassifierOutput',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'conversation_state',
      'state_evidence',
      'salient_entities',
      'session_entities_delta',
      'open_questions',
      'unclarified_terms',
      'classifier_recommended_mix',
    ],
    properties: {
      conversation_state: {
        type: 'string',
        enum: ['question_asked', 'claim_made', 'decision_point', 'topic_intro', 'deep_discussion', 'lull'],
      },
      state_evidence: { type: 'string' },
      salient_entities: { type: 'array', items: { type: 'string' } },
      session_entities_delta: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['entity', 'op', 'attributed_to', 'numeric_values'],
          properties: {
            entity: { type: 'string' },
            op: { type: 'string', enum: ['add', 'update'] },
            attributed_to: { type: ['string', 'null'] },
            numeric_values: {
              type: ['array', 'null'],
              items: { type: 'string' },
            },
          },
        },
      },
      open_questions: { type: 'array', items: { type: 'string' } },
      unclarified_terms: { type: 'array', items: { type: 'string' } },
      classifier_recommended_mix: {
        type: 'array',
        items: { type: 'string', enum: ['question', 'talking', 'answer', 'fact'] },
      },
    },
  },
} as const;

// -------------------- Generator schema factory --------------------

/**
 * Produces a strict schema for one generator type. The tuple.action field
 * is pinned to the constant for that generator, catching drift at the
 * API boundary. Per the locked decision: four separate schemas, not one
 * with a 4-value enum.
 */
function makeGeneratorSchema(actionConst: 'questioned' | 'claimed' | 'answered' | 'checked', schemaName: string) {
  return {
    name: schemaName,
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['preview', 'full_context', 'grounded_in', 'tuple'],
      properties: {
        preview: { type: 'string' },
        full_context: { type: 'string' },
        grounded_in: { type: 'array', items: { type: 'string' } },
        tuple: {
          type: 'object',
          additionalProperties: false,
          required: ['entity', 'action', 'core_claim'],
          properties: {
            entity: { type: 'string' },
            action: { type: 'string', const: actionConst },
            core_claim: { type: 'string' },
          },
        },
      },
    },
  } as const;
}

export const questionGeneratorSchema = makeGeneratorSchema('questioned', 'QuestionCard');
export const talkingGeneratorSchema  = makeGeneratorSchema('claimed',    'TalkingCard');
export const answerGeneratorSchema   = makeGeneratorSchema('answered',   'AnswerCard');
export const factGeneratorSchema     = makeGeneratorSchema('checked',    'FactCard');

export const GENERATOR_SCHEMAS: Record<SuggestionType, ReturnType<typeof makeGeneratorSchema>> = {
  question: questionGeneratorSchema,
  talking:  talkingGeneratorSchema,
  answer:   answerGeneratorSchema,
  fact:     factGeneratorSchema,
};
