/**
 * useGestureSymphony — main integration hook.
 *
 * Wires together:
 * gesture → melodicCorrection → harmonyEngine → synthEngine → visualEngine
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import { GestureAnalyzer } from '../gesture/gestureAnalyzer';
import { SynthEngine, INSTRUMENT_PRESETS, ENSEMBLE_ROLES, ENSEMBLE_ROLE_LABELS, type SamplerState, type EnsembleRole } from '../audio/synthEngine';
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

export interface EnsembleVoiceInfo {
  instrumentId: string;
  instrumentName: string;
  role: EnsembleRole;
  roleLabel: string;
}

export interface GestureSymphonyState {
  isInitialized: boolean;
  isPlaying: boolean;
  bpm: number;
  melodicStability: number;
  rootNote: string;
  mode: string;
  progression: string;
  instrument: string;
  sampler: SamplerState;
  ensemble: EnsembleVoiceInfo[];
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
  setSamplerEnabled: (enabled: boolean) => void;
  toggleEnsembleVoice: (instrumentId: string) => void;
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
    sampler: { enabled: false, loading: false, ready: false, unavailable: false },
    ensemble: [],
    visualMode: 'cinematic',
    reelMode: false,
    currentChord: 'C',
    currentPitch: 60,
    loopState: 'idle',
    particleCount: 0,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  // Ensemble instrument IDs (mutable, synced to state)
  const ensembleIdsRef = useRef<string[]>([]);

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

    // Set initial musical context for ensemble voice-leading
    const initChord = harmony.getCurrentChord();
    synth.setMusicalContext(initChord.pitchClasses as Set<number>, scale.pitchClasses as Set<number>, initChord.root);

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
      const samplerState = synth.getSamplerState();
      setState((s) => ({
        ...s,
        particleCount: debug.particles,
        sampler: samplerState,
      }));

      audioFrameIdRef.current = requestAnimationFrame(update);
    };
    update();
  }

  // ─── Mouse button state ───
  const mouseButtonRef = useRef<Set<number>>(new Set());

  // ─── Shared: get canvas-relative coords ───
  const canvasXY = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    [canvasRef],
  );

  // ─── Mouse Move Handler ───
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!gestureRef.current || !synthRef.current || !visualRef.current || !harmonyRef.current) {
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;

      const { x, y } = canvasXY(e);
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

          // Update musical context for ensemble voice-leading
          const scale = buildScale(stateRef.current.rootNote, stateRef.current.mode);
          synthRef.current.setMusicalContext(
            chord.pitchClasses as Set<number>,
            scale.pitchClasses as Set<number>,
            chord.root,
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
      // Left-button held → boost velocity for accented playing
      const velBoost = mouseButtonRef.current.has(0) ? 1.3 : 1;
      const velocity = Math.min(127, Math.round(rawMapping.midiVelocity * velBoost));
      const duration = sixteenthDuration * (1 + Math.random() * 0.5);

      // Update prev pitches
      prevPrevPitchRef.current = prevPitchRef.current;
      prevPitchRef.current = pitch;

      // Play note
      synthRef.current.playNote(pitch, velocity, duration);

      // Right-button held → continuously strum chord tones alongside lead
      if (mouseButtonRef.current.has(2)) {
        const ch = harmonyRef.current.getCurrentChord();
        const chordPitches = Array.from(ch.pitchClasses).map((pc) => pc + 60);
        synthRef.current.playChord(chordPitches, duration * 2);
      }

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
    [canvasRef, canvasXY],
  );

  // ─── Mouse Down Handler ───
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      mouseButtonRef.current.add(e.button);

      if (!gestureRef.current || !synthRef.current || !visualRef.current || !harmonyRef.current) {
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) return;

      const { x, y } = canvasXY(e);
      const { bpm, melodicStability } = stateRef.current;
      const sixteenthDuration = (60 / bpm) / (QUANTIZE_DIVISION / 4);

      // Ensure gesture state is up to date at click position
      const gestureState = gestureRef.current.processMouseEvent(x, y, performance.now());
      const rawMapping = gestureRef.current.mapToRaw(gestureState);

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

      if (e.button === 0) {
        // ── Left click: accented note (high velocity, longer duration) ──
        const accentVelocity = Math.min(127, Math.round(rawMapping.midiVelocity * 1.4 + 20));
        const accentDuration = sixteenthDuration * 3;

        prevPrevPitchRef.current = prevPitchRef.current;
        prevPitchRef.current = pitch;

        synthRef.current.playNote(pitch, accentVelocity, accentDuration);

        // Strong visual burst
        visualRef.current.updateCursor({ x, y, velocity: gestureState.velocity * 1.5, pitch });
        visualRef.current.onNoteOn(x, y, pitch, accentVelocity);

        if (loopRef.current) {
          loopRef.current.addNote(pitch, accentVelocity, accentDuration);
        }

        // Reset quantize timer so next move plays immediately
        lastQuantizedTimeRef.current = 0;

        setState((s) => ({ ...s, currentPitch: pitch }));
      } else if (e.button === 2) {
        // ── Right click: strum current chord + bass ──
        const chordPitches = Array.from(chord.pitchClasses).map((pc) => pc + 60);
        const chordDuration = sixteenthDuration * QUANTIZE_DIVISION;

        synthRef.current.playChord(chordPitches, chordDuration);
        synthRef.current.playBass(chord.root + 36, chordDuration);

        // Visual burst for each chord tone
        const spread = 30;
        chordPitches.forEach((cp, i) => {
          const ox = x + (i - 1) * spread;
          visualRef.current!.onNoteOn(ox, y, cp, 100);
        });

        visualRef.current.updateCursor({ x, y, velocity: gestureState.velocity, pitch });
      }
    },
    [canvasRef, canvasXY],
  );

  // ─── Mouse Up Handler ───
  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      mouseButtonRef.current.delete(e.button);
    },
    [],
  );

  // ─── Prevent context menu on canvas ───
  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
    },
    [],
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
    const chord = harmonyRef.current?.getCurrentChord();
    if (chord) {
      synthRef.current?.setMusicalContext(chord.pitchClasses as Set<number>, scale.pitchClasses as Set<number>, chord.root);
    }
    setState((s) => ({
      ...s,
      rootNote: root,
      currentChord: chord?.name ?? s.currentChord,
    }));
  }, []);

  const setMode = useCallback((mode: string) => {
    const scale = buildScale(stateRef.current.rootNote, mode);
    harmonyRef.current?.setScale(scale);
    const chord = harmonyRef.current?.getCurrentChord();
    if (chord) {
      synthRef.current?.setMusicalContext(chord.pitchClasses as Set<number>, scale.pitchClasses as Set<number>, chord.root);
    }
    setState((s) => ({
      ...s,
      mode,
      currentChord: chord?.name ?? s.currentChord,
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

  const setSamplerEnabled = useCallback((enabled: boolean) => {
    synthRef.current?.setSamplerEnabled(enabled);
    // State will be picked up by the audio frame loop polling
  }, []);

  // ─── Ensemble ───
  const buildEnsembleInfo = useCallback((ids: string[]): EnsembleVoiceInfo[] => {
    return ids.slice(0, 3).map((id, i) => {
      const preset = INSTRUMENT_PRESETS.find((p) => p.id === id);
      const role = ENSEMBLE_ROLES[i];
      return {
        instrumentId: id,
        instrumentName: preset?.name ?? id,
        role,
        roleLabel: ENSEMBLE_ROLE_LABELS[role],
      };
    });
  }, []);

  const toggleEnsembleVoice = useCallback((instrumentId: string) => {
    const ids = ensembleIdsRef.current;
    const idx = ids.indexOf(instrumentId);
    let newIds: string[];

    if (idx >= 0) {
      // Remove
      newIds = ids.filter((_, i) => i !== idx);
    } else {
      // Add (max 3)
      if (ids.length >= 3) return;
      newIds = [...ids, instrumentId];
    }

    ensembleIdsRef.current = newIds;
    synthRef.current?.setEnsemble(newIds);
    setState((s) => ({ ...s, ensemble: buildEnsembleInfo(newIds) }));
  }, [buildEnsembleInfo]);

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
      setSamplerEnabled,
      toggleEnsembleVoice,
      setVisualMode,
      setReelMode,
      startLoop,
      stopLoop,
      clearLoop,
      overdubLoop,
    } satisfies GestureSymphonyActions,
    handleMouseMove,
    handleMouseDown,
    handleMouseUp,
    handleContextMenu,
    availableModes: getAvailableModes(),
    availableRoots: getAvailableRoots(),
    availableProgressions: Object.entries(PROGRESSIONS).map(([key, val]) => ({
      key,
      name: val.name,
    })),
    availableInstruments: INSTRUMENT_PRESETS.map((p) => ({ id: p.id, name: p.name })),
  };
}
