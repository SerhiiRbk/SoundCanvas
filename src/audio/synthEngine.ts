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
  /* ── Default Synth ── */
  {
    id: 'default',
    name: 'Default Synth',
    voiceKind: 'Synth',
    oscillatorType: 'triangle8',
    envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.8 },
    volume: 0,
    filterFreq: 5000, filterQ: 1,
    reverbWet: 0.3, delayWet: 0.15, delayFeedback: 0.2,
    vibratoRate: 0, vibratoDepth: 0,
    chorusWet: 0, chorusFreq: 0, chorusDepth: 0, chorusDelayTime: 3.5,
    breathiness: 0, breathFilterFreq: 2000,
  },

  /* ── Harp — plucked, bright attack, no sustain, resonant reverb ── */
  {
    id: 'harp',
    name: 'Harp',
    voiceKind: 'Synth',
    oscillatorType: 'triangle',
    envelope: { attack: 0.003, decay: 1.0, sustain: 0.0, release: 1.8 },
    volume: 0,
    filterFreq: 5000, filterQ: 0.5,
    reverbWet: 0.5, delayWet: 0.08, delayFeedback: 0.15,
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

  /* ── Piano — FM hammer strike with decaying modulation ── */
  {
    id: 'piano',
    name: 'Piano',
    voiceKind: 'FMSynth',
    oscillatorType: 'sine',
    envelope: { attack: 0.004, decay: 1.6, sustain: 0.08, release: 1.2 },
    volume: 0,
    harmonicity: 2,
    modulationIndex: 3.2,
    modulationType: 'sine',
    modulationEnvelope: { attack: 0.004, decay: 0.9, sustain: 0.05, release: 0.4 },
    filterFreq: 7000, filterQ: 0.7,
    reverbWet: 0.22, delayWet: 0.04, delayFeedback: 0.1,
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
   SynthEngine
   ================================================================ */

export class SynthEngine {
  /* ── Lead voice (rebuilt per instrument) ── */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private leadSynth: Tone.PolySynth<any> | null = null;

  /* ── Per-instrument FX (disposed on switch) ── */
  private vibrato: Tone.Vibrato | null = null;
  private chorus: Tone.Chorus | null = null;

  /* ── Breath noise layer for wind instruments ── */
  private breathSynth: Tone.NoiseSynth | null = null;
  private breathFilter: Tone.Filter | null = null;

  /* ── Shared (persistent) nodes ── */
  private padSynth: Tone.PolySynth | null = null;
  private bassSynth: Tone.MonoSynth | null = null;
  private filter: Tone.Filter | null = null;
  private reverb: Tone.Reverb | null = null;
  private delay: Tone.FeedbackDelay | null = null;
  private masterGain: Tone.Gain | null = null;
  private analyser: Tone.Analyser | null = null;
  private fft: Tone.FFT | null = null;

  private initialized = false;
  private currentPreset: InstrumentPreset = INSTRUMENT_PRESETS[0];

  /* ────────────────────────────────────────────
     Initialization
     ──────────────────────────────────────────── */

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await Tone.start();

    // Shared FX chain (persistent across instrument switches)
    this.masterGain = new Tone.Gain(0.7);
    this.reverb = new Tone.Reverb({ decay: 3.0, wet: 0.3 });
    this.delay = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.2, wet: 0.15 });
    this.filter = new Tone.Filter({ frequency: 5000, type: 'lowpass', rolloff: -12 });
    this.analyser = new Tone.Analyser('waveform', FFT_SIZE);
    this.fft = new Tone.FFT(FFT_SIZE);

    // Shared chain: filter → delay → reverb → masterGain → dest
    this.filter.connect(this.delay);
    this.delay.connect(this.reverb);
    this.reverb.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.masterGain.connect(this.fft);
    this.masterGain.toDestination();

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

    // Pad synth (unchanged)
    this.padSynth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 6,
      voice: Tone.Synth,
      options: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.5, decay: 0.5, sustain: 0.6, release: 2.0 },
        volume: -12,
      },
    });
    this.padSynth.connect(this.reverb);

    // Bass synth (unchanged)
    this.bassSynth = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      filter: { Q: 2, frequency: 800, type: 'lowpass' },
      envelope: { attack: 0.05, decay: 0.3, sustain: 0.5, release: 0.5 },
      filterEnvelope: {
        attack: 0.06, decay: 0.2, sustain: 0.5, release: 0.5,
        baseFrequency: 200, octaves: 2,
      },
      volume: -8,
    });
    this.bassSynth.connect(this.masterGain);

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
  }

  getInstrumentId(): string {
    return this.currentPreset.id;
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
    if (!this.leadSynth || !this.initialized) return;
    const note = midiToNoteName(pitch);
    const vel = Math.max(0, Math.min(1, velocity / 127));
    this.leadSynth.triggerAttackRelease(note, duration, undefined, vel);

    // Breath noise for wind instruments
    if (this.currentPreset.breathiness > 0 && this.breathSynth) {
      const breathVol = -30 + this.currentPreset.breathiness * 16; // -30 → -14 dB
      this.breathSynth.volume.rampTo(breathVol, 0.01);
      this.breathSynth.triggerAttackRelease(duration);
    }
  }

  playChord(pitches: number[], duration = 2): void {
    if (!this.padSynth || !this.initialized) return;
    const notes = pitches.map(midiToNoteName);
    this.padSynth.triggerAttackRelease(notes, duration, undefined, 0.3);
  }

  playBass(pitch: number, duration = 1): void {
    if (!this.bassSynth || !this.initialized) return;
    const note = midiToNoteName(pitch);
    this.bassSynth.triggerAttackRelease(note, duration, undefined, 0.5);
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

  isReady(): boolean { return this.initialized; }

  dispose(): void {
    this.teardownLeadChain();
    this.padSynth?.dispose();
    this.bassSynth?.dispose();
    this.breathSynth?.dispose();
    this.breathFilter?.dispose();
    this.filter?.dispose();
    this.reverb?.dispose();
    this.delay?.dispose();
    this.analyser?.dispose();
    this.fft?.dispose();
    this.masterGain?.dispose();
    this.initialized = false;
  }
}
