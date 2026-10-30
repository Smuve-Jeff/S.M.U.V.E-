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
  /** Step where capture actually began (16 steps per 4/4 bar). */
  startStep: number;
  /** Captured audio duration in seconds. */
  durationSeconds: number;
  /** Tempo the pass was played at. */
  tempo: number;
  stepsPerBar?: number;
}): TakePlacement {
  const stepsPerBar =
    Number.isFinite(options.stepsPerBar) && (options.stepsPerBar as number) > 0
      ? (options.stepsPerBar as number)
      : 16;
  const tempo =
    Number.isFinite(options.tempo) && options.tempo > 0 ? options.tempo : 120;
  const secondsPerBar = (60 / tempo) * 4;
  const rawBars =
    Math.max(0, options.durationSeconds || 0) / secondsPerBar;
  return {
    startBar: Math.max(0, options.startStep || 0) / stepsPerBar,
    lengthBars: Math.max(0.25, Math.ceil(rawBars * 4) / 4),
  };
}
