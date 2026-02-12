/**
 * WebGL2 Visual Engine — orchestrates the full shader pipeline.
 *
 * Pipeline (each frame):
 *   1. Background → sceneFBO
 *   2. Trail accumulation → trailTexture (ping-pong)
 *   3. Particles → sceneFBO (additive)
 *   4. Ripples → sceneFBO (additive)
 *   5. Bright extract → brightTexture (bloom input)
 *   6. Blur → bloomTexture
 *   7. Composite (scene + trail + bloom) → default FBO (canvas)
 *
 * The output lives on `this.canvas` — the facade copies it to the
 * user's main canvas via drawImage().
 */

import type { IVisualBackend, VisualConfig, VisualFrameInput, NoteVisualEvent } from '../types';
import { createFBO, destroyFBO, type FBO } from './gl';
import { BackgroundPass } from './passes/BackgroundPass';
import { TrailAccumulationPass } from './passes/TrailAccumulationPass';
import { ParticlePass } from './passes/ParticlePass';
import { RipplePass } from './passes/RipplePass';
import { BrightExtractPass } from './passes/BrightExtractPass';
import { BlurPass } from './passes/BlurPass';
import { CompositePass } from './passes/CompositePass';

export class WebGLVisualEngine implements IVisualBackend {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private config!: VisualConfig;
  private width = 0;
  private height = 0;

  /* ── Scene FBO (full resolution) ── */
  private sceneFBO!: FBO;

  /* ── Passes ── */
  private bgPass: BackgroundPass;
  private trailPass: TrailAccumulationPass;
  private particlePass: ParticlePass;
  private ripplePass: RipplePass;
  private brightPass: BrightExtractPass;
  private blurPass: BlurPass;
  private compositePass: CompositePass;

  /* ── Capability flags ── */
  private floatRT: boolean;
  private contextLost = false;

  /* ── Trail point count (for debug compat) ── */
  private trailPointCount = 0;

  constructor(width: number, height: number, config: VisualConfig, floatRT: boolean) {
    this.config = { ...config };
    this.floatRT = floatRT;

    // Create offscreen WebGL canvas (not attached to DOM)
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;

    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });

    if (!gl) throw new Error('WebGL2 context creation failed');
    this.gl = gl;

    // Handle context loss
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      console.warn('[WebGLVisualEngine] Context lost');
    });

    // If float RT not supported, disable bloom
    if (!floatRT) {
      this.config.bloomEnabled = false;
    }

    // Init passes
    this.bgPass = new BackgroundPass(gl);
    this.trailPass = new TrailAccumulationPass(gl, floatRT);
    this.particlePass = new ParticlePass(gl, config.maxParticles);
    this.ripplePass = new RipplePass(gl, config.maxRipples);
    this.brightPass = new BrightExtractPass(gl);
    this.blurPass = new BlurPass(gl);
    this.compositePass = new CompositePass(gl);

    // Allocate FBOs
    this.allocate(width, height);
  }

  /* ══════════════════════════════════════════════
     IVisualBackend implementation
     ══════════════════════════════════════════════ */

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.allocate(width, height);
  }

  update(frame: VisualFrameInput): void {
    if (this.contextLost) return;
    this.particlePass.update(frame);
    this.ripplePass.update(frame.dt);
    // Trail "points" are conceptual — the accumulation texture handles it
    this.trailPointCount = Math.round(frame.mouse.speed * 0.5 + 20);
  }

  onNote(ev: NoteVisualEvent): void {
    if (this.contextLost) return;
    this.particlePass.emit(ev, this.config.bloomThreshold /* reuse as stability proxy */, this.config.particleScale);
    this.ripplePass.emit(ev);
  }

  render(): void {
    if (this.contextLost) return;

    const { gl, config } = this;
    const w = this.width;
    const h = this.height;

    // We need the latest frame input — stored from the last update() call
    // The facade calls update() then render() with the same frame, so we
    // stash it in update(). But to keep the interface simple, render() uses
    // the stored frame via a pass-through pattern. Let's adjust: the facade
    // actually calls render(frame) — but our interface says render(). We'll
    // store frame in update().

    // (frame is passed to passes that need it in their render() calls,
    //  so this is handled via the stored reference in the main engine facade.)

    // ── 1. Background → sceneFBO ──
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO.framebuffer);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.02, 0.02, 0.063, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.bgPass.render(this._lastFrame);

    // ── 2. Trail accumulation → trailTexture ──
    const trailTex = this.trailPass.render(this._lastFrame, config);

    // ── 3. Particles → sceneFBO (additive) ──
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO.framebuffer);
    gl.viewport(0, 0, w, h);
    this.particlePass.render(this._lastFrame);

    // ── 4. Ripples → sceneFBO (additive) ──
    this.ripplePass.render(this._lastFrame);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // ── 5 & 6. Bloom pipeline ──
    let bloomTex: WebGLTexture | null = null;
    if (config.bloomEnabled && config.blurIterations > 0) {
      const brightTex = this.brightPass.render(
        this.sceneFBO.texture, config.bloomThreshold,
      );
      bloomTex = this.blurPass.render(
        brightTex, config.blurIterations, config.blurRadius,
      );
    }

    // ── 7. Composite → screen ──
    this.compositePass.render(
      this.sceneFBO.texture,
      bloomTex,
      trailTex,
      config,
      w, h,
    );
  }

  setConfig(partial: Partial<VisualConfig>): void {
    Object.assign(this.config, partial);

    if (partial.maxParticles !== undefined) {
      this.particlePass.setMaxParticles(partial.maxParticles);
    }

    if (partial.trailResolutionScale !== undefined) {
      this.trailPass.resize(this.width, this.height, partial.trailResolutionScale);
    }

    if (!this.floatRT) {
      this.config.bloomEnabled = false;
    }
  }

  getActiveParticleCount(): number {
    return this.particlePass.getActiveCount();
  }

  getTrailPointCount(): number {
    return this.trailPointCount;
  }

  destroy(): void {
    this.bgPass.destroy();
    this.trailPass.destroy();
    this.particlePass.destroy();
    this.ripplePass.destroy();
    this.brightPass.destroy();
    this.blurPass.destroy();
    this.compositePass.destroy();
    destroyFBO(this.gl, this.sceneFBO);

    // Lose context explicitly
    const ext = this.gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
  }

  /** Check if the GL context was lost (facade should switch to Canvas). */
  isContextLost(): boolean {
    return this.contextLost;
  }

  /* ══════════════════════════════════════════════
     Internal
     ══════════════════════════════════════════════ */

  // Stashed frame for render() to use (set in update())
  private _lastFrame: VisualFrameInput = {
    time: 0, dt: 0, width: 0, height: 0,
    mouse: { x: -100, y: -100, vx: 0, vy: 0, speed: 0 },
    audio: { rms: 0, low: 0, high: 0 },
    melodicStability: 0.5,
    pitch: 60,
  };

  /** Override update to stash frame data. */
  private _origUpdate = this.update.bind(this);

  // Monkey-patch to intercept frame — cleaner via a setter on facade.
  setFrame(frame: VisualFrameInput): void {
    this._lastFrame = frame;
  }

  private allocate(width: number, height: number): void {
    this.width = width;
    this.height = height;

    const { gl, config } = this;

    // Scene FBO (full resolution)
    if (this.sceneFBO) destroyFBO(gl, this.sceneFBO);
    this.sceneFBO = createFBO(gl, { width, height });

    // Trail FBOs (scaled resolution)
    this.trailPass.resize(width, height, config.trailResolutionScale);

    // Bloom FBOs (half resolution)
    this.brightPass.resize(width, height);
    const bw = Math.max(1, Math.floor(width / 2));
    const bh = Math.max(1, Math.floor(height / 2));
    this.blurPass.resize(bw, bh);
  }
}
