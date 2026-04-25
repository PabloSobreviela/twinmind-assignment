import { describe, it, expect } from 'vitest';
import { buildExportPayload } from '../lib/export';
import type { Batch, TranscriptChunk } from '../lib/format/promptInputs';
import type { ChatTurn, SessionMeta } from '../lib/types';

describe('buildExportPayload', () => {
  it('produces a complete payload from store-shaped inputs', () => {
    const sessionMeta: SessionMeta = {
      session_id: 'sess-abc12345',
      started_at: '2026-04-24T12:00:00.000Z',
    };
    const transcript: TranscriptChunk[] = [{ ts: 0, chunk: 'hello' }];
    const batches: Batch[] = [{ ts: 30, cards: [] } as unknown as Batch];
    const chatTurns: ChatTurn[] = [
      { ts: 35, role: 'user', content: 'q', source: 'user_question' },
    ];

    const payload = buildExportPayload({
      sessionMeta,
      settings: { rollingWindowSeconds: 180, antiRepetitionBatchCount: 2, fullSessionCharLimit: 50_000 },
      transcript,
      batches,
      chatTurns,
    });

    expect(payload.session_id).toBe('sess-abc12345');
    expect(payload.started_at).toBe('2026-04-24T12:00:00.000Z');
    expect(payload.ended_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(payload.settings.rollingWindowSeconds).toBe(180);
    expect(payload.transcript).toEqual(transcript);
    expect(payload.batches).toEqual(batches);
    expect(payload.chat).toEqual(chatTurns);
  });

  it('falls back to "unknown" + epoch when sessionMeta is null', () => {
    const payload = buildExportPayload({
      sessionMeta: null,
      settings: { rollingWindowSeconds: 180, antiRepetitionBatchCount: 2, fullSessionCharLimit: 50_000 },
      transcript: [],
      batches: [],
      chatTurns: [],
    });
    expect(payload.session_id).toBe('unknown');
    expect(payload.started_at).toBe(new Date(0).toISOString());
  });
});
