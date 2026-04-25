/**
 * lib/state/sessionId.ts
 *
 * Session-ID generator extracted from useSession.ts so both the hook and
 * the store's beginRecording action can use a single source of truth.
 *
 * Prefers crypto.randomUUID when available (modern browsers and Node 19+);
 * falls back to base36 concatenation of Math.random and Date.now for
 * older Node runtimes. Session IDs are correlation tokens for the export
 * audit trail, not security tokens — fallback's lower entropy is fine.
 */

export function generateSessionId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2) + Date.now().toString(36)
  );
}
