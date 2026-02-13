/**
 * Electric Flower Pattern v2 — faithful reproduction of the WebGL Electric
 * Flower sample (webglsamples.org/electricflower/electricflower.html).
 *
 * Generates overlapping **rose curves** (r = cos(n·θ)) at multiple layers
 * with different petal counts, rotation speeds, and hue offsets. Each layer
 * draws with additive blending ("lighter") to create the characteristic
 * electric glow. When paired with Radial Blur post-processing, this
 * produces the signature "zoom streak" look of the original.
 *
 * Fully audio-reactive:
 *  - RMS drives overall radius and brightness
 *  - Low energy drives petal "breathing" amplitude
 *  - High energy adds micro-vibration jitter
 *  - Pitch drives base hue
 */

import { pitchToHue, hslToString } from './colorMapping';

/* ══════════════════════════════════════════════
   Configuration — matching the reference
   ══════════════════════════════════════════════ */

interface FlowerLayer {
  petals: number;       // n in rose curve r = cos(n·θ)
  rotSpeed: number;     // rotation speed (rad/s)
  hueShift: number;     // hue offset from base hue (degrees)
  radiusFrac: number;   // fraction of maxRadius
  lineWidth: number;    // base line width
  alpha: number;        // base alpha
  steps: number;        // resolution (points per full curve)
  coreOnly: boolean;    // if true, draw only inner 50%
}

const LAYERS: FlowerLayer[] = [
  // Large outer petals — slow rotation, wide
  { petals: 3,  rotSpeed: 0.18,  hueShift: 0,    radiusFrac: 1.0,  lineWidth: 1.8, alpha: 0.35, steps: 300, coreOnly: false },
  { petals: 5,  rotSpeed: -0.25, hueShift: 60,   radiusFrac: 0.85, lineWidth: 1.4, alpha: 0.30, steps: 300, coreOnly: false },
  { petals: 7,  rotSpeed: 0.32,  hueShift: 120,  radiusFrac: 0.70, lineWidth: 1.2, alpha: 0.28, steps: 280, coreOnly: false },
  // Medium inner petals — faster rotation
  { petals: 4,  rotSpeed: -0.45, hueShift: 180,  radiusFrac: 0.55, lineWidth: 1.0, alpha: 0.32, steps: 240, coreOnly: false },
  { petals: 6,  rotSpeed: 0.55,  hueShift: 240,  radiusFrac: 0.45, lineWidth: 0.9, alpha: 0.30, steps: 240, coreOnly: false },
  // Bright core — very fast, small
  { petals: 8,  rotSpeed: 0.85,  hueShift: 300,  radiusFrac: 0.30, lineWidth: 1.5, alpha: 0.50, steps: 200, coreOnly: true },
  { petals: 3,  rotSpeed: -1.1,  hueShift: 30,   radiusFrac: 0.20, lineWidth: 2.0, alpha: 0.55, steps: 160, coreOnly: true },
];

/** Base radius in pixels (calm state) */
const BASE_RADIUS = 200;
/** Extra radius driven by audio RMS */
const AUDIO_RADIUS_BOOST = 180;
/** Low-energy "breathing" modulation depth */
const LOW_ENERGY_DEPTH = 0.45;
/** Hue cycling speed (degrees per second) */
const HUE_CYCLE_SPEED = 15;

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
    const maxR = BASE_RADIUS + rms * AUDIO_RADIUS_BOOST + lowEnergy * 80;
    const baseHue = pitchToHue(pitch) + t * HUE_CYCLE_SPEED;

    // Breathing: slow modulation driven by low-frequency audio energy
    const breathe = 1 + Math.sin(t * 1.2) * LOW_ENERGY_DEPTH * (0.4 + lowEnergy * 0.6);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const layer of LAYERS) {
      const hue = (baseHue + layer.hueShift) % 360;
      const r = maxR * layer.radiusFrac * breathe;
      const rot = t * layer.rotSpeed;
      const alpha = layer.alpha + rms * 0.2;
      const lw = layer.lineWidth + rms * 0.6;
      const n = layer.petals;
      const steps = layer.steps;

      // ── Rose curve: r(θ) = R · cos(n·θ) ──
      // For even n: 2n petals; for odd n: n petals
      // Full curve needs θ ∈ [0, 2π] for odd n, [0, π] for even n → use 2π always

      ctx.beginPath();

      for (let i = 0; i <= steps; i++) {
        const s = i / steps;
        const theta = s * Math.PI * 2;

        // Rose curve radius
        let rr = Math.cos(n * theta) * r;

        // Add secondary modulation for visual complexity
        rr += Math.sin(n * 2 * theta + t * 2.5) * r * 0.12;

        // Audio-reactive modulation on alternate petals
        rr *= 1 + Math.sin(theta * n * 0.5 + t * 1.8) * rms * 0.2;

        // Absolute value to fill negative lobes (creating full petals)
        rr = Math.abs(rr);

        // Apply rotation
        const angle = theta + rot;

        // High-energy micro-jitter
        const jx = highEnergy > 0.12 ? (Math.random() - 0.5) * highEnergy * 2.5 : 0;
        const jy = highEnergy > 0.12 ? (Math.random() - 0.5) * highEnergy * 2.5 : 0;

        const x = cx + Math.cos(angle) * rr + jx;
        const y = cy + Math.sin(angle) * rr + jy;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      // Close the curve for continuity
      ctx.closePath();

      // Stroke with the layer's colour
      ctx.lineWidth = lw;
      ctx.strokeStyle = hslToString(hue, 80, 55, alpha * 0.7);
      ctx.stroke();

      // If core layer, also fill with very low alpha for a soft glow
      if (layer.coreOnly) {
        ctx.fillStyle = hslToString(hue, 50, 70, alpha * 0.08);
        ctx.fill();
      }
    }

    // ── Central bright core ──
    const coreR = 6 + rms * 12 + lowEnergy * 4;
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    const coreHue = baseHue % 360;
    coreGrad.addColorStop(0, `rgba(255, 255, 255, ${0.7 + rms * 0.25})`);
    coreGrad.addColorStop(0.3, hslToString(coreHue, 70, 80, 0.5 + rms * 0.2));
    coreGrad.addColorStop(0.7, hslToString((coreHue + 40) % 360, 60, 60, 0.15));
    coreGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();

    // ── Secondary glow ring (audio-reactive) ──
    if (rms > 0.05) {
      const ringR = coreR * 3 + rms * 30;
      const ringGrad = ctx.createRadialGradient(cx, cy, coreR, cx, cy, ringR);
      ringGrad.addColorStop(0, hslToString((coreHue + 180) % 360, 50, 60, rms * 0.12));
      ringGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = ringGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
