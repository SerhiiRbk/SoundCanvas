/**
 * Scene Selector — grid of curated presets.
 * Used on the splash screen and optionally in the control panel.
 */

import React from 'react';
import { SCENE_PRESETS, type ScenePreset } from '../config/scenePresets';

interface SceneSelectorProps {
  onSelect: (preset: ScenePreset) => void;
  compact?: boolean; // smaller cards for control panel
}

export const SceneSelector: React.FC<SceneSelectorProps> = ({ onSelect, compact }) => {
  return (
    <div style={compact ? cs.grid : s.grid}>
      {SCENE_PRESETS.map((preset) => (
        <button
          key={preset.id}
          style={compact ? cs.card : s.card}
          onClick={() => onSelect(preset)}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(99, 102, 241, 0.5)';
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99, 102, 241, 0.12)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255, 255, 255, 0.08)';
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.04)';
          }}
        >
          <span style={compact ? cs.name : s.name}>{preset.name}</span>
          {!compact && <span style={s.desc}>{preset.description}</span>}
        </button>
      ))}
    </div>
  );
};

/* ── Splash screen styles ── */
const s: Record<string, React.CSSProperties> = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 12,
    maxWidth: 700,
    width: '100%',
    padding: '0 20px',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '14px 16px',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    color: '#e0e0e0',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'all 0.15s',
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  name: {
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
  },
  desc: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.4)',
    lineHeight: '1.3',
  },
};

/* ── Compact styles (control panel) ── */
const cs: Record<string, React.CSSProperties> = {
  grid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 4,
  },
  card: {
    padding: '5px 10px',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
    color: '#e0e0e0',
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontFamily: "'Inter', -apple-system, sans-serif",
    fontSize: 11,
  },
  name: {
    fontSize: 11,
    fontWeight: 500,
  },
};
