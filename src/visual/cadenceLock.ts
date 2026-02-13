/**
 * CadenceLock — visual convergence + flash on tonic resolution.
 *
 * When a cadence is detected (progression returns to I, melody on tonic/fifth),
 * trails converge to center, soft white flash, background brightens.
 */

const LOCK_DURATION = 1.5; // seconds
const FLASH_PEAK = 0.3; // seconds

export class CadenceLock {
  private enabled = false;
  private active = false;
  private startTime = 0;

  setEnabled(on: boolean): void { this.enabled = on; }
  isEnabled(): boolean { return this.enabled; }

  /** Trigger the cadence lock effect */
  trigger(): void {
    if (!this.enabled) return;
    this.active = true;
    this.startTime = performance.now() / 1000;
  }

  /** Get convergence factor (0 = none, 1 = full pull to center) */
  getConvergence(): number {
    if (!this.active) return 0;
    const age = performance.now() / 1000 - this.startTime;
    if (age > LOCK_DURATION) { this.active = false; return 0; }
    // Bell curve: peaks at 0.5s
    return Math.exp(-((age - 0.5) ** 2) / 0.15) * 0.6;
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!this.enabled || !this.active) return;

    const age = performance.now() / 1000 - this.startTime;
    if (age > LOCK_DURATION) { this.active = false; return; }

    const cx = w / 2, cy = h / 2;

    // White flash
    if (age < FLASH_PEAK * 2) {
      const flashAlpha = age < FLASH_PEAK
        ? (age / FLASH_PEAK) * 0.25
        : 0.25 * (1 - (age - FLASH_PEAK) / FLASH_PEAK);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.5);
      grad.addColorStop(0, `rgba(255, 255, 255, ${flashAlpha})`);
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // Subtle lines converging to center
    const lineAlpha = Math.exp(-age / 0.8) * 0.3;
    if (lineAlpha > 0.01) {
      ctx.save();
      ctx.strokeStyle = `rgba(200, 220, 255, ${lineAlpha})`;
      ctx.lineWidth = 1;
      const N = 12;
      for (let i = 0; i < N; i++) {
        const angle = (i / N) * Math.PI * 2;
        const r = Math.max(w, h) * 0.6 * (1 - age / LOCK_DURATION);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
        ctx.lineTo(cx, cy);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
