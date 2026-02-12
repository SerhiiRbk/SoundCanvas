/**
 * MelodicCorrection — Cost Function J(p)
 *
 * J(p) = w_raw(m)*|p - p_raw|
 *      + w_step(m)*D_step
 *      + w_leap(m)*D_leap
 *      + w_tonic(m)*D_tonic
 *      + w_chord(m)*D_chord
 *      + w_repeat(m)*D_repeat
 */

import {
  WEIGHT_RAW,
  WEIGHT_STEP,
  WEIGHT_LEAP,
  WEIGHT_TONIC,
  WEIGHT_CHORD,
  WEIGHT_REPEAT,
  LEAP_LIMIT,
} from '../config';
import { scaleDegree, isInScale } from './scale';
import type { Scale, Chord, ScaleDegree } from '../composer/composerTypes';

export interface CostContext {
  pRaw: number;
  pPrev: number;
  pPrevPrev: number;
  scale: Scale;
  chord: Chord;
  m: number; // melodic stability ∈ [0,1]
}

/**
 * D_step: penalize large intervals from previous note.
 * D_step = |p - p_prev|
 */
export function dStep(p: number, pPrev: number): number {
  return Math.abs(p - pPrev);
}

/**
 * D_leap: quadratic penalty for intervals exceeding limit L(m).
 * L(m) = 7 + (24 - 7)(1 - m)
 * D_leap = delta > L(m) ? (delta - L(m))² : 0
 */
export function dLeap(p: number, pPrev: number, m: number): number {
  const delta = Math.abs(p - pPrev);
  const limit = LEAP_LIMIT(m);
  return delta <= limit ? 0 : (delta - limit) ** 2;
}

/**
 * D_tonic: penalize non-chord tones by scale degree.
 * deg ∈ {0,2,4} → 0 (tonic, mediant, dominant)
 * deg ∈ {1,3,5} → 1 (supertonic, subdominant, submediant)
 * deg = 6       → 2 (leading tone)
 */
export function dTonic(p: number, scale: Scale): number {
  const deg = scaleDegree(p, scale);
  if (deg === -1) return 3; // not in scale at all
  const stableDegrees: ScaleDegree[] = [0, 2, 4];
  const moderateDegrees: ScaleDegree[] = [1, 3, 5];
  if (stableDegrees.includes(deg as ScaleDegree)) return 0;
  if (moderateDegrees.includes(deg as ScaleDegree)) return 1;
  return 2; // deg === 6
}

/**
 * D_chord: penalize notes not in the current chord.
 * In chord → 0
 * In scale → 1
 * Outside scale → 3
 */
export function dChord(p: number, chord: Chord, scale: Scale): number {
  const pc = ((p % 12) + 12) % 12;
  if (chord.pitchClasses.has(pc as 0)) return 0;
  if (isInScale(p, scale)) return 1;
  return 3;
}

/**
 * D_repeat: penalize repeating the same note.
 * p = p_prev     → 1
 * p = p_prevPrev → 0.5
 * otherwise      → 0
 */
export function dRepeat(p: number, pPrev: number, pPrevPrev: number): number {
  if (p === pPrev) return 1;
  if (p === pPrevPrev) return 0.5;
  return 0;
}

/**
 * Full cost function J(p) for a candidate pitch.
 */
export function costJ(p: number, ctx: CostContext): number {
  const { pRaw, pPrev, pPrevPrev, scale, chord, m } = ctx;

  return (
    WEIGHT_RAW(m) * Math.abs(p - pRaw) +
    WEIGHT_STEP(m) * dStep(p, pPrev) +
    WEIGHT_LEAP(m) * dLeap(p, pPrev, m) +
    WEIGHT_TONIC(m) * dTonic(p, scale) +
    WEIGHT_CHORD(m) * dChord(p, chord, scale) +
    WEIGHT_REPEAT(m) * dRepeat(p, pPrev, pPrevPrev)
  );
}
