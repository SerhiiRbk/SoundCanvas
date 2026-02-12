/**
 * Splash Screen — shown before audio context is started.
 *
 * Features a scene selector grid so users start with a curated preset.
 */

import React from 'react';
import { SceneSelector } from './SceneSelector';
import type { ScenePreset } from '../config/scenePresets';

interface SplashScreenProps {
  onStart: () => void;
  onStartWithScene: (preset: ScenePreset) => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onStart, onStartWithScene }) => {
  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <h1 style={styles.title}>Gesture Symphony</h1>
        <p style={styles.version}>2.0</p>
        <p style={styles.description}>
          Move your mouse to create music and light.
        </p>

        {/* Scene presets */}
        <p style={styles.pickLabel}>Pick a scene to begin</p>
        <SceneSelector onSelect={onStartWithScene} />

        {/* Fallback: start without preset */}
        <button style={styles.freeplayBtn} onClick={onStart}>
          or start with default settings
        </button>

        {/* Instructions */}
        <div style={styles.instructions}>
          <div style={styles.instructionItem}>
            <span style={styles.instructionKey}>X axis</span>
            <span style={styles.instructionValue}>Pitch</span>
          </div>
          <div style={styles.instructionItem}>
            <span style={styles.instructionKey}>Y axis</span>
            <span style={styles.instructionValue}>Octave</span>
          </div>
          <div style={styles.instructionItem}>
            <span style={styles.instructionKey}>Speed</span>
            <span style={styles.instructionValue}>Volume & particles</span>
          </div>
          <div style={styles.instructionItem}>
            <span style={styles.instructionKey}>Touch</span>
            <span style={styles.instructionValue}>2 fingers = chord strum</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    inset: 0,
    background: '#050510',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    overflowY: 'auto',
    padding: '40px 0',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    color: '#e0e0e0',
    fontFamily: "'Inter', -apple-system, sans-serif",
    maxWidth: 720,
    width: '100%',
  },
  title: {
    fontSize: 42,
    fontWeight: 300,
    letterSpacing: '-0.04em',
    color: '#fff',
    margin: 0,
    lineHeight: 1,
  },
  version: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.25)',
    fontWeight: 500,
    marginTop: 8,
    letterSpacing: '0.1em',
  },
  description: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 16,
    lineHeight: 1.5,
  },
  pickLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.35)',
    marginTop: 32,
    marginBottom: 16,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  freeplayBtn: {
    marginTop: 20,
    padding: '8px 20px',
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 12,
    fontFamily: "'Inter', -apple-system, sans-serif",
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  instructions: {
    marginTop: 40,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    width: '100%',
    maxWidth: 340,
  },
  instructionItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 16px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 8,
  },
  instructionKey: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    fontWeight: 500,
  },
  instructionValue: {
    fontSize: 12,
    color: 'rgba(167, 139, 250, 0.7)',
    fontWeight: 500,
  },
};
