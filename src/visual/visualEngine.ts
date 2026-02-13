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
import { NoteParticles } from './noteParticles';
import { Constellations } from './constellations';
import { ChordGeometry } from './chordGeometry';
import { Shockwave } from './shockwave';
import { DepthParallax } from './depthParallax';
import { CadenceLock } from './cadenceLock';
import { ModulationPortal } from './modulationPortal';
import { HarmonyOrbit } from './harmonyOrbit';
import { PulseLock } from './pulseLock';
import { LightWarp } from './lightWarp';
import { SymmetryMode } from './symmetryMode';
import { CosmicZoom } from './cosmicZoom';
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
  private noteParticles: NoteParticles;

  /* ── 2D overlay effects (work in both WebGL and Canvas modes) ── */
  private constellations!: import('./constellations').Constellations;
  private chordGeometry!: import('./chordGeometry').ChordGeometry;
  private shockwave!: import('./shockwave').Shockwave;
  private depthParallax!: import('./depthParallax').DepthParallax;
  private cadenceLock!: import('./cadenceLock').CadenceLock;
  private modulationPortal!: import('./modulationPortal').ModulationPortal;
  private harmonyOrbit!: import('./harmonyOrbit').HarmonyOrbit;
  private pulseLock!: import('./pulseLock').PulseLock;
  private lightWarp!: import('./lightWarp').LightWarp;
  private symmetry!: import('./symmetryMode').SymmetryMode;
  private cosmicZoom!: import('./cosmicZoom').CosmicZoom;

  /* ── State (legacy compat) ── */
  private cursor: CursorState = { x: -100, y: -100, velocity: 0, pitch: 60 };
  private prevCursorX = -100;
  private prevCursorY = -100;
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
    this.noteParticles = new NoteParticles();

    // 2D overlay effects (work in both WebGL and Canvas modes)
    this.constellations = new Constellations();
    this.chordGeometry = new ChordGeometry();
    this.shockwave = new Shockwave();
    this.depthParallax = new DepthParallax();
    this.cadenceLock = new CadenceLock();
    this.modulationPortal = new ModulationPortal();
    this.harmonyOrbit = new HarmonyOrbit();
    this.pulseLock = new PulseLock();
    this.lightWarp = new LightWarp();
    this.symmetry = new SymmetryMode();
    this.cosmicZoom = new CosmicZoom();

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

    // Feed facade-level overlay effects
    this.constellations.addStar(x, y, pitch, 0);

    // Shockwave on bass notes
    if (pitch < 50 && velocity > 64) {
      this.shockwave.trigger(x, y, velocity / 127);
    }
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

  /* ── Phase 4-6 effect toggles ── */

  setEffect(name: string, on: boolean): void {
    const key = `${name}Enabled` as keyof VisualConfig;
    (this.config as Record<string, unknown>)[key] = on;
    this.backend?.setConfig({ [key]: on });

    // Also update facade-level overlay effects (for WebGL mode)
    this.syncOverlayEffect(name, on);
  }

  isEffectEnabled(name: string): boolean {
    return !!(this.config as Record<string, unknown>)[`${name}Enabled`];
  }

  /** Sync a single overlay effect toggle */
  private syncOverlayEffect(name: string, on: boolean): void {
    switch (name) {
      case 'constellations': this.constellations.setEnabled(on); break;
      case 'chordGeometry': this.chordGeometry.setEnabled(on); break;
      case 'shockwave': this.shockwave.setEnabled(on); break;
      case 'depthParallax': this.depthParallax.setEnabled(on); break;
      case 'cadenceLock': this.cadenceLock.setEnabled(on); break;
      case 'modulationPortal': this.modulationPortal.setEnabled(on); break;
      case 'harmonyOrbit': this.harmonyOrbit.setEnabled(on); break;
      case 'pulseLock': this.pulseLock.setEnabled(on); break;
      case 'lightWarp': this.lightWarp.setEnabled(on); break;
    }
  }

  /** Sync all overlay effects from config */
  private syncAllOverlayEffects(): void {
    this.constellations.setEnabled(this.config.constellationsEnabled);
    this.chordGeometry.setEnabled(this.config.chordGeometryEnabled);
    this.shockwave.setEnabled(this.config.shockwaveEnabled);
    this.depthParallax.setEnabled(this.config.depthParallaxEnabled);
    this.cadenceLock.setEnabled(this.config.cadenceLockEnabled);
    this.modulationPortal.setEnabled(this.config.modulationPortalEnabled);
    this.harmonyOrbit.setEnabled(this.config.harmonyOrbitEnabled);
    this.pulseLock.setEnabled(this.config.pulseLockEnabled);
    this.lightWarp.setEnabled(this.config.lightWarpEnabled);
    this.symmetry.setMode(this.config.symmetryMode);
  }

  setSymmetryMode(mode: 'off' | 'horizontal' | 'radial4' | 'radial8'): void {
    this.config.symmetryMode = mode;
    this.backend?.setConfig({ symmetryMode: mode });
    this.symmetry.setMode(mode);
  }

  cycleSymmetry(): string {
    const modes: Array<VisualConfig['symmetryMode']> = ['off', 'horizontal', 'radial4', 'radial8'];
    const idx = modes.indexOf(this.config.symmetryMode);
    const next = modes[(idx + 1) % modes.length];
    this.setSymmetryMode(next);
    return next;
  }

  /** Trigger visual effects for a chord change */
  triggerChordVisual(quality: string, rootPitch: number, degree: number): void {
    this.chordGeometry.triggerChord(
      quality as import('../music/harmonyEngine').ChordQuality,
      rootPitch,
      this.canvas.width / 2,
      this.canvas.height / 2,
    );
    this.harmonyOrbit.setChord(degree, rootPitch);

    // Also forward to Canvas backend if active
    const canvas = this.backend as CanvasVisualEngine;
    if (!this.usingWebGL && 'triggerChord' in canvas) {
      canvas.triggerChord(quality as import('../music/harmonyEngine').ChordQuality, rootPitch, degree);
    }
  }

  /** Trigger cadence lock visual */
  triggerCadenceVisual(): void {
    this.cadenceLock.trigger();
  }

  /** Trigger modulation portal visual */
  triggerModulationVisual(oldRoot: number, newRoot: number): void {
    this.modulationPortal.triggerModulation(oldRoot, newRoot);
  }

  /** Trigger a shockwave at position */
  triggerShockwave(x: number, y: number, intensity: number): void {
    this.shockwave.trigger(x, y, intensity);
  }

  /** Start cosmic zoom animation */
  triggerCosmicZoom(onComplete?: () => void): void {
    this.cosmicZoom.start(onComplete);
  }

  /** Update pulse lock rhythm data */
  setPulseLockRhythm(strength: number, period: number): void {
    this.pulseLock.setRhythm(strength, period);
  }

  /** Toggle starfield warp drive (space bar) */
  setStarfieldWarp(on: boolean): void {
    this.constellations.setWarpDrive(on);
    // Forward to Canvas backend if active
    const canvas = this.backend as CanvasVisualEngine;
    if (!this.usingWebGL && 'setStarfieldWarp' in canvas) {
      canvas.setStarfieldWarp(on);
    }
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
    const vx = (this.cursor.x - this.prevCursorX) / Math.max(dt, 0.001);
    const vy = (this.cursor.y - this.prevCursorY) / Math.max(dt, 0.001);
    this.prevCursorX = this.cursor.x;
    this.prevCursorY = this.cursor.y;
    const frame: VisualFrameInput = {
      time: (now - this.startTime) / 1000,
      dt,
      width: this.canvas.width,
      height: this.canvas.height,
      mouse: {
        x: this.cursor.x,
        y: this.cursor.y,
        vx,
        vy,
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

    // Update note particles (always 2D overlay)
    this.noteParticles.update(
      dt,
      this.cursor.x, this.cursor.y,
      this.cursor.velocity,
      this.cursor.pitch,
      this.sRms,
    );

    // Update facade-level overlay effects
    this.shockwave.update(dt);

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
    const time = frame.time;

    // ── Overlay effects (rendered in both WebGL and Canvas modes) ──
    // When Canvas backend is active, these are also rendered inside the backend,
    // but the facade-level instances are the authoritative ones for WebGL mode.
    if (this.usingWebGL) {
      // Screen shake from shockwave
      const shake = this.shockwave.getShakeOffset();
      if (shake.x !== 0 || shake.y !== 0) {
        ctx.save();
        ctx.translate(shake.x, shake.y);
      }

      // Cosmic zoom scale
      const zoomScale = this.cosmicZoom.getScale();
      if (zoomScale < 0.99) {
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(zoomScale, zoomScale);
        ctx.translate(-w / 2, -h / 2);
      }

      // Pulse lock background
      this.pulseLock.render(ctx, w, h, time);

      // Depth parallax (behind everything)
      this.depthParallax.render(ctx, w, h, blurCx, blurCy, this.sRms);

      // Shockwave
      this.shockwave.render(ctx);

      // Constellations
      this.constellations.render(ctx, w, h, this.sRms, this.sLow, this.sHigh, time);

      // Chord geometry overlay
      this.chordGeometry.render(ctx, w, h, this.sRms);

      // Harmony orbit
      this.harmonyOrbit.render(ctx, w, h);

      // Cadence lock
      this.cadenceLock.render(ctx, w, h);

      // Modulation portal
      this.modulationPortal.render(ctx, w, h);

      // Cosmic zoom overlay
      this.cosmicZoom.render(ctx, w, h);

      // Light warp (post-effect)
      this.lightWarp.apply(ctx, w, h, blurCx, blurCy, this.sLow);

      // Symmetry (very last)
      this.symmetry.apply(ctx, w, h);

      // Restore cosmic zoom
      if (zoomScale < 0.99) ctx.restore();

      // Restore shake
      if (shake.x !== 0 || shake.y !== 0) ctx.restore();
    }

    // Meditation visuals
    this.meditation.render(
      ctx, blurCx, blurCy,
      this.sRms, this.sLow, this.sHigh,
      this.cursor.pitch,
    );

    // Note particles (always 2D overlay, on top of everything)
    this.noteParticles.render(ctx);

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
