/**
 * DepthParallax — 3-layer background particles with pseudo-Z depth.
 *
 * Far, mid, near layers with different sizes, speeds, and parallax factors.
 */

interface ParallaxDot {
  x: number;
  y: number;
  baseAlpha: number;
  size: number;
  hue: number;
}

interface ParallaxLayer {
  z: number;
  parallaxFactor: number;
  dots: ParallaxDot[];
  blur: number;
  baseAlpha: number;
}

const LAYER_CONFIGS = [
  { z: 3, parallax: 0.02, count: 80, sizeRange: [0.5, 1.2], alpha: 0.15, blur: 2 },
  { z: 2, parallax: 0.06, count: 50, sizeRange: [1, 2.5], alpha: 0.3, blur: 1 },
  { z: 1, parallax: 0.12, count: 30, sizeRange: [2, 4], alpha: 0.5, blur: 0 },
];

export class DepthParallax {
  private enabled = false;
  private layers: ParallaxLayer[] = [];
  private initialized = false;

  setEnabled(on: boolean): void { this.enabled = on; }
  isEnabled(): boolean { return this.enabled; }

  private initLayers(w: number, h: number): void {
    this.layers = LAYER_CONFIGS.map((cfg) => {
      const dots: ParallaxDot[] = [];
      for (let i = 0; i < cfg.count; i++) {
        dots.push({
          x: Math.random() * w,
          y: Math.random() * h,
          baseAlpha: cfg.alpha * (0.5 + Math.random() * 0.5),
          size: cfg.sizeRange[0] + Math.random() * (cfg.sizeRange[1] - cfg.sizeRange[0]),
          hue: 200 + Math.random() * 60,
        });
      }
      return { z: cfg.z, parallaxFactor: cfg.parallax, dots, blur: cfg.blur, baseAlpha: cfg.alpha };
    });
    this.initialized = true;
  }

  render(
    ctx: CanvasRenderingContext2D,
    w: number, h: number,
    mx: number, my: number,
    rms: number,
  ): void {
    if (!this.enabled) return;
    if (!this.initialized) this.initLayers(w, h);

    const cx = w / 2, cy = h / 2;

    ctx.save();
    for (const layer of this.layers) {
      const offX = (mx - cx) * layer.parallaxFactor;
      const offY = (my - cy) * layer.parallaxFactor;

      for (const dot of layer.dots) {
        const dx = dot.x + offX;
        const dy = dot.y + offY;

        // Wrap around screen
        const wx = ((dx % w) + w) % w;
        const wy = ((dy % h) + h) % h;

        const pulse = dot.baseAlpha * (0.8 + rms * 0.4);
        ctx.fillStyle = `hsla(${dot.hue}, 50%, 70%, ${pulse})`;
        ctx.beginPath();
        ctx.arc(wx, wy, dot.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
