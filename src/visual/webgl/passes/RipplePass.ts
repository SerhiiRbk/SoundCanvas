/**
 * Ripple Pass — instanced expanding rings triggered on noteOn.
 *
 * Object-pooled, SOA layout, single bufferSubData upload per frame.
 * Blend mode: additive (ONE, ONE).
 */

import {
  linkProgram, getUniforms,
  createQuadGeometry, createDynamicBuffer,
  type QuadGeometry,
} from '../gl';
import { RIPPLE_VERT, RIPPLE_FRAG } from '../shaders';
import { pitchToHue } from '../../colorMapping';
import { RIPPLE_EXPAND_SPEED, RIPPLE_MAX_LIFE } from '../../config';
import type { NoteVisualEvent, VisualFrameInput } from '../../types';

const FLOATS_PER_INSTANCE = 5; // x, y, radius, alpha, hue
const UNIFORM_NAMES = ['uResolution'] as const;

export class RipplePass {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private uniforms: Record<typeof UNIFORM_NAMES[number], WebGLUniformLocation | null>;
  private quad: QuadGeometry;
  private instanceBuffer: WebGLBuffer;

  /* ── SOA pool ── */
  private maxCount: number;
  private posX: Float32Array;
  private posY: Float32Array;
  private age: Float32Array;
  private maxLife: Float32Array;
  private hue: Float32Array;
  private active: Uint8Array;
  private activeCount = 0;
  private freeHint = 0;

  private instanceData: Float32Array;

  constructor(gl: WebGL2RenderingContext, maxRipples: number) {
    this.gl = gl;
    this.maxCount = maxRipples;

    this.program = linkProgram(gl, RIPPLE_VERT, RIPPLE_FRAG);
    this.uniforms = getUniforms(gl, this.program, UNIFORM_NAMES);
    this.quad = createQuadGeometry(gl);

    this.instanceBuffer = createDynamicBuffer(
      gl, maxRipples * FLOATS_PER_INSTANCE * 4,
    );

    this.posX = new Float32Array(maxRipples);
    this.posY = new Float32Array(maxRipples);
    this.age = new Float32Array(maxRipples);
    this.maxLife = new Float32Array(maxRipples);
    this.hue = new Float32Array(maxRipples);
    this.active = new Uint8Array(maxRipples);
    this.instanceData = new Float32Array(maxRipples * FLOATS_PER_INSTANCE);

    this.setupVAO();
  }

  private setupVAO(): void {
    const { gl, quad, instanceBuffer } = this;
    gl.bindVertexArray(quad.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);

    const stride = FLOATS_PER_INSTANCE * 4;
    // loc 1: iPos (vec2)
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);
    // loc 2: iRadius (float)
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 8);
    gl.vertexAttribDivisor(2, 1);
    // loc 3: iAlpha (float)
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 12);
    gl.vertexAttribDivisor(3, 1);
    // loc 4: iHue (float)
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(4, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindVertexArray(null);
  }

  emit(ev: NoteVisualEvent): void {
    const idx = this.acquire();
    if (idx < 0) return;
    this.posX[idx] = ev.x;
    this.posY[idx] = ev.y;
    this.age[idx] = 0;
    this.maxLife[idx] = RIPPLE_MAX_LIFE;
    this.hue[idx] = pitchToHue(ev.pitch);
    this.active[idx] = 1;
  }

  update(dt: number): void {
    for (let i = 0; i < this.maxCount; i++) {
      if (!this.active[i]) continue;
      this.age[i] += dt;
      if (this.age[i] >= this.maxLife[i]) {
        this.active[i] = 0;
        this.activeCount--;
        if (i < this.freeHint) this.freeHint = i;
      }
    }
  }

  render(frame: VisualFrameInput): void {
    const { gl } = this;
    let count = 0;

    for (let i = 0; i < this.maxCount; i++) {
      if (!this.active[i]) continue;
      const t = this.age[i] / this.maxLife[i]; // 0→1
      const radius = RIPPLE_EXPAND_SPEED * this.age[i];
      const alpha = Math.exp(-t * 3) * 0.6;
      if (alpha < 0.01) continue;

      const off = count * FLOATS_PER_INSTANCE;
      this.instanceData[off]     = this.posX[i];
      this.instanceData[off + 1] = this.posY[i];
      this.instanceData[off + 2] = radius;
      this.instanceData[off + 3] = alpha;
      this.instanceData[off + 4] = this.hue[i];
      count++;
    }

    if (count === 0) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData, 0, count * FLOATS_PER_INSTANCE);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.uResolution, frame.width, frame.height);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    gl.bindVertexArray(this.quad.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, this.quad.indexCount, gl.UNSIGNED_SHORT, 0, count);
    gl.bindVertexArray(null);

    gl.disable(gl.BLEND);
  }

  destroy(): void {
    const { gl } = this;
    gl.deleteProgram(this.program);
    gl.deleteBuffer(this.instanceBuffer);
    gl.deleteBuffer(this.quad.vertexBuffer);
    gl.deleteBuffer(this.quad.indexBuffer);
    gl.deleteVertexArray(this.quad.vao);
  }

  private acquire(): number {
    if (this.activeCount >= this.maxCount) return -1;
    for (let i = this.freeHint; i < this.maxCount; i++) {
      if (!this.active[i]) {
        this.activeCount++;
        this.freeHint = i + 1;
        return i;
      }
    }
    for (let i = 0; i < this.freeHint; i++) {
      if (!this.active[i]) {
        this.activeCount++;
        this.freeHint = i + 1;
        return i;
      }
    }
    return -1;
  }
}
