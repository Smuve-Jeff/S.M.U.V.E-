/**
 * Digital stabilization by translation estimation.
 *
 * Handheld footage shakes by a few pixels per frame. This module estimates
 * that frame-to-frame translation with block matching (sum-of-absolute-
 * differences search over a small window on downscaled grayscale) and
 * smooths it into a correction the renderer applies as a counter-translate,
 * plus a small auto-crop zoom so the shifted edges never show. Rotation and
 * rolling shutter are out of scope — translation is what handheld shake
 * mostly is, and what a 2D canvas can correct without a warp mesh.
 */

export interface StabilizationSettings {
  enabled: boolean;
  /** 0..1 — smoothing strength (higher = steadier, more drift). */
  strength: number;
  /** 0..1 — edge-crop zoom (0.04 ≈ 8% crop). */
  crop: number;
}
/** Whether rotation correction runs alongside translation. */
export const ROTATION_STABILIZATION = true;

export const DEFAULT_STABILIZATION: StabilizationSettings = {
  enabled: true,
  strength: 0.65,
  crop: 0.06,
};

export interface TranslationEstimate {
  /** Pixels the current frame moved relative to the previous one. */
  dx: number;
  dy: number;
  /** Mean SAD at the best shift (lower = more confident). */
  error: number;
}

/**
 * Block-match `curr` against `prev` (both grayscale, same size) over a
 * ±maxShift window. Returns the shift of `curr` relative to `prev`.
 */
export function estimateTranslation(
  prev: Uint8ClampedArray,
  curr: Uint8ClampedArray,
  width: number,
  height: number,
  maxShift = 6,
): TranslationEstimate {
  const n = width * height;
  if (!prev.length || prev.length !== n || curr.length !== n) {
    return { dx: 0, dy: 0, error: Infinity };
  }
  // Inner region only: edges are where the previous frame's content leaves.
  const margin = maxShift + 2;
  const x0 = margin;
  const y0 = margin;
  const x1 = width - margin;
  const y1 = height - margin;
  if (x1 <= x0 || y1 <= y0) return { dx: 0, dy: 0, error: Infinity };

  let best: TranslationEstimate = { dx: 0, dy: 0, error: Infinity };
  for (let dy = -maxShift; dy <= maxShift; dy++) {
    for (let dx = -maxShift; dx <= maxShift; dx++) {
      let sad = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        const row = y * width;
        for (let x = x0; x < x1; x++) {
          sad += Math.abs(curr[row + x] - prev[row + x + dx + dy * width]);
          count++;
        }
      }
      const mean = count ? sad / count : Infinity;
      if (mean < best.error) best = { dx, dy, error: mean };
    }
  }
  return best;
}

/**
 * One-pole smoothing of the correction. `correction` is the accumulated
 * counter-translation; the measured frame shift is subtracted (the frame
 * moved +dx, so we move it −dx), smoothed by `strength`.
 */
export function smoothCorrection(
  correction: { x: number; y: number },
  measured: TranslationEstimate,
  strength: number,
): { x: number; y: number } {
  const alpha = Math.max(0.05, Math.min(1, strength));
  return {
    x: correction.x + ((-measured.dx) - correction.x) * alpha,
    y: correction.y + ((-measured.dy) - correction.y) * alpha,
  };
}

/** Grayscale + downscale a raw RGBA buffer to width×height (nearest). */
export function toGrayscaleThumb(
  rgba: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  thumbWidth: number,
  thumbHeight: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(thumbWidth * thumbHeight);
  for (let ty = 0; ty < thumbHeight; ty++) {
    const sy = Math.min(srcHeight - 1, Math.floor((ty / thumbHeight) * srcHeight));
    for (let tx = 0; tx < thumbWidth; tx++) {
      const sx = Math.min(srcWidth - 1, Math.floor((tx / thumbWidth) * srcWidth));
      const i = (sy * srcWidth + sx) * 4;
      out[ty * thumbWidth + tx] = Math.round(
        0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2],
      );
    }
  }
  return out;
}

/**
 * Estimate in-plane rotation between two grayscale frames.
 *
 * Runs block matching on four quadrants: a rotation moves the top half one
 * way and the bottom half the other, so the differential of the two
 * vertical shifts over their separation is the angle. Returns degrees.
 */
export function estimateRotationDegrees(
  prev: Uint8ClampedArray,
  curr: Uint8ClampedArray,
  width: number,
  height: number,
  maxShift = 4,
): number {
  const n = width * height;
  if (prev.length !== n || curr.length !== n || width < 16 || height < 16) return 0;
  const match = (x0: number, y0: number, x1: number, y1: number) => {
    let best = { dx: 0, dy: 0, error: Infinity };
    for (let dy = -maxShift; dy <= maxShift; dy++) {
      for (let dx = -maxShift; dx <= maxShift; dx++) {
        let sad = 0;
        let count = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const cx = x + dx;
            const cy = y + dy;
            if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
            sad += Math.abs(curr[cy * width + cx] - prev[y * width + x]);
            count++;
          }
        }
        const mean = count ? sad / count : Infinity;
        if (mean < best.error) best = { dx, dy, error: mean };
      }
    }
    return best;
  };
  const hw = Math.floor(width / 2);
  const hh = Math.floor(height / 2);
  const margin = maxShift + 2;
  const top = match(margin, margin, width - margin, hh - margin);
  const bottom = match(margin, hh + margin, width - margin, height - margin);
  if (!Number.isFinite(top.error) || !Number.isFinite(bottom.error)) return 0;
  // Differential vertical shift over the quadrant separation ≈ tan(angle).
  const separation = Math.max(1, height - 2 * margin);
  const angle = Math.atan2(top.dy - bottom.dy, separation) * (180 / Math.PI);
  return Math.max(-10, Math.min(10, angle));
}

/** One-pole smoothing of a rotation correction (degrees). */
export function smoothRotation(
  correction: number,
  measuredDegrees: number,
  strength: number,
): number {
  const alpha = Math.max(0.05, Math.min(1, strength));
  return correction + (-measuredDegrees - correction) * alpha;
}

export function sanitizeStabilization(value: unknown): StabilizationSettings | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<StabilizationSettings>;
  const num = (v: unknown, fallback: number) =>
    Number.isFinite(v) ? Math.max(0, Math.min(1, v as number)) : fallback;
  return {
    enabled: raw.enabled === true,
    strength: num(raw.strength, DEFAULT_STABILIZATION.strength),
    crop: num(raw.crop, DEFAULT_STABILIZATION.crop),
  };
}
