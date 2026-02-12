/**
 * Phrase Optimizer — Viterbi / DP over H-step horizon.
 *
 * Minimizes: Σ J(p_{t+k}) + λ * EndPenalty
 * EndPenalty = 0 if final note is tonic or chord tone, else 5.
 *
 * Uses dynamic programming (Viterbi-style) to find optimal phrase.
 */

import { PHRASE_HORIZON, PHRASE_END_PENALTY, PHRASE_LAMBDA } from '../config';
import { costJ, type CostContext } from './costFunction';
import { getScalePitches, scaleDegree } from './scale';
import type { Scale, Chord } from '../composer/composerTypes';

export interface PhraseInput {
  pRawSequence: number[]; // raw pitch targets for each step
  pPrev: number;
  pPrevPrev: number;
  scale: Scale;
  chord: Chord;
  m: number;
  horizon?: number;
}

export interface PhraseResult {
  pitches: number[];
  totalCost: number;
}

/**
 * Check if a pitch is a "good" ending note (tonic or chord tone).
 */
function isGoodEnding(pitch: number, chord: Chord, scale: Scale): boolean {
  const pc = ((pitch % 12) + 12) % 12;
  if (chord.pitchClasses.has(pc as 0)) return true;
  const deg = scaleDegree(pitch, scale);
  return deg === 0; // tonic
}

/**
 * Viterbi DP phrase optimizer.
 * For each step, consider all scale pitches and accumulate minimal cost path.
 */
export function optimizePhrase(input: PhraseInput): PhraseResult {
  const { pRawSequence, pPrev, pPrevPrev, scale, chord, m } = input;
  const H = Math.min(input.horizon ?? PHRASE_HORIZON, pRawSequence.length);
  const candidates = getScalePitches(scale);
  const N = candidates.length;

  if (N === 0 || H === 0) {
    return { pitches: [], totalCost: 0 };
  }

  // dp[step][candidateIdx] = minimal accumulated cost to reach this state
  const dp: number[][] = Array.from({ length: H }, () =>
    new Array(N).fill(Infinity)
  );
  // backtrack pointers
  const back: number[][] = Array.from({ length: H }, () =>
    new Array(N).fill(0)
  );

  // ─── Step 0: initialize ───
  for (let i = 0; i < N; i++) {
    const p = candidates[i];
    const ctx: CostContext = {
      pRaw: pRawSequence[0],
      pPrev,
      pPrevPrev,
      scale,
      chord,
      m,
    };
    dp[0][i] = costJ(p, ctx);
  }

  // ─── Steps 1..H-1: transition ───
  for (let step = 1; step < H; step++) {
    for (let i = 0; i < N; i++) {
      const p = candidates[i];
      let bestPrevCost = Infinity;
      let bestPrevIdx = 0;

      for (let j = 0; j < N; j++) {
        const prevP = candidates[j];
        const prevPrevP = step >= 2
          ? candidates[back[step - 1][j]]
          : (step === 1 ? pPrev : pPrevPrev);

        const ctx: CostContext = {
          pRaw: pRawSequence[step],
          pPrev: prevP,
          pPrevPrev: prevPrevP,
          scale,
          chord,
          m,
        };

        const totalCost = dp[step - 1][j] + costJ(p, ctx);
        if (totalCost < bestPrevCost) {
          bestPrevCost = totalCost;
          bestPrevIdx = j;
        }
      }

      dp[step][i] = bestPrevCost;
      back[step][i] = bestPrevIdx;
    }
  }

  // ─── Add end penalty to final step ───
  let bestFinalIdx = 0;
  let bestFinalCost = Infinity;

  for (let i = 0; i < N; i++) {
    const endPenalty = isGoodEnding(candidates[i], chord, scale)
      ? 0
      : PHRASE_END_PENALTY;
    const total = dp[H - 1][i] + PHRASE_LAMBDA * endPenalty;
    if (total < bestFinalCost) {
      bestFinalCost = total;
      bestFinalIdx = i;
    }
  }

  // ─── Backtrack ───
  const pitchIndices: number[] = new Array(H);
  pitchIndices[H - 1] = bestFinalIdx;
  for (let step = H - 2; step >= 0; step--) {
    pitchIndices[step] = back[step + 1][pitchIndices[step + 1]];
  }

  const pitches = pitchIndices.map((idx) => candidates[idx]);

  return { pitches, totalCost: bestFinalCost };
}
