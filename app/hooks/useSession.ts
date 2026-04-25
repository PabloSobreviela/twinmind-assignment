'use client';

/**
 * app/hooks/useSession.ts — round 5b-ii
 *
 * Pure orchestrator. Every state mutation goes through a store action;
 * no scattered useStore.setState. The setRateLimitFor module helper
 * (4d) and the local generateSessionId (4a) both moved into the store
 * / lib/state/sessionId.ts respectively as part of the action
 * consolidation cleanup.
 *
 * SSR
 * MediaRecorder, navigator.mediaDevices, performance.now — none exist
 * server-side. ChunkedRecorder instantiated INSIDE startRecording (event
 * handler), never at module load or in the hook body.
 *
 * SNAPSHOT_PIPELINE_STATE / isCurrentlyBlocked
 * Read-only helpers; live in the hook because they're hook-internal
 * orchestration concerns, not store state.
 *
 * TIMING
 * Latency to first token measured here, passed to commitChatTurn.
 *
 * NOT UNIT-TESTED
 * Browser-API-bound; manual validation only.
 */

import { useEffect, useRef } from 'react';
import { useStore } from '@/lib/state/store';
import { ChunkedRecorder, type AudioChunk } from '@/lib/audio/recorder';
import { transcribeAudioChunk } from '@/lib/api/whisper';
import { runBatch, runChat, type ChatInput, type PipelineState } from '@/lib/api/pipeline';
import { GroqRateLimitError, GroqAuthError } from '@/lib/api/groq';
import { buildExportPayload, downloadExport } from '@/lib/export';

function snapshotPipelineState(): PipelineState {
  const s = useStore.getState();
  return {
    apiKey: s.apiKey,
    transcript: [...s.transcript],
    entityPool: [...s.entityPool],
    batches: [...s.batches],
    chatHistory: [...s.chatHistory],
    settings: s.settings,
    prompts: s.prompts,
  };
}

function isCurrentlyBlocked(): { blocked: true; reason: string } | { blocked: false } {
  const s = useStore.getState();
  if (s.rateLimitedUntil && s.rateLimitedUntil > Date.now()) {
    return { blocked: true, reason: 'rate-limited' };
  }
  if (s.authError) {
    return { blocked: true, reason: 'auth-error' };
  }
  return { blocked: false };
}

export function useSession() {
  const recorderRef = useRef<ChunkedRecorder | null>(null);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      recorderRef.current = null;
    };
  }, []);

  const startRecording = async () => {
    const state = useStore.getState();
    if (!state.apiKey) {
      useStore.getState().setSettingsOpen(true);
      return;
    }
    if (state.recording) return;

    const recorder = new ChunkedRecorder({
      rotationSeconds: 30,
      onChunk: handleChunk,
      onError: (err) => console.error('Recorder error:', err),
    });
    recorderRef.current = recorder;

    try {
      await recorder.start();
      useStore.getState().beginRecording();
    } catch (err) {
      console.error('Failed to start recording:', err);
      recorderRef.current = null;
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    useStore.getState().endRecording();
  };

  const rotateBatchNow = () => {
    if (!recorderRef.current?.isRunning()) return;
    if (useStore.getState().batchInFlight) return;
    if (isCurrentlyBlocked().blocked) return;
    recorderRef.current.rotateNow();
  };

  const handleChunk = async (chunk: AudioChunk) => {
    const apiKey = useStore.getState().apiKey;
    if (!apiKey) {
      console.warn('handleChunk: no API key, dropping chunk');
      return;
    }

    let text: string;
    try {
      text = await transcribeAudioChunk(apiKey, chunk.blob);
    } catch (err) {
      console.error('handleChunk: Whisper failed:', err);
      return;
    }
    if (!text) return;

    useStore.getState().appendTranscript({ ts: chunk.startTs, chunk: text });

    if (useStore.getState().batchInFlight) return;
    if (isCurrentlyBlocked().blocked) return;

    await runBatchNow();
  };

  const runBatchNow = async () => {
    useStore.getState().beginBatch();
    try {
      const batch = await runBatch(snapshotPipelineState(), Math.floor(Date.now() / 1000));
      useStore.getState().commitBatch(batch);
    } catch (err) {
      console.error('runBatchNow: failed:', err);
      if (err instanceof Error && 'cause' in err && err.cause) {
        console.error('runBatchNow: cause:', err.cause);
      }
      if (err instanceof GroqRateLimitError) {
        useStore.getState().setRateLimitFor(60_000);
      } else if (err instanceof GroqAuthError) {
        useStore.getState().setAuthError();
      }
      useStore.getState().cancelBatch();
    }
  };

  const sendChat = async (input: ChatInput, sourceCardId?: string) => {
    const state = useStore.getState();
    if (!state.apiKey) {
      useStore.getState().setSettingsOpen(true);
      return;
    }
    if (state.chatStreamInFlight) return;
    if (isCurrentlyBlocked().blocked) return;

    useStore.getState().beginChatStream();

    const userTurnTs = Math.floor(Date.now() / 1000);
    const callStartMs = performance.now();
    let firstTokenMs: number | null = null;
    let accumulated = '';
    let streamFinalState: 'complete' | 'error_mid_stream' | 'error_no_tokens' = 'complete';

    try {
      for await (const chunk of runChat(snapshotPipelineState(), input)) {
        if (firstTokenMs === null) firstTokenMs = performance.now();
        accumulated += chunk;
        useStore.getState().updateChatStream(accumulated);
      }
      if (firstTokenMs === null) streamFinalState = 'error_no_tokens';
    } catch (err) {
      console.error('Chat stream failed:', err);
      if (err instanceof GroqRateLimitError) {
        useStore.getState().setRateLimitFor(60_000);
      } else if (err instanceof GroqAuthError) {
        useStore.getState().setAuthError();
      }
      if (firstTokenMs === null) {
        streamFinalState = 'error_no_tokens';
      } else {
        streamFinalState = 'error_mid_stream';
        accumulated += '\n\n[stream interrupted]';
      }
    }

    const totalStreamDurationMs = performance.now() - callStartMs;
    const latencyToFirstTokenMs = firstTokenMs !== null ? firstTokenMs - callStartMs : 0;

    useStore.getState().commitChatTurn({
      input,
      sourceCardId,
      assistantContent: accumulated,
      userTurnTs,
      assistantTurnTs: Math.floor(Date.now() / 1000),
      latencyToFirstTokenMs,
      totalStreamDurationMs,
      streamFinalState,
    });
  };

  const exportSession = () => {
    const s = useStore.getState();
    const payload = buildExportPayload({
      sessionMeta: s.sessionMeta,
      settings: s.settings,
      transcript: s.transcript,
      batches: s.batches,
      chatTurns: s.chatTurns,
    });
    downloadExport(payload);
  };

  return {
    startRecording,
    stopRecording,
    rotateBatchNow,
    sendChat,
    exportSession,
  };
}
