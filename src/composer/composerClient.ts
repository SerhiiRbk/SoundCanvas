/**
 * Composer Client — API contract stub for AI Composer 2.0.
 *
 * This module provides the interface for future AI integration.
 * Currently returns a rule-based fallback using the existing music engine.
 */

import type { ComposerInput, ComposerOutput, NoteEvent } from './composerTypes';

let aiEnabled = false;

/**
 * Enable/disable AI composer layer.
 */
export function setAIEnabled(enabled: boolean): void {
  aiEnabled = enabled;
}

/**
 * Check if AI layer is enabled.
 */
export function isAIEnabled(): boolean {
  return aiEnabled;
}

/**
 * Send composition request to AI backend (or fallback).
 * In MVP, this returns a basic algorithmic arrangement.
 */
export async function compose(input: ComposerInput): Promise<ComposerOutput> {
  if (aiEnabled) {
    // Future: call real AI endpoint
    // return await fetch('/api/compose', { method: 'POST', body: JSON.stringify(input) }).then(r => r.json());
    console.warn('[ComposerClient] AI mode enabled but no backend available. Using fallback.');
  }

  return fallbackCompose(input);
}

/**
 * Rule-based fallback composer.
 */
function fallbackCompose(input: ComposerInput): ComposerOutput {
  const { lead, bpm } = input;
  const beatDuration = 60 / bpm;

  // Simple bass line: root notes on beats
  const bass: NoteEvent[] = [];
  const totalDuration = input.lengthBars * 4 * beatDuration;
  for (let t = 0; t < totalDuration; t += beatDuration) {
    bass.push({
      time: t,
      duration: beatDuration * 0.8,
      pitch: 36, // placeholder root
      velocity: 80,
    });
  }

  // Chord pads: whole notes
  const chords: NoteEvent[] = [];
  for (let t = 0; t < totalDuration; t += beatDuration * 4) {
    chords.push({
      time: t,
      duration: beatDuration * 3.5,
      pitch: 60,
      velocity: 60,
    });
  }

  // Drums: placeholder
  const drums: NoteEvent[] = [];

  return {
    tracks: {
      lead: [...lead],
      chords,
      bass,
      drums,
    },
    mix: {
      reverb: 0.3,
      delay: 0.15,
      sidechain: 0,
    },
  };
}
