/**
 * EmotionMapper — classify gesture stream into emotions and auto-adjust.
 *
 * Emotions: Calm, Joy, Tension, Chaos
 * Based on: energy, smoothness, density, chaos
 */

export type Emotion = 'calm' | 'joy' | 'tension' | 'chaos';

export interface EmotionState {
  emotion: Emotion;
  confidence: number;
  params: {
    reverb: number;
    delay: number;
    bloomStrength: number;
    colorShift: number;
    preferMinor: boolean;
  };
}

// EMA smoothing for stable emotion detection
const EMA_FACTOR = 0.08;

export class EmotionMapper {
  private enabled = false;
  private smoothEnergy = 0;
  private smoothSmoothness = 0.5;
  private smoothDensity = 0;
  private smoothChaos = 0;

  private currentEmotion: Emotion = 'calm';
  private confidence = 0;

  setEnabled(on: boolean): void { this.enabled = on; }
  isEnabled(): boolean { return this.enabled; }

  /**
   * Update with gesture features.
   * @param energy    0..1 (velocity avg)
   * @param smoothness 0..1 (inverse accel)
   * @param density   0..1 (note frequency)
   * @param chaos     0..1 (interval variance)
   */
  update(energy: number, smoothness: number, density: number, chaos: number): EmotionState {
    this.smoothEnergy += (energy - this.smoothEnergy) * EMA_FACTOR;
    this.smoothSmoothness += (smoothness - this.smoothSmoothness) * EMA_FACTOR;
    this.smoothDensity += (density - this.smoothDensity) * EMA_FACTOR;
    this.smoothChaos += (chaos - this.smoothChaos) * EMA_FACTOR;

    const e = this.smoothEnergy;
    const s = this.smoothSmoothness;
    const c = this.smoothChaos;

    // Classification
    const scores = {
      calm: (1 - e) * s * (1 - c),
      joy: e * s * (1 - c),
      tension: e * (1 - s) * c * 0.8,
      chaos: e * c * 1.2,
    };

    let best: Emotion = 'calm';
    let bestScore = 0;
    let total = 0;
    for (const [em, sc] of Object.entries(scores)) {
      total += sc;
      if (sc > bestScore) { bestScore = sc; best = em as Emotion; }
    }

    this.currentEmotion = best;
    this.confidence = total > 0 ? bestScore / total : 0;

    return this.getState();
  }

  getState(): EmotionState {
    const em = this.currentEmotion;
    return {
      emotion: em,
      confidence: this.confidence,
      params: {
        reverb: em === 'calm' ? 0.5 : em === 'tension' ? 0.2 : 0.3,
        delay: em === 'calm' ? 0.2 : em === 'joy' ? 0.15 : 0.1,
        bloomStrength: em === 'chaos' ? 1.5 : em === 'joy' ? 1.2 : 0.8,
        colorShift: em === 'tension' ? 30 : em === 'chaos' ? -20 : 0,
        preferMinor: em === 'tension' || em === 'chaos',
      },
    };
  }

  getCurrentEmotion(): Emotion { return this.currentEmotion; }
}
