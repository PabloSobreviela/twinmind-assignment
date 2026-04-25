import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../lib/state/store';
import type { Batch } from '../lib/format/promptInputs';

const FRESH_STATE = {
  apiKey: '',
  transcript: [],
  entityPool: [],
  batches: [],
  chatHistory: [],
  chatTurns: [],
  sessionMeta: null,
  settings: {
    rollingWindowSeconds: 180,
    antiRepetitionBatchCount: 2,
    fullSessionCharLimit: 50_000,
  },
  prompts: undefined,
  recording: false,
  batchInFlight: false,
  chatStreamInFlight: false,
  currentChatStream: '',
  settingsOpen: false,
  rateLimitedUntil: null,
  authError: false,
};

describe('store finalizers', () => {
  beforeEach(() => {
    useStore.setState(FRESH_STATE);
  });

  describe('commitBatch', () => {
    it('appends batch and clears batchInFlight in one set', () => {
      useStore.setState({ batchInFlight: true });
      const batch = { ts: 100, cards: [] } as unknown as Batch;
      useStore.getState().commitBatch(batch);
      expect(useStore.getState().batches).toHaveLength(1);
      expect(useStore.getState().batchInFlight).toBe(false);
    });
  });

  describe('commitChatTurn', () => {
    it('user_question + complete: user+assistant in chatHistory and chatTurns', () => {
      useStore.setState({ chatStreamInFlight: true });
      useStore.getState().commitChatTurn({
        input: { kind: 'user_question', userMessage: 'hi' },
        assistantContent: 'hello',
        userTurnTs: 1,
        assistantTurnTs: 2,
        latencyToFirstTokenMs: 100,
        totalStreamDurationMs: 500,
        streamFinalState: 'complete',
      });
      const s = useStore.getState();
      expect(s.chatHistory).toEqual([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ]);
      expect(s.chatTurns).toHaveLength(2);
      expect(s.chatTurns[0]).toMatchObject({ role: 'user', source: 'user_question', content: 'hi' });
      expect(s.chatTurns[1]).toMatchObject({
        role: 'assistant',
        content: 'hello',
        latency_to_first_token_ms: 100,
        total_stream_duration_ms: 500,
      });
      expect(s.chatStreamInFlight).toBe(false);
      expect(s.currentChatStream).toBe('');
    });

    it('card_click + complete: source_card_id stamped on user turn; chatHistory uses canonical body', () => {
      useStore.getState().commitChatTurn({
        input: { kind: 'card_click', preview: 'P', fullContext: 'C' },
        sourceCardId: 'card-123',
        assistantContent: 'expansion',
        userTurnTs: 1,
        assistantTurnTs: 2,
        latencyToFirstTokenMs: 50,
        totalStreamDurationMs: 200,
        streamFinalState: 'complete',
      });
      const s = useStore.getState();
      expect(s.chatTurns[0]).toMatchObject({
        role: 'user',
        source: 'card_click',
        source_card_id: 'card-123',
      });
      expect(s.chatHistory[0].content).toContain('Expanding on this suggestion:');
      expect(s.chatHistory[0].content).toContain('Context provided: C');
    });

    it('error_no_tokens: appends user to chatTurns only; chatHistory unchanged', () => {
      useStore.setState({ chatStreamInFlight: true });
      useStore.getState().commitChatTurn({
        input: { kind: 'user_question', userMessage: 'hi' },
        assistantContent: '',
        userTurnTs: 1,
        assistantTurnTs: 2,
        latencyToFirstTokenMs: 0,
        totalStreamDurationMs: 0,
        streamFinalState: 'error_no_tokens',
      });
      const s = useStore.getState();
      expect(s.chatHistory).toEqual([]);
      expect(s.chatTurns).toHaveLength(1);
      expect(s.chatTurns[0]).toMatchObject({ role: 'user' });
      expect(s.chatStreamInFlight).toBe(false);
    });

    it('error_mid_stream: appends both turns; assistant content reflects caller-supplied suffix', () => {
      useStore.getState().commitChatTurn({
        input: { kind: 'user_question', userMessage: 'hi' },
        assistantContent: 'partial response\n\n[stream interrupted]',
        userTurnTs: 1,
        assistantTurnTs: 2,
        latencyToFirstTokenMs: 100,
        totalStreamDurationMs: 300,
        streamFinalState: 'error_mid_stream',
      });
      const s = useStore.getState();
      expect(s.chatHistory).toHaveLength(2);
      expect(s.chatHistory[1].content).toContain('[stream interrupted]');
      expect(s.chatTurns).toHaveLength(2);
    });
  });

  describe('resetSession', () => {
    it('clears session-scoped state but preserves apiKey, settings, prompts', () => {
      useStore.setState({
        apiKey: 'gsk_test',
        transcript: [{ ts: 0, chunk: 'hi' }],
        chatTurns: [{ ts: 1, role: 'user', content: 'q', source: 'user_question' }],
        prompts: { classifier: 'custom-classifier-prompt' },
      });
      useStore.getState().resetSession();
      const s = useStore.getState();
      expect(s.apiKey).toBe('gsk_test');
      expect(s.prompts).toEqual({ classifier: 'custom-classifier-prompt' });
      expect(s.transcript).toEqual([]);
      expect(s.chatTurns).toEqual([]);
    });
  });
});

describe('store actions — round 5b-ii consolidation', () => {
  beforeEach(() => {
    useStore.setState(FRESH_STATE);
  });

  it('beginRecording sets recording flag and stamps sessionMeta on first call', () => {
    expect(useStore.getState().sessionMeta).toBeNull();
    useStore.getState().beginRecording();
    const s = useStore.getState();
    expect(s.recording).toBe(true);
    expect(s.sessionMeta).not.toBeNull();
    expect(s.sessionMeta?.session_id).toBeTruthy();
    expect(s.sessionMeta?.started_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('beginRecording on second call preserves existing sessionMeta', () => {
    useStore.getState().beginRecording();
    const firstMeta = useStore.getState().sessionMeta;
    useStore.getState().endRecording();
    useStore.getState().beginRecording();
    expect(useStore.getState().sessionMeta).toEqual(firstMeta);
  });

  it('appendTranscript inserts in sorted order regardless of arrival sequence', () => {
    useStore.getState().appendTranscript({ ts: 30, chunk: 'second' });
    useStore.getState().appendTranscript({ ts: 0, chunk: 'first' });
    useStore.getState().appendTranscript({ ts: 60, chunk: 'third' });
    const ts = useStore.getState().transcript.map((c) => c.ts);
    expect(ts).toEqual([0, 30, 60]);
  });

  it('setPromptOverride and clearPromptOverride round-trip', () => {
    useStore.getState().setPromptOverride('classifier', 'custom prompt');
    expect(useStore.getState().prompts?.classifier).toBe('custom prompt');
    useStore.getState().clearPromptOverride('classifier');
    expect(useStore.getState().prompts?.classifier).toBeUndefined();
  });

  it('setRollingWindowSeconds updates settings', () => {
    expect(useStore.getState().settings.rollingWindowSeconds).toBe(180);
    useStore.getState().setRollingWindowSeconds(120);
    expect(useStore.getState().settings.rollingWindowSeconds).toBe(120);
  });
});
