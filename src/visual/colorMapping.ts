/**
 * Color Mapping — pitch-to-color and audio-reactive color utilities.
 *
 * Hue = (pitch mod 12) * 30°
 * Saturation = 70%
 * Lightness = 60%
 */

import { HUE_PER_PITCH_CLASS, DEFAULT_SATURATION, DEFAULT_LIGHTNESS } from '../config';

/**
 * Convert pitch to HSL hue (0–360).
 */
export function pitchToHue(pitch: number): number {
  return ((pitch % 12) * HUE_PER_PITCH_CLASS) % 360;
}

/**
 * Build an HSL color string from pitch, with optional overrides.
 */
export function pitchToColor(
  pitch: number,
  saturation: number = DEFAULT_SATURATION,
  lightness: number = DEFAULT_LIGHTNESS,
  alpha: number = 1
): string {
  const hue = pitchToHue(pitch);
  if (alpha < 1) {
    return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
  }
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Convert HSL to CSS string.
 */
export function hslToString(
  hue: number,
  saturation: number,
  lightness: number,
  alpha: number = 1
): string {
  if (alpha < 1) {
    return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
  }
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Adjust color based on melodic stability.
 * m → 1: softer, less saturated
 * m → 0: more saturated, higher contrast
 */
export function stabilityAdjustedColor(
  pitch: number,
  m: number,
  baseSaturation: number = DEFAULT_SATURATION,
  baseLightness: number = DEFAULT_LIGHTNESS,
  alpha: number = 1
): string {
  const hue = pitchToHue(pitch);
  // At m=1: lower saturation, mid lightness
  // At m=0: higher saturation, brighter
  const saturation = baseSaturation + (1 - m) * 30;
  const lightness = baseLightness + (1 - m) * 10;
  return hslToString(hue, Math.min(saturation, 100), Math.min(lightness, 90), alpha);
}

/**
 * Get glow color (brighter version) for a pitch.
 */
export function pitchToGlowColor(pitch: number, intensity: number = 1): string {
  const hue = pitchToHue(pitch);
  const lightness = 60 + 30 * intensity;
  return hslToString(hue, 80, Math.min(lightness, 95), 0.6 * intensity);
}

/**
 * HSL to RGB for WebGL shaders.
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}
