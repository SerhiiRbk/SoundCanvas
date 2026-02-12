/**
 * Loop Engine — Record, play, clear, overdub note events.
 *
 * Stores NoteEvent sequences with timing relative to loop start.
 */

import type { NoteEvent } from '../composer/composerTypes';

export type LoopState = 'idle' | 'recording' | 'playing' | 'overdubbing';

export class LoopEngine {
  private events: NoteEvent[] = [];
  private state: LoopState = 'idle';
  private startTime: number = 0;
  private loopDuration: number = 0; // in seconds
  private playbackTimer: number | null = null;
  private onNoteCallback: ((event: NoteEvent) => void) | null = null;
  private currentPlaybackIndex: number = 0;
  private playbackStartTime: number = 0;

  /**
   * Set callback for note playback.
   */
  onNote(callback: (event: NoteEvent) => void): void {
    this.onNoteCallback = callback;
  }

  /**
   * Start recording.
   */
  record(): void {
    this.events = [];
    this.state = 'recording';
    this.startTime = performance.now() / 1000;
    this.loopDuration = 0;
  }

  /**
   * Add a note during recording or overdubbing.
   */
  addNote(pitch: number, velocity: number, duration: number): void {
    if (this.state !== 'recording' && this.state !== 'overdubbing') return;

    const now = performance.now() / 1000;
    let time: number;

    if (this.state === 'overdubbing') {
      // Time relative to loop start, wrapped
      time = (now - this.playbackStartTime) % this.loopDuration;
    } else {
      time = now - this.startTime;
    }

    this.events.push({ time, duration, pitch, velocity });
  }

  /**
   * Stop recording and compute loop duration.
   */
  stopRecording(): void {
    if (this.state === 'recording') {
      this.loopDuration = performance.now() / 1000 - this.startTime;
      this.state = 'idle';
      // Sort events by time
      this.events.sort((a, b) => a.time - b.time);
    }
  }

  /**
   * Start playback loop.
   */
  play(): void {
    if (this.events.length === 0 || this.loopDuration === 0) return;

    this.state = 'playing';
    this.currentPlaybackIndex = 0;
    this.playbackStartTime = performance.now() / 1000;
    this.scheduleNextNote();
  }

  /**
   * Start overdub mode (play + record simultaneously).
   */
  overdub(): void {
    if (this.events.length === 0 || this.loopDuration === 0) return;

    this.state = 'overdubbing';
    this.currentPlaybackIndex = 0;
    this.playbackStartTime = performance.now() / 1000;
    this.scheduleNextNote();
  }

  /**
   * Stop playback/overdub.
   */
  stop(): void {
    if (this.playbackTimer !== null) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
    if (this.state === 'overdubbing') {
      this.events.sort((a, b) => a.time - b.time);
    }
    this.state = 'idle';
  }

  /**
   * Clear all recorded events.
   */
  clear(): void {
    this.stop();
    this.events = [];
    this.loopDuration = 0;
    this.state = 'idle';
  }

  /**
   * Get current state.
   */
  getState(): LoopState {
    return this.state;
  }

  /**
   * Get recorded events.
   */
  getEvents(): NoteEvent[] {
    return [...this.events];
  }

  /**
   * Get loop duration.
   */
  getDuration(): number {
    return this.loopDuration;
  }

  /**
   * Schedule the next note in the playback loop.
   */
  private scheduleNextNote(): void {
    if (this.state !== 'playing' && this.state !== 'overdubbing') return;
    if (this.events.length === 0) return;

    const now = performance.now() / 1000;
    const elapsed = (now - this.playbackStartTime) % this.loopDuration;

    // Find the next event after current elapsed time
    let nextIdx = -1;
    let minWait = Infinity;

    for (let i = 0; i < this.events.length; i++) {
      let wait = this.events[i].time - elapsed;
      if (wait < 0) wait += this.loopDuration;
      if (wait < minWait) {
        minWait = wait;
        nextIdx = i;
      }
    }

    if (nextIdx === -1) return;

    // Minimum 5ms to avoid tight loops
    const waitMs = Math.max(5, minWait * 1000);

    this.playbackTimer = window.setTimeout(() => {
      if (this.state !== 'playing' && this.state !== 'overdubbing') return;

      const event = this.events[nextIdx];
      if (this.onNoteCallback) {
        this.onNoteCallback(event);
      }

      this.currentPlaybackIndex = (nextIdx + 1) % this.events.length;
      this.scheduleNextNote();
    }, waitMs);
  }
}
