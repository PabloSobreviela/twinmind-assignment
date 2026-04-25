'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useStore } from '@/lib/state/store';
import type { ChatInput } from '@/lib/api/pipeline';
import type { ChatTurn } from '@/lib/types';

type Props = {
  onSend: (input: ChatInput, sourceCardId?: string) => void;
};

export function ChatColumn({ onSend }: Props) {
  const chatTurns = useStore((s) => s.chatTurns);
  const currentChatStream = useStore((s) => s.currentChatStream);
  const chatStreamInFlight = useStore((s) => s.chatStreamInFlight);
  const [draft, setDraft] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [chatTurns.length, currentChatStream]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || chatStreamInFlight) return;
    onSend({ kind: 'user_question', userMessage: trimmed });
    setDraft('');
  };

  return (
    <div className="bg-panel border border-border rounded-lg flex flex-col overflow-hidden min-h-0">
      <div className="px-4 py-2 border-b border-border text-xs uppercase tracking-wider text-muted flex justify-between">
        <span>Chat</span>
        <span>session-only</span>
      </div>
      <div ref={bodyRef} className="flex-1 overflow-y-auto p-4">
        {chatTurns.length === 0 && !currentChatStream ? (
          <div className="text-muted text-sm text-center pt-8">
            <span className="text-accent">●</span> Click a suggestion or type a question below.
          </div>
        ) : (
          <>
            {chatTurns.map((turn, i) => (
              <Bubble key={i} turn={turn} />
            ))}
            {chatStreamInFlight && (
              <div className="mb-4">
                <div className="text-xs uppercase tracking-wider text-muted mb-1.5">Assistant</div>
                <div className="bg-panel-2 border border-border rounded-lg p-3 text-sm leading-relaxed whitespace-pre-wrap text-text">
                  {currentChatStream || <span className="text-muted">Thinking…</span>}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 p-3 border-t border-border">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask anything…"
          disabled={chatStreamInFlight}
          className="flex-1 bg-panel-2 border border-border rounded px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent transition-colors disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!draft.trim() || chatStreamInFlight}
          className="bg-accent text-white border-none rounded px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function displayContent(turn: ChatTurn): string {
  if (turn.role === 'user' && turn.source === 'card_click') {
    const match = turn.content.match(/^Expanding on this suggestion:\n([^\n]+)/);
    return match ? match[1] : turn.content;
  }
  return turn.content;
}

function Bubble({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === 'user';
  const label = isUser
    ? turn.source === 'card_click'
      ? 'You • From a suggestion'
      : 'You'
    : 'Assistant';
  return (
    <div className="mb-4">
      <div className="text-xs uppercase tracking-wider text-muted mb-1.5">{label}</div>
      <div
        className={
          'border rounded-lg p-3 text-sm leading-relaxed whitespace-pre-wrap text-text ' +
          (isUser ? 'bg-accent/8 border-accent/30' : 'bg-panel-2 border-border')
        }
      >
        {displayContent(turn)}
      </div>
    </div>
  );
}
