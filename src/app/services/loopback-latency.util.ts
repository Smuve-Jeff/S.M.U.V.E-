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

/** Index of the first sample of the click burst, or null if nothing was captured. */
export function findClickOnset(
  channels: readonly Float32Array[],
  /** Fallback floor for silence; a real room noise bed stays below this. */
  minimumPeak = 0.01,
): number | null {
  if (channels.length === 0) return null;
  const length = channels.reduce(
    (longest, channel) => Math.max(longest, channel.length),
    0,
  );
  if (length === 0) return null;

  const sampleAt = (index: number): number => {
    let peak = 0;
    for (const channel of channels) {
      if (index >= channel.length) continue;
      const value = Math.abs(channel[index]);
      if (value > peak) peak = value;
    }
    return peak;
  };

  let peak = 0;
  let peakIndex = -1;
  for (let index = 0; index < length; index++) {
    const value = sampleAt(index);
    if (value > peak) {
      peak = value;
      peakIndex = index;
    }
  }
  if (peakIndex < 0 || peak < minimumPeak) return null;

  // Walk back from the loudest sample to the start of the burst. The click has
  // a 1 ms attack, so compare against a fraction of its peak instead of zero —
  // room noise and the tail of previous audio otherwise pull the onset early.
  const threshold = peak * 0.08;
  let onset = peakIndex;
  while (onset > 0 && sampleAt(onset - 1) > threshold) onset--;
  return onset;
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
