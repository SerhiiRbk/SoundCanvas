/**
 * Recording HUD — minimal floating controls for video capture.
 *
 * Shows:
 *  - Duration selector (15/30/60)
 *  - Record / Stop button
 *  - Live timer during recording
 *  - Countdown overlay (3-2-1)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { RecordingState } from '../audio/recordingEngine';

interface RecordingHUDProps {
  recordingState: RecordingState;
  elapsed: number; // seconds
  maxDuration: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onSetDuration: (seconds: number) => void;
  onCountdownComplete: () => void;
}

const DURATION_OPTIONS = [15, 30, 60];

export const RecordingHUD: React.FC<RecordingHUDProps> = ({
  recordingState,
  elapsed,
  maxDuration,
  onStartRecording,
  onStopRecording,
  onSetDuration,
  onCountdownComplete,
}) => {
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const beginCountdown = useCallback(() => {
    setCountdown(3);
  }, []);

  // Countdown tick
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      onCountdownComplete();
      return;
    }
    countdownRef.current = setTimeout(() => {
      setCountdown((c) => (c !== null ? c - 1 : null));
    }, 800);
    return () => {
      if (countdownRef.current) clearTimeout(countdownRef.current);
    };
  }, [countdown, onCountdownComplete]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Countdown overlay
  if (countdown !== null && countdown > 0) {
    return (
      <div style={styles.countdownOverlay}>
        <span style={styles.countdownNumber}>{countdown}</span>
      </div>
    );
  }

  const isRecording = recordingState === 'recording';
  const isProcessing = recordingState === 'processing';

  return (
    <div style={styles.hud}>
      {/* Duration selector (only when idle) */}
      {!isRecording && !isProcessing && (
        <div style={styles.durationRow}>
          {DURATION_OPTIONS.map((d) => (
            <button
              key={d}
              style={{
                ...styles.durationBtn,
                ...(maxDuration === d ? styles.durationBtnActive : {}),
              }}
              onClick={() => onSetDuration(d)}
            >
              {d}s
            </button>
          ))}
        </div>
      )}

      {/* Record / Stop button */}
      {isRecording ? (
        <div style={styles.recordingRow}>
          <div style={styles.redDot} />
          <span style={styles.timer}>{formatTime(elapsed)} / {formatTime(maxDuration)}</span>
          <button style={styles.stopBtn} onClick={onStopRecording}>
            Stop
          </button>
        </div>
      ) : isProcessing ? (
        <span style={styles.processingText}>Saving...</span>
      ) : (
        <button style={styles.recBtn} onClick={beginCountdown}>
          Rec
        </button>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  hud: {
    position: 'fixed',
    top: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    zIndex: 1100,
    pointerEvents: 'auto',
  },
  durationRow: {
    display: 'flex',
    gap: 4,
  },
  durationBtn: {
    padding: '4px 12px',
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 11,
    fontFamily: "'Inter', -apple-system, sans-serif",
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  durationBtnActive: {
    background: 'rgba(99, 102, 241, 0.3)',
    borderColor: 'rgba(99, 102, 241, 0.5)',
    color: '#fff',
  },
  recBtn: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: 'rgba(239, 68, 68, 0.8)',
    border: '3px solid rgba(255, 255, 255, 0.3)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "'Inter', -apple-system, sans-serif",
    cursor: 'pointer',
    transition: 'all 0.15s',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  recordingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 16px',
    background: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(12px)',
    borderRadius: 24,
    border: '1px solid rgba(239, 68, 68, 0.4)',
  },
  redDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: '#ef4444',
    animation: 'pulse 1s ease-in-out infinite',
  },
  timer: {
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'monospace',
    color: '#fff',
    minWidth: 90,
    textAlign: 'center' as const,
  },
  stopBtn: {
    padding: '4px 14px',
    background: 'rgba(239, 68, 68, 0.6)',
    border: 'none',
    borderRadius: 16,
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "'Inter', -apple-system, sans-serif",
    cursor: 'pointer',
  },
  processingText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: "'Inter', -apple-system, sans-serif",
    fontStyle: 'italic',
  },
  countdownOverlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1200,
    pointerEvents: 'none',
  },
  countdownNumber: {
    fontSize: 120,
    fontWeight: 200,
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: "'Inter', -apple-system, sans-serif",
    textShadow: '0 0 40px rgba(99, 102, 241, 0.4)',
  },
};
