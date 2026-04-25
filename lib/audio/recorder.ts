/**
 * lib/audio/recorder.ts
 *
 * MediaRecorder wrapper that produces self-contained WebM chunks at a
 * configurable cadence. Per round-4 plan: stop+restart pattern (each
 * chunk carries its own EBML header so Whisper can decode in isolation).
 *
 * ROTATION SCHEDULING
 * setTimeout-chained-to-self, NOT setInterval. setInterval fires
 * regardless of whether the previous tick completed; if a rotation
 * runs long, instances stack. Self-chaining setTimeout self-throttles.
 *
 * STOP BEHAVIOR
 * stop() clears the rotation timer (no NEW chunks) and stops the active
 * MediaRecorder, which fires its onstop and emits the in-flight chunk
 * one last time. The in-flight chunk's downstream processing (Whisper +
 * batch) continues in the orchestration hook — recorder doesn't gate it.
 *
 * SSR
 * Class definition does not touch MediaRecorder / navigator at import
 * time. Browser APIs are touched only inside start() / instance methods.
 * Safe to import from a server component, instantiate only on the client.
 */

export type AudioChunk = {
  blob: Blob;
  startTs: number; // seconds since session start (chunk recording start)
  endTs: number;   // seconds since session start (chunk recording end)
};

export type ChunkedRecorderOptions = {
  rotationSeconds: number;
  onChunk: (chunk: AudioChunk) => void;
  onError?: (err: Error) => void;
};

export class ChunkedRecorder {
  private mediaStream: MediaStream | null = null;
  private currentRecorder: MediaRecorder | null = null;
  private rotationTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionStartMs = 0;
  private isStopping = false;

  constructor(private opts: ChunkedRecorderOptions) {}

  async start(): Promise<void> {
    if (this.mediaStream) throw new Error('ChunkedRecorder already running');
    this.isStopping = false;
    this.sessionStartMs = performance.now();
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.startNewRecorder();
    this.scheduleNextRotation();
  }

  /** Force rotation now: stop current recorder (emits chunk), start fresh, reset timer. */
  rotateNow(): void {
    if (!this.mediaStream || this.isStopping) return;
    if (this.rotationTimer) {
      clearTimeout(this.rotationTimer);
      this.rotationTimer = null;
    }
    this.rotateRecorder();
    this.scheduleNextRotation();
  }

  /**
   * Stop recording. The currently-recording chunk fires its onChunk
   * callback one last time (and orchestration completes its Whisper +
   * batch downstream). No new chunks captured after this returns.
   */
  stop(): void {
    this.isStopping = true;
    if (this.rotationTimer) {
      clearTimeout(this.rotationTimer);
      this.rotationTimer = null;
    }
    if (this.currentRecorder && this.currentRecorder.state !== 'inactive') {
      this.currentRecorder.stop(); // fires onstop -> emits final chunk
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
  }

  isRunning(): boolean {
    return this.mediaStream !== null && !this.isStopping;
  }

  private scheduleNextRotation(): void {
    this.rotationTimer = setTimeout(() => {
      if (this.isStopping) return;
      this.rotateRecorder();
      this.scheduleNextRotation();
    }, this.opts.rotationSeconds * 1000);
  }

  private startNewRecorder(): void {
    if (!this.mediaStream) return;
    const chunkStartMs = performance.now(); // captured by closure for this recorder's onstop
    const recorder = new MediaRecorder(this.mediaStream, { mimeType: 'audio/webm' });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      if (blob.size === 0) return;
      const startTs = (chunkStartMs - this.sessionStartMs) / 1000;
      const endTs = (performance.now() - this.sessionStartMs) / 1000;
      this.opts.onChunk({ blob, startTs, endTs });
    };
    recorder.onerror = () => {
      this.opts.onError?.(new Error('MediaRecorder error'));
    };
    recorder.start();
    this.currentRecorder = recorder;
  }

  private rotateRecorder(): void {
    const old = this.currentRecorder;
    if (old && old.state !== 'inactive') old.stop(); // fires onstop -> emits chunk
    if (!this.isStopping) this.startNewRecorder();
  }
}
