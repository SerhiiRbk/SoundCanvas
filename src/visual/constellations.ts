/**
 * Constellations — realistic starfield background.
 *
 * When enabled, fills the screen with a static star field of varying
 * brightness, colour temperature, and size. Stars pulse gently in
 * sync with audio RMS. Pressing Space activates "warp drive" —
 * stars streak toward the viewer from a central vanishing point.
 */

interface Star {
  /** Normalised position on a unit circle around center (angle) */
  angle: number;
  /** Distance from center (0 = center, 1 = edge of screen diagonal) */
  dist: number;
  /** Base brightness 0..1 */
  brightness: number;
  /** Colour temperature — mapped to hue: 0 = warm orange, 1 = cool blue-white */
  temp: number;
  /** Base radius in px */
  radius: number;
  /** Individual twinkle phase offset */
  twinklePhase: number;
  /** Twinkle speed multiplier */
  twinkleSpeed: number;
  /** Z depth for warp (0 = far, 1 = near) */
  z: number;
}

const STAR_COUNT = 600;
const TWINKLE_BASE_SPEED = 1.5;

export class Constellations {
  private enabled = false;
  private stars: Star[] = [];
  private initialized = false;
  private warpActive = false;
  private warpSpeed = 0; // 0..1 smoothed

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on && !this.initialized) this.generateStars();
  }

  isEnabled(): boolean { return this.enabled; }

  setWarpDrive(on: boolean): void { this.warpActive = on; }
  isWarpActive(): boolean { return this.warpActive; }

  /** Legacy API — ignored in new starfield mode */
  addStar(_x: number, _y: number, _pitch: number, _chordIndex: number): void {
    // no-op: starfield is procedural
  }

  private generateStars(): void {
    this.stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      // Distribute more stars toward edges (sqrt for uniform area distribution)
      const dist = Math.sqrt(Math.random()) * 1.2;
      const brightness = 0.3 + Math.random() * 0.7;
      // Most stars are white-ish, some warm, some cool
      const tempRoll = Math.random();
      const temp = tempRoll < 0.15 ? Math.random() * 0.3 // warm (orange/red)
        : tempRoll < 0.3 ? 0.7 + Math.random() * 0.3   // cool (blue)
        : 0.4 + Math.random() * 0.2;                     // neutral (white)
      // Size: most are tiny, a few are larger
      const sizeRoll = Math.random();
      const radius = sizeRoll < 0.7 ? 0.4 + Math.random() * 0.6
        : sizeRoll < 0.92 ? 1.0 + Math.random() * 0.8
        : 1.8 + Math.random() * 1.2; // rare bright stars

      this.stars.push({
        angle,
        dist,
        brightness,
        temp,
        radius,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.5 + Math.random() * 2.0,
        z: Math.random(),
      });
    }
    this.initialized = true;
  }

  render(
    ctx: CanvasRenderingContext2D,
    w: number, h: number,
    rms = 0, low = 0, _high = 0, time = 0,
  ): void {
    if (!this.enabled) return;
    if (!this.initialized) this.generateStars();

    const cx = w / 2;
    const cy = h / 2;
    const diag = Math.hypot(cx, cy);
    const dt = 1 / 60; // approximate

    // Smooth warp speed
    const warpTarget = this.warpActive ? 1 : 0;
    this.warpSpeed += (warpTarget - this.warpSpeed) * (this.warpActive ? 0.04 : 0.025);

    // Audio pulse: stars brighten with RMS
    const rmsPulse = 1 + rms * 0.8 + low * 0.4;

    ctx.save();

    for (const star of this.stars) {
      // Warp: move stars toward viewer (decrease z, when z < 0 reset)
      if (this.warpSpeed > 0.01) {
        star.z -= this.warpSpeed * dt * (1.5 + star.z * 2);
        if (star.z <= 0) {
          star.z = 0.8 + Math.random() * 0.2;
          star.angle = Math.random() * Math.PI * 2;
          star.dist = 0.01 + Math.random() * 0.15;
          star.brightness = 0.3 + Math.random() * 0.7;
        }
      }

      // Perspective projection: closer stars are further from center
      const perspScale = this.warpSpeed > 0.01
        ? 1 / (star.z + 0.1)
        : 1;
      const projDist = star.dist * perspScale;

      const sx = cx + Math.cos(star.angle) * projDist * diag;
      const sy = cy + Math.sin(star.angle) * projDist * diag;

      // Skip if off screen
      if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;

      // Twinkle
      const twinkle = 0.6 + 0.4 * Math.sin(
        time * TWINKLE_BASE_SPEED * star.twinkleSpeed + star.twinklePhase,
      );

      const alpha = star.brightness * twinkle * rmsPulse;
      const clampedAlpha = Math.min(alpha, 1);

      // Size: grows when warping (closer = bigger)
      let r = star.radius;
      if (this.warpSpeed > 0.01) {
        r *= 1 + (perspScale - 1) * 0.3;
        r = Math.min(r, 6);
      }

      // Colour from temperature
      const col = starColor(star.temp, clampedAlpha);

      // Warp streaks
      if (this.warpSpeed > 0.15) {
        const streakLen = this.warpSpeed * perspScale * 12 * star.brightness;
        if (streakLen > 1) {
          const dx = Math.cos(star.angle);
          const dy = Math.sin(star.angle);
          ctx.strokeStyle = starColor(star.temp, clampedAlpha * 0.5);
          ctx.lineWidth = Math.max(0.5, r * 0.6);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + dx * streakLen, sy + dy * streakLen);
          ctx.stroke();
        }
      }

      // Glow halo for brighter stars
      if (r > 1.2 && clampedAlpha > 0.4) {
        const glowR = r * 3;
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
        grad.addColorStop(0, starColor(star.temp, clampedAlpha * 0.25));
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(sx - glowR, sy - glowR, glowR * 2, glowR * 2);
      }

      // Core dot
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.3, r), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

/** Map temperature 0..1 to an rgba string */
function starColor(temp: number, alpha: number): string {
  // temp 0 = warm (orange-ish), 0.5 = white, 1 = cool (blue-ish)
  let r: number, g: number, b: number;
  if (temp < 0.35) {
    // Warm: orange → yellow-white
    const t = temp / 0.35;
    r = 255;
    g = Math.round(180 + t * 60);
    b = Math.round(120 + t * 100);
  } else if (temp < 0.65) {
    // White
    r = 255;
    g = 250;
    b = 245;
  } else {
    // Cool: white → blue
    const t = (temp - 0.65) / 0.35;
    r = Math.round(220 - t * 60);
    g = Math.round(230 - t * 30);
    b = 255;
  }
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}
