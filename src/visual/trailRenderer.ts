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
    if (rms > 0 && this.globalRms === 0) this.globalRms = rms;

    const now = performance.now() / 1000;
    const expiry = this.decayTau * 6;

    while (this.points.length > 0 && now - this.points[0].timestamp > expiry) {
      this.points.shift();
    }

    const N = this.points.length;
    if (N < 3) {
      if (N === 2) this.renderSimple(ctx, now);
      return;
    }

    ctx.save();

    const gRms = this.globalRms;
    const gLow = this.globalLow;
    const timeHueShift = Math.sin(now * HUE_TIME_SPEED) * HUE_TIME_AMP;

    // ── Pre-compute per-point data ──
    const xs: number[] = [];
    const ys: number[] = [];
    const alphas: number[] = [];
    const widths: number[] = [];
    const hues: number[] = [];
    const nxs: number[] = [];  // normal x
    const nys: number[] = [];  // normal y

    for (let i = 0; i < N; i++) {
      const p = this.points[i];
      xs.push(p.x);
      ys.push(p.y);

      const age = now - p.timestamp;
      alphas.push(Math.exp(-age / this.decayTau));

      const t = i / (N - 1); // 0=tail, 1=head

      // Comet taper: wide at head, vanishes at tail. Cubic ease for smooth taper.
      const taper = t * t;
      const maxW = 12 + gRms * 10 + gLow * 5 + p.velocity * 0.03;
      widths.push(Math.max(0.5, maxW * taper));

      // Hue
      const posHue = t * HUE_SPREAD;
      const beatHue = p.rms * HUE_RMS_SHIFT;
      const wavePhase = t * Math.PI * 2 * COLOUR_WAVE_FREQ - now * COLOUR_WAVE_SPEED;
      const waveHue = Math.sin(wavePhase) * COLOUR_WAVE_AMP;
      hues.push(((p.hue + posHue + timeHueShift + beatHue + waveHue) % 360 + 360) % 360);
    }

    // Compute normals (perpendicular to trail direction)
    for (let i = 0; i < N; i++) {
      let dx: number, dy: number;
      if (i === 0) {
        dx = xs[1] - xs[0]; dy = ys[1] - ys[0];
      } else if (i === N - 1) {
        dx = xs[i] - xs[i - 1]; dy = ys[i] - ys[i - 1];
      } else {
        dx = xs[i + 1] - xs[i - 1]; dy = ys[i + 1] - ys[i - 1];
      }
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      nxs.push(-dy / len);
      nys.push(dx / len);
    }

    // ══════════════════════════════════════════════
    // Pass 1 — Wide diffuse glow (additive)
    // ══════════════════════════════════════════════
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 1; i < N - 1; i++) {
      const t = i / (N - 1);
      if (t < 0.2) continue;
      const a = alphas[i] * t * t * (0.04 + gRms * 0.05);
      if (a < 0.005) continue;

      const w = widths[i] * (3.0 + gRms * 2.0);
      const pPrev = this.points[i - 1];
      const pCurr = this.points[i];
      const pNext = this.points[i + 1];
      const mx0 = (pPrev.x + pCurr.x) * 0.5;
      const my0 = (pPrev.y + pCurr.y) * 0.5;
      const mx1 = (pCurr.x + pNext.x) * 0.5;
      const my1 = (pCurr.y + pNext.y) * 0.5;

      ctx.beginPath();
      ctx.moveTo(mx0, my0);
      ctx.quadraticCurveTo(pCurr.x, pCurr.y, mx1, my1);
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.strokeStyle = `hsla(${hues[i]}, 50%, 50%, ${a})`;
      ctx.stroke();
    }

    // ══════════════════════════════════════════════
    // Pass 2 — Filled comet body (tapered polygon)
    // ══════════════════════════════════════════════
    ctx.globalCompositeOperation = 'lighter';

    // Build left and right edges of the tapered shape
    if (N >= 3) {
      // Draw as a series of gradient-filled quads for smooth colour transition
      for (let i = 0; i < N - 1; i++) {
        const t0 = i / (N - 1);
        const t1 = (i + 1) / (N - 1);
        const a0 = alphas[i] * t0;
        const a1 = alphas[i + 1] * t1;
        if (a0 < 0.01 && a1 < 0.01) continue;

        const w0 = widths[i];
        const w1 = widths[i + 1];

        // Quad corners
        const lx0 = xs[i] + nxs[i] * w0;
        const ly0 = ys[i] + nys[i] * w0;
        const rx0 = xs[i] - nxs[i] * w0;
        const ry0 = ys[i] - nys[i] * w0;
        const lx1 = xs[i + 1] + nxs[i + 1] * w1;
        const ly1 = ys[i + 1] + nys[i + 1] * w1;
        const rx1 = xs[i + 1] - nxs[i + 1] * w1;
        const ry1 = ys[i + 1] - nys[i + 1] * w1;

        // Colour: tail is saturated, head goes white-hot
        const sat0 = Math.max(10, 70 - t0 * 50);
        const lum0 = Math.min(95, 50 + t0 * 40 + gRms * 10);
        const sat1 = Math.max(10, 70 - t1 * 50);
        const lum1 = Math.min(95, 50 + t1 * 40 + gRms * 10);

        // Gradient along the segment
        const grad = ctx.createLinearGradient(xs[i], ys[i], xs[i + 1], ys[i + 1]);
        grad.addColorStop(0, `hsla(${hues[i]}, ${sat0}%, ${lum0}%, ${a0 * 0.7})`);
        grad.addColorStop(1, `hsla(${hues[Math.min(i + 1, N - 1)]}, ${sat1}%, ${lum1}%, ${a1 * 0.7})`);

        ctx.beginPath();
        ctx.moveTo(lx0, ly0);
        ctx.lineTo(lx1, ly1);
        ctx.lineTo(rx1, ry1);
        ctx.lineTo(rx0, ry0);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }
    }

    // ══════════════════════════════════════════════
    // Pass 3 — Bright white-hot core (thin line at center)
    // ══════════════════════════════════════════════
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 1; i < N - 1; i++) {
      const t = i / (N - 1);
      if (t < 0.3) continue;

      const pPrev = this.points[i - 1];
      const pCurr = this.points[i];
      const pNext = this.points[i + 1];

      const a = alphas[i] * ((t - 0.3) / 0.7);
      if (a < 0.03) continue;

      const coreW = Math.max(0.5, widths[i] * 0.25);
      const coreAlpha = a * (0.8 + gRms * 0.2);

      const mx0 = (pPrev.x + pCurr.x) * 0.5;
      const my0 = (pPrev.y + pCurr.y) * 0.5;
      const mx1 = (pCurr.x + pNext.x) * 0.5;
      const my1 = (pCurr.y + pNext.y) * 0.5;

      ctx.beginPath();
      ctx.moveTo(mx0, my0);
      ctx.quadraticCurveTo(pCurr.x, pCurr.y, mx1, my1);
      ctx.lineWidth = coreW;
      ctx.strokeStyle = `hsla(${(hues[i] + 20) % 360}, 20%, ${92 + gRms * 6}%, ${coreAlpha})`;
      ctx.stroke();
    }

    // ══════════════════════════════════════════════
    // Pass 4 — Comet dust particles (scattered along edges)
    // ══════════════════════════════════════════════
    const dustCount = Math.min(N * 2, 120);
    for (let d = 0; d < dustCount; d++) {
      // Pick a random point along the trail, biased toward the head
      const ri = Math.floor(Math.pow(Math.random(), 0.6) * (N - 1));
      const t = ri / (N - 1);
      const a = alphas[ri] * t;
      if (a < 0.05) continue;

      const spread = widths[ri] * (1.2 + Math.random() * 1.5);
      const ox = nxs[ri] * spread * (Math.random() - 0.5) * 2;
      const oy = nys[ri] * spread * (Math.random() - 0.5) * 2;
      const px = xs[ri] + ox;
      const py = ys[ri] + oy;
      const sz = 0.5 + Math.random() * 1.5;
      const da = a * (0.15 + Math.random() * 0.25);

      ctx.beginPath();
      ctx.arc(px, py, sz, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hues[ri]}, 60%, 75%, ${da})`;
      ctx.fill();
    }

    // ══════════════════════════════════════════════
    // Pass 5 — Head glow (bright radial at newest point)
    // ══════════════════════════════════════════════
    if (N > 2) {
      const head = this.points[N - 1];
      const headAlpha = alphas[N - 1];
      const headR = widths[N - 1] * (2.5 + gRms * 2.0);
      const headHue = hues[N - 1];

      if (headAlpha > 0.1 && headR > 2) {
        const grad = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, headR);
        grad.addColorStop(0, `hsla(${headHue}, 20%, 95%, ${headAlpha * 0.6})`);
        grad.addColorStop(0.3, `hsla(${headHue}, 50%, 75%, ${headAlpha * 0.3})`);
        grad.addColorStop(0.7, `hsla(${headHue}, 60%, 55%, ${headAlpha * 0.08})`);
        grad.addColorStop(1, `hsla(${headHue}, 60%, 55%, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(head.x, head.y, headR, 0, Math.PI * 2);
        ctx.fill();
      }
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
