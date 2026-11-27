/**
 * Arrangement coordinates for a finished transport pass.
 *
 * Clips store `start` and `length` in bars (see StudioClip), while the
 * transport measures position in 16th-note steps. The pass must begin exactly
 * where it was punched in — rounding the start to a whole bar would shift the
 * performance away from the beat the artist played against.
 *
 * Length is rounded UP to a quarter bar, matching the arrangement's snap and
 * the freeze/bounce path: truncating a 3.02-bar take would clip its tail.
 */
export interface TakePlacement {
  /** Arrangement start in bars (may be fractional: 1 step = 1/16 bar). */
  startBar: number;
  /** Clip length in bars, at least a quarter bar, rounded up. */
  lengthBars: number;
}

export function takePlacementFor(options: {
  /** Step where capture actually began (16th-note steps). */
  startStep: number;
  /** Captured audio duration in seconds. */
  durationSeconds: number;
  /** Tempo the pass was played at. */
  tempo: number;
  /** Uniform bar length; used only when `barPositionAtStep` is absent. */
  stepsPerBar?: number;
  /**
   * Meter-aware fractional bar position for a step. The engine supplies
   * `AudioEngineService.barPositionAtStep`, which walks the meter map, so a
   * take that crosses a 4/4 → 3/4 change lands on the right arrangement bar
   * instead of assuming every bar is 16 steps.
   */
  barPositionAtStep?: (step: number) => number;
}): TakePlacement {
  const stepsPerBar =
    Number.isFinite(options.stepsPerBar) && (options.stepsPerBar as number) > 0
      ? (options.stepsPerBar as number)
      : 16;
  const tempo =
    Number.isFinite(options.tempo) && options.tempo > 0 ? options.tempo : 120;
  // A sequencer step is a 16th note at every meter, so a step lasts the same
  // number of seconds everywhere; only what counts as a bar changes.
  const secondsPerStep = 60 / tempo / 4;
  const positionAt = (step: number): number => {
    const safeStep = Math.max(0, Number.isFinite(step) ? step : 0);
    if (typeof options.barPositionAtStep === "function") {
      const position = options.barPositionAtStep(safeStep);
      if (Number.isFinite(position)) return Math.max(0, position);
    }
    return safeStep / stepsPerBar;
  };
  const startStep = Math.max(0, options.startStep || 0);
  const startBar = positionAt(startStep);
  const endStep =
    startStep + Math.max(0, options.durationSeconds || 0) / secondsPerStep;
  const rawBars = Math.max(0, positionAt(endStep) - startBar);
  return {
    startBar,
    lengthBars: Math.max(0.25, Math.ceil(rawBars * 4) / 4),
  };
}
