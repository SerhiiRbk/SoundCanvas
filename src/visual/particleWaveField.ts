/**
 * Particle Wave Field — flowing 3D particle surfaces with perspective.
 *
 * Creates multiple wave "bands" of densely-packed particles arranged in
 * undulating surfaces reminiscent of ocean waves. Features:
 *
 *  - 3D perspective projection (particles shrink with distance)
 *  - Multiple superimposed sine/cosine waves for complex undulation
 *  - Blue monochrome palette: deep navy → bright cyan on wave crests
 *  - Glowing focal sphere at cursor position
 *  - Depth-of-field: distant particles rendered dimmer/smaller
 *  - Audio-reactive: wave amplitude ∝ RMS, speed ∝ low energy,
 *    sparkle ∝ high energy
 *  - Mouse attractor: particles near cursor glow brighter
 *
 * Performance:
 *  - Renders to an offscreen canvas at 50% resolution, then composites
 *    to main canvas — halves draw calls AND provides natural softness
 *  - Uses fillRect for all particles (much faster than arc)
 *  - Pre-computed color palette (no string alloc in hot loop)
 *  - Early culling of offscreen / invisible particles
 *  - Iterates far→near for correct depth order
 */

/* ══════════════════════════════════════════════
   Configuration
   ══════════════════════════════════════════════ */

/** Number of wave bands (horizontal ribbons at different Y offsets) */
const BAND_COUNT = 3;

/** Per-band config: yCenter fraction (0 = top, 1 = bottom), spread, density */
interface BandCfg {
  yFrac: number;      // vertical center as fraction of screen height
  cols: number;        // horizontal particle count
  rows: number;        // depth particle count
  xSpread: number;     // world-space X range (± this value)
  zStart: number;      // near Z
  zEnd: number;        // far Z
  waveAmpBase: number; // base wave amplitude in world units
  phaseOffset: number; // time phase offset per band
}

const BANDS: BandCfg[] = [
  { yFrac: 0.35, cols: 140, rows: 22, xSpread: 900, zStart: 50,  zEnd: 1200, waveAmpBase: 55, phaseOffset: 0 },
  { yFrac: 0.55, cols: 130, rows: 20, xSpread: 850, zStart: 80,  zEnd: 1100, waveAmpBase: 50, phaseOffset: 2.1 },
  { yFrac: 0.75, cols: 110, rows: 18, xSpread: 750, zStart: 100, zEnd: 1000, waveAmpBase: 40, phaseOffset: 4.3 },
];

/** Camera / projection */
const FOCAL_LENGTH = 500;
const CAMERA_Z = -200;

/** Particle sizing */
const BASE_SIZE_NEAR = 2.4;   // pixels at closest distance
const BASE_SIZE_FAR = 0.6;    // pixels at farthest distance

/** Color palette indices (pre-computed) */
const PALETTE_STEPS = 32;

/** Focal sphere */
const SPHERE_BASE_R = 14;
const SPHERE_RMS_BOOST = 12;

/** Offscreen resolution scale (0.5 = half resolution for perf + DoF) */
const OFF_SCALE = 0.5;

/* ══════════════════════════════════════════════
   Pre-computed color palette
   ══════════════════════════════════════════════ */

function buildPalette(): string[] {
  const palette: string[] = [];
  for (let i = 0; i < PALETTE_STEPS; i++) {
    const t = i / (PALETTE_STEPS - 1); // 0 = darkest/farthest, 1 = brightest/nearest
    const h = 220 - t * 15;           // 220 → 205 (deep blue → cyan-blue)
    const s = 75 + t * 10;            // 75% → 85%
    const l = 25 + t * 55;            // 25% → 80%
    const a = 0.15 + t * 0.7;         // 0.15 → 0.85
    palette.push(`hsla(${h}, ${s}%, ${l}%, ${a})`);
  }
  return palette;
}

/** Brighter version for wave crests */
function buildCrestPalette(): string[] {
  const palette: string[] = [];
  for (let i = 0; i < PALETTE_STEPS; i++) {
    const t = i / (PALETTE_STEPS - 1);
    const h = 210 - t * 20;
    const s = 60 + t * 15;
    const l = 50 + t * 42;
    const a = 0.3 + t * 0.65;
    palette.push(`hsla(${h}, ${s}%, ${l}%, ${a})`);
  }
  return palette;
}

const PALETTE = buildPalette();
const CREST_PALETTE = buildCrestPalette();

/* ══════════════════════════════════════════════
   Class
   ══════════════════════════════════════════════ */

export class ParticleWaveField {
  private enabled = false;
  private time = 0;

  /* ── Offscreen canvas ── */
  private offCanvas: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private offW = 0;
  private offH = 0;

  constructor() {
    this.offCanvas = document.createElement('canvas');
    this.offCtx = this.offCanvas.getContext('2d', { willReadFrequently: false })!;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  update(dt: number, low: number): void {
    if (!this.enabled) return;
    // Wave speed modulated by low-frequency energy
    this.time += dt * (0.35 + low * 0.25);
  }

  /**
   * Render the full wave field.
   *
   * @param ctx    Main canvas context
   * @param width  Canvas width
   * @param height Canvas height
   * @param mx     Mouse / cursor X
   * @param my     Mouse / cursor Y
   * @param rms    Audio RMS (0–1 typically)
   * @param low    Low-frequency energy
   * @param high   High-frequency energy
   */
  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    mx: number,
    my: number,
    rms: number,
    low: number,
    high: number,
  ): void {
    if (!this.enabled) return;

    // ── Ensure offscreen canvas size ──
    const ow = Math.ceil(width * OFF_SCALE);
    const oh = Math.ceil(height * OFF_SCALE);
    if (this.offW !== ow || this.offH !== oh) {
      this.offCanvas.width = ow;
      this.offCanvas.height = oh;
      this.offW = ow;
      this.offH = oh;
    }

    const offCtx = this.offCtx;
    offCtx.clearRect(0, 0, ow, oh);

    const t = this.time;
    const halfOW = ow * 0.5;
    const halfOH = oh * 0.5;

    // Mouse position in offscreen coords
    const omx = mx * OFF_SCALE;
    const omy = my * OFF_SCALE;
    const mouseActive = mx > 0 && my > 0;

    // Audio-driven parameters
    const ampMul = 1 + rms * 1.2 + low * 0.5;
    const sparkle = high > 0.12 ? high : 0;

    // ── Render each band (far to near implicit via Z iteration) ──
    for (let b = 0; b < BAND_COUNT; b++) {
      const band = BANDS[b];
      const bandCenterY = band.yFrac * oh;
      const ph = band.phaseOffset;

      const colStep = (band.xSpread * 2) / (band.cols - 1);
      const rowStep = (band.zEnd - band.zStart) / (band.rows - 1);

      // Iterate rows from far to near
      for (let r = band.rows - 1; r >= 0; r--) {
        const wz = band.zStart + r * rowStep;
        const viewZ = wz - CAMERA_Z;

        if (viewZ < 1) continue;

        const projFactor = FOCAL_LENGTH / viewZ;

        // Depth-based properties
        const depthT = 1 - (wz - band.zStart) / (band.zEnd - band.zStart); // 0=far, 1=near
        const paletteIdx = Math.min(PALETTE_STEPS - 1, Math.max(0, (depthT * PALETTE_STEPS) | 0));
        const size = (BASE_SIZE_FAR + (BASE_SIZE_NEAR - BASE_SIZE_FAR) * depthT) * OFF_SCALE;

        for (let c = 0; c < band.cols; c++) {
          const wx = -band.xSpread + c * colStep;

          // ── Wave displacement ──
          const wave1 = Math.sin(wx * 0.007 + t * 0.8 + ph) * Math.cos(wz * 0.009 + t * 0.4);
          const wave2 = Math.sin(wx * 0.013 + wz * 0.005 + t * 0.6 + ph * 0.7) * 0.5;
          const wave3 = Math.cos(wx * 0.003 + wz * 0.011 - t * 0.3 + ph * 1.3) * 0.35;
          const waveY = (wave1 + wave2 + wave3) * band.waveAmpBase * ampMul;

          // Micro-jitter from high energy
          const jx = sparkle > 0 ? (((c * 7 + r * 13 + (t * 100 | 0)) % 17) / 17 - 0.5) * sparkle * 3 : 0;
          const jy = sparkle > 0 ? (((c * 11 + r * 3 + (t * 100 | 0)) % 13) / 13 - 0.5) * sparkle * 3 : 0;

          // ── Project to 2D (offscreen coords) ──
          const sx = halfOW + (wx * projFactor) + jx;
          const sy = bandCenterY + (waveY * projFactor) + jy;

          // Cull offscreen
          if (sx < -4 || sx > ow + 4 || sy < -4 || sy > oh + 4) continue;

          // ── Mouse attractor brightness boost ──
          let curSize = size;
          let pi = paletteIdx;
          if (mouseActive) {
            const dmx = sx - omx;
            const dmy = sy - omy;
            const distSq = dmx * dmx + dmy * dmy;
            const attractR = 80 * OFF_SCALE;
            if (distSq < attractR * attractR) {
              const proximity = 1 - Math.sqrt(distSq) / attractR;
              curSize += proximity * 1.5 * OFF_SCALE;
              pi = Math.min(PALETTE_STEPS - 1, pi + (proximity * 8 | 0));
            }
          }

          // ── Wave crest detection (brighter on peaks) ──
          const isCrest = waveY > band.waveAmpBase * ampMul * 0.3;
          const color = isCrest ? CREST_PALETTE[pi] : PALETTE[pi];

          // ── Draw particle (fillRect for performance) ──
          offCtx.fillStyle = color;
          offCtx.fillRect(sx - curSize * 0.5, sy - curSize * 0.5, curSize, curSize);
        }
      }
    }

    // ── Focal sphere (rendered on offscreen) ──
    if (mouseActive) {
      const sphereR = (SPHERE_BASE_R + rms * SPHERE_RMS_BOOST) * OFF_SCALE;
      const grad = offCtx.createRadialGradient(omx, omy, 0, omx, omy, sphereR);
      grad.addColorStop(0, `rgba(180, 210, 255, ${0.7 + rms * 0.25})`);
      grad.addColorStop(0.25, `rgba(80, 140, 255, ${0.5 + rms * 0.2})`);
      grad.addColorStop(0.6, `rgba(30, 80, 200, ${0.15 + rms * 0.1})`);
      grad.addColorStop(1, 'transparent');
      offCtx.fillStyle = grad;
      offCtx.beginPath();
      offCtx.arc(omx, omy, sphereR, 0, Math.PI * 2);
      offCtx.fill();
    }

    // ── Composite offscreen to main canvas (with additive blending) ──
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    ctx.drawImage(this.offCanvas, 0, 0, ow, oh, 0, 0, width, height);
    ctx.restore();
  }
}
