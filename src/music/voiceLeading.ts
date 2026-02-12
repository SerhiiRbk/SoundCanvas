/**
 * Voice Leading Solver
 *
 * Minimizes: J_vl = Σ|Δ_voice| + 10 * crossings
 *
 * Algorithm:
 * 1. Generate possible inversions of the new chord
 * 2. Check voice ranges
 * 3. Compute J_vl
 * 4. Select minimum
 *
 * Melody is treated as the top voice.
 */

import type { Chord, PitchClass } from '../composer/composerTypes';

export interface VoiceState {
  pitches: number[]; // sorted low to high, last = melody
}

export interface VoiceLeadingResult {
  nextVoices: VoiceState;
  cost: number;
}

// ─── Voice Ranges ───
const BASS_MIN = 36;   // C2
const BASS_MAX = 60;   // C4
const TENOR_MIN = 48;  // C3
const TENOR_MAX = 67;  // G4
const ALTO_MIN = 55;   // G3
const ALTO_MAX = 74;   // D5
const SOPRANO_MIN = 60; // C4
const SOPRANO_MAX = 84; // C6

const VOICE_RANGES = [
  { min: BASS_MIN, max: BASS_MAX },
  { min: TENOR_MIN, max: TENOR_MAX },
  { min: ALTO_MIN, max: ALTO_MAX },
  { min: SOPRANO_MIN, max: SOPRANO_MAX },
];

/**
 * Generate all voicings of a chord within voice ranges.
 * Each pitch class is assigned to a specific octave within its voice range.
 */
function generateVoicings(chord: Chord, numVoices: number = 4): number[][] {
  const pcs = Array.from(chord.pitchClasses);

  // For 3-note chords with 4 voices, double the root
  while (pcs.length < numVoices) {
    pcs.push(chord.root);
  }

  const voicings: number[][] = [];

  // Generate candidates for each voice
  const voiceCandidates: number[][] = [];
  for (let v = 0; v < numVoices; v++) {
    const range = VOICE_RANGES[v];
    const candidates: number[] = [];
    for (const pc of pcs) {
      for (let oct = 0; oct <= 8; oct++) {
        const midi = pc + oct * 12;
        if (midi >= range.min && midi <= range.max) {
          candidates.push(midi);
        }
      }
    }
    voiceCandidates.push([...new Set(candidates)].sort((a, b) => a - b));
  }

  // Generate voicings using a limited search (avoid combinatorial explosion)
  // Take up to 3 candidates per voice
  const limited = voiceCandidates.map((c) => {
    if (c.length <= 3) return c;
    const mid = Math.floor(c.length / 2);
    return [c[Math.max(0, mid - 1)], c[mid], c[Math.min(c.length - 1, mid + 1)]];
  });

  // Cartesian product (limited)
  function cartesian(arrays: number[][], idx: number, current: number[]): void {
    if (idx === arrays.length) {
      // Verify all chord pitch classes are present
      const presentPCs = new Set(current.map((p) => ((p % 12) as PitchClass)));
      const allPresent = Array.from(chord.pitchClasses).every((pc) => presentPCs.has(pc));
      if (allPresent && voicings.length < 50) {
        voicings.push([...current]);
      }
      return;
    }
    for (const val of arrays[idx]) {
      current.push(val);
      cartesian(arrays, idx + 1, current);
      current.pop();
    }
  }

  cartesian(limited, 0, []);
  return voicings;
}

/**
 * Count voice crossings between two voicings.
 */
function countCrossings(prev: number[], next: number[]): number {
  let crossings = 0;
  for (let i = 0; i < prev.length; i++) {
    for (let j = i + 1; j < prev.length; j++) {
      // If voice i was below voice j but is now above (or vice versa)
      if ((prev[i] < prev[j] && next[i] > next[j]) ||
          (prev[i] > prev[j] && next[i] < next[j])) {
        crossings++;
      }
    }
  }
  return crossings;
}

/**
 * Compute voice leading cost.
 * J_vl = Σ|Δ_voice| + 10 * crossings
 */
function voiceLeadingCost(prev: number[], next: number[]): number {
  let totalMotion = 0;
  for (let i = 0; i < prev.length; i++) {
    totalMotion += Math.abs(next[i] - prev[i]);
  }
  const crossings = countCrossings(prev, next);
  return totalMotion + 10 * crossings;
}

/**
 * Solve voice leading: find the best voicing of nextChord
 * given the current voice state. Melody (top voice) can be constrained.
 */
export function solveVoiceLeading(
  currentVoices: VoiceState,
  nextChord: Chord,
  melodyPitch?: number
): VoiceLeadingResult {
  const voicings = generateVoicings(nextChord);

  if (voicings.length === 0) {
    // Fallback: keep current voicing
    return { nextVoices: currentVoices, cost: Infinity };
  }

  let bestVoicing = voicings[0];
  let bestCost = Infinity;

  for (const voicing of voicings) {
    // Sort voicing low to high
    const sorted = [...voicing].sort((a, b) => a - b);

    // If melody pitch is specified, replace top voice
    if (melodyPitch !== undefined) {
      sorted[sorted.length - 1] = melodyPitch;
    }

    const cost = voiceLeadingCost(currentVoices.pitches, sorted);
    if (cost < bestCost) {
      bestCost = cost;
      bestVoicing = sorted;
    }
  }

  return {
    nextVoices: { pitches: bestVoicing },
    cost: bestCost,
  };
}

/**
 * Initialize voices for a chord (no previous state).
 */
export function initializeVoices(chord: Chord): VoiceState {
  const pcs = Array.from(chord.pitchClasses);
  while (pcs.length < 4) pcs.push(chord.root);

  const pitches: number[] = [];
  for (let v = 0; v < 4; v++) {
    const range = VOICE_RANGES[v];
    const pc = pcs[v % pcs.length];
    // Find middle of range for this pitch class
    const mid = Math.floor((range.min + range.max) / 2);
    let best = range.min;
    let bestDist = Infinity;
    for (let oct = 0; oct <= 8; oct++) {
      const midi = pc + oct * 12;
      if (midi >= range.min && midi <= range.max) {
        const dist = Math.abs(midi - mid);
        if (dist < bestDist) {
          bestDist = dist;
          best = midi;
        }
      }
    }
    pitches.push(best);
  }

  return { pitches: pitches.sort((a, b) => a - b) };
}
