/**
 * Scale — pitch class sets, MIDI pitch utilities, scale degree lookup.
 *
 * S ⊂ {0..11}
 * P = { p ∈ MIDI | p_min ≤ p ≤ p_max AND (p mod 12) ∈ S }
 */

import { MIDI_MIN, MIDI_MAX } from '../config';
import type { PitchClass, Scale, ScaleDegree } from '../composer/composerTypes';

// ─── Scale Definitions (intervals from root) ───

const SCALE_INTERVALS: Record<string, number[]> = {
  major:            [0, 2, 4, 5, 7, 9, 11],
  minor:            [0, 2, 3, 5, 7, 8, 10],
  dorian:           [0, 2, 3, 5, 7, 9, 10],
  mixolydian:       [0, 2, 4, 5, 7, 9, 10],
  phrygian:         [0, 1, 3, 5, 7, 8, 10],
  lydian:           [0, 2, 4, 6, 7, 9, 11],
  harmonicMinor:    [0, 2, 3, 5, 7, 8, 11],
  melodicMinor:     [0, 2, 3, 5, 7, 9, 11],
  pentatonicMajor:  [0, 2, 4, 7, 9],
  pentatonicMinor:  [0, 3, 5, 7, 10],
};

const NOTE_NAMES: Record<string, PitchClass> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
  E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8,
  Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

/**
 * Build a Scale from a root note name and mode name.
 */
export function buildScale(rootName: string, modeName: string): Scale {
  const root = NOTE_NAMES[rootName];
  if (root === undefined) throw new Error(`Unknown root: ${rootName}`);
  const intervals = SCALE_INTERVALS[modeName];
  if (!intervals) throw new Error(`Unknown mode: ${modeName}`);

  const pitchClasses = new Set<PitchClass>(
    intervals.map((i) => ((root + i) % 12) as PitchClass)
  );

  return { root, pitchClasses, name: `${rootName} ${modeName}` };
}

/**
 * Get all valid MIDI pitches within the allowed range that belong to the scale.
 */
export function getScalePitches(
  scale: Scale,
  min: number = MIDI_MIN,
  max: number = MIDI_MAX
): number[] {
  const result: number[] = [];
  for (let p = min; p <= max; p++) {
    if (scale.pitchClasses.has((p % 12) as PitchClass)) {
      result.push(p);
    }
  }
  return result;
}

/**
 * Return the scale degree (0..6) for a pitch, or -1 if not in scale.
 * Degree is the index of the pitch class in the sorted scale intervals.
 */
export function scaleDegree(pitch: number, scale: Scale): ScaleDegree | -1 {
  const pc = (pitch % 12) as PitchClass;
  if (!scale.pitchClasses.has(pc)) return -1;

  // Sort pitch classes relative to root
  const sorted = Array.from(scale.pitchClasses)
    .map((c) => ((c - scale.root + 12) % 12))
    .sort((a, b) => a - b);

  const relativePC = ((pc - scale.root + 12) % 12);
  const idx = sorted.indexOf(relativePC);
  return (idx >= 0 && idx <= 6 ? idx : -1) as ScaleDegree | -1;
}

/**
 * Check if a MIDI pitch belongs to a given scale.
 */
export function isInScale(pitch: number, scale: Scale): boolean {
  return scale.pitchClasses.has((pitch % 12) as PitchClass);
}

/**
 * Snap a MIDI pitch to the nearest scale tone.
 */
export function snapToScale(pitch: number, scale: Scale): number {
  if (isInScale(pitch, scale)) return pitch;

  let best = pitch;
  let bestDist = Infinity;
  for (let d = 1; d <= 6; d++) {
    for (const offset of [d, -d]) {
      const candidate = pitch + offset;
      if (candidate >= MIDI_MIN && candidate <= MIDI_MAX && isInScale(candidate, scale)) {
        if (Math.abs(offset) < bestDist) {
          bestDist = Math.abs(offset);
          best = candidate;
        }
      }
    }
  }
  return best;
}

/**
 * MIDI pitch to note name (e.g., 60 → "C4").
 */
export function midiToNoteName(midi: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  return `${names[midi % 12]}${octave}`;
}

/**
 * All available scale mode names.
 */
export function getAvailableModes(): string[] {
  return Object.keys(SCALE_INTERVALS);
}

/**
 * All available root note names.
 */
export function getAvailableRoots(): string[] {
  return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
}
