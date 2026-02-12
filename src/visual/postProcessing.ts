/**
 * Post Processing — Bloom + Gamma Correction + Motion Blur.
 *
 * Canvas 2D implementation:
 *  - Multi-pass bloom via downscale → upscale (3 passes at different radii)
 *  - shadowBlur + globalCompositeOperation = "lighter" for additive blending
 *  - Gamma correction applied on final composite
 *  - Motion blur via frame-blending (retains previous frame at low alpha)
 */

export class PostProcessing {
  // Off-screen canvases for bloom passes
  private bloomCanvas: HTMLCanvasElement;
  private bloomCtx: CanvasRenderingContext2D;
  // Off-screen canvas for motion blur accumulation
  private motionCanvas: HTMLCanvasElement;
  private motionCtx: CanvasRenderingContext2D;

  private bloomIntensity: number = 0.5;
  private motionBlurAmount: number = 0.0; // 0 = off, up to ~0.4
  private gammaValue: number = 1.0;       // 1.0 = neutral

  constructor(width: number, height: number) {
    this.bloomCanvas = document.createElement('canvas');
    this.bloomCanvas.width = width;
    this.bloomCanvas.height = height;
    this.bloomCtx = this.bloomCanvas.getContext('2d', { willReadFrequently: false })!;

    this.motionCanvas = document.createElement('canvas');
    this.motionCanvas.width = width;
    this.motionCanvas.height = height;
    this.motionCtx = this.motionCanvas.getContext('2d', { willReadFrequently: false })!;
  }

  // ─── Configuration ───

  setBloomIntensity(intensity: number): void {
    this.bloomIntensity = Math.max(0, Math.min(1, intensity));
  }

  setMotionBlurAmount(amount: number): void {
    this.motionBlurAmount = Math.max(0, Math.min(0.6, amount));
  }

  setGamma(gamma: number): void {
    this.gammaValue = Math.max(0.5, Math.min(2.5, gamma));
  }

  // ─── Main Processing Pipeline ───

  /**
   * Apply the full post-processing pipeline to the main canvas.
   * Call order: motion blur → bloom → gamma.
   */
  apply(
    mainCtx: CanvasRenderingContext2D,
    mainCanvas: HTMLCanvasElement
  ): void {
    // 1. Motion blur (blend previous frame underneath)
    this.applyMotionBlur(mainCtx, mainCanvas);

    // 2. Multi-pass bloom
    this.applyBloom(mainCtx, mainCanvas);

    // 3. Gamma correction
    this.applyGamma(mainCtx, mainCanvas);
  }

  // ─── Bloom ───

  /**
   * Multi-pass bloom: 3 downscale/upscale passes at decreasing resolution.
   * Each pass is composited with additive blending.
   */
  private applyBloom(
    mainCtx: CanvasRenderingContext2D,
    mainCanvas: HTMLCanvasElement
  ): void {
    if (this.bloomIntensity < 0.01) return;

    const w = mainCanvas.width;
    const h = mainCanvas.height;

    this.ensureSize(this.bloomCanvas, w, h);

    // Pass 1: 1/4 scale (soft glow)
    this.bloomPass(mainCtx, mainCanvas, w, h, 0.25, this.bloomIntensity * 0.55);

    // Pass 2: 1/8 scale (wider glow)
    if (this.bloomIntensity > 0.25) {
      this.bloomPass(mainCtx, mainCanvas, w, h, 0.125, this.bloomIntensity * 0.35);
    }

    // Pass 3: 1/16 scale (very wide haze)
    if (this.bloomIntensity > 0.5) {
      this.bloomPass(mainCtx, mainCanvas, w, h, 0.0625, this.bloomIntensity * 0.2);
    }
  }

  private bloomPass(
    mainCtx: CanvasRenderingContext2D,
    mainCanvas: HTMLCanvasElement,
    w: number,
    h: number,
    scale: number,
    alpha: number
  ): void {
    const sw = Math.max(1, Math.floor(w * scale));
    const sh = Math.max(1, Math.floor(h * scale));

    this.bloomCtx.clearRect(0, 0, w, h);
    // Down-sample
    this.bloomCtx.drawImage(mainCanvas, 0, 0, sw, sh);
    // Up-sample (natural box blur)
    this.bloomCtx.drawImage(this.bloomCanvas, 0, 0, sw, sh, 0, 0, w, h);

    // Composite onto main canvas
    mainCtx.save();
    mainCtx.globalCompositeOperation = 'lighter';
    mainCtx.globalAlpha = alpha;
    mainCtx.drawImage(this.bloomCanvas, 0, 0);
    mainCtx.restore();
  }

  // ─── Motion Blur ───

  /**
   * Simple frame-blending motion blur.
   * Retains previous frame content at low alpha underneath the current frame.
   */
  private applyMotionBlur(
    mainCtx: CanvasRenderingContext2D,
    mainCanvas: HTMLCanvasElement
  ): void {
    if (this.motionBlurAmount < 0.01) return;

    const w = mainCanvas.width;
    const h = mainCanvas.height;
    this.ensureSize(this.motionCanvas, w, h);

    // Draw previous accumulated frame underneath current at reduced alpha
    mainCtx.save();
    mainCtx.globalCompositeOperation = 'source-over';
    mainCtx.globalAlpha = this.motionBlurAmount;
    mainCtx.drawImage(this.motionCanvas, 0, 0);
    mainCtx.restore();

    // Capture current frame for next iteration
    this.motionCtx.clearRect(0, 0, w, h);
    this.motionCtx.drawImage(mainCanvas, 0, 0);
  }

  // ─── Gamma Correction ───

  /**
   * Apply gamma correction. Only active when gamma ≠ 1.0.
   * Uses a subtle brightness/contrast adjustment via compositing (avoids
   * expensive pixel-level ImageData manipulation each frame).
   *
   * gamma < 1 → brighter midtones (lift shadows)
   * gamma > 1 → darker midtones (crush shadows)
   */
  private applyGamma(
    mainCtx: CanvasRenderingContext2D,
    mainCanvas: HTMLCanvasElement
  ): void {
    if (Math.abs(this.gammaValue - 1.0) < 0.02) return;

    const w = mainCanvas.width;
    const h = mainCanvas.height;

    if (this.gammaValue < 1.0) {
      // Lighten: overlay a very dim white layer with 'lighter'
      const lift = (1.0 - this.gammaValue) * 0.08;
      mainCtx.save();
      mainCtx.globalCompositeOperation = 'lighter';
      mainCtx.fillStyle = `rgba(255, 255, 255, ${lift})`;
      mainCtx.fillRect(0, 0, w, h);
      mainCtx.restore();
    } else {
      // Darken: overlay a dim black layer with 'multiply'
      const crush = (this.gammaValue - 1.0) * 0.12;
      mainCtx.save();
      mainCtx.globalCompositeOperation = 'multiply';
      const v = Math.round(255 * (1 - crush));
      mainCtx.fillStyle = `rgb(${v}, ${v}, ${v})`;
      mainCtx.fillRect(0, 0, w, h);
      mainCtx.restore();
    }
  }

  // ─── Resize ───

  resize(width: number, height: number): void {
    this.bloomCanvas.width = width;
    this.bloomCanvas.height = height;
    this.motionCanvas.width = width;
    this.motionCanvas.height = height;
  }

  // ─── Helpers ───

  private ensureSize(canvas: HTMLCanvasElement, w: number, h: number): void {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
}
