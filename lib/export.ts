/**
 * lib/export.ts
 *
 * Builds the ExportPayload from store state and triggers a browser
 * download. Schema is the round-5 replay-harness input; do not change
 * field shapes without a strategist conversation.
 */

import type { TranscriptChunk, Batch } from '@/lib/format/promptInputs';
import type { ChatTurn, SessionMeta } from '@/lib/types';

export type ExportPayload = {
  session_id: string;
  started_at: string; // ISO 8601
  ended_at: string;   // ISO 8601 (set at export time)
  settings: {
    rollingWindowSeconds: number;
    antiRepetitionBatchCount: number;
    fullSessionCharLimit: number;
  };
  transcript: TranscriptChunk[];
  batches: Batch[];
  chat: ChatTurn[];
};

export function buildExportPayload(args: {
  sessionMeta: SessionMeta | null;
  settings: ExportPayload['settings'];
  transcript: TranscriptChunk[];
  batches: Batch[];
  chatTurns: ChatTurn[];
}): ExportPayload {
  return {
    session_id: args.sessionMeta?.session_id ?? 'unknown',
    started_at: args.sessionMeta?.started_at ?? new Date(0).toISOString(),
    ended_at: new Date().toISOString(),
    settings: args.settings,
    transcript: args.transcript,
    batches: args.batches,
    chat: args.chatTurns,
  };
}

export function downloadExport(payload: ExportPayload): void {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `twinmind-session-${payload.session_id.slice(0, 8)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
