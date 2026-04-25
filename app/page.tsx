'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/state/store';
import { SettingsModal } from './components/SettingsModal';

export default function Page() {
  const settingsOpen = useStore((s) => s.settingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const hasSessionData = useStore(
    (s) => s.batches.length > 0 || s.chatTurns.length > 0,
  );

  const handleExport = () => {
    // Wired in round 4b.
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Topbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-panel">
        <h1 className="text-sm font-semibold tracking-wide">
          TwinMind — Live Suggestions
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={!hasSessionData}
            title={hasSessionData ? 'Export session JSON' : 'No session data yet.'}
            className="text-xs px-3 py-1.5 rounded border border-border text-muted hover:text-text hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-muted disabled:hover:border-border"
          >
            Export
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            aria-label="Settings"
            className="text-muted hover:text-text px-2 py-1 text-lg leading-none"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* Three-column shell */}
      <div className="flex-1 grid grid-cols-3 gap-3 p-3 min-h-0">
        <Column title="Mic & Transcript">
          <p className="text-muted text-sm text-center pt-8">
            Mic and transcript wiring lands in round 4b.
          </p>
        </Column>
        <Column title="Live Suggestions">
          <p className="text-muted text-sm text-center pt-8">
            Suggestion stream wiring lands in round 4b.
          </p>
        </Column>
        <Column title="Chat">
          <p className="text-muted text-sm text-center pt-8">
            Chat wiring lands in round 4b.
          </p>
        </Column>
      </div>

      {settingsOpen && <SettingsModal />}
      <FirstRunGuard />
    </div>
  );
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-panel border border-border rounded-lg flex flex-col overflow-hidden min-h-0">
      <div className="px-4 py-2 border-b border-border text-xs uppercase tracking-wider text-muted">
        {title}
      </div>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
    </div>
  );
}

/**
 * First-run UX: after Zustand has rehydrated from localStorage, if there's
 * no API key, open the settings modal automatically. The effect re-fires
 * when apiKey transitions to empty (e.g., via Clear key); on user dismiss,
 * the dependency tuple does not change so the modal stays closed until the
 * user re-opens via the gear icon.
 */
function FirstRunGuard() {
  const apiKey = useStore((s) => s.apiKey);
  const hydrated = useStore((s) => s.hydrated);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);

  useEffect(() => {
    if (hydrated && !apiKey) {
      setSettingsOpen(true);
    }
  }, [hydrated, apiKey, setSettingsOpen]);

  return null;
}
