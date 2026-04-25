'use client';

import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useStore } from '@/lib/state/store';

type Props = { onStart: () => void; onStop: () => void };

export function TranscriptColumn({ onStart, onStop }: Props) {
  const recording = useStore((s) => s.recording);
  const transcript = useStore((s) => s.transcript);
  const bodyRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [transcript.length]);

  return (
    <div className="bg-panel border border-border rounded-lg flex flex-col overflow-hidden min-h-0">
      <div className="px-4 py-2 border-b border-border text-xs uppercase tracking-wider text-muted flex justify-between">
        <span>Mic & Transcript</span>
        <span className={recording ? 'text-accent' : ''}>
          {recording ? '● recording' : 'idle'}
        </span>
      </div>
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <motion.button
          onClick={recording ? onStop : onStart}
          aria-label={recording ? 'Stop recording' : 'Start recording'}
          animate={
            recording && !reduceMotion
              ? {
                  boxShadow: [
                    '0 0 0 0 rgba(96, 23, 2, 0.45)',
                    '0 0 0 12px rgba(96, 23, 2, 0)',
                  ],
                }
              : { boxShadow: '0 0 0 0 rgba(96, 23, 2, 0)' }
          }
          transition={
            recording && !reduceMotion
              ? { duration: 1.4, repeat: Infinity, ease: 'easeOut' }
              : { duration: 0.2 }
          }
          className={
            'w-11 h-11 rounded-full border-none flex items-center justify-center text-base transition-colors ' +
            (recording ? 'bg-accent text-white' : 'bg-accent-2 text-text')
          }
        >
          ●
        </motion.button>
        <div className="text-sm text-muted leading-snug">
          {recording ? 'Listening… transcript updates every 30s.' : 'Click mic to start.'}
        </div>
      </div>
      <div ref={bodyRef} className="flex-1 overflow-y-auto p-4">
        {transcript.length === 0 ? (
          <div className="text-muted text-sm text-center pt-8">
            <span className="text-accent">●</span> No transcript yet — start the mic.
          </div>
        ) : (
          transcript.map((c, i) => (
            <div key={i} className="text-sm leading-relaxed mb-3 text-text">
              <span className="text-muted text-xs mr-1.5 font-mono">{formatTs(c.ts)}</span>
              {c.chunk}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatTs(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}
