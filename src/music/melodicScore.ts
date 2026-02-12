/**
 * Melodic Score Validator
 *
 * Score = 0.3 * scaleConformity
 *       + 0.3 * chordToneOnStrongBeats
 *       − 0.2 * averageLeap
 *       − 0.2 * dissonanceRate
 *
 * If Score < 0.6 → apply auto-correction.
 */

import { MELODIC_SCORE_THRESHOLD, QUANTIZE_DIVISION } from '../config';
import { isInScale, snapToScale } from './scale';
import type { NoteEvent, Scale, Chord } from '../composer/composerTypes';

export interface MelodicScoreResult {
  score: number;
  scaleConformity: number;
  chordToneOnStrongBeats: number;
  averageLeap: number;
  dissonanceRate: number;
  needsCorrection: boolean;
}

/**
 * Compute the melodic quality score for a sequence of notes.
 */
export function computeMelodicScore(
  notes: NoteEvent[],
  scale: Scale,
  chord: Chord,
  bpm: number
): MelodicScoreResult {
  if (notes.length === 0) {
    return {
      score: 1,
      scaleConformity: 1,
      chordToneOnStrongBeats: 1,
      averageLeap: 0,
      dissonanceRate: 0,
      needsCorrection: false,
    };
  }

  // ─── Scale Conformity ───
  const inScaleCount = notes.filter((n) => isInScale(n.pitch, scale)).length;
  const scaleConformity = inScaleCount / notes.length;

  // ─── Chord Tone on Strong Beats ───
  const beatDuration = 60 / bpm; // seconds per beat
  const sixteenthDuration = beatDuration / (QUANTIZE_DIVISION / 4);
  let strongBeatCount = 0;
  let chordToneOnStrongCount = 0;

  for (const note of notes) {
    // Strong beats: beats 1 and 3 (0-indexed: 0 and 8 in 16th notes)
    const posInBar = (note.time / sixteenthDuration) % QUANTIZE_DIVISION;
    const isStrongBeat = posInBar < 0.5 || Math.abs(posInBar - 8) < 0.5;
    if (isStrongBeat) {
      strongBeatCount++;
      const pc = ((note.pitch % 12) + 12) % 12;
      if (chord.pitchClasses.has(pc as 0)) {
        chordToneOnStrongCount++;
      }
    }
  }
  const chordToneOnStrongBeats = strongBeatCount > 0
    ? chordToneOnStrongCount / strongBeatCount
    : 1;

  // ─── Average Leap ───
  let totalLeap = 0;
  for (let i = 1; i < notes.length; i++) {
    totalLeap += Math.abs(notes[i].pitch - notes[i - 1].pitch);
  }
  const avgLeap = notes.length > 1 ? totalLeap / (notes.length - 1) : 0;
  // Normalize: 0 semitones = 1, 12+ semitones = 0
  const averageLeap = Math.min(avgLeap / 12, 1);

  // ─── Dissonance Rate ───
  let dissonantCount = 0;
  for (let i = 1; i < notes.length; i++) {
    const interval = Math.abs(notes[i].pitch - notes[i - 1].pitch) % 12;
    // Dissonant intervals: minor 2nd (1), tritone (6), major 7th (11)
    if (interval === 1 || interval === 6 || interval === 11) {
      dissonantCount++;
    }
  }
  const dissonanceRate = notes.length > 1 ? dissonantCount / (notes.length - 1) : 0;

  // ─── Final Score ───
  const score =
    0.3 * scaleConformity +
    0.3 * chordToneOnStrongBeats -
    0.2 * averageLeap -
    0.2 * dissonanceRate;

  return {
    score,
    scaleConformity,
    chordToneOnStrongBeats,
    averageLeap,
    dissonanceRate,
    needsCorrection: score < MELODIC_SCORE_THRESHOLD,
  };
}

/**
 * Auto-correct a melody to improve score.
 * Snaps out-of-scale notes and reduces large leaps.
 */
export function autoCorrectMelody(
  notes: NoteEvent[],
  scale: Scale
): NoteEvent[] {
  return notes.map((note, i) => {
    let pitch = note.pitch;

    // Snap to scale if not in scale
    if (!isInScale(pitch, scale)) {
      pitch = snapToScale(pitch, scale);
    }

    // Reduce large leaps (>12 semitones) by octave adjustment
    if (i > 0) {
      const prev = notes[i - 1].pitch;
      while (Math.abs(pitch - prev) > 12 && pitch > prev) {
        pitch -= 12;
      }
      while (Math.abs(pitch - prev) > 12 && pitch < prev) {
        pitch += 12;
      }
    }

    return { ...note, pitch };
  });
}
