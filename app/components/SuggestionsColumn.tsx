'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useStore } from '@/lib/state/store';
import type { Card } from '@/lib/api/pipeline';

type Props = {
  onReload: () => void;
  onCardClick: (card: Card) => void;
};

const TAG_CLASS: Record<Card['type'], string> = {
  question: 'bg-question/10 text-question',
  talking: 'bg-talking/10 text-talking',
  answer: 'bg-answer/15 text-answer-text',
  fact: 'bg-fact/8 text-fact',
};

const TAG_LABEL: Record<Card['type'], string> = {
  question: 'Question to ask',
  talking: 'Talking point',
  answer: 'Answer',
  fact: 'Fact-check',
};

export function SuggestionsColumn({ onReload, onCardClick }: Props) {
  const batches = useStore((s) => s.batches);
  const recording = useStore((s) => s.recording);
  const batchInFlight = useStore((s) => s.batchInFlight);
  const chatStreamInFlight = useStore((s) => s.chatStreamInFlight);
  const rateLimitedUntil = useStore((s) => s.rateLimitedUntil);
  const authError = useStore((s) => s.authError);
  const reduceMotion = useReducedMotion();

  const isRateLimited = rateLimitedUntil !== null && rateLimitedUntil > Date.now();
  const banner: { tone: 'danger' | 'warn'; text: string } | null = authError
    ? { tone: 'danger', text: 'Groq API key invalid. Check Settings.' }
    : isRateLimited
      ? { tone: 'warn', text: 'Groq rate limit reached. Suggestions paused for ~60s.' }
      : null;

  const reloadDisabled = !recording || batchInFlight || banner !== null;
  const cardsDisabled = chatStreamInFlight || banner !== null;
  const ordered = [...batches].reverse(); // newest first

  return (
    <div className="bg-panel border border-border rounded-lg flex flex-col overflow-hidden min-h-0">
      <div className="px-4 py-2 border-b border-border text-xs uppercase tracking-wider text-muted flex justify-between">
        <span>Live Suggestions</span>
        <span>
          {batches.length} batch{batches.length === 1 ? '' : 'es'}
        </span>
      </div>
      {banner && (
        <div
          className={
            'px-4 py-2 text-xs border-b border-border ' +
            (banner.tone === 'danger'
              ? 'bg-danger/10 text-danger'
              : 'bg-warn/10 text-warn')
          }
        >
          {banner.text}
        </div>
      )}
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <button
          onClick={onReload}
          disabled={reloadDisabled}
          className="bg-panel-2 border border-border rounded text-xs px-3 py-1.5 text-text hover:border-accent transition-colors disabled:opacity-40 disabled:hover:border-border"
        >
<span className="text-accent-2">↻</span> Reload suggestions
        </button>
        <span className="text-xs text-muted">
          {batchInFlight ? 'Generating suggestions…' : ''}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {batches.length === 0 ? (
          <div className="text-muted text-sm text-center pt-8">
            <span className="text-accent">●</span> Suggestions appear here once recording starts.
          </div>
        ) : (
          ordered.map((batch, batchIdx) => (
            <motion.div
              key={batch.ts}
              initial={reduceMotion ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: batchIdx === 0 ? 1 : 0.55, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              {(batch.cards as Card[]).map((card) => (
                <button
                  key={card.id}
                  onClick={() => onCardClick(card)}
                  disabled={cardsDisabled}
                  className={
                    'w-full text-left border bg-panel-2 rounded-lg p-3 mb-2.5 transition-colors hover:border-accent disabled:cursor-not-allowed ' +
                    (batchIdx === 0 ? 'border-accent' : 'border-border')
                  }
                >
                  <span
                    className={`inline-block text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded mb-1.5 font-medium ${TAG_CLASS[card.type]}`}
                  >
                    {TAG_LABEL[card.type]}
                  </span>
                  <div className="text-sm leading-snug text-text">{card.preview}</div>
                </button>
              ))}
              <div className="text-xs text-muted text-center py-2 uppercase tracking-wider">
                — Batch {batches.length - batchIdx} —
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
