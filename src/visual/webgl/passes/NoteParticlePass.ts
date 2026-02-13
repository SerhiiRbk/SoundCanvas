/**
 * Note Particle Pass — emits musical-note-shaped particles from the cursor.
 *
 * Continuously spawns small ♪ notes that scatter outward from the mouse
 * position as it moves. Each note has a random hue, rotation, and velocity.
 * Uses the same instanced-quad approach as ParticlePass but with a note SDF
 * fragment shader and an extra rotation attribute.
 *
 * Blend mode: additive (ONE, ONE).
 */

import {
  linkProgram, getUniforms,
  createQuadGeometry, createDynamicBuffer,
  type QuadGeometry,
} from '../gl';
import { NOTE_PARTICLE_VERT, NOTE_PARTICLE_FRAG } from '../shaders';
import { pitchToHue } from '../../colorMapping';
import type { VisualFrameInput } from '../../types';

/* Per-instance: [x, y, size, hue, alpha, rotation] = 6 floats */
const FLOATS_PER_INSTANCE = 6;
const MAX_NOTES = 300;

/* Emission config */
const EMIT_RATE = 0.005;        // seconds between emissions at moderate speed
const MIN_SPEED_TO_EMIT = 5;    // cursor px/s speed threshold
const NOTE_LIFE_MIN = 1.2;
const NOTE_LIFE_MAX = 3.0;
const NOTE_SIZE_MIN = 18;
const NOTE_SIZE_MAX = 36;
const NOTE_SCATTER_SPEED = 2.2;
const NOTE_GRAVITY = 0.015;
const NOTE_DRAG = 0.988;
const NOTE_SPIN_SPEED = 1.0;

const UNIFORM_NAMES = ['uResolution'] as const;

export class NoteParticlePass {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private uniforms: Record<typeof UNIFORM_NAMES[number], WebGLUniformLocation | null>;
  private quad: QuadGeometry;
  private instanceBuffer: WebGLBuffer;

  /* SOA pool */
  private posX = new Float32Array(MAX_NOTES);
  private posY = new Float32Array(MAX_NOTES);
  private velX = new Float32Array(MAX_NOTES);
  private velY = new Float32Array(MAX_NOTES);
  private life = new Float32Array(MAX_NOTES);
  private maxLife = new Float32Array(MAX_NOTES);
  private size = new Float32Array(MAX_NOTES);
  private hue = new Float32Array(MAX_NOTES);
  private rotation = new Float32Array(MAX_NOTES);
  private spin = new Float32Array(MAX_NOTES);
  private active = new Uint8Array(MAX_NOTES);
  private freeHint = 0;
  private activeCount = 0;

  /* Emission timer */
  private emitAccum = 0;

  /* GPU upload buffer */
  private instanceData = new Float32Array(MAX_NOTES * FLOATS_PER_INSTANCE);

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = linkProgram(gl, NOTE_PARTICLE_VERT, NOTE_PARTICLE_FRAG);
    this.uniforms = getUniforms(gl, this.program, UNIFORM_NAMES);
    this.quad = createQuadGeometry(gl);
    this.instanceBuffer = createDynamicBuffer(
      gl, MAX_NOTES * FLOATS_PER_INSTANCE * 4,
    );
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
    // loc 5: iRotation (float)
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 20);
    gl.vertexAttribDivisor(5, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindVertexArray(null);
  }

  update(frame: VisualFrameInput): void {
    const dt = frame.dt;
    const dtN = dt * 60;
    const speed = frame.mouse.speed;

    // Emit notes based on cursor speed
    if (speed > MIN_SPEED_TO_EMIT) {
      const rate = EMIT_RATE / (1 + speed * 0.005);
      this.emitAccum += dt;
      while (this.emitAccum >= rate) {
        this.emitAccum -= rate;
        this.emitNote(frame);
      }
    } else {
      this.emitAccum = 0;
    }

    // Simulate
    for (let i = 0; i < MAX_NOTES; i++) {
      if (!this.active[i]) continue;

      this.posX[i] += this.velX[i] * dtN;
      this.posY[i] += this.velY[i] * dtN;
      this.velX[i] *= NOTE_DRAG;
      this.velY[i] *= NOTE_DRAG;
      this.velY[i] += NOTE_GRAVITY * dtN;
      this.rotation[i] += this.spin[i] * dt;

      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.active[i] = 0;
        this.activeCount--;
        if (i < this.freeHint) this.freeHint = i;
      }
    }
  }

  private emitNote(frame: VisualFrameInput): void {
    const idx = this.acquire();
    if (idx < 0) return;

    const angle = Math.random() * Math.PI * 2;
    const spd = NOTE_SCATTER_SPEED * (0.5 + Math.random() * 0.8);

    this.posX[idx] = frame.mouse.x + (Math.random() - 0.5) * 10;
    this.posY[idx] = frame.mouse.y + (Math.random() - 0.5) * 10;
    this.velX[idx] = Math.cos(angle) * spd + frame.mouse.vx * 0.3;
    this.velY[idx] = Math.sin(angle) * spd + frame.mouse.vy * 0.3;

    const lf = NOTE_LIFE_MIN + Math.random() * (NOTE_LIFE_MAX - NOTE_LIFE_MIN);
    this.life[idx] = lf;
    this.maxLife[idx] = lf;
    this.size[idx] = NOTE_SIZE_MIN + Math.random() * (NOTE_SIZE_MAX - NOTE_SIZE_MIN)
      + frame.audio.rms * 12;
    this.hue[idx] = pitchToHue(frame.pitch) + (Math.random() - 0.5) * 60;
    this.rotation[idx] = (Math.random() - 0.5) * 1.0;
    this.spin[idx] = (Math.random() - 0.5) * NOTE_SPIN_SPEED;
    this.active[idx] = 1;
  }

  render(frame: VisualFrameInput): void {
    const { gl } = this;

    let count = 0;
    for (let i = 0; i < MAX_NOTES; i++) {
      if (!this.active[i]) continue;
      const t = this.life[i] / this.maxLife[i];
      if (t < 0.02) continue;

      const off = count * FLOATS_PER_INSTANCE;
      this.instanceData[off]     = this.posX[i];
      this.instanceData[off + 1] = this.posY[i];
      this.instanceData[off + 2] = this.size[i] * (0.5 + t * 0.5);
      this.instanceData[off + 3] = this.hue[i];
      this.instanceData[off + 4] = t * t; // quadratic fade for softer disappearance
      this.instanceData[off + 5] = this.rotation[i];
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
    if (this.activeCount >= MAX_NOTES) return -1;
    for (let i = this.freeHint; i < MAX_NOTES; i++) {
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
