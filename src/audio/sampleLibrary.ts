/**
 * Sample Library — maps each instrument to a sparse set of audio samples.
 *
 * Sources:
 *   - Piano: Salamander Grand Piano (tonejs.github.io/audio/salamander/)
 *   - Orchestral: nbrosowsky/tonejs-instruments (GitHub Pages)
 *
 * Tone.Sampler interpolates (pitch-shifts) between provided samples,
 * so we only need ~8-15 reference notes per instrument.
 */

export interface SampleDef {
  /** Root URL prepended to every file name */
  baseUrl: string;
  /** Map of Tone.js note name → filename (e.g. "A3" → "A3.mp3") */
  urls: Record<string, string>;
  /** Sampler release time in seconds */
  release: number;
}

/* ── CDN roots ── */
const SALAMANDER = 'https://tonejs.github.io/audio/salamander/';
const NB = 'https://nbrosowsky.github.io/tonejs-instruments/samples/';

/* ================================================================
   Individual sample maps (verified against GitHub repos)
   ================================================================ */

const PIANO_SAMPLES: SampleDef = {
  baseUrl: SALAMANDER,
  release: 1,
  urls: {
    'A0': 'A0.mp3', 'C1': 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
    'A1': 'A1.mp3', 'C2': 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
    'A2': 'A2.mp3', 'C3': 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
    'A3': 'A3.mp3', 'C4': 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
    'A4': 'A4.mp3', 'C5': 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
    'A5': 'A5.mp3', 'C6': 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3',
    'A6': 'A6.mp3', 'C7': 'C7.mp3', 'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3',
    'A7': 'A7.mp3', 'C8': 'C8.mp3',
  },
};

const VIOLIN_SAMPLES: SampleDef = {
  baseUrl: NB + 'violin/',
  release: 0.4,
  urls: {
    'A3': 'A3.mp3', 'G3': 'G3.mp3',
    'C4': 'C4.mp3', 'E4': 'E4.mp3', 'G4': 'G4.mp3', 'A4': 'A4.mp3',
    'C5': 'C5.mp3', 'E5': 'E5.mp3', 'G5': 'G5.mp3', 'A5': 'A5.mp3',
    'C6': 'C6.mp3', 'E6': 'E6.mp3', 'G6': 'G6.mp3', 'A6': 'A6.mp3',
    'C7': 'C7.mp3',
  },
};

const CELLO_SAMPLES: SampleDef = {
  baseUrl: NB + 'cello/',
  release: 0.6,
  urls: {
    'C2': 'C2.mp3', 'E2': 'E2.mp3', 'A2': 'A2.mp3',
    'C3': 'C3.mp3', 'E3': 'E3.mp3', 'A3': 'A3.mp3',
    'C4': 'C4.mp3', 'E4': 'E4.mp3', 'A4': 'A4.mp3',
    'C5': 'C5.mp3',
  },
};

const CONTRABASS_SAMPLES: SampleDef = {
  baseUrl: NB + 'contrabass/',
  release: 0.7,
  urls: {
    'G1': 'G1.mp3',
    'C2': 'C2.mp3', 'D2': 'D2.mp3', 'E2': 'E2.mp3', 'A2': 'A2.mp3',
    'E3': 'E3.mp3', 'B3': 'B3.mp3',
  },
};

const FLUTE_SAMPLES: SampleDef = {
  baseUrl: NB + 'flute/',
  release: 0.3,
  urls: {
    'C4': 'C4.mp3', 'E4': 'E4.mp3', 'A4': 'A4.mp3',
    'C5': 'C5.mp3', 'E5': 'E5.mp3', 'A5': 'A5.mp3',
    'C6': 'C6.mp3', 'E6': 'E6.mp3', 'A6': 'A6.mp3',
    'C7': 'C7.mp3',
  },
};

const HARP_SAMPLES: SampleDef = {
  baseUrl: NB + 'harp/',
  release: 1.5,
  urls: {
    'E1': 'E1.mp3', 'G1': 'G1.mp3',
    'A2': 'A2.mp3', 'C3': 'C3.mp3', 'E3': 'E3.mp3', 'G3': 'G3.mp3',
    'A4': 'A4.mp3', 'C5': 'C5.mp3', 'E5': 'E5.mp3', 'G5': 'G5.mp3',
    'A6': 'A6.mp3', 'D7': 'D7.mp3',
  },
};

const BASSOON_SAMPLES: SampleDef = {
  baseUrl: NB + 'bassoon/',
  release: 0.3,
  urls: {
    'A2': 'A2.mp3', 'G2': 'G2.mp3',
    'C3': 'C3.mp3', 'A3': 'A3.mp3', 'G3': 'G3.mp3',
    'C4': 'C4.mp3', 'E4': 'E4.mp3', 'G4': 'G4.mp3', 'A4': 'A4.mp3',
    'C5': 'C5.mp3',
  },
};

const XYLOPHONE_SAMPLES: SampleDef = {
  baseUrl: NB + 'xylophone/',
  release: 1,
  urls: {
    'G4': 'G4.mp3', 'C5': 'C5.mp3', 'G5': 'G5.mp3',
    'C6': 'C6.mp3', 'G6': 'G6.mp3', 'C7': 'C7.mp3',
    'G7': 'G7.mp3', 'C8': 'C8.mp3',
  },
};

/* ================================================================
   Mapping: instrument id → sample definition (null = synth only)
   ================================================================ */

export const INSTRUMENT_SAMPLE_MAP: Record<string, SampleDef | null> = {
  'default':    PIANO_SAMPLES,
  'piano':      PIANO_SAMPLES,
  'harp':       HARP_SAMPLES,
  'violin':     VIOLIN_SAMPLES,
  'erhu':       VIOLIN_SAMPLES,     // closest available string
  'cello':      CELLO_SAMPLES,
  'contrabass':  CONTRABASS_SAMPLES,
  'hang-drum':  XYLOPHONE_SAMPLES,  // closest percussive metallic
  'pan-flute':  FLUTE_SAMPLES,      // closest available wind
  'flute':      FLUTE_SAMPLES,
  'oboe':       BASSOON_SAMPLES,    // closest double-reed
};

/**
 * Returns the sample definition for an instrument, or null if
 * only synth mode is available.
 */
export function getSampleDef(instrumentId: string): SampleDef | null {
  return INSTRUMENT_SAMPLE_MAP[instrumentId] ?? null;
}
