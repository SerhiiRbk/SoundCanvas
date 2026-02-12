/**
 * Trail Accumulation Pass — ping-pong texture with decay + cursor splat.
 *
 * Maintains two FBOs (trailA / trailB). Each frame:
 *   trailNext = trailPrev * decay + gaussian_splat(cursor)
 * Then swap.
 */

import {
  linkProgram, getUniforms, createEmptyVAO,
  createFBO, resizeFBO, destroyFBO, type FBO,
} from '../gl';
import { FULLSCREEN_VERT, TRAIL_SPLAT_FRAG } from '../shaders';
import type { VisualConfig, VisualFrameInput } from '../../types';
import { pitchToHue, hslToRgb } from '../../colorMapping';

const UNIFORM_NAMES = [
  'uPrevTrail', 'uDecay', 'uMouseUV',
  'uSplatRadius', 'uSplatIntensity', 'uSplatColor',
] as const;

export class TrailAccumulationPass {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private uniforms: Record<typeof UNIFORM_NAMES[number], WebGLUniformLocation | null>;

  private fboA!: FBO;
  private fboB!: FBO;
  private pingA = true; // true: read A, write B

  private trailW = 0;
  private trailH = 0;
  private useFloat: boolean;

  constructor(gl: WebGL2RenderingContext, floatRT: boolean) {
    this.gl = gl;
    this.useFloat = floatRT;
    this.program = linkProgram(gl, FULLSCREEN_VERT, TRAIL_SPLAT_FRAG);
    this.vao = createEmptyVAO(gl);
    this.uniforms = getUniforms(gl, this.program, UNIFORM_NAMES);
  }

  /** (Re-)create ping-pong FBOs at the given resolution. */
  resize(width: number, height: number, scale: number): void {
    const gl = this.gl;
    const w = Math.max(1, Math.floor(width * scale));
    const h = Math.max(1, Math.floor(height * scale));
    if (w === this.trailW && h === this.trailH) return;

    this.trailW = w;
    this.trailH = h;

    const internalFmt = this.useFloat ? gl.RGBA16F : gl.RGBA8;
    const type = this.useFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    const opts = {
      width: w, height: h,
      internalFormat: internalFmt,
      format: gl.RGBA,
      type,
      filter: gl.LINEAR,
    };

    if (this.fboA) destroyFBO(gl, this.fboA);
    if (this.fboB) destroyFBO(gl, this.fboB);

    this.fboA = createFBO(gl, opts);
    this.fboB = createFBO(gl, opts);
  }

  /** Execute one accumulation step. Returns the output texture. */
  render(frame: VisualFrameInput, config: VisualConfig): WebGLTexture {
    const { gl } = this;
    const src = this.pingA ? this.fboA : this.fboB;
    const dst = this.pingA ? this.fboB : this.fboA;
    this.pingA = !this.pingA;

    // Bind destination FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.framebuffer);
    gl.viewport(0, 0, this.trailW, this.trailH);

    gl.useProgram(this.program);

    // Bind source trail texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.texture);
    gl.uniform1i(this.uniforms.uPrevTrail, 0);

    gl.uniform1f(this.uniforms.uDecay, config.trailDecay);

    // Mouse in UV space (y flipped for WebGL)
    const mx = frame.mouse.x / frame.width;
    const my = frame.mouse.y / frame.height;
    gl.uniform2f(this.uniforms.uMouseUV, mx, my);

    // Splat radius in UV space
    const radiusPx = config.trailSplatRadiusPx + frame.mouse.speed * 0.04;
    const radiusUV = radiusPx / Math.min(frame.width, frame.height);
    gl.uniform1f(this.uniforms.uSplatRadius, radiusUV);

    // Intensity: boost with speed + audio high
    const baseIntensity = 0.3 + frame.mouse.speed * 0.003 + frame.audio.high * 0.3;
    gl.uniform1f(this.uniforms.uSplatIntensity, Math.min(baseIntensity, 1.5));

    // Splat colour from pitch
    const hue = pitchToHue(frame.pitch);
    const rgb = hslToRgb(hue, config.colorSaturation / 100, config.colorLightness / 100);
    gl.uniform3f(this.uniforms.uSplatColor, rgb[0], rgb[1], rgb[2]);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return dst.texture;
  }

  getWidth(): number { return this.trailW; }
  getHeight(): number { return this.trailH; }

  destroy(): void {
    const { gl } = this;
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
    if (this.fboA) destroyFBO(gl, this.fboA);
    if (this.fboB) destroyFBO(gl, this.fboB);
  }
}
