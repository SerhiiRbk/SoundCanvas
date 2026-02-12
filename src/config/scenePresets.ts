/**
 * Scene Presets — curated instrument + visual + harmony combinations.
 *
 * Each preset configures every musical and visual parameter to guarantee
 * the output sounds musical and looks stunning with zero tweaking.
 */

import type { VisualModeName } from '../composer/composerTypes';

export interface ScenePreset {
  id: string;
  name: string;
  description: string;
  instrument: string;
  visualMode: VisualModeName;
  rootNote: string;
  mode: string;
  progression: string;
  bpm: number;
  melodicStability: number;
  ensemble: string[];
  samplerEnabled: boolean;
}

export const SCENE_PRESETS: ScenePreset[] = [
  {
    id: 'midnight-piano',
    name: 'Midnight Piano',
    description: 'Warm keys, minor chords, cinematic depth',
    instrument: 'piano',
    visualMode: 'cinematic',
    rootNote: 'D#',
    mode: 'minor',
    progression: 'i-VI-III-VII',
    bpm: 105,
    melodicStability: 0.7,
    ensemble: ['cello'],
    samplerEnabled: false,
  },
  {
    id: 'neon-strings',
    name: 'Neon Strings',
    description: 'Electric violin, vivid colors, emotional',
    instrument: 'violin',
    visualMode: 'neon',
    rootNote: 'A',
    mode: 'minor',
    progression: 'vi-IV-I-V',
    bpm: 110,
    melodicStability: 0.5,
    ensemble: ['cello', 'harp'],
    samplerEnabled: false,
  },
  {
    id: 'lofi-rain',
    name: 'Lo-fi Rain',
    description: 'Mellow synth, pentatonic, chill vibes',
    instrument: 'default',
    visualMode: 'chill',
    rootNote: 'C',
    mode: 'pentatonicMinor',
    progression: 'I-V-vi-IV',
    bpm: 100,
    melodicStability: 0.8,
    ensemble: [],
    samplerEnabled: false,
  },
  {
    id: 'cinematic-epic',
    name: 'Cinematic Epic',
    description: 'Deep cello, dramatic progression, grand',
    instrument: 'cello',
    visualMode: 'cinematic',
    rootNote: 'D',
    mode: 'minor',
    progression: 'i-VI-III-VII',
    bpm: 108,
    melodicStability: 0.6,
    ensemble: ['violin', 'contrabass'],
    samplerEnabled: false,
  },
  {
    id: 'hang-garden',
    name: 'Hang Garden',
    description: 'Metallic hang drum, soft glow, meditative',
    instrument: 'hang-drum',
    visualMode: 'chill',
    rootNote: 'C',
    mode: 'major',
    progression: 'I-vi-IV-V',
    bpm: 104,
    melodicStability: 0.7,
    ensemble: ['flute'],
    samplerEnabled: false,
  },
  {
    id: 'wind-temple',
    name: 'Wind Temple',
    description: 'Pan flute, modal mystery, ancient feel',
    instrument: 'pan-flute',
    visualMode: 'cinematic',
    rootNote: 'G',
    mode: 'dorian',
    progression: 'I-bVII-IV-I',
    bpm: 106,
    melodicStability: 0.6,
    ensemble: ['oboe'],
    samplerEnabled: false,
  },
  {
    id: 'edm-drop',
    name: 'EDM Drop',
    description: 'Fast synth, neon chaos, high energy',
    instrument: 'default',
    visualMode: 'neon',
    rootNote: 'F#',
    mode: 'minor',
    progression: 'I-V-vi-IV',
    bpm: 120,
    melodicStability: 0.2,
    ensemble: [],
    samplerEnabled: false,
  },
  {
    id: 'silk-road',
    name: 'Silk Road',
    description: 'Erhu, phrygian scale, eastern journey',
    instrument: 'erhu',
    visualMode: 'cinematic',
    rootNote: 'A',
    mode: 'phrygian',
    progression: 'i-VI-III-VII',
    bpm: 108,
    melodicStability: 0.5,
    ensemble: [],
    samplerEnabled: false,
  },
];
