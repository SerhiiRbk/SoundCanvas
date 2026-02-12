/**
 * Recording Engine — captures canvas video + WebAudio into a downloadable file.
 *
 * Uses:
 *  - canvas.captureStream(30) for video
 *  - AudioContext.createMediaStreamDestination() for audio
 *  - MediaRecorder to mux both into WebM (VP9+Opus) or MP4 fallback
 */

export type RecordingState = 'idle' | 'countdown' | 'recording' | 'processing';

export class RecordingEngine {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private state: RecordingState = 'idle';
  private startedAt = 0;
  private maxDuration = 30; // seconds
  private autoStopTimer: ReturnType<typeof setTimeout> | null = null;
  private onStateChange: ((s: RecordingState) => void) | null = null;
  private onComplete: ((blob: Blob) => void) | null = null;

  /** Register a callback for state transitions */
  setOnStateChange(cb: (s: RecordingState) => void): void {
    this.onStateChange = cb;
  }

  /** Register a callback when recording finishes and blob is ready */
  setOnComplete(cb: (blob: Blob) => void): void {
    this.onComplete = cb;
  }

  setMaxDuration(seconds: number): void {
    this.maxDuration = Math.max(5, Math.min(120, seconds));
  }

  getMaxDuration(): number {
    return this.maxDuration;
  }

  getState(): RecordingState {
    return this.state;
  }

  /** Elapsed recording time in seconds */
  getDuration(): number {
    if (this.state !== 'recording' || this.startedAt === 0) return 0;
    return (performance.now() - this.startedAt) / 1000;
  }

  /**
   * Start recording. Combines canvas video stream with audio stream.
   * @param canvas  The canvas element to capture
   * @param audioDestination  A MediaStreamAudioDestinationNode connected to master gain
   */
  startRecording(canvas: HTMLCanvasElement, audioDestination: MediaStreamAudioDestinationNode): void {
    if (this.state === 'recording') return;

    // Get video stream from canvas at 30fps
    const canvasStream = canvas.captureStream(30);

    // Combine video + audio
    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioDestination.stream.getAudioTracks(),
    ]);

    // Pick supported MIME type
    const mimeType = this.pickMimeType();

    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(combined, {
      mimeType,
      videoBitsPerSecond: 6_000_000,
    });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: mimeType });
      this.chunks = [];
      this.setState('idle');
      this.onComplete?.(blob);
    };

    this.mediaRecorder.start(100); // 100ms chunks
    this.startedAt = performance.now();
    this.setState('recording');

    // Auto-stop after max duration
    this.autoStopTimer = setTimeout(() => {
      this.stopRecording();
    }, this.maxDuration * 1000);
  }

  stopRecording(): void {
    if (this.state !== 'recording' || !this.mediaRecorder) return;

    if (this.autoStopTimer) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }

    this.setState('processing');
    this.mediaRecorder.stop();
  }

  dispose(): void {
    if (this.autoStopTimer) clearTimeout(this.autoStopTimer);
    if (this.mediaRecorder && this.state === 'recording') {
      try { this.mediaRecorder.stop(); } catch { /* ignore */ }
    }
    this.mediaRecorder = null;
    this.chunks = [];
    this.state = 'idle';
  }

  private setState(s: RecordingState): void {
    this.state = s;
    this.onStateChange?.(s);
  }

  private pickMimeType(): string {
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ];
    for (const mime of candidates) {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
    return 'video/webm'; // fallback
  }
}

/* ── Sharing helpers ── */

/** Trigger a browser download of the blob */
export function downloadBlob(blob: Blob, filename?: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `gesture-symphony-${Date.now()}.webm`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Share via Web Share API (mobile). Returns true if shared. */
export async function shareBlob(blob: Blob): Promise<boolean> {
  const file = new File([blob], `gesture-symphony-${Date.now()}.webm`, {
    type: blob.type,
  });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        title: 'Made with Gesture Symphony',
        text: 'I turned my gestures into music',
        files: [file],
      });
      return true;
    } catch {
      return false; // user cancelled
    }
  }
  return false;
}

/** Check if Web Share API with files is available */
export function canShareFiles(): boolean {
  if (!navigator.canShare) return false;
  try {
    const dummy = new File([''], 'test.webm', { type: 'video/webm' });
    return navigator.canShare({ files: [dummy] });
  } catch {
    return false;
  }
}
