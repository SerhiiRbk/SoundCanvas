/**
 * Meditation Visuals — serene mandala overlay drawn during meditation mode.
 *
 * Core concept: the cursor traces a spirograph path.  Each new segment is
 * drawn N times with radial symmetry onto an **accumulation buffer**, which
 * slowly fades.  The result is a living, evolving mandala that builds up
 * over time and gently breathes with the music.
 *
 * Layers:
 *  1. Mandala accumulation   — radially symmetric trail (offscreen canvas)
 *  2. Aura Glow              — wide soft gradient centred on cursor
 *  3. Center dot / bloom     — bright point at mandala center
 *  4. Fireflies              — drifting luminous dots born on note events
 *  5. Note Ripples           — expanding rings triggered by percussion
 *  6. Eternity (∞) overlay   — optional lemniscate symbol
 */

import { pitchToHue, hslToString } from './colorMapping';

/* ══════════════════════════════════════════════
   Configuration
   ══════════════════════════════════════════════ */

/** Number of radial symmetry folds (even numbers work best) */
const MANDALA_FOLDS = 8;

/** How quickly old mandala lines fade (per frame).
 *  0.9999 ≈ lines from 2 min ago still at ~50% brightness — nearly infinite. */
const MANDALA_FADE = 0.9999;

/** Line width for mandala strokes */
const MANDALA_LINE_WIDTH = 1.6;
/** Alpha for each fold stroke */
const MANDALA_STROKE_ALPHA = 0.18;

/** Aura around cursor */
const AURA_RADIUS = 180;
const AURA_ALPHA = 0.04;

/** Recent path tail length (on top of mandala) */
const PATH_TAIL_LEN = 40;

/** Fireflies */
const MAX_FIREFLIES = 50;
const FIREFLY_LIFE = 7; // seconds
const FIREFLY_DRIFT = 12; // px/sec
const FIREFLY_SIZE = 2.5;

/** Note ripples */
const MAX_RIPPLES = 8;
const RIPPLE_SPEED = 70; // px/sec
const RIPPLE_LIFE = 2.5; // seconds

/* ══════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════ */

interface PathPoint { x: number; y: number; pitch: number; }

interface Firefly {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  hue: number; size: number;
  phase: number;
}

interface Ripple {
  x: number; y: number;
  age: number; maxLife: number;
  hue: number;
}

/* ══════════════════════════════════════════════
   Class
   ══════════════════════════════════════════════ */

export class MeditationVisuals {
  private enabled = false;
  private eternityOverlay = false;
  private time = 0;

  // Entropy-driven hue drift
  private hueEntropy = 0;

  // Recent cursor positions (short tail for "live" trail + new-segment detection)
  private pathHistory: PathPoint[] = [];
  private lastDrawnIdx = 0;

  // ── Mandala accumulation buffer ──
  private mandalaCanvas: OffscreenCanvas | null = null;
  private mandalaCtx: OffscreenCanvasRenderingContext2D | null = null;

  // ── Particles ──
  private fireflies: Firefly[] = [];
  private ripples: Ripple[] = [];

  /* ── Public API ── */

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.pathHistory = [];
      this.lastDrawnIdx = 0;
      this.fireflies = [];
      this.ripples = [];
      this.eternityOverlay = false;
      // Clear the mandala buffer
      if (this.mandalaCtx && this.mandalaCanvas) {
        this.mandalaCtx.clearRect(0, 0, this.mandalaCanvas.width, this.mandalaCanvas.height);
      }
    }
  }

  setEternityOverlay(on: boolean): void { this.eternityOverlay = on; }
  isEnabled(): boolean { return this.enabled; }

  update(dt: number): void {
    if (!this.enabled) return;
    this.time += dt;
    this.hueEntropy += dt * 3.5;

    // Update fireflies
    for (let i = this.fireflies.length - 1; i >= 0; i--) {
      const f = this.fireflies[i];
      f.life -= dt;
      if (f.life <= 0) { this.fireflies.splice(i, 1); continue; }
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.phase += dt * (2 + Math.sin(i * 0.7));
    }

    // Update ripples
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.age += dt;
      if (r.age >= r.maxLife) { this.ripples.splice(i, 1); }
    }
  }

  /** Push the latest cursor position (call every frame while meditating) */
  pushPosition(x: number, y: number, pitch: number): void {
    if (!this.enabled) return;
    this.pathHistory.push({ x, y, pitch });
    // Keep a reasonable buffer for tail rendering; the mandala itself lives
    // in the accumulation canvas, so we don't need thousands of points.
    if (this.pathHistory.length > 500) {
      const drop = this.pathHistory.length - 500;
      this.pathHistory.splice(0, drop);
      this.lastDrawnIdx = Math.max(0, this.lastDrawnIdx - drop);
    }

    // Spawn firefly occasionally
    if (this.fireflies.length < MAX_FIREFLIES && Math.random() < 0.1) {
      this.spawnFirefly(x, y, pitchToHue(pitch));
    }
  }

  /** Called on percussion / special events */
  onPercHit(x: number, y: number): void {
    if (!this.enabled) return;
    if (this.ripples.length < MAX_RIPPLES) {
      this.ripples.push({ x, y, age: 0, maxLife: RIPPLE_LIFE, hue: (this.hueEntropy * 30) % 360 });
    }
    const count = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count && this.fireflies.length < MAX_FIREFLIES; i++) {
      this.spawnFirefly(x, y, (this.hueEntropy * 30 + i * 40) % 360);
    }
  }

  /* ════════════════════════════════════════════
     Main render
     ════════════════════════════════════════════ */

  render(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    rms: number, lowEnergy: number, _highEnergy: number,
    pitch: number,
  ): void {
    if (!this.enabled) return;

    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const baseHue = (pitchToHue(pitch) + Math.sin(this.hueEntropy * 0.1) * 30) % 360;

    // ── 1. Build mandala accumulation ──
    this.updateMandalaBuffer(w, h, baseHue);

    // ── 2. Composite mandala onto main canvas ──
    if (this.mandalaCanvas) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85 + rms * 0.15;
      ctx.drawImage(this.mandalaCanvas, 0, 0);
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // ── 3. Aura glow around cursor ──
    this.drawAura(ctx, cx, cy, baseHue, rms);

    // ── 4. Center bloom ──
    this.drawCenterBloom(ctx, w / 2, h / 2, baseHue, rms, lowEnergy);

    // ── 5. Recent path tail (bright, on top) ──
    this.drawPathTail(ctx, baseHue);

    // ── 6. Fireflies ──
    this.drawFireflies(ctx);

    // ── 7. Ripples ──
    this.drawRipples(ctx);

    // ── 8. Eternity overlay ──
    if (this.eternityOverlay) {
      this.drawEternitySymbol(ctx, w / 2, h / 2, baseHue, rms, this.time);
    }

    ctx.restore();
  }

  /* ════════════════════════════════════════════
     Mandala accumulation buffer
     ════════════════════════════════════════════ */

  private ensureMandalaCanvas(w: number, h: number): void {
    if (!this.mandalaCanvas || this.mandalaCanvas.width !== w || this.mandalaCanvas.height !== h) {
      this.mandalaCanvas = new OffscreenCanvas(w, h);
      this.mandalaCtx = this.mandalaCanvas.getContext('2d');
      this.lastDrawnIdx = 0;
    }
  }

  private updateMandalaBuffer(w: number, h: number, baseHue: number): void {
    this.ensureMandalaCanvas(w, h);
    const mctx = this.mandalaCtx!;
    const pts = this.pathHistory;
    const centerX = w / 2;
    const centerY = h / 2;

    // ── Fade: gently darken existing content ──
    mctx.globalCompositeOperation = 'destination-in';
    mctx.fillStyle = `rgba(0,0,0,${MANDALA_FADE})`;
    mctx.fillRect(0, 0, w, h);

    // ── Draw new segments with N-fold radial symmetry ──
    const start = Math.max(1, this.lastDrawnIdx);
    if (start >= pts.length) return;

    mctx.globalCompositeOperation = 'lighter';

    for (let fold = 0; fold < MANDALA_FOLDS; fold++) {
      const angle = (fold / MANDALA_FOLDS) * Math.PI * 2;
      const mirror = fold % 2 === 1;
      const foldHue = (baseHue + fold * (360 / MANDALA_FOLDS) + this.hueEntropy * 2) % 360;

      mctx.save();
      mctx.translate(centerX, centerY);
      mctx.rotate(angle);
      if (mirror) mctx.scale(1, -1);
      mctx.translate(-centerX, -centerY);

      // Draw path segments with smooth Bézier interpolation
      mctx.beginPath();
      mctx.moveTo(pts[start - 1].x, pts[start - 1].y);

      for (let i = start; i < pts.length; i++) {
        const p0 = pts[i - 1];
        const p1 = pts[i];
        // Midpoint smoothing (quadratic Bézier through midpoints)
        const mx = (p0.x + p1.x) / 2;
        const my = (p0.y + p1.y) / 2;
        mctx.quadraticCurveTo(p0.x, p0.y, mx, my);
      }

      // Final segment to last point
      const last = pts[pts.length - 1];
      mctx.lineTo(last.x, last.y);

      mctx.lineWidth = MANDALA_LINE_WIDTH;
      mctx.strokeStyle = hslToString(foldHue, 50, 65, MANDALA_STROKE_ALPHA);
      mctx.stroke();

      mctx.restore();
    }

    this.lastDrawnIdx = pts.length - 1;
  }

  /* ════════════════════════════════════════════
     Drawing primitives
     ════════════════════════════════════════════ */

  private drawAura(ctx: CanvasRenderingContext2D, cx: number, cy: number, hue: number, rms: number): void {
    const r = AURA_RADIUS + rms * 60;
    const a = AURA_ALPHA + rms * 0.02;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, hslToString(hue, 25, 40, a));
    g.addColorStop(0.5, hslToString(hue, 15, 30, a * 0.3));
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawCenterBloom(ctx: CanvasRenderingContext2D, cx: number, cy: number, hue: number, rms: number, low: number): void {
    // Soft pulsing glow at the mandala center
    const pulse = 0.5 + Math.sin(this.time * 0.3) * 0.3 + rms * 0.5 + low * 0.3;
    const r = 20 + pulse * 25;
    const alpha = 0.03 + pulse * 0.04;

    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, hslToString(hue, 40, 80, alpha * 2));
    g.addColorStop(0.3, hslToString(hue, 30, 60, alpha));
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Tiny bright core
    ctx.beginPath();
    ctx.arc(cx, cy, 2 + rms * 2, 0, Math.PI * 2);
    ctx.fillStyle = hslToString(hue, 30, 90, 0.15 + rms * 0.1);
    ctx.fill();
  }

  private drawPathTail(ctx: CanvasRenderingContext2D, baseHue: number): void {
    const pts = this.pathHistory;
    const tailStart = Math.max(0, pts.length - PATH_TAIL_LEN);
    if (tailStart >= pts.length - 2) return;

    ctx.beginPath();
    ctx.moveTo(pts[tailStart].x, pts[tailStart].y);
    for (let i = tailStart + 1; i < pts.length; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const mx = (p0.x + p1.x) / 2;
      const my = (p0.y + p1.y) / 2;
      ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.lineWidth = 2;
    ctx.strokeStyle = hslToString(baseHue, 45, 70, 0.2);
    ctx.stroke();

    // Bright dot at cursor tip
    const tip = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = hslToString(baseHue, 50, 85, 0.4);
    ctx.fill();
  }

  private drawFireflies(ctx: CanvasRenderingContext2D): void {
    for (const f of this.fireflies) {
      const lifeFrac = f.life / f.maxLife;
      const alpha = lifeFrac * 0.5 * (0.5 + 0.5 * Math.sin(f.phase * 3));
      if (alpha < 0.01) continue;

      const r = f.size * (0.6 + lifeFrac * 0.4);

      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r * 4);
      g.addColorStop(0, hslToString(f.hue, 40, 70, alpha));
      g.addColorStop(0.5, hslToString(f.hue, 30, 50, alpha * 0.3));
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r * 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.fillStyle = hslToString(f.hue, 30, 85, alpha * 1.2);
      ctx.fill();
    }
  }

  private drawRipples(ctx: CanvasRenderingContext2D): void {
    for (const r of this.ripples) {
      const frac = r.age / r.maxLife;
      const radius = frac * RIPPLE_SPEED * r.maxLife;
      const alpha = (1 - frac) * 0.12;
      if (alpha < 0.005) continue;

      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx.lineWidth = 1.2 * (1 - frac);
      ctx.strokeStyle = hslToString(r.hue, 30, 60, alpha);
      ctx.stroke();

      const r2 = radius * 1.3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r2, 0, Math.PI * 2);
      ctx.lineWidth = 0.7 * (1 - frac);
      ctx.strokeStyle = hslToString((r.hue + 30) % 360, 25, 55, alpha * 0.5);
      ctx.stroke();
    }
  }

  /* ── Eternity (∞) symbol overlay ── */

  private drawEternitySymbol(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    baseHue: number, rms: number, t: number,
  ): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const scaleX = Math.min(w, h) * 0.35;
    const scaleY = scaleX * 0.55;

    const breathe = 1 + Math.sin(t * 0.03) * 0.06 + rms * 0.08;
    const ax = scaleX * breathe;
    const ay = scaleY * breathe;

    const rot = t * 0.008;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);

    const SEGS = 200;
    const step = (Math.PI * 2) / SEGS;

    const layers = [
      { lineWidth: 8, alpha: 0.02 + rms * 0.015 },
      { lineWidth: 4, alpha: 0.04 + rms * 0.02 },
      { lineWidth: 1.5, alpha: 0.08 + rms * 0.03 },
    ];

    for (const layer of layers) {
      ctx.beginPath();
      for (let i = 0; i <= SEGS; i++) {
        const theta = i * step;
        const sinT = Math.sin(theta);
        const cosT = Math.cos(theta);
        const denom = 1 + sinT * sinT;
        const lx = (cosT / denom) * ax;
        const ly = (sinT * cosT / denom) * ay;
        const rx = lx * cosR - ly * sinR;
        const ry = lx * sinR + ly * cosR;
        const px = cx + rx;
        const py = cy + ry;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      const hue = (baseHue + t * 2) % 360;
      ctx.lineWidth = layer.lineWidth;
      ctx.strokeStyle = hslToString(hue, 35, 65, layer.alpha);
      ctx.stroke();
    }

    const sparkCount = 12;
    for (let i = 0; i < sparkCount; i++) {
      const theta = (t * 0.2 + (i / sparkCount) * Math.PI * 2) % (Math.PI * 2);
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);
      const denom = 1 + sinT * sinT;
      const lx = (cosT / denom) * ax;
      const ly = (sinT * cosT / denom) * ay;
      const rx = lx * cosR - ly * sinR;
      const ry = lx * sinR + ly * cosR;
      const px = cx + rx;
      const py = cy + ry;
      const twinkle = Math.sin(t * 3 + i * 1.7) * 0.5 + 0.5;
      const sparkAlpha = twinkle * (0.15 + rms * 0.1);
      const sparkSize = 2 + twinkle * 2;
      ctx.beginPath();
      ctx.arc(px, py, sparkSize, 0, Math.PI * 2);
      ctx.fillStyle = hslToString((baseHue + i * 30) % 360, 50, 75, sparkAlpha);
      ctx.fill();
    }
  }

  private spawnFirefly(x: number, y: number, hue: number): void {
    const angle = Math.random() * Math.PI * 2;
    const speed = FIREFLY_DRIFT * (0.3 + Math.random() * 0.7);
    const life = FIREFLY_LIFE * (0.5 + Math.random() * 0.5);
    this.fireflies.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life, maxLife: life,
      hue: (hue + Math.random() * 40 - 20) % 360,
      size: FIREFLY_SIZE * (0.6 + Math.random() * 0.8),
      phase: Math.random() * Math.PI * 2,
    });
  }
}
