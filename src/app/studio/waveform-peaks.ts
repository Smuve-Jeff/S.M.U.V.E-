/**
 * Peak data for a waveform strip.
 *
 * A waveform is a *peak* drawing, not an average: averaging a take flattens its
 * transients until every pass looks like the same rounded cloud, which is worse
 * than no waveform at all when the artist is choosing a comp. Each bucket
 * reports the loudest absolute sample in its span, so a plosive still reads as
 * a spike at 48 bars.
 *
 * Channels are folded by max rather than mixed: a take with signal on one side
 * only (a mis-wired interface, a single-sided performance) must still show its
 * shape instead of half-height bars.
 *
 * Pure and sample-accurate so the buckets can be pinned in a test without an
 * AudioContext.
 */
/**
 * Fold every channel into one strip without losing a one-sided take.
 *
 * Per frame the loudest absolute sample wins and keeps its sign, so a file
 * whose signal sits only in the right channel draws at full height instead of
 * a flat line — `getChannelData(0)` alone is the bug this replaces.
 */
export function foldChannelsToPeak(
  channels: readonly Float32Array[],
): Float32Array {
  const usable = channels.filter((channel) => channel.length > 0);
  if (usable.length === 0) return new Float32Array(0);
  if (usable.length === 1) return usable[0];

  const frames = usable.reduce(
    (max, channel) => Math.max(max, channel.length),
    0,
  );
  const folded = new Float32Array(frames);
  for (const channel of usable) {
    for (let frame = 0; frame < channel.length; frame++) {
      const sample = channel[frame];
      if (!Number.isFinite(sample)) continue;
      if (Math.abs(sample) > Math.abs(folded[frame])) folded[frame] = sample;
    }
  }
  return folded;
}

export function computeWaveformPeaks(
  channels: readonly Float32Array[],
  buckets: number,
): number[] {
  const bucketCount = Math.floor(buckets);
  const usable = channels.filter((channel) => channel.length > 0);
  if (bucketCount <= 0 || usable.length === 0) return [];

  const frames = usable.reduce((max, channel) => Math.max(max, channel.length), 0);
  const peaks: number[] = new Array(bucketCount).fill(0);

  for (let bucket = 0; bucket < bucketCount; bucket++) {
    // Every bucket covers at least one frame, even when there are fewer samples
    // than bars, so a very short take still produces a readable strip.
    const start = Math.floor((bucket * frames) / bucketCount);
    const end = Math.max(
      start + 1,
      Math.floor(((bucket + 1) * frames) / bucketCount),
    );

    let peak = 0;
    for (let frame = start; frame < end; frame++) {
      for (const channel of usable) {
        const sample = channel[frame];
        if (sample === undefined || !Number.isFinite(sample)) continue;
        const amplitude = Math.abs(sample);
        if (amplitude > peak) peak = amplitude;
      }
    }
    peaks[bucket] = Math.min(1, peak);
  }

  return peaks;
}
