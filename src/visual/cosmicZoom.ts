/**
 * CosmicZoom — pull-back to galaxy view at end of recording.
 *
 * Over 3 seconds: scale down, add swirling galaxy particles, final glow.
 */

const ZOOM_DURATION = 3.0;
const GALAXY_PARTICLES = 200;

interface GalaxyDot {
  angle: number;
  radius: number;
  speed: number;
  size: number;
  hue: number;
  alpha: number;
}

export class CosmicZoom {
  private active = false;
  private startTime = 0;
  private galaxyDots: GalaxyDot[] = [];
  private onComplete: (() => void) | null = null;

  isActive(): boolean { return this.active; }

  /** Start the cosmic zoom effect */
  start(onComplete?: () => void): void {
    if (this.active) return;
    this.active = true;
    this.startTime = performance.now() / 1000;
    this.onComplete = onComplete ?? null;

    // Generate galaxy particles
    this.galaxyDots = [];
    for (let i = 0; i < GALAXY_PARTICLES; i++) {
      const arm = Math.floor(Math.random() * 3);
      const baseAngle = (arm / 3) * Math.PI * 2;
      this.galaxyDots.push({
        angle: baseAngle + (Math.random() - 0.5) * 0.8,
        radius: 10 + Math.random() * 200,
        speed: 0.2 + Math.random() * 0.5,
        size: 0.5 + Math.random() * 2,
        hue: 200 + Math.random() * 80,
        alpha: 0.3 + Math.random() * 0.5,
      });
    }
  }

  /** Get current scale factor for all visual elements */
  getScale(): number {
    if (!this.active) return 1;
    const age = performance.now() / 1000 - this.startTime;
    if (age > ZOOM_DURATION) return 1 / (1 + ZOOM_DURATION * 2);
    return 1 / (1 + age * 2);
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!this.active) return;

    const age = performance.now() / 1000 - this.startTime;
    if (age > ZOOM_DURATION) {
      this.active = false;
      this.onComplete?.();
      return;
    }

    const progress = age / ZOOM_DURATION;
    const cx = w / 2, cy = h / 2;

    // Galaxy particles appear and swirl
    const galaxyAlpha = Math.min(1, progress * 3); // fade in quickly

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const dot of this.galaxyDots) {
      const a = dot.angle + age * dot.speed;
      // Spiral: radius increases with angle
      const r = dot.radius * (0.3 + progress * 0.7);
      const dx = Math.cos(a) * r;
      const dy = Math.sin(a) * r * 0.5; // flatten for galaxy look

      const alpha = dot.alpha * galaxyAlpha * (1 - progress * 0.3);
      ctx.fillStyle = `hsla(${dot.hue}, 60%, 75%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(cx + dx, cy + dy, dot.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Central glow
    const glowSize = 30 + progress * 50;
    const glowAlpha = 0.3 * galaxyAlpha;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowSize);
    grad.addColorStop(0, `rgba(200, 220, 255, ${glowAlpha})`);
    grad.addColorStop(1, 'rgba(200, 220, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - glowSize, cy - glowSize, glowSize * 2, glowSize * 2);

    ctx.restore();
  }
}
