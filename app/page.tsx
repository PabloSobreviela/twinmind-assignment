'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/state/store';
import { SettingsModal } from './components/SettingsModal';
import { TranscriptColumn } from './components/TranscriptColumn';
import { SuggestionsColumn } from './components/SuggestionsColumn';
import { ChatColumn } from './components/ChatColumn';
import { useSession } from './hooks/useSession';

export default function Page() {
  const settingsOpen = useStore((s) => s.settingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const hasSessionData = useStore(
    (s) => s.batches.length > 0 || s.chatTurns.length > 0,
  );
  const session = useSession();

  return (
    <div className="h-screen flex flex-col bg-bg">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-panel">
        <h1 className="text-sm font-semibold tracking-wide text-text">
          TwinMind <span className="text-muted font-normal">— Live Suggestions</span>
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={session.exportSession}
            disabled={!hasSessionData}
            title={hasSessionData ? 'Export session JSON' : 'No session data yet.'}
            className="text-xs px-3 py-1.5 rounded border border-border text-muted hover:text-text hover:border-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-muted disabled:hover:border-border"
          >
            Export
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            aria-label="Settings"
            className="text-muted hover:text-accent px-2 py-1 text-lg leading-none transition-colors"
          >
            ⚙
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-3 gap-3 p-3 min-h-0">
        <TranscriptColumn onStart={session.startRecording} onStop={session.stopRecording} />
        <SuggestionsColumn
          onReload={session.rotateBatchNow}
          onCardClick={(card) =>
            session.sendChat(
              { kind: 'card_click', preview: card.preview, fullContext: card.full_context },
              card.id,
            )
          }
        />
        <ChatColumn onSend={session.sendChat} />
      </div>

      {settingsOpen && <SettingsModal />}
      <FirstRunGuard />
    </div>
  );
}

function FirstRunGuard() {
  const apiKey = useStore((s) => s.apiKey);
  const hydrated = useStore((s) => s.hydrated);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  useEffect(() => {
    if (hydrated && !apiKey) setSettingsOpen(true);
  }, [hydrated, apiKey, setSettingsOpen]);
  return null;
}
