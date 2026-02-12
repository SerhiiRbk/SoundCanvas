/**
 * Gesture Symphony 2.0 — Main Application
 *
 * gesture -> melodicCorrection -> harmonyEngine
 *   -> synthEngine -> visualEngine
 *   -> optional AI Composer
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useGestureSymphony } from './hooks/useGestureSymphony';
import { ControlPanel } from './components/ControlPanel';
import { SplashScreen } from './components/SplashScreen';
import { RecordingHUD } from './components/RecordingHUD';
import { ShareOverlay } from './components/ShareOverlay';
import type { ScenePreset } from './config/scenePresets';

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [started, setStarted] = useState(false);
  const [panelVisible, setPanelVisible] = useState(true);
  const [performanceMode, setPerformanceMode] = useState(false);
  const pendingSceneRef = useRef<ScenePreset | null>(null);

  const {
    state,
    actions,
    handleMouseMove,
    handleMouseDown,
    handleMouseUp,
    handleContextMenu,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
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
    requestAnimationFrame(async () => {
      await actions.initialize();
      // Apply pending scene preset after init
      if (pendingSceneRef.current) {
        // Small delay to ensure engines are wired
        setTimeout(() => {
          if (pendingSceneRef.current) {
            actions.applyScene(pendingSceneRef.current);
            pendingSceneRef.current = null;
          }
        }, 100);
      }
    });
  }, [actions]);

  const handleStartWithScene = useCallback((preset: ScenePreset) => {
    pendingSceneRef.current = preset;
    handleStart();
  }, [handleStart]);

  // Keyboard shortcuts: H = panel, P = performance mode, M = meditation, E = eternity
  const meditationRef = useRef(state.meditationMode);
  meditationRef.current = state.meditationMode;
  const eternityRef = useRef(state.eternityMode);
  eternityRef.current = state.eternityMode;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H') {
        setPanelVisible((v) => !v);
      }
      if (e.key === 'p' || e.key === 'P') {
        setPerformanceMode((v) => !v);
      }
      if (e.key === 'm' || e.key === 'M') {
        actions.setMeditationMode(!meditationRef.current);
      }
      if (e.key === 'e' || e.key === 'E') {
        actions.setEternityMode(!eternityRef.current);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [actions]);

  // In performance mode: hide panel
  const showPanel = panelVisible && !performanceMode;
  const showHints = !performanceMode;

  if (!started) {
    return (
      <SplashScreen
        onStart={handleStart}
        onStartWithScene={handleStartWithScene}
      />
    );
  }

  return (
    <div style={styles.container}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={styles.canvas}
      />

      {/* Recording HUD (always visible when initialized) */}
      {state.isInitialized && (
        <RecordingHUD
          recordingState={state.recording}
          elapsed={state.recordingElapsed}
          maxDuration={state.recordingMaxDuration}
          onStartRecording={actions.startRecording}
          onStopRecording={actions.stopRecording}
          onSetDuration={actions.setRecordingDuration}
          onCountdownComplete={actions.startRecording}
        />
      )}

      {/* Share overlay (after recording completes) */}
      {state.recordingBlob && (
        <ShareOverlay
          blob={state.recordingBlob}
          onNewRecording={() => {
            actions.dismissRecording();
          }}
          onClose={() => {
            actions.dismissRecording();
          }}
        />
      )}

      {/* Control Panel */}
      {showPanel && (
        <ControlPanel
          state={state}
          actions={actions}
          availableModes={availableModes}
          availableRoots={availableRoots}
          availableProgressions={availableProgressions}
          availableInstruments={availableInstruments}
          performanceMode={performanceMode}
          onTogglePerformanceMode={() => setPerformanceMode((v) => !v)}
        />
      )}

      {/* Keyboard hints */}
      {showHints && (
        <div style={styles.keyHint}>
          <kbd style={styles.kbd}>H</kbd> controls
          {' '}
          <kbd style={styles.kbd}>P</kbd> performance
          {' '}
          <kbd style={styles.kbd}>M</kbd> meditation
          {' '}
          <kbd style={styles.kbd}>E</kbd> eternity
        </div>
      )}
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
    touchAction: 'none', // prevent default touch gestures
  },
  canvas: {
    display: 'block',
    width: '100vw',
    height: '100vh',
    touchAction: 'none',
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
