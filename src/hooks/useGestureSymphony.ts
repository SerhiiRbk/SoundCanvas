/**
 * useGestureSymphony — main integration hook.
 *
 * Wires together:
 * gesture → melodicCorrection → harmonyEngine → synthEngine → visualEngine
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import { GestureAnalyzer } from '../gesture/gestureAnalyzer';
import { SynthEngine, INSTRUMENT_PRESETS } from '../audio/synthEngine';
import { LoopEngine } from '../audio/loopEngine';
import { VisualEngine } from '../visual/visualEngine';
import { HarmonyEngine, PROGRESSIONS } from '../music/harmonyEngine';
import { melodicCorrection } from '../music/melodicCorrection';
import { buildScale, getAvailableModes, getAvailableRoots } from '../music/scale';
import {
  DEFAULT_BPM,
  DEFAULT_MELODIC_STABILITY,
  QUANTIZE_DIVISION,
} from '../config';
import type { VisualModeName } from '../composer/composerTypes';

export interface GestureSymphonyState {
  isInitialized: boolean;
  isPlaying: boolean;
  bpm: number;
  melodicStability: number;
  rootNote: string;
  mode: string;
  progression: string;
  instrument: string;
  visualMode: VisualModeName;
  reelMode: boolean;
  currentChord: string;
  currentPitch: number;
  loopState: string;
  particleCount: number;
}

export interface GestureSymphonyActions {
  initialize: () => Promise<void>;
  setBPM: (bpm: number) => void;
  setMelodicStability: (m: number) => void;
  setRootNote: (root: string) => void;
  setMode: (mode: string) => void;
  setProgression: (name: string) => void;
  setInstrument: (id: string) => void;
  setVisualMode: (mode: VisualModeName) => void;
  setReelMode: (enabled: boolean) => void;
  startLoop: () => void;
  stopLoop: () => void;
  clearLoop: () => void;
  overdubLoop: () => void;
}

export function useGestureSymphony(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const gestureRef = useRef<GestureAnalyzer | null>(null);
  const synthRef = useRef<SynthEngine | null>(null);
  const loopRef = useRef<LoopEngine | null>(null);
  const visualRef = useRef<VisualEngine | null>(null);
  const harmonyRef = useRef<HarmonyEngine | null>(null);

  const prevPitchRef = useRef<number>(60);
  const prevPrevPitchRef = useRef<number>(60);
  const lastQuantizedTimeRef = useRef<number>(0);
  const barCounterRef = useRef<number>(0);
  const beatCounterRef = useRef<number>(0);

  const [state, setState] = useState<GestureSymphonyState>({
    isInitialized: false,
    isPlaying: false,
    bpm: DEFAULT_BPM,
    melodicStability: DEFAULT_MELODIC_STABILITY,
    rootNote: 'C',
    mode: 'major',
    progression: 'I-V-vi-IV',
    instrument: 'default',
    visualMode: 'cinematic',
    reelMode: false,
    currentChord: 'C',
    currentPitch: 60,
    loopState: 'idle',
    particleCount: 0,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  // ─── Initialize ───
  const initialize = useCallback(async () => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const w = canvas.width;
    const h = canvas.height;

    // Create engines
    const synth = new SynthEngine();
    await synth.initialize();
    synth.setBPM(DEFAULT_BPM);

    const gesture = new GestureAnalyzer(w, h);
    const loop = new LoopEngine();
    const visual = new VisualEngine(canvas);

    const scale = buildScale('C', 'major');
    const harmony = new HarmonyEngine(scale, 'I-V-vi-IV');

    // Wire loop playback to synth + visual
    loop.onNote((event) => {
      synth.playNote(event.pitch, event.velocity, event.duration);
      visual.onNoteOn(
        canvas.width / 2,
        canvas.height / 2,
        event.pitch,
        event.velocity
      );
    });

    gestureRef.current = gesture;
    synthRef.current = synth;
    loopRef.current = loop;
    visualRef.current = visual;
    harmonyRef.current = harmony;

    visual.setPreset('cinematic');
    visual.start();

    setState((s) => ({
      ...s,
      isInitialized: true,
      isPlaying: true,
      currentChord: harmony.getCurrentChord().name,
    }));

    // Start audio frame update loop
    startAudioFrameLoop(synth, visual);
  }, [canvasRef]);

  // ─── Audio Frame Loop (sync visual with audio) ───
  const audioFrameIdRef = useRef<number>(0);

  function startAudioFrameLoop(synth: SynthEngine, visual: VisualEngine) {
    const update = () => {
      if (synth.isReady()) {
        visual.updateAudio(synth.getAudioFrameData());
      }

      const debug = visual.getDebugInfo();
      setState((s) => ({
        ...s,
        particleCount: debug.particles,
      }));

      audioFrameIdRef.current = requestAnimationFrame(update);
    };
    update();
  }

  // ─── Mouse Handler ───
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!gestureRef.current || !synthRef.current || !visualRef.current || !harmonyRef.current) {
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const now = performance.now();

      // Process gesture
      const gestureState = gestureRef.current.processMouseEvent(x, y, now);
      const rawMapping = gestureRef.current.mapToRaw(gestureState);

      // Time quantization
      const { bpm, melodicStability } = stateRef.current;
      const sixteenthDuration = (60 / bpm) / (QUANTIZE_DIVISION / 4);
      const sixteenthMs = sixteenthDuration * 1000;

      if (now - lastQuantizedTimeRef.current < sixteenthMs) {
        // Update visual cursor but don't trigger note
        visualRef.current.updateCursor({
          x,
          y,
          velocity: gestureState.velocity,
          pitch: prevPitchRef.current,
        });
        return;
      }

      lastQuantizedTimeRef.current = now;

      // Beat & bar tracking for harmony
      beatCounterRef.current++;
      if (beatCounterRef.current >= QUANTIZE_DIVISION) {
        beatCounterRef.current = 0;
        barCounterRef.current++;

        // Advance harmony every bar
        const chordChanged = harmonyRef.current.advanceBar();
        if (chordChanged) {
          const chord = harmonyRef.current.getCurrentChord();
          const chordPitches = Array.from(chord.pitchClasses).map(
            (pc) => pc + 60
          );
          synthRef.current.playChord(chordPitches, sixteenthDuration * QUANTIZE_DIVISION);

          // Bass on chord change
          synthRef.current.playBass(
            chord.root + 36,
            sixteenthDuration * QUANTIZE_DIVISION
          );

          setState((s) => ({ ...s, currentChord: chord.name }));
        }
      }

      // Melodic correction
      const scale = buildScale(stateRef.current.rootNote, stateRef.current.mode);
      const chord = harmonyRef.current.getCurrentChord();

      const result = melodicCorrection({
        pRaw: rawMapping.pRaw,
        pPrev: prevPitchRef.current,
        pPrevPrev: prevPrevPitchRef.current,
        scale,
        chord,
        m: melodicStability,
      });

      const pitch = result.selectedPitch;
      const velocity = rawMapping.midiVelocity;
      const duration = sixteenthDuration * (1 + Math.random() * 0.5);

      // Update prev pitches
      prevPrevPitchRef.current = prevPitchRef.current;
      prevPitchRef.current = pitch;

      // Play note
      synthRef.current.playNote(pitch, velocity, duration);

      // Filter cutoff from acceleration
      synthRef.current.setFilterCutoff(rawMapping.filterCutoff);

      // Visual feedback
      visualRef.current.updateCursor({
        x,
        y,
        velocity: gestureState.velocity,
        pitch,
      });
      visualRef.current.onNoteOn(x, y, pitch, velocity);

      // Loop recording
      if (loopRef.current) {
        loopRef.current.addNote(pitch, velocity, duration);
      }

      setState((s) => ({ ...s, currentPitch: pitch }));
    },
    [canvasRef]
  );

  // ─── Settings Actions ───
  const setBPM = useCallback((bpm: number) => {
    synthRef.current?.setBPM(bpm);
    setState((s) => ({ ...s, bpm }));
  }, []);

  const setMelodicStability = useCallback((m: number) => {
    visualRef.current?.setMelodicStability(m);
    setState((s) => ({ ...s, melodicStability: m }));
  }, []);

  const setRootNote = useCallback((root: string) => {
    const scale = buildScale(root, stateRef.current.mode);
    harmonyRef.current?.setScale(scale);
    setState((s) => ({
      ...s,
      rootNote: root,
      currentChord: harmonyRef.current?.getCurrentChord().name ?? s.currentChord,
    }));
  }, []);

  const setMode = useCallback((mode: string) => {
    const scale = buildScale(stateRef.current.rootNote, mode);
    harmonyRef.current?.setScale(scale);
    setState((s) => ({
      ...s,
      mode,
      currentChord: harmonyRef.current?.getCurrentChord().name ?? s.currentChord,
    }));
  }, []);

  const setProgression = useCallback((name: string) => {
    harmonyRef.current?.setProgression(name);
    setState((s) => ({
      ...s,
      progression: name,
      currentChord: harmonyRef.current?.getCurrentChord().name ?? s.currentChord,
    }));
  }, []);

  const setInstrument = useCallback((id: string) => {
    synthRef.current?.setInstrument(id);
    setState((s) => ({ ...s, instrument: id }));
  }, []);

  const setVisualMode = useCallback((mode: VisualModeName) => {
    visualRef.current?.setPreset(mode);
    setState((s) => ({ ...s, visualMode: mode }));
  }, []);

  const setReelMode = useCallback((enabled: boolean) => {
    visualRef.current?.setReelMode(enabled);
    setState((s) => ({ ...s, reelMode: enabled }));
  }, []);

  // ─── Loop Actions ───
  const startLoop = useCallback(() => {
    if (loopRef.current?.getState() === 'idle') {
      loopRef.current.record();
      setState((s) => ({ ...s, loopState: 'recording' }));
    } else if (loopRef.current?.getState() === 'recording') {
      loopRef.current.stopRecording();
      loopRef.current.play();
      setState((s) => ({ ...s, loopState: 'playing' }));
    }
  }, []);

  const stopLoop = useCallback(() => {
    loopRef.current?.stop();
    setState((s) => ({ ...s, loopState: 'idle' }));
  }, []);

  const clearLoop = useCallback(() => {
    loopRef.current?.clear();
    setState((s) => ({ ...s, loopState: 'idle' }));
  }, []);

  const overdubLoop = useCallback(() => {
    loopRef.current?.overdub();
    setState((s) => ({ ...s, loopState: 'overdubbing' }));
  }, []);

  // ─── Cleanup ───
  useEffect(() => {
    return () => {
      visualRef.current?.stop();
      synthRef.current?.dispose();
      cancelAnimationFrame(audioFrameIdRef.current);
    };
  }, []);

  // ─── Resize Handler ───
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (canvasRef.current) {
        canvasRef.current.width = w;
        canvasRef.current.height = h;
      }
      gestureRef.current?.resize(w, h);
      visualRef.current?.resize(w, h);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [canvasRef]);

  return {
    state,
    actions: {
      initialize,
      setBPM,
      setMelodicStability,
      setRootNote,
      setMode,
      setProgression,
      setInstrument,
      setVisualMode,
      setReelMode,
      startLoop,
      stopLoop,
      clearLoop,
      overdubLoop,
    } satisfies GestureSymphonyActions,
    handleMouseMove,
    availableModes: getAvailableModes(),
    availableRoots: getAvailableRoots(),
    availableProgressions: Object.entries(PROGRESSIONS).map(([key, val]) => ({
      key,
      name: val.name,
    })),
    availableInstruments: INSTRUMENT_PRESETS.map((p) => ({ id: p.id, name: p.name })),
  };
}
