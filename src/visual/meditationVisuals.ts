/**
 * Meditation Visuals — serene overlay drawn during meditation mode.
 *
 * Layers:
 *  1. Aura Glow       — wide soft gradient centred on cursor
 *  2. Breathing Rings  — concentric circles that slowly expand and fade
 *  3. Harmonic Waves   — flowing sine curves radiating from the cursor
 *  4. Sacred Mandala   — two counter-rotating petal rings
 *  5. Flowing Path     — trace of recent positions
 *  6. Fireflies        — drifting luminous dots born on note / perc events
 *  7. Note Ripples     — expanding rings triggered by percussion
 *
 * All visuals use very soft alphas, low saturation, and additive blending
 * for a calm, ethereal feel.
 */

import { pitchToHue, hslToString } from './colorMapping';

/* ── Configuration ── */

const RING_COUNT = 6;
const RING_BASE_RADIUS = 30;
const RING_SPACING = 45;
const RING_EXPAND_SPEED = 0.4;
const RING_LINE_ALPHA = 0.12;

const WAVE_ARMS = 8;
const WAVE_LENGTH = 250;
const WAVE_STEPS = 80;
const WAVE_AMPLITUDE = 30;
const WAVE_FREQ = 3;
const WAVE_PHASE_SPEED = 0.6;
const WAVE_LINE_ALPHA = 0.09;

const MANDALA_PETALS = 12;
const MANDALA_RADIUS = 160;
const MANDALA_ROTATE_SPEED = 0.08;
const MANDALA_LINE_ALPHA = 0.06;
const MANDALA_INNER_RATIO = 0.25;

// Inner mandala (counter-rotating)
const MANDALA2_PETALS = 8;
const MANDALA2_RADIUS_RATIO = 0.55;
const MANDALA2_ROTATE_SPEED = -0.12;

const AURA_RADIUS = 200;
const AURA_ALPHA = 0.05;

const PATH_HISTORY_MAX = 120;
const PATH_LINE_ALPHA = 0.08;

// Fireflies
const MAX_FIREFLIES = 40;
const FIREFLY_LIFE = 6; // seconds
const FIREFLY_DRIFT = 15; // px/sec
const FIREFLY_SIZE = 2.5;

// Note ripples
const MAX_RIPPLES = 8;
const RIPPLE_SPEED = 80; // px/sec
const RIPPLE_LIFE = 2.0; // seconds

/* ── Types ── */

interface Firefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  hue: number;
  size: number;
  phase: number; // twinkle phase
}

interface Ripple {
  x: number;
  y: number;
  age: number;
  maxLife: number;
  hue: number;
}

export class MeditationVisuals {
  private enabled = false;
  private eternityOverlay = false;
  private time = 0;

  // Entropy-driven hue drift
  private hueEntropy = 0;

  // Recent cursor positions for the flowing path trace
  private pathHistory: { x: number; y: number; pitch: number }[] = [];

  // Fireflies
  private fireflies: Firefly[] = [];

  // Note ripples (triggered by percussion / special events)
  private ripples: Ripple[] = [];

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.pathHistory = [];
      this.fireflies = [];
      this.ripples = [];
      this.eternityOverlay = false;
    }
  }

  setEternityOverlay(on: boolean): void {
    this.eternityOverlay = on;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  update(dt: number): void {
    if (!this.enabled) return;
    this.time += dt;

    // Slowly drift hue entropy (creates color evolution over time)
    this.hueEntropy += dt * 3.5;

    // Update fireflies
    for (let i = this.fireflies.length - 1; i >= 0; i--) {
      const f = this.fireflies[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.fireflies.splice(i, 1);
        continue;
      }
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.phase += dt * (2 + Math.sin(i * 0.7)); // twinkle
    }

    // Update ripples
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.age += dt;
      if (r.age >= r.maxLife) {
        this.ripples.splice(i, 1);
      }
    }
  }

  /** Push the latest cursor position (call every frame while meditating) */
  pushPosition(x: number, y: number, pitch: number): void {
    if (!this.enabled) return;
    this.pathHistory.push({ x, y, pitch });
    if (this.pathHistory.length > PATH_HISTORY_MAX) {
      this.pathHistory.shift();
    }

    // Spawn firefly occasionally from cursor (every ~8 frames)
    if (this.fireflies.length < MAX_FIREFLIES && Math.random() < 0.12) {
      this.spawnFirefly(x, y, pitchToHue(pitch));
    }
  }

  /** Called on percussion hits — creates a ripple + burst of fireflies */
  onPercHit(x: number, y: number): void {
    if (!this.enabled) return;

    // Ripple
    if (this.ripples.length < MAX_RIPPLES) {
      this.ripples.push({
        x, y,
        age: 0,
        maxLife: RIPPLE_LIFE,
        hue: (this.hueEntropy * 30) % 360,
      });
    }

    // Burst of fireflies
    const count = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      if (this.fireflies.length >= MAX_FIREFLIES) break;
      this.spawnFirefly(x, y, (this.hueEntropy * 30 + i * 40) % 360);
    }
  }

  /**
   * Render all meditation visual layers.
   * Should be called BEFORE post-processing for dreamy blur integration.
   */
  render(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rms: number,
    lowEnergy: number,
    _highEnergy: number,
    pitch: number,
  ): void {
    if (!this.enabled) return;
    const t = this.time;
    // Entropy-shifted base hue: pitch hue + slow drift
    const baseHue = (pitchToHue(pitch) + Math.sin(this.hueEntropy * 0.1) * 30) % 360;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // ── 1. Aura glow ──
    this.drawAura(ctx, cx, cy, baseHue, rms);

    // ── 2. Breathing rings ──
    this.drawBreathingRings(ctx, cx, cy, baseHue, rms, lowEnergy, t);

    // ── 3. Harmonic waves ──
    this.drawHarmonicWaves(ctx, cx, cy, baseHue, rms, t);

    // ── 4. Sacred mandala (dual ring) ──
    this.drawMandala(ctx, cx, cy, baseHue, rms, lowEnergy, t);

    // ── 5. Flowing path trace ──
    this.drawPathTrace(ctx, baseHue);

    // ── 6. Fireflies ──
    this.drawFireflies(ctx);

    // ── 7. Note ripples ──
    this.drawRipples(ctx);

    // ── 8. Eternity (∞) overlay ──
    if (this.eternityOverlay) {
      this.drawEternitySymbol(ctx, cx, cy, baseHue, rms, t);
    }

    ctx.restore();
  }

  /* ── Drawing primitives ── */

  private drawAura(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    hue: number,
    rms: number,
  ): void {
    const r = AURA_RADIUS + rms * 80;
    const a = AURA_ALPHA + rms * 0.03;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, hslToString(hue, 30, 40, a));
    g.addColorStop(0.5, hslToString(hue, 20, 30, a * 0.4));
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawBreathingRings(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    hue: number,
    rms: number,
    lowEnergy: number,
    t: number,
  ): void {
    const breathPhase = Math.sin(t * RING_EXPAND_SPEED) * 0.5 + 0.5;
    const breathScale = 0.85 + breathPhase * 0.3;
    const audioPulse = 1 + rms * 0.3 + lowEnergy * 0.15;

    for (let i = 0; i < RING_COUNT; i++) {
      const baseR = RING_BASE_RADIUS + i * RING_SPACING;
      const r = baseR * breathScale * audioPulse;
      const alpha = RING_LINE_ALPHA * (1 - i / RING_COUNT) * (0.6 + rms * 0.4);
      const ringHue = (hue + i * 15 + Math.sin(t * 0.2 + i) * 10) % 360;

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.lineWidth = 1 + rms * 1.5;
      ctx.strokeStyle = hslToString(ringHue, 35, 55, alpha);
      ctx.stroke();
    }
  }

  private drawHarmonicWaves(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    hue: number,
    rms: number,
    t: number,
  ): void {
    const amp = WAVE_AMPLITUDE + rms * 20;

    for (let arm = 0; arm < WAVE_ARMS; arm++) {
      const baseAngle = (arm / WAVE_ARMS) * Math.PI * 2;
      const armHue = (hue + arm * (360 / WAVE_ARMS)) % 360;

      ctx.beginPath();
      for (let i = 0; i <= WAVE_STEPS; i++) {
        const frac = i / WAVE_STEPS;
        const dist = frac * WAVE_LENGTH;
        const wave = Math.sin(frac * Math.PI * 2 * WAVE_FREQ + t * WAVE_PHASE_SPEED + arm) * amp * frac;
        const dx = Math.cos(baseAngle) * dist - Math.sin(baseAngle) * wave;
        const dy = Math.sin(baseAngle) * dist + Math.cos(baseAngle) * wave;
        const x = cx + dx;
        const y = cy + dy;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = hslToString(armHue, 30, 60, WAVE_LINE_ALPHA * (0.5 + rms * 0.5));
      ctx.stroke();
    }
  }

  private drawMandala(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    hue: number,
    rms: number,
    lowEnergy: number,
    t: number,
  ): void {
    const outerR = MANDALA_RADIUS + rms * 40 + lowEnergy * 20;
    const innerR = outerR * MANDALA_INNER_RATIO;

    // ── Outer ring ──
    this.drawPetalRing(ctx, cx, cy, MANDALA_PETALS, innerR, outerR,
      t * MANDALA_ROTATE_SPEED, hue, rms, MANDALA_LINE_ALPHA);

    // ── Inner counter-rotating ring ──
    const innerOuterR = outerR * MANDALA2_RADIUS_RATIO;
    const innerInnerR = innerOuterR * 0.3;
    this.drawPetalRing(ctx, cx, cy, MANDALA2_PETALS, innerInnerR, innerOuterR,
      t * MANDALA2_ROTATE_SPEED, (hue + 60) % 360, rms, MANDALA_LINE_ALPHA * 0.7);
  }

  private drawPetalRing(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    petals: number,
    innerR: number, outerR: number,
    rotation: number,
    hue: number,
    rms: number,
    alpha: number,
  ): void {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);

    for (let p = 0; p < petals; p++) {
      const angle = (p / petals) * Math.PI * 2;
      const nextAngle = ((p + 1) / petals) * Math.PI * 2;
      const midAngle = (angle + nextAngle) / 2;
      const petalHue = (hue + p * (360 / petals)) % 360;
      const cpR = outerR * 0.7;

      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * innerR, Math.sin(angle) * innerR);
      ctx.quadraticCurveTo(
        Math.cos(midAngle) * outerR, Math.sin(midAngle) * outerR,
        Math.cos(nextAngle) * innerR, Math.sin(nextAngle) * innerR,
      );
      ctx.quadraticCurveTo(
        Math.cos(midAngle) * cpR * 0.3, Math.sin(midAngle) * cpR * 0.3,
        Math.cos(angle) * innerR, Math.sin(angle) * innerR,
      );
      ctx.closePath();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = hslToString(petalHue, 25, 55, alpha * (0.5 + rms * 0.5));
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawPathTrace(ctx: CanvasRenderingContext2D, baseHue: number): void {
    const pts = this.pathHistory;
    if (pts.length < 3) return;

    // Full trace (very subtle)
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = hslToString(baseHue, 30, 55, PATH_LINE_ALPHA);
    ctx.stroke();

    // Brighter recent tail (last 25 points)
    const tailStart = Math.max(0, pts.length - 25);
    if (tailStart < pts.length - 1) {
      ctx.beginPath();
      ctx.moveTo(pts[tailStart].x, pts[tailStart].y);
      for (let i = tailStart + 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = hslToString(baseHue, 40, 65, PATH_LINE_ALPHA * 2.5);
      ctx.stroke();
    }
  }

  private drawFireflies(ctx: CanvasRenderingContext2D): void {
    for (const f of this.fireflies) {
      const lifeFrac = f.life / f.maxLife;
      const alpha = lifeFrac * 0.6 * (0.5 + 0.5 * Math.sin(f.phase * 3));
      if (alpha < 0.01) continue;

      const r = f.size * (0.6 + lifeFrac * 0.4);

      // Soft glow
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r * 4);
      g.addColorStop(0, hslToString(f.hue, 40, 70, alpha));
      g.addColorStop(0.5, hslToString(f.hue, 30, 50, alpha * 0.3));
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r * 4, 0, Math.PI * 2);
      ctx.fill();

      // Bright core
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
      const alpha = (1 - frac) * 0.15;
      if (alpha < 0.005) continue;

      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx.lineWidth = 1.5 * (1 - frac);
      ctx.strokeStyle = hslToString(r.hue, 30, 60, alpha);
      ctx.stroke();

      // Second, fainter ring slightly ahead
      const r2 = radius * 1.3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r2, 0, Math.PI * 2);
      ctx.lineWidth = 0.8 * (1 - frac);
      ctx.strokeStyle = hslToString((r.hue + 30) % 360, 25, 55, alpha * 0.5);
      ctx.stroke();
    }
  }

  /* ── Eternity (∞) symbol overlay ── */

  private drawEternitySymbol(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    baseHue: number,
    rms: number,
    t: number,
  ): void {
    // Draw a large, soft, glowing lemniscate (∞) behind everything

    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const scaleX = Math.min(w, h) * 0.35;
    const scaleY = scaleX * 0.55;

    // Slow breathing of the symbol
    const breathe = 1 + Math.sin(t * 0.03) * 0.06 + rms * 0.08;
    const ax = scaleX * breathe;
    const ay = scaleY * breathe;

    // Very slow rotation
    const rot = t * 0.008;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);

    // Number of segments for smooth curve
    const SEGS = 200;
    const step = (Math.PI * 2) / SEGS;

    // Draw multiple ghost layers for glow effect
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

        // Lemniscate coordinates
        let lx = (cosT / denom) * ax;
        let ly = (sinT * cosT / denom) * ay;

        // Rotate
        const rx = lx * cosR - ly * sinR;
        const ry = lx * sinR + ly * cosR;

        const px = cx + rx;
        const py = cy + ry;

        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }

      // Hue shifts along layers for depth
      const hue = (baseHue + t * 2) % 360;
      ctx.lineWidth = layer.lineWidth;
      ctx.strokeStyle = hslToString(hue, 35, 65, layer.alpha);
      ctx.stroke();
    }

    // Add sparkling points along the ∞ path
    const sparkCount = 12;
    for (let i = 0; i < sparkCount; i++) {
      const theta = (t * 0.2 + (i / sparkCount) * Math.PI * 2) % (Math.PI * 2);
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);
      const denom = 1 + sinT * sinT;

      let lx = (cosT / denom) * ax;
      let ly = (sinT * cosT / denom) * ay;

      const rx = lx * cosR - ly * sinR;
      const ry = lx * sinR + ly * cosR;

      const px = cx + rx;
      const py = cy + ry;

      // Twinkle
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
      vy: Math.sin(angle) * speed - 3, // slight upward drift
      life,
      maxLife: life,
      hue: (hue + Math.random() * 40 - 20) % 360,
      size: FIREFLY_SIZE * (0.6 + Math.random() * 0.8),
      phase: Math.random() * Math.PI * 2,
    });
  }
}
