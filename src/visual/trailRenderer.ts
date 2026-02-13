/**
 * Trail Renderer v5 — smooth splines with music-reactive iridescent colours.
 *
 * Improvements over v4:
 *  - **Rainbow shimmer**: hue drifts along the trail length, creating an
 *    iridescent gradient from tail to head that slowly evolves over time.
 *  - **Beat-reactive brightness**: each stored point captures the RMS energy
 *    at creation time; during render, the current global RMS further
 *    modulates saturation and lightness so the trail "pulses" with the beat.
 *  - **Colour wave**: a sinusoidal "colour wave" travels along the trail,
 *    making it shimmer with shifting hues even when the cursor is still.
 *  - **Higher point density**: minimum inter-point distance lowered to 1 px²
 *    for ultra-smooth Bézier curves.
 *  - **Wider glow** on strong beats, softer on quiet passages.
 */

import { MAX_TRAIL_POINTS, TRAIL_BASE_WIDTH, TRAIL_VELOCITY_WIDTH_K } from '../config';
import type { TrailPoint } from '../composer/composerTypes';

/* ── Colour-shimmer tunables ── */

/** Hue spread along the full trail length (degrees). */
const HUE_SPREAD = 70;
/** Amplitude of the time-based hue oscillation (degrees). */
const HUE_TIME_AMP = 30;
/** Speed of the hue oscillation (rad / s). */
const HUE_TIME_SPEED = 1.4;
/** How much RMS at creation shifts hue (degrees). */
const HUE_RMS_SHIFT = 35;
/** Beat brightness boost multiplier for lightness. */
const BEAT_LIGHTNESS_BOOST = 22;
/** Beat saturation boost. */
const BEAT_SATURATION_BOOST = 15;
/** Colour-wave wavelength along the trail (fraction of trail length). */
const COLOUR_WAVE_FREQ = 4; // full cycles visible
/** Speed the colour wave travels (cycles / sec). */
const COLOUR_WAVE_SPEED = 2.5;
/** Colour-wave hue amplitude. */
const COLOUR_WAVE_AMP = 18;

export class TrailRenderer {
  private points: TrailPoint[] = [];
  private decayTau = 0.5;

  /* ── Audio state for render-time modulation ── */
  private globalRms = 0;
  private globalLow = 0;
  private globalHigh = 0;

  /* ── Light Echo: re-illuminate positions when same pitch repeats ── */
  private noteMemory: Map<number, { x: number; y: number; time: number }[]> = new Map();
  private echoFlashes: { x: number; y: number; startTime: number; hue: number }[] = [];
  private echoEnabled = false;

  setEchoEnabled(on: boolean): void { this.echoEnabled = on; }

  /** Record a note position for echo memory */
  recordNotePosition(pitch: number, x: number, y: number): void {
    const pc = pitch % 12;
    if (!this.noteMemory.has(pc)) this.noteMemory.set(pc, []);
    const mem = this.noteMemory.get(pc)!;
    mem.push({ x, y, time: performance.now() / 1000 });
    if (mem.length > 50) mem.shift();

    // When same pitch class repeats, flash old positions
    if (this.echoEnabled && mem.length > 1) {
      const hue = pc * 30;
      for (let i = 0; i < mem.length - 1; i++) {
        this.echoFlashes.push({ x: mem[i].x, y: mem[i].y, startTime: performance.now() / 1000, hue });
      }
      if (this.echoFlashes.length > 100) this.echoFlashes.splice(0, this.echoFlashes.length - 100);
    }
  }

  /** Render echo flashes (call after main trail render) */
  renderEchoFlashes(ctx: CanvasRenderingContext2D): void {
    if (!this.echoEnabled || this.echoFlashes.length === 0) return;
    const now = performance.now() / 1000;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.echoFlashes = this.echoFlashes.filter((f) => {
      const age = now - f.startTime;
      if (age > 1.5) return false;
      const alpha = Math.exp(-age / 0.5) * 0.4;
      if (alpha < 0.01) return false;
      const r = 4 + age * 8;
      const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      grad.addColorStop(0, `hsla(${f.hue}, 70%, 80%, ${alpha})`);
      grad.addColorStop(1, `hsla(${f.hue}, 70%, 80%, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(f.x - r, f.y - r, r * 2, r * 2);
      return true;
    });
    ctx.restore();
  }

  addPoint(x: number, y: number, velocity: number, hue: number, rms: number = 0): void {
    const len = this.points.length;
    if (len > 0) {
      const last = this.points[len - 1];
      const dx = x - last.x;
      const dy = y - last.y;
      // Very low threshold for dense, smooth curves
      if (dx * dx + dy * dy < 1) return;
    }

    this.points.push({
      x, y,
      timestamp: performance.now() / 1000,
      velocity,
      hue,
      rms,
    });

    if (this.points.length > MAX_TRAIL_POINTS) {
      this.points.shift();
    }
  }

  setDecayTau(tau: number): void {
    this.decayTau = tau;
  }

  /** Feed current audio frame so render can react to the beat. */
  setAudio(rms: number, low: number, high: number): void {
    this.globalRms = rms;
    this.globalLow = low;
    this.globalHigh = high;
  }

  render(ctx: CanvasRenderingContext2D, rms: number = 0): void {
    // Accept rms from legacy call-sites too
    if (rms > 0 && this.globalRms === 0) this.globalRms = rms;

    const now = performance.now() / 1000;
    const expiry = this.decayTau * 6;

    // Prune expired points
    while (this.points.length > 0 && now - this.points[0].timestamp > expiry) {
      this.points.shift();
    }

    const N = this.points.length;
    if (N < 3) {
      if (N === 2) this.renderSimple(ctx, now);
      return;
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const gRms = this.globalRms;
    const gLow = this.globalLow;
    const gHigh = this.globalHigh;

    // Time-varying base hue offset (global shimmer)
    const timeHueShift = Math.sin(now * HUE_TIME_SPEED) * HUE_TIME_AMP;

    // ══════════════════════════════════════════════
    // Pass 1 — Main coloured spline
    // ══════════════════════════════════════════════
    for (let i = 1; i < N - 1; i++) {
      const pPrev = this.points[i - 1];
      const pCurr = this.points[i];
      const pNext = this.points[i + 1];

      const age = now - pCurr.timestamp;
      const alpha = Math.exp(-age / this.decayTau);
      if (alpha < 0.02) continue;

      // t: 0 = oldest, 1 = newest
      const t = i / (N - 1);

      // ── Width (tapers toward tail) ──
      const baseW = Math.min(8, TRAIL_BASE_WIDTH + pCurr.velocity * TRAIL_VELOCITY_WIDTH_K);
      const w = Math.max(0.6, baseW * (0.1 + t * 0.9));

      // ── Iridescent hue ──
      // Base pitch hue + position-dependent rainbow spread + time oscillation
      // + beat-driven shift + travelling colour wave
      const posHue = t * HUE_SPREAD;
      const beatHue = pCurr.rms * HUE_RMS_SHIFT;
      const wavePhase = t * Math.PI * 2 * COLOUR_WAVE_FREQ - now * COLOUR_WAVE_SPEED;
      const waveHue = Math.sin(wavePhase) * COLOUR_WAVE_AMP;
      const hue = ((pCurr.hue + posHue + timeHueShift + beatHue + waveHue) % 360 + 360) % 360;

      // ── Saturation & lightness — react to current + stored audio ──
      const sat = Math.min(100, 60 + t * 25 + gRms * BEAT_SATURATION_BOOST + gLow * 8);
      const lum = Math.min(88, 40 + t * 35 + gRms * BEAT_LIGHTNESS_BOOST + pCurr.rms * 10);

      // ── Bézier midpoints ──
      const mx0 = (pPrev.x + pCurr.x) * 0.5;
      const my0 = (pPrev.y + pCurr.y) * 0.5;
      const mx1 = (pCurr.x + pNext.x) * 0.5;
      const my1 = (pCurr.y + pNext.y) * 0.5;

      ctx.beginPath();
      ctx.moveTo(mx0, my0);
      ctx.quadraticCurveTo(pCurr.x, pCurr.y, mx1, my1);
      ctx.lineWidth = w;
      ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${lum}%, ${alpha})`;
      ctx.stroke();
    }

    // ══════════════════════════════════════════════
    // Pass 2 — Bright iridescent core (head 55%)
    // ══════════════════════════════════════════════
    for (let i = 1; i < N - 1; i++) {
      const t = i / (N - 1);
      if (t < 0.35) continue;

      const pPrev = this.points[i - 1];
      const pCurr = this.points[i];
      const pNext = this.points[i + 1];

      const age = now - pCurr.timestamp;
      const alpha = Math.exp(-age / this.decayTau);
      if (alpha < 0.04) continue;

      const baseW = Math.min(8, TRAIL_BASE_WIDTH + pCurr.velocity * TRAIL_VELOCITY_WIDTH_K);
      const w = Math.max(0.3, baseW * (0.1 + t * 0.9) * 0.35);
      const coreAlpha = alpha * ((t - 0.35) / 0.65) * (0.7 + gRms * 0.3);

      // Core gets a complementary hue shift for iridescence
      const posHue = t * HUE_SPREAD;
      const wavePhase = t * Math.PI * 2 * COLOUR_WAVE_FREQ - now * COLOUR_WAVE_SPEED;
      const waveHue = Math.sin(wavePhase) * COLOUR_WAVE_AMP;
      const coreHue = ((pCurr.hue + posHue + timeHueShift + waveHue + 30) % 360 + 360) % 360;

      const mx0 = (pPrev.x + pCurr.x) * 0.5;
      const my0 = (pPrev.y + pCurr.y) * 0.5;
      const mx1 = (pCurr.x + pNext.x) * 0.5;
      const my1 = (pCurr.y + pNext.y) * 0.5;

      ctx.beginPath();
      ctx.moveTo(mx0, my0);
      ctx.quadraticCurveTo(pCurr.x, pCurr.y, mx1, my1);
      ctx.lineWidth = w;
      // Slightly shifted hue, very high lightness → iridescent core
      ctx.strokeStyle = `hsla(${coreHue}, 30%, ${90 + gRms * 8}%, ${coreAlpha})`;
      ctx.stroke();
    }

    // ══════════════════════════════════════════════
    // Pass 3 — Soft outer glow (additive) — beat-reactive width
    // ══════════════════════════════════════════════
    ctx.globalCompositeOperation = 'lighter';

    // Glow is wider on strong beats
    const glowScale = 2.0 + gRms * 1.8 + gLow * 0.8;

    for (let i = 1; i < N - 1; i++) {
      const t = i / (N - 1);
      if (t < 0.5) continue;

      const pPrev = this.points[i - 1];
      const pCurr = this.points[i];
      const pNext = this.points[i + 1];

      const age = now - pCurr.timestamp;
      const alpha = Math.exp(-age / this.decayTau);
      if (alpha < 0.06) continue;

      const baseW = Math.min(8, TRAIL_BASE_WIDTH + pCurr.velocity * TRAIL_VELOCITY_WIDTH_K);
      const w = Math.max(2, baseW * (0.1 + t * 0.9) * glowScale);
      const glowAlpha = alpha * ((t - 0.5) / 0.5) * (0.06 + gRms * 0.06);

      // Glow hue follows the same shimmer pattern
      const posHue = t * HUE_SPREAD;
      const wavePhase = t * Math.PI * 2 * COLOUR_WAVE_FREQ - now * COLOUR_WAVE_SPEED;
      const waveHue = Math.sin(wavePhase) * COLOUR_WAVE_AMP;
      const glowHue = ((pCurr.hue + posHue + timeHueShift + waveHue) % 360 + 360) % 360;

      const mx0 = (pPrev.x + pCurr.x) * 0.5;
      const my0 = (pPrev.y + pCurr.y) * 0.5;
      const mx1 = (pCurr.x + pNext.x) * 0.5;
      const my1 = (pCurr.y + pNext.y) * 0.5;

      ctx.beginPath();
      ctx.moveTo(mx0, my0);
      ctx.quadraticCurveTo(pCurr.x, pCurr.y, mx1, my1);
      ctx.lineWidth = w;
      ctx.strokeStyle = `hsla(${glowHue}, 55%, 55%, ${glowAlpha})`;
      ctx.stroke();
    }

    ctx.restore();
  }

  /** Fallback for exactly 2 points (no spline possible). */
  private renderSimple(ctx: CanvasRenderingContext2D, now: number): void {
    if (this.points.length < 2) return;
    const p0 = this.points[0];
    const p1 = this.points[1];
    const age = now - p1.timestamp;
    const alpha = Math.exp(-age / this.decayTau);
    if (alpha < 0.03) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineWidth = Math.min(6, TRAIL_BASE_WIDTH + p1.velocity * TRAIL_VELOCITY_WIDTH_K);
    ctx.strokeStyle = `hsla(${p1.hue}, 80%, 65%, ${alpha})`;
    ctx.stroke();
    ctx.restore();
  }

  clear(): void {
    this.points = [];
  }

  getPointCount(): number {
    return this.points.length;
  }
}
