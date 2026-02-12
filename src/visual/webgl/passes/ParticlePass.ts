/**
 * Particle Pass — CPU emission + GPU instanced rendering.
 *
 * Maintains a struct-of-arrays (SOA) particle pool for cache-efficient
 * CPU updates. Packs active particles into a Float32Array for a single
 * bufferSubData upload per frame. Renders as instanced quads with
 * analytic glow in the fragment shader.
 *
 * Blend mode: additive (ONE, ONE).
 */

import {
  linkProgram, getUniforms,
  createQuadGeometry, createDynamicBuffer,
  type QuadGeometry,
} from '../gl';
import { PARTICLE_VERT, PARTICLE_FRAG } from '../shaders';
import { pitchToHue } from '../../colorMapping';
import type { NoteVisualEvent, VisualConfig, VisualFrameInput } from '../../types';
import {
  PARTICLE_BASE_COUNT, PARTICLE_VELOCITY_K,
  PARTICLE_SPEED_MIN, PARTICLE_SPEED_MAX,
  PARTICLE_GRAVITY, PARTICLE_DRAG,
  PARTICLE_LIFE_MIN, PARTICLE_LIFE_MAX,
} from '../../config';

/* ── Instance data layout ──
   Per-instance: [x, y, size, hue, alpha] = 5 floats = 20 bytes
*/
const FLOATS_PER_INSTANCE = 5;

const UNIFORM_NAMES = ['uResolution'] as const;

export class ParticlePass {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private uniforms: Record<typeof UNIFORM_NAMES[number], WebGLUniformLocation | null>;
  private quad: QuadGeometry;
  private instanceBuffer: WebGLBuffer;

  /* ── SOA particle pool ── */
  private maxCount: number;
  private posX: Float32Array;
  private posY: Float32Array;
  private velX: Float32Array;
  private velY: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private hue: Float32Array;
  private active: Uint8Array;
  private freeHint = 0;
  private activeCount = 0;

  /* ── GPU upload buffer (pre-allocated) ── */
  private instanceData: Float32Array;

  constructor(gl: WebGL2RenderingContext, maxParticles: number) {
    this.gl = gl;
    this.maxCount = maxParticles;

    // Compile
    this.program = linkProgram(gl, PARTICLE_VERT, PARTICLE_FRAG);
    this.uniforms = getUniforms(gl, this.program, UNIFORM_NAMES);

    // Geometry
    this.quad = createQuadGeometry(gl);

    // Instance buffer (GPU)
    this.instanceBuffer = createDynamicBuffer(
      gl, maxParticles * FLOATS_PER_INSTANCE * 4,
    );

    // SOA pool
    this.posX = new Float32Array(maxParticles);
    this.posY = new Float32Array(maxParticles);
    this.velX = new Float32Array(maxParticles);
    this.velY = new Float32Array(maxParticles);
    this.life = new Float32Array(maxParticles);
    this.maxLife = new Float32Array(maxParticles);
    this.size = new Float32Array(maxParticles);
    this.hue = new Float32Array(maxParticles);
    this.active = new Uint8Array(maxParticles);

    // Upload buffer
    this.instanceData = new Float32Array(maxParticles * FLOATS_PER_INSTANCE);

    // Setup VAO with per-instance attributes
    this.setupVAO();
  }

  private setupVAO(): void {
    const { gl, quad, instanceBuffer } = this;
    gl.bindVertexArray(quad.vao);

    // Instance attributes at locations 1–4
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    const stride = FLOATS_PER_INSTANCE * 4;

    // loc 1: iPos (vec2)
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);

    // loc 2: iSize (float)
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 8);
    gl.vertexAttribDivisor(2, 1);

    // loc 3: iHue (float)
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 12);
    gl.vertexAttribDivisor(3, 1);

    // loc 4: iAlpha (float)
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(4, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindVertexArray(null);
  }

  /* ── CPU simulation ── */

  emit(ev: NoteVisualEvent, stability: number, scale: number): void {
    const factor = 1 - stability * 0.4;
    const count = Math.round((PARTICLE_BASE_COUNT + ev.velocity * PARTICLE_VELOCITY_K) * factor * scale);
    const h = pitchToHue(ev.pitch);

    for (let i = 0; i < count; i++) {
      const idx = this.acquire();
      if (idx < 0) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = PARTICLE_SPEED_MIN
        + Math.random() * (PARTICLE_SPEED_MAX - PARTICLE_SPEED_MIN)
        * (0.5 + ev.velocity * 0.5);

      this.posX[idx] = ev.x;
      this.posY[idx] = ev.y;
      this.velX[idx] = Math.cos(angle) * speed;
      this.velY[idx] = Math.sin(angle) * speed;
      const lf = PARTICLE_LIFE_MIN + Math.random() * (PARTICLE_LIFE_MAX - PARTICLE_LIFE_MIN);
      this.life[idx] = lf;
      this.maxLife[idx] = lf;
      this.size[idx] = (1.5 + Math.random() * 2.5 + ev.velocity * 3) * scale;
      this.hue[idx] = h + (Math.random() - 0.5) * 25;
      this.active[idx] = 1;
    }
  }

  update(frame: VisualFrameInput): void {
    const dt = frame.dt;
    const dtN = dt * 60; // normalised to 60fps baseline
    const grav = PARTICLE_GRAVITY * dtN;
    const high = frame.audio.high;

    for (let i = 0; i < this.maxCount; i++) {
      if (!this.active[i]) continue;

      this.posX[i] += this.velX[i] * dtN;
      this.posY[i] += this.velY[i] * dtN;
      this.velX[i] *= PARTICLE_DRAG;
      this.velY[i] *= PARTICLE_DRAG;
      this.velY[i] += grav;

      // High-frequency jitter
      if (high > 0.1) {
        this.posX[i] += (Math.random() - 0.5) * high * 1.5;
        this.posY[i] += (Math.random() - 0.5) * high * 1.5;
      }

      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.active[i] = 0;
        this.activeCount--;
        if (i < this.freeHint) this.freeHint = i;
      }
    }
  }

  /** Pack active particles into instanceData and upload. */
  render(frame: VisualFrameInput): void {
    const { gl } = this;

    // Pack
    let count = 0;
    for (let i = 0; i < this.maxCount; i++) {
      if (!this.active[i]) continue;
      const t = this.life[i] / this.maxLife[i]; // 1→0
      if (t < 0.02) continue;

      const off = count * FLOATS_PER_INSTANCE;
      this.instanceData[off]     = this.posX[i];
      this.instanceData[off + 1] = this.posY[i];
      this.instanceData[off + 2] = this.size[i] * t;
      this.instanceData[off + 3] = this.hue[i];
      this.instanceData[off + 4] = t;
      count++;
    }

    if (count === 0) return;

    // Upload
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData, 0, count * FLOATS_PER_INSTANCE);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // Draw
    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.uResolution, frame.width, frame.height);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE); // additive

    gl.bindVertexArray(this.quad.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, this.quad.indexCount, gl.UNSIGNED_SHORT, 0, count);
    gl.bindVertexArray(null);

    gl.disable(gl.BLEND);
  }

  getActiveCount(): number { return this.activeCount; }

  reset(): void {
    this.active.fill(0);
    this.activeCount = 0;
    this.freeHint = 0;
  }

  /** Re-initialise for a different max count. */
  setMaxParticles(max: number): void {
    if (max === this.maxCount) return;
    this.reset();
    this.maxCount = max;

    this.posX = new Float32Array(max);
    this.posY = new Float32Array(max);
    this.velX = new Float32Array(max);
    this.velY = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.hue = new Float32Array(max);
    this.active = new Uint8Array(max);
    this.instanceData = new Float32Array(max * FLOATS_PER_INSTANCE);

    // Resize GPU buffer
    const { gl } = this;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, max * FLOATS_PER_INSTANCE * 4, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  destroy(): void {
    const { gl } = this;
    gl.deleteProgram(this.program);
    gl.deleteBuffer(this.instanceBuffer);
    gl.deleteBuffer(this.quad.vertexBuffer);
    gl.deleteBuffer(this.quad.indexBuffer);
    gl.deleteVertexArray(this.quad.vao);
  }

  /* ── Pool management ── */

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
