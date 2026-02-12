/**
 * Visual Engine v5 — Facade with WebGL2 / Canvas2D runtime switching.
 *
 * This file is the SOLE public API for the visual system. It maintains
 * exact backward compatibility with v4 (all existing method signatures
 * are preserved) while adding:
 *
 *  - Automatic GPU capability detection & quality-tier selection
 *  - WebGL2 shader pipeline (trails, particles, ripples, bloom)
 *  - Graceful fallback to Canvas2D
 *  - Auto-degrade on sustained FPS drops
 *  - Runtime "GPU Effects" toggle
 *
 * Architecture:
 *  - The facade owns the main canvas and its 2D context.
 *  - Canvas backend renders directly to the 2D context.
 *  - WebGL backend renders to an internal offscreen canvas;
 *    the facade copies it via drawImage() then draws 2D overlays
 *    (cursor, meditation, watermark) on top.
 *  - Meditation/eternity visuals remain Canvas2D regardless of mode.
 */

import type {
  VisualConfig, VisualFrameInput, NoteVisualEvent,
  IVisualBackend, GpuCapabilities,
  VisualModeName,
} from './types';
import type { CursorState, AudioFrameData } from '../composer/composerTypes';

import { detectCapabilities } from './capability';
import { tierFromScore, buildConfig, DEFAULT_VISUAL_CONFIG, DEGRADE_STEPS } from './config';
import { PerfMonitor } from './perfMonitor';

import { WebGLVisualEngine } from './webgl/WebGLVisualEngine';
import { CanvasVisualEngine } from './canvas/CanvasVisualEngine';

import { MeditationVisuals } from './meditationVisuals';
import { pitchToHue, hslToString } from './colorMapping';

import {
  BACKGROUND_COLOR,
  VISUAL_PRESETS,
  REEL_ASPECT_RATIO,
} from '../config';

export class VisualEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  /* ── Backends ── */
  private backend: IVisualBackend | null = null;
  private webglEngine: WebGLVisualEngine | null = null;
  private usingWebGL = false;

  /* ── Config & capabilities ── */
  private config: VisualConfig;
  private caps: GpuCapabilities;
  private perf: PerfMonitor;

  /* ── 2D overlay components (always Canvas) ── */
  private meditation: MeditationVisuals;

  /* ── State (legacy compat) ── */
  private cursor: CursorState = { x: -100, y: -100, velocity: 0, pitch: 60 };
  private audio: AudioFrameData = { rms: 0, lowEnergy: 0, highEnergy: 0 };
  private melodicStability = 0.5;
  private cursorActive = false;
  private running = false;
  private rafId = 0;
  private lastTime = 0;
  private startTime = 0;

  /* ── Smoothed audio ── */
  private sRms = 0;
  private sLow = 0;
  private sHigh = 0;

  /* ── Reel mode ── */
  private reelMode = false;
  private reelX = 0;
  private reelW = 0;

  /* ── Watermark ── */
  private showWatermark = false;
  private watermarkText = 'Gesture Symphony';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: false })!;

    // Detect GPU
    this.caps = detectCapabilities();

    // Build initial config from tier
    const tier = tierFromScore(this.caps.score);
    this.config = buildConfig(tier, 'cinematic');

    // If no WebGL2, force Canvas
    if (!this.caps.webgl2) {
      this.config.enableGpuEffects = false;
    }

    this.perf = new PerfMonitor();
    this.perf.syncConfig(this.config);

    this.meditation = new MeditationVisuals();

    // Create initial backend
    this.initBackend();
  }

  // ═══════════ PUBLIC API (backward-compat) ═══════════

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startTime = performance.now();
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
  }

  updateAudio(data: AudioFrameData): void {
    this.audio = data;
  }

  onNoteOn(x: number, y: number, pitch: number, velocity: number): void {
    const ev: NoteVisualEvent = {
      x, y, pitch,
      velocity: velocity / 127,
      time: (performance.now() - this.startTime) / 1000,
    };
    this.backend?.onNote(ev);
  }

  setMelodicStability(m: number): void {
    this.melodicStability = m;
  }

  setPreset(name: VisualModeName): void {
    // Map legacy preset to new config mode
    const modeMap: Record<string, VisualConfig['mode']> = {
      chill: 'chill',
      cinematic: 'cinematic',
      neon: 'neon',
    };
    const mode = modeMap[name] ?? 'cinematic';
    const tier = tierFromScore(this.caps.score);
    const partial = buildConfig(tier, mode, { enableGpuEffects: this.config.enableGpuEffects });
    this.config = partial;
    this.perf.syncConfig(this.config);
    this.backend?.setConfig(this.config);
  }

  setReelMode(on: boolean): void {
    this.reelMode = on;
    this.computeReel();
  }

  setRadialBlur(on: boolean): void {
    this.config.radialBlurEnabled = on;
    this.backend?.setConfig({ radialBlurEnabled: on });
  }

  setFlowerPattern(on: boolean): void {
    this.config.flowerEnabled = on;
    this.backend?.setConfig({ flowerEnabled: on });
  }

  /**
   * Toggle the Electric Flower animation (flower pattern + radial blur).
   * This replicates the effect from webglsamples.org/electricflower.
   */
  setElectricFlower(on: boolean): void {
    this.config.flowerEnabled = on;
    this.config.radialBlurEnabled = on;
    this.backend?.setConfig({
      flowerEnabled: on,
      radialBlurEnabled: on,
    });
  }

  isElectricFlowerEnabled(): boolean {
    return this.config.flowerEnabled && this.config.radialBlurEnabled;
  }

  /** Toggle the 3D particle wave field effect. */
  setParticleWaves(on: boolean): void {
    this.config.particleWavesEnabled = on;
    this.backend?.setConfig({ particleWavesEnabled: on });
  }

  isParticleWavesEnabled(): boolean {
    return this.config.particleWavesEnabled;
  }

  setMeditationMode(on: boolean): void {
    this.meditation.setEnabled(on);
  }

  pushMeditationPosition(x: number, y: number, pitch: number): void {
    this.meditation.pushPosition(x, y, pitch);
  }

  onMeditationPerc(x: number, y: number): void {
    this.meditation.onPercHit(x, y);
  }

  setEternityMode(on: boolean): void {
    this.meditation.setEternityOverlay(on);
  }

  setWatermark(on: boolean, text?: string): void {
    this.showWatermark = on;
    if (text) this.watermarkText = text;
  }

  resize(w: number, h: number): void {
    this.canvas.width = w;
    this.canvas.height = h;
    this.backend?.resize(w, h);
    this.computeReel();
  }

  reset(): void {
    // Backend-specific reset
    this.backend?.destroy();
    this.initBackend();
  }

  getDebugInfo() {
    return {
      particles: this.backend?.getActiveParticleCount() ?? 0,
      trailPoints: this.backend?.getTrailPointCount() ?? 0,
      gpu: this.usingWebGL,
      tier: tierFromScore(this.caps.score),
      fps: Math.round(this.perf.getAvgFps()),
      degradeStep: this.perf.getDegradeStep(),
    };
  }

  // ═══════════ GPU EFFECTS TOGGLE ═══════════

  /** User toggle for GPU effects. */
  setGpuEffects(on: boolean): void {
    if (on === this.config.enableGpuEffects) return;
    this.config.enableGpuEffects = on;

    if (on && this.caps.webgl2) {
      this.switchToWebGL();
    } else {
      this.switchToCanvas();
    }

    this.perf.resetDegrade();
  }

  isGpuEffectsEnabled(): boolean {
    return this.usingWebGL;
  }

  getCapabilities(): GpuCapabilities {
    return this.caps;
  }

  // ═══════════ RENDER LOOP ═══════════

  private tick = (): void => {
    if (!this.running) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    // Track FPS
    this.perf.recordFrame(dt);

    // Smooth audio
    const k = 1 - Math.exp(-dt * 10);
    this.sRms += (this.audio.rms - this.sRms) * k;
    this.sLow += (this.audio.lowEnergy - this.sLow) * k;
    this.sHigh += (this.audio.highEnergy - this.sHigh) * k;

    // Build frame input
    const prevX = this.cursor.x;
    const prevY = this.cursor.y;
    const frame: VisualFrameInput = {
      time: (now - this.startTime) / 1000,
      dt,
      width: this.canvas.width,
      height: this.canvas.height,
      mouse: {
        x: this.cursor.x,
        y: this.cursor.y,
        vx: this.cursor.velocity * Math.cos(0), // approximate
        vy: this.cursor.velocity * Math.sin(0),
        speed: this.cursor.velocity,
      },
      audio: {
        rms: this.sRms,
        low: this.sLow,
        high: this.sHigh,
      },
      melodicStability: this.melodicStability,
      pitch: this.cursor.pitch,
    };

    // Update meditation visuals (always 2D)
    this.meditation.update(dt);

    // Update backend
    this.backend?.update(frame);

    // Render
    this.renderFrame(frame);

    // Auto-degrade check
    if (this.perf.checkDegrade(now)) {
      this.applyDegradeStep();
    }

    // Check for WebGL context loss
    if (this.webglEngine?.isContextLost()) {
      console.warn('[VisualEngine] WebGL context lost, switching to Canvas');
      this.switchToCanvas();
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  private renderFrame(frame: VisualFrameInput): void {
    const { ctx } = this;
    const w = this.canvas.width;
    const h = this.canvas.height;

    if (this.usingWebGL && this.webglEngine) {
      // WebGL backend: set frame, render to its canvas, copy to main
      this.webglEngine.setFrame(frame);
      this.webglEngine.render();
      ctx.drawImage(this.webglEngine.canvas, 0, 0);
    } else {
      // Canvas backend renders directly to ctx
      this.backend?.render();
    }

    // ── Reel clip for overlays ──
    if (this.reelMode) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(this.reelX, 0, this.reelW, h);
      ctx.clip();
    }

    // ── 2D overlays (always on main canvas) ──
    const blurCx = this.cursorActive ? this.cursor.x : w / 2;
    const blurCy = this.cursorActive ? this.cursor.y : h / 2;

    // Meditation visuals
    this.meditation.render(
      ctx, blurCx, blurCy,
      this.sRms, this.sLow, this.sHigh,
      this.cursor.pitch,
    );

    // Cursor dot (always sharp, on top)
    if (this.cursorActive) {
      this.drawCursor(ctx);
    }

    // Watermark
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

  // ═══════════ BACKEND MANAGEMENT ═══════════

  private initBackend(): void {
    if (this.config.enableGpuEffects && this.caps.webgl2) {
      try {
        this.switchToWebGL();
      } catch (e) {
        console.warn('[VisualEngine] WebGL init failed, using Canvas fallback:', e);
        this.config.enableGpuEffects = false;
        this.switchToCanvas();
      }
    } else {
      this.switchToCanvas();
    }
  }

  private switchToWebGL(): void {
    this.backend?.destroy();
    const w = this.canvas.width;
    const h = this.canvas.height;

    this.webglEngine = new WebGLVisualEngine(w, h, this.config, this.caps.floatRT);
    this.backend = this.webglEngine;
    this.usingWebGL = true;
  }

  private switchToCanvas(): void {
    this.backend?.destroy();
    this.webglEngine = null;

    this.backend = new CanvasVisualEngine(this.ctx, this.config);
    this.usingWebGL = false;
  }

  private applyDegradeStep(): void {
    const step = this.perf.getDegradeStep() - 1; // 0-indexed
    if (step < 0 || step >= DEGRADE_STEPS.length) return;

    const stepConfig = DEGRADE_STEPS[step];
    console.info(`[VisualEngine] Auto-degrade step ${step + 1}:`, stepConfig);

    // Step 1 (index 1): reduce particles
    if (step === 1) {
      const reduced = this.perf.effectiveMaxParticles(this.config.maxParticles);
      this.config.maxParticles = reduced;
      this.backend?.setConfig({ maxParticles: reduced });
      return;
    }

    // Step 3 (index 3): switch to Canvas
    if (stepConfig.enableGpuEffects === false) {
      this.config.enableGpuEffects = false;
      this.switchToCanvas();
      return;
    }

    // Other steps: merge config overrides
    Object.assign(this.config, stepConfig);
    this.backend?.setConfig(stepConfig);
  }

  // ═══════════ 2D DRAWING (overlays) ═══════════

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
