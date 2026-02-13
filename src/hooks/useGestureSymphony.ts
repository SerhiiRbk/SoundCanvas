/**
 * useGestureSymphony — main integration hook.
 *
 * Wires together:
 * gesture → melodicCorrection → harmonyEngine → synthEngine → visualEngine
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import { GestureAnalyzer } from '../gesture/gestureAnalyzer';
import { SynthEngine, INSTRUMENT_PRESETS, ENSEMBLE_ROLES, ENSEMBLE_ROLE_LABELS, type SamplerState, type EnsembleRole } from '../audio/synthEngine';
import { RecordingEngine, type RecordingState } from '../audio/recordingEngine';
import { LoopEngine } from '../audio/loopEngine';
import { FreezeEngine } from '../audio/freezeEngine';
import { CinematicDrop } from '../audio/cinematicDrop';
import { VisualEngine } from '../visual/visualEngine';
import { HarmonyEngine, PROGRESSIONS } from '../music/harmonyEngine';
import { melodicCorrection } from '../music/melodicCorrection';
import { buildScale, getAvailableModes, getAvailableRoots } from '../music/scale';
import {
  DEFAULT_BPM,
  DEFAULT_MELODIC_STABILITY,
  QUANTIZE_DIVISION,
  CURSOR_MIN_VELOCITY,
} from '../config';
import type { VisualModeName } from '../composer/composerTypes';
import type { ScenePreset } from '../config/scenePresets';
import { MeditationEngine, type PathMode } from '../meditation/meditationEngine';
import { EmotionMapper, type Emotion } from '../ai/emotionMapper';
import { CinematicTrailer, type TrailerPhase } from '../ai/cinematicTrailer';

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
  recording: RecordingState;
  recordingElapsed: number;
  recordingMaxDuration: number;
  recordingBlob: Blob | null;
  meditationMode: boolean;
  eternityMode: boolean;
  gpuEffects: boolean;
  electricFlower: boolean;
  particleWaves: boolean;
  /* Phase 4-6 effects */
  freezeMode: boolean;
  emotion: Emotion;
  trailerPhase: TrailerPhase;
  symmetryMode: string;
  effectToggles: Record<string, boolean>;
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
  applyScene: (preset: ScenePreset) => void;
  startRecording: () => void;
  stopRecording: () => void;
  setRecordingDuration: (seconds: number) => void;
  dismissRecording: () => void;
  setMeditationMode: (on: boolean) => void;
  setEternityMode: (on: boolean) => void;
  setGpuEffects: (on: boolean) => void;
  setElectricFlower: (on: boolean) => void;
  setParticleWaves: (on: boolean) => void;
  toggleEffect: (name: string) => void;
  toggleFreeze: () => void;
  triggerCinematicTrailer: () => void;
  cycleSymmetry: () => void;
  triggerCosmicZoom: () => void;
  playLoopReverse: () => void;
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
    recording: 'idle' as RecordingState,
    recordingElapsed: 0,
    recordingMaxDuration: 30,
    recordingBlob: null,
    meditationMode: false,
    eternityMode: false,
    gpuEffects: true,
    electricFlower: true,
    particleWaves: false,
    freezeMode: false,
    emotion: 'calm' as Emotion,
    trailerPhase: 'idle' as TrailerPhase,
    symmetryMode: 'off',
    effectToggles: {
      lightWarp: false,
      constellations: false,
      chordGeometry: false,
      shockwave: false,
      lightEcho: false,
      depthParallax: false,
      cadenceLock: false,
      modulationPortal: false,
      harmonyOrbit: false,
      pulseLock: false,
    },
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  // Ensemble instrument IDs (mutable, synced to state)
  const ensembleIdsRef = useRef<string[]>([]);

  // Recording engine
  const recorderRef = useRef<RecordingEngine | null>(null);
  const recElapsedRef = useRef<number>(0);

  // New engines
  const freezeRef = useRef<FreezeEngine>(new FreezeEngine());
  const dropRef = useRef<CinematicDrop>(new CinematicDrop());
  const emotionRef = useRef<EmotionMapper>(new EmotionMapper());
  const trailerRef = useRef<CinematicTrailer>(new CinematicTrailer());

  // Meditation engine
  const meditationRef = useRef<MeditationEngine>(new MeditationEngine());
  const meditationActiveRef = useRef(false);
  const meditationLastNoteRef = useRef<number>(0);
  // Store original settings when entering meditation to restore on exit
  const preMeditationRef = useRef<{
    bpm: number;
    melodicStability: number;
    rootNote: string;
    mode: string;
    progression: string;
  } | null>(null);

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

    // Wire harmony events → visual triggers
    harmony.onEvent((ev) => {
      if (ev.type === 'cadence') {
        visual.triggerCadenceVisual();
      } else if (ev.type === 'modulation' && ev.oldRoot !== undefined && ev.newRoot !== undefined) {
        visual.triggerModulationVisual(ev.oldRoot, ev.newRoot);
      }
    });
    harmony.setModulationEnabled(true);

    // Initialize freeze engine
    freezeRef.current.init(synth.getMasterGain()! as unknown as import('tone').InputNode);

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

    // Recording engine
    const recorder = new RecordingEngine();
    recorder.setOnStateChange((s) => {
      setState((prev) => ({ ...prev, recording: s }));
      if (s === 'recording') {
        visual.setWatermark(true);
      } else {
        visual.setWatermark(false);
      }
    });
    recorder.setOnComplete((blob) => {
      setState((prev) => ({ ...prev, recordingBlob: blob }));
    });
    recorderRef.current = recorder;

    visual.setPreset('cinematic');
    visual.start();

    setState((s) => ({
      ...s,
      isInitialized: true,
      isPlaying: true,
      currentChord: harmony.getCurrentChord().name,
      gpuEffects: visual.isGpuEffectsEnabled(),
      electricFlower: visual.isElectricFlowerEnabled(),
      particleWaves: visual.isParticleWavesEnabled(),
    }));

    // Start audio frame update loop
    startAudioFrameLoop(synth, visual);
  }, [canvasRef]);

  // ─── Audio Frame Loop (sync visual with audio) ───
  const audioFrameIdRef = useRef<number>(0);

  function startAudioFrameLoop(synth: SynthEngine, visual: VisualEngine) {
    let lastMedTime = performance.now();

    const update = () => {
      if (synth.isReady()) {
        visual.updateAudio(synth.getAudioFrameData());
      }

      // ── Meditation autonomous cursor tick ──
      if (meditationActiveRef.current) {
        const now = performance.now();
        const dt = Math.min((now - lastMedTime) / 1000, 0.05);
        lastMedTime = now;

        const canvas = canvasRef.current;
        if (canvas && gestureRef.current && synthRef.current && harmonyRef.current) {
          const cursor = meditationRef.current.tick(dt, canvas.width, canvas.height);

          // Feed position to visual engine (cursor + trail + meditation path)
          visual.updateCursor({ x: cursor.x, y: cursor.y, velocity: cursor.velocity, pitch: prevPitchRef.current });
          visual.pushMeditationPosition(cursor.x, cursor.y, prevPitchRef.current);

          // ── Entropy-driven meditative note generation ──

          // Timing entropy: use fractional µs of CPU clock as randomness source
          const cpuEntropy = (now * 1000) % 1; // sub-ms fractional part
          // Combine with Math.random for unpredictable behaviour
          const rng = () => (Math.random() + cpuEntropy) % 1;

          // Humanized interval: slower and more spacious for mandala meditation
          // 600–1000ms gaps let notes breathe and create a calmer feel
          const BASE_INTERVAL = 750;
          const jitter = (rng() - 0.5) * 300; // ±150ms
          const interval = BASE_INTERVAL + jitter;

          if (now - meditationLastNoteRef.current >= interval) {
            meditationLastNoteRef.current = now;

            const scale = buildScale(stateRef.current.rootNote, stateRef.current.mode);
            const chord = harmonyRef.current.getCurrentChord();
            const chordPCs = Array.from(chord.pitchClasses);
            const scalePCs = Array.from(scale.pitchClasses);

            // ── Random rest (breathing silence): ~25% chance for spacious mandala meditation ──
            const isRest = rng() < 0.25;
            if (isRest) {
              // Still update visuals during rest
              visual.updateCursor({ x: cursor.x, y: cursor.y, velocity: cursor.velocity * 0.3, pitch: prevPitchRef.current });

              // Occasional brush noise during rests (rain-stick feel)
              if (rng() < 0.3) {
                synthRef.current.playMeditationPerc('brush', 60, 0.15 + rng() * 0.15);
                visual.onMeditationPerc(cursor.x, cursor.y);
              }
            } else {
              // ── Pitch generation with entropy ──

              // Base pitch from position
              let rawPitch = 48 + (cursor.x / canvas.width) * 36;

              // Random octave shift: ~12% chance to jump ±1 octave
              if (rng() < 0.12) {
                rawPitch += rng() < 0.5 ? 12 : -12;
              }

              // Random chord-tone leap: ~15% chance to snap directly to a chord tone
              if (rng() < 0.15 && chordPCs.length > 0) {
                const ct = chordPCs[Math.floor(rng() * chordPCs.length)];
                const octave = Math.floor(rawPitch / 12);
                rawPitch = octave * 12 + ct;
              }

              // Melodic correction with slightly randomized stability
              const stabilityJitter = 0.88 + rng() * 0.08; // 0.88..0.96
              const result = melodicCorrection({
                pRaw: rawPitch,
                pPrev: prevPitchRef.current,
                pPrevPrev: prevPrevPitchRef.current,
                scale,
                chord,
                m: stabilityJitter,
              });

              const pitch = result.selectedPitch;
              const yFrac = cursor.y / canvas.height;

              // Velocity with entropy: very soft 20..50 range
              const velocity = Math.round(20 + yFrac * 15 + rng() * 15);

              // Duration with entropy: 1.0..3.0s (long, spacious, meditative)
              const duration = 1.0 + rng() * 2.0;

              prevPrevPitchRef.current = prevPitchRef.current;
              prevPitchRef.current = pitch;

              // ── Grace note: ~10% chance, quick note 1-2 scale steps below ──
              if (rng() < 0.10 && scalePCs.length > 0) {
                const graceOffset = scalePCs.length >= 2 ? (rng() < 0.5 ? 1 : 2) : 1;
                const gracePitch = pitch - graceOffset;
                synthRef.current.playNote(gracePitch, Math.round(velocity * 0.5), 0.08);
              }

              // Play main note
              synthRef.current.playNote(pitch, velocity, duration);
              synthRef.current.setFilterCutoff(1800 + yFrac * 1200 + rng() * 500);

              // Visual feedback
              visual.onNoteOn(cursor.x, cursor.y, pitch, velocity);

              // ── Percussion (sparse, probabilistic) ──
              // Singing bowl: ~8% chance, on chord tones
              if (rng() < 0.08 && chordPCs.includes(pitch % 12)) {
                const bowlPitch = 72 + (pitch % 12); // high register
                synthRef.current.playMeditationPerc('bowl', bowlPitch, 0.2 + rng() * 0.2);
                visual.onMeditationPerc(cursor.x, cursor.y);
              }

              // Soft membrane: ~6% chance on strong beats
              if (rng() < 0.06) {
                synthRef.current.playMeditationPerc('membrane', 48, 0.15 + rng() * 0.1);
              }

              // Brush: ~10% chance (very quiet texture)
              if (rng() < 0.10) {
                synthRef.current.playMeditationPerc('brush', 60, 0.1 + rng() * 0.1);
              }
            }

            // Advance harmony (slower: count beats at meditation rate)
            beatCounterRef.current++;
            if (beatCounterRef.current >= 8) {
              beatCounterRef.current = 0;
              barCounterRef.current++;
              const chordChanged = harmonyRef.current.advanceBar();
              if (chordChanged) {
                const newChord = harmonyRef.current.getCurrentChord();
                const newChordPitches = Array.from(newChord.pitchClasses).map((pc) => pc + 60);
                synthRef.current.playChord(newChordPitches, 3.5);
                synthRef.current.playBass(newChord.root + 36, 3.5);
                synthRef.current.setMusicalContext(
                  newChord.pitchClasses as Set<number>,
                  scale.pitchClasses as Set<number>,
                  newChord.root,
                );

                // Singing bowl on every chord change for meditative pulse
                const bowlNote = newChord.root + 72;
                synthRef.current.playMeditationPerc('bowl', bowlNote, 0.3);
                visual.onMeditationPerc(cursor.x, cursor.y);

                setState((s) => ({ ...s, currentChord: newChord.name, currentPitch: prevPitchRef.current }));
              }
            }

            setState((s) => ({ ...s, currentPitch: prevPitchRef.current }));
          }
        }
      } else {
        lastMedTime = performance.now();
      }

      // ── Curvature → chord swell ──
      if (gestureRef.current) {
        const curvature = gestureRef.current.getCurvature();
        if (curvature > 0.05 && harmonyRef.current) {
          const ch = harmonyRef.current.getCurrentChord();
          const chPitches = Array.from(ch.pitchClasses).map((pc) => pc + 60);
          synthRef.current?.setChordSwellIntensity(Math.min(1, curvature * 5), chPitches);
        } else {
          synthRef.current?.setChordSwellIntensity(0);
        }

        // Rhythm → ghost arpeggiator
        const rhythmStr = gestureRef.current.getRhythmStrength();
        const period = gestureRef.current.getDominantPeriod();
        if (rhythmStr > 0.6 && !synthRef.current?.isGhostActive()) {
          synthRef.current?.startGhostArpeggio(period);
        } else if (rhythmStr < 0.4 && synthRef.current?.isGhostActive()) {
          synthRef.current?.stopGhostArpeggio();
        }

        // Pulse lock visual
        visualRef.current?.setPulseLockRhythm(rhythmStr, period);

        // Emotion mapping
        const emotionState = emotionRef.current.update(
          gestureRef.current.getEnergy(),
          1 - Math.min(1, Math.abs(gestureRef.current.getCurvature()) * 10),
          rhythmStr,
          gestureRef.current.getChaosLevel(),
        );
        setState((s) => s.emotion !== emotionState.emotion ? { ...s, emotion: emotionState.emotion } : s);
      }

      // Shadow melody processing (timed buffer)
      if (synthRef.current?.isShadowEnabled()) {
        // processShadowBuffer is called internally by playNote
      }

      // Freeze modulation
      if (freezeRef.current.isFrozen()) {
        freezeRef.current.modulate(performance.now() / 1000);
      }

      const debug = visual.getDebugInfo();
      const samplerState = synth.getSamplerState();
      const recElapsed = recorderRef.current?.getDuration() ?? 0;
      recElapsedRef.current = recElapsed;
      setState((s) => ({
        ...s,
        particleCount: debug.particles,
        sampler: samplerState,
        recordingElapsed: recElapsed,
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

      // ── Velocity gate: don't trigger sound when cursor is idle / barely moving ──
      if (gestureState.velocity < CURSOR_MIN_VELOCITY) {
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

          // Trigger chord visuals
          const quality = harmonyRef.current.getCurrentChordQuality();
          const degree = harmonyRef.current.getCurrentDegree();
          visualRef.current?.triggerChordVisual(quality, chord.root, degree);

          setState((s) => ({ ...s, currentChord: chord.name }));
        }
      }

      // Melodic correction
      const scale = buildScale(stateRef.current.rootNote, stateRef.current.mode);
      const chord = harmonyRef.current.getCurrentChord();
      const chaosLevel = gestureRef.current.getChaosLevel();

      const result = melodicCorrection({
        pRaw: rawMapping.pRaw,
        pPrev: prevPitchRef.current,
        pPrevPrev: prevPrevPitchRef.current,
        scale,
        chord,
        m: melodicStability,
        chaosLevel,
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

      // Track note onset for rhythm detection
      gestureRef.current.recordNoteOnset(now);

      // Spatial audio: position the sound in 3D space
      synthRef.current.setSpatialPosition(x, y, canvas.width, canvas.height);

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

      // Cinematic drop detection (energy burst)
      if (gestureRef.current.isSuddenBurst() && dropRef.current.canTrigger()) {
        const mg = synthRef.current.getMasterGain();
        const fl = synthRef.current.getFilter();
        if (mg && fl) {
          dropRef.current.trigger(mg, fl, {
            onMute: () => visualRef.current?.triggerShockwave(x, y, 0.3),
            onDrop: () => {
              visualRef.current?.triggerShockwave(x, y, 1.0);
              const ch = harmonyRef.current?.getCurrentChord();
              if (ch) {
                const chPitches = Array.from(ch.pitchClasses).map((pc) => pc + 60);
                synthRef.current?.playChord(chPitches, 2);
                synthRef.current?.playBass(ch.root + 36, 2);
              }
            },
            onFinish: () => {},
          });
        }
      }

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
        chaosLevel: gestureRef.current?.getChaosLevel() ?? 0,
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

  // ─── Scene Presets ───
  const applyScene = useCallback((preset: ScenePreset) => {
    // Apply instrument
    synthRef.current?.setInstrument(preset.instrument);

    // Apply visual mode
    visualRef.current?.setPreset(preset.visualMode);

    // Apply scale / root
    const scale = buildScale(preset.rootNote, preset.mode);
    harmonyRef.current?.setScale(scale);

    // Apply progression
    harmonyRef.current?.setProgression(preset.progression);

    // Apply BPM
    synthRef.current?.setBPM(preset.bpm);

    // Apply melodic stability
    visualRef.current?.setMelodicStability(preset.melodicStability);

    // Apply ensemble
    ensembleIdsRef.current = [];
    synthRef.current?.setEnsemble([]);
    for (const eid of preset.ensemble) {
      if (ensembleIdsRef.current.length < 3) {
        ensembleIdsRef.current.push(eid);
      }
    }
    synthRef.current?.setEnsemble(ensembleIdsRef.current);

    // Apply sampler
    synthRef.current?.setSamplerEnabled(preset.samplerEnabled);

    // Update musical context
    const chord = harmonyRef.current?.getCurrentChord();
    if (chord) {
      synthRef.current?.setMusicalContext(
        chord.pitchClasses as Set<number>,
        scale.pitchClasses as Set<number>,
        chord.root,
      );
    }

    setState((s) => ({
      ...s,
      instrument: preset.instrument,
      visualMode: preset.visualMode,
      rootNote: preset.rootNote,
      mode: preset.mode,
      progression: preset.progression,
      bpm: preset.bpm,
      melodicStability: preset.melodicStability,
      ensemble: buildEnsembleInfo(ensembleIdsRef.current),
      currentChord: chord?.name ?? s.currentChord,
    }));
  }, [buildEnsembleInfo]);

  // ─── Recording ───
  const startRecording = useCallback(() => {
    const canvas = canvasRef.current;
    const audioDest = synthRef.current?.getAudioDestination();
    if (!canvas || !audioDest || !recorderRef.current) return;
    recorderRef.current.startRecording(canvas, audioDest);
  }, [canvasRef]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stopRecording();
  }, []);

  const setRecordingDuration = useCallback((seconds: number) => {
    recorderRef.current?.setMaxDuration(seconds);
    setState((s) => ({ ...s, recordingMaxDuration: seconds }));
  }, []);

  const dismissRecording = useCallback(() => {
    setState((s) => ({ ...s, recordingBlob: null }));
  }, []);

  // ─── Meditation Mode ───
  const setMeditationMode = useCallback((on: boolean) => {
    // If eternity is active, turn it off first
    if (on && stateRef.current.eternityMode) {
      visualRef.current?.setEternityMode(false);
      setState((s) => ({ ...s, eternityMode: false }));
    }

    meditationActiveRef.current = on;
    meditationRef.current.setPathMode('meditation');

    if (on) {
      // Save current settings
      preMeditationRef.current = {
        bpm: stateRef.current.bpm,
        melodicStability: stateRef.current.melodicStability,
        rootNote: stateRef.current.rootNote,
        mode: stateRef.current.mode,
        progression: stateRef.current.progression,
      };

      // Apply meditative parameters — slow, calm
      synthRef.current?.setBPM(60);
      visualRef.current?.setMelodicStability(0.95);
      visualRef.current?.setMeditationMode(true);

      // Switch to pentatonic minor for consonant intervals
      const scale = buildScale(stateRef.current.rootNote, 'pentatonicMinor');
      harmonyRef.current?.setScale(scale);
      harmonyRef.current?.setProgression('I-vi-IV-V');
      const chord = harmonyRef.current?.getCurrentChord();
      if (chord) {
        synthRef.current?.setMusicalContext(
          chord.pitchClasses as Set<number>,
          scale.pitchClasses as Set<number>,
          chord.root,
        );
      }

      // Reset meditation engine for fresh path
      meditationRef.current.reset();
      meditationLastNoteRef.current = 0;
      beatCounterRef.current = 0;

      setState((s) => ({
        ...s,
        meditationMode: true,
        bpm: 60,
        melodicStability: 0.95,
        mode: 'pentatonicMinor',
        progression: 'I-vi-IV-V',
      }));
    } else {
      // Restore previous settings
      visualRef.current?.setMeditationMode(false);
      const prev = preMeditationRef.current;
      if (prev) {
        synthRef.current?.setBPM(prev.bpm);
        visualRef.current?.setMelodicStability(prev.melodicStability);
        const scale = buildScale(prev.rootNote, prev.mode);
        harmonyRef.current?.setScale(scale);
        harmonyRef.current?.setProgression(prev.progression);
        const chord = harmonyRef.current?.getCurrentChord();
        if (chord) {
          synthRef.current?.setMusicalContext(
            chord.pitchClasses as Set<number>,
            scale.pitchClasses as Set<number>,
            chord.root,
          );
        }
        setState((s) => ({
          ...s,
          meditationMode: false,
          bpm: prev.bpm,
          melodicStability: prev.melodicStability,
          rootNote: prev.rootNote,
          mode: prev.mode,
          progression: prev.progression,
        }));
        preMeditationRef.current = null;
      } else {
        setState((s) => ({ ...s, meditationMode: false }));
      }
    }
  }, []);

  // ─── Eternity Mode (∞ lemniscate path) ───
  const setEternityMode = useCallback((on: boolean) => {
    // If meditation is active, turn it off first
    if (on && meditationActiveRef.current) {
      // Restore from meditation before switching
      visualRef.current?.setMeditationMode(false);
      meditationActiveRef.current = false;
    }

    meditationActiveRef.current = on; // reuse same autonomous tick

    if (on) {
      // Save current settings
      preMeditationRef.current = {
        bpm: stateRef.current.bpm,
        melodicStability: stateRef.current.melodicStability,
        rootNote: stateRef.current.rootNote,
        mode: stateRef.current.mode,
        progression: stateRef.current.progression,
      };

      // Set path mode to eternity (lemniscate)
      meditationRef.current.setPathMode('eternity');
      meditationRef.current.reset();
      meditationLastNoteRef.current = 0;
      beatCounterRef.current = 0;

      // Eternity uses a dreamy, slower tempo and lydian mode for ethereal quality
      synthRef.current?.setBPM(66);
      visualRef.current?.setMelodicStability(0.95);
      visualRef.current?.setMeditationMode(true);
      visualRef.current?.setEternityMode(true);

      const scale = buildScale(stateRef.current.rootNote, 'pentatonicMajor');
      harmonyRef.current?.setScale(scale);
      harmonyRef.current?.setProgression('I-vi-IV-V');
      const chord = harmonyRef.current?.getCurrentChord();
      if (chord) {
        synthRef.current?.setMusicalContext(
          chord.pitchClasses as Set<number>,
          scale.pitchClasses as Set<number>,
          chord.root,
        );
      }

      setState((s) => ({
        ...s,
        meditationMode: false,
        eternityMode: true,
        bpm: 66,
        melodicStability: 0.95,
        mode: 'pentatonicMajor',
        progression: 'I-vi-IV-V',
      }));
    } else {
      // Restore
      visualRef.current?.setMeditationMode(false);
      visualRef.current?.setEternityMode(false);
      meditationRef.current.setPathMode('meditation');

      const prev = preMeditationRef.current;
      if (prev) {
        synthRef.current?.setBPM(prev.bpm);
        visualRef.current?.setMelodicStability(prev.melodicStability);
        const scale = buildScale(prev.rootNote, prev.mode);
        harmonyRef.current?.setScale(scale);
        harmonyRef.current?.setProgression(prev.progression);
        const chord = harmonyRef.current?.getCurrentChord();
        if (chord) {
          synthRef.current?.setMusicalContext(
            chord.pitchClasses as Set<number>,
            scale.pitchClasses as Set<number>,
            chord.root,
          );
        }
        setState((s) => ({
          ...s,
          eternityMode: false,
          bpm: prev.bpm,
          melodicStability: prev.melodicStability,
          rootNote: prev.rootNote,
          mode: prev.mode,
          progression: prev.progression,
        }));
        preMeditationRef.current = null;
      } else {
        setState((s) => ({ ...s, eternityMode: false }));
      }
    }
  }, []);

  const setGpuEffects = useCallback((on: boolean) => {
    visualRef.current?.setGpuEffects(on);
    setState((s) => ({ ...s, gpuEffects: on }));
  }, []);

  const setElectricFlower = useCallback((on: boolean) => {
    visualRef.current?.setElectricFlower(on);
    setState((s) => ({ ...s, electricFlower: on }));
  }, []);

  const setParticleWaves = useCallback((on: boolean) => {
    visualRef.current?.setParticleWaves(on);
    setState((s) => ({ ...s, particleWaves: on }));
  }, []);

  // ─── Phase 4-6 effect toggles ───
  const toggleEffect = useCallback((name: string) => {
    const current = visualRef.current?.isEffectEnabled(name) ?? false;
    const next = !current;
    visualRef.current?.setEffect(name, next);
    setState((s) => ({
      ...s,
      effectToggles: { ...s.effectToggles, [name]: next },
    }));
  }, []);

  const toggleFreeze = useCallback(() => {
    const mg = synthRef.current?.getMasterGain();
    if (!mg) return;
    freezeRef.current.toggle(mg as unknown as import('tone').ToneAudioNode);
    const frozen = freezeRef.current.isFrozen();
    setState((s) => ({ ...s, freezeMode: frozen }));
  }, []);

  const triggerCinematicTrailer = useCallback(() => {
    if (trailerRef.current.isActive()) {
      trailerRef.current.stop();
      setState((s) => ({ ...s, trailerPhase: 'idle' }));
      return;
    }
    const canvas = canvasRef.current;
    trailerRef.current.start({
      setBPM: (bpm) => synthRef.current?.setBPM(bpm),
      setStability: (m) => visualRef.current?.setMelodicStability(m),
      setFilterCutoff: (v) => synthRef.current?.setFilterCutoff(v),
      playChord: (pitches, dur) => synthRef.current?.playChord(pitches, dur),
      playBass: (pitch, dur) => synthRef.current?.playBass(pitch, dur),
      playNote: (pitch, vel, dur) => synthRef.current?.playNote(pitch, vel, dur),
      triggerShockwave: (x, y, i) => {
        const cx = canvas ? x * canvas.width : 400;
        const cy = canvas ? y * canvas.height : 300;
        visualRef.current?.triggerShockwave(cx, cy, i);
      },
      setBloomStrength: () => {},
      onPhaseChange: (phase) => setState((s) => ({ ...s, trailerPhase: phase })),
    }, stateRef.current.bpm);
  }, [canvasRef]);

  const cycleSymmetry = useCallback(() => {
    const next = visualRef.current?.cycleSymmetry() ?? 'off';
    setState((s) => ({ ...s, symmetryMode: next }));
  }, []);

  const triggerCosmicZoom = useCallback(() => {
    visualRef.current?.triggerCosmicZoom();
  }, []);

  const playLoopReverse = useCallback(() => {
    loopRef.current?.playReverse();
    setState((s) => ({ ...s, loopState: 'playing' }));
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

  // ─── Touch handlers (maps touch → same gesture pipeline as mouse) ───
  const touchIdRef = useRef<number | null>(null);

  const canvasXYTouch = useCallback(
    (touch: React.Touch) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    },
    [canvasRef],
  );

  const processInputAt = useCallback(
    (x: number, y: number, isAccent: boolean) => {
      if (!gestureRef.current || !synthRef.current || !visualRef.current || !harmonyRef.current) return;

      const now = performance.now();
      const gestureState = gestureRef.current.processMouseEvent(x, y, now);
      const rawMapping = gestureRef.current.mapToRaw(gestureState);

      const { bpm, melodicStability } = stateRef.current;
      const sixteenthDuration = (60 / bpm) / (QUANTIZE_DIVISION / 4);
      const sixteenthMs = sixteenthDuration * 1000;

      if (now - lastQuantizedTimeRef.current < sixteenthMs) {
        visualRef.current.updateCursor({ x, y, velocity: gestureState.velocity, pitch: prevPitchRef.current });
        return;
      }

      // Velocity gate (same as mouse handler) — skip if barely moving
      if (!isAccent && gestureState.velocity < CURSOR_MIN_VELOCITY) {
        visualRef.current.updateCursor({ x, y, velocity: gestureState.velocity, pitch: prevPitchRef.current });
        return;
      }

      lastQuantizedTimeRef.current = now;

      // Beat/bar tracking
      beatCounterRef.current++;
      if (beatCounterRef.current >= QUANTIZE_DIVISION) {
        beatCounterRef.current = 0;
        barCounterRef.current++;
        const chordChanged = harmonyRef.current.advanceBar();
        if (chordChanged) {
          const chord = harmonyRef.current.getCurrentChord();
          const chordPitches = Array.from(chord.pitchClasses).map((pc) => pc + 60);
          synthRef.current.playChord(chordPitches, sixteenthDuration * QUANTIZE_DIVISION);
          synthRef.current.playBass(chord.root + 36, sixteenthDuration * QUANTIZE_DIVISION);
          const scale = buildScale(stateRef.current.rootNote, stateRef.current.mode);
          synthRef.current.setMusicalContext(chord.pitchClasses as Set<number>, scale.pitchClasses as Set<number>, chord.root);
          setState((s) => ({ ...s, currentChord: chord.name }));
        }
      }

      const scale = buildScale(stateRef.current.rootNote, stateRef.current.mode);
      const chord = harmonyRef.current.getCurrentChord();
      const chaosLvl = gestureRef.current?.getChaosLevel() ?? 0;
      const result = melodicCorrection({ pRaw: rawMapping.pRaw, pPrev: prevPitchRef.current, pPrevPrev: prevPrevPitchRef.current, scale, chord, m: melodicStability, chaosLevel: chaosLvl });
      const pitch = result.selectedPitch;
      const velMul = isAccent ? 1.3 : 1;
      const velocity = Math.min(127, Math.round(rawMapping.midiVelocity * velMul));
      const duration = sixteenthDuration * (1 + Math.random() * 0.5);

      prevPrevPitchRef.current = prevPitchRef.current;
      prevPitchRef.current = pitch;

      synthRef.current.playNote(pitch, velocity, duration);
      synthRef.current.setFilterCutoff(rawMapping.filterCutoff);
      gestureRef.current?.recordNoteOnset(performance.now());

      visualRef.current.updateCursor({ x, y, velocity: gestureState.velocity, pitch });
      visualRef.current.onNoteOn(x, y, pitch, velocity);

      if (loopRef.current) loopRef.current.addNote(pitch, velocity, duration);
      setState((s) => ({ ...s, currentPitch: pitch }));
    },
    [canvasRef],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      touchIdRef.current = touch.identifier;
      const { x, y } = canvasXYTouch(touch);
      processInputAt(x, y, true);

      // Second finger = chord strum
      if (e.touches.length >= 2 && synthRef.current && harmonyRef.current) {
        const chord = harmonyRef.current.getCurrentChord();
        const chordPitches = Array.from(chord.pitchClasses).map((pc) => pc + 60);
        const { bpm } = stateRef.current;
        const dur = (60 / bpm) / (QUANTIZE_DIVISION / 4) * QUANTIZE_DIVISION;
        synthRef.current.playChord(chordPitches, dur);
        synthRef.current.playBass(chord.root + 36, dur);
      }
    },
    [canvasXYTouch, processInputAt],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === touchIdRef.current) {
          const { x, y } = canvasXYTouch(e.touches[i]);
          processInputAt(x, y, false);
          break;
        }
      }
    },
    [canvasXYTouch, processInputAt],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      touchIdRef.current = null;
    },
    [],
  );

  // ─── Cleanup ───
  useEffect(() => {
    return () => {
      visualRef.current?.stop();
      synthRef.current?.dispose();
      recorderRef.current?.dispose();
      freezeRef.current?.dispose();
      trailerRef.current?.stop();
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
      applyScene,
      startRecording,
      stopRecording,
      setRecordingDuration,
      dismissRecording,
      setMeditationMode,
      setEternityMode,
      setGpuEffects,
      setElectricFlower,
      setParticleWaves,
      toggleEffect,
      toggleFreeze,
      triggerCinematicTrailer,
      cycleSymmetry,
      triggerCosmicZoom,
      playLoopReverse,
    } satisfies GestureSymphonyActions,
    handleMouseMove,
    handleMouseDown,
    handleMouseUp,
    handleContextMenu,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    availableModes: getAvailableModes(),
    availableRoots: getAvailableRoots(),
    availableProgressions: Object.entries(PROGRESSIONS).map(([key, val]) => ({
      key,
      name: val.name,
    })),
    availableInstruments: INSTRUMENT_PRESETS.map((p) => ({ id: p.id, name: p.name })),
  };
}
