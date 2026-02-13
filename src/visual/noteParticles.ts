/**
 * Note Particles — Canvas2D musical note particles that scatter from the cursor.
 *
 * Emits small ♪-shaped particles as the cursor moves. Each note has a random
 * colour, rotation, and velocity. Works in both Canvas2D and as a 2D overlay
 * on top of the WebGL pipeline.
 */

import { pitchToHue, hslToString } from './colorMapping';

interface NoteParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  rotation: number;
  spin: number;
  active: boolean;
}

const MAX_NOTES = 200;
const EMIT_RATE = 0.006;
const MIN_SPEED = 8;
const LIFE_MIN = 1.0;
const LIFE_MAX = 2.8;
const SIZE_MIN = 10;
const SIZE_MAX = 22;
const SCATTER = 2.0;
const GRAVITY = 0.02;
const DRAG = 0.986;

export class NoteParticles {
  private pool: NoteParticle[];
  private activeCount = 0;
  private freeHint = 0;
  private emitAccum = 0;

  constructor() {
    this.pool = Array.from({ length: MAX_NOTES }, () => ({
      x: 0, y: 0, vx: 0, vy: 0,
      life: 0, maxLife: 1, size: 0,
      hue: 0, rotation: 0, spin: 0, active: false,
    }));
  }

  update(dt: number, mx: number, my: number, speed: number, pitch: number, rms: number): void {
    // Emit
    if (speed > MIN_SPEED && mx > 0 && my > 0) {
      const rate = EMIT_RATE / (1 + speed * 0.004);
      this.emitAccum += dt;
      while (this.emitAccum >= rate) {
        this.emitAccum -= rate;
        this.emit(mx, my, pitch, rms);
      }
    } else {
      this.emitAccum = 0;
    }

    // Simulate
    const dtN = dt * 60;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.x += p.vx * dtN;
      p.y += p.vy * dtN;
      p.vx *= DRAG;
      p.vy *= DRAG;
      p.vy += GRAVITY * dtN;
      p.rotation += p.spin * dt;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.activeCount--;
      }
    }
  }

  private emit(mx: number, my: number, pitch: number, rms: number): void {
    const p = this.acquire();
    if (!p) return;

    const angle = Math.random() * Math.PI * 2;
    const spd = SCATTER * (0.5 + Math.random() * 0.8);

    p.x = mx + (Math.random() - 0.5) * 12;
    p.y = my + (Math.random() - 0.5) * 12;
    p.vx = Math.cos(angle) * spd;
    p.vy = Math.sin(angle) * spd;
    p.life = LIFE_MIN + Math.random() * (LIFE_MAX - LIFE_MIN);
    p.maxLife = p.life;
    p.size = SIZE_MIN + Math.random() * (SIZE_MAX - SIZE_MIN) + rms * 10;
    p.hue = pitchToHue(pitch) + (Math.random() - 0.5) * 60;
    p.rotation = (Math.random() - 0.5) * 0.8;
    p.spin = (Math.random() - 0.5) * 1.2;
    p.active = true;
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const p of this.pool) {
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      if (t < 0.02) continue;

      const sz = p.size * (0.5 + t * 0.5);
      const alpha = t * t;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.scale(sz / 20, sz / 20); // normalize to ~20px reference

      // Draw note shape
      this.drawNote(ctx, p.hue, alpha);

      ctx.restore();
    }

    ctx.restore();
  }

  private drawNote(ctx: CanvasRenderingContext2D, hue: number, alpha: number): void {
    const color = hslToString(hue, 85, 70, alpha);
    const coreColor = hslToString(hue, 60, 90, alpha * 0.8);

    // Note head (filled ellipse)
    ctx.save();
    ctx.translate(-2, 8);
    ctx.rotate(-0.3);
    ctx.scale(1, 0.75);
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    // Bright core
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = coreColor;
    ctx.fill();
    ctx.restore();

    // Stem
    ctx.beginPath();
    ctx.moveTo(3.5, 7);
    ctx.lineTo(3.5, -10);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = color;
    ctx.stroke();

    // Flag (wavy)
    ctx.beginPath();
    ctx.moveTo(3.5, -10);
    ctx.bezierCurveTo(10, -8, 8, -3, 12, -1);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = color;
    ctx.stroke();

    // Glow around the head
    const grad = ctx.createRadialGradient(-2, 8, 0, -2, 8, 12);
    grad.addColorStop(0, hslToString(hue, 80, 70, alpha * 0.3));
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(-2, 8, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  private acquire(): NoteParticle | null {
    if (this.activeCount >= MAX_NOTES) return null;
    for (let i = this.freeHint; i < this.pool.length; i++) {
      if (!this.pool[i].active) {
        this.activeCount++;
        this.freeHint = i + 1;
        return this.pool[i];
      }
    }
    for (let i = 0; i < this.freeHint; i++) {
      if (!this.pool[i].active) {
        this.activeCount++;
        this.freeHint = i + 1;
        return this.pool[i];
      }
    }
    return null;
  }
}
