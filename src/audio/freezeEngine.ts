/**
 * FreezeEngine — Freeze + Granular Mode.
 *
 * Captures a 2-second audio buffer and plays it back as a granular texture.
 * Visual: triggers fog particles, slowed trail decay.
 */

import * as Tone from 'tone';

export type FreezeState = 'idle' | 'recording' | 'frozen';

export class FreezeEngine {
  private recorder: Tone.Recorder | null = null;
  private grainPlayer: Tone.GrainPlayer | null = null;
  private grainGain: Tone.Gain | null = null;
  private destination: Tone.InputNode | null = null;
  private state: FreezeState = 'idle';
  private frozenUrl: string | null = null;

  /** Call once after Tone.start() with the reverb or masterGain node to route into */
  init(destination: Tone.InputNode): void {
    this.destination = destination;
    this.recorder = new Tone.Recorder();
    this.grainGain = new Tone.Gain(0);
    this.grainGain.connect(destination as Tone.ToneAudioNode);
  }

  /** Start recording a 2-second snippet from master output */
  async freeze(source: Tone.ToneAudioNode): Promise<void> {
    if (this.state !== 'idle' || !this.recorder || !this.grainGain) return;

    this.state = 'recording';
    source.connect(this.recorder);
    this.recorder.start();

    // Record for 2 seconds
    await new Promise((r) => setTimeout(r, 2000));
    const blob = await this.recorder.stop();
    source.disconnect(this.recorder);

    // Create object URL for the recorded blob
    if (this.frozenUrl) URL.revokeObjectURL(this.frozenUrl);
    this.frozenUrl = URL.createObjectURL(blob);

    // Create grain player
    this.disposeGrainPlayer();
    this.grainPlayer = new Tone.GrainPlayer({
      url: this.frozenUrl,
      loop: true,
      grainSize: 0.1,
      overlap: 0.05,
      playbackRate: 1,
    });
    this.grainPlayer.connect(this.grainGain);

    // Wait for buffer to load
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (this.grainPlayer?.loaded) {
          clearInterval(check);
          resolve();
        }
      }, 50);
      // Timeout after 3s
      setTimeout(() => { clearInterval(check); resolve(); }, 3000);
    });

    this.grainPlayer.start();
    this.grainGain.gain.rampTo(0.8, 0.3);
    this.state = 'frozen';
  }

  /** Unfreeze: crossfade back to live audio */
  unfreeze(): void {
    if (this.state !== 'frozen') return;
    this.grainGain?.gain.rampTo(0, 0.5);
    setTimeout(() => {
      this.disposeGrainPlayer();
      this.state = 'idle';
    }, 600);
  }

  /** Toggle freeze/unfreeze */
  toggle(source: Tone.ToneAudioNode): void {
    if (this.state === 'idle') {
      this.freeze(source);
    } else if (this.state === 'frozen') {
      this.unfreeze();
    }
  }

  getState(): FreezeState { return this.state; }
  isFrozen(): boolean { return this.state === 'frozen'; }

  /** Modulate grain parameters for texture variation */
  modulate(time: number): void {
    if (!this.grainPlayer || this.state !== 'frozen') return;
    const rate = 0.8 + Math.sin(time * 0.3) * 0.4;
    this.grainPlayer.playbackRate = Math.max(0.5, Math.min(1.5, rate));
  }

  private disposeGrainPlayer(): void {
    if (this.grainPlayer) {
      try { this.grainPlayer.stop(); } catch { /* */ }
      this.grainPlayer.disconnect();
      this.grainPlayer.dispose();
      this.grainPlayer = null;
    }
  }

  dispose(): void {
    this.disposeGrainPlayer();
    this.grainGain?.dispose();
    this.recorder?.dispose();
    if (this.frozenUrl) URL.revokeObjectURL(this.frozenUrl);
  }
}
