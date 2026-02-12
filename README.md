# Gesture Symphony 2.0

An audiovisual instrument that transforms mouse movement into melodic music with real-time generative visual art.

## Architecture

```
gesture → melodicCorrection → harmonyEngine
  → synthEngine → visualEngine
  → optional AI Composer
```

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:5173 and click to begin. Move your mouse across the canvas to create music and light.

## Controls

| Input | Musical Parameter |
|-------|-------------------|
| X axis | Pitch |
| Y axis | Octave |
| Speed | Volume & particles |
| Circular motion | Arpeggio mode |
| Acceleration | Filter cutoff |

Press **H** to toggle the control panel.

## Project Structure

```
src/
├── music/
│   ├── scale.ts              # Scale definitions, pitch utilities
│   ├── costFunction.ts       # J(p) cost function with 6 components
│   ├── melodicCorrection.ts  # Softmax probabilistic note selection
│   ├── phraseOptimizer.ts    # Viterbi DP phrase optimization (H=8)
│   ├── harmonyEngine.ts      # Chord progressions, diatonic chords
│   ├── voiceLeading.ts       # Voice leading solver (min Σ|Δ| + crossings)
│   └── melodicScore.ts       # Melodic quality validator & auto-correction
├── gesture/
│   └── gestureAnalyzer.ts    # Mouse → raw musical parameters
├── audio/
│   ├── synthEngine.ts        # Tone.js synth (lead, pad, bass) + FFT analysis
│   └── loopEngine.ts         # Record / play / overdub / clear
├── visual/
│   ├── visualEngine.ts       # 6-layer render pipeline orchestrator
│   ├── particleSystem.ts     # Object-pooled particle system (max 500)
│   ├── trailRenderer.ts      # Exponential-decay gradient trails
│   ├── colorMapping.ts       # Pitch → HSL color, stability adjustments
│   └── postProcessing.ts     # Multi-pass bloom (Canvas 2D)
├── composer/
│   ├── composerTypes.ts      # All shared TypeScript interfaces
│   └── composerClient.ts     # AI Composer API stub
├── hooks/
│   └── useGestureSymphony.ts # Main integration hook
├── components/
│   ├── ControlPanel.tsx       # Settings UI
│   └── SplashScreen.tsx       # Welcome screen
├── config.ts                  # All constants (no magic numbers)
├── App.tsx                    # Root component
└── main.tsx                   # Entry point
```

## Music Engine

### Melodic Correction (Cost Function)

Every quantized 1/16 step, a note is selected by minimizing:

```
J(p) = w_raw(m)·|p − p_raw|
     + w_step(m)·|p − p_prev|
     + w_leap(m)·D_leap
     + w_tonic(m)·D_tonic
     + w_chord(m)·D_chord
     + w_repeat(m)·D_repeat
```

Selection uses softmax with temperature τ(m) = 0.5 + 2(1 − m).

### Harmony

- 7 chord progressions (Pop, Jazz, Minor, Classic, Rock, Emotional, Modal)
- Voice leading solver minimizes Σ|Δ_voice| + 10·crossings
- Chord changes every 2 bars

### Scales

10 scale modes: major, minor, dorian, mixolydian, phrygian, lydian, harmonic minor, melodic minor, pentatonic major, pentatonic minor.

## Visual Engine

6-layer Canvas 2D rendering pipeline:

1. **Background** — dark base + audio-reactive ambient glow
2. **Ripples** — radial waves on noteOn events
3. **Trail Renderer** — exponential-decay light trails with additive blending
4. **Particle System** — burst particles on noteOn (pooled, max 500)
5. **Cursor Light Core** — velocity-responsive glowing cursor
6. **Post Processing** — multi-pass bloom

### Visual Presets

- **Chill** — slow trails, soft colors, subtle bloom
- **Cinematic** — strong bloom, dark tones, large particles
- **Neon** — vivid colors, fast particles, aggressive glow

### Melodic Stability ↔ Visual

- m → 1: smooth lines, fewer particles, muted colors
- m → 0: more particles, sharp flashes, high contrast

## Stack

- React + TypeScript
- Tone.js (WebAudio)
- Canvas 2D with requestAnimationFrame
- Vite
