/**
 * Performance Monitor — rolling FPS tracker with adaptive quality degradation.
 *
 * Tracks frame times in a fixed-size circular buffer. When the rolling
 * average dips below the degrade threshold for longer than the configured
 * window, it signals degradation.
 */

import type { VisualConfig } from './types';
import { DEGRADE_PARTICLE_FACTOR } from './config';

/** Maximum number of frame samples in the rolling buffer */
const BUFFER_SIZE = 120;

export class PerfMonitor {
  /* ── Rolling buffer ── */
  private frameTimes: Float64Array = new Float64Array(BUFFER_SIZE);
  private writeIdx = 0;
  private sampleCount = 0;

  /* ── Degrade state ── */
  private degradeStep = 0;
  private belowThresholdStart = 0;   // timestamp (ms) when fps first dropped
  private belowThreshold = false;

  /* ── Config mirror ── */
  private fpsTarget = 60;
  private fpsDegradeThreshold = 45;
  private fpsDegradeWindowSec = 3;
  private autoDegrade = true;

  /** Update config-driven thresholds */
  syncConfig(cfg: VisualConfig): void {
    this.fpsTarget = cfg.fpsTarget;
    this.fpsDegradeThreshold = cfg.fpsDegradeThreshold;
    this.fpsDegradeWindowSec = cfg.fpsDegradeWindowSec;
    this.autoDegrade = cfg.autoDegrade;
  }

  /** Record a frame time (in seconds, i.e. dt) */
  recordFrame(dt: number): void {
    this.frameTimes[this.writeIdx] = dt;
    this.writeIdx = (this.writeIdx + 1) % BUFFER_SIZE;
    if (this.sampleCount < BUFFER_SIZE) this.sampleCount++;
  }

  /** Current rolling average FPS */
  getAvgFps(): number {
    if (this.sampleCount < 2) return this.fpsTarget;
    let sum = 0;
    for (let i = 0; i < this.sampleCount; i++) {
      sum += this.frameTimes[i];
    }
    const avg = sum / this.sampleCount;
    return avg > 0 ? 1 / avg : this.fpsTarget;
  }

  /** Current degradation step (0 = none, max = DEGRADE_STEPS.length - 1) */
  getDegradeStep(): number {
    return this.degradeStep;
  }

  /** Reset degradation state (e.g. after user upgrades GPU toggle) */
  resetDegrade(): void {
    this.degradeStep = 0;
    this.belowThreshold = false;
    this.belowThresholdStart = 0;
  }

  /**
   * Call once per frame AFTER recordFrame().
   * Returns true if a NEW degrade step was just triggered.
   */
  checkDegrade(now: number): boolean {
    if (!this.autoDegrade) return false;
    if (this.sampleCount < 30) return false; // need enough samples

    const fps = this.getAvgFps();

    if (fps < this.fpsDegradeThreshold) {
      if (!this.belowThreshold) {
        this.belowThreshold = true;
        this.belowThresholdStart = now;
      } else if (now - this.belowThresholdStart > this.fpsDegradeWindowSec * 1000) {
        // Sustained low FPS → degrade
        this.degradeStep++;
        this.belowThreshold = false;
        this.belowThresholdStart = 0;
        // Reset buffer so we re-measure after degrade
        this.sampleCount = 0;
        this.writeIdx = 0;
        return true;
      }
    } else {
      // FPS recovered
      this.belowThreshold = false;
    }

    return false;
  }

  /**
   * Compute an effective maxParticles value accounting for degrade steps.
   * Step 1 reduces particles by DEGRADE_PARTICLE_FACTOR.
   */
  effectiveMaxParticles(base: number): number {
    if (this.degradeStep >= 2) {
      return Math.round(base * DEGRADE_PARTICLE_FACTOR * DEGRADE_PARTICLE_FACTOR);
    }
    if (this.degradeStep >= 1) {
      return Math.round(base * DEGRADE_PARTICLE_FACTOR);
    }
    return base;
  }
}
