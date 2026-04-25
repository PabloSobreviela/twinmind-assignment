/**
 * lib/state/store.ts
 *
 * Single Zustand store owning the full app state. Slices:
 *   - PipelineState surface (apiKey, transcript, entityPool, batches,
 *     chatHistory, settings, prompts) — consumed by runBatch / runChat.
 *   - chatTurns: audit trail for the export. Co-exists with chatHistory;
 *     chatHistory carries raw-input ChatMessage form for the API,
 *     chatTurns carries timing + source metadata for the replay harness.
 *   - sessionMeta: populated on first record-button-click of the session.
 *   - UI flags: recording, batchInFlight, chatStreamInFlight, currentChatStream,
 *     settingsOpen.
 *   - hydrated: true once Zustand persist middleware has finished rehydrating
 *     from localStorage. Components depending on persisted state should gate
 *     behavior on this flag to avoid first-paint flicker.
 *
 * PERSISTENCE
 * Only `apiKey` is persisted, under the localStorage key `twinmind:apiKey`.
 * Everything else is session-scoped (clears on reload). Round 5 will add
 * `twinmind:settings` as a separate persist namespace for prompt-edit
 * fields and window settings — keeping apiKey isolated makes future
 * "export settings" features trivially exclude it.
 *
 * SSR SAFETY
 * createJSONStorage runs at module init time. In Next.js App Router, the
 * server-side render path imports client components and would hit
 * `localStorage is undefined` without a guard. We pass a no-op storage
 * stub on the server; rehydration runs only on the client.
 *
 * ACTION STUBS (round 4b replaces these)
 * startRecording, stopRecording, rotateBatchNow, sendChat — wired in 4b.
 * Stubs use console.warn rather than throw so accidental clicks before
 * 4b ships fail visibly in DevTools without crashing the click handler.
 *
 * resetSession is fully implemented: clears all session-scoped state but
 * preserves apiKey, settings, and prompts.
 *
 * FOR ROUND 4b — ATOMIC CHAT TURN APPEND
 * chatHistory and chatTurns must update in lockstep on every chat turn.
 * The 4b useSession hook should expose a single finalizer (something like
 * commitChatTurn) that takes the streamed assistant content + timings +
 * source data and writes BOTH array slices in a single set() call.
 * Two separate set() calls can be interleaved by an exception, leaving
 * the export inconsistent with what the user actually saw.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type {
  PipelineState,
  ChatInput,
} from '@/lib/api/pipeline';
import type { ChatMessage } from '@/lib/api/groq';
import type {
  TranscriptChunk,
  SessionEntity,
  Batch,
} from '@/lib/format/promptInputs';
import type { ChatTurn, SessionMeta } from '@/lib/types';

const DEFAULT_SETTINGS: PipelineState['settings'] = {
  rollingWindowSeconds: 180,
  antiRepetitionBatchCount: 2,
  fullSessionCharLimit: 50_000,
};

type StoreState = {
  // PipelineState surface
  apiKey: string;
  transcript: TranscriptChunk[];
  entityPool: SessionEntity[];
  batches: Batch[];
  chatHistory: ChatMessage[];
  settings: PipelineState['settings'];
  prompts?: PipelineState['prompts'];

  // Audit trail for export
  chatTurns: ChatTurn[];

  // Session metadata, populated on first record-button-click
  sessionMeta: SessionMeta | null;

  // UI flags
  recording: boolean;
  batchInFlight: boolean;
  chatStreamInFlight: boolean;
  currentChatStream: string;
  settingsOpen: boolean;

  // Hydration completion flag
  hydrated: boolean;
};

type StoreActions = {
  setApiKey: (key: string) => void;
  setSettingsOpen: (open: boolean) => void;

  // Round 4b implementations replace these stubs.
  startRecording: () => void;
  stopRecording: () => void;
  rotateBatchNow: () => void;
  sendChat: (input: ChatInput & { sourceCardId?: string }) => void;

  // Fully implemented this round.
  resetSession: () => void;
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
    immer((set) => ({
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
      hydrated: false,

      setApiKey: (key) =>
        set((s) => {
          s.apiKey = key;
        }),

      setSettingsOpen: (open) =>
        set((s) => {
          s.settingsOpen = open;
        }),

      startRecording: () => {
        // Wired in round 4b.
        console.warn('startRecording: not yet wired (round 4b)');
      },
      stopRecording: () => {
        // Wired in round 4b.
        console.warn('stopRecording: not yet wired (round 4b)');
      },
      rotateBatchNow: () => {
        // Wired in round 4b.
        console.warn('rotateBatchNow: not yet wired (round 4b)');
      },
      sendChat: () => {
        // Wired in round 4b.
        console.warn('sendChat: not yet wired (round 4b)');
      },

      resetSession: () => {
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
          // apiKey, settings, prompts intentionally preserved.
        });
      },
    })),
    {
      name: 'twinmind:apiKey',
      storage: createJSONStorage(ssrSafeStorage),
      partialize: (state) => ({ apiKey: state.apiKey }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
