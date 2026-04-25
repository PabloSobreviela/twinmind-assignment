/**
 * lib/api/whisper.ts
 *
 * Whisper Large V3 transcription via Groq. Round-4c hardening for the
 * documented silent-audio hallucination behavior:
 *   1. prompt parameter biases toward meeting-transcript content
 *   2. temperature 0 removes sampling randomness
 *   3. exact-match denylist for the most egregious known patterns
 *
 * The denylist intentionally uses exact match (not substring) so that
 * a real meeting utterance of "Thank you" is not filtered. A real chunk
 * is almost never JUST "Thank you." -- these patterns appear when the
 * audio was effectively silent.
 *
 * ROUND-4d EDIT
 * Cyrillic, accented Portuguese, and Chinese-punctuation entries are
 * written as Unicode escape sequences so the source file is pure ASCII.
 * Round 4c literals were corrupted in transit (Cyrillic became mojibake)
 * -- escapes prevent any future encoding-related drift.
 *
 * ROUND-5b-ii EDIT
 * Adds Japanese silent-audio hallucinations observed in real use:
 * "Thank you for watching" / "Thanks for watching" in polite + casual
 * forms. All Unicode-escaped per the round-4d transmission lesson.
 * Diagnostic console.log calls removed; only error-path console.error
 * preserved.
 */

import OpenAI from 'openai';
import { GROQ_BASE_URL } from './groq';

export class WhisperError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'WhisperError';
  }
}

const HALLUCINATION_PATTERNS = new Set([
  // English
  'Thank you.',
  'Thank you so much.',
  'Thanks for watching.',
  'Thank you for watching.',
  'Hello.',
  'Hello, hello.',
  'Hello, hello, hello.',
  'Hi.',
  'Bye.',
  'Bye-bye.',
  'Subscribe.',
  'Please subscribe.',
  // Multilingual hallucinations Whisper produces on silent audio.
  // Non-ASCII characters use \u escapes so the source file is pure ASCII
  // and never re-corrupts in transit (round-4c lesson).
  'Tchau.',
  'E a\u00ed',
  // Russian: "To be continued..." (with ellipsis char + with three dots)
  '\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0435\u043d\u0438\u0435 \u0441\u043b\u0435\u0434\u0443\u0435\u0442\u2026',
  '\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0435\u043d\u0438\u0435 \u0441\u043b\u0435\u0434\u0443\u0435\u0442...',
  // Japanese (round 5b-ii): "Thank you for watching" / "Thanks for watching"
  // \u3054\u8996\u8074\u3042\u308a\u304c\u3068\u3046\u3054\u3056\u3044\u307e\u3057\u305f = goshichou arigatou gozaimashita
  '\u3054\u8996\u8074\u3042\u308a\u304c\u3068\u3046\u3054\u3056\u3044\u307e\u3057\u305f',
  '\u3054\u8996\u8074\u3042\u308a\u304c\u3068\u3046\u3054\u3056\u3044\u307e\u3059',
  // Japanese: "Thank you" past + present polite forms
  '\u3042\u308a\u304c\u3068\u3046\u3054\u3056\u3044\u307e\u3057\u305f',
  '\u3042\u308a\u304c\u3068\u3046\u3054\u3056\u3044\u307e\u3059',
  // Punctuation-only / placeholder
  '...',
  '\u3002',
]);

function isLikelyHallucination(text: string): boolean {
  return HALLUCINATION_PATTERNS.has(text.trim());
}

export async function transcribeAudioChunk(apiKey: string, blob: Blob): Promise<string> {
  const client = new OpenAI({
    apiKey,
    baseURL: GROQ_BASE_URL,
    dangerouslyAllowBrowser: true,
  });
  const file = new File([blob], 'chunk.webm', { type: 'audio/webm' });

  try {
    const result = await client.audio.transcriptions.create({
      file,
      model: 'whisper-large-v3',
      response_format: 'text',
      prompt: 'This is a meeting transcript.',
      temperature: 0,
    });
    const raw = typeof result === 'string' ? result : (result as { text: string }).text;
    const text = raw.trim();

    if (isLikelyHallucination(text)) return '';
    return text;
  } catch (err) {
    console.error('Whisper failed:', err);
    throw new WhisperError('Whisper transcription failed.', err);
  }
}
