/**
 * PulseLock — sync background + trails to user rhythm.
 *
 * When rhythm is strong, background pulses in sync with the detected BPM.
 */

export class PulseLock {
  private enabled = false;
  private rhythmStrength = 0;
  private period = 0.5; // seconds per beat
  private phase = 0;

  setEnabled(on: boolean): void { this.enabled = on; }
  isEnabled(): boolean { return this.enabled; }

  /** Update rhythm parameters from gesture analyzer */
  setRhythm(strength: number, periodSec: number): void {
    this.rhythmStrength = strength;
    if (periodSec > 0.1) this.period = periodSec;
  }

  /** Get current pulse value 0..1 for modulating visuals */
  getPulse(time: number): number {
    if (!this.enabled || this.rhythmStrength < 0.4) return 0;
    this.phase = (time % this.period) / this.period;
    // Smooth sine pulse
    const raw = 0.5 + 0.5 * Math.sin(this.phase * Math.PI * 2);
    return raw * Math.min(1, (this.rhythmStrength - 0.4) / 0.3);
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
    if (!this.enabled || this.rhythmStrength < 0.4) return;

    const pulse = this.getPulse(time);
    if (pulse < 0.01) return;

    const alpha = pulse * 0.08;
    ctx.save();
    ctx.fillStyle = `rgba(100, 140, 255, ${alpha})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}
