/**
 * Bright Extract Pass — extracts luminance above threshold for bloom input.
 *
 * Reads from the scene texture, writes bright pixels to a half-res FBO.
 */

import {
  linkProgram, getUniforms, createEmptyVAO,
  createFBO, destroyFBO, type FBO,
} from '../gl';
import { FULLSCREEN_VERT, BRIGHT_FRAG } from '../shaders';

const UNIFORM_NAMES = ['uScene', 'uThreshold'] as const;

export class BrightExtractPass {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private uniforms: Record<typeof UNIFORM_NAMES[number], WebGLUniformLocation | null>;
  private fbo!: FBO;
  private w = 0;
  private h = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = linkProgram(gl, FULLSCREEN_VERT, BRIGHT_FRAG);
    this.vao = createEmptyVAO(gl);
    this.uniforms = getUniforms(gl, this.program, UNIFORM_NAMES);
  }

  /** Resize the bright FBO to half the scene resolution. */
  resize(sceneW: number, sceneH: number): void {
    const w = Math.max(1, Math.floor(sceneW / 2));
    const h = Math.max(1, Math.floor(sceneH / 2));
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    const { gl } = this;
    if (this.fbo) destroyFBO(gl, this.fbo);
    this.fbo = createFBO(gl, { width: w, height: h });
  }

  /** Extract bright areas from sceneTexture. Returns brightTexture. */
  render(sceneTexture: WebGLTexture, threshold: number): WebGLTexture {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo.framebuffer);
    gl.viewport(0, 0, this.w, this.h);

    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
    gl.uniform1i(this.uniforms.uScene, 0);
    gl.uniform1f(this.uniforms.uThreshold, threshold);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this.fbo.texture;
  }

  getWidth(): number { return this.w; }
  getHeight(): number { return this.h; }

  destroy(): void {
    const { gl } = this;
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
    if (this.fbo) destroyFBO(gl, this.fbo);
  }
}
