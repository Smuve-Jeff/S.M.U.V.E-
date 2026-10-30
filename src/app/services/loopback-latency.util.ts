/**
 * Helpers for a real output→input loopback latency measurement.
 *
 * A short click is scheduled on the AudioContext output; the input capture
 * records it through the speakers/cable and microphone. The worklet timestamps
 * its first captured block, so the frame where the click's onset appears maps
 * to an absolute AudioContext time. The difference from the scheduled click is
 * the actual round trip this device produces — output buffer, acoustic path and
 * input buffer included.
 */

export type LoopbackClickQuality = "good" | "fair" | "poor";
export type LoopbackConfidence = "high" | "medium" | "low";

export interface ClickBurst {
  /** First sample of the burst. */
  onsetFrame: number;
  /** Loudest absolute sample in the burst. */
  peak: number;
  /** Burst peak divided by the room-noise floor (>= 1). */
  signalToNoise: number;
}

/** Index of the first sample of the click burst, or null if nothing was captured. */
export function findClickOnset(
  channels: readonly Float32Array[],
  /** Fallback floor for silence; a real room noise bed stays below this. */
  minimumPeak = 0.01,
): number | null {
  return findClickBursts(channels, { expected: 1, minimumPeak })[0]?.onsetFrame ?? null;
}

/**
 * Locate up to `expected` click bursts in the captured signal.
 *
 * Room noise sets the detection threshold, so a quiet interface still hears a
 * normal click while hiss alone does not count. Each burst reports its peak and
 * signal-to-noise ratio — the per-click quality input.
 */
export function findClickBursts(
  channels: readonly Float32Array[],
  options: {
    expected?: number;
    /** Absolute floor so digital silence does not make every sample a click. */
    minimumPeak?: number;
    /** How far past an onset to search for that burst's peak, in frames. */
    burstWindowFrames?: number;
  } = {},
): ClickBurst[] {
  if (channels.length === 0) return [];
  const length = channels.reduce(
    (longest, channel) => Math.max(longest, channel.length),
    0,
  );
  if (length === 0) return [];

  const sampleAt = (index: number): number => {
    let peak = 0;
    for (const channel of channels) {
      if (index >= channel.length) continue;
      const value = Math.abs(channel[index]);
      if (value > peak) peak = value;
    }
    return peak;
  };

  // A click occupies a tiny fraction of the take, so the median absolute
  // sample is a good noise-floor estimate that the clicks cannot skew.
  const samples: number[] = [];
  for (let index = 0; index < length; index += 7) samples.push(sampleAt(index));
  samples.sort((a, b) => a - b);
  const noise = samples.length
    ? samples[Math.floor(samples.length / 2)]
    : 0;

  const expected = Math.max(1, options.expected ?? 1);
  const minimumPeak = options.minimumPeak ?? 0.01;
  const threshold = Math.max(minimumPeak, noise * 6);
  const windowFrames = Math.max(
    1,
    options.burstWindowFrames ?? Math.round(length / expected / 2),
  );

  const bursts: ClickBurst[] = [];
  let index = 0;
  while (index < length && bursts.length < expected) {
    if (sampleAt(index) < threshold) {
      index++;
      continue;
    }

    const windowEnd = Math.min(length, index + windowFrames);
    let peak = 0;
    let peakIndex = index;
    for (let cursor = index; cursor < windowEnd; cursor++) {
      const value = sampleAt(cursor);
      if (value > peak) {
        peak = value;
        peakIndex = cursor;
      }
    }

    // Walk back from the loudest sample to the start of the burst. The click
    // has a 1 ms attack, so compare against a fraction of its peak instead of
    // zero — noise otherwise pulls the onset early.
    const onsetThreshold = peak * 0.08;
    let onset = peakIndex;
    while (onset > 0 && sampleAt(onset - 1) > onsetThreshold) onset--;
    bursts.push({
      onsetFrame: onset,
      peak,
      signalToNoise: peak / Math.max(noise, 1e-6),
    });
    index = Math.max(peakIndex + 1, windowEnd);
  }
  return bursts;
}

/** Median of a set of measurements; 0 for an empty set. */
export function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Rank one click by how clean and how close to the median it was. A weak burst
 * or a timing outlier is never presented as a good measurement.
 */
export function loopbackQuality(
  signalToNoise: number,
  deviationMs: number,
): LoopbackClickQuality {
  if (signalToNoise >= 8 && deviationMs <= 5) return "good";
  if (signalToNoise >= 3 && deviationMs <= 15) return "fair";
  return "poor";
}

/**
 * How much the median deserves to be trusted. Completeness first: a missing
 * click means the run was retried and still not heard, so confidence is capped.
 * A poor median always reads low; otherwise tight agreement between clicks is
 * what earns high confidence.
 */
export function loopbackConfidence(options: {
  capturedClickCount: number;
  requestedClickCount: number;
  medianQuality: LoopbackClickQuality;
  spreadMs: number;
}): LoopbackConfidence {
  if (options.capturedClickCount < 2) return "low";
  if (options.medianQuality === "poor") return "low";
  if (options.capturedClickCount < options.requestedClickCount) return "medium";
  if (options.medianQuality === "good" && options.spreadMs <= 8) return "high";
  return "medium";
}

/**
 * Round-trip milliseconds between the scheduled click and the captured onset.
 * Negative values are clamped: the click cannot arrive before it was played,
 * and a negative result means the onset detector latched onto something else.
 */
export function loopbackRoundTripMs(options: {
  clickScheduledAt: number;
  captureStartedAt: number;
  onsetFrame: number;
  sampleRate: number;
}): number {
  const sampleRate =
    Number.isFinite(options.sampleRate) && options.sampleRate > 0
      ? options.sampleRate
      : 0;
  if (!sampleRate) return 0;
  const detectedAt =
    options.captureStartedAt + Math.max(0, options.onsetFrame) / sampleRate;
  return Math.max(
    0,
    Math.round((detectedAt - options.clickScheduledAt) * 1000),
  );
}
