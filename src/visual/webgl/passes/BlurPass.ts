/**
 * Blur Pass — separable Gaussian blur with ping-pong FBOs.
 *
 * Configurable number of iterations and radius.
 * Used for bloom (blurs the bright-extract output).
 */

import {
  linkProgram, getUniforms, createEmptyVAO,
  createFBO, destroyFBO, type FBO,
} from '../gl';
import { FULLSCREEN_VERT, BLUR_FRAG } from '../shaders';

const UNIFORM_NAMES = ['uInput', 'uDirection', 'uRadius'] as const;

export class BlurPass {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private uniforms: Record<typeof UNIFORM_NAMES[number], WebGLUniformLocation | null>;
  private fboA!: FBO;
  private fboB!: FBO;
  private w = 0;
  private h = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = linkProgram(gl, FULLSCREEN_VERT, BLUR_FRAG);
    this.vao = createEmptyVAO(gl);
    this.uniforms = getUniforms(gl, this.program, UNIFORM_NAMES);
  }

  resize(width: number, height: number): void {
    if (width === this.w && height === this.h) return;
    this.w = width;
    this.h = height;
    const { gl } = this;
    if (this.fboA) destroyFBO(gl, this.fboA);
    if (this.fboB) destroyFBO(gl, this.fboB);
    this.fboA = createFBO(gl, { width, height });
    this.fboB = createFBO(gl, { width, height });
  }

  /**
   * Blur the input texture with `iterations` H+V passes.
   * Returns the final blurred texture.
   */
  render(
    inputTexture: WebGLTexture,
    iterations: number,
    radius: number,
  ): WebGLTexture {
    if (iterations <= 0) return inputTexture;

    const { gl } = this;
    gl.useProgram(this.program);

    let readTex = inputTexture;
    let writeFbo = this.fboA;
    let pingA = true;

    for (let i = 0; i < iterations; i++) {
      // Horizontal pass
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo.framebuffer);
      gl.viewport(0, 0, this.w, this.h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, readTex);
      gl.uniform1i(this.uniforms.uInput, 0);
      gl.uniform2f(this.uniforms.uDirection, 1.0 / this.w, 0.0);
      gl.uniform1f(this.uniforms.uRadius, radius);
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Swap
      readTex = writeFbo.texture;
      writeFbo = pingA ? this.fboB : this.fboA;
      pingA = !pingA;

      // Vertical pass
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo.framebuffer);
      gl.viewport(0, 0, this.w, this.h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, readTex);
      gl.uniform1i(this.uniforms.uInput, 0);
      gl.uniform2f(this.uniforms.uDirection, 0.0, 1.0 / this.h);
      gl.uniform1f(this.uniforms.uRadius, radius);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      readTex = writeFbo.texture;
      writeFbo = pingA ? this.fboB : this.fboA;
      pingA = !pingA;
    }

    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return readTex;
  }

  destroy(): void {
    const { gl } = this;
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
    if (this.fboA) destroyFBO(gl, this.fboA);
    if (this.fboB) destroyFBO(gl, this.fboB);
  }
}
