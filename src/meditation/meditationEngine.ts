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
   Constants — Eternity (chaotic flight) path
   ══════════════════════════════════════════════ */

/** Base cruising speed (px/s) */
const CHAOS_BASE_SPEED = 280;
/** Maximum speed (px/s) */
const CHAOS_MAX_SPEED = 650;
/** Drag coefficient — keeps things smooth */
const CHAOS_DRAG = 0.97;
/** How often random impulses fire (per second on average) */
const CHAOS_IMPULSE_RATE = 2.5;
/** Impulse strength range (px/s²) */
const CHAOS_IMPULSE_MIN = 300;
const CHAOS_IMPULSE_MAX = 900;
/** Smooth steering force toward random waypoints */
const CHAOS_STEER_FORCE = 180;
/** Edge repulsion margin (fraction of screen) */
const CHAOS_EDGE_MARGIN = 0.08;
/** Edge repulsion strength */
const CHAOS_EDGE_FORCE = 600;
/** Perlin-like wander: layered sine frequencies */
const CHAOS_WANDER_AMP = 120;

/* ══════════════════════════════════════════════ */

export class MeditationEngine {
  private time = 0;
  private prevX = 0;
  private prevY = 0;

  /** Phase offset so each session starts at a different point */
  private phaseOffset = 0;

  private _pathMode: PathMode = 'meditation';

  /* ── Chaotic eternity state ── */
  private chaosVx = 0;
  private chaosVy = 0;
  private chaosPosX = 0;
  private chaosPosY = 0;
  private chaosInitialized = false;
  private chaosWaypointX = 0;
  private chaosWaypointY = 0;
  private chaosWaypointTimer = 0;
  private chaosImpulseTimer = 0;
  /** Layered wander phases (for organic feel) */
  private chaosPhases: number[] = [];

  constructor() {
    this.phaseOffset = Math.random() * Math.PI * 2;
    this.chaosPhases = Array.from({ length: 6 }, () => Math.random() * Math.PI * 2);
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
    this.chaosInitialized = false;
    this.chaosPhases = Array.from({ length: 6 }, () => Math.random() * Math.PI * 2);
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
    const velocity = Math.min(rawVel, this._pathMode === 'eternity' ? 800 : 200);

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

  /* ── Eternity path (chaotic energetic flight) ── */

  private tickEternity(dt: number, canvasW: number, canvasH: number): { x: number; y: number } {
    const t = this.time;

    // Initialize position at center on first tick
    if (!this.chaosInitialized) {
      this.chaosPosX = canvasW * 0.5;
      this.chaosPosY = canvasH * 0.5;
      // Start with a random velocity
      const angle = Math.random() * Math.PI * 2;
      this.chaosVx = Math.cos(angle) * CHAOS_BASE_SPEED;
      this.chaosVy = Math.sin(angle) * CHAOS_BASE_SPEED;
      this.chaosWaypointX = Math.random() * canvasW;
      this.chaosWaypointY = Math.random() * canvasH;
      this.chaosWaypointTimer = 0;
      this.chaosImpulseTimer = 0;
      this.chaosInitialized = true;
    }

    // ── 1. Layered sinusoidal wander (organic, non-repeating) ──
    const ph = this.chaosPhases;
    const wanderX = CHAOS_WANDER_AMP * (
      Math.sin(t * 0.7 + ph[0]) * 0.5 +
      Math.sin(t * 1.3 + ph[1]) * 0.3 +
      Math.sin(t * 2.1 + ph[2]) * 0.2
    );
    const wanderY = CHAOS_WANDER_AMP * (
      Math.sin(t * 0.9 + ph[3]) * 0.5 +
      Math.sin(t * 1.7 + ph[4]) * 0.3 +
      Math.sin(t * 2.5 + ph[5]) * 0.2
    );

    // ── 2. Waypoint steering (smooth pull toward random targets) ──
    this.chaosWaypointTimer -= dt;
    if (this.chaosWaypointTimer <= 0) {
      // Pick a new waypoint anywhere on screen (with margin)
      const margin = Math.min(canvasW, canvasH) * 0.1;
      this.chaosWaypointX = margin + Math.random() * (canvasW - margin * 2);
      this.chaosWaypointY = margin + Math.random() * (canvasH - margin * 2);
      this.chaosWaypointTimer = 1.5 + Math.random() * 2.5;
    }

    const toWpX = this.chaosWaypointX - this.chaosPosX;
    const toWpY = this.chaosWaypointY - this.chaosPosY;
    const wpDist = Math.sqrt(toWpX * toWpX + toWpY * toWpY) || 1;
    const steerX = (toWpX / wpDist) * CHAOS_STEER_FORCE;
    const steerY = (toWpY / wpDist) * CHAOS_STEER_FORCE;

    // ── 3. Random impulses (sudden bursts of acceleration) ──
    this.chaosImpulseTimer -= dt;
    let impulseX = 0, impulseY = 0;
    if (this.chaosImpulseTimer <= 0) {
      this.chaosImpulseTimer = 0.2 + Math.random() * (1.0 / CHAOS_IMPULSE_RATE);
      const impAngle = Math.random() * Math.PI * 2;
      const impStr = CHAOS_IMPULSE_MIN + Math.random() * (CHAOS_IMPULSE_MAX - CHAOS_IMPULSE_MIN);
      impulseX = Math.cos(impAngle) * impStr;
      impulseY = Math.sin(impAngle) * impStr;
    }

    // ── 4. Edge repulsion (soft bounce off screen edges) ──
    let edgeX = 0, edgeY = 0;
    const marginX = canvasW * CHAOS_EDGE_MARGIN;
    const marginY = canvasH * CHAOS_EDGE_MARGIN;

    if (this.chaosPosX < marginX) {
      edgeX = CHAOS_EDGE_FORCE * (1 - this.chaosPosX / marginX);
    } else if (this.chaosPosX > canvasW - marginX) {
      edgeX = -CHAOS_EDGE_FORCE * (1 - (canvasW - this.chaosPosX) / marginX);
    }
    if (this.chaosPosY < marginY) {
      edgeY = CHAOS_EDGE_FORCE * (1 - this.chaosPosY / marginY);
    } else if (this.chaosPosY > canvasH - marginY) {
      edgeY = -CHAOS_EDGE_FORCE * (1 - (canvasH - this.chaosPosY) / marginY);
    }

    // ── 5. Integrate velocity ──
    this.chaosVx += (steerX + impulseX + edgeX + wanderX * 0.5) * dt;
    this.chaosVy += (steerY + impulseY + edgeY + wanderY * 0.5) * dt;

    // Drag
    this.chaosVx *= Math.pow(CHAOS_DRAG, dt * 60);
    this.chaosVy *= Math.pow(CHAOS_DRAG, dt * 60);

    // Speed clamp
    const speed = Math.sqrt(this.chaosVx * this.chaosVx + this.chaosVy * this.chaosVy);
    if (speed > CHAOS_MAX_SPEED) {
      const scale = CHAOS_MAX_SPEED / speed;
      this.chaosVx *= scale;
      this.chaosVy *= scale;
    }
    // Minimum speed — never let it stall
    if (speed < CHAOS_BASE_SPEED * 0.5) {
      const boost = (CHAOS_BASE_SPEED * 0.5) / Math.max(speed, 1);
      this.chaosVx *= boost;
      this.chaosVy *= boost;
    }

    // ── 6. Integrate position ──
    this.chaosPosX += this.chaosVx * dt;
    this.chaosPosY += this.chaosVy * dt;

    // Hard clamp (safety)
    this.chaosPosX = Math.max(2, Math.min(canvasW - 2, this.chaosPosX));
    this.chaosPosY = Math.max(2, Math.min(canvasH - 2, this.chaosPosY));

    return { x: this.chaosPosX, y: this.chaosPosY };
  }
}
