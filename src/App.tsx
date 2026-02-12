/**
 * Gesture Symphony 2.0 — Main Application
 *
 * gesture → melodicCorrection → harmonyEngine
 *   → synthEngine → visualEngine
 *   → optional AI Composer
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useGestureSymphony } from './hooks/useGestureSymphony';
import { ControlPanel } from './components/ControlPanel';
import { SplashScreen } from './components/SplashScreen';

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [started, setStarted] = useState(false);
  const [panelVisible, setPanelVisible] = useState(true);

  const {
    state,
    actions,
    handleMouseMove,
    availableModes,
    availableRoots,
    availableProgressions,
    availableInstruments,
  } = useGestureSymphony(canvasRef);

  // Set canvas to viewport size (1:1 pixel mapping)
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.width = window.innerWidth;
      canvasRef.current.height = window.innerHeight;
    }
  }, []);

  const handleStart = useCallback(async () => {
    setStarted(true);
    // Small delay to ensure canvas is mounted
    requestAnimationFrame(async () => {
      await actions.initialize();
    });
  }, [actions]);

  // Toggle panel with 'H' key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H') {
        setPanelVisible((v) => !v);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  if (!started) {
    return <SplashScreen onStart={handleStart} />;
  }

  return (
    <div style={styles.container}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        style={styles.canvas}
      />

      {panelVisible && (
        <ControlPanel
          state={state}
          actions={actions}
          availableModes={availableModes}
          availableRoots={availableRoots}
          availableProgressions={availableProgressions}
          availableInstruments={availableInstruments}
        />
      )}

      {/* Keyboard hint */}
      <div style={styles.keyHint}>
        Press <kbd style={styles.kbd}>H</kbd> to {panelVisible ? 'hide' : 'show'} controls
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    background: '#050510',
    cursor: 'none',
  },
  canvas: {
    display: 'block',
    width: '100vw',
    height: '100vh',
  },
  keyHint: {
    position: 'fixed',
    bottom: 16,
    left: 16,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.2)',
    fontFamily: "'Inter', -apple-system, sans-serif",
    zIndex: 999,
    pointerEvents: 'none',
  },
  kbd: {
    padding: '2px 6px',
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 4,
    fontSize: 10,
    fontFamily: 'monospace',
  },
};

export default App;
