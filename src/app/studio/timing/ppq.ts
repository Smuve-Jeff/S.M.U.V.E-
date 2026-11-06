/**
 * Canonical PPQ (pulses per quarter note) timing for the Studio sequencer.
 *
 * The editor still addresses notes in 16th-note steps, because that is the
 * grid artists draw on. Playback, however, must not derive every event from a
 * rounded step duration: triplets and swung offsets are exact fractions of a
 * beat, and converting them through milliseconds loses that relationship at
 * some tempos.
 *
 * One step is 240 ticks at 960 PPQ, so:
 *   - a 1/16 triplet is 160 ticks (2/3 of a step)
 *   - a 1/8 triplet is 320 ticks (4/3 of a step)
 *   - a 1/32 note is 120 ticks (1/2 of a step)
 *   - 50% swing on a 16th is 120 ticks (1/2 of a step)
 *
 * Every schedule boundary converts steps → integer ticks once, then ticks →
 * seconds using the current step's `secondsPerTick`. The tick relationship is
 * therefore preserved at any BPM instead of being re-rounded per tempo.
 */

/** Ticks per quarter note. Divisible by 2, 3, 4, 5, 6, 8 and 12. */
export const PPQ = 960;

/** The editor's step grid is 16th notes, four per quarter. */
export const STEPS_PER_BEAT = 4;

/** Ticks in one editor step (a 16th note). */
export const TICKS_PER_STEP = PPQ / STEPS_PER_BEAT;

/** Ticks in a 4/4 bar. */
export const TICKS_PER_BAR = PPQ * STEPS_PER_BEAT;

/** Common note values expressed on the tick grid. */
export const PPQ_TICKS = {
  whole: PPQ * 4,
  half: PPQ * 2,
  quarter: PPQ,
  dottedQuarter: PPQ * 1.5,
  eighth: PPQ / 2,
  dottedEighth: PPQ * 0.75,
  eighthTriplet: PPQ / 3,
  sixteenth: PPQ / 4,
  dottedSixteenth: PPQ * 0.375,
  sixteenthTriplet: PPQ / 6,
  thirtySecond: PPQ / 8,
} as const;

/** Global swing is expressed as a 0..1 fraction of a step. */
export const MAX_SWING = 1;

/** Timing context for one transport step. */
export interface StepTiming {
  /** Raw transport step this context belongs to. */
  readonly step: number;
  /** Absolute tick at the start of the step. */
  readonly stepStartTick: number;
  /** Ticks in one editor step (240 at 960 PPQ). */
  readonly ticksPerStep: number;
  /** Seconds per tick at the step's starting tempo. */
  readonly secondsPerTick: number;
  /** BPM at the start of the step. */
  readonly bpmStart: number;
  /** BPM at the next step boundary (differs during a ramp). */
  readonly bpmEnd: number;
  /** Exact seconds from the step start to a tick offset. */
  readonly secondsAtOffset: (offsetTicks: number) => number;
  /** Exact seconds between two tick offsets in or after this step. */
  readonly secondsBetweenOffsets: (
    fromTicks: number,
    toTicks: number,
  ) => number;
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

/** Convert editor steps to the nearest canonical tick. */
export function stepsToTicks(steps: number): number {
  return Math.round(finite(steps) * TICKS_PER_STEP);
}

/** Convert ticks back to editor steps (may be fractional). */
export function ticksToSteps(ticks: number): number {
  return finite(ticks) / TICKS_PER_STEP;
}

/** Seconds per tick for a tempo, without touching a step duration. */
export function secondsPerTickAtBpm(bpm: number, ppq: number = PPQ): number {
  const safeBpm = Math.max(1, finite(bpm, 120));
  return 60 / safeBpm / Math.max(1, ppq);
}

/** Convert ticks to seconds at a tempo. */
export function ticksToSecondsAtBpm(
  ticks: number,
  bpm: number,
  ppq: number = PPQ,
): number {
  return finite(ticks) * secondsPerTickAtBpm(bpm, ppq);
}

/** Convert seconds to the nearest tick at a tempo. */
export function secondsToTicks(
  seconds: number,
  bpm: number,
  ppq: number = PPQ,
): number {
  return Math.round(finite(seconds) / secondsPerTickAtBpm(bpm, ppq));
}

/**
 * Build the timing context the engine hands to the sequencer. A step duration
 * is still used for backwards-compatible callers, but the tick relationship is
 * explicit so sub-step events never re-round it.
 */
export function stepTiming(
  step: number,
  stepDuration: number,
  bpmStart?: number,
  bpmEnd?: number,
): StepTiming {
  const safeStep = finite(step);
  const safeDuration = Math.max(1e-9, finite(stepDuration, 0.125));
  const safeStartBpm = Math.max(
    1,
    finite(bpmStart, 60 / (safeDuration * STEPS_PER_BEAT)),
  );
  const safeEndBpm = Math.max(1, finite(bpmEnd, safeStartBpm));
  const secondsPerTick = safeDuration / TICKS_PER_STEP;
  return {
    step: safeStep,
    stepStartTick: stepsToTicks(safeStep),
    ticksPerStep: TICKS_PER_STEP,
    secondsPerTick,
    bpmStart: safeStartBpm,
    bpmEnd: safeEndBpm,
    secondsAtOffset: (offsetTicks: number) =>
      finite(offsetTicks) * secondsPerTick,
    secondsBetweenOffsets: (fromTicks: number, toTicks: number) =>
      (finite(toTicks) - finite(fromTicks)) * secondsPerTick,
  };
}

/** Swing delay in integer ticks. `scale` is 1 for channel swing, 0.5 for global. */
export function swingDelayTicks(amount: number, scale = 1): number {
  const clamped = Math.max(0, Math.min(MAX_SWING, finite(amount)));
  return Math.round(clamped * TICKS_PER_STEP * finite(scale, 1));
}

/** Offset of ratchet hit `hit` of `count`, on the tick grid. */
export function ratchetOffsetTicks(hit: number, count: number): number {
  const safeCount = Math.max(1, Math.floor(finite(count, 1)));
  const safeHit = Math.max(0, Math.floor(finite(hit)));
  return Math.round((safeHit * TICKS_PER_STEP) / safeCount);
}

/** Quantize a micro-offset (in editor steps) to a whole tick. */
export function quantizeMicroOffset(steps: number): number {
  return ticksToSteps(stepsToTicks(steps));
}
