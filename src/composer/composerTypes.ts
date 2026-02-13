/**
 * Shared types for the entire Gesture Symphony 2.0 system.
 */

// ─── Core Music Types ───

export interface NoteEvent {
  time: number;
  duration: number;
  pitch: number;
  velocity: number;
}

export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export type ScaleDegree = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Scale {
  root: PitchClass;
  pitchClasses: Set<PitchClass>;
  name: string;
}

export interface Chord {
  pitchClasses: Set<PitchClass>;
  root: PitchClass;
  name: string;
}

// ─── Gesture Types ───

export interface GestureState {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  velocity: number;
  acceleration: number;
  angularVelocity: number;
  timestamp: number;
}

export interface GestureFeatures {
  energy: number;
  smoothness: number;
  density: number;
}

export interface RawMapping {
  pRaw: number;
  octaveBias: number;
  midiVelocity: number;
  filterCutoff: number;
  arpeggioMode: boolean;
}

// ─── Visual Types ───

export interface CursorState {
  x: number;
  y: number;
  velocity: number;
  pitch: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  saturation: number;
  lightness: number;
  active: boolean;
}

export interface Ripple {
  x: number;
  y: number;
  startTime: number;
  initialRadius: number;
  speed: number;
  hue: number;
  active: boolean;
}

export interface TrailPoint {
  x: number;
  y: number;
  timestamp: number;
  velocity: number;
  hue: number;
  /** Audio RMS at the moment this point was recorded (0–1). */
  rms: number;
}

export interface AudioFrameData {
  rms: number;
  lowEnergy: number;
  highEnergy: number;
}

// ─── AI Composer Types ───

export interface ComposerInput {
  bpm: number;
  key: string;
  mode: string;
  melodicStability: number;
  lead: NoteEvent[];
  gestureFeatures: GestureFeatures;
  style: string;
  lengthBars: number;
}

export interface ComposerOutput {
  tracks: {
    lead: NoteEvent[];
    chords: NoteEvent[];
    bass: NoteEvent[];
    drums: NoteEvent[];
  };
  mix: {
    reverb: number;
    delay: number;
    sidechain: number;
  };
}

// ─── Engine State ───

export type VisualModeName = 'chill' | 'cinematic' | 'neon';

export interface EngineState {
  bpm: number;
  melodicStability: number;
  scale: Scale;
  currentChord: Chord;
  visualMode: VisualModeName;
  isPlaying: boolean;
  isRecording: boolean;
  reelMode: boolean;
}
