/**
 * Visual Engine — Centralised configuration.
 *
 * Quality tiers, default values, and tier selection based on GPU score.
 * No magic numbers in the render path — everything references this file.
 */

import type { VisualConfig, QualityTier, VisualMode } from './types';

/* ══════════════════════════════════════════════
   Tier thresholds (GPU score → tier)
   ══════════════════════════════════════════════ */

const TIER_THRESHOLDS: { tier: QualityTier; minScore: number }[] = [
  { tier: 'high',     minScore: 70 },
  { tier: 'medium',   minScore: 40 },
  { tier: 'low',      minScore: 10 },
  { tier: 'ultralow', minScore: 0  },
];

export function tierFromScore(score: number): QualityTier {
  for (const { tier, minScore } of TIER_THRESHOLDS) {
    if (score >= minScore) return tier;
  }
  return 'ultralow';
}

/* ══════════════════════════════════════════════
   Per-tier overrides
   ══════════════════════════════════════════════ */

type TierOverrides = Partial<VisualConfig>;

const TIER_CONFIGS: Record<QualityTier, TierOverrides> = {
  high: {
    maxParticles: 700,
    maxRipples: 32,
    trailResolutionScale: 1.0,
    bloomEnabled: true,
    blurIterations: 2,
    blurRadius: 1.2,
    radialBlurEnabled: true,
    radialBlurPasses: 12,
    flowerEnabled: true,
    particleWavesEnabled: false,
  },
  medium: {
    maxParticles: 450,
    maxRipples: 24,
    trailResolutionScale: 0.75,
    bloomEnabled: true,
    blurIterations: 1,
    blurRadius: 1.0,
    radialBlurEnabled: true,
    radialBlurPasses: 8,
    flowerEnabled: true,
    particleWavesEnabled: false,
  },
  low: {
    maxParticles: 250,
    maxRipples: 16,
    trailResolutionScale: 0.5,
    bloomEnabled: false,
    blurIterations: 0,
    blurRadius: 0,
    radialBlurEnabled: false,
    radialBlurPasses: 0,
    flowerEnabled: false,
    particleWavesEnabled: false,
  },
  ultralow: {
    maxParticles: 200,
    maxRipples: 12,
    trailResolutionScale: 0.5,
    bloomEnabled: false,
    blurIterations: 0,
    blurRadius: 0,
    radialBlurEnabled: false,
    radialBlurPasses: 0,
    flowerEnabled: false,
    particleWavesEnabled: false,
    enableGpuEffects: false,
  },
};

/* ══════════════════════════════════════════════
   Mode presets (aesthetic overrides)
   ══════════════════════════════════════════════ */

const MODE_CONFIGS: Record<VisualMode, TierOverrides> = {
  chill: {
    trailDecay: 0.94,
    trailSplatRadiusPx: 18,
    bloomStrength: 0.25,
    bloomThreshold: 0.6,
    particleScale: 0.6,
    colorSaturation: 50,
    colorLightness: 50,
    glowIntensity: 0.4,
    radialBlurStrength: 0.04,
  },
  cinematic: {
    trailDecay: 0.92,
    trailSplatRadiusPx: 22,
    bloomStrength: 0.6,
    bloomThreshold: 0.4,
    particleScale: 1.2,
    colorSaturation: 60,
    colorLightness: 45,
    glowIntensity: 0.7,
    radialBlurStrength: 0.06,
  },
  neon: {
    trailDecay: 0.88,
    trailSplatRadiusPx: 14,
    bloomStrength: 0.5,
    bloomThreshold: 0.35,
    particleScale: 1.0,
    colorSaturation: 100,
    colorLightness: 60,
    glowIntensity: 1.0,
    radialBlurStrength: 0.08,
  },
};

/* ══════════════════════════════════════════════
   Default config (merged base)
   ══════════════════════════════════════════════ */

export const DEFAULT_VISUAL_CONFIG: VisualConfig = {
  mode: 'cinematic',
  enableGpuEffects: true,
  autoDegrade: true,

  fpsTarget: 60,
  fpsDegradeThreshold: 45,
  fpsDegradeWindowSec: 3,

  maxParticles: 500,
  maxRipples: 24,
  particleScale: 1.0,

  trailResolutionScale: 0.75,
  trailDecay: 0.92,
  trailSplatRadiusPx: 20,

  bloomEnabled: true,
  bloomThreshold: 0.45,
  bloomStrength: 0.5,
  blurIterations: 2,
  blurRadius: 1.2,

  radialBlurEnabled: true,
  radialBlurStrength: 0.06,
  radialBlurPasses: 12,
  flowerEnabled: true,
  particleWavesEnabled: false,

  lightWarpEnabled: false,
  constellationsEnabled: false,
  chordGeometryEnabled: false,
  shockwaveEnabled: false,
  lightEchoEnabled: false,
  depthParallaxEnabled: false,
  cadenceLockEnabled: false,
  modulationPortalEnabled: false,
  harmonyOrbitEnabled: false,
  pulseLockEnabled: false,
  symmetryMode: 'off' as const,
  cosmicZoomEnabled: false,

  colorSaturation: 70,
  colorLightness: 55,
  glowIntensity: 0.7,
};

/* ══════════════════════════════════════════════
   Builder: assemble config from tier + mode
   ══════════════════════════════════════════════ */

export function buildConfig(
  tier: QualityTier,
  mode: VisualMode = 'cinematic',
  userOverrides: Partial<VisualConfig> = {},
): VisualConfig {
  return {
    ...DEFAULT_VISUAL_CONFIG,
    ...TIER_CONFIGS[tier],
    ...MODE_CONFIGS[mode],
    mode,
    ...userOverrides,
  };
}

/* ══════════════════════════════════════════════
   Auto-degrade step definitions
   ══════════════════════════════════════════════ */

export const DEGRADE_STEPS: Partial<VisualConfig>[] = [
  // Step 0: disable bloom
  { bloomEnabled: false, blurIterations: 0 },
  // Step 1: reduce particles by 40%
  {}, // handled dynamically — multiplier applied in perfMonitor
  // Step 2: reduce trail resolution
  { trailResolutionScale: 0.5 },
  // Step 3: switch to Canvas2D
  { enableGpuEffects: false },
];

/** Particle reduction factor for degrade step 1 */
export const DEGRADE_PARTICLE_FACTOR = 0.6;

/* ══════════════════════════════════════════════
   Shared rendering constants
   ══════════════════════════════════════════════ */

export const BG_COLOR_R = 0.02;
export const BG_COLOR_G = 0.02;
export const BG_COLOR_B = 0.063;

export const PARTICLE_BASE_COUNT = 10;
export const PARTICLE_VELOCITY_K = 40;
export const PARTICLE_SPEED_MIN = 0.8;
export const PARTICLE_SPEED_MAX = 3.5;
export const PARTICLE_GRAVITY = 0.015;
export const PARTICLE_DRAG = 0.985;
export const PARTICLE_LIFE_MIN = 0.5;
export const PARTICLE_LIFE_MAX = 1.3;

export const RIPPLE_EXPAND_SPEED = 150;   // px/sec
export const RIPPLE_MAX_LIFE = 1.2;       // seconds

export const TRAIL_MAX_POINTS = 150;
export const TRAIL_BASE_WIDTH = 2;
export const TRAIL_VELOCITY_WIDTH_K = 0.04;
