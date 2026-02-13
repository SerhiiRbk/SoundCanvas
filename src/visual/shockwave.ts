/**
 * Shockwave — expanding bass rings + subtle screen shake.
 *
 * Triggered on low-energy spikes. Max 3 concurrent waves.
 */

const MAX_WAVES = 3;
const WAVE_SPEED = 400; // px/s
const WAVE_LIFETIME = 1.2; // seconds
const MAX_RADIUS = 400;

interface Wave {
  x: number;
  y: number;
  startTime: number;
  intensity: number;
}

export class Shockwave {
  private enabled = false;
  private waves: Wave[] = [];
  private lastTrigger = 0;
  private shakeOffset = { x: 0, y: 0 };

  setEnabled(on: boolean): void { this.enabled = on; }
  isEnabled(): boolean { return this.enabled; }

  /** Get current screen shake offset (apply to canvas translate) */
  getShakeOffset(): { x: number; y: number } { return this.shakeOffset; }

  /** Trigger a shockwave at cursor position */
  trigger(x: number, y: number, intensity: number): void {
    const now = performance.now() / 1000;
    if (now - this.lastTrigger < 0.3) return; // debounce
    this.lastTrigger = now;
    if (this.waves.length >= MAX_WAVES) this.waves.shift();
    this.waves.push({ x, y, startTime: now, intensity: Math.min(1, intensity) });
  }

  update(dt: number): void {
    const now = performance.now() / 1000;

    // Update screen shake
    let shakeX = 0, shakeY = 0;
    for (const w of this.waves) {
      const age = now - w.startTime;
      if (age < 0.15) {
        const shakeMag = w.intensity * 2 * (1 - age / 0.15);
        shakeX += Math.sin(age * 50) * shakeMag;
        shakeY += Math.cos(age * 50) * shakeMag;
      }
    }
    this.shakeOffset = { x: shakeX, y: shakeY };

    // Remove expired waves
    this.waves = this.waves.filter((w) => now - w.startTime < WAVE_LIFETIME);
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.enabled || this.waves.length === 0) return;

    const now = performance.now() / 1000;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const w of this.waves) {
      const age = now - w.startTime;
      const radius = Math.min(MAX_RADIUS, age * WAVE_SPEED);
      const alpha = Math.exp(-age / 0.6) * w.intensity * 0.5;
      if (alpha < 0.01) continue;

      const ringWidth = 3 + w.intensity * 4;

      // Outer ring
      ctx.strokeStyle = `hsla(200, 80%, 70%, ${alpha})`;
      ctx.lineWidth = ringWidth;
      ctx.beginPath();
      ctx.arc(w.x, w.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      // Inner chromatic ring (slight color shift)
      ctx.strokeStyle = `hsla(280, 70%, 60%, ${alpha * 0.6})`;
      ctx.lineWidth = ringWidth * 0.5;
      ctx.beginPath();
      ctx.arc(w.x, w.y, radius * 0.95, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}
