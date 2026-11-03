import type { ClipFadeCurve } from "../types/studio.types";

export type FadeDirection = "in" | "out";

/** Ramp count used to approximate equal-power curves on an AudioParam. */
export const FADE_RAMP_STEPS = 24;

export function normalizeFadeCurve(value: unknown): ClipFadeCurve {
  return value === "equalPower" ? "equalPower" : "linear";
}

/**
 * Gain multiplier at a normalized point inside one fade.
 *
 * Linear fades preserve the original clip envelope. Equal-power fades use the
 * sine/cosine pair: at the same phase their squared gains sum to one, so an
 * outgoing and incoming clip keep a constant combined level through a
 * crossfade instead of dipping ~3 dB in the middle.
 */
export function fadeValueAtPhase(
  phase: number,
  direction: FadeDirection,
  curve: ClipFadeCurve,
): number {
  const p = Math.max(0, Math.min(1, Number.isFinite(phase) ? phase : 0));
  if (p <= 0) return direction === "in" ? 0 : 1;
  if (p >= 1) return direction === "in" ? 1 : 0;
  if (normalizeFadeCurve(curve) === "linear") {
    return direction === "in" ? p : 1 - p;
  }
  const theta = (p * Math.PI) / 2;
  return direction === "in" ? Math.sin(theta) : Math.cos(theta);
}

/**
 * Schedules a fade from `fromPhase` (0..1) to the end of the fade.
 *
 * Callers set the current value before invoking this when resuming partway
 * through a fade. Equal-power curves are approximated with short linear
 * ramps so the same helper works with every Web Audio implementation and with
 * the test doubles already used by the engine and export suite.
 */
export function scheduleFadeSegment(
  param: AudioParam,
  direction: FadeDirection,
  curve: ClipFadeCurve,
  atTime: number,
  duration: number,
  peak: number,
  fromPhase = 0,
  steps = FADE_RAMP_STEPS,
): void {
  const currentPhase = Math.max(0, Math.min(1, fromPhase));
  if (!(duration > 0) || currentPhase >= 1) return;

  if (normalizeFadeCurve(curve) === "linear") {
    param.linearRampToValueAtTime(
      direction === "in" ? peak : 0,
      atTime + duration * (1 - currentPhase),
    );
    return;
  }

  const count = Math.max(2, Math.floor(steps));
  for (let i = 1; i <= count; i++) {
    const phase = currentPhase + ((1 - currentPhase) * i) / count;
    param.linearRampToValueAtTime(
      peak * fadeValueAtPhase(phase, direction, curve),
      atTime + duration * (phase - currentPhase),
    );
  }
}
