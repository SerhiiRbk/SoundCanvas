/**
 * Visual Engine v4 — Electric Flower + Radial Blur.
 *
 * Render pipeline:
 *  1. Background (solid dark)
 *  2. Flower pattern (generative rotating spirals, additive)
 *  3. Ambient glow at cursor
 *  4. Trail (point cloud behind cursor)
 *  5. Particles (burst on noteOn)
 *  ── Post-processing ──
 *  6. Radial blur (zoom streaks from cursor center)
 *  7. Bloom (multi-pass soft glow)
 *  ── After post-processing ──
 *  8. Cursor dot (stays sharp on top)
 */

import { TrailRenderer } from './trailRenderer';
import { ParticleSystem } from './particleSystem';
import { FlowerPattern } from './flowerPattern';
import { PostProcessing } from './postProcessing';
import { pitchToHue, hslToString } from './colorMapping';
import {
  BACKGROUND_COLOR,
  VISUAL_PRESETS,
  REEL_ASPECT_RATIO,
  type VisualPreset,
} from '../config';
import type {
  CursorState,
  AudioFrameData,
  VisualModeName,
} from '../composer/composerTypes';

export class VisualEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private trail: TrailRenderer;
  private particles: ParticleSystem;
  private flower: FlowerPattern;
  private postFx: PostProcessing;

  // State
  private cursor: CursorState = { x: -100, y: -100, velocity: 0, pitch: 60 };
  private audio: AudioFrameData = { rms: 0, lowEnergy: 0, highEnergy: 0 };
  private melodicStability = 0.5;
  private preset: VisualPreset = VISUAL_PRESETS.cinematic;
  private cursorActive = false;
  private running = false;
  private rafId = 0;
  private lastTime = 0;

  // Smoothed audio
  private sRms = 0;
  private sLow = 0;
  private sHigh = 0;

  // Reel
  private reelMode = false;
  private reelX = 0;
  private reelW = 0;

  // Watermark (visible during recording)
  private showWatermark = false;
  private watermarkText = 'Gesture Symphony';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.trail = new TrailRenderer();
    this.particles = new ParticleSystem();
    this.flower = new FlowerPattern();
    this.postFx = new PostProcessing(canvas.width, canvas.height);
  }

  // ═══════════ PUBLIC API ═══════════

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.tick();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  updateCursor(state: CursorState): void {
    this.cursor = state;
    if (!this.cursorActive) this.cursorActive = true;
    this.trail.addPoint(state.x, state.y, state.velocity, pitchToHue(state.pitch));
  }

  updateAudio(data: AudioFrameData): void {
    this.audio = data;
  }

  onNoteOn(x: number, y: number, pitch: number, velocity: number): void {
    this.particles.emit(x, y, pitch, velocity / 127, this.melodicStability);
  }

  setMelodicStability(m: number): void {
    this.melodicStability = m;
    this.trail.setDecayTau(0.3 + m * 0.3);
  }

  setPreset(name: VisualModeName): void {
    const p = VISUAL_PRESETS[name];
    if (p) {
      this.preset = p;
      this.postFx.setBloomIntensity(p.bloomIntensity);
    }
  }

  setReelMode(on: boolean): void {
    this.reelMode = on;
    this.computeReel();
  }

  /** Enable / disable radial blur */
  setRadialBlur(on: boolean): void {
    this.postFx.setRadialBlurEnabled(on);
  }

  /** Enable / disable flower pattern */
  setFlowerPattern(on: boolean): void {
    this.flower.setEnabled(on);
  }

  /** Show / hide watermark (enable during recording) */
  setWatermark(on: boolean, text?: string): void {
    this.showWatermark = on;
    if (text) this.watermarkText = text;
  }

  resize(w: number, h: number): void {
    this.canvas.width = w;
    this.canvas.height = h;
    this.postFx.resize(w, h);
    this.computeReel();
  }

  reset(): void {
    this.trail.clear();
    this.particles.reset();
  }

  getDebugInfo() {
    return {
      particles: this.particles.getActiveCount(),
      trailPoints: this.trail.getPointCount(),
    };
  }

  // ═══════════ RENDER LOOP ═══════════

  private tick = (): void => {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    // Smooth audio
    const k = 1 - Math.exp(-dt * 10);
    this.sRms += (this.audio.rms - this.sRms) * k;
    this.sLow += (this.audio.lowEnergy - this.sLow) * k;
    this.sHigh += (this.audio.highEnergy - this.sHigh) * k;

    this.particles.update(dt, this.sHigh);
    this.flower.update(dt);
    this.render(dt);
    this.rafId = requestAnimationFrame(this.tick);
  };

  private render(_dt: number): void {
    const { ctx } = this;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // ── 1. Background ──
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, w, h);

    // Reel clip
    if (this.reelMode) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(this.reelX, 0, this.reelW, h);
      ctx.clip();
    }

    // Radial blur center: cursor position if active, otherwise canvas center
    const blurCx = this.cursorActive ? this.cursor.x : w / 2;
    const blurCy = this.cursorActive ? this.cursor.y : h / 2;

    // ── 2. Flower pattern (drawn before blur for streaking effect) ──
    this.flower.render(
      ctx, blurCx, blurCy,
      this.sRms, this.sLow, this.sHigh,
      this.cursor.pitch,
    );

    // ── 3. Ambient glow at cursor ──
    if (this.cursorActive) {
      this.drawAmbient(ctx);
    }

    // ── 4. Trail ──
    this.trail.render(ctx, this.sRms);

    // ── 5. Particles ──
    this.particles.render(ctx);

    // ── 6 & 7. Post-processing: Radial blur + Bloom ──
    this.postFx.apply(ctx, this.canvas, blurCx, blurCy, this.sRms);

    // ── 8. Cursor dot (AFTER blur, stays sharp) ──
    if (this.cursorActive) {
      this.drawCursor(ctx);
    }

    // ── 9. Watermark (during recording) ──
    if (this.showWatermark) {
      this.drawWatermark(ctx, w, h);
    }

    if (this.reelMode) {
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillRect(0, 0, this.reelX, h);
      ctx.fillRect(this.reelX + this.reelW, 0, w - this.reelX - this.reelW, h);
    }
  }

  // ═══════════ DRAWING ═══════════

  /** Soft ambient glow around cursor position */
  private drawAmbient(ctx: CanvasRenderingContext2D): void {
    const { x, y, pitch } = this.cursor;
    const hue = pitchToHue(pitch);
    const r = 80 + this.sRms * 40;
    const a = 0.04 + this.sLow * 0.06;

    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hslToString(hue, 40, 25, a));
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  /** Bright cursor dot: always visible, tracks mouse exactly */
  private drawCursor(ctx: CanvasRenderingContext2D): void {
    const { x, y, velocity, pitch } = this.cursor;
    const hue = pitchToHue(pitch);
    const vel = Math.min(velocity / 500, 1);

    ctx.save();

    // Coloured glow ring
    const glowR = 12 + vel * 10;
    const g1 = ctx.createRadialGradient(x, y, 0, x, y, glowR);
    g1.addColorStop(0, hslToString(hue, 80, 65, 0.8));
    g1.addColorStop(0.5, hslToString(hue, 70, 55, 0.3));
    g1.addColorStop(1, 'transparent');
    ctx.fillStyle = g1;
    ctx.beginPath();
    ctx.arc(x, y, glowR, 0, Math.PI * 2);
    ctx.fill();

    // White centre dot
    const coreR = 3 + vel * 3;
    ctx.beginPath();
    ctx.arc(x, y, coreR, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.9 + vel * 0.1})`;
    ctx.fill();

    ctx.restore();
  }

  /** Subtle branded watermark in bottom-right */
  private drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.save();
    ctx.font = '11px Inter, -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(this.watermarkText, w - 16, h - 16);
    ctx.restore();
  }

  private computeReel(): void {
    if (!this.reelMode) return;
    this.reelW = this.canvas.height * REEL_ASPECT_RATIO;
    this.reelX = (this.canvas.width - this.reelW) / 2;
  }
}
