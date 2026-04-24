/**
 * lib/format/promptInputs.ts
 *
 * Pre-render helpers for the variable inputs classifier + generators
 * receive in their user messages. Each function's output is
 * contractually byte-identical to the worked examples in the prompt
 * files that consume it:
 *   formatRollingWindow, formatEntityPool, formatPreviousBatchTuples
 *     → classifier.ts INPUT FORMAT + EXTRACTION EXEMPLARS
 *   formatClassifierOutput
 *     → generators/shared.ts INPUT FORMAT block
 *
 * If you change a format here, update the consuming prompt file's
 * exemplars AND update __tests__/promptInputs.test.ts. The three must
 * stay in lockstep — drift degrades prompt quality silently.
 *
 * FORMAT DECISIONS (pinned — deviating breaks the exemplar contract)
 * - Timestamps: HH:MM:SS relative to session start, zero-padded, floored.
 * - Pool sort order: ascending by first_seen_ts.
 * - Pool optional attributes: numeric / by omitted when null or empty.
 * - numeric_values: joined for render by " | " (space-pipe-space).
 *   Delta-applier contract (state layer, not here): numeric_values
 *   accumulate on update; attributed_to overwrites on update.
 * - Rolling window cutoff: relative to the most recent chunk's ts, not
 *   wall-clock "now". Keeps replay-harness output deterministic.
 * - Empty inputs: renderer returns empty string. XML wrapping at the
 *   user-template level preserves the empty-block signal.
 * - Classifier output:
 *     • Empty arrays render as "(none)".
 *     • session_entities_delta is NOT rendered — it's applied to the
 *       pool by the state layer; generators see the merged pool.
 *     • open_questions renders as "(none)" if empty, else as indented
 *       bullet list ("  - " prefix per item).
 */

import type { ConversationState, SuggestionType } from '../types';

export type SessionEntity = {
  entity: string;
  first_seen_ts: number;
  last_referenced_ts: number;
  attributed_to: string | null;
  numeric_values: string[] | null;
};

export type TranscriptChunk = {
  ts: number;
  chunk: string;
  whisper_segments?: unknown;
};

export type Tuple = {
  entity: string;
  action: 'questioned' | 'claimed' | 'answered' | 'checked';
  core_claim: string;
};

export type Batch = {
  ts: number;
  cards: Array<{ tuple: Tuple; [key: string]: unknown }>;
  [key: string]: unknown;
};

export type ClassifierOutput = {
  conversation_state: ConversationState;
  state_evidence: string;
  salient_entities: string[];
  session_entities_delta: Array<{
    entity: string;
    op: 'add' | 'update';
    attributed_to: string | null;
    numeric_values: string[] | null;
  }>;
  open_questions: string[];
  unclarified_terms: string[];
  classifier_recommended_mix: [SuggestionType, SuggestionType, SuggestionType];
};

function formatSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

function escapeClaim(s: string): string {
  return s.replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
}

export function formatEntityPool(pool: SessionEntity[]): string {
  const sorted = [...pool].sort((a, b) => a.first_seen_ts - b.first_seen_ts);
  return sorted
    .map((e) => {
      const parts: string[] = [
        `added ${formatSeconds(e.first_seen_ts)}`,
        `last seen ${formatSeconds(e.last_referenced_ts)}`,
      ];
      if (e.numeric_values && e.numeric_values.length > 0) {
        parts.push(`numeric: ${e.numeric_values.join(' | ')}`);
      }
      if (e.attributed_to) {
        parts.push(`by: ${e.attributed_to}`);
      }
      return `${e.entity} (${parts.join(', ')})`;
    })
    .join('\n');
}

export function formatPreviousBatchTuples(batches: Batch[], count: number): string {
  const recent = batches.slice(-Math.max(0, count));
  const tuples = recent.flatMap((b) => b.cards.map((c) => c.tuple));
  return tuples
    .map((t) => `(${t.entity}, ${t.action}, "${escapeClaim(t.core_claim)}")`)
    .join('\n');
}

export function formatRollingWindow(transcript: TranscriptChunk[], seconds: number): string {
  if (transcript.length === 0) return '';
  const sorted = [...transcript].sort((a, b) => a.ts - b.ts);
  const lastTs = sorted[sorted.length - 1].ts;
  const cutoff = lastTs - Math.max(0, seconds);
  return sorted
    .filter((c) => c.ts >= cutoff)
    .map((c) => `[${formatSeconds(c.ts)}] ${c.chunk.trim()}`)
    .join('\n');
}

/**
 * Render classifier output into the plain-text block generators receive.
 * session_entities_delta is intentionally excluded — it's applied by the
 * state layer before generators run.
 */
export function formatClassifierOutput(co: ClassifierOutput): string {
  const lines: string[] = [];
  lines.push(`conversation_state: ${co.conversation_state}`);
  lines.push(`state_evidence: ${co.state_evidence}`);
  lines.push(
    `salient_entities: ${co.salient_entities.length ? co.salient_entities.join(', ') : '(none)'}`
  );
  if (co.open_questions.length === 0) {
    lines.push(`open_questions: (none)`);
  } else {
    lines.push(`open_questions:`);
    for (const q of co.open_questions) lines.push(`  - ${q}`);
  }
  lines.push(
    `unclarified_terms: ${co.unclarified_terms.length ? co.unclarified_terms.join(', ') : '(none)'}`
  );
  lines.push(`classifier_recommended_mix: ${co.classifier_recommended_mix.join(', ')}`);
  return lines.join('\n');
}
