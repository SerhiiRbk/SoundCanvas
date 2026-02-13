/**
 * GLSL shader sources — WebGL2 (#version 300 es).
 *
 * Each shader is an exported string constant. Organised by pass.
 * Uses template literals for readability; no runtime cost.
 */

/* ══════════════════════════════════════════════
   COMMON: Full-screen triangle vertex shader
   (no vertex buffer — uses gl_VertexID)
   ══════════════════════════════════════════════ */

export const FULLSCREEN_VERT = /* glsl */ `#version 300 es
precision highp float;
out vec2 vUV;
void main() {
  // Full-screen triangle: vertices 0,1,2 cover the viewport
  float x = -1.0 + float((gl_VertexID & 1) << 2);
  float y = -1.0 + float((gl_VertexID & 2) << 1);
  vUV = vec2(x, y) * 0.5 + 0.5;
  gl_Position = vec4(x, y, 0.0, 1.0);
}
`;

/* ══════════════════════════════════════════════
   COMMON: HSL → RGB conversion (shared include)
   ══════════════════════════════════════════════ */

const HSL2RGB_FUNC = /* glsl */ `
vec3 hsl2rgb(float h, float s, float l) {
  h = mod(h, 360.0) / 360.0;
  float c = (1.0 - abs(2.0 * l - 1.0)) * s;
  float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
  float m = l - c * 0.5;
  vec3 rgb;
  float h6 = h * 6.0;
  if      (h6 < 1.0) rgb = vec3(c, x, 0.0);
  else if (h6 < 2.0) rgb = vec3(x, c, 0.0);
  else if (h6 < 3.0) rgb = vec3(0.0, c, x);
  else if (h6 < 4.0) rgb = vec3(0.0, x, c);
  else if (h6 < 5.0) rgb = vec3(x, 0.0, c);
  else               rgb = vec3(c, 0.0, x);
  return rgb + m;
}
`;

/* ══════════════════════════════════════════════
   COMMON: Simple hash noise
   ══════════════════════════════════════════════ */

const NOISE_FUNC = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

/* ══════════════════════════════════════════════
   1. BACKGROUND PASS
   ══════════════════════════════════════════════ */

export const BG_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;

uniform float uTime;
uniform vec2  uResolution;
uniform vec2  uMouse;       // pixel coords
uniform float uEnergy;      // audio RMS
uniform float uLowEnergy;

${NOISE_FUNC}

void main() {
  vec2 uv = vUV;
  vec2 mouseUV = vec2(uMouse.x / uResolution.x, uMouse.y / uResolution.y);

  // Dark base colour (matches Electric Flower original)
  vec3 bg = vec3(0.10, 0.20, 0.30);

  // Radial gradient at cursor
  float d = distance(uv, mouseUV);
  float glow = exp(-d * d * 8.0) * (0.06 + uEnergy * 0.10);
  bg += vec3(0.10, 0.05, 0.20) * glow;

  // Subtle low-freq reactive background pulse
  bg += vec3(0.02, 0.01, 0.04) * uLowEnergy * 0.5;

  // Animated noise
  float n = valueNoise(uv * 200.0 + uTime * 3.0) * 0.012;
  bg += n;

  fragColor = vec4(bg, 1.0);
}
`;

/* ══════════════════════════════════════════════
   1b. ELECTRIC FLOWER PASS (geometry-based)
   Faithful reproduction of the WebGL Electric Flower
   (webglsamples.org/electricflower/electricflower.html).
   Renders a "flared cube" geometry with per-vertex
   twist, additive blending, and HSV-cycling colours.
   ══════════════════════════════════════════════ */

export const FLOWER_VERT = /* glsl */ `#version 300 es
precision highp float;

in vec3 aPosition;
in vec2 aTexCoord;

uniform mat4 uWorldViewProj;
uniform float uTime;
uniform vec4 uColor;
uniform vec4 uColor2;

out vec4 vColor;

vec3 rotX(vec3 v, float a) { float s=sin(a),c=cos(a); return vec3(v.x, c*v.y+s*v.z, -s*v.y+c*v.z); }
vec3 rotY(vec3 v, float a) { float s=sin(a),c=cos(a); return vec3(c*v.x+s*v.z, v.y, -s*v.x+c*v.z); }
vec3 rotZ(vec3 v, float a) { float s=sin(a),c=cos(a); return vec3(c*v.x+s*v.y, -s*v.x+c*v.y, v.z); }

void main() {
  float tc = aTexCoord.x;
  vColor = mix(uColor, uColor2, tc);
  vColor *= vColor.w;

  vec3 pos = rotZ(rotX(rotY(aPosition,
    -uTime + tc * 6.1), -uTime * 0.6 + tc * 8.1), -uTime * 0.7 + tc * 7.12);

  gl_Position = uWorldViewProj * vec4(pos, 1.0);
}
`;

export const FLOWER_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec4 vColor;
out vec4 fragColor;

void main() {
  fragColor = vColor;
}
`;

/* ══════════════════════════════════════════════
   2. TRAIL ACCUMULATION (splat + decay)
   ══════════════════════════════════════════════ */

export const TRAIL_SPLAT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uPrevTrail;
uniform float     uDecay;
uniform vec2      uMouseUV;       // in 0..1 UV space
uniform float     uSplatRadius;   // in UV units
uniform float     uSplatIntensity;
uniform vec3      uSplatColor;    // linear RGB

void main() {
  vec4 prev = texture(uPrevTrail, vUV);

  // Decay existing trail
  vec4 trail = prev * uDecay;

  // Gaussian splat at cursor
  vec2 diff = vUV - uMouseUV;
  float d2 = dot(diff, diff);
  float sigma2 = uSplatRadius * uSplatRadius + 1e-6;
  float splat = exp(-d2 / sigma2) * uSplatIntensity;

  trail.rgb += uSplatColor * splat;
  trail.a = min(trail.a + splat * 0.5, 1.0);

  fragColor = trail;
}
`;

/* ══════════════════════════════════════════════
   3. PARTICLE PASS (instanced quads)
   ══════════════════════════════════════════════ */

export const PARTICLE_VERT = /* glsl */ `#version 300 es
precision highp float;

// Per-vertex (unit quad)
layout(location = 0) in vec2 aQuad;

// Per-instance
layout(location = 1) in vec2  iPos;    // pixel position
layout(location = 2) in float iSize;   // radius in px
layout(location = 3) in float iHue;    // 0..360
layout(location = 4) in float iAlpha;  // 0..1

uniform vec2 uResolution;

out vec2  vLocal;
out float vHue;
out float vAlpha;

void main() {
  vLocal = aQuad;
  vHue   = iHue;
  vAlpha = iAlpha;

  vec2 worldPos = iPos + aQuad * iSize;
  // Pixel → NDC
  vec2 ndc = (worldPos / uResolution) * 2.0 - 1.0;
  ndc.y = -ndc.y; // flip y

  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

export const PARTICLE_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2  vLocal;
in float vHue;
in float vAlpha;

out vec4 fragColor;

${HSL2RGB_FUNC}

void main() {
  float dist = length(vLocal);
  if (dist > 1.0) discard;

  // Analytic glow: bright core + soft halo
  float core = exp(-dist * dist * 10.0);
  float halo = exp(-dist * dist * 2.5) * 0.35;
  float glow = core + halo;

  vec3 color = hsl2rgb(vHue, 0.7, 0.6);
  // White-hot core
  color = mix(color, vec3(1.0), core * 0.5);

  // Premultiplied alpha for additive blending
  float a = glow * vAlpha;
  fragColor = vec4(color * a, a);
}
`;

/* ══════════════════════════════════════════════
   3b. NOTE PARTICLE PASS (instanced quads — ♪ shape)
   ══════════════════════════════════════════════ */

export const NOTE_PARTICLE_VERT = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec2 aQuad;

layout(location = 1) in vec2  iPos;
layout(location = 2) in float iSize;
layout(location = 3) in float iHue;
layout(location = 4) in float iAlpha;
layout(location = 5) in float iRotation;

uniform vec2 uResolution;

out vec2  vLocal;
out float vHue;
out float vAlpha;

void main() {
  vHue   = iHue;
  vAlpha = iAlpha;

  float c = cos(iRotation);
  float s = sin(iRotation);
  vec2 rotated = vec2(c * aQuad.x - s * aQuad.y,
                      s * aQuad.x + c * aQuad.y);
  vLocal = rotated;

  vec2 worldPos = iPos + rotated * iSize;
  vec2 ndc = (worldPos / uResolution) * 2.0 - 1.0;
  ndc.y = -ndc.y;

  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

export const NOTE_PARTICLE_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2  vLocal;
in float vHue;
in float vAlpha;

out vec4 fragColor;

${HSL2RGB_FUNC}

/* SDF for a musical note: oval head + stem + flag */
float noteSDF(vec2 p) {
  // Note head: filled ellipse, slightly tilted
  float ca = cos(0.3), sa = sin(0.3);
  vec2 rp = vec2(ca * p.x + sa * p.y, -sa * p.x + ca * p.y);
  vec2 headCenter = vec2(-0.05, -0.35);
  vec2 hp = (rp - headCenter) / vec2(0.32, 0.24);
  float head = length(hp) - 1.0;

  // Stem: thin vertical line from head to top
  vec2 stemP = p - vec2(0.2, 0.0);
  float stemD = abs(stemP.x) - 0.045;
  float stemTop = 0.55;
  float stemBot = -0.2;
  float stemClip = max(stemBot - stemP.y, stemP.y - stemTop);
  float stem = max(stemD, stemClip);

  // Flag: wavy curve at top of stem
  float fy = p.y - 0.2;
  float fx = p.x - 0.2;
  float wave = fx - 0.22 * sin(fy * 5.0 + 0.8);
  float flagD = abs(wave) - 0.045;
  float flagClip = max(-fy, fy - 0.35);
  flagClip = max(flagClip, -fx);
  float flag = max(flagD, flagClip);

  return min(head, min(stem, flag));
}

void main() {
  float d = noteSDF(vLocal);

  float shape = 1.0 - smoothstep(-0.06, 0.06, d);
  float glow = exp(-max(d, 0.0) * 4.0) * 0.5;
  float total = shape + glow;

  if (total < 0.005) discard;

  vec3 color = hsl2rgb(vHue, 0.85, 0.7);
  color = mix(color, vec3(1.0), shape * 0.5);

  float a = total * vAlpha;
  fragColor = vec4(color * a, a);
}
`;

/* ══════════════════════════════════════════════
   4. RIPPLE PASS (instanced quads)
   ══════════════════════════════════════════════ */

export const RIPPLE_VERT = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec2 aQuad;

layout(location = 1) in vec2  iPos;
layout(location = 2) in float iRadius;
layout(location = 3) in float iAlpha;
layout(location = 4) in float iHue;

uniform vec2 uResolution;

out vec2  vLocal;
out float vAlpha;
out float vHue;

void main() {
  vLocal = aQuad;
  vAlpha = iAlpha;
  vHue   = iHue;

  vec2 worldPos = iPos + aQuad * iRadius;
  vec2 ndc = (worldPos / uResolution) * 2.0 - 1.0;
  ndc.y = -ndc.y;

  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

export const RIPPLE_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2  vLocal;
in float vAlpha;
in float vHue;

out vec4 fragColor;

${HSL2RGB_FUNC}

void main() {
  float dist = length(vLocal);

  // Ring mask: outer ring with smooth falloff
  float ringW = 0.10;
  float outer = smoothstep(1.0, 1.0 - ringW, dist);
  float inner = smoothstep(1.0 - ringW, 1.0 - ringW * 2.5, dist);
  float ring = outer - inner;

  if (ring < 0.005) discard;

  vec3 color = hsl2rgb(vHue, 0.55, 0.65);
  float a = ring * vAlpha;
  fragColor = vec4(color * a, a);
}
`;

/* ══════════════════════════════════════════════
   5. BRIGHT EXTRACT (for bloom)
   ══════════════════════════════════════════════ */

export const BRIGHT_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uScene;
uniform float     uThreshold;

void main() {
  vec3 color = texture(uScene, vUV).rgb;
  // Luminance-based extraction with soft knee
  float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float contribution = max(lum - uThreshold, 0.0) / max(lum, 0.001);
  fragColor = vec4(color * contribution, 1.0);
}
`;

/* ══════════════════════════════════════════════
   6. SEPARABLE BLUR (Gaussian 9-tap)
   ══════════════════════════════════════════════ */

export const BLUR_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uInput;
uniform vec2      uDirection; // e.g. (1/w, 0) or (0, 1/h)
uniform float     uRadius;

// 5-weight 9-tap kernel (normalised)
const float W[5] = float[5](0.227027, 0.194594, 0.121622, 0.054054, 0.016216);

void main() {
  vec4 result = texture(uInput, vUV) * W[0];
  for (int i = 1; i < 5; i++) {
    vec2 off = uDirection * float(i) * uRadius;
    result += texture(uInput, vUV + off) * W[i];
    result += texture(uInput, vUV - off) * W[i];
  }
  fragColor = result;
}
`;

/* ══════════════════════════════════════════════
   7. COMPOSITE (scene + trail + bloom + tonemap)
   ══════════════════════════════════════════════ */

export const COMPOSITE_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uTrail;
uniform float     uBloomStrength;
uniform float     uTrailMix;
uniform float     uGlowIntensity;

void main() {
  vec3 scene = texture(uScene, vUV).rgb;
  vec3 bloom = texture(uBloom, vUV).rgb;
  vec3 trail = texture(uTrail, vUV).rgb;

  vec3 color = scene
             + trail * uTrailMix * uGlowIntensity
             + bloom * uBloomStrength * uGlowIntensity;

  // Reinhard tone-mapping
  color = color / (1.0 + color);

  // Gamma correction
  color = pow(color, vec3(1.0 / 2.2));

  fragColor = vec4(color, 1.0);
}
`;
