/**
 * WebGL2 helper utilities — compile, link, VAO, buffers, FBO, textures.
 *
 * Zero-allocation where possible: typed arrays are pre-sized,
 * errors are thrown only during init (never in hot path).
 */

/* ══════════════════════════════════════════════
   Shader compilation
   ══════════════════════════════════════════════ */

export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? '';
    gl.deleteShader(shader);
    throw new Error(`Shader compile error:\n${info}\n--- source ---\n${source}`);
  }
  return shader;
}

export function linkProgram(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string,
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getLinkParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog) ?? '';
    gl.deleteProgram(prog);
    throw new Error(`Program link error:\n${info}`);
  }
  // Shaders can be detached after linking
  gl.detachShader(prog, vs);
  gl.detachShader(prog, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

/* ══════════════════════════════════════════════
   Uniform helpers
   ══════════════════════════════════════════════ */

/** Cache uniform locations for a program. */
export function getUniforms<T extends string>(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: readonly T[],
): Record<T, WebGLUniformLocation | null> {
  const map = {} as Record<T, WebGLUniformLocation | null>;
  for (const n of names) {
    map[n] = gl.getUniformLocation(program, n);
  }
  return map;
}

/* ══════════════════════════════════════════════
   Buffer helpers
   ══════════════════════════════════════════════ */

export function createStaticBuffer(
  gl: WebGL2RenderingContext,
  data: BufferSource,
  target: number = gl.ARRAY_BUFFER,
): WebGLBuffer {
  const buf = gl.createBuffer()!;
  gl.bindBuffer(target, buf);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  gl.bindBuffer(target, null);
  return buf;
}

export function createDynamicBuffer(
  gl: WebGL2RenderingContext,
  byteSize: number,
  target: number = gl.ARRAY_BUFFER,
): WebGLBuffer {
  const buf = gl.createBuffer()!;
  gl.bindBuffer(target, buf);
  gl.bufferData(target, byteSize, gl.DYNAMIC_DRAW);
  gl.bindBuffer(target, null);
  return buf;
}

/* ══════════════════════════════════════════════
   Texture helpers
   ══════════════════════════════════════════════ */

export interface TexOptions {
  width: number;
  height: number;
  internalFormat?: number;  // default RGBA8
  format?: number;          // default RGBA
  type?: number;            // default UNSIGNED_BYTE
  filter?: number;          // default LINEAR
  wrap?: number;            // default CLAMP_TO_EDGE
}

export function createTexture(gl: WebGL2RenderingContext, opts: TexOptions): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D, 0,
    opts.internalFormat ?? gl.RGBA8,
    opts.width, opts.height, 0,
    opts.format ?? gl.RGBA,
    opts.type ?? gl.UNSIGNED_BYTE,
    null,
  );
  const filter = opts.filter ?? gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  const wrap = opts.wrap ?? gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

export function resizeTexture(
  gl: WebGL2RenderingContext,
  tex: WebGLTexture,
  opts: TexOptions,
): void {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D, 0,
    opts.internalFormat ?? gl.RGBA8,
    opts.width, opts.height, 0,
    opts.format ?? gl.RGBA,
    opts.type ?? gl.UNSIGNED_BYTE,
    null,
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
}

/* ══════════════════════════════════════════════
   FBO helpers
   ══════════════════════════════════════════════ */

export interface FBO {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

export function createFBO(gl: WebGL2RenderingContext, opts: TexOptions): FBO {
  const tex = createTexture(gl, opts);
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`Framebuffer incomplete: 0x${status.toString(16)}`);
  }
  return { framebuffer: fb, texture: tex, width: opts.width, height: opts.height };
}

export function resizeFBO(gl: WebGL2RenderingContext, fbo: FBO, opts: TexOptions): void {
  resizeTexture(gl, fbo.texture, opts);
  fbo.width = opts.width;
  fbo.height = opts.height;
}

export function destroyFBO(gl: WebGL2RenderingContext, fbo: FBO): void {
  gl.deleteFramebuffer(fbo.framebuffer);
  gl.deleteTexture(fbo.texture);
}

/* ══════════════════════════════════════════════
   Full-screen triangle (no VBO needed)
   ══════════════════════════════════════════════ */

/**
 * Create an empty VAO for drawing a full-screen triangle.
 * Usage: bind VAO, then gl.drawArrays(gl.TRIANGLES, 0, 3).
 * The vertex shader generates positions from gl_VertexID.
 */
export function createEmptyVAO(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()!;
  return vao;
}

/* ══════════════════════════════════════════════
   Instanced quad geometry (for particles / ripples)
   ══════════════════════════════════════════════ */

/**
 * Creates a unit quad [-1..1] with indices, ready for instanced rendering.
 * Returns { vao, vertexBuffer, indexBuffer, indexCount }.
 * Attribute location 0 = aQuad (vec2).
 */
export interface QuadGeometry {
  vao: WebGLVertexArrayObject;
  vertexBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
  indexCount: number;
}

export function createQuadGeometry(gl: WebGL2RenderingContext): QuadGeometry {
  // Vertices: 4 corners of unit quad
  const vertices = new Float32Array([
    -1, -1,
     1, -1,
     1,  1,
    -1,  1,
  ]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  const vb = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const ib = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  gl.bindVertexArray(null);

  return { vao, vertexBuffer: vb, indexBuffer: ib, indexCount: 6 };
}
