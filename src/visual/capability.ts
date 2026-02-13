/**
 * GPU Capability Detection & Scoring.
 *
 * Probes WebGL2 availability, float render-target support, max texture size,
 * and renderer info. Returns a 0–100 score that drives quality-tier selection.
 */

import type { GpuCapabilities } from './types';

/**
 * Detect GPU capabilities by creating a temporary WebGL2 context.
 * The probe canvas is never attached to the DOM.
 */
export function detectCapabilities(): GpuCapabilities {
  const result: GpuCapabilities = {
    webgl2: false,
    floatRT: false,
    linearFloat: false,
    maxTexSize: 0,
    rendererInfo: '',
    score: 0,
  };

  const probe = document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;

  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = probe.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      failIfMajorPerformanceCaveat: true,
    });
  } catch {
    // WebGL2 not available
  }

  if (!gl) {
    // Retry without failIfMajorPerformanceCaveat (software renderer)
    try {
      gl = probe.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
      });
    } catch {
      // still nothing
    }
  }

  if (!gl) {
    // No WebGL2 at all → score 0
    return result;
  }

  result.webgl2 = true;

  // ── Float render targets ──
  const extCBF = gl.getExtension('EXT_color_buffer_float');
  result.floatRT = !!extCBF;

  // ── Linear filtering of float textures ──
  const extLF = gl.getExtension('OES_texture_float_linear');
  result.linearFloat = !!extLF;

  // ── Max texture size ──
  result.maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

  // ── Renderer info (best-effort, may be blocked) ──
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  if (dbg) {
    result.rendererInfo = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string;
  }

  // ── Scoring ──
  let score = 0;

  // WebGL2 presence: +50
  score += 50;

  // Float RT support: +20
  if (result.floatRT) score += 20;

  // Linear float filtering: +10
  if (result.linearFloat) score += 10;

  // Large texture support
  if (result.maxTexSize >= 4096) score += 10;
  if (result.maxTexSize >= 8192) score += 5;

  // Renderer heuristic bonus (known discrete GPUs)
  const r = result.rendererInfo.toLowerCase();
  if (r.includes('nvidia') || r.includes('radeon') || r.includes('apple m') || r.includes('apple gpu')) {
    score += 5;
  }
  // Penalty for known software / low-end
  if (r.includes('swiftshader') || r.includes('llvmpipe') || r.includes('mesa')) {
    score -= 30;
  }

  result.score = Math.max(0, Math.min(100, score));

  // Cleanup
  const ext = gl.getExtension('WEBGL_lose_context');
  if (ext) ext.loseContext();

  return result;
}
