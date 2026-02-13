/**
 * Synth Engine — Tone.js instrument emulation via FM/AM synthesis,
 * vibrato, chorus, breath noise, and per-instrument FX tuning.
 *
 * Each instrument uses a different voice type (Synth / FMSynth / AMSynth)
 * plus dedicated effect nodes to shape its unique timbre.
 */

import * as Tone from 'tone';
import { FFT_SIZE, SYNTH_MAX_POLYPHONY } from '../config';
import { midiToNoteName } from '../music/scale';
import { getSampleDef } from './sampleLibrary';
import type { AudioFrameData } from '../composer/composerTypes';

/* ================================================================
   Instrument Preset Definitions
   ================================================================ */

export type VoiceKind = 'Synth' | 'FMSynth' | 'AMSynth';

export interface InstrumentPreset {
  id: string;
  name: string;
  voiceKind: VoiceKind;

  /* ── Voice params (common) ── */
  oscillatorType: string;
  envelope: { attack: number; decay: number; sustain: number; release: number };
  volume: number;

  /* ── FMSynth-specific ── */
  harmonicity?: number;
  modulationIndex?: number;
  modulationType?: string;
  modulationEnvelope?: { attack: number; decay: number; sustain: number; release: number };

  /* ── Shared FX ── */
  filterFreq: number;
  filterQ: number;
  reverbWet: number;
  delayWet: number;
  delayFeedback: number;

  /* ── Per-instrument FX (0 = off) ── */
  vibratoRate: number;
  vibratoDepth: number;
  chorusWet: number;
  chorusFreq: number;
  chorusDepth: number;
  chorusDelayTime: number;

  /* ── Breath noise for winds (0 = off) ── */
  breathiness: number;
  breathFilterFreq: number;
}

/* ----------------------------------------------------------------
   Presets
   ---------------------------------------------------------------- */

export const INSTRUMENT_PRESETS: InstrumentPreset[] = [
  /* ── Default Synth — warm, soft pad-like tone ── */
  {
    id: 'default',
    name: 'Default Synth',
    voiceKind: 'Synth',
    oscillatorType: 'triangle8',
    envelope: { attack: 0.08, decay: 0.5, sustain: 0.35, release: 1.4 },
    volume: -4,
    filterFreq: 3500, filterQ: 0.7,
    reverbWet: 0.45, delayWet: 0.2, delayFeedback: 0.25,
    vibratoRate: 0, vibratoDepth: 0,
    chorusWet: 0, chorusFreq: 0, chorusDepth: 0, chorusDelayTime: 3.5,
    breathiness: 0, breathFilterFreq: 2000,
  },

  /* ── Harp — plucked, gentle attack, resonant reverb ── */
  {
    id: 'harp',
    name: 'Harp',
    voiceKind: 'Synth',
    oscillatorType: 'triangle',
    envelope: { attack: 0.01, decay: 1.2, sustain: 0.0, release: 2.2 },
    volume: -3,
    filterFreq: 4000, filterQ: 0.5,
    reverbWet: 0.55, delayWet: 0.12, delayFeedback: 0.2,
    vibratoRate: 0, vibratoDepth: 0,
    chorusWet: 0, chorusFreq: 0, chorusDepth: 0, chorusDelayTime: 3.5,
    breathiness: 0, breathFilterFreq: 2000,
  },

  /* ── Violin — FM bowed string, vibrato + chorus ── */
  {
    id: 'violin',
    name: 'Violin',
    voiceKind: 'FMSynth',
    oscillatorType: 'sine',
    envelope: { attack: 0.14, decay: 0.2, sustain: 0.82, release: 0.4 },
    volume: -3,
    harmonicity: 2,
    modulationIndex: 1.8,
    modulationType: 'sine',
    modulationEnvelope: { attack: 0.25, decay: 0.3, sustain: 0.9, release: 0.5 },
    filterFreq: 6000, filterQ: 1.5,
    reverbWet: 0.25, delayWet: 0.06, delayFeedback: 0.15,
    vibratoRate: 5.2, vibratoDepth: 0.06,
    chorusWet: 0.35, chorusFreq: 3.5, chorusDepth: 0.6, chorusDelayTime: 3.5,
    breathiness: 0, breathFilterFreq: 2000,
  },

  /* ── Erhu — nasal FM string, wide ornamental vibrato ── */
  {
    id: 'erhu',
    name: 'Erhu',
    voiceKind: 'FMSynth',
    oscillatorType: 'sine',
    envelope: { attack: 0.18, decay: 0.15, sustain: 0.88, release: 0.5 },
    volume: -2,
    harmonicity: 3,
    modulationIndex: 3.5,
    modulationType: 'sine',
    modulationEnvelope: { attack: 0.3, decay: 0.25, sustain: 0.85, release: 0.6 },
    filterFreq: 3500, filterQ: 3.5,
    reverbWet: 0.3, delayWet: 0.1, delayFeedback: 0.2,
    vibratoRate: 5.8, vibratoDepth: 0.12,
    chorusWet: 0, chorusFreq: 0, chorusDepth: 0, chorusDelayTime: 3.5,
    breathiness: 0, breathFilterFreq: 2000,
  },

  /* ── Piano — FM hammer strike with decaying modulation, warm ── */
  {
    id: 'piano',
    name: 'Piano',
    voiceKind: 'FMSynth',
    oscillatorType: 'sine',
    envelope: { attack: 0.008, decay: 1.8, sustain: 0.06, release: 1.6 },
    volume: -3,
    harmonicity: 2,
    modulationIndex: 2.5,
    modulationType: 'sine',
    modulationEnvelope: { attack: 0.008, decay: 1.0, sustain: 0.04, release: 0.5 },
    filterFreq: 5000, filterQ: 0.5,
    reverbWet: 0.35, delayWet: 0.1, delayFeedback: 0.18,
    vibratoRate: 0, vibratoDepth: 0,
    chorusWet: 0, chorusFreq: 0, chorusDepth: 0, chorusDelayTime: 3.5,
    breathiness: 0, breathFilterFreq: 2000,
  },

  /* ── Cello — warm FM bowed string, gentle vibrato + chorus ── */
  {
    id: 'cello',
    name: 'Cello',
    voiceKind: 'FMSynth',
    oscillatorType: 'sine',
    envelope: { attack: 0.25, decay: 0.3, sustain: 0.75, release: 0.6 },
    volume: -2,
    harmonicity: 2,
    modulationIndex: 0.9,
    modulationType: 'sine',
    modulationEnvelope: { attack: 0.4, decay: 0.4, sustain: 0.8, release: 0.6 },
    filterFreq: 3200, filterQ: 2,
    reverbWet: 0.3, delayWet: 0.05, delayFeedback: 0.12,
    vibratoRate: 4.5, vibratoDepth: 0.045,
    chorusWet: 0.3, chorusFreq: 2.8, chorusDepth: 0.5, chorusDelayTime: 4,
    breathiness: 0, breathFilterFreq: 2000,
  },

  /* ── Contrabass — deep, dark FM string ── */
  {
    id: 'contrabass',
    name: 'Contrabass',
    voiceKind: 'FMSynth',
    oscillatorType: 'sine',
    envelope: { attack: 0.2, decay: 0.35, sustain: 0.65, release: 0.7 },
    volume: -1,
    harmonicity: 1.5,
    modulationIndex: 0.5,
    modulationType: 'sine',
    modulationEnvelope: { attack: 0.3, decay: 0.4, sustain: 0.7, release: 0.5 },
    filterFreq: 1500, filterQ: 2.5,
    reverbWet: 0.22, delayWet: 0.03, delayFeedback: 0.08,
    vibratoRate: 3.2, vibratoDepth: 0.02,
    chorusWet: 0, chorusFreq: 0, chorusDepth: 0, chorusDelayTime: 3.5,
    breathiness: 0, breathFilterFreq: 2000,
  },

  /* ── Hang Drum — metallic FM bell, non-integer harmonicity ── */
  {
    id: 'hang-drum',
    name: 'Hang Drum',
    voiceKind: 'FMSynth',
    oscillatorType: 'sine',
    envelope: { attack: 0.001, decay: 2.2, sustain: 0.0, release: 2.8 },
    volume: 0,
    harmonicity: 1.4,
    modulationIndex: 2.8,
    modulationType: 'sine',
    modulationEnvelope: { attack: 0.001, decay: 1.8, sustain: 0.0, release: 1.2 },
    filterFreq: 5000, filterQ: 1,
    reverbWet: 0.55, delayWet: 0.18, delayFeedback: 0.3,
    vibratoRate: 0, vibratoDepth: 0,
    chorusWet: 0, chorusFreq: 0, chorusDepth: 0, chorusDelayTime: 3.5,
    breathiness: 0, breathFilterFreq: 2000,
  },

  /* ── Pan Flute — AM hollow tube, breath noise, lots of reverb ── */
  {
    id: 'pan-flute',
    name: 'Pan Flute',
    voiceKind: 'AMSynth',
    oscillatorType: 'sine',
    envelope: { attack: 0.1, decay: 0.2, sustain: 0.55, release: 0.5 },
    volume: -1,
    harmonicity: 2,
    modulationType: 'square',
    modulationEnvelope: { attack: 0.15, decay: 0.3, sustain: 0.4, release: 0.5 },
    filterFreq: 3200, filterQ: 1,
    reverbWet: 0.45, delayWet: 0.16, delayFeedback: 0.25,
    vibratoRate: 4.2, vibratoDepth: 0.04,
    chorusWet: 0, chorusFreq: 0, chorusDepth: 0, chorusDelayTime: 3.5,
    breathiness: 0.6, breathFilterFreq: 2200,
  },

  /* ── Flute — AM bright tube, slight breath, quick attack ── */
  {
    id: 'flute',
    name: 'Flute',
    voiceKind: 'AMSynth',
    oscillatorType: 'sine',
    envelope: { attack: 0.05, decay: 0.15, sustain: 0.7, release: 0.3 },
    volume: 0,
    harmonicity: 3,
    modulationType: 'sine',
    modulationEnvelope: { attack: 0.08, decay: 0.2, sustain: 0.6, release: 0.3 },
    filterFreq: 8000, filterQ: 0.5,
    reverbWet: 0.3, delayWet: 0.1, delayFeedback: 0.15,
    vibratoRate: 5.0, vibratoDepth: 0.05,
    chorusWet: 0, chorusFreq: 0, chorusDepth: 0, chorusDelayTime: 3.5,
    breathiness: 0.35, breathFilterFreq: 4500,
  },

  /* ── Indian Harmonium — reedy bellows organ, droning, warm chorus ── */
  {
    id: 'harmonium',
    name: 'Indian Harmonium',
    voiceKind: 'FMSynth',
    oscillatorType: 'sine',
    envelope: { attack: 0.18, decay: 0.25, sustain: 0.85, release: 0.6 },
    volume: -3,
    harmonicity: 1,
    modulationIndex: 2.2,
    modulationType: 'square',
    modulationEnvelope: { attack: 0.2, decay: 0.3, sustain: 0.8, release: 0.5 },
    filterFreq: 2800, filterQ: 3.0,
    reverbWet: 0.35, delayWet: 0.08, delayFeedback: 0.12,
    vibratoRate: 3.8, vibratoDepth: 0.015,
    chorusWet: 0.55, chorusFreq: 2.2, chorusDepth: 0.7, chorusDelayTime: 4.5,
    breathiness: 0.45, breathFilterFreq: 1600,
  },

  /* ── Oboe — heavily modulated FM reed, nasal narrow filter ── */
  {
    id: 'oboe',
    name: 'Oboe',
    voiceKind: 'FMSynth',
    oscillatorType: 'sine',
    envelope: { attack: 0.04, decay: 0.2, sustain: 0.78, release: 0.3 },
    volume: -4,
    harmonicity: 1,
    modulationIndex: 5,
    modulationType: 'sine',
    modulationEnvelope: { attack: 0.06, decay: 0.25, sustain: 0.75, release: 0.3 },
    filterFreq: 3000, filterQ: 5,
    reverbWet: 0.2, delayWet: 0.06, delayFeedback: 0.12,
    vibratoRate: 5.0, vibratoDepth: 0.03,
    chorusWet: 0, chorusFreq: 0, chorusDepth: 0, chorusDelayTime: 3.5,
    breathiness: 0.2, breathFilterFreq: 1800,
  },
];

/* ================================================================
   Ensemble — types & note-calculation helpers
   ================================================================ */

export type EnsembleRole = 'harmony' | 'arpeggio' | 'counter';

export const ENSEMBLE_ROLES: EnsembleRole[] = ['harmony', 'arpeggio', 'counter'];
export const ENSEMBLE_ROLE_LABELS: Record<EnsembleRole, string> = {
  harmony: 'Harmony', arpeggio: 'Arpeggio', counter: 'Counter',
};
/** dB offsets relative to lead for a balanced mix */
const ROLE_VOLUME: Record<EnsembleRole, number> = {
  harmony: -4, arpeggio: -7, counter: -5,
};
/** velocity multipliers */
const ROLE_VEL: Record<EnsembleRole, number> = {
  harmony: 0.80, arpeggio: 0.60, counter: 0.70,
};
/** duration multipliers */
const ROLE_DUR: Record<EnsembleRole, number> = {
  harmony: 1.0, arpeggio: 0.55, counter: 0.9,
};

interface MusicalCtx {
  chordPCs: Set<number>;
  scalePCs: Set<number>;
  root: number;
}

interface EnsembleVoiceInst {
  instrumentId: string;
  role: EnsembleRole;
  preset: InstrumentPreset;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  synth: Tone.PolySynth<any>;
  vibrato: Tone.Vibrato | null;
  gain: Tone.Gain;
}

/* ── Pure helpers for voice-leading ── */

function nearestChordToneAbove(pitch: number, chordPCs: Set<number>, minSemi: number, maxSemi: number): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (let off = minSemi; off <= maxSemi; off++) {
    if (chordPCs.has((pitch + off) % 12)) {
      const d = Math.abs(off - 4); // prefer ~major 3rd distance
      if (d < bestD) { bestD = d; best = pitch + off; }
    }
  }
  return best;
}

function snapToScale(pitch: number, scalePCs: Set<number>): number {
  const pc = ((pitch % 12) + 12) % 12;
  if (scalePCs.has(pc)) return pitch;
  for (let d = 1; d <= 2; d++) {
    if (scalePCs.has((pc + d) % 12)) return pitch + d;
    if (scalePCs.has(((pc - d) + 12) % 12)) return pitch - d;
  }
  return pitch;
}

function calcHarmony(lead: number, ctx: MusicalCtx): number {
  // Prefer chord tone 3-7 semitones above lead (thirds / fifths)
  const ct = nearestChordToneAbove(lead, ctx.chordPCs, 3, 7);
  if (ct !== null) return snapToScale(ct, ctx.scalePCs);
  // Fallback: scale tone a 4th above
  return snapToScale(lead + 4, ctx.scalePCs);
}

function calcArpeggio(lead: number, ctx: MusicalCtx, idx: number): number {
  const tones = Array.from(ctx.chordPCs).sort((a, b) => a - b);
  if (tones.length === 0) return lead;
  const pc = tones[idx % tones.length];
  const oct = Math.floor(lead / 12);
  let p = pc + oct * 12;
  if (p > lead + 5) p -= 12;
  if (p < lead - 14) p += 12;
  return p;
}

function calcCounter(lead: number, prevLead: number, ctx: MusicalCtx): number {
  // Contrary motion: move opposite direction toward nearest chord tone
  const dir = lead >= prevLead ? -1 : 1;
  const step = Math.max(2, Math.abs(lead - prevLead));
  const target = lead + dir * step;
  // Snap to nearest chord tone
  let best = target;
  let bestD = Infinity;
  for (const pc of ctx.chordPCs) {
    const oct = Math.floor(target / 12);
    for (const o of [oct - 1, oct, oct + 1]) {
      const c = pc + o * 12;
      const d = Math.abs(c - target);
      if (d < bestD) { bestD = d; best = c; }
    }
  }
  return snapToScale(best, ctx.scalePCs);
}

/* ================================================================
   SynthEngine
   ================================================================ */

export interface SamplerState {
  enabled: boolean;
  loading: boolean;
  ready: boolean;
  unavailable: boolean;
}

export class SynthEngine {
  /* ── Lead voice (rebuilt per instrument) ── */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private leadSynth: Tone.PolySynth<any> | null = null;

  /* ── Sampler (real instrument samples) ── */
  private sampler: Tone.Sampler | null = null;
  private _samplerEnabled = false;
  private _samplerLoading = false;
  private _samplerReady = false;
  private _samplerUnavailable = false;

  /* ── Ensemble voices ── */
  private ensembleVoices: EnsembleVoiceInst[] = [];
  private ensembleBus: Tone.Gain | null = null;
  private ensembleReverb: Tone.Reverb | null = null;
  private arpeggioIdx = 0;
  private prevLeadPitch = 60;
  private musicalCtx: MusicalCtx = {
    chordPCs: new Set([0, 4, 7]),
    scalePCs: new Set([0, 2, 4, 5, 7, 9, 11]),
    root: 0,
  };

  /* ── Per-instrument FX (disposed on switch) ── */
  private vibrato: Tone.Vibrato | null = null;
  private chorus: Tone.Chorus | null = null;

  /* ── Meditation percussion ── */
  private bowlSynth: Tone.FMSynth | null = null;
  private membraneSynth: Tone.MembraneSynth | null = null;
  private brushSynth: Tone.NoiseSynth | null = null;
  private brushFilter2: Tone.Filter | null = null;

  /* ── Breath noise layer for wind instruments ── */
  private breathSynth: Tone.NoiseSynth | null = null;
  private breathFilter: Tone.Filter | null = null;

  /* ── Shared (persistent) nodes ── */
  private padSynth: Tone.PolySynth | null = null;
  private bassSynth: Tone.MonoSynth | null = null;
  private filter: Tone.Filter | null = null;
  private reverb: Tone.Reverb | null = null;
  private delay: Tone.FeedbackDelay | null = null;
  private panner: Tone.Panner | null = null;
  private masterGain: Tone.Gain | null = null;
  private analyser: Tone.Analyser | null = null;
  private fft: Tone.FFT | null = null;

  /* ── Harmonic bloom ── */
  private bloomSynth: Tone.PolySynth | null = null;
  private shimmerDelay: Tone.FeedbackDelay | null = null;
  private harmonicBloomEnabled = true;

  /* ── Chord swell pad ── */
  private swellPad: Tone.PolySynth | null = null;
  private swellFilter: Tone.Filter | null = null;
  private swellGain: Tone.Gain | null = null;
  private swellActive = false;

  /* ── Ghost arpeggiator ── */
  private ghostSynth: Tone.PolySynth | null = null;
  private ghostGain: Tone.Gain | null = null;
  private ghostActive = false;
  private ghostIntervalId: ReturnType<typeof setInterval> | null = null;

  /* ── Counter-melody shadow ── */
  private shadowSynth: Tone.PolySynth | null = null;
  private shadowGain: Tone.Gain | null = null;
  private shadowActive = false;
  private shadowBuffer: { pitch: number; velocity: number; duration: number; time: number }[] = [];

  /* ── Recording destination (connected alongside dest) ── */
  private recordingDest: MediaStreamAudioDestinationNode | null = null;

  private initialized = false;
  private currentPreset: InstrumentPreset = INSTRUMENT_PRESETS[0];

  /* ────────────────────────────────────────────
     Initialization
     ──────────────────────────────────────────── */

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await Tone.start();

    // Shared FX chain (persistent across instrument switches)
    this.masterGain = new Tone.Gain(0.4);
    this.panner = new Tone.Panner(0);
    this.reverb = new Tone.Reverb({ decay: 4.5, wet: 0.45 });
    this.delay = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.25, wet: 0.2 });
    this.filter = new Tone.Filter({ frequency: 3500, type: 'lowpass', rolloff: -12 });
    this.analyser = new Tone.Analyser('waveform', FFT_SIZE);
    this.fft = new Tone.FFT(FFT_SIZE);

    // Shared chain: filter → delay → reverb → panner → masterGain → dest
    this.filter.connect(this.delay);
    this.delay.connect(this.reverb);
    this.reverb.connect(this.panner);
    this.panner.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.masterGain.connect(this.fft);
    this.masterGain.toDestination();

    // Harmonic bloom synth (octave + fifth overtones) — gentle shimmer
    this.bloomSynth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 6,
      voice: Tone.Synth,
      options: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.12, decay: 0.6, sustain: 0.15, release: 2.0 },
        volume: -24,
      },
    });
    this.shimmerDelay = new Tone.FeedbackDelay({ delayTime: 0.35, feedback: 0.35, wet: 0.45 });
    this.bloomSynth.connect(this.shimmerDelay);
    this.shimmerDelay.connect(this.reverb);

    // Create recording destination (for MediaRecorder capture)
    const rawCtx = Tone.getContext().rawContext;
    if (rawCtx && 'createMediaStreamDestination' in rawCtx) {
      this.recordingDest = (rawCtx as AudioContext).createMediaStreamDestination();
      // Connect masterGain → recordingDest in parallel with dest
      const toneNode = new Tone.Gain(1);
      this.masterGain.connect(toneNode);
      toneNode.connect(this.recordingDest);
    }

    // Build lead voice + per-instrument FX for default preset
    this.buildLeadVoice(this.currentPreset);
    this.connectLeadChain(this.currentPreset);

    // Breath noise for wind instruments
    this.breathFilter = new Tone.Filter({ frequency: 2500, type: 'bandpass', Q: 1.5 });
    this.breathSynth = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.06, decay: 0.18, sustain: 0.12, release: 0.2 },
      volume: -30,
    });
    this.breathSynth.connect(this.breathFilter);
    this.breathFilter.connect(this.reverb);

    // Pad synth — soft, ambient
    this.padSynth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 6,
      voice: Tone.Synth,
      options: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.8, decay: 0.6, sustain: 0.5, release: 2.5 },
        volume: -16,
      },
    });
    this.padSynth.connect(this.reverb);

    // Bass synth — warm, round
    this.bassSynth = new Tone.MonoSynth({
      oscillator: { type: 'sine' },
      filter: { Q: 1.2, frequency: 600, type: 'lowpass' },
      envelope: { attack: 0.1, decay: 0.4, sustain: 0.4, release: 0.8 },
      filterEnvelope: {
        attack: 0.12, decay: 0.3, sustain: 0.4, release: 0.6,
        baseFrequency: 150, octaves: 1.5,
      },
      volume: -12,
    });
    this.bassSynth.connect(this.masterGain);

    // Ensemble bus: all ensemble voices → ensembleBus → ensembleReverb → masterGain
    this.ensembleBus = new Tone.Gain(1);
    this.ensembleReverb = new Tone.Reverb({ decay: 2.5, wet: 0.35 });
    this.ensembleBus.connect(this.ensembleReverb);
    this.ensembleReverb.connect(this.masterGain);

    // ── Chord swell pad (Adaptive Chord Swell) ──
    this.swellFilter = new Tone.Filter({ frequency: 200, type: 'lowpass', rolloff: -12 });
    this.swellGain = new Tone.Gain(0);
    this.swellPad = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 6,
      voice: Tone.Synth,
      options: {
        oscillator: { type: 'sine' },
        envelope: { attack: 1.0, decay: 0.5, sustain: 0.7, release: 2.0 },
        volume: -14,
      },
    });
    this.swellPad.connect(this.swellFilter);
    this.swellFilter.connect(this.swellGain);
    this.swellGain.connect(this.reverb);

    // ── Ghost arpeggiator synth ──
    this.ghostGain = new Tone.Gain(0);
    this.ghostSynth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 4,
      voice: Tone.Synth,
      options: {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.01, decay: 0.15, sustain: 0.1, release: 0.3 },
        volume: -20,
      },
    });
    this.ghostSynth.connect(this.ghostGain);
    this.ghostGain.connect(this.reverb);

    // ── Counter-melody shadow synth ──
    this.shadowGain = new Tone.Gain(0);
    this.shadowSynth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 4,
      voice: Tone.Synth,
      options: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.1, decay: 0.3, sustain: 0.4, release: 1.0 },
        volume: -22,
      },
    });
    this.shadowSynth.connect(this.shadowGain);
    this.shadowGain.connect(this.reverb);

    // ── Meditation percussion ──
    // Singing bowl: metallic FM with long release → reverb
    this.bowlSynth = new Tone.FMSynth({
      harmonicity: 5.07,        // metallic inharmonic ratio
      modulationIndex: 1.5,
      oscillator: { type: 'sine' },
      modulation: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 4.0, sustain: 0.0, release: 4.0 },
      modulationEnvelope: { attack: 0.01, decay: 2.0, sustain: 0.0, release: 3.0 },
      volume: -22,
    });
    this.bowlSynth.connect(this.reverb);

    // Soft membrane: gentle "dun" like a frame drum
    this.membraneSynth = new Tone.MembraneSynth({
      pitchDecay: 0.08,
      octaves: 3,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.002, decay: 0.8, sustain: 0.0, release: 1.0 },
      volume: -26,
    });
    this.membraneSynth.connect(this.reverb);

    // Brush noise: short filtered pink noise (rain-stick feel)
    this.brushFilter2 = new Tone.Filter({ frequency: 3000, type: 'bandpass', Q: 0.8 });
    this.brushSynth = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.005, decay: 0.12, sustain: 0.0, release: 0.15 },
      volume: -30,
    });
    this.brushSynth.connect(this.brushFilter2);
    this.brushFilter2.connect(this.reverb);

    this.initialized = true;
  }

  /* ────────────────────────────────────────────
     Instrument switching
     ──────────────────────────────────────────── */

  setInstrument(id: string): void {
    const preset = INSTRUMENT_PRESETS.find((p) => p.id === id);
    if (!preset || !this.initialized) return;
    this.currentPreset = preset;

    // 1. Tear down old lead voice + per-instrument FX
    this.teardownLeadChain();

    // 2. Build new lead voice
    this.buildLeadVoice(preset);

    // 3. Connect: leadSynth → [vibrato] → [chorus] → filter
    this.connectLeadChain(preset);

    // 4. Tune shared FX to preset
    this.filter!.frequency.rampTo(preset.filterFreq, 0.08);
    this.filter!.Q.rampTo(preset.filterQ, 0.08);
    this.reverb!.wet.rampTo(preset.reverbWet, 0.15);
    this.delay!.wet.rampTo(preset.delayWet, 0.15);
    this.delay!.feedback.rampTo(preset.delayFeedback, 0.15);

    // 5. Tune breath noise
    if (this.breathFilter) {
      this.breathFilter.frequency.rampTo(preset.breathFilterFreq, 0.05);
    }

    // 6. If sampler mode is enabled, load sampler for new instrument
    if (this._samplerEnabled) {
      this.loadSamplerForCurrentInstrument();
    }
  }

  getInstrumentId(): string {
    return this.currentPreset.id;
  }

  /* ────────────────────────────────────────────
     Sampler (real audio samples)
     ──────────────────────────────────────────── */

  /** Toggle sampler mode on/off. When on, real samples override synth. */
  setSamplerEnabled(enabled: boolean): void {
    this._samplerEnabled = enabled;
    if (enabled) {
      this.loadSamplerForCurrentInstrument();
    } else {
      this.disposeSampler();
      this._samplerReady = false;
      this._samplerLoading = false;
      this._samplerUnavailable = false;
    }
  }

  getSamplerState(): SamplerState {
    return {
      enabled: this._samplerEnabled,
      loading: this._samplerLoading,
      ready: this._samplerReady,
      unavailable: this._samplerUnavailable,
    };
  }

  private loadSamplerForCurrentInstrument(): void {
    // Dispose old sampler first
    this.disposeSampler();

    const def = getSampleDef(this.currentPreset.id);
    if (!def) {
      this._samplerUnavailable = true;
      this._samplerLoading = false;
      this._samplerReady = false;
      return;
    }

    this._samplerUnavailable = false;
    this._samplerLoading = true;
    this._samplerReady = false;

    this.sampler = new Tone.Sampler({
      urls: def.urls,
      baseUrl: def.baseUrl,
      release: def.release,
      onload: () => {
        this._samplerLoading = false;
        this._samplerReady = true;
      },
      onerror: (err: Error) => {
        console.warn('[SynthEngine] Sampler load failed, falling back to synth:', err);
        this._samplerLoading = false;
        this._samplerReady = false;
      },
    });

    // Sampler connects directly to filter (bypasses vibrato/chorus —
    // the recorded samples already carry the instrument's natural timbre)
    this.sampler.connect(this.filter!);
  }

  private disposeSampler(): void {
    if (this.sampler) {
      this.sampler.disconnect();
      this.sampler.dispose();
      this.sampler = null;
    }
  }

  /** True when sampler should be used for playback */
  private get useSampler(): boolean {
    return this._samplerEnabled && this._samplerReady && this.sampler !== null;
  }

  /* ────────────────────────────────────────────
     Ensemble
     ──────────────────────────────────────────── */

  /**
   * Set which instruments participate in the ensemble.
   * Roles are auto-assigned in order: harmony → arpeggio → counter.
   * Max 3 additional voices.
   */
  setEnsemble(instrumentIds: string[]): void {
    if (!this.initialized) return;

    // Dispose old voices
    this.disposeAllEnsembleVoices();

    const ids = instrumentIds.slice(0, 3);
    for (let i = 0; i < ids.length; i++) {
      const preset = INSTRUMENT_PRESETS.find((p) => p.id === ids[i]);
      if (!preset) continue;
      const role = ENSEMBLE_ROLES[i];
      this.createEnsembleVoice(preset, role);
    }
  }

  getEnsembleVoices(): { instrumentId: string; role: EnsembleRole }[] {
    return this.ensembleVoices.map((v) => ({
      instrumentId: v.instrumentId,
      role: v.role,
    }));
  }

  /** Update chord / scale context used for voice-leading calculations */
  setMusicalContext(chordPCs: Set<number>, scalePCs: Set<number>, root: number): void {
    this.musicalCtx = { chordPCs, scalePCs, root };
  }

  private createEnsembleVoice(preset: InstrumentPreset, role: EnsembleRole): void {
    // Build synth from preset (reuse buildLeadVoice logic)
    const saved = this.leadSynth;
    this.buildLeadVoice(preset);
    const synth = this.leadSynth!;
    this.leadSynth = saved;

    // Optional vibrato
    let vib: Tone.Vibrato | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let last: any = synth;
    if (preset.vibratoDepth > 0 && preset.vibratoRate > 0) {
      vib = new Tone.Vibrato({ frequency: preset.vibratoRate, depth: preset.vibratoDepth, wet: 1 });
      last.connect(vib);
      last = vib;
    }

    // Per-voice gain (volume offset for mix balance)
    const gain = new Tone.Gain(Tone.dbToGain(ROLE_VOLUME[role]));
    last.connect(gain);
    gain.connect(this.ensembleBus!);

    this.ensembleVoices.push({
      instrumentId: preset.id,
      role,
      preset,
      synth,
      vibrato: vib,
      gain,
    });
  }

  private disposeAllEnsembleVoices(): void {
    for (const v of this.ensembleVoices) {
      try { v.synth.releaseAll(); } catch { /* */ }
      v.synth.disconnect();
      v.synth.dispose();
      v.vibrato?.disconnect();
      v.vibrato?.dispose();
      v.gain.disconnect();
      v.gain.dispose();
    }
    this.ensembleVoices = [];
    this.arpeggioIdx = 0;
  }

  /** Play ensemble voices alongside the lead */
  private playEnsembleVoices(leadPitch: number, velocity: number, duration: number): void {
    if (this.ensembleVoices.length === 0) return;
    const ctx = this.musicalCtx;

    for (const v of this.ensembleVoices) {
      let pitch: number;
      switch (v.role) {
        case 'harmony':
          pitch = calcHarmony(leadPitch, ctx);
          break;
        case 'arpeggio':
          pitch = calcArpeggio(leadPitch, ctx, this.arpeggioIdx);
          break;
        case 'counter':
          pitch = calcCounter(leadPitch, this.prevLeadPitch, ctx);
          break;
      }

      // Clamp to playable MIDI range
      pitch = Math.max(36, Math.min(96, pitch));

      const vel = Math.max(0, Math.min(1, (velocity / 127) * ROLE_VEL[v.role]));
      const dur = duration * ROLE_DUR[v.role];
      const note = midiToNoteName(pitch);
      v.synth.triggerAttackRelease(note, dur, undefined, vel);
    }

    this.arpeggioIdx++;
  }

  /* ────────────────────────────────────────────
     Voice construction
     ──────────────────────────────────────────── */

  private buildLeadVoice(preset: InstrumentPreset): void {
    switch (preset.voiceKind) {
      case 'FMSynth':
        this.leadSynth = new Tone.PolySynth(Tone.FMSynth, {
          maxPolyphony: SYNTH_MAX_POLYPHONY,
          options: {
            harmonicity: preset.harmonicity ?? 2,
            modulationIndex: preset.modulationIndex ?? 1,
            oscillator: { type: preset.oscillatorType as Tone.ToneOscillatorType },
            modulation: { type: (preset.modulationType ?? 'sine') as Tone.ToneOscillatorType },
            envelope: { ...preset.envelope },
            modulationEnvelope: preset.modulationEnvelope
              ? { ...preset.modulationEnvelope }
              : { ...preset.envelope },
            volume: preset.volume,
          },
        } as ConstructorParameters<typeof Tone.PolySynth>[1]);
        break;

      case 'AMSynth':
        this.leadSynth = new Tone.PolySynth(Tone.AMSynth, {
          maxPolyphony: SYNTH_MAX_POLYPHONY,
          options: {
            harmonicity: preset.harmonicity ?? 2,
            oscillator: { type: preset.oscillatorType as Tone.ToneOscillatorType },
            modulation: { type: (preset.modulationType ?? 'sine') as Tone.ToneOscillatorType },
            envelope: { ...preset.envelope },
            modulationEnvelope: preset.modulationEnvelope
              ? { ...preset.modulationEnvelope }
              : { attack: 0.5, decay: 0.1, sustain: 1, release: 0.5 },
            volume: preset.volume,
          },
        } as ConstructorParameters<typeof Tone.PolySynth>[1]);
        break;

      default:
        this.leadSynth = new Tone.PolySynth(Tone.Synth, {
          maxPolyphony: SYNTH_MAX_POLYPHONY,
          voice: Tone.Synth,
          options: {
            oscillator: { type: preset.oscillatorType as Tone.ToneOscillatorType },
            envelope: { ...preset.envelope },
            volume: preset.volume,
          },
        });
        break;
    }
  }

  private connectLeadChain(preset: InstrumentPreset): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let last: any = this.leadSynth!;

    // Vibrato
    if (preset.vibratoDepth > 0 && preset.vibratoRate > 0) {
      this.vibrato = new Tone.Vibrato({
        frequency: preset.vibratoRate,
        depth: preset.vibratoDepth,
        wet: 1,
      });
      last.connect(this.vibrato);
      last = this.vibrato;
    }

    // Chorus
    if (preset.chorusWet > 0) {
      this.chorus = new Tone.Chorus({
        frequency: preset.chorusFreq,
        depth: preset.chorusDepth,
        delayTime: preset.chorusDelayTime,
        wet: preset.chorusWet,
      });
      this.chorus.start();
      last.connect(this.chorus);
      last = this.chorus;
    }

    // → shared filter
    last.connect(this.filter!);
  }

  private teardownLeadChain(): void {
    // Release all voices to prevent clicks
    try { this.leadSynth?.releaseAll(); } catch { /* ignore */ }

    this.leadSynth?.disconnect();
    this.leadSynth?.dispose();
    this.leadSynth = null;

    if (this.vibrato) {
      this.vibrato.disconnect();
      this.vibrato.dispose();
      this.vibrato = null;
    }
    if (this.chorus) {
      this.chorus.disconnect();
      this.chorus.dispose();
      this.chorus = null;
    }
  }

  /* ────────────────────────────────────────────
     Play methods
     ──────────────────────────────────────────── */

  playNote(pitch: number, velocity: number, duration = 0.2): void {
    if (!this.initialized) return;
    const note = midiToNoteName(pitch);
    const vel = Math.max(0, Math.min(1, velocity / 127));

    if (this.useSampler) {
      this.sampler!.triggerAttackRelease(note, duration, undefined, vel);
    } else if (this.leadSynth) {
      this.leadSynth.triggerAttackRelease(note, duration, undefined, vel);

      if (this.currentPreset.breathiness > 0 && this.breathSynth) {
        const breathVol = -30 + this.currentPreset.breathiness * 16;
        this.breathSynth.volume.rampTo(breathVol, 0.01);
        this.breathSynth.triggerAttackRelease(duration);
      }
    }

    // Harmonic bloom: add gentle overtones on high velocity
    if (this.harmonicBloomEnabled && velocity > 100 && this.bloomSynth) {
      const octave = midiToNoteName(pitch + 12);
      const fifth = midiToNoteName(pitch + 7);
      this.bloomSynth.triggerAttackRelease(octave, duration * 2.5, undefined, vel * 0.2);
      this.bloomSynth.triggerAttackRelease(fifth, duration * 2.5, undefined, vel * 0.15);
    }

    // Counter-melody shadow: buffer note for delayed playback
    if (this.shadowActive && this.shadowSynth) {
      this.shadowBuffer.push({ pitch, velocity, duration, time: performance.now() });
      this.processShadowBuffer();
    }

    // Ensemble voices play harmonically derived notes
    this.playEnsembleVoices(pitch, velocity, duration);
    this.prevLeadPitch = pitch;
  }

  playChord(pitches: number[], duration = 2): void {
    if (!this.padSynth || !this.initialized) return;
    const notes = pitches.map(midiToNoteName);
    this.padSynth.triggerAttackRelease(notes, duration, undefined, 0.2);
  }

  playBass(pitch: number, duration = 1): void {
    if (!this.bassSynth || !this.initialized) return;
    const note = midiToNoteName(pitch);
    this.bassSynth.triggerAttackRelease(note, duration, undefined, 0.35);
  }

  /**
   * Meditation percussion.
   * @param kind  'bowl' | 'membrane' | 'brush'
   * @param pitch MIDI pitch (only used for bowl and membrane)
   * @param vel   0..1 velocity
   */
  playMeditationPerc(kind: 'bowl' | 'membrane' | 'brush', pitch = 60, vel = 0.4): void {
    if (!this.initialized) return;
    const note = midiToNoteName(pitch);
    switch (kind) {
      case 'bowl':
        this.bowlSynth?.triggerAttackRelease(note, 3.0, undefined, vel);
        break;
      case 'membrane':
        this.membraneSynth?.triggerAttackRelease(note, 0.6, undefined, vel);
        break;
      case 'brush':
        this.brushSynth?.triggerAttackRelease(0.1, undefined, vel);
        break;
    }
  }

  /* ────────────────────────────────────────────
     Parameter setters
     ──────────────────────────────────────────── */

  setFilterCutoff(value: number): void {
    if (!this.filter) return;
    const base = this.currentPreset.filterFreq;
    const freq = 200 + value * (base - 200);
    this.filter.frequency.rampTo(freq, 0.05);
  }

  setReverbWet(value: number): void { this.reverb?.wet.rampTo(value, 0.1); }
  setDelayWet(value: number): void { this.delay?.wet.rampTo(value, 0.1); }
  setBPM(bpm: number): void { Tone.getTransport().bpm.value = bpm; }

  /* ────────────────────────────────────────────
     Audio analysis
     ──────────────────────────────────────────── */

  getAudioFrameData(): AudioFrameData {
    if (!this.analyser || !this.fft) return { rms: 0, lowEnergy: 0, highEnergy: 0 };

    const waveform = this.analyser.getValue() as Float32Array;
    let sum = 0;
    for (let i = 0; i < waveform.length; i++) sum += waveform[i] * waveform[i];
    const rms = Math.sqrt(sum / waveform.length);

    const spectrum = this.fft.getValue() as Float32Array;
    const binCount = spectrum.length;
    const lowBins = Math.floor(binCount * 0.15);
    const highStart = Math.floor(binCount * 0.5);

    let lowSum = 0;
    for (let i = 0; i < lowBins; i++) lowSum += Math.pow(10, spectrum[i] / 20);
    const lowEnergy = lowBins > 0 ? lowSum / lowBins : 0;

    let highSum = 0;
    for (let i = highStart; i < binCount; i++) highSum += Math.pow(10, spectrum[i] / 20);
    const highEnergy = (binCount - highStart) > 0 ? highSum / (binCount - highStart) : 0;

    return {
      rms: Math.min(rms * 3, 1),
      lowEnergy: Math.min(lowEnergy * 0.5, 1),
      highEnergy: Math.min(highEnergy * 2, 1),
    };
  }

  /* ────────────────────────────────────────────
     Spatial Audio
     ──────────────────────────────────────────── */

  /** Set spatial position based on cursor. X → pan (-1..1), Y → depth filter. */
  setSpatialPosition(x: number, y: number, width: number, height: number): void {
    if (!this.panner || !this.filter) return;
    const panX = Math.max(-1, Math.min(1, (x / width) * 2 - 1));
    this.panner.pan.rampTo(panX, 0.05);
    // Y modulates filter for depth effect (top = bright, bottom = muffled)
    const yNorm = Math.max(0, Math.min(1, y / height));
    const depthFilter = this.currentPreset.filterFreq * (1 - yNorm * 0.4);
    this.filter.frequency.rampTo(Math.max(200, depthFilter), 0.08);
  }

  /* ────────────────────────────────────────────
     Harmonic Bloom
     ──────────────────────────────────────────── */

  setHarmonicBloomEnabled(on: boolean): void {
    this.harmonicBloomEnabled = on;
  }

  isHarmonicBloomEnabled(): boolean {
    return this.harmonicBloomEnabled;
  }

  /* ────────────────────────────────────────────
     Adaptive Chord Swell
     ──────────────────────────────────────────── */

  /** Set chord swell intensity (0 = off, 1 = full). Driven by curvature. */
  setChordSwellIntensity(intensity: number, chordPitches?: number[]): void {
    if (!this.swellGain || !this.swellFilter || !this.swellPad) return;
    const clamped = Math.max(0, Math.min(1, intensity));

    if (clamped > 0.05 && !this.swellActive) {
      this.swellActive = true;
      if (chordPitches && chordPitches.length > 0) {
        const notes = chordPitches.map(midiToNoteName);
        this.swellPad.triggerAttack(notes, undefined, 0.3);
      }
    } else if (clamped <= 0.05 && this.swellActive) {
      this.swellActive = false;
      this.swellPad.releaseAll();
    }

    this.swellGain.gain.rampTo(clamped * 0.7, 0.3);
    this.swellFilter.frequency.rampTo(200 + clamped * 3800, 0.5);
  }

  /* ────────────────────────────────────────────
     Rhythmic Ghost Layer
     ──────────────────────────────────────────── */

  /** Start ghost arpeggiator at given period (seconds). */
  startGhostArpeggio(periodSec: number): void {
    if (this.ghostActive || !this.ghostSynth || !this.ghostGain) return;
    this.ghostActive = true;
    this.ghostGain.gain.rampTo(0.6, 1.0);

    const halfPeriod = (periodSec / 2) * 1000; // ghost at 2x speed
    this.ghostIntervalId = setInterval(() => {
      if (!this.ghostActive || !this.ghostSynth) return;
      const tones = Array.from(this.musicalCtx.chordPCs);
      if (tones.length === 0) return;
      const pc = tones[Math.floor(Math.random() * tones.length)];
      const oct = 4 + Math.floor(Math.random() * 2);
      const pitch = pc + oct * 12;
      const note = midiToNoteName(pitch);
      const vel = 0.15 + Math.random() * 0.1;
      this.ghostSynth!.triggerAttackRelease(note, 0.1, undefined, vel);
    }, halfPeriod);
  }

  stopGhostArpeggio(): void {
    if (!this.ghostActive) return;
    this.ghostActive = false;
    this.ghostGain?.gain.rampTo(0, 0.5);
    if (this.ghostIntervalId) {
      clearInterval(this.ghostIntervalId);
      this.ghostIntervalId = null;
    }
  }

  isGhostActive(): boolean { return this.ghostActive; }

  /* ────────────────────────────────────────────
     Counter-Melody Shadow
     ──────────────────────────────────────────── */

  setShadowEnabled(on: boolean): void {
    if (on && !this.shadowActive) {
      this.shadowActive = true;
      this.shadowGain?.gain.rampTo(0.5, 0.5);
    } else if (!on && this.shadowActive) {
      this.shadowActive = false;
      this.shadowGain?.gain.rampTo(0, 0.5);
      this.shadowBuffer = [];
    }
  }

  isShadowEnabled(): boolean { return this.shadowActive; }

  private processShadowBuffer(): void {
    const now = performance.now();
    const SHADOW_DELAY_MS = 500;
    while (this.shadowBuffer.length > 0 && now - this.shadowBuffer[0].time >= SHADOW_DELAY_MS) {
      const ev = this.shadowBuffer.shift()!;
      if (!this.shadowSynth) break;
      // Transpose by a 3rd (4 semitones) or 6th (9 semitones)
      const interval = Math.random() > 0.5 ? 4 : 9;
      const shadowPitch = Math.max(36, Math.min(96, ev.pitch + interval));
      const note = midiToNoteName(shadowPitch);
      this.shadowSynth.triggerAttackRelease(note, ev.duration * 1.5, undefined, ev.velocity / 127 * 0.2);
    }
  }

  /* ────────────────────────────────────────────
     Master gain access (for cinematic drop)
     ──────────────────────────────────────────── */

  getMasterGain(): Tone.Gain | null { return this.masterGain; }
  getFilter(): Tone.Filter | null { return this.filter; }

  isReady(): boolean { return this.initialized; }

  /** Returns the MediaStreamAudioDestinationNode for recording, or null */
  getAudioDestination(): MediaStreamAudioDestinationNode | null {
    return this.recordingDest;
  }

  dispose(): void {
    this.teardownLeadChain();
    this.disposeSampler();
    this.disposeAllEnsembleVoices();
    this.stopGhostArpeggio();
    this.ensembleBus?.dispose();
    this.ensembleReverb?.dispose();
    this.padSynth?.dispose();
    this.bassSynth?.dispose();
    this.breathSynth?.dispose();
    this.breathFilter?.dispose();
    this.bowlSynth?.dispose();
    this.membraneSynth?.dispose();
    this.brushSynth?.dispose();
    this.brushFilter2?.dispose();
    this.bloomSynth?.dispose();
    this.shimmerDelay?.dispose();
    this.swellPad?.dispose();
    this.swellFilter?.dispose();
    this.swellGain?.dispose();
    this.ghostSynth?.dispose();
    this.ghostGain?.dispose();
    this.shadowSynth?.dispose();
    this.shadowGain?.dispose();
    this.panner?.dispose();
    this.filter?.dispose();
    this.reverb?.dispose();
    this.delay?.dispose();
    this.analyser?.dispose();
    this.fft?.dispose();
    this.masterGain?.dispose();
    this.initialized = false;
  }
}
