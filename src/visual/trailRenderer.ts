/**
 * Trail Renderer v3 — clean, simple, visible.
 *
 * Stores last N mouse positions with timestamps.
 * Renders as line segments with per-point fading alpha and tapering width.
 * Uses source-over blending with bright colours — NO additive blending issues.
 */

import { MAX_TRAIL_POINTS, TRAIL_BASE_WIDTH, TRAIL_VELOCITY_WIDTH_K } from '../config';
import type { TrailPoint } from '../composer/composerTypes';

export class TrailRenderer {
  private points: TrailPoint[] = [];
  private decayTau = 0.5;

  addPoint(x: number, y: number, velocity: number, hue: number): void {
    const len = this.points.length;
    if (len > 0) {
      const last = this.points[len - 1];
      const dx = x - last.x;
      const dy = y - last.y;
      if (dx * dx + dy * dy < 4) return;
    }

    this.points.push({ x, y, timestamp: performance.now() / 1000, velocity, hue });

    if (this.points.length > MAX_TRAIL_POINTS) {
      this.points.shift();
    }
  }

  setDecayTau(tau: number): void {
    this.decayTau = tau;
  }

  render(ctx: CanvasRenderingContext2D, _rms: number = 0): void {
    const now = performance.now() / 1000;
    const expiry = this.decayTau * 6;

    while (this.points.length > 0 && now - this.points[0].timestamp > expiry) {
      this.points.shift();
    }

    const N = this.points.length;
    if (N < 2) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw each segment with its own width, alpha, and hue
    for (let i = 0; i < N - 1; i++) {
      const p0 = this.points[i];
      const p1 = this.points[i + 1];

      const age = now - p1.timestamp;
      const alpha = Math.exp(-age / this.decayTau);
      if (alpha < 0.03) continue;

      // t: 0 = oldest, 1 = newest
      const t = (i + 1) / N;

      // Width tapers toward tail
      const baseW = Math.min(6, TRAIL_BASE_WIDTH + p1.velocity * TRAIL_VELOCITY_WIDTH_K);
      const w = Math.max(1, baseW * (0.2 + t * 0.8));

      const hue = p1.hue;
      const sat = 70 + t * 20;   // more saturated near head
      const lum = 50 + t * 30;   // brighter near head

      // Main coloured line
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineWidth = w;
      ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${lum}%, ${alpha})`;
      ctx.stroke();

      // Bright core near head
      if (t > 0.5 && w > 1.5) {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineWidth = Math.max(0.8, w * 0.3);
        const coreAlpha = alpha * ((t - 0.5) / 0.5);
        ctx.strokeStyle = `hsla(${hue}, 20%, 95%, ${coreAlpha})`;
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  clear(): void {
    this.points = [];
  }

  getPointCount(): number {
    return this.points.length;
  }
}
