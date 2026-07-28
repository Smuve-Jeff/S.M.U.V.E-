/**
 * Cubic Bezier curve utilities for S.M.U.V.E. 2.0 automation.
 * Provides bezier interpolation for smooth, professional-grade
 * automation curves with editable control points.
 */

/** A bezier control point in 2D (time, value) space */
export interface BezierControlPoint {
  /** Normalised time along the segment (0..1) */
  t: number;
  /** Value at that point */
  value: number;
  /** Left control handle offset (as fraction of segment width/time) */
  cpIn: { t: number; value: number };
  /** Right control handle offset */
  cpOut: { t: number; value: number };
}

/**
 * Bezier curve segment connecting two automation points.
 * Each point has in/out control handles for curve shaping.
 */
export interface BezierSegment {
  p0: { t: number; value: number };       // Start point
  p1: { t: number; value: number };       // Start control point (outgoing handle)
  p2: { t: number; value: number };       // End control point (incoming handle)
  p3: { t: number; value: number };       // End point
}

/**
 * Evaluate a cubic bezier at parameter u (0..1).
 * Returns the interpolated value (only Y axis, since X = time is parameterised).
 */
export function evaluateCubicBezier(segment: BezierSegment, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  const um = 1 - u;
  const um2 = um * um;
  const um3 = um2 * um;

  // Cubic bezier: B(u) = (1-u)^3*P0 + 3(1-u)^2*u*P1 + 3(1-u)*u^2*P2 + u^3*P3
  return (
    um3 * segment.p0.value +
    3 * um2 * u * segment.p1.value +
    3 * um * u2 * segment.p2.value +
    u3 * segment.p3.value
  );
}

/**
 * Find the bezier parameter u for a given time t using Newton-Raphson.
 * Since time is the X coordinate and we need to invert the bezier X(t),
 * we solve for u where Bx(u) = targetTime.
 */
export function bezierTimeToU(
  segment: BezierSegment,
  targetTime: number,
  tolerance = 0.0001,
  maxIter = 10
): number {
  let u = targetTime; // Initial guess
  for (let i = 0; i < maxIter; i++) {
    const u2 = u * u;
    const um = 1 - u;
    const um2 = um * um;

    // X coordinate at u: Bx(u)
    const bx =
      um2 * um * segment.p0.t +
      3 * um2 * u * segment.p1.t +
      3 * um * u2 * segment.p2.t +
      u * u2 * segment.p3.t;

    // Derivative dBx/du
    const dbx =
      -3 * um2 * segment.p0.t +
      3 * (um2 - 2 * um * u) * segment.p1.t +
      3 * (2 * um * u - u2) * segment.p2.t +
      3 * u2 * segment.p3.t;

    const diff = bx - targetTime;
    if (Math.abs(diff) < tolerance) return u;

    u = u - diff / (dbx || 1);
    u = Math.max(0, Math.min(1, u));
  }
  return u;
}

/**
 * Build a cubic bezier segment from two automation points with optional
 * control handle offsets for professional curve shaping.
 * 
 * Default handles produce a smooth monotonic curve (ease-in-out).
 */
export function buildBezierSegment(
  startTime: number,
  startValue: number,
  endTime: number,
  endValue: number,
  cpIn: { t: number; value: number } = { t: 0.25, value: 0 },
  cpOut: { t: number; value: number } = { t: 0.75, value: 0 }
): BezierSegment {
  const dt = endTime - startTime;
  const dv = endValue - startValue;

  return {
    p0: { t: startTime, value: startValue },
    p1: {
      t: startTime + cpIn.t * dt,
      value: startValue + cpIn.value * dv,
    },
    p2: {
      t: startTime + cpOut.t * dt,
      value: startValue + cpOut.value * dv,
    },
    p3: { t: endTime, value: endValue },
  };
}

/**
 * Create a default bezier segment with smooth ease-in-out handles.
 * These are the "professional default" curves used in Cubase/Logic.
 */
export function defaultBezierHandles(): { cpIn: { t: number; value: number }; cpOut: { t: number; value: number } } {
  return {
    cpIn: { t: 0.33, value: 0 },
    cpOut: { t: 0.67, value: 0 },
  };
}

/**
 * Interpolate a value between two automation points using cubic bezier.
 * Falls back to smoothstep if no bezier handles are provided.
 */
export function bezierInterpolate(
  startTime: number,
  startValue: number,
  endTime: number,
  endValue: number,
  ratio: number,
  handles?: { cpIn: { t: number; value: number }; cpOut: { t: number; value: number } }
): number {
  const segment = buildBezierSegment(
    startTime,
    startValue,
    endTime,
    endValue,
    handles?.cpIn ?? { t: 0.25, value: 0 },
    handles?.cpOut ?? { t: 0.75, value: 0 }
  );

  // Map ratio (0..1) to actual time within segment
  const targetTime = startTime + ratio * (endTime - startTime);
  const u = bezierTimeToU(segment, targetTime / (endTime || 1));
  return evaluateCubicBezier(segment, u);
}

/**
 * Pre-built bezier handle presets for common curve shapes.
 */
export const BezierPresets = {
  /** Linear (no curve) — equivalent to 'linear' mode */
  linear: { cpIn: { t: 0.0, value: 0 }, cpOut: { t: 1.0, value: 0 } },

  /** Ease-in (slow start, fast end) */
  easeIn: { cpIn: { t: 0.5, value: 0 }, cpOut: { t: 0.75, value: 0 } },

  /** Ease-out (fast start, slow end) */
  easeOut: { cpIn: { t: 0.25, value: 0 }, cpOut: { t: 0.5, value: 0 } },

  /** Ease-in-out (slow start, slow end, fast middle) */
  easeInOut: { cpIn: { t: 0.33, value: 0 }, cpOut: { t: 0.67, value: 0 } },

  /** Quick jump (steep start, level off) */
  quick: { cpIn: { t: 0.1, value: 0.2 }, cpOut: { t: 0.5, value: -0.1 } },

  /** Exponential rise */
  expoRise: { cpIn: { t: 0.0, value: 0.5 }, cpOut: { t: 0.8, value: 0 } },

  /** Exponential fall */
  expoFall: { cpIn: { t: 0.2, value: 0 }, cpOut: { t: 1.0, value: -0.5 } },
} as const;
