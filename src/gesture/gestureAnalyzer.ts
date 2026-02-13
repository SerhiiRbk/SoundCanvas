/**
 * Gesture Analyzer — Mouse movement → Raw musical parameters.
 *
 * X → p_raw (linear mapping over pitch range)
 * Y → octave bias
 * velocity → MIDI velocity
 * acceleration → filter cutoff
 * circular motion → arpeggio mode
 */

import { MIDI_MIN, MIDI_MAX } from '../config';
import type { GestureState, GestureFeatures, RawMapping } from '../composer/composerTypes';

// ─── Circular Motion Detection ───
const ANGULAR_HISTORY_SIZE = 30;
const ARPEGGIO_ANGULAR_THRESHOLD = 2.5; // radians/sec

// ─── Curvature Detection ───
const CURVATURE_HISTORY_SIZE = 20;
const CURVATURE_SMOOTH = 0.15; // EMA factor

// ─── Rhythm Detection ───
const RHYTHM_IOI_SIZE = 16; // inter-onset intervals

// ─── Energy Detection ───
const ENERGY_WINDOW_SEC = 1.0;

// ─── Chaos (Harmonic Gravity) ───
const CHAOS_INTERVAL_SIZE = 8;

export class GestureAnalyzer {
  private prevState: GestureState | null = null;
  private prevPrevState: GestureState | null = null;
  private angularHistory: number[] = [];
  private canvasWidth: number;
  private canvasHeight: number;

  /* ── Curvature ── */
  private posHistory: { x: number; y: number; t: number }[] = [];
  private smoothedCurvature = 0;

  /* ── Rhythm ── */
  private onsetTimes: number[] = [];
  private rhythmStrength = 0;
  private dominantPeriod = 0;

  /* ── Energy ── */
  private velocityHistory: { v: number; t: number }[] = [];
  private energyLevel = 0;
  private prevEnergyLevel = 0;
  private burstFrames = 0;

  /* ── Chaos (interval variance) ── */
  private intervalHistory: number[] = [];
  private chaosLevel = 0;

  constructor(canvasWidth: number, canvasHeight: number) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
  }

  /**
   * Process a mouse event into gesture state.
   */
  processMouseEvent(x: number, y: number, timestamp: number): GestureState {
    const prev = this.prevState;
    const dt = prev ? (timestamp - prev.timestamp) / 1000 : 0;

    let velocityX = 0;
    let velocityY = 0;
    let acceleration = 0;

    if (prev && dt > 0) {
      velocityX = (x - prev.x) / dt;
      velocityY = (y - prev.y) / dt;

      if (this.prevPrevState) {
        const prevVel = Math.hypot(prev.velocityX, prev.velocityY);
        const currentVel = Math.hypot(velocityX, velocityY);
        acceleration = (currentVel - prevVel) / dt;
      }
    }

    const velocity = Math.hypot(velocityX, velocityY);

    // Angular velocity for circular motion detection
    let angularVelocity = 0;
    if (prev && dt > 0) {
      const angle = Math.atan2(velocityY, velocityX);
      const prevAngle = Math.atan2(prev.velocityY, prev.velocityX);
      let dAngle = angle - prevAngle;
      // Normalize to [-π, π]
      while (dAngle > Math.PI) dAngle -= 2 * Math.PI;
      while (dAngle < -Math.PI) dAngle += 2 * Math.PI;
      angularVelocity = dAngle / dt;
    }

    const state: GestureState = {
      x,
      y,
      velocityX,
      velocityY,
      velocity,
      acceleration,
      angularVelocity,
      timestamp,
    };

    this.prevPrevState = this.prevState;
    this.prevState = state;
    this.angularHistory.push(Math.abs(angularVelocity));
    if (this.angularHistory.length > ANGULAR_HISTORY_SIZE) {
      this.angularHistory.shift();
    }

    // ── Curvature tracking ──
    this.posHistory.push({ x, y, t: timestamp });
    if (this.posHistory.length > CURVATURE_HISTORY_SIZE) this.posHistory.shift();
    this.updateCurvature();

    // ── Energy tracking ──
    this.velocityHistory.push({ v: velocity, t: timestamp });
    const cutoff = timestamp - ENERGY_WINDOW_SEC * 1000;
    while (this.velocityHistory.length > 0 && this.velocityHistory[0].t < cutoff) {
      this.velocityHistory.shift();
    }
    this.prevEnergyLevel = this.energyLevel;
    this.energyLevel = this.velocityHistory.length > 0
      ? this.velocityHistory.reduce((s, e) => s + e.v, 0) / this.velocityHistory.length / 1500
      : 0;
    this.energyLevel = Math.min(1, this.energyLevel);

    // Burst detection
    if (this.energyLevel > this.prevEnergyLevel * 2 && this.energyLevel > 0.3) {
      this.burstFrames++;
    } else {
      this.burstFrames = Math.max(0, this.burstFrames - 1);
    }

    return state;
  }

  /* ── Curvature computation ── */
  private updateCurvature(): void {
    const h = this.posHistory;
    if (h.length < 3) { this.smoothedCurvature = 0; return; }
    const i = h.length - 1;
    const p0 = h[i - 2], p1 = h[i - 1], p2 = h[i];
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const ddx = (p2.x - 2 * p1.x + p0.x), ddy = (p2.y - 2 * p1.y + p0.y);
    const denom = Math.pow(dx * dx + dy * dy, 1.5);
    const k = denom > 0.001 ? Math.abs(dx * ddy - dy * ddx) / denom : 0;
    this.smoothedCurvature += (k - this.smoothedCurvature) * CURVATURE_SMOOTH;
  }

  /**
   * Map gesture state to raw musical parameters.
   */
  mapToRaw(state: GestureState): RawMapping {
    // X → pitch (linear across canvas width)
    const xNorm = Math.max(0, Math.min(1, state.x / this.canvasWidth));
    const pRaw = Math.round(MIDI_MIN + xNorm * (MIDI_MAX - MIDI_MIN));

    // Y → octave bias (top = high, bottom = low)
    const yNorm = 1 - Math.max(0, Math.min(1, state.y / this.canvasHeight));
    const octaveBias = (yNorm - 0.5) * 2; // [-1, 1]

    // Velocity → MIDI velocity (soft curve for calmer sound)
    const velNorm = Math.min(state.velocity / 2000, 1);
    const midiVelocity = Math.round(30 + velNorm * 65); // 30–95 (gentler range)

    // Acceleration → filter cutoff (0–1)
    const filterCutoff = Math.min(Math.abs(state.acceleration) / 5000, 1);

    // Circular motion → arpeggio mode
    const avgAngular = this.angularHistory.length > 0
      ? this.angularHistory.reduce((a, b) => a + b, 0) / this.angularHistory.length
      : 0;
    const arpeggioMode = avgAngular > ARPEGGIO_ANGULAR_THRESHOLD;

    return { pRaw, octaveBias, midiVelocity, filterCutoff, arpeggioMode };
  }

  /**
   * Compute gesture features for the AI composer.
   */
  computeFeatures(state: GestureState): GestureFeatures {
    const velNorm = Math.min(state.velocity / 1500, 1);

    // Energy: based on velocity magnitude
    const energy = velNorm;

    // Smoothness: inverse of acceleration variance
    const smoothness = 1 - Math.min(Math.abs(state.acceleration) / 3000, 1);

    // Density: based on angular velocity (more circular = denser)
    const avgAngular = this.angularHistory.length > 0
      ? this.angularHistory.reduce((a, b) => a + b, 0) / this.angularHistory.length
      : 0;
    const density = Math.min(avgAngular / 5, 1);

    return { energy, smoothness, density };
  }

  /* ────────────────────────────────────────────
     Rhythm detection (call on each noteOn)
     ──────────────────────────────────────────── */

  /** Call this whenever a note is triggered to track rhythm. */
  recordNoteOnset(timestamp: number): void {
    this.onsetTimes.push(timestamp);
    if (this.onsetTimes.length > RHYTHM_IOI_SIZE + 1) this.onsetTimes.shift();

    // Track interval for chaos
    if (this.prevState) {
      const interval = Math.abs((this.prevState as GestureState).x - (this.prevPrevState?.x ?? this.prevState.x));
      this.intervalHistory.push(interval);
      if (this.intervalHistory.length > CHAOS_INTERVAL_SIZE) this.intervalHistory.shift();
    }

    this.updateRhythm();
    this.updateChaos();
  }

  private updateRhythm(): void {
    if (this.onsetTimes.length < 3) { this.rhythmStrength = 0; this.dominantPeriod = 0; return; }
    const iois: number[] = [];
    for (let i = 1; i < this.onsetTimes.length; i++) {
      iois.push(this.onsetTimes[i] - this.onsetTimes[i - 1]);
    }
    // Simple autocorrelation-based periodicity detection
    const mean = iois.reduce((a, b) => a + b, 0) / iois.length;
    const variance = iois.reduce((s, v) => s + (v - mean) ** 2, 0) / iois.length;
    const std = Math.sqrt(variance);
    // Rhythm strength = inverse of coefficient of variation (low variation = strong rhythm)
    this.rhythmStrength = mean > 0 ? Math.max(0, Math.min(1, 1 - std / mean)) : 0;
    this.dominantPeriod = mean / 1000; // seconds
  }

  private updateChaos(): void {
    if (this.intervalHistory.length < 3) { this.chaosLevel = 0; return; }
    const mean = this.intervalHistory.reduce((a, b) => a + b, 0) / this.intervalHistory.length;
    const variance = this.intervalHistory.reduce((s, v) => s + (v - mean) ** 2, 0) / this.intervalHistory.length;
    this.chaosLevel = Math.min(1, Math.sqrt(variance) / 12);
  }

  /* ────────────────────────────────────────────
     Getters for new analysis
     ──────────────────────────────────────────── */

  getCurvature(): number { return this.smoothedCurvature; }
  getRhythmStrength(): number { return this.rhythmStrength; }
  getDominantPeriod(): number { return this.dominantPeriod; }
  getEnergy(): number { return this.energyLevel; }
  isSuddenBurst(): boolean { return this.burstFrames >= 3; }
  getChaosLevel(): number { return this.chaosLevel; }

  /**
   * Update canvas dimensions (on resize).
   */
  resize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  /**
   * Reset state.
   */
  reset(): void {
    this.prevState = null;
    this.prevPrevState = null;
    this.angularHistory = [];
    this.posHistory = [];
    this.smoothedCurvature = 0;
    this.onsetTimes = [];
    this.rhythmStrength = 0;
    this.dominantPeriod = 0;
    this.velocityHistory = [];
    this.energyLevel = 0;
    this.prevEnergyLevel = 0;
    this.burstFrames = 0;
    this.intervalHistory = [];
    this.chaosLevel = 0;
  }
}
