/**
 * lib/state/store.ts — round 5b-ii
 *
 * Single Zustand store. Round-5b-ii changes from 4d:
 *   - 14 new actions for the action-consolidation cleanup (round-4b
 *     flag): the useSession hook now calls actions exclusively, no
 *     scattered setState. See ACTION INVENTORY below.
 *   - Second persist layer (twinmind:settings) for settings + prompts.
 *     ApiKey stays isolated under twinmind:apiKey — keeps a future
 *     "export settings" feature trivially scope-able without leaking
 *     the key.
 *   - generateSessionId moved to lib/state/sessionId.ts so the store
 *     and the hook share one source of truth.
 *
 * ACTION INVENTORY
 * Existing (preserved):
 *   setApiKey, setSettingsOpen, commitBatch, commitChatTurn, resetSession
 * New (lifecycle, called by useSession):
 *   beginRecording / endRecording / appendTranscript
 *   beginBatch / cancelBatch
 *   beginChatStream / updateChatStream
 *   setRateLimitFor (was a module helper in useSession, moved here)
 *   setAuthError
 * New (settings UI):
 *   setPromptOverride / clearPromptOverride
 *   setRollingWindowSeconds / setAntiRepetitionBatchCount / setFullSessionCharLimit
 *
 * COMMIT_CHAT_TURN ATOMICITY (unchanged from 4b)
 * One set(), three terminal states ('complete' / 'error_mid_stream' /
 * 'error_no_tokens'). userEntry derived via chatHistoryEntryFromInput.
 *
 * PERSISTENCE
 * Nested persist middleware. Inner persist: twinmind:apiKey (apiKey only).
 * Outer persist: twinmind:settings (settings + prompts). The OUTER
 * persist's onRehydrateStorage sets the hydrated flag.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { PipelineState, ChatInput } from '@/lib/api/pipeline';
import type { ChatMessage } from '@/lib/api/groq';
import type { TranscriptChunk, SessionEntity, Batch } from '@/lib/format/promptInputs';
import type { ChatTurn, SessionMeta } from '@/lib/types';
import { chatHistoryEntryFromInput } from '@/lib/prompts/chat';
import { generateSessionId } from '@/lib/state/sessionId';

const DEFAULT_SETTINGS: PipelineState['settings'] = {
  rollingWindowSeconds: 180,
  antiRepetitionBatchCount: 2,
  fullSessionCharLimit: 50_000,
};

export type CommitChatTurnArgs = {
  input: ChatInput;
  sourceCardId?: string;
  assistantContent: string;
  userTurnTs: number;
  assistantTurnTs: number;
  latencyToFirstTokenMs: number;
  totalStreamDurationMs: number;
  streamFinalState: 'complete' | 'error_mid_stream' | 'error_no_tokens';
};

type PromptKey = keyof NonNullable<PipelineState['prompts']>;

type StoreState = {
  apiKey: string;
  transcript: TranscriptChunk[];
  entityPool: SessionEntity[];
  batches: Batch[];
  chatHistory: ChatMessage[];
  settings: PipelineState['settings'];
  prompts?: PipelineState['prompts'];

  chatTurns: ChatTurn[];
  sessionMeta: SessionMeta | null;

  recording: boolean;
  batchInFlight: boolean;
  chatStreamInFlight: boolean;
  currentChatStream: string;
  settingsOpen: boolean;

  rateLimitedUntil: number | null;
  authError: boolean;

  hydrated: boolean;
};

type StoreActions = {
  setApiKey: (key: string) => void;
  setSettingsOpen: (open: boolean) => void;
  commitBatch: (batch: Batch) => void;
  commitChatTurn: (args: CommitChatTurnArgs) => void;
  resetSession: () => void;

  beginRecording: () => void;
  endRecording: () => void;
  appendTranscript: (chunk: TranscriptChunk) => void;
  beginBatch: () => void;
  cancelBatch: () => void;
  beginChatStream: () => void;
  updateChatStream: (text: string) => void;
  setRateLimitFor: (durationMs: number) => void;
  setAuthError: () => void;

  setPromptOverride: (key: PromptKey, value: string) => void;
  clearPromptOverride: (key: PromptKey) => void;
  setRollingWindowSeconds: (value: number) => void;
  setAntiRepetitionBatchCount: (value: number) => void;
  setFullSessionCharLimit: (value: number) => void;
};

const ssrSafeStorage = () => {
  if (typeof window === 'undefined') {
    return {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    };
  }
  return localStorage;
};

export const useStore = create<StoreState & StoreActions>()(
  persist(
    persist(
      immer((set, get) => ({
        apiKey: '',
        transcript: [],
        entityPool: [],
        batches: [],
        chatHistory: [],
        settings: DEFAULT_SETTINGS,
        prompts: undefined,
        chatTurns: [],
        sessionMeta: null,
        recording: false,
        batchInFlight: false,
        chatStreamInFlight: false,
        currentChatStream: '',
        settingsOpen: false,
        rateLimitedUntil: null,
        authError: false,
        hydrated: false,

        setApiKey: (key) =>
          set((s) => {
            s.apiKey = key;
            s.authError = false;
          }),

        setSettingsOpen: (open) =>
          set((s) => {
            s.settingsOpen = open;
          }),

        commitBatch: (batch) =>
          set((s) => {
            s.batches.push(batch);
            s.batchInFlight = false;
          }),

        commitChatTurn: (args) =>
          set((s) => {
            const userEntry = chatHistoryEntryFromInput(args.input);

            const userTurn: ChatTurn =
              args.input.kind === 'card_click'
                ? {
                    ts: args.userTurnTs,
                    role: 'user',
                    content: userEntry,
                    source: 'card_click',
                    source_card_id: args.sourceCardId,
                  }
                : {
                    ts: args.userTurnTs,
                    role: 'user',
                    content: userEntry,
                    source: 'user_question',
                  };

            s.chatTurns.push(userTurn);

            if (args.streamFinalState !== 'error_no_tokens') {
              s.chatHistory.push({ role: 'user', content: userEntry });
              s.chatHistory.push({ role: 'assistant', content: args.assistantContent });
              s.chatTurns.push({
                ts: args.assistantTurnTs,
                role: 'assistant',
                content: args.assistantContent,
                latency_to_first_token_ms: args.latencyToFirstTokenMs,
                total_stream_duration_ms: args.totalStreamDurationMs,
              });
            }

            s.chatStreamInFlight = false;
            s.currentChatStream = '';
          }),

        resetSession: () =>
          set((s) => {
            s.transcript = [];
            s.entityPool = [];
            s.batches = [];
            s.chatHistory = [];
            s.chatTurns = [];
            s.sessionMeta = null;
            s.recording = false;
            s.batchInFlight = false;
            s.chatStreamInFlight = false;
            s.currentChatStream = '';
            // apiKey, settings, prompts, rateLimitedUntil, authError preserved.
          }),

        beginRecording: () =>
          set((s) => {
            s.recording = true;
            if (!s.sessionMeta) {
              s.sessionMeta = {
                session_id: generateSessionId(),
                started_at: new Date().toISOString(),
              };
            }
          }),

        endRecording: () =>
          set((s) => {
            s.recording = false;
          }),

        appendTranscript: (chunk) =>
          set((s) => {
            s.transcript.push(chunk);
            s.transcript.sort((a, b) => a.ts - b.ts);
          }),

        beginBatch: () =>
          set((s) => {
            s.batchInFlight = true;
          }),

        cancelBatch: () =>
          set((s) => {
            s.batchInFlight = false;
          }),

        beginChatStream: () =>
          set((s) => {
            s.chatStreamInFlight = true;
            s.currentChatStream = '';
          }),

        updateChatStream: (text) =>
          set((s) => {
            s.currentChatStream = text;
          }),

        setRateLimitFor: (durationMs) => {
          const expiresAt = Date.now() + durationMs;
          set((s) => {
            s.rateLimitedUntil = expiresAt;
          });
          setTimeout(() => {
            if (get().rateLimitedUntil === expiresAt) {
              set((s) => {
                s.rateLimitedUntil = null;
              });
            }
          }, durationMs + 100);
        },

        setAuthError: () =>
          set((s) => {
            s.authError = true;
          }),

        setPromptOverride: (key, value) =>
          set((s) => {
            if (!s.prompts) s.prompts = {};
            s.prompts[key] = value;
          }),

        clearPromptOverride: (key) =>
          set((s) => {
            if (s.prompts) {
              delete s.prompts[key];
            }
          }),

        setRollingWindowSeconds: (value) =>
          set((s) => {
            s.settings.rollingWindowSeconds = value;
          }),

        setAntiRepetitionBatchCount: (value) =>
          set((s) => {
            s.settings.antiRepetitionBatchCount = value;
          }),

        setFullSessionCharLimit: (value) =>
          set((s) => {
            s.settings.fullSessionCharLimit = value;
          }),
      })),
      {
        name: 'twinmind:apiKey',
        storage: createJSONStorage(ssrSafeStorage),
        partialize: (state) => ({ apiKey: state.apiKey }),
      },
    ),
    {
      name: 'twinmind:settings',
      storage: createJSONStorage(ssrSafeStorage),
      partialize: (state) => ({
        settings: state.settings,
        prompts: state.prompts,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
