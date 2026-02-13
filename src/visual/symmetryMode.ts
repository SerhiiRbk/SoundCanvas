/**
 * SymmetryMode — mirror / radial mandala rendering.
 *
 * Modes: off → horizontal → 4-fold radial → 8-fold radial → off
 */

export type SymmetryType = 'off' | 'horizontal' | 'radial4' | 'radial8';

const MODES: SymmetryType[] = ['off', 'horizontal', 'radial4', 'radial8'];

export class SymmetryMode {
  private mode: SymmetryType = 'off';
  private offCanvas: OffscreenCanvas | null = null;
  private offCtx: OffscreenCanvasRenderingContext2D | null = null;

  getMode(): SymmetryType { return this.mode; }
  setMode(m: SymmetryType): void { this.mode = m; }

  /** Cycle through symmetry modes */
  cycle(): SymmetryType {
    const idx = MODES.indexOf(this.mode);
    this.mode = MODES[(idx + 1) % MODES.length];
    return this.mode;
  }

  isActive(): boolean { return this.mode !== 'off'; }

  /**
   * Apply symmetry effect. Call AFTER all rendering.
   * Captures current canvas and redraws with symmetry transforms.
   */
  apply(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.mode === 'off') return;

    // Ensure offscreen canvas matches
    if (!this.offCanvas || this.offCanvas.width !== w || this.offCanvas.height !== h) {
      this.offCanvas = new OffscreenCanvas(w, h);
      this.offCtx = this.offCanvas.getContext('2d');
    }
    if (!this.offCtx) return;

    // Copy current frame
    this.offCtx.clearRect(0, 0, w, h);
    this.offCtx.drawImage(ctx.canvas, 0, 0);

    switch (this.mode) {
      case 'horizontal':
        this.applyHorizontal(ctx, w, h);
        break;
      case 'radial4':
        this.applyRadial(ctx, w, h, 4);
        break;
      case 'radial8':
        this.applyRadial(ctx, w, h, 8);
        break;
    }
  }

  private applyHorizontal(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(this.offCanvas!, 0, 0);
    ctx.restore();
  }

  private applyRadial(ctx: CanvasRenderingContext2D, w: number, h: number, folds: number): void {
    const cx = w / 2, cy = h / 2;
    ctx.save();
    ctx.globalAlpha = 0.5;

    for (let i = 1; i < folds; i++) {
      const angle = (i / folds) * Math.PI * 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      if (i % 2 === 1) ctx.scale(1, -1); // alternate mirror
      ctx.translate(-cx, -cy);
      ctx.drawImage(this.offCanvas!, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }
}
