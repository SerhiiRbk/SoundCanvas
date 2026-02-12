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

export class GestureAnalyzer {
  private prevState: GestureState | null = null;
  private prevPrevState: GestureState | null = null;
  private angularHistory: number[] = [];
  private canvasWidth: number;
  private canvasHeight: number;

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

    return state;
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

    // Velocity → MIDI velocity (clamped)
    const velNorm = Math.min(state.velocity / 1500, 1);
    const midiVelocity = Math.round(40 + velNorm * 87); // 40–127

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
  }
}
