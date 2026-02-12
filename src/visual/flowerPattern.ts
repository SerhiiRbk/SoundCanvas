/**
 * Flower Pattern — Electric Flower-style generative rotating curves.
 *
 * Creates multiple spiral arms that rotate continuously, with
 * sinusoidal petal modulation. Audio-reactive: amplitude drives
 * radius and brightness, pitch drives hue.
 *
 * Meant to be drawn BEFORE radial blur for the classic "zoom streak" look.
 */

import { pitchToHue, hslToString } from './colorMapping';

/* ── Config ── */
const ARMS = 5;
const STEPS_PER_ARM = 220;
const SPIRAL_TURNS = 3.5;          // how many times each arm winds
const PETAL_COUNT = 6;             // sinusoidal bumps per arm
const PETAL_PHASE_SPEED = 1.8;     // petal phase rotation speed
const ARM_ROTATION_SPEED = 0.35;   // base rotation (rad/s)
const BASE_MAX_RADIUS = 220;       // pixels, calm state
const AUDIO_RADIUS_BOOST = 160;    // extra radius from RMS
const LINE_WIDTH_MIN = 0.6;
const LINE_WIDTH_MAX = 2.2;
const BASE_ALPHA = 0.25;
const AUDIO_ALPHA_BOOST = 0.35;

export class FlowerPattern {
  private time = 0;
  private enabled = true;

  update(dt: number): void {
    this.time += dt;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  render(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rms: number,
    lowEnergy: number,
    highEnergy: number,
    pitch: number,
  ): void {
    if (!this.enabled) return;

    const t = this.time;
    const maxR = BASE_MAX_RADIUS + rms * AUDIO_RADIUS_BOOST + lowEnergy * 60;
    const alpha = BASE_ALPHA + rms * AUDIO_ALPHA_BOOST;
    const baseHue = pitchToHue(pitch);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let a = 0; a < ARMS; a++) {
      const armFrac = a / ARMS;
      const armAngleOffset = armFrac * Math.PI * 2 + t * ARM_ROTATION_SPEED;
      // Each arm gets a shifted hue
      const hue = (baseHue + a * (360 / ARMS) + t * 12) % 360;

      ctx.beginPath();

      for (let i = 0; i <= STEPS_PER_ARM; i++) {
        const s = i / STEPS_PER_ARM; // 0..1 along arm

        // Spiral angle (increases with s)
        const theta = armAngleOffset + s * Math.PI * 2 * SPIRAL_TURNS;

        // Petal modulation: sinusoidal bumps
        const petalPhase = s * Math.PI * PETAL_COUNT * 2 + t * PETAL_PHASE_SPEED + a;
        const petalAmp = s * maxR * 0.45 * (0.6 + lowEnergy * 0.4);
        const petal = Math.sin(petalPhase) * petalAmp;

        // Base radius: grows outward along the spiral
        const baseR = s * maxR * 0.55;
        const r = baseR + petal;

        // High energy causes micro-vibration
        const jitterX = highEnergy > 0.15 ? (Math.random() - 0.5) * highEnergy * 3 : 0;
        const jitterY = highEnergy > 0.15 ? (Math.random() - 0.5) * highEnergy * 3 : 0;

        const x = cx + Math.cos(theta) * r + jitterX;
        const y = cy + Math.sin(theta) * r + jitterY;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      // Fade arm along its length by using a gradient-like approach:
      // We draw the full arm with moderate alpha, then overlay a brighter inner portion.
      const lw = LINE_WIDTH_MIN + rms * (LINE_WIDTH_MAX - LINE_WIDTH_MIN);
      ctx.lineWidth = lw;
      ctx.strokeStyle = hslToString(hue, 75, 55, alpha * 0.6);
      ctx.stroke();

      // Brighter inner core (shorter, more saturated)
      ctx.beginPath();
      for (let i = 0; i <= Math.floor(STEPS_PER_ARM * 0.5); i++) {
        const s = i / STEPS_PER_ARM;
        const theta = armAngleOffset + s * Math.PI * 2 * SPIRAL_TURNS;
        const petalPhase = s * Math.PI * PETAL_COUNT * 2 + t * PETAL_PHASE_SPEED + a;
        const petalAmp = s * maxR * 0.45 * (0.6 + lowEnergy * 0.4);
        const petal = Math.sin(petalPhase) * petalAmp;
        const baseR = s * maxR * 0.55;
        const r = baseR + petal;
        const x = cx + Math.cos(theta) * r;
        const y = cy + Math.sin(theta) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineWidth = lw * 0.4;
      ctx.strokeStyle = hslToString(hue, 40, 85, alpha);
      ctx.stroke();
    }

    // Central bright dot
    const coreR = 4 + rms * 8;
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    coreGrad.addColorStop(0, `rgba(255, 255, 255, ${0.6 + rms * 0.3})`);
    coreGrad.addColorStop(0.4, hslToString(baseHue, 60, 70, 0.4));
    coreGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
