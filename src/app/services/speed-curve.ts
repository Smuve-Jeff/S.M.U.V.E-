/**
 * Speed curves (speed ramps) — a clip's playback rate as a function of its
 * own timeline position, instead of one constant multiplier.
 *
 * CapCut / LumaFusion ship this as "velocity ramps": hold, ease into a
 * 4× swoosh, settle back to 1×. The curve is a sorted list of
 * `{ time, speed }` points (clip-local seconds, piecewise linear between
 * them). The source time is the *integral* of the curve, so a ramp that
 * speeds up then slows down still lands on the right source frame.
 */

export interface SpeedCurvePoint {
  /** Clip-local time in seconds. */
  time: number;
  /** Playback rate at that time (0.1..8). */
  speed: number;
}

export const MIN_CURVE_SPEED = 0.1;
export const MAX_CURVE_SPEED = 8;

export function clampCurveSpeed(speed: number): number {
  return Number.isFinite(speed)
    ? Math.max(MIN_CURVE_SPEED, Math.min(MAX_CURVE_SPEED, speed))
    : 1;
}

export function sortSpeedCurve(points: SpeedCurvePoint[]): SpeedCurvePoint[] {
  return [...points]
    .filter((p) => p && Number.isFinite(p.time) && Number.isFinite(p.speed))
    .map((p) => ({ time: Math.max(0, p.time), speed: clampCurveSpeed(p.speed) }))
    .sort((a, b) => a.time - b.time);
}

/** Rate at a clip-local time. Holds the first/last value outside the range. */
export function evaluateSpeedCurve(
  curve: SpeedCurvePoint[] | undefined,
  clipLocalTime: number,
  fallback = 1,
): number {
  if (!curve?.length) return clampCurveSpeed(fallback);
  const points = sortSpeedCurve(curve);
  const t = Math.max(0, clipLocalTime);
  if (t <= points[0].time) return points[0].speed;
  const last = points[points.length - 1];
  if (t >= last.time) return last.speed;
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    if (t >= from.time && t <= to.time) {
      const span = to.time - from.time;
      const progress = span <= 0 ? 0 : (t - from.time) / span;
      return from.speed + (to.speed - from.speed) * progress;
    }
  }
  return last.speed;
}

/**
 * Source seconds consumed after `clipLocalTime` seconds of clip time:
 * the integral of the rate curve (trapezoid per segment). With no curve
 * this is `clipLocalTime * fallback`, matching the old constant-rate math.
 */
export function sourceSecondsForClipTime(
  curve: SpeedCurvePoint[] | undefined,
  clipLocalTime: number,
  fallback = 1,
): number {
  const t = Math.max(0, clipLocalTime);
  if (!curve?.length) return t * clampCurveSpeed(fallback);
  const points = sortSpeedCurve(curve);
  let seconds = 0;
  let prevTime = 0;
  let prevSpeed = points[0].speed;
  // Before the first point the first rate holds.
  seconds += Math.min(t, points[0].time) * prevSpeed;
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    if (t <= from.time) return seconds;
    const segmentEnd = Math.min(t, to.time);
    seconds += ((from.speed + evaluateSpeedCurve(points, segmentEnd)) / 2) *
      (segmentEnd - from.time);
    prevTime = to.time;
    prevSpeed = to.speed;
    void prevTime;
    void prevSpeed;
  }
  const last = points[points.length - 1];
  if (t > last.time) seconds += (t - last.time) * last.speed;
  return seconds;
}

/** Drop malformed points from restored records. */
export function sanitizeSpeedCurve(value: unknown): SpeedCurvePoint[] {
  if (!Array.isArray(value)) return [];
  return sortSpeedCurve(value as SpeedCurvePoint[]);
}

export function hasSpeedCurve(curve: SpeedCurvePoint[] | undefined): boolean {
  return Array.isArray(curve) && curve.length > 0;
}
