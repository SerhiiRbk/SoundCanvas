/**
 * Post-Processing v2 — Radial Blur + Bloom.
 *
 * Radial blur (zoom blur):
 *   Captures the current frame, then composites it back multiple times
 *   at increasing scale from a center point with additive blending.
 *   Creates streaks radiating outward — the "Electric Flower" effect.
 *
 * Bloom:
 *   Multi-pass downscale/upscale with additive composite for soft glow.
 */

export class PostProcessing {
  /* ── Offscreen canvases ── */
  private blurCanvas: HTMLCanvasElement;
  private blurCtx: CanvasRenderingContext2D;
  private bloomCanvas: HTMLCanvasElement;
  private bloomCtx: CanvasRenderingContext2D;

  /* ── Config ── */
  private radialBlurEnabled = true;
  private radialBlurStrength = 0.06;   // max zoom factor (0.03–0.12)
  private radialBlurPasses = 12;
  private bloomEnabled = true;
  private bloomIntensity = 0.5;

  constructor(width: number, height: number) {
    this.blurCanvas = document.createElement('canvas');
    this.blurCanvas.width = width;
    this.blurCanvas.height = height;
    this.blurCtx = this.blurCanvas.getContext('2d', { willReadFrequently: false })!;

    this.bloomCanvas = document.createElement('canvas');
    this.bloomCanvas.width = width;
    this.bloomCanvas.height = height;
    this.bloomCtx = this.bloomCanvas.getContext('2d', { willReadFrequently: false })!;
  }

  /* ═══════════ Config setters ═══════════ */

  setRadialBlurEnabled(on: boolean): void { this.radialBlurEnabled = on; }
  setRadialBlurStrength(v: number): void { this.radialBlurStrength = Math.max(0, Math.min(0.15, v)); }
  setRadialBlurPasses(n: number): void { this.radialBlurPasses = Math.max(4, Math.min(20, n)); }
  setBloomEnabled(on: boolean): void { this.bloomEnabled = on; }
  setBloomIntensity(v: number): void { this.bloomIntensity = Math.max(0, Math.min(1, v)); }

  /* ═══════════ Main pipeline ═══════════ */

  /**
   * Apply radial blur + bloom to the main canvas.
   * @param cx radial blur center X (typically cursor X or canvas center)
   * @param cy radial blur center Y
   * @param audioBoost 0–1 extra strength from RMS amplitude
   */
  apply(
    mainCtx: CanvasRenderingContext2D,
    mainCanvas: HTMLCanvasElement,
    cx: number,
    cy: number,
    audioBoost: number = 0,
  ): void {
    if (this.radialBlurEnabled) {
      this.applyRadialBlur(mainCtx, mainCanvas, cx, cy, audioBoost);
    }
    if (this.bloomEnabled) {
      this.applyBloom(mainCtx, mainCanvas);
    }
  }

  /* ═══════════ Radial Blur ═══════════ */

  private applyRadialBlur(
    mainCtx: CanvasRenderingContext2D,
    mainCanvas: HTMLCanvasElement,
    cx: number,
    cy: number,
    audioBoost: number,
  ): void {
    const w = mainCanvas.width;
    const h = mainCanvas.height;
    this.ensureSize(this.blurCanvas, w, h);

    // Capture current frame
    this.blurCtx.clearRect(0, 0, w, h);
    this.blurCtx.drawImage(mainCanvas, 0, 0);

    // Effective strength: base + audio-reactive boost
    const strength = this.radialBlurStrength + audioBoost * 0.04;
    const passes = this.radialBlurPasses;

    for (let i = 1; i <= passes; i++) {
      const t = i / passes;
      const scale = 1 + t * strength;

      // Alpha envelope: stronger near center, fading outward.
      // Using a quadratic falloff for a natural look.
      const alpha = 0.18 * Math.pow(1 - t * 0.5, 2);
      if (alpha < 0.005) continue;

      mainCtx.save();
      mainCtx.globalCompositeOperation = 'lighter';
      mainCtx.globalAlpha = alpha;
      mainCtx.translate(cx, cy);
      mainCtx.scale(scale, scale);
      mainCtx.translate(-cx, -cy);
      mainCtx.drawImage(this.blurCanvas, 0, 0);
      mainCtx.restore();
    }
  }

  /* ═══════════ Bloom ═══════════ */

  private applyBloom(
    mainCtx: CanvasRenderingContext2D,
    mainCanvas: HTMLCanvasElement,
  ): void {
    if (this.bloomIntensity < 0.01) return;

    const w = mainCanvas.width;
    const h = mainCanvas.height;
    this.ensureSize(this.bloomCanvas, w, h);

    // Pass 1: 1/4 scale (soft glow)
    this.bloomPass(mainCtx, mainCanvas, w, h, 0.25, this.bloomIntensity * 0.45);

    // Pass 2: 1/8 scale (wider glow)
    if (this.bloomIntensity > 0.25) {
      this.bloomPass(mainCtx, mainCanvas, w, h, 0.125, this.bloomIntensity * 0.3);
    }

    // Pass 3: 1/16 scale (very wide haze)
    if (this.bloomIntensity > 0.5) {
      this.bloomPass(mainCtx, mainCanvas, w, h, 0.0625, this.bloomIntensity * 0.15);
    }
  }

  private bloomPass(
    mainCtx: CanvasRenderingContext2D,
    mainCanvas: HTMLCanvasElement,
    w: number,
    h: number,
    scale: number,
    alpha: number,
  ): void {
    const sw = Math.max(1, Math.floor(w * scale));
    const sh = Math.max(1, Math.floor(h * scale));

    this.bloomCtx.clearRect(0, 0, w, h);
    // Downscale
    this.bloomCtx.drawImage(mainCanvas, 0, 0, sw, sh);
    // Upscale (natural box-blur)
    this.bloomCtx.drawImage(this.bloomCanvas, 0, 0, sw, sh, 0, 0, w, h);

    mainCtx.save();
    mainCtx.globalCompositeOperation = 'lighter';
    mainCtx.globalAlpha = alpha;
    mainCtx.drawImage(this.bloomCanvas, 0, 0);
    mainCtx.restore();
  }

  /* ═══════════ Resize ═══════════ */

  resize(width: number, height: number): void {
    this.blurCanvas.width = width;
    this.blurCanvas.height = height;
    this.bloomCanvas.width = width;
    this.bloomCanvas.height = height;
  }

  /* ═══════════ Helpers ═══════════ */

  private ensureSize(canvas: HTMLCanvasElement, w: number, h: number): void {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
}
