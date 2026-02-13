/**
 * Electric Flower Pass — faithful reproduction of the WebGL Electric Flower
 * sample (webglsamples.org/electricflower/electricflower.html).
 *
 * Generates the "flared cube" geometry (trapezoidal strips arranged into
 * 4 cones rotated around Y), renders with per-vertex twist, additive
 * blending, and HSV-cycling colours — exactly like the original.
 *
 * Renders into the currently bound FBO (scene FBO) with additive blending.
 */

import { linkProgram, getUniforms } from '../gl';
import { FLOWER_VERT, FLOWER_FRAG } from '../shaders';
import type { VisualFrameInput } from '../../types';

const UNIFORM_NAMES = [
  'uWorldViewProj', 'uTime', 'uColor', 'uColor2',
] as const;

/* ── Flared-cube geometry generation (port of tdl.primitives.createFlaredCube) ── */

function createFlaredCubeGeometry(innerSize: number, outerSize: number, layerCount: number) {
  // One plane: a trapezoid strip from innerSize to outerSize
  function makePlane(): { positions: number[]; texCoords: number[]; indices: number[] } {
    const positions: number[] = [];
    const texCoords: number[] = [];
    const indices: number[] = [];

    for (let z = 0; z <= layerCount; z++) {
      for (let x = 0; x <= 1; x++) {
        const u = x;
        const v = z / layerCount;
        const width = innerSize + (outerSize - innerSize) * v;
        positions.push(width * u - width * 0.5, 0, width * 0.7);
        texCoords.push(v, u);
      }
    }

    const numVertsAcross = 2;
    for (let z = 0; z < layerCount; z++) {
      indices.push(
        z * numVertsAcross,
        (z + 1) * numVertsAcross,
        z * numVertsAcross + 1,
      );
      indices.push(
        (z + 1) * numVertsAcross,
        (z + 1) * numVertsAcross + 1,
        z * numVertsAcross + 1,
      );
    }

    return { positions, texCoords, indices };
  }

  // Rotation helpers
  function rotX(v: number[], angle: number): number[] {
    const s = Math.sin(angle), c = Math.cos(angle);
    const out: number[] = [];
    for (let i = 0; i < v.length; i += 3) {
      out.push(v[i], c * v[i + 1] + s * v[i + 2], -s * v[i + 1] + c * v[i + 2]);
    }
    return out;
  }

  function rotY(v: number[], angle: number): number[] {
    const s = Math.sin(angle), c = Math.cos(angle);
    const out: number[] = [];
    for (let i = 0; i < v.length; i += 3) {
      out.push(c * v[i] + s * v[i + 2], v[i + 1], -s * v[i] + c * v[i + 2]);
    }
    return out;
  }

  function rotZ(v: number[], angle: number): number[] {
    const s = Math.sin(angle), c = Math.cos(angle);
    const out: number[] = [];
    for (let i = 0; i < v.length; i += 3) {
      out.push(c * v[i] + s * v[i + 1], -s * v[i] + c * v[i + 1], v[i + 2]);
    }
    return out;
  }

  function concat(
    ...parts: { positions: number[]; texCoords: number[]; indices: number[] }[]
  ) {
    const allPos: number[] = [];
    const allTc: number[] = [];
    const allIdx: number[] = [];
    let vertOffset = 0;
    for (const p of parts) {
      allPos.push(...p.positions);
      allTc.push(...p.texCoords);
      for (const i of p.indices) allIdx.push(i + vertOffset);
      vertOffset += p.positions.length / 3;
    }
    return { positions: allPos, texCoords: allTc, indices: allIdx };
  }

  // Build one plane, reorient 45° around X
  const basePlane = makePlane();
  basePlane.positions = rotX(basePlane.positions, Math.PI / 4);

  // 4 planes rotated around Z → cone
  const planes = [basePlane];
  for (let i = 1; i < 4; i++) {
    planes.push({
      positions: rotZ(basePlane.positions, (Math.PI * i) / 2),
      texCoords: [...basePlane.texCoords],
      indices: [...basePlane.indices],
    });
  }
  const cone = concat(...planes);

  // 4 cones rotated around Y → flared cube
  const cones = [cone];
  for (let i = 1; i < 4; i++) {
    cones.push({
      positions: rotY(cone.positions, (Math.PI * i) / 2),
      texCoords: [...cone.texCoords],
      indices: [...cone.indices],
    });
  }
  return concat(...cones);
}

/* ── HSV → RGBA (matches original flower.js) ── */
function hsv2rgba(h: number, s: number, v: number, a: number): [number, number, number, number] {
  h = ((h % 1) + 1) % 1;
  h *= 6;
  const i = Math.floor(h);
  let f = h - i;
  if (!(i & 1)) f = 1 - f;
  const m = v * (1 - s);
  const n = v * (1 - s * f);
  switch (i % 6) {
    case 0: return [v, n, m, a];
    case 1: return [n, v, m, a];
    case 2: return [m, v, n, a];
    case 3: return [m, n, v, a];
    case 4: return [n, m, v, a];
    default: return [v, m, n, a];
  }
}

/* ── Matrix helpers ── */
function mat4Perspective(fovRad: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1.0 / Math.tan(fovRad / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function mat4LookAt(eye: number[], target: number[], up: number[]): Float32Array {
  const zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let len = 1 / Math.sqrt(zx * zx + zy * zy + zz * zz);
  const fz = [zx * len, zy * len, zz * len];
  const rx = up[1] * fz[2] - up[2] * fz[1];
  const ry = up[2] * fz[0] - up[0] * fz[2];
  const rz = up[0] * fz[1] - up[1] * fz[0];
  len = 1 / Math.sqrt(rx * rx + ry * ry + rz * rz);
  const fx = [rx * len, ry * len, rz * len];
  const ux = [fz[1] * fx[2] - fz[2] * fx[1], fz[2] * fx[0] - fz[0] * fx[2], fz[0] * fx[1] - fz[1] * fx[0]];
  return new Float32Array([
    fx[0], ux[0], fz[0], 0,
    fx[1], ux[1], fz[1], 0,
    fx[2], ux[2], fz[2], 0,
    -(fx[0] * eye[0] + fx[1] * eye[1] + fx[2] * eye[2]),
    -(ux[0] * eye[0] + ux[1] * eye[1] + ux[2] * eye[2]),
    -(fz[0] * eye[0] + fz[1] * eye[1] + fz[2] * eye[2]),
    1,
  ]);
}

function mat4RotY(angle: number): Float32Array {
  const s = Math.sin(angle), c = Math.cos(angle);
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1,
  ]);
}

function mat4Mul(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      out[j * 4 + i] =
        a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] +
        a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
    }
  }
  return out;
}

const LAYER_COUNT = 400;

export class ElectricFlowerPass {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private posBuffer: WebGLBuffer;
  private tcBuffer: WebGLBuffer;
  private indexBuffer: WebGLBuffer;
  private indexCount: number;
  private indexType: number;
  private uniforms: Record<typeof UNIFORM_NAMES[number], WebGLUniformLocation | null>;

  /* Pre-computed matrices */
  private view: Float32Array;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = linkProgram(gl, FLOWER_VERT, FLOWER_FRAG);
    this.uniforms = getUniforms(gl, this.program, UNIFORM_NAMES);

    // Generate geometry
    const geo = createFlaredCubeGeometry(0.01, 3.0, LAYER_COUNT);

    // Upload buffers
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    // Position (location 0)
    this.posBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.positions), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(this.program, 'aPosition');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

    // TexCoord (location 1)
    this.tcBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tcBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.texCoords), gl.STATIC_DRAW);
    const tcLoc = gl.getAttribLocation(this.program, 'aTexCoord');
    gl.enableVertexAttribArray(tcLoc);
    gl.vertexAttribPointer(tcLoc, 2, gl.FLOAT, false, 0, 0);

    // Indices — use Uint32 if vertex count exceeds Uint16 range
    this.indexBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    const vertexCount = geo.positions.length / 3;
    const useUint32 = vertexCount > 65535;
    const idxArray = useUint32
      ? new Uint32Array(geo.indices)
      : new Uint16Array(geo.indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxArray, gl.STATIC_DRAW);
    this.indexCount = geo.indices.length;
    this.indexType = useUint32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;

    gl.bindVertexArray(null);

    // View matrix (static — same as original)
    this.view = mat4LookAt([0, 0, 3], [-0.3, 0, 0], [0, 1, 0]);
  }

  render(frame: VisualFrameInput): void {
    const { gl } = this;
    const time = frame.time;
    const aspect = frame.width / frame.height;

    // Build world-view-projection matrix
    const proj = mat4Perspective(Math.PI / 3, aspect, 0.1, 500);
    const world = mat4RotY(time * 0.2);
    const viewProj = mat4Mul(this.view, proj);
    const wvp = mat4Mul(world, viewProj);

    // HSV-cycling colours (from original flower.js)
    const color1 = hsv2rgba((time * 0.1) % 1.0, 0.8, 0.1, 1);
    const color2 = hsv2rgba((time * 0.22124) % 1.0, 0.7, 0.1, 0);

    // Set up additive blending (ONE, ONE) — same as original
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.uWorldViewProj, false, wvp);
    gl.uniform1f(this.uniforms.uTime, time);
    gl.uniform4fv(this.uniforms.uColor, color1);
    gl.uniform4fv(this.uniforms.uColor2, color2);

    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.indexCount, this.indexType, 0);
    gl.bindVertexArray(null);

    // Restore blending state
    gl.disable(gl.BLEND);
  }

  destroy(): void {
    const { gl } = this;
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.posBuffer);
    gl.deleteBuffer(this.tcBuffer);
    gl.deleteBuffer(this.indexBuffer);
  }
}
