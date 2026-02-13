/**
 * Canvas2D Visual Engine — fallback renderer wrapping existing components.
 *
 * Uses the existing TrailRenderer, ParticleSystem, FlowerPattern,
 * and PostProcessing classes. Provides the same IVisualBackend interface
 * so the facade can swap between WebGL and Canvas seamlessly.
 */

import type { IVisualBackend, VisualConfig, VisualFrameInput, NoteVisualEvent } from '../types';
import { TrailRenderer } from '../trailRenderer';
import { ParticleSystem } from '../particleSystem';
import { FlowerPattern } from '../flowerPattern';
import { PostProcessing } from '../postProcessing';
import { ParticleWaveField } from '../particleWaveField';
import { LightWarp } from '../lightWarp';
import { Constellations } from '../constellations';
import { ChordGeometry } from '../chordGeometry';
import { Shockwave } from '../shockwave';
import { DepthParallax } from '../depthParallax';
import { CadenceLock } from '../cadenceLock';
import { ModulationPortal } from '../modulationPortal';
import { HarmonyOrbit } from '../harmonyOrbit';
import { PulseLock } from '../pulseLock';
import { SymmetryMode } from '../symmetryMode';
import { CosmicZoom } from '../cosmicZoom';
import { pitchToHue, hslToString } from '../colorMapping';
import type { ChordQuality } from '../../music/harmonyEngine';

export class CanvasVisualEngine implements IVisualBackend {
  private ctx: CanvasRenderingContext2D;
  private trail: TrailRenderer;
  private particles: ParticleSystem;
  private flower: FlowerPattern;
  private postFx: PostProcessing;
  private waveField: ParticleWaveField;

  /* ── Phase 4-6 effects ── */
  private lightWarp: LightWarp;
  private constellations: Constellations;
  private chordGeometry: ChordGeometry;
  private shockwave: Shockwave;
  private depthParallax: DepthParallax;
  private cadenceLock: CadenceLock;
  private modulationPortal: ModulationPortal;
  private harmonyOrbit: HarmonyOrbit;
  private pulseLock: PulseLock;
  private symmetry: SymmetryMode;
  private cosmicZoom: CosmicZoom;

  private config!: VisualConfig;
  private width = 0;
  private height = 0;

  /* ── Smoothed audio (low-pass) ── */
  private sRms = 0;
  private sLow = 0;
  private sHigh = 0;

  /* ── Stashed frame for render() ── */
  private lastFrame: VisualFrameInput = {
    time: 0, dt: 0, width: 0, height: 0,
    mouse: { x: -100, y: -100, vx: 0, vy: 0, speed: 0 },
    audio: { rms: 0, low: 0, high: 0 },
    melodicStability: 0.5,
    pitch: 60,
  };

  constructor(ctx: CanvasRenderingContext2D, config: VisualConfig) {
    this.ctx = ctx;
    this.config = { ...config };
    this.width = ctx.canvas.width;
    this.height = ctx.canvas.height;

    this.trail = new TrailRenderer();
    this.particles = new ParticleSystem();
    this.flower = new FlowerPattern();
    this.postFx = new PostProcessing(this.width, this.height);
    this.waveField = new ParticleWaveField();

    this.lightWarp = new LightWarp();
    this.constellations = new Constellations();
    this.chordGeometry = new ChordGeometry();
    this.shockwave = new Shockwave();
    this.depthParallax = new DepthParallax();
    this.cadenceLock = new CadenceLock();
    this.modulationPortal = new ModulationPortal();
    this.harmonyOrbit = new HarmonyOrbit();
    this.pulseLock = new PulseLock();
    this.symmetry = new SymmetryMode();
    this.cosmicZoom = new CosmicZoom();

    // Apply config to sub-components
    this.applyConfig(config);
  }

  /* ══════════════════════════════════════════════
     IVisualBackend
     ══════════════════════════════════════════════ */

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.postFx.resize(width, height);
  }

  update(frame: VisualFrameInput): void {
    this.lastFrame = frame;

    // Smooth audio
    const k = 1 - Math.exp(-frame.dt * 10);
    this.sRms += (frame.audio.rms - this.sRms) * k;
    this.sLow += (frame.audio.low - this.sLow) * k;
    this.sHigh += (frame.audio.high - this.sHigh) * k;

    // Add trail point (include RMS for per-point beat colouring)
    if (frame.mouse.speed > 0.5) {
      this.trail.addPoint(
        frame.mouse.x, frame.mouse.y,
        frame.mouse.speed,
        pitchToHue(frame.pitch),
        this.sRms,
      );
    }

    // Feed live audio to trail for beat-reactive shimmer
    this.trail.setAudio(this.sRms, this.sLow, this.sHigh);

    this.particles.update(frame.dt, this.sHigh);
    this.flower.update(frame.dt);
    this.waveField.update(frame.dt, this.sLow);
  }

  onNote(ev: NoteVisualEvent): void {
    this.particles.emit(ev.x, ev.y, ev.pitch, ev.velocity, this.lastFrame.melodicStability);
    this.constellations.addStar(ev.x, ev.y, ev.pitch, 0);
    this.trail.recordNotePosition(ev.pitch, ev.x, ev.y);

    // Shockwave on bass notes (low pitch + high velocity)
    if (ev.pitch < 50 && ev.velocity > 0.5) {
      this.shockwave.trigger(ev.x, ev.y, ev.velocity);
    }
  }

  /* ── External triggers for chord/cadence/modulation ── */
  triggerChord(quality: ChordQuality, rootPitch: number, degree: number): void {
    this.chordGeometry.triggerChord(quality, rootPitch, this.width / 2, this.height / 2);
    this.harmonyOrbit.setChord(degree, rootPitch);
  }

  triggerCadence(): void { this.cadenceLock.trigger(); }

  triggerModulation(oldRoot: number, newRoot: number): void {
    this.modulationPortal.triggerModulation(oldRoot, newRoot);
  }

  triggerShockwave(x: number, y: number, intensity: number): void {
    this.shockwave.trigger(x, y, intensity);
  }

  triggerCosmicZoom(onComplete?: () => void): void {
    this.cosmicZoom.start(onComplete);
  }

  getSymmetry(): SymmetryMode { return this.symmetry; }
  getCosmicZoom(): CosmicZoom { return this.cosmicZoom; }
  getPulseLock(): PulseLock { return this.pulseLock; }

  render(): void {
    const { ctx } = this;
    const w = this.width;
    const h = this.height;
    const frame = this.lastFrame;
    const mx = frame.mouse.x;
    const my = frame.mouse.y;
    const active = mx > 0 && my > 0;
    const time = frame.time;

    // ── Screen shake from shockwave ──
    const shake = this.shockwave.getShakeOffset();
    if (shake.x !== 0 || shake.y !== 0) {
      ctx.save();
      ctx.translate(shake.x, shake.y);
    }

    // ── Cosmic zoom scale ──
    const zoomScale = this.cosmicZoom.getScale();
    if (zoomScale < 0.99) {
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(zoomScale, zoomScale);
      ctx.translate(-w / 2, -h / 2);
    }

    // ── 1. Background ──
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, w, h);

    // ── Pulse lock background ──
    this.pulseLock.render(ctx, w, h, time);

    // ── Depth parallax (behind everything) ──
    this.depthParallax.render(ctx, w, h, active ? mx : w / 2, active ? my : h / 2, this.sRms);

    // ── 1b. Particle wave field ──
    if (this.config.particleWavesEnabled) {
      this.waveField.render(ctx, w, h, active ? mx : w / 2, active ? my : h / 2, this.sRms, this.sLow, this.sHigh);
    }

    // ── 2. Flower pattern ──
    if (this.config.flowerEnabled) {
      const blurCx = active ? mx : w / 2;
      const blurCy = active ? my : h / 2;
      this.flower.render(ctx, blurCx, blurCy, this.sRms, this.sLow, this.sHigh, frame.pitch);
    }

    // ── 3. Ambient glow ──
    if (active) {
      this.drawAmbient(ctx, mx, my, frame.pitch);
    }

    // ── 4. Trail ──
    this.trail.render(ctx, this.sRms);
    this.trail.renderEchoFlashes(ctx);

    // ── 5. Particles ──
    this.particles.render(ctx);

    // ── Shockwave ──
    this.shockwave.update(frame.dt);
    this.shockwave.render(ctx);

    // ── Constellations ──
    this.constellations.render(ctx, w, h);

    // ── Chord geometry overlay ──
    this.chordGeometry.render(ctx, w, h, this.sRms);

    // ── Harmony orbit ──
    this.harmonyOrbit.render(ctx, w, h);

    // ── Cadence lock ──
    this.cadenceLock.render(ctx, w, h);

    // ── Modulation portal ──
    this.modulationPortal.render(ctx, w, h);

    // ── Cosmic zoom overlay ──
    this.cosmicZoom.render(ctx, w, h);

    // ── Light warp (post-effect) ──
    this.lightWarp.apply(ctx, w, h, active ? mx : w / 2, active ? my : h / 2, this.sLow);

    // ── 6+7. Post-processing ──
    if (this.config.radialBlurEnabled || this.config.bloomEnabled) {
      const blurCx = active ? mx : w / 2;
      const blurCy = active ? my : h / 2;
      this.postFx.apply(ctx, ctx.canvas as HTMLCanvasElement, blurCx, blurCy, this.sRms);
    }

    // ── Symmetry (very last, renders on top) ──
    this.symmetry.apply(ctx, w, h);

    // ── Restore cosmic zoom ──
    if (zoomScale < 0.99) ctx.restore();

    // ── Restore shake ──
    if (shake.x !== 0 || shake.y !== 0) ctx.restore();
  }

  setConfig(partial: Partial<VisualConfig>): void {
    Object.assign(this.config, partial);
    this.applyConfig(this.config);
  }

  getActiveParticleCount(): number {
    return this.particles.getActiveCount();
  }

  getTrailPointCount(): number {
    return this.trail.getPointCount();
  }

  destroy(): void {
    this.trail.clear();
    this.particles.reset();
    // PostProcessing and FlowerPattern don't hold GL resources
  }

  /* ══════════════════════════════════════════════
     Internal
     ══════════════════════════════════════════════ */

  private applyConfig(cfg: VisualConfig): void {
    this.trail.setDecayTau(cfg.trailDecay > 0.5 ? 0.5 : 0.3);
    this.postFx.setRadialBlurEnabled(cfg.radialBlurEnabled);
    this.postFx.setRadialBlurStrength(cfg.radialBlurStrength);
    this.postFx.setRadialBlurPasses(cfg.radialBlurPasses);
    this.postFx.setBloomEnabled(cfg.bloomEnabled);
    this.postFx.setBloomIntensity(cfg.bloomStrength);
    this.flower.setEnabled(cfg.flowerEnabled);
    this.waveField.setEnabled(cfg.particleWavesEnabled);

    // Phase 4-6 effects
    this.lightWarp.setEnabled(cfg.lightWarpEnabled);
    this.constellations.setEnabled(cfg.constellationsEnabled);
    this.chordGeometry.setEnabled(cfg.chordGeometryEnabled);
    this.shockwave.setEnabled(cfg.shockwaveEnabled);
    this.trail.setEchoEnabled(cfg.lightEchoEnabled);
    this.depthParallax.setEnabled(cfg.depthParallaxEnabled);
    this.cadenceLock.setEnabled(cfg.cadenceLockEnabled);
    this.modulationPortal.setEnabled(cfg.modulationPortalEnabled);
    this.harmonyOrbit.setEnabled(cfg.harmonyOrbitEnabled);
    this.pulseLock.setEnabled(cfg.pulseLockEnabled);
    this.symmetry.setMode(cfg.symmetryMode);
  }

  private drawAmbient(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    pitch: number,
  ): void {
    const hue = pitchToHue(pitch);
    const r = 80 + this.sRms * 40;
    const a = 0.04 + this.sLow * 0.06;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hslToString(hue, 40, 25, a));
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
