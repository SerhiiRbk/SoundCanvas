/**
 * HarmonyOrbit — chord-driven orbital rings around screen center.
 *
 * Each chord creates a rotating ring; chord change triggers transition.
 */

interface OrbitRing {
  degree: number; // chord degree 0..6
  hue: number;
  radius: number;
  speed: number;  // rad/s
  alpha: number;
  startTime: number;
  fading: boolean;
}

const BASE_RADIUS = [80, 120, 160, 200, 140, 180, 100]; // per degree
const ORBIT_LIFETIME = 8; // seconds before natural fade

export class HarmonyOrbit {
  private enabled = false;
  private rings: OrbitRing[] = [];

  setEnabled(on: boolean): void { this.enabled = on; }
  isEnabled(): boolean { return this.enabled; }

  /** Trigger new orbit ring for chord degree */
  setChord(degree: number, rootPitch: number): void {
    // Fade old rings
    for (const r of this.rings) r.fading = true;

    const hue = (rootPitch % 12) * 30;
    const radius = BASE_RADIUS[degree % BASE_RADIUS.length];
    // Higher tension chords rotate faster
    const tension = degree === 0 ? 0.3 : degree === 4 ? 0.5 : 0.7;
    this.rings.push({
      degree,
      hue,
      radius,
      speed: 0.3 + tension * 0.8,
      alpha: 0.4,
      startTime: performance.now() / 1000,
      fading: false,
    });

    // Keep pool small
    if (this.rings.length > 4) this.rings.shift();
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!this.enabled || this.rings.length === 0) return;

    const now = performance.now() / 1000;
    const cx = w / 2, cy = h / 2;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    this.rings = this.rings.filter((r) => {
      const age = now - r.startTime;
      if (age > ORBIT_LIFETIME) return false;

      let alpha = r.alpha;
      if (r.fading) alpha *= Math.exp(-(age - 0) / 1.5);
      else alpha *= Math.min(1, age / 0.5); // fade in

      if (alpha < 0.01) return false;

      const angle = age * r.speed;
      ctx.strokeStyle = `hsla(${r.hue}, 60%, 65%, ${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.ellipse(cx, cy, r.radius, r.radius * 0.6, angle, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Small dot on orbit
      const dotX = cx + Math.cos(angle * 3) * r.radius;
      const dotY = cy + Math.sin(angle * 3) * r.radius * 0.6;
      ctx.fillStyle = `hsla(${r.hue}, 80%, 80%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
      ctx.fill();

      return true;
    });

    ctx.restore();
  }
}
