/**
 * MelodicCorrection — Softmax probabilistic note selection.
 *
 * P(p) = exp(-J(p)/τ(m)) / Σ exp(-J(q)/τ(m))
 * τ(m) = 0.5 + 2(1 - m)
 *
 * At m → 1: low temperature → deterministic melody.
 * At m → 0: high temperature → more random/gestural.
 */

import { SOFTMAX_TAU } from '../config';
import { costJ, type CostContext } from './costFunction';
import { getScalePitches } from './scale';
import type { Scale, Chord } from '../composer/composerTypes';

export interface MelodicCorrectionInput {
  pRaw: number;
  pPrev: number;
  pPrevPrev: number;
  scale: Scale;
  chord: Chord;
  m: number;
  /** Harmonic gravity chaos level (0..1) */
  chaosLevel?: number;
}

export interface MelodicCorrectionResult {
  selectedPitch: number;
  cost: number;
  probabilities: Map<number, number>;
}

/**
 * Numerically stable softmax over candidate pitches.
 * Returns a map of pitch → probability.
 */
function softmaxSelect(
  candidates: number[],
  ctx: CostContext
): Map<number, number> {
  const tau = SOFTMAX_TAU(ctx.m);
  const costs = candidates.map((p) => costJ(p, ctx));

  // Subtract max for numerical stability
  const minCost = Math.min(...costs);
  const exps = costs.map((c) => Math.exp(-(c - minCost) / tau));
  const sumExp = exps.reduce((a, b) => a + b, 0);

  const probs = new Map<number, number>();
  for (let i = 0; i < candidates.length; i++) {
    probs.set(candidates[i], exps[i] / sumExp);
  }
  return probs;
}

/**
 * Sample from a probability distribution.
 */
function sampleFromDistribution(probs: Map<number, number>): number {
  const r = Math.random();
  let cumulative = 0;
  for (const [pitch, prob] of probs) {
    cumulative += prob;
    if (r <= cumulative) return pitch;
  }
  // Fallback: return last
  return Array.from(probs.keys()).pop()!;
}

/**
 * Main melodic correction: choose the best pitch given gesture input.
 */
export function melodicCorrection(
  input: MelodicCorrectionInput
): MelodicCorrectionResult {
  const { pRaw, pPrev, pPrevPrev, scale, chord, m, chaosLevel } = input;
  const candidates = getScalePitches(scale);

  if (candidates.length === 0) {
    return { selectedPitch: pRaw, cost: 0, probabilities: new Map() };
  }

  const ctx: CostContext = { pRaw, pPrev, pPrevPrev, scale, chord, m, chaosLevel };
  const probabilities = softmaxSelect(candidates, ctx);
  const selectedPitch = sampleFromDistribution(probabilities);
  const cost = costJ(selectedPitch, ctx);

  return { selectedPitch, cost, probabilities };
}

/**
 * Deterministic version: always pick argmin(J(p)).
 * Used when m is very close to 1.
 */
export function melodicCorrectionDeterministic(
  input: MelodicCorrectionInput
): MelodicCorrectionResult {
  const { pRaw, pPrev, pPrevPrev, scale, chord, m, chaosLevel } = input;
  const candidates = getScalePitches(scale);

  if (candidates.length === 0) {
    return { selectedPitch: pRaw, cost: 0, probabilities: new Map() };
  }

  const ctx: CostContext = { pRaw, pPrev, pPrevPrev, scale, chord, m, chaosLevel };

  let bestPitch = candidates[0];
  let bestCost = costJ(candidates[0], ctx);

  for (let i = 1; i < candidates.length; i++) {
    const c = costJ(candidates[i], ctx);
    if (c < bestCost) {
      bestCost = c;
      bestPitch = candidates[i];
    }
  }

  return {
    selectedPitch: bestPitch,
    cost: bestCost,
    probabilities: new Map([[bestPitch, 1]]),
  };
}
