/**
 * Harmony Engine — Chord progressions and chord management.
 *
 * Supports:
 * - I–V–vi–IV
 * - ii–V–I
 * - minor i–VI–III–VII
 * - Modal progressions
 *
 * Chord changes every 2 bars.
 */

import type { Chord, PitchClass, Scale } from '../composer/composerTypes';

// ─── Chord Building ───

export type ChordQuality = 'major' | 'minor' | 'dim' | 'aug' | 'dom7' | 'maj7' | 'min7';

const CHORD_INTERVALS: Record<ChordQuality, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  dim:   [0, 3, 6],
  aug:   [0, 4, 8],
  dom7:  [0, 4, 7, 10],
  maj7:  [0, 4, 7, 11],
  min7:  [0, 3, 7, 10],
};

/**
 * Build a chord from root pitch class and quality.
 */
export function buildChord(root: PitchClass, quality: ChordQuality, name?: string): Chord {
  const intervals = CHORD_INTERVALS[quality];
  const pitchClasses = new Set<PitchClass>(
    intervals.map((i) => ((root + i) % 12) as PitchClass)
  );
  const qualityLabel = quality === 'major' ? '' : quality === 'minor' ? 'm' : quality;
  return {
    pitchClasses,
    root,
    name: name ?? `${pitchClassToName(root)}${qualityLabel}`,
  };
}

function pitchClassToName(pc: PitchClass): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return names[pc];
}

// ─── Diatonic Chord Qualities for Major/Minor ───

const MAJOR_QUALITIES: ChordQuality[] = [
  'major', 'minor', 'minor', 'major', 'major', 'minor', 'dim',
];

const MINOR_QUALITIES: ChordQuality[] = [
  'minor', 'dim', 'major', 'minor', 'minor', 'major', 'major',
];

/**
 * Build all diatonic chords for a scale.
 */
export function buildDiatonicChords(scale: Scale): Chord[] {
  const pcs = Array.from(scale.pitchClasses)
    .map((c) => ((c - scale.root + 12) % 12))
    .sort((a, b) => a - b)
    .map((interval) => ((scale.root + interval) % 12) as PitchClass);

  const isMinor = scale.name.includes('minor') || scale.name.includes('dorian') || scale.name.includes('phrygian');
  const qualities = isMinor ? MINOR_QUALITIES : MAJOR_QUALITIES;

  return pcs.map((pc, i) => buildChord(pc, qualities[i % qualities.length]));
}

// ─── Progression Patterns (Roman numeral → 0-indexed degree) ───

export interface ProgressionPattern {
  name: string;
  degrees: number[]; // 0-indexed scale degrees
}

export const PROGRESSIONS: Record<string, ProgressionPattern> = {
  'I-V-vi-IV': { name: 'Pop (I–V–vi–IV)', degrees: [0, 4, 5, 3] },
  'ii-V-I': { name: 'Jazz (ii–V–I)', degrees: [1, 4, 0] },
  'i-VI-III-VII': { name: 'Minor (i–VI–III–VII)', degrees: [0, 5, 2, 6] },
  'I-vi-IV-V': { name: 'Classic (I–vi–IV–V)', degrees: [0, 5, 3, 4] },
  'I-IV-V-IV': { name: 'Rock (I–IV–V–IV)', degrees: [0, 3, 4, 3] },
  'vi-IV-I-V': { name: 'Emotional (vi–IV–I–V)', degrees: [5, 3, 0, 4] },
  'I-bVII-IV-I': { name: 'Modal (I–bVII–IV–I)', degrees: [0, 6, 3, 0] },
};

// ─── Harmony Engine Class ───

export class HarmonyEngine {
  private scale: Scale;
  private diatonicChords: Chord[];
  private progression: number[];
  private progressionIndex: number = 0;
  private barCounter: number = 0;
  private barsPerChord: number;

  constructor(scale: Scale, progressionName: string = 'I-V-vi-IV', barsPerChord: number = 2) {
    this.scale = scale;
    this.diatonicChords = buildDiatonicChords(scale);
    this.progression = PROGRESSIONS[progressionName]?.degrees ?? PROGRESSIONS['I-V-vi-IV'].degrees;
    this.barsPerChord = barsPerChord;
  }

  /** Get the current chord. */
  getCurrentChord(): Chord {
    const degree = this.progression[this.progressionIndex % this.progression.length];
    return this.diatonicChords[degree % this.diatonicChords.length];
  }

  /** Get the next chord (for voice leading). */
  getNextChord(): Chord {
    const nextIdx = (this.progressionIndex + 1) % this.progression.length;
    const degree = this.progression[nextIdx];
    return this.diatonicChords[degree % this.diatonicChords.length];
  }

  /** Advance by one bar. Returns true if chord changed. */
  advanceBar(): boolean {
    this.barCounter++;
    if (this.barCounter >= this.barsPerChord) {
      this.barCounter = 0;
      this.progressionIndex = (this.progressionIndex + 1) % this.progression.length;
      return true;
    }
    return false;
  }

  /** Reset to beginning. */
  reset(): void {
    this.progressionIndex = 0;
    this.barCounter = 0;
  }

  /** Update scale and rebuild chords. */
  setScale(scale: Scale): void {
    this.scale = scale;
    this.diatonicChords = buildDiatonicChords(scale);
  }

  /** Set a new progression. */
  setProgression(name: string): void {
    const prog = PROGRESSIONS[name];
    if (prog) {
      this.progression = prog.degrees;
      this.progressionIndex = 0;
      this.barCounter = 0;
    }
  }

  /** Get progression info for display. */
  getProgressionInfo(): { chordName: string; progressionIndex: number; totalChords: number } {
    const chord = this.getCurrentChord();
    return {
      chordName: chord.name,
      progressionIndex: this.progressionIndex,
      totalChords: this.progression.length,
    };
  }

  /** Get all chord names in the current progression. */
  getProgressionChordNames(): string[] {
    return this.progression.map((deg) => {
      const chord = this.diatonicChords[deg % this.diatonicChords.length];
      return chord.name;
    });
  }
}
