/**
 * Constellations — notes as stars, chords as connected lines.
 *
 * Recent notes appear as glowing star points. Notes sharing the same chord
 * are connected with fading lines. I chord forms a stable pattern.
 */

interface StarNote {
  x: number;
  y: number;
  pitch: number;
  chordIndex: number;
  time: number;
}

const MAX_STARS = 32;
const STAR_LIFETIME = 6; // seconds
const LINE_LIFETIME = 4;

export class Constellations {
  private enabled = false;
  private stars: StarNote[] = [];

  setEnabled(on: boolean): void { this.enabled = on; }
  isEnabled(): boolean { return this.enabled; }

  /** Add a note as a constellation star */
  addStar(x: number, y: number, pitch: number, chordIndex: number): void {
    this.stars.push({ x, y, pitch, chordIndex, time: performance.now() / 1000 });
    if (this.stars.length > MAX_STARS) this.stars.shift();
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!this.enabled || this.stars.length === 0) return;

    const now = performance.now() / 1000;
    ctx.save();

    // Remove expired stars
    this.stars = this.stars.filter((s) => now - s.time < STAR_LIFETIME);

    // Draw connecting lines between same-chord stars
    ctx.lineWidth = 1;
    for (let i = 0; i < this.stars.length; i++) {
      for (let j = i + 1; j < this.stars.length; j++) {
        const a = this.stars[i], b = this.stars[j];
        if (a.chordIndex !== b.chordIndex) continue;
        const age = Math.max(now - a.time, now - b.time);
        if (age > LINE_LIFETIME) continue;
        const alpha = Math.exp(-age / 2) * 0.4;
        const hue = (a.pitch % 12) * 30;
        ctx.strokeStyle = `hsla(${hue}, 60%, 65%, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // Draw star points
    for (const s of this.stars) {
      const age = now - s.time;
      const alpha = Math.exp(-age / 3);
      const hue = (s.pitch % 12) * 30;
      const size = 2 + alpha * 3;

      // Glow
      ctx.globalCompositeOperation = 'lighter';
      const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, size * 3);
      grad.addColorStop(0, `hsla(${hue}, 70%, 80%, ${alpha * 0.6})`);
      grad.addColorStop(1, `hsla(${hue}, 70%, 80%, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(s.x - size * 3, s.y - size * 3, size * 6, size * 6);

      // Core
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `hsla(${hue}, 80%, 90%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
