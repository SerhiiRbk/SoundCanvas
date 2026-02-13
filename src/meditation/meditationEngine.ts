/**
 * Meditation Engine — autonomous cursor movement along smooth, flowing paths.
 *
 * Supports two path modes:
 *
 *  **meditation** — superimposed sinusoidal harmonics (Lissajous-like)
 *    producing beautiful, non-repeating organic curves.
 *
 *  **eternity** — lemniscate of Bernoulli (∞ infinity symbol) with
 *    slow rotation, breath modulation, and micro-perturbations so the
 *    figure-eight feels alive rather than mechanical.
 */

/** Readonly snapshot of the meditation cursor state */
export interface MeditationCursor {
  x: number;
  y: number;
  velocity: number; // virtual velocity for visual feedback
}

export type PathMode = 'meditation' | 'eternity';

/* ══════════════════════════════════════════════
   Constants — Meditation mandala path (spirograph)
   ══════════════════════════════════════════════ */

/** Spirograph: hypotrochoid  x(t) = (R-r)·cos(t) + d·cos(t·(R-r)/r)
 *                            y(t) = (R-r)·sin(t) - d·sin(t·(R-r)/r)
 * R=8, r=3 → 8 cusps, closes after 3 full turns (t = 6π). */
const SPIRO_R = 8;
const SPIRO_r = 3;
const SPIRO_D_BASE = 3.0;
const SPIRO_D_DRIFT = 0.6;      // d oscillates ±0.6 for evolution
const SPIRO_D_DRIFT_SPEED = 0.018;

/** Angular speed — very slow so the mandala unfolds gracefully.
 *  Full figure (~6π) takes about 2.5 minutes. */
const SPIRO_SPEED = 0.13;

/** Mandala radius as fraction of min(canvasW, canvasH) / 2.
 *  0.82 fills nearly the entire screen. */
const SPIRO_SCALE = 0.82;

/** Gentle breathing modulation on the whole pattern */
const SPIRO_BREATH_SPEED = 0.035;
const SPIRO_BREATH_DEPTH = 0.04;

/* ══════════════════════════════════════════════
   Constants — Eternity (lemniscate) path
   ══════════════════════════════════════════════ */

/** Angular speed around the lemniscate (radians/sec) — slow & serene */
const LEMNI_SPEED = 0.25;

/** Horizontal amplitude as fraction of half-width */
const LEMNI_AMP_X = 0.38;
/** Vertical amplitude as fraction of half-height */
const LEMNI_AMP_Y = 0.20;

/** Slow rotation of the whole figure (radians/sec) */
const LEMNI_ROTATE_SPEED = 0.012;

/** Breath modulation on the lemniscate size */
const LEMNI_BREATH_SPEED = 0.035;
const LEMNI_BREATH_DEPTH = 0.10;

/** Micro-perturbation: subtle noise layered on the clean curve */
const LEMNI_PERTURB_AMP = 0.015;  // fraction of half-dim
const LEMNI_PERTURB_W1 = 0.37;
const LEMNI_PERTURB_W2 = 0.53;

/* ══════════════════════════════════════════════ */

export class MeditationEngine {
  private time = 0;
  private prevX = 0;
  private prevY = 0;

  /** Phase offset so each session starts at a different point */
  private phaseOffset = 0;

  private _pathMode: PathMode = 'meditation';

  constructor() {
    this.phaseOffset = Math.random() * Math.PI * 2;
  }

  /** Switch the path algorithm */
  setPathMode(mode: PathMode): void {
    this._pathMode = mode;
  }

  getPathMode(): PathMode {
    return this._pathMode;
  }

  /** Reset internal time (call when entering any autonomous mode) */
  reset(): void {
    this.time = 0;
    this.phaseOffset = Math.random() * Math.PI * 2;
  }

  /**
   * Advance time and compute the next cursor position.
   * Delegates to the active path algorithm.
   */
  tick(dt: number, canvasW: number, canvasH: number): MeditationCursor {
    this.time += dt;

    const pos = this._pathMode === 'eternity'
      ? this.tickEternity(dt, canvasW, canvasH)
      : this.tickMeditation(dt, canvasW, canvasH);

    // Virtual velocity
    const dx = pos.x - this.prevX;
    const dy = pos.y - this.prevY;
    const rawVel = Math.sqrt(dx * dx + dy * dy) / Math.max(dt, 0.001);
    const velocity = Math.min(rawVel, 200);

    this.prevX = pos.x;
    this.prevY = pos.y;

    return { x: pos.x, y: pos.y, velocity };
  }

  /* ── Meditation path (spirograph / hypotrochoid mandala) ── */

  private tickMeditation(_dt: number, canvasW: number, canvasH: number): { x: number; y: number } {
    const t = this.time;
    const theta = t * SPIRO_SPEED + this.phaseOffset;

    const cx = canvasW * 0.5;
    const cy = canvasH * 0.5;

    // Slowly evolving pen distance for pattern variety
    const d = SPIRO_D_BASE + Math.sin(t * SPIRO_D_DRIFT_SPEED) * SPIRO_D_DRIFT;

    // Hypotrochoid formula
    const Rr = SPIRO_R - SPIRO_r; // = 5
    const ratio = Rr / SPIRO_r;   // = 5/3

    const rawX = Rr * Math.cos(theta) + d * Math.cos(theta * ratio);
    const rawY = Rr * Math.sin(theta) - d * Math.sin(theta * ratio);

    // Normalize: maximum extent is (R-r) + d
    const maxExtent = Rr + SPIRO_D_BASE + SPIRO_D_DRIFT;
    const scale = Math.min(canvasW, canvasH) * 0.5 * SPIRO_SCALE / maxExtent;

    // Gentle breathing
    const breath = 1 + Math.sin(t * SPIRO_BREATH_SPEED) * SPIRO_BREATH_DEPTH;

    const x = cx + rawX * scale * breath;
    const y = cy + rawY * scale * breath;

    return { x, y };
  }

  /* ── Eternity path (lemniscate of Bernoulli / ∞) ── */

  private tickEternity(_dt: number, canvasW: number, canvasH: number): { x: number; y: number } {
    const t = this.time;

    const halfW = canvasW * 0.5;
    const halfH = canvasH * 0.5;

    // Parametric angle along the lemniscate
    const theta = t * LEMNI_SPEED;

    // Lemniscate of Bernoulli:
    //   x = cos(θ) / (1 + sin²(θ))
    //   y = sin(θ) · cos(θ) / (1 + sin²(θ))
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    const denom = 1 + sinT * sinT;

    const lx = cosT / denom;         // normalised −1..1
    const ly = (sinT * cosT) / denom; // normalised −0.5..0.5

    // Breath modulation
    const breath = 1 + Math.sin(t * LEMNI_BREATH_SPEED) * LEMNI_BREATH_DEPTH;

    // Amplitudes
    const ax = halfW * LEMNI_AMP_X * breath;
    const ay = halfH * LEMNI_AMP_Y * breath;

    // Slow rotation of the entire figure
    const rot = t * LEMNI_ROTATE_SPEED;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);

    const rx = lx * ax * cosR - ly * ay * sinR;
    const ry = lx * ax * sinR + ly * ay * cosR;

    // Micro-perturbation (so the path feels alive)
    const px = halfW * LEMNI_PERTURB_AMP * Math.sin(t * LEMNI_PERTURB_W1 + 1.3);
    const py = halfH * LEMNI_PERTURB_AMP * Math.sin(t * LEMNI_PERTURB_W2 + 2.7);

    const x = halfW + rx + px;
    const y = halfH + ry + py;

    return { x, y };
  }
}
