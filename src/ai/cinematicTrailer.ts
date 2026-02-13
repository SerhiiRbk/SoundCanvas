/**
 * CinematicTrailer — "Make it Epic" autonomous sequence.
 *
 * 4-phase sequence: Intro (4 bars) → Buildup (4 bars) → Drop (2 bars) → Outro (2 bars)
 */

export type TrailerPhase = 'idle' | 'intro' | 'buildup' | 'drop' | 'outro';

export interface TrailerCallbacks {
  setBPM: (bpm: number) => void;
  setStability: (m: number) => void;
  setFilterCutoff: (v: number) => void;
  playChord: (pitches: number[], duration: number) => void;
  playBass: (pitch: number, duration: number) => void;
  playNote: (pitch: number, velocity: number, duration: number) => void;
  triggerShockwave: (x: number, y: number, intensity: number) => void;
  setBloomStrength: (v: number) => void;
  onPhaseChange: (phase: TrailerPhase) => void;
}

const BAR_DURATION_AT_BPM = (bpm: number) => (60 / bpm) * 4; // seconds per bar

export class CinematicTrailer {
  private phase: TrailerPhase = 'idle';
  private startTime = 0;
  private callbacks: TrailerCallbacks | null = null;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private barDuration = 2;

  getPhase(): TrailerPhase { return this.phase; }
  isActive(): boolean { return this.phase !== 'idle'; }

  start(callbacks: TrailerCallbacks, baseBPM = 100): void {
    if (this.isActive()) return;
    this.callbacks = callbacks;
    this.barDuration = BAR_DURATION_AT_BPM(baseBPM);
    this.startTime = performance.now() / 1000;
    this.phase = 'intro';
    callbacks.onPhaseChange('intro');

    // Initial setup
    callbacks.setBPM(baseBPM * 0.8);
    callbacks.setStability(0.9);
    callbacks.setFilterCutoff(0.3);

    this.tickInterval = setInterval(() => this.tick(), 200);
  }

  stop(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.tickInterval = null;
    this.phase = 'idle';
    this.callbacks?.onPhaseChange('idle');
  }

  private tick(): void {
    if (!this.callbacks) return;
    const elapsed = performance.now() / 1000 - this.startTime;
    const cb = this.callbacks;

    const introEnd = this.barDuration * 4;
    const buildupEnd = introEnd + this.barDuration * 4;
    const dropEnd = buildupEnd + this.barDuration * 2;
    const outroEnd = dropEnd + this.barDuration * 2;

    if (elapsed < introEnd) {
      // INTRO: soft pad, slow arpeggios, dim visuals
      if (this.phase !== 'intro') {
        this.phase = 'intro';
        cb.onPhaseChange('intro');
      }
      const p = elapsed / introEnd;
      cb.setFilterCutoff(0.2 + p * 0.2);
      cb.setBloomStrength(0.5);
      // Soft arpeggio every bar
      if (Math.random() < 0.05) {
        cb.playNote(60 + Math.floor(Math.random() * 12), 50, 0.5);
      }
    } else if (elapsed < buildupEnd) {
      // BUILDUP: rising filter, increasing BPM, growing particles
      if (this.phase !== 'buildup') {
        this.phase = 'buildup';
        cb.onPhaseChange('buildup');
      }
      const p = (elapsed - introEnd) / (buildupEnd - introEnd);
      cb.setBPM(80 + p * 60); // 80 → 140
      cb.setFilterCutoff(0.3 + p * 0.6);
      cb.setBloomStrength(0.5 + p * 1.0);
      cb.setStability(0.9 - p * 0.4);
      if (Math.random() < 0.08 + p * 0.1) {
        cb.playNote(60 + Math.floor(Math.random() * 24), 70 + p * 40, 0.15);
      }
    } else if (elapsed < dropEnd) {
      // DROP: full chord hit, bass, shockwave, bloom flash
      if (this.phase !== 'drop') {
        this.phase = 'drop';
        cb.onPhaseChange('drop');
        cb.setBPM(140);
        cb.setFilterCutoff(1.0);
        cb.setBloomStrength(2.0);
        cb.playChord([48, 55, 60, 64, 67], 2);
        cb.playBass(36, 2);
        cb.triggerShockwave(0.5, 0.5, 1.0); // normalized coords
      }
      cb.setStability(0.3);
    } else if (elapsed < outroEnd) {
      // OUTRO: settle to tonic, fade
      if (this.phase !== 'outro') {
        this.phase = 'outro';
        cb.onPhaseChange('outro');
      }
      const p = (elapsed - dropEnd) / (outroEnd - dropEnd);
      cb.setBPM(140 - p * 40);
      cb.setFilterCutoff(1.0 - p * 0.5);
      cb.setBloomStrength(2.0 - p * 1.2);
      cb.setStability(0.3 + p * 0.6);
    } else {
      this.stop();
    }
  }
}
