/**
 * Frame-locked export arithmetic.
 *
 * A real-time capture asks the canvas to hand over whatever it managed to
 * paint. That makes the file's cadence a side effect of render cost: a slow
 * 4K CGI frame can turn a requested 30fps master into a 3fps slideshow without
 * any error. The export path therefore owns a frame plan: an integer number of
 * frame slots at an exact interval. The frame-locked encoder steps the
 * timeline to each slot, paints that frame, and timestamps it from the slot
 * index, so a slow CGI frame costs render time instead of dropping cadence.
 *
 * The plan is deliberately pure so its frame count and timestamps can be
 * asserted without a browser or a GPU.
 */
export interface FrameLockPlan {
  /** Requested delivery rate, clamped to a usable positive integer. */
  fps: number;
  /** Whole frames in the requested window. */
  totalFrames: number;
  /** Exact slot interval in milliseconds. */
  frameIntervalMs: number;
  /** Requested window length in seconds. */
  durationSeconds: number;
}

export const MAX_FRAME_LOCK_FPS = 120;

export function createFrameLockPlan(
  durationSeconds: number,
  requestedFps: number,
): FrameLockPlan {
  const duration = Number.isFinite(durationSeconds)
    ? Math.max(0, durationSeconds)
    : 0;
  const fps = Number.isFinite(requestedFps)
    ? Math.max(1, Math.min(MAX_FRAME_LOCK_FPS, Math.round(requestedFps)))
    : 30;
  return {
    fps,
    // A non-zero window is always at least one frame. Rounding (rather than
    // flooring) keeps 0.05s at 30fps from becoming a zero-frame export.
    totalFrames: Math.max(1, Math.round(duration * fps)),
    frameIntervalMs: 1000 / fps,
    durationSeconds: duration,
  };
}

/** Zero-based time of a frame slot inside the requested window. */
export function frameTimeSeconds(plan: FrameLockPlan, frameIndex: number): number {
  const index = Number.isFinite(frameIndex)
    ? Math.max(0, Math.floor(frameIndex))
    : 0;
  return Math.min(plan.durationSeconds, index / plan.fps);
}

/**
 * Encoded timestamp for one frame slot, in microseconds.
 *
 * WebCodecs takes integer microseconds, so the timestamp is derived from the
 * slot index rather than accumulated in floating point. That keeps a 29.97fps
 * or 60fps master free of the drift a repeated `+= 1000 / fps` accumulates.
 */
export function frameTimestampMicros(
  plan: FrameLockPlan,
  frameIndex: number,
): number {
  return Math.round(frameTimeSeconds(plan, frameIndex) * 1_000_000);
}

/** Display duration of one encoded frame, in microseconds. */
export function frameDurationMicros(plan: FrameLockPlan): number {
  return Math.round(1_000_000 / plan.fps);
}

/** A keyframe every two seconds keeps seeking responsive without bloat. */
export function frameKeyInterval(plan: FrameLockPlan): number {
  return Math.max(1, Math.round(plan.fps * 2));
}

/** Progress from delivered frame slots, not from wall-clock elapsed time. */
export function frameProgressPercent(
  plan: FrameLockPlan,
  deliveredFrames: number,
): number {
  if (plan.totalFrames <= 0) return 0;
  const delivered = Number.isFinite(deliveredFrames)
    ? Math.max(0, Math.floor(deliveredFrames))
    : 0;
  return Math.max(
    0,
    Math.min(100, Math.round((delivered / plan.totalFrames) * 100)),
  );
}
