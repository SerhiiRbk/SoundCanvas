/**
 * ModulationPortal — color palette transition on key change.
 *
 * Radial wipe with hue shift when key modulates.
 */

const PORTAL_DURATION = 2.0; // seconds

export class ModulationPortal {
  private enabled = false;
  private active = false;
  private startTime = 0;
  private hueShift = 0;

  setEnabled(on: boolean): void { this.enabled = on; }
  isEnabled(): boolean { return this.enabled; }

  /** Trigger a modulation portal effect */
  triggerModulation(oldRoot: number, newRoot: number): void {
    if (!this.enabled) return;
    this.active = true;
    this.startTime = performance.now() / 1000;
    this.hueShift = ((newRoot - oldRoot + 12) % 12) * 30;
  }

  /** Get the current global hue offset to apply to all visuals */
  getHueOffset(): number {
    if (!this.active) return 0;
    const age = performance.now() / 1000 - this.startTime;
    if (age > PORTAL_DURATION) { this.active = false; return this.hueShift; }
    return (age / PORTAL_DURATION) * this.hueShift;
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!this.enabled || !this.active) return;

    const age = performance.now() / 1000 - this.startTime;
    if (age > PORTAL_DURATION) { this.active = false; return; }

    const progress = age / PORTAL_DURATION;
    const cx = w / 2, cy = h / 2;
    const maxR = Math.hypot(w, h) / 2;
    const radius = progress * maxR;
    const alpha = 0.15 * (1 - progress);

    if (alpha < 0.005) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createRadialGradient(cx, cy, Math.max(0, radius - 30), cx, cy, radius);
    grad.addColorStop(0, `hsla(${this.hueShift + 180}, 70%, 60%, 0)`);
    grad.addColorStop(0.5, `hsla(${this.hueShift + 180}, 80%, 70%, ${alpha})`);
    grad.addColorStop(1, `hsla(${this.hueShift}, 70%, 60%, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}
