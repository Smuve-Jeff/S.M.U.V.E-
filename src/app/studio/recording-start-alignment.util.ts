/**
 * Align a finished pass with the punch position it was armed on.
 *
 * The capture worklet starts on the first render quantum after REC is armed,
 * which is later than the moment the playhead showed the punch position. A
 * clip dropped at the punch bar therefore played the performance late by the
 * capture start latency. The worklet timestamps that first quantum on the
 * AudioContext clock, so this maps the timestamp onto the same fractional step
 * grid the transport used and returns where the audio really begins.
 *
 * When capture begins *before* the punch (the transport's start lookahead is
 * longer than the capture start delay, so the take opens with pre-roll), the
 * clip still starts at the punch and `trimSeconds` tells the caller how much
 * of the WAV head to discard — that removes the pre-roll instead of leaving a
 * silent gap before the performance.
 *
 * Hardware input round-trip latency is part of the captured signal: a note the
 * artist played on the beat reaches the worklet one interface buffer later.
 * Passing that latency moves the performance anchor earlier by the same
 * amount, so the note's waveform — not the block that contains it — lands on
 * the beat.
 */
export interface StartAlignment {
  /** Fractional arrangement step the clipped audio must start on. */
  startStep: number;
  /** Seconds to trim from the captured WAV before it is cached. */
  trimSeconds: number;
  /** Fractional step where the first captured sample lands (null if unknown). */
  captureStep: number | null;
  /** How late capture began relative to the punch, in seconds (>= 0). */
  startLatencySeconds: number;
}

export function alignRecordingStart(options: {
  /** Fractional transport position when REC was armed (may be pre-roll). */
  punchStep: number;
  /** AudioContext time of that punch position. */
  punchTime: number;
  /** AudioContext time of the first captured render quantum, if known. */
  captureStartTime: number | null;
  /** Tempo the pass was played at. */
  tempo: number;
  /** 16th notes per beat (the Studio uses 4). */
  stepsPerBeat?: number;
  /**
   * Applied input round-trip latency in seconds (interface + processing).
   * The capture already contains it, so the performance anchor is earlier.
   */
  inputLatencySeconds?: number;
}): StartAlignment {
  const stepsPerBeat =
    Number.isFinite(options.stepsPerBeat) && (options.stepsPerBeat as number) > 0
      ? (options.stepsPerBeat as number)
      : 4;
  const tempo =
    Number.isFinite(options.tempo) && options.tempo > 0 ? options.tempo : 120;
  const secondsPerStep = 60 / tempo / stepsPerBeat;
  const punchStep = options.punchStep;
  const punch = Math.max(0, punchStep || 0);

  const captureStartTime = options.captureStartTime;
  if (
    captureStartTime === null ||
    captureStartTime === undefined ||
    !Number.isFinite(captureStartTime) ||
    !Number.isFinite(options.punchTime)
  ) {
    return {
      startStep: punch,
      trimSeconds: 0,
      captureStep: null,
      startLatencySeconds: 0,
    };
  }

  const inputLatencySeconds = Math.max(0, options.inputLatencySeconds ?? 0);
  const performanceAnchor = captureStartTime - inputLatencySeconds;
  const captureStep =
    punchStep + (performanceAnchor - options.punchTime) / secondsPerStep;
  const startStep = Math.max(punch, captureStep);
  return {
    startStep,
    // Audio before the clip start (the transport's lookahead pre-roll) is
    // discarded so bar one is not preceded by a silent gap.
    trimSeconds: Math.max(0, startStep - captureStep) * secondsPerStep,
    captureStep,
    startLatencySeconds: Math.max(0, captureStartTime - options.punchTime),
  };
}
