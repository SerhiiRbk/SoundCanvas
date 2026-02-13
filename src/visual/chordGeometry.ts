/**
 * ChordGeometry — geometric overlay on chord change.
 *
 * Major → triangle, Minor → inverted triangle, 7th → diamond,
 * dim → X shape, aug → hexagon.
 */

import type { ChordQuality } from '../music/harmonyEngine';

interface ActiveShape {
  quality: ChordQuality;
  rootPitch: number;
  startTime: number;
  cx: number;
  cy: number;
}

const SHAPE_DURATION = 1.8; // seconds
const MAX_SIZE = 80;

export class ChordGeometry {
  private enabled = false;
  private activeShape: ActiveShape | null = null;

  setEnabled(on: boolean): void { this.enabled = on; }
  isEnabled(): boolean { return this.enabled; }

  /** Trigger a shape on chord change */
  triggerChord(quality: ChordQuality, rootPitch: number, cx: number, cy: number): void {
    this.activeShape = { quality, rootPitch, startTime: performance.now() / 1000, cx, cy };
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number, rms: number): void {
    if (!this.enabled || !this.activeShape) return;

    const now = performance.now() / 1000;
    const age = now - this.activeShape.startTime;
    if (age > SHAPE_DURATION) { this.activeShape = null; return; }

    const { quality, rootPitch, cx, cy } = this.activeShape;
    const progress = age / SHAPE_DURATION;
    const scale = Math.min(1, age / 0.3); // grow in 0.3s
    const alpha = Math.max(0, 1 - progress * 0.8);
    const size = (MAX_SIZE + rms * 30) * scale;
    const hue = (rootPitch % 12) * 30;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `hsla(${hue}, 70%, 70%, ${alpha * 0.7})`;
    ctx.fillStyle = `hsla(${hue}, 60%, 60%, ${alpha * 0.15})`;
    ctx.lineWidth = 2;
    ctx.beginPath();

    switch (quality) {
      case 'major':
      case 'maj7':
        this.drawPolygon(ctx, 3, size, 0);
        break;
      case 'minor':
      case 'min7':
        this.drawPolygon(ctx, 3, size, Math.PI); // inverted
        break;
      case 'dom7':
        this.drawPolygon(ctx, 4, size, Math.PI / 4); // diamond
        break;
      case 'dim':
        this.drawX(ctx, size);
        break;
      case 'aug':
        this.drawPolygon(ctx, 6, size, 0);
        break;
      default:
        this.drawPolygon(ctx, 3, size, 0);
    }

    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawPolygon(ctx: CanvasRenderingContext2D, sides: number, r: number, offset: number): void {
    for (let i = 0; i <= sides; i++) {
      const angle = offset + (i / sides) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  private drawX(ctx: CanvasRenderingContext2D, r: number): void {
    ctx.moveTo(-r, -r); ctx.lineTo(r, r);
    ctx.moveTo(r, -r); ctx.lineTo(-r, r);
  }
}
