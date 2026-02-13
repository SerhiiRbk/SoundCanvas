/**
 * CinematicDrop — dramatic audio+visual effect triggered on energy spike.
 *
 * Sequence: mute (0.3s) → silence (0.2s) → drop (bass hit + new chord + shockwave)
 */

import * as Tone from 'tone';

export type DropPhase = 'idle' | 'mute' | 'silence' | 'drop' | 'cooldown';

const MUTE_DURATION = 300;
const SILENCE_DURATION = 200;
const COOLDOWN_MS = 8000;

export interface DropCallbacks {
  onMute: () => void;
  onDrop: () => void;
  onFinish: () => void;
}

export class CinematicDrop {
  private phase: DropPhase = 'idle';
  private lastDropTime = 0;

  getPhase(): DropPhase { return this.phase; }

  /** Check if a drop can be triggered (respects cooldown) */
  canTrigger(): boolean {
    return this.phase === 'idle' && (performance.now() - this.lastDropTime > COOLDOWN_MS);
  }

  /**
   * Trigger the cinematic drop sequence.
   * @param masterGain  The master gain node to mute
   * @param filter      The main filter to sweep
   * @param callbacks   Phase callbacks for visual sync
   */
  trigger(
    masterGain: Tone.Gain,
    filter: Tone.Filter,
    callbacks: DropCallbacks,
  ): void {
    if (!this.canTrigger()) return;

    this.phase = 'mute';
    this.lastDropTime = performance.now();
    callbacks.onMute();

    // Phase 1: Mute — fade to near-silence, sweep filter down
    masterGain.gain.rampTo(0.05, MUTE_DURATION / 1000);
    filter.frequency.rampTo(150, MUTE_DURATION / 1000);

    setTimeout(() => {
      // Phase 2: Silence — hold
      this.phase = 'silence';

      setTimeout(() => {
        // Phase 3: Drop — restore + bass hit
        this.phase = 'drop';
        masterGain.gain.rampTo(1, 0.05);
        filter.frequency.rampTo(8000, 0.15);
        callbacks.onDrop();

        setTimeout(() => {
          // Cooldown
          this.phase = 'cooldown';
          callbacks.onFinish();

          setTimeout(() => {
            this.phase = 'idle';
          }, COOLDOWN_MS - MUTE_DURATION - SILENCE_DURATION - 500);
        }, 500);
      }, SILENCE_DURATION);
    }, MUTE_DURATION);
  }
}
