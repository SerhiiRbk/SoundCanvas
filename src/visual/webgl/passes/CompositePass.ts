/**
 * Composite Pass — merges scene + trail + bloom with tone mapping & gamma.
 *
 * Renders the final output to the default framebuffer (screen / canvas).
 */

import { linkProgram, getUniforms, createEmptyVAO } from '../gl';
import { FULLSCREEN_VERT, COMPOSITE_FRAG } from '../shaders';
import type { VisualConfig } from '../../types';

const UNIFORM_NAMES = [
  'uScene', 'uBloom', 'uTrail',
  'uBloomStrength', 'uTrailMix', 'uGlowIntensity',
] as const;

export class CompositePass {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private uniforms: Record<typeof UNIFORM_NAMES[number], WebGLUniformLocation | null>;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = linkProgram(gl, FULLSCREEN_VERT, COMPOSITE_FRAG);
    this.vao = createEmptyVAO(gl);
    this.uniforms = getUniforms(gl, this.program, UNIFORM_NAMES);
  }

  render(
    sceneTexture: WebGLTexture,
    bloomTexture: WebGLTexture | null,
    trailTexture: WebGLTexture | null,
    config: VisualConfig,
    width: number,
    height: number,
  ): void {
    const { gl } = this;

    // Render to screen (default FBO)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);

    gl.useProgram(this.program);

    // Scene (tex unit 0)
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
    gl.uniform1i(this.uniforms.uScene, 0);

    // Bloom (tex unit 1) — black texture if bloom disabled
    gl.activeTexture(gl.TEXTURE1);
    if (bloomTexture) {
      gl.bindTexture(gl.TEXTURE_2D, bloomTexture);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, sceneTexture); // fallback (will be * 0)
    }
    gl.uniform1i(this.uniforms.uBloom, 1);

    // Trail (tex unit 2)
    gl.activeTexture(gl.TEXTURE2);
    if (trailTexture) {
      gl.bindTexture(gl.TEXTURE_2D, trailTexture);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
    }
    gl.uniform1i(this.uniforms.uTrail, 2);

    gl.uniform1f(this.uniforms.uBloomStrength, bloomTexture ? config.bloomStrength : 0);
    gl.uniform1f(this.uniforms.uTrailMix, trailTexture ? 1.0 : 0);
    gl.uniform1f(this.uniforms.uGlowIntensity, config.glowIntensity);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  destroy(): void {
    this.gl.deleteProgram(this.program);
    this.gl.deleteVertexArray(this.vao);
  }
}
