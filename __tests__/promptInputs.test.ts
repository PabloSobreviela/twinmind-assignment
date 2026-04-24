/**
 * Byte-equivalence contract between prompt-file exemplars and renderers.
 * If any assertion fails after an edit, DO NOT adjust the test to match —
 * the exemplars and the renderer are two halves of one contract. Inbox
 * the Strategist if the contract needs to change.
 *
 * Coverage:
 *   formatEntityPool:           3 cases (classifier INPUT FORMAT + 2 exemplars)
 *   formatPreviousBatchTuples:  3 cases (classifier INPUT FORMAT + 2 exemplars)
 *   formatRollingWindow:        2 cases (classifier extraction exemplars)
 *   formatClassifierOutput:     2 cases (generators/shared.ts INPUT FORMAT
 *                                        + empty-optionals case)
 *   formatFullTranscript:       2 cases (under-limit verbatim, over-limit
 *                                        truncation behavior)
 */

import { describe, it, expect } from 'vitest';
import {
  formatEntityPool,
  formatPreviousBatchTuples,
  formatRollingWindow,
  formatClassifierOutput,
  formatFullTranscript,
  type SessionEntity,
  type TranscriptChunk,
  type Batch,
  type ClassifierOutput,
} from '../lib/format/promptInputs';

describe('formatEntityPool', () => {
  it('matches classifier [INPUT FORMAT] reference pool (4 entries, optional attrs exercised)', () => {
    const pool: SessionEntity[] = [
      { entity: 'Kafka',       first_seen_ts: 134, last_referenced_ts: 525, attributed_to: null,        numeric_values: ['400k events/sec'] },
      { entity: 'Ravi',        first_seen_ts: 390, last_referenced_ts: 525, attributed_to: 'team-lead', numeric_values: null },
      { entity: 'MSK',         first_seen_ts: 525, last_referenced_ts: 525, attributed_to: null,        numeric_values: null },
      { entity: 'error rates', first_seen_ts: 615, last_referenced_ts: 615, attributed_to: null,        numeric_values: ['0.3% p50', '1.8% p99'] },
    ];
    const expected =
`Kafka (added 00:02:14, last seen 00:08:45, numeric: 400k events/sec)
Ravi (added 00:06:30, last seen 00:08:45, by: team-lead)
MSK (added 00:08:45, last seen 00:08:45)
error rates (added 00:10:15, last seen 00:10:15, numeric: 0.3% p50 | 1.8% p99)`;
    expect(formatEntityPool(pool)).toBe(expected);
  });

  it('matches classifier extraction exemplar 1 pool', () => {
    const pool: SessionEntity[] = [
      { entity: 'Kafka', first_seen_ts: 134, last_referenced_ts: 525, attributed_to: null, numeric_values: null },
    ];
    expect(formatEntityPool(pool)).toBe(`Kafka (added 00:02:14, last seen 00:08:45)`);
  });

  it('matches classifier extraction exemplar 2 pool', () => {
    const pool: SessionEntity[] = [
      { entity: 'candidate', first_seen_ts: 190, last_referenced_ts: 940, attributed_to: null, numeric_values: null },
      { entity: 'round two', first_seen_ts: 742, last_referenced_ts: 940, attributed_to: null, numeric_values: null },
    ];
    const expected =
`candidate (added 00:03:10, last seen 00:15:40)
round two (added 00:12:22, last seen 00:15:40)`;
    expect(formatEntityPool(pool)).toBe(expected);
  });
});

describe('formatPreviousBatchTuples', () => {
  it('matches classifier [INPUT FORMAT] reference tuples (3 tuples, one batch)', () => {
    const batches: Batch[] = [
      {
        ts: 400,
        cards: [
          { tuple: { entity: 'MSK',            action: 'questioned', core_claim: 'does it scale past 1M events/sec' } },
          { tuple: { entity: 'Kafka sharding', action: 'claimed',    core_claim: 'Discord uses 2,500 guilds per shard' } },
          { tuple: { entity: 'p99 latency',    action: 'questioned', core_claim: 'what is current checkout p99' } },
        ],
      },
    ];
    const expected =
`(MSK, questioned, "does it scale past 1M events/sec")
(Kafka sharding, claimed, "Discord uses 2,500 guilds per shard")
(p99 latency, questioned, "what is current checkout p99")`;
    expect(formatPreviousBatchTuples(batches, 2)).toBe(expected);
  });

  it('matches classifier extraction exemplar 1 tuples', () => {
    const batches: Batch[] = [
      { ts: 100, cards: [{ tuple: { entity: 'Kafka', action: 'questioned', core_claim: 'self-hosted vs managed tradeoff' } }] },
    ];
    expect(formatPreviousBatchTuples(batches, 2)).toBe(`(Kafka, questioned, "self-hosted vs managed tradeoff")`);
  });

  it('matches classifier extraction exemplar 2 tuples', () => {
    const batches: Batch[] = [
      {
        ts: 700,
        cards: [
          { tuple: { entity: 'candidate', action: 'claimed', core_claim: 'strong technical signal from round one' } },
          { tuple: { entity: 'round two', action: 'claimed', core_claim: 'mixed culture-fit feedback' } },
        ],
      },
    ];
    const expected =
`(candidate, claimed, "strong technical signal from round one")
(round two, claimed, "mixed culture-fit feedback")`;
    expect(formatPreviousBatchTuples(batches, 2)).toBe(expected);
  });
});

describe('formatRollingWindow', () => {
  it('matches classifier extraction exemplar 1 window', () => {
    const transcript: TranscriptChunk[] = [
      { ts: 663, chunk: "We're thinking MSK over self-hosted Kafka." },
      { ts: 678, chunk: "Ravi says it'll save us a week of ops per month." },
      { ts: 694, chunk: "Current volume's 400k events per second, and we're not sure if MSK scales past a million." },
    ];
    const expected =
`[00:11:03] We're thinking MSK over self-hosted Kafka.
[00:11:18] Ravi says it'll save us a week of ops per month.
[00:11:34] Current volume's 400k events per second, and we're not sure if MSK scales past a million.`;
    expect(formatRollingWindow(transcript, 180)).toBe(expected);
  });

  it('matches classifier extraction exemplar 2 window', () => {
    const transcript: TranscriptChunk[] = [
      { ts: 1102, chunk: 'Her background is strong — ex-Stripe, led payments infra for two years.' },
      { ts: 1121, chunk: 'But round-two feedback was split: Priya liked her depth, Jay flagged pedigree bias on his own feedback.' },
      { ts: 1145, chunk: 'We were at 60/40 hire before round three.' },
    ];
    const expected =
`[00:18:22] Her background is strong — ex-Stripe, led payments infra for two years.
[00:18:41] But round-two feedback was split: Priya liked her depth, Jay flagged pedigree bias on his own feedback.
[00:19:05] We were at 60/40 hire before round three.`;
    expect(formatRollingWindow(transcript, 180)).toBe(expected);
  });
});

describe('formatClassifierOutput', () => {
  it('matches generators/shared.ts INPUT FORMAT classifier_output exemplar', () => {
    const co: ClassifierOutput = {
      conversation_state: 'claim_made',
      state_evidence: 'Discord runs Elixir because BEAM handles millions of processes cheaply.',
      salient_entities: ['Discord', 'Elixir', 'BEAM'],
      session_entities_delta: [],
      open_questions: [],
      unclarified_terms: ['BEAM'],
      classifier_recommended_mix: ['fact', 'talking', 'question'],
    };
    const expected =
`conversation_state: claim_made
state_evidence: Discord runs Elixir because BEAM handles millions of processes cheaply.
salient_entities: Discord, Elixir, BEAM
open_questions: (none)
unclarified_terms: BEAM
classifier_recommended_mix: fact, talking, question`;
    expect(formatClassifierOutput(co)).toBe(expected);
  });

  it('renders non-empty open_questions as indented bullets; empty optionals as (none)', () => {
    const co: ClassifierOutput = {
      conversation_state: 'question_asked',
      state_evidence: 'Team raises unanswered scaling question about MSK.',
      salient_entities: ['MSK'],
      session_entities_delta: [],
      open_questions: [
        'How much does managed Kafka cost at our volume?',
        'Does MSK scale past 1M events/sec?',
      ],
      unclarified_terms: [],
      classifier_recommended_mix: ['answer', 'answer', 'question'],
    };
    const expected =
`conversation_state: question_asked
state_evidence: Team raises unanswered scaling question about MSK.
salient_entities: MSK
open_questions:
  - How much does managed Kafka cost at our volume?
  - Does MSK scale past 1M events/sec?
unclarified_terms: (none)
classifier_recommended_mix: answer, answer, question`;
    expect(formatClassifierOutput(co)).toBe(expected);
  });
});

describe('formatFullTranscript', () => {
  it('renders full transcript verbatim when under char limit', () => {
    const transcript: TranscriptChunk[] = [
      { ts: 0,   chunk: 'Welcome to the meeting, everyone.' },
      { ts: 30,  chunk: "Today we're covering the Q3 infra plan." },
      { ts: 90,  chunk: "Let's start with the Kafka migration." },
    ];
    const expected =
`[00:00:00] Welcome to the meeting, everyone.
[00:00:30] Today we're covering the Q3 infra plan.
[00:01:30] Let's start with the Kafka migration.`;
    expect(formatFullTranscript(transcript, 10_000)).toBe(expected);
  });

  it('truncates from the start with marker when over char limit', () => {
    const transcript: TranscriptChunk[] = [
      { ts: 0,    chunk: 'Early content that should be trimmed.' },
      { ts: 30,   chunk: 'More early content.' },
      { ts: 1000, chunk: 'Recent content that stays.' },
    ];
    const result = formatFullTranscript(transcript, 80);
    expect(result.startsWith('[...earlier transcript omitted for length...]')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result).toContain('Recent content that stays.');
  });
});
