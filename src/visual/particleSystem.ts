/**
 * Particle System v3 — object-pooled, no shadowBlur.
 *
 * On noteOn: burst of N particles at cursor position.
 * Radial emission, drag, gravity, linear life decay.
 * Renders as simple filled circles with additive blending.
 */

import {
  MAX_PARTICLES,
  PARTICLE_BASE_COUNT,
  PARTICLE_VELOCITY_SCALE,
  PARTICLE_SPEED_MIN,
  PARTICLE_SPEED_MAX,
  PARTICLE_GRAVITY,
} from '../config';
import type { Particle } from '../composer/composerTypes';
import { pitchToHue } from './colorMapping';

const DRAG = 0.985;

export class ParticleSystem {
  private pool: Particle[];
  private activeCount = 0;
  private freeHint = 0;

  constructor() {
    this.pool = Array.from({ length: MAX_PARTICLES }, () => ({
      x: 0, y: 0, vx: 0, vy: 0,
      life: 0, maxLife: 1, size: 0,
      hue: 0, saturation: 70, lightness: 60,
      active: false,
    }));
  }

  emit(
    x: number, y: number,
    pitch: number,
    velocity: number,      // 0–1
    melodicStability: number,
  ): void {
    const factor = 1 - melodicStability * 0.4;
    const count = Math.round((PARTICLE_BASE_COUNT + velocity * PARTICLE_VELOCITY_SCALE) * factor);
    const hue = pitchToHue(pitch);

    for (let i = 0; i < count; i++) {
      const p = this.acquire();
      if (!p) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = PARTICLE_SPEED_MIN
        + Math.random() * (PARTICLE_SPEED_MAX - PARTICLE_SPEED_MIN) * (0.5 + velocity * 0.5);

      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = 0.5 + Math.random() * 0.8;
      p.maxLife = p.life;
      p.size = 1.5 + Math.random() * 2.5 + velocity * 3;
      p.hue = hue + (Math.random() - 0.5) * 25;
      p.saturation = 70;
      p.lightness = 60;
      p.active = true;
    }
  }

  update(dt: number, highEnergy: number = 0): void {
    const dtN = dt * 60;
    const grav = PARTICLE_GRAVITY * dtN;

    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      p.x += p.vx * dtN;
      p.y += p.vy * dtN;
      p.vx *= DRAG;
      p.vy *= DRAG;
      p.vy += grav;

      if (highEnergy > 0.1) {
        p.x += (Math.random() - 0.5) * highEnergy * 1.5;
        p.y += (Math.random() - 0.5) * highEnergy * 1.5;
      }

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.activeCount--;
        if (i < this.freeHint) this.freeHint = i;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      const t = p.life / p.maxLife;  // 1 → 0
      const size = p.size * t;
      const alpha = t;

      if (size < 0.3 || alpha < 0.03) continue;

      // Main circle (opaque color)
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, ${p.saturation}%, ${p.lightness}%, ${alpha})`;
      ctx.fill();

      // White core for larger particles
      if (size > 2.5) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, size * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.7})`;
        ctx.fill();
      }
    }

    ctx.restore();
  }

  getActiveCount(): number { return this.activeCount; }

  reset(): void {
    for (const p of this.pool) p.active = false;
    this.activeCount = 0;
    this.freeHint = 0;
  }

  private acquire(): Particle | null {
    if (this.activeCount >= MAX_PARTICLES) return null;
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
