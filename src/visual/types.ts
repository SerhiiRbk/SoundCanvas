/**
 * Visual Engine — Contracts and shared types.
 *
 * Defines the public interface for the visual pipeline, quality config,
 * frame input, note events, GPU capabilities, and the backend contract.
 */

// Re-export legacy types so existing imports keep working
export type { CursorState, AudioFrameData, Particle, Ripple, TrailPoint } from '../composer/composerTypes';
export type { VisualModeName } from '../composer/composerTypes';

/* ══════════════════════════════════════════════
   Quality
   ══════════════════════════════════════════════ */

export type QualityTier = 'high' | 'medium' | 'low' | 'ultralow';

/* ══════════════════════════════════════════════
   Visual Config — all tunables
   ══════════════════════════════════════════════ */

export type VisualMode = 'chill' | 'cinematic' | 'neon';

export interface VisualConfig {
  mode: VisualMode;

  /** User toggle — true = try WebGL2, false = Canvas2D */
  enableGpuEffects: boolean;
  /** Auto-degrade on FPS drops (default true) */
  autoDegrade: boolean;

  /* ── Performance ── */
  fpsTarget: number;              // 60
  fpsDegradeThreshold: number;    // 45
  fpsDegradeWindowSec: number;    // 3

  /* ── Particles ── */
  maxParticles: number;
  maxRipples: number;
  particleScale: number;

  /* ── Trail ── */
  trailResolutionScale: number;   // 1.0 high, 0.75 med, 0.5 low
  trailDecay: number;             // 0..1 per-frame multiplier
  trailSplatRadiusPx: number;

  /* ── Bloom ── */
  bloomEnabled: boolean;
  bloomThreshold: number;
  bloomStrength: number;
  blurIterations: number;
  blurRadius: number;

  /* ── Canvas2D-specific ── */
  radialBlurEnabled: boolean;
  radialBlurStrength: number;
  radialBlurPasses: number;
  flowerEnabled: boolean;
  particleWavesEnabled: boolean;

  /* ── Aesthetic ── */
  colorSaturation: number;
  colorLightness: number;
  glowIntensity: number;
}

/* ══════════════════════════════════════════════
   Per-frame input
   ══════════════════════════════════════════════ */

export interface VisualFrameInput {
  time: number;   // seconds since start
  dt: number;     // seconds since last frame
  width: number;
  height: number;
  mouse: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    speed: number;
  };
  audio: {
    rms: number;
    low: number;
    high: number;
  };
  melodicStability: number; // 0..1
  pitch: number;            // MIDI note
}

/* ══════════════════════════════════════════════
   Note event (triggers particle burst + ripple)
   ══════════════════════════════════════════════ */

export interface NoteVisualEvent {
  x: number;
  y: number;
  pitch: number;    // MIDI
  velocity: number; // 0..1
  time: number;     // seconds
}

/* ══════════════════════════════════════════════
   GPU Capability report
   ══════════════════════════════════════════════ */

export interface GpuCapabilities {
  webgl2: boolean;
  floatRT: boolean;
  linearFloat: boolean;
  maxTexSize: number;
  rendererInfo: string;
  score: number; // 0..100
}

/* ══════════════════════════════════════════════
   Backend interface (implemented by WebGL and Canvas engines)
   ══════════════════════════════════════════════ */

export interface IVisualBackend {
  resize(width: number, height: number): void;
  update(frame: VisualFrameInput): void;
  onNote(ev: NoteVisualEvent): void;
  render(): void;
  setConfig(cfg: Partial<VisualConfig>): void;
  getActiveParticleCount(): number;
  getTrailPointCount(): number;
  destroy(): void;
}
