/**
 * Frame-locked export arithmetic.
 *
 * A real-time capture asks the canvas to hand over whatever it managed to
 * paint. That makes the file's cadence a side effect of render cost: a slow
 * 4K CGI frame can turn a requested 30fps master into a 3fps slideshow without
 * any error. The export path therefore owns a frame plan: an integer number of
 * frame slots at an exact interval. The recorder is asked for one frame per
 * slot, and the encoder is told the same rate so the delivered file keeps the
 * requested cadence even when a paint lands late.
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
