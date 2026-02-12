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
   Constants — Meditation path
   ══════════════════════════════════════════════ */

const W1 = 0.13;
const W2 = 0.21;
const W3 = 0.07;
const W4 = 0.11;
const W5 = 0.031;
const W6 = 0.047;

const DRIFT1 = 0.0091;
const DRIFT2 = 0.0073;

const AMP_PRIMARY = 0.32;
const AMP_SECONDARY = 0.14;
const AMP_TERTIARY = 0.06;

const BREATH_SPEED = 0.04;
const BREATH_DEPTH = 0.15;

const WANDER_SPEED = 0.02;
const WANDER_MAX = 0.12;

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
  private phase1 = 0;
  private phase2 = 0;
  private wanderX = 0;
  private wanderY = 0;
  private wanderDx = 0;
  private wanderDy = 0;
  private prevX = 0;
  private prevY = 0;

  private _pathMode: PathMode = 'meditation';

  constructor() {
    const a = Math.random() * Math.PI * 2;
    this.wanderDx = Math.cos(a) * WANDER_SPEED;
    this.wanderDy = Math.sin(a) * WANDER_SPEED;
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
    this.phase1 = Math.random() * Math.PI * 2;
    this.phase2 = Math.random() * Math.PI * 2;
    this.wanderX = 0;
    this.wanderY = 0;
    const a = Math.random() * Math.PI * 2;
    this.wanderDx = Math.cos(a) * WANDER_SPEED;
    this.wanderDy = Math.sin(a) * WANDER_SPEED;
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

  /* ── Meditation path (Lissajous harmonics) ── */

  private tickMeditation(_dt: number, canvasW: number, canvasH: number): { x: number; y: number } {
    const t = this.time;

    this.phase1 += DRIFT1 * _dt;
    this.phase2 += DRIFT2 * _dt;

    this.wanderX += this.wanderDx * _dt;
    this.wanderY += this.wanderDy * _dt;

    const halfW = canvasW * 0.5;
    const halfH = canvasH * 0.5;
    if (Math.abs(this.wanderX) > halfW * WANDER_MAX) {
      this.wanderDx = -this.wanderDx + (Math.random() - 0.5) * 0.005;
    }
    if (Math.abs(this.wanderY) > halfH * WANDER_MAX) {
      this.wanderDy = -this.wanderDy + (Math.random() - 0.5) * 0.005;
    }

    const breath = 1 + Math.sin(t * BREATH_SPEED) * BREATH_DEPTH;

    const cx = halfW + this.wanderX;
    const cy = halfH + this.wanderY;

    const ax1 = halfW * AMP_PRIMARY * breath;
    const ay1 = halfH * AMP_PRIMARY * breath;
    const ax2 = halfW * AMP_SECONDARY * breath;
    const ay2 = halfH * AMP_SECONDARY * breath;
    const ax3 = halfW * AMP_TERTIARY;
    const ay3 = halfH * AMP_TERTIARY;

    const x = cx
      + ax1 * Math.sin(W1 * t + this.phase1)
      + ax2 * Math.sin(W3 * t + this.phase1 * 0.7)
      + ax3 * Math.sin(W5 * t);

    const y = cy
      + ay1 * Math.sin(W2 * t + this.phase2)
      + ay2 * Math.sin(W4 * t + this.phase2 * 0.6)
      + ay3 * Math.cos(W6 * t);

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
