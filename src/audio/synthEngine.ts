/**
 * Synth Engine — Tone.js-based synthesis with audio analysis.
 *
 * Provides:
 * - Melodic synth (lead)
 * - Pad synth (chords)
 * - Bass synth
 * - Audio analysis (RMS, FFT bands)
 */

import * as Tone from 'tone';
import { FFT_SIZE, SYNTH_MAX_POLYPHONY } from '../config';
import { midiToNoteName } from '../music/scale';
import type { AudioFrameData } from '../composer/composerTypes';

export class SynthEngine {
  private leadSynth: Tone.PolySynth | null = null;
  private padSynth: Tone.PolySynth | null = null;
  private bassSynth: Tone.MonoSynth | null = null;
  private analyser: Tone.Analyser | null = null;
  private fft: Tone.FFT | null = null;
  private filter: Tone.Filter | null = null;
  private reverb: Tone.Reverb | null = null;
  private delay: Tone.FeedbackDelay | null = null;
  private masterGain: Tone.Gain | null = null;
  private initialized = false;

  /**
   * Initialize the audio engine. Must be called after user gesture (browser policy).
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await Tone.start();

    // Master chain
    this.masterGain = new Tone.Gain(0.7);
    this.reverb = new Tone.Reverb({ decay: 2.5, wet: 0.3 });
    this.delay = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.2, wet: 0.15 });
    this.filter = new Tone.Filter({ frequency: 5000, type: 'lowpass', rolloff: -12 });
    this.analyser = new Tone.Analyser('waveform', FFT_SIZE);
    this.fft = new Tone.FFT(FFT_SIZE);

    // Lead synth
    this.leadSynth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: SYNTH_MAX_POLYPHONY,
      voice: Tone.Synth,
      options: {
        oscillator: { type: 'triangle8' },
        envelope: {
          attack: 0.02,
          decay: 0.3,
          sustain: 0.4,
          release: 0.8,
        },
      },
    });

    // Pad synth
    this.padSynth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 6,
      voice: Tone.Synth,
      options: {
        oscillator: { type: 'sine' },
        envelope: {
          attack: 0.5,
          decay: 0.5,
          sustain: 0.6,
          release: 2.0,
        },
        volume: -12,
      },
    });

    // Bass synth
    this.bassSynth = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      filter: { Q: 2, frequency: 800, type: 'lowpass' },
      envelope: {
        attack: 0.05,
        decay: 0.3,
        sustain: 0.5,
        release: 0.5,
      },
      filterEnvelope: {
        attack: 0.06,
        decay: 0.2,
        sustain: 0.5,
        release: 0.5,
        baseFrequency: 200,
        octaves: 2,
      },
      volume: -8,
    });

    // Connect chains
    this.leadSynth.connect(this.filter);
    this.filter.connect(this.delay);
    this.delay.connect(this.reverb);
    this.reverb.connect(this.masterGain);

    this.padSynth.connect(this.reverb);
    this.bassSynth.connect(this.masterGain);

    this.masterGain.connect(this.analyser);
    this.masterGain.connect(this.fft);
    this.masterGain.toDestination();

    this.initialized = true;
  }

  /**
   * Play a lead note.
   */
  playNote(pitch: number, velocity: number, duration: number = 0.2): void {
    if (!this.leadSynth || !this.initialized) return;
    const note = midiToNoteName(pitch);
    const vel = Math.max(0, Math.min(1, velocity / 127));
    this.leadSynth.triggerAttackRelease(note, duration, undefined, vel);
  }

  /**
   * Play chord tones (pad).
   */
  playChord(pitches: number[], duration: number = 2): void {
    if (!this.padSynth || !this.initialized) return;
    const notes = pitches.map(midiToNoteName);
    this.padSynth.triggerAttackRelease(notes, duration, undefined, 0.3);
  }

  /**
   * Play bass note.
   */
  playBass(pitch: number, duration: number = 1): void {
    if (!this.bassSynth || !this.initialized) return;
    const note = midiToNoteName(pitch);
    this.bassSynth.triggerAttackRelease(note, duration, undefined, 0.5);
  }

  /**
   * Set filter cutoff (0–1 range, mapped to 200–8000 Hz).
   */
  setFilterCutoff(value: number): void {
    if (!this.filter) return;
    const freq = 200 + value * 7800;
    this.filter.frequency.rampTo(freq, 0.05);
  }

  /**
   * Set reverb wet amount (0–1).
   */
  setReverbWet(value: number): void {
    if (!this.reverb) return;
    this.reverb.wet.rampTo(value, 0.1);
  }

  /**
   * Set delay wet amount (0–1).
   */
  setDelayWet(value: number): void {
    if (!this.delay) return;
    this.delay.wet.rampTo(value, 0.1);
  }

  /**
   * Set BPM.
   */
  setBPM(bpm: number): void {
    Tone.getTransport().bpm.value = bpm;
  }

  /**
   * Get audio frame data for visual engine.
   */
  getAudioFrameData(): AudioFrameData {
    if (!this.analyser || !this.fft) {
      return { rms: 0, lowEnergy: 0, highEnergy: 0 };
    }

    // RMS from waveform
    const waveform = this.analyser.getValue() as Float32Array;
    let sum = 0;
    for (let i = 0; i < waveform.length; i++) {
      sum += waveform[i] * waveform[i];
    }
    const rms = Math.sqrt(sum / waveform.length);

    // FFT bands
    const spectrum = this.fft.getValue() as Float32Array;
    const binCount = spectrum.length;
    const lowBins = Math.floor(binCount * 0.15); // ~0-750Hz
    const highStart = Math.floor(binCount * 0.5);  // ~2500Hz+

    let lowSum = 0;
    for (let i = 0; i < lowBins; i++) {
      lowSum += Math.pow(10, spectrum[i] / 20); // dB to linear
    }
    const lowEnergy = lowBins > 0 ? lowSum / lowBins : 0;

    let highSum = 0;
    for (let i = highStart; i < binCount; i++) {
      highSum += Math.pow(10, spectrum[i] / 20);
    }
    const highEnergy = (binCount - highStart) > 0 ? highSum / (binCount - highStart) : 0;

    return {
      rms: Math.min(rms * 3, 1), // boost for visual responsiveness
      lowEnergy: Math.min(lowEnergy * 0.5, 1),
      highEnergy: Math.min(highEnergy * 2, 1),
    };
  }

  /**
   * Check if engine is initialized.
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Dispose all synths and effects.
   */
  dispose(): void {
    this.leadSynth?.dispose();
    this.padSynth?.dispose();
    this.bassSynth?.dispose();
    this.filter?.dispose();
    this.reverb?.dispose();
    this.delay?.dispose();
    this.analyser?.dispose();
    this.fft?.dispose();
    this.masterGain?.dispose();
    this.initialized = false;
  }
}
