/**
 * Gesture Symphony 2.0 — Global Configuration
 * All magic numbers are centralized here.
 */

// ─── Time & BPM ───
export const DEFAULT_BPM = 110;
export const MIN_BPM = 100;
export const MAX_BPM = 120;
export const QUANTIZE_DIVISION = 16; // 1/16 note

// ─── MIDI Range ───
export const MIDI_MIN = 48; // C3
export const MIDI_MAX = 84; // C6

// ─── Melodic Stability ───
export const DEFAULT_MELODIC_STABILITY = 0.5;

// ─── Cost Function Weights (functions of m) ───
export const WEIGHT_RAW = (m: number) => 1 - m;
export const WEIGHT_STEP = (m: number) => 0.5 + 2 * m;
export const WEIGHT_LEAP = (m: number) => 0.5 + 3 * m;
export const WEIGHT_TONIC = (m: number) => 0.2 + 1.2 * m;
export const WEIGHT_CHORD = (m: number) => 0.2 + 1.5 * m;
export const WEIGHT_REPEAT = (m: number) => 0.2 + 0.8 * m;

// ─── Softmax Temperature ───
export const SOFTMAX_TAU = (m: number) => 0.5 + 2 * (1 - m);

// ─── Leap Limit ───
export const LEAP_LIMIT = (m: number) => 7 + (24 - 7) * (1 - m);

// ─── Phrase Optimizer ───
export const PHRASE_HORIZON = 8;
export const PHRASE_END_PENALTY = 5;
export const PHRASE_LAMBDA = 1.0;

// ─── Harmony ───
export const CHORD_CHANGE_BARS = 2;

// ─── Melodic Score Thresholds ───
export const MELODIC_SCORE_THRESHOLD = 0.6;

// ─── Visual ───
export const MAX_TRAIL_POINTS = 280;
export const TRAIL_DECAY_TAU_MIN = 0.3;
export const TRAIL_DECAY_TAU_MAX = 0.6;
export const TRAIL_BASE_WIDTH = 2.5;
export const TRAIL_VELOCITY_WIDTH_K = 0.05;

export const MAX_PARTICLES = 500;
export const PARTICLE_BASE_COUNT = 10;
export const PARTICLE_VELOCITY_SCALE = 40;
export const PARTICLE_SPEED_MIN = 0.8;
export const PARTICLE_SPEED_MAX = 3.5;
export const PARTICLE_GRAVITY = 0.015;

export const RIPPLE_SPEED = 150;
export const RIPPLE_DECAY_TAU = 0.5;

export const BACKGROUND_COLOR = '#050510';

// ─── Color Mapping ───
export const HUE_PER_PITCH_CLASS = 30; // degrees
export const DEFAULT_SATURATION = 70;
export const DEFAULT_LIGHTNESS = 60;

// ─── Audio ───
export const FFT_SIZE = 256;
export const SYNTH_MAX_POLYPHONY = 8;

// ─── Visual Mode Presets ───
export interface VisualPreset {
  name: string;
  trailDecayTau: number;
  bloomIntensity: number;
  particleScale: number;
  colorSaturation: number;
  colorLightness: number;
  glowIntensity: number;
}

export const VISUAL_PRESETS: Record<string, VisualPreset> = {
  chill: {
    name: 'Chill',
    trailDecayTau: 0.6,
    bloomIntensity: 0.3,
    particleScale: 0.5,
    colorSaturation: 50,
    colorLightness: 50,
    glowIntensity: 0.4,
  },
  cinematic: {
    name: 'Cinematic',
    trailDecayTau: 0.5,
    bloomIntensity: 0.8,
    particleScale: 1.5,
    colorSaturation: 60,
    colorLightness: 40,
    glowIntensity: 0.7,
  },
  neon: {
    name: 'Neon',
    trailDecayTau: 0.3,
    bloomIntensity: 0.6,
    particleScale: 1.0,
    colorSaturation: 100,
    colorLightness: 60,
    glowIntensity: 1.0,
  },
};

// ─── Export Mode ───
export const REEL_ASPECT_RATIO = 9 / 16;
