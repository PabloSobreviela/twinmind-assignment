/**
 * lib/prompts/generators/shared.ts
 *
 * Blocks assembled into every generator's system prompt. Keeps the
 * specificity contract, input format, anti-repetition handling, output
 * schema, and user-message template identical across all four
 * generators. Editing any block here changes all four prompts —
 * deliberate and correct.
 *
 * API REQUIREMENTS (applies to all generators)
 * Call with response_format: { type: 'json_schema', json_schema: {...},
 * strict: true }. plain json_object does NOT enforce the tuple.action
 * enum; a drifted action string silently breaks anti-repetition
 * tuple-matching because the action dimension no longer discriminates.
 *
 * IMPORTANT (for the API wiring round, not this delivery): the schema
 * passed to strict mode must pin tuple.action to the exact constant
 * for the invoked generator — question → "questioned", talking →
 * "claimed", answer → "answered", fact → "checked". Two equally valid
 * shapes:
 *   (a) four separate schemas, one per generator, with action as a
 *       const string.
 *   (b) one shared schema with action as a 4-value enum, plus a
 *       runtime assertion that the returned value matches the invoked
 *       generator's expected constant.
 * Strategist decision: (a) — Groq-side enforcement catches drift before
 * anti-repetition ever sees it. Do not re-weigh this next round; just
 * implement (a). Without either, the OUTPUT_SCHEMA_BLOCK's declared
 * "action: string" leaves the field unconstrained — a hallucinated
 * "assumed" or "raised" action would parse successfully and silently
 * corrupt anti-repetition tuple matching.
 *
 * REASONING LEVEL (applies to all generators): low
 * Card generation is structured writing, not extended reasoning.
 * Speed matters — 3 parallel calls every 30s. If a given generator
 * shows quality issues, try reasoning=medium for that one only before
 * raising globally.
 *
 * TEMPERATURE (applies to all generators): 0.7
 * Low temperature produces stilted card phrasing even with varied
 * inputs. More critically: lull mode fires three parallel
 * question-generator calls on identical inputs — at temperature 0
 * they return three identical JSON outputs (same system prompt, same
 * user message, deterministic decoding). 0.7 is the minimum that
 * reliably diverges the three lull calls while preserving grounding
 * discipline. Call-site setting for the SDK, not a model instruction.
 *
 * CACHE STRATEGY
 * System prompt = stable across calls in a session (and across
 * sessions). User message = variable. Groq caches stable prefixes
 * automatically.
 */

export const SPEC_BLOCK = `[SPECIFICITY CONTRACT — NON-NEGOTIABLE]
Every "preview" you produce MUST contain AT LEAST ONE of:
  (a) a concrete number ("p99 = 180ms", "$8-15k/mo", "2,500 guilds per shard")
  (b) a named entity (person, product, company, technology, specific metric name) present in the window, pool, or classifier output
  (c) a falsifiable claim — a specific statement that could be verified or refuted, not a hedge

Previews missing all three are rejected. Preferences and vague gestures are rejected. You are not an advisor offering perspectives. You are a research assistant surfacing the specific thing worth saying, asking, answering, or checking right now.

Banned phrasings (partial): "consider...", "you might want to...", "it's important to...", "think about...", "the implications of...", "worth exploring...", any meta-commentary about the conversation.

The conversation has specific entities, specific numbers, specific claims. Ground every preview in at least one.`;

export const INPUT_FORMAT_BLOCK = `[INPUT FORMAT]
The user message contains four blocks in this order. Any block may be empty at session start.

<classifier_output>
conversation_state: claim_made
state_evidence: Discord runs Elixir because BEAM handles millions of processes cheaply.
salient_entities: Discord, Elixir, BEAM
open_questions: (none)
unclarified_terms: BEAM
classifier_recommended_mix: fact, talking, question
</classifier_output>

<rolling_window>
[HH:MM:SS] transcript line
[HH:MM:SS] transcript line
</rolling_window>

<session_entities_pool>
ENTITY (added HH:MM:SS, last seen HH:MM:SS[, numeric: V1 | V2][, by: WHO])
</session_entities_pool>

<previous_batch_tuples>
(ENTITY, ACTION, "core claim")
</previous_batch_tuples>

Timestamps are HH:MM:SS from session start. Tuples are from the PRIOR 2 batches — not this batch. The pool reflects session state before this window; the classifier's session_entities_delta has already been merged into it. classifier_recommended_mix is an audit signal — it does NOT control which generator you are; your type is fixed in [YOUR TYPE] below.`;

export const ANTI_REPETITION_BLOCK = `[ANTI-REPETITION]
The <previous_batch_tuples> block lists tuples from the last 2 batches. DO NOT produce a card whose tuple matches or substantially paraphrases any shown. Match is judged on (entity, action, core_claim) as a unit:
  - Same entity + same action + equivalent claim = REPEAT (rejected)
  - Same entity + different action = OK (e.g. MSK previously "questioned", now "answered")
  - Different entity = OK even on the same topic area

When in doubt, pivot entity or angle. You are running in parallel with two other generators this batch; they may hit adjacent entities but you cannot see their output. Diversity within a batch is partially enforced by your type being distinct from theirs — lean into that.`;

export const OUTPUT_SCHEMA_BLOCK = `[OUTPUT SCHEMA — STRICT JSON, NOTHING ELSE]
{
  "preview": string,              // ≤160 chars, must satisfy the SPECIFICITY CONTRACT
  "full_context": string,         // 2-4 sentences of additional context the chat expansion can build on
  "grounded_in": string[],        // ≥1 entry. Short refs: "window:[HH:MM:SS]", "pool:ENTITY", "open_questions[0]", "unclarified_terms[0]", "state_evidence"
  "tuple": {
    "entity": string,             // primary entity this card is about
    "action": string,             // FIXED by your generator type — see [YOUR TYPE] above. Do not choose.
    "core_claim": string          // ≤60 chars, canonical form used for anti-repetition matching
  }
}

Return JSON only. No prose, no code fences, no commentary.`;

export const generatorUserTemplate = (args: {
  classifierOutput: string;
  rollingWindow: string;
  sessionEntities: string;
  previousBatchTuples: string;
}) => `<classifier_output>
${args.classifierOutput}
</classifier_output>

<rolling_window>
${args.rollingWindow}
</rolling_window>

<session_entities_pool>
${args.sessionEntities}
</session_entities_pool>

<previous_batch_tuples>
${args.previousBatchTuples}
</previous_batch_tuples>`;
