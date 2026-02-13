/**
 * LightWarp — screen-space distortion on bass.
 *
 * When low-frequency energy is high, pixels are displaced toward the cursor.
 * Uses an offscreen canvas for the warp sampling.
 */

export class LightWarp {
  private enabled = false;
  private offCanvas: OffscreenCanvas | null = null;
  private offCtx: OffscreenCanvasRenderingContext2D | null = null;

  setEnabled(on: boolean): void { this.enabled = on; }
  isEnabled(): boolean { return this.enabled; }

  /**
   * Apply warp distortion. Call AFTER all other rendering, BEFORE post-fx.
   * Reads from `sourceCtx`, writes warped result back.
   */
  apply(
    ctx: CanvasRenderingContext2D,
    w: number, h: number,
    mx: number, my: number,
    lowEnergy: number,
  ): void {
    if (!this.enabled || lowEnergy < 0.15) return;

    // Lazily create offscreen canvas
    if (!this.offCanvas || this.offCanvas.width !== w || this.offCanvas.height !== h) {
      this.offCanvas = new OffscreenCanvas(w, h);
      this.offCtx = this.offCanvas.getContext('2d');
    }
    if (!this.offCtx) return;

    const intensity = Math.min(1, (lowEnergy - 0.15) * 2.5);
    const maxDisplace = intensity * 12; // max pixel displacement

    // Copy current frame to offscreen
    this.offCtx.drawImage(ctx.canvas, 0, 0);

    // Clear and redraw with radial displacement using scaled slices
    ctx.clearRect(0, 0, w, h);

    const SLICES = 8;
    for (let i = 0; i < SLICES; i++) {
      const angle = (i / SLICES) * Math.PI * 2;
      const nextAngle = ((i + 1) / SLICES) * Math.PI * 2;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.arc(mx, my, Math.max(w, h) * 1.5, angle, nextAngle);
      ctx.closePath();
      ctx.clip();

      // Displace each slice slightly toward center
      const dx = Math.cos((angle + nextAngle) / 2) * maxDisplace * -0.5;
      const dy = Math.sin((angle + nextAngle) / 2) * maxDisplace * -0.5;
      ctx.drawImage(this.offCanvas, dx, dy);

      ctx.restore();
    }
  }
}
