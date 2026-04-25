'use client';

import { useState } from 'react';
import { useStore } from '@/lib/state/store';

export function SettingsModal() {
  const apiKey = useStore((s) => s.apiKey);
  const setApiKey = useStore((s) => s.setApiKey);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const [draft, setDraft] = useState(apiKey);

  function handleSave() {
    setApiKey(draft.trim());
    setSettingsOpen(false);
  }

  function handleCancel() {
    setSettingsOpen(false);
  }

  function handleClearKey() {
    setApiKey('');
    setDraft('');
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div className="bg-panel border border-border rounded-lg p-6 w-full max-w-md shadow-2xl mx-4">
        <h2 className="text-base font-semibold mb-1">Settings</h2>
        <p className="text-xs text-muted mb-5 leading-relaxed">
          Paste your Groq API key to start. The key is stored only in your browser&apos;s
          local storage and is sent only to Groq&apos;s API — never to any other server.
        </p>

        <label
          htmlFor="apikey"
          className="block text-xs uppercase tracking-wider text-muted mb-1.5"
        >
          Groq API key
        </label>
        <input
          id="apikey"
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="gsk_..."
          autoComplete="off"
          autoFocus
          className="w-full bg-panel-2 border border-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-accent"
        />
        <p className="text-xs text-muted mt-2">
          Get a key at{' '}
          <a
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            console.groq.com/keys
          </a>
          .
        </p>

        <div className="flex justify-between items-center gap-2 mt-6">
          <div>
            {apiKey && (
              <button
                onClick={handleClearKey}
                className="text-sm px-4 py-2 text-danger hover:opacity-80"
              >
                Clear key
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="text-sm px-4 py-2 text-muted hover:text-text"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!draft.trim()}
              className="text-sm px-4 py-2 rounded bg-accent text-bg font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
