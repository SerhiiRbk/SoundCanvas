/**
 * Background Pass — full-screen dark gradient with cursor glow and animated noise.
 *
 * Renders to the scene FBO. Uniforms driven by mouse position and audio energy.
 */

import { linkProgram, getUniforms, createEmptyVAO } from '../gl';
import { FULLSCREEN_VERT, BG_FRAG } from '../shaders';
import type { VisualFrameInput } from '../../types';

const UNIFORM_NAMES = [
  'uTime', 'uResolution', 'uMouse', 'uEnergy', 'uLowEnergy',
] as const;

export class BackgroundPass {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private uniforms: Record<typeof UNIFORM_NAMES[number], WebGLUniformLocation | null>;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = linkProgram(gl, FULLSCREEN_VERT, BG_FRAG);
    this.vao = createEmptyVAO(gl);
    this.uniforms = getUniforms(gl, this.program, UNIFORM_NAMES);
  }

  render(frame: VisualFrameInput): void {
    const { gl } = this;
    gl.useProgram(this.program);

    gl.uniform1f(this.uniforms.uTime, frame.time);
    gl.uniform2f(this.uniforms.uResolution, frame.width, frame.height);
    gl.uniform2f(this.uniforms.uMouse, frame.mouse.x, frame.mouse.y);
    gl.uniform1f(this.uniforms.uEnergy, frame.audio.rms);
    gl.uniform1f(this.uniforms.uLowEnergy, frame.audio.low);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  destroy(): void {
    this.gl.deleteProgram(this.program);
    this.gl.deleteVertexArray(this.vao);
  }
}
