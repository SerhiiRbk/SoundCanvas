/**
 * Control Panel — UI for all Gesture Symphony parameters.
 */

import React from 'react';
import type {
  GestureSymphonyState,
  GestureSymphonyActions,
} from '../hooks/useGestureSymphony';
import type { VisualModeName } from '../composer/composerTypes';

interface ControlPanelProps {
  state: GestureSymphonyState;
  actions: GestureSymphonyActions;
  availableModes: string[];
  availableRoots: string[];
  availableProgressions: { key: string; name: string }[];
  availableInstruments: { id: string; name: string }[];
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  state,
  actions,
  availableModes,
  availableRoots,
  availableProgressions,
  availableInstruments,
}) => {
  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <h2 style={styles.title}>Gesture Symphony</h2>
        <span style={styles.subtitle}>2.0</span>
      </div>

      {/* ─── Melodic Stability ─── */}
      <Section title="Melodic Stability">
        <div style={styles.sliderRow}>
          <span style={styles.label}>Chaos</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={state.melodicStability}
            onChange={(e) => actions.setMelodicStability(parseFloat(e.target.value))}
            style={styles.slider}
          />
          <span style={styles.label}>Stable</span>
        </div>
        <div style={styles.value}>{state.melodicStability.toFixed(2)}</div>
      </Section>

      {/* ─── Key & Scale ─── */}
      <Section title="Key & Scale">
        <div style={styles.row}>
          <select
            value={state.rootNote}
            onChange={(e) => actions.setRootNote(e.target.value)}
            style={styles.select}
          >
            {availableRoots.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select
            value={state.mode}
            onChange={(e) => actions.setMode(e.target.value)}
            style={styles.select}
          >
            {availableModes.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </Section>

      {/* ─── Instrument ─── */}
      <Section title="Instrument">
        <select
          value={state.instrument}
          onChange={(e) => actions.setInstrument(e.target.value)}
          style={{ ...styles.select, width: '100%' }}
        >
          {availableInstruments.map((inst) => (
            <option key={inst.id} value={inst.id}>{inst.name}</option>
          ))}
        </select>

        {/* ── Sampler toggle ── */}
        <div style={styles.samplerRow}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={state.sampler.enabled}
              onChange={(e) => actions.setSamplerEnabled(e.target.checked)}
            />
            <span style={styles.checkboxText}>Use Samples</span>
          </label>
          <span style={styles.samplerStatus}>
            {state.sampler.enabled
              ? state.sampler.loading
                ? 'Loading...'
                : state.sampler.ready
                  ? 'Active'
                  : state.sampler.unavailable
                    ? 'N/A'
                    : ''
              : ''}
          </span>
        </div>
      </Section>

      {/* ─── Ensemble Mix ─── */}
      <Section title="Ensemble Mix">
        <div style={styles.ensembleHint}>
          Add up to 3 instruments (auto-voiced)
        </div>
        <div style={styles.ensembleList}>
          {availableInstruments
            .filter((inst) => inst.id !== state.instrument) // exclude lead
            .map((inst) => {
              const voice = state.ensemble.find((v) => v.instrumentId === inst.id);
              const isActive = !!voice;
              const isFull = !isActive && state.ensemble.length >= 3;
              return (
                <label
                  key={inst.id}
                  style={{
                    ...styles.ensembleItem,
                    ...(isFull ? styles.ensembleItemDisabled : {}),
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isActive}
                    disabled={isFull}
                    onChange={() => actions.toggleEnsembleVoice(inst.id)}
                  />
                  <span style={styles.ensembleName}>{inst.name}</span>
                  {isActive && (
                    <span style={styles.ensembleRole}>{voice!.roleLabel}</span>
                  )}
                </label>
              );
            })}
        </div>
      </Section>

      {/* ─── Progression ─── */}
      <Section title="Chord Progression">
        <select
          value={state.progression}
          onChange={(e) => actions.setProgression(e.target.value)}
          style={{ ...styles.select, width: '100%' }}
        >
          {availableProgressions.map((p) => (
            <option key={p.key} value={p.key}>{p.name}</option>
          ))}
        </select>
        <div style={styles.chordDisplay}>
          <span style={styles.chordLabel}>Current:</span>
          <span style={styles.chordName}>{state.currentChord}</span>
        </div>
      </Section>

      {/* ─── BPM ─── */}
      <Section title="BPM">
        <div style={styles.sliderRow}>
          <span style={styles.label}>100</span>
          <input
            type="range"
            min="100"
            max="120"
            step="1"
            value={state.bpm}
            onChange={(e) => actions.setBPM(parseInt(e.target.value))}
            style={styles.slider}
          />
          <span style={styles.label}>120</span>
        </div>
        <div style={styles.value}>{state.bpm}</div>
      </Section>

      {/* ─── Visual Mode ─── */}
      <Section title="Visual Mode">
        <div style={styles.buttonRow}>
          {(['chill', 'cinematic', 'neon'] as VisualModeName[]).map((mode) => (
            <button
              key={mode}
              onClick={() => actions.setVisualMode(mode)}
              style={{
                ...styles.modeButton,
                ...(state.visualMode === mode ? styles.modeButtonActive : {}),
              }}
            >
              {mode}
            </button>
          ))}
        </div>
      </Section>

      {/* ─── Loop ─── */}
      <Section title="Loop">
        <div style={styles.buttonRow}>
          <button
            onClick={actions.startLoop}
            style={{
              ...styles.loopButton,
              ...(state.loopState === 'recording' ? styles.recordingButton : {}),
            }}
          >
            {state.loopState === 'idle' ? '⏺ Rec' : state.loopState === 'recording' ? '⏹ Stop' : '⏺ Rec'}
          </button>
          <button onClick={actions.stopLoop} style={styles.loopButton}>
            ⏹
          </button>
          <button onClick={actions.overdubLoop} style={styles.loopButton}>
            ⊕
          </button>
          <button onClick={actions.clearLoop} style={styles.loopButton}>
            ✕
          </button>
        </div>
        <div style={styles.value}>
          {state.loopState}
        </div>
      </Section>

      {/* ─── Reel Mode ─── */}
      <Section title="Export Mode">
        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={state.reelMode}
            onChange={(e) => actions.setReelMode(e.target.checked)}
          />
          <span style={styles.checkboxText}>9:16 Vertical Reel</span>
        </label>
      </Section>

      {/* ─── Debug Info ─── */}
      <div style={styles.debug}>
        <span>Particles: {state.particleCount}</span>
        <span>Pitch: {state.currentPitch}</span>
      </div>
    </div>
  );
};

// ─── Section Component ───

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div style={styles.section}>
    <div style={styles.sectionTitle}>{title}</div>
    {children}
  </div>
);

// ─── Styles ───

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'fixed',
    top: 0,
    right: 0,
    width: 280,
    height: '100vh',
    background: 'rgba(5, 5, 16, 0.85)',
    backdropFilter: 'blur(20px)',
    borderLeft: '1px solid rgba(255, 255, 255, 0.06)',
    color: '#e0e0e0',
    fontFamily: "'Inter', -apple-system, sans-serif",
    fontSize: 13,
    overflowY: 'auto',
    padding: '16px',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 8,
    paddingBottom: 12,
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: '-0.02em',
    color: '#fff',
  },
  subtitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.35)',
    fontWeight: 500,
  },
  section: {
    padding: '10px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: 'rgba(255, 255, 255, 0.4)',
    marginBottom: 8,
  },
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  slider: {
    flex: 1,
    accentColor: '#6366f1',
    height: 4,
  },
  label: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.35)',
    minWidth: 30,
  },
  value: {
    textAlign: 'center' as const,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 4,
  },
  row: {
    display: 'flex',
    gap: 8,
  },
  select: {
    flex: 1,
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
    color: '#e0e0e0',
    padding: '6px 8px',
    fontSize: 12,
    outline: 'none',
    cursor: 'pointer',
  },
  buttonRow: {
    display: 'flex',
    gap: 6,
  },
  modeButton: {
    flex: 1,
    padding: '6px 10px',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 11,
    cursor: 'pointer',
    textTransform: 'capitalize' as const,
    transition: 'all 0.15s',
  },
  modeButtonActive: {
    background: 'rgba(99, 102, 241, 0.3)',
    borderColor: 'rgba(99, 102, 241, 0.5)',
    color: '#fff',
  },
  loopButton: {
    flex: 1,
    padding: '6px',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  recordingButton: {
    background: 'rgba(239, 68, 68, 0.3)',
    borderColor: 'rgba(239, 68, 68, 0.5)',
    color: '#ef4444',
  },
  chordDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    padding: '6px 10px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 6,
  },
  chordLabel: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.35)',
  },
  chordName: {
    fontSize: 14,
    fontWeight: 600,
    color: '#a78bfa',
  },
  samplerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  samplerStatus: {
    fontSize: 10,
    fontStyle: 'italic' as const,
    color: 'rgba(163, 130, 250, 0.7)',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
  },
  checkboxText: {
    fontSize: 12,
  },
  ensembleHint: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.3)',
    marginBottom: 6,
    fontStyle: 'italic' as const,
  },
  ensembleList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    maxHeight: 180,
    overflowY: 'auto' as const,
  },
  ensembleItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 6px',
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  ensembleItemDisabled: {
    opacity: 0.35,
    cursor: 'default',
  },
  ensembleName: {
    flex: 1,
    fontSize: 12,
  },
  ensembleRole: {
    fontSize: 10,
    fontWeight: 600,
    color: '#a78bfa',
    background: 'rgba(167, 139, 250, 0.12)',
    padding: '2px 6px',
    borderRadius: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  debug: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.25)',
    fontFamily: 'monospace',
  },
};
