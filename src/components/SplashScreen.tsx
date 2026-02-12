/**
 * Splash Screen — shown before audio context is started (browser policy).
 */

import React from 'react';

interface SplashScreenProps {
  onStart: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onStart }) => {
  return (
    <div style={styles.container} onClick={onStart}>
      <div style={styles.content}>
        <h1 style={styles.title}>Gesture Symphony</h1>
        <p style={styles.version}>2.0</p>
        <p style={styles.description}>
          Move your mouse to create music and light.
        </p>
        <div style={styles.hint}>
          <div style={styles.ring} />
          <span>Click anywhere to begin</span>
        </div>
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
            <span style={styles.instructionKey}>Circles</span>
            <span style={styles.instructionValue}>Arpeggio mode</span>
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
    cursor: 'pointer',
    zIndex: 2000,
  },
  content: {
    textAlign: 'center' as const,
    color: '#e0e0e0',
    fontFamily: "'Inter', -apple-system, sans-serif",
    maxWidth: 400,
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
    marginTop: 24,
    lineHeight: 1.5,
  },
  hint: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 40,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.35)',
    animation: 'pulse 2s ease-in-out infinite',
  },
  ring: {
    width: 12,
    height: 12,
    borderRadius: '50%',
    border: '2px solid rgba(99, 102, 241, 0.6)',
    animation: 'pulse 2s ease-in-out infinite',
  },
  instructions: {
    marginTop: 48,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
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
