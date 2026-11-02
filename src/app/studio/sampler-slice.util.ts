/**
 * Split an AudioBuffer into `count` equal slices without decoding or copying
 * through a blob. Each slice is a real AudioBuffer on the same context and
 * sample rate, so the sampler can map it to a pad/pitch directly.
 *
 * Equal slicing is deliberately predictable: the artist picks the count and
 * every pad gets the same duration. Transient detection can refine the cut
 * points later without changing this contract.
 */
export function sliceAudioBuffer(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  count: number,
): AudioBuffer[] {
  if (!buffer || buffer.length <= 0) return [];
  // Never ask for more slices than there are frames; a 4-frame sample can
  // only become four one-frame pads, not sixty-four empty ones.
  const slices = Math.max(
    1,
    Math.min(64, buffer.length, Math.floor(count)),
  );

  const frames = Math.floor(buffer.length / slices);
  if (frames < 1) return [];

  const out: AudioBuffer[] = [];
  for (let index = 0; index < slices; index++) {
    const start = index * frames;
    const length =
      index === slices - 1 ? buffer.length - start : frames;
    if (length <= 0) break;
    const slice = ctx.createBuffer(
      buffer.numberOfChannels,
      length,
      buffer.sampleRate,
    );
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      slice
        .getChannelData(channel)
        .set(buffer.getChannelData(channel).subarray(start, start + length));
    }
    out.push(slice);
  }
  return out;
}

export interface TransientOnset {
  /** Absolute frame where the detected attack starts. */
  frame: number;
  time: number;
  /** Energy rise at the onset, useful for diagnostics and UI hints. */
  strength: number;
}

export interface TransientDetectionOptions {
  /**
   * 0 = only the strongest attacks, 1 = sensitive enough for quiet ghosts.
   * Defaults to 0.55, which works for drums and percussive loops.
   */
  sensitivity?: number;
  /** Shortest allowed pad; also the guard around the sample edges. */
  minSliceSeconds?: number;
  /** Total slices including the mandatory first pad at frame 0. */
  maxSlices?: number;
  /** Analysis window; smaller windows locate attacks more precisely. */
  frameSeconds?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Detect percussive attacks with a short-time energy rise.
 *
 * The detector deliberately works on an energy envelope rather than raw
 * samples: a single loud sample is not a hit, but a sustained jump in frame
 * energy is. A relative threshold adapts to quiet and loud loops, and the
 * absolute floor keeps silence/noise from producing a pad for every frame.
 */
export function detectTransientFrames(
  buffer: AudioBuffer,
  options: TransientDetectionOptions = {},
): TransientOnset[] {
  if (!buffer || buffer.length <= 0 || buffer.sampleRate <= 0) return [];

  const sensitivity = clamp(options.sensitivity ?? 0.55, 0, 1);
  const minSliceSeconds = Math.max(0.01, options.minSliceSeconds ?? 0.06);
  const maxSlices = Math.max(2, Math.min(64, Math.floor(options.maxSlices ?? 16)));
  const frameSeconds = clamp(options.frameSeconds ?? 0.01, 0.002, 0.05);
  const frameSize = Math.max(
    16,
    Math.round(buffer.sampleRate * frameSeconds),
  );
  const hop = Math.max(1, Math.floor(frameSize / 2));
  const frameCount = Math.floor((buffer.length - frameSize) / hop) + 1;
  if (frameCount < 3) return [];

  const channels = Array.from(
    { length: buffer.numberOfChannels },
    (_, index) => buffer.getChannelData(index),
  );
  const energy = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame++) {
    const start = frame * hop;
    const end = Math.min(buffer.length, start + frameSize);
    let sum = 0;
    for (const data of channels) {
      for (let index = start; index < end; index++) {
        sum += data[index] * data[index];
      }
    }
    const samples = Math.max(1, (end - start) * channels.length);
    energy[frame] = Math.sqrt(sum / samples);
  }

  const flux = new Float32Array(frameCount);
  let total = 0;
  for (let frame = 1; frame < frameCount; frame++) {
    const rise = Math.max(0, energy[frame] - energy[frame - 1]);
    flux[frame] = rise;
    total += rise;
  }
  const mean = total / Math.max(1, frameCount - 1);
  let variance = 0;
  for (let frame = 1; frame < frameCount; frame++) {
    const delta = flux[frame] - mean;
    variance += delta * delta;
  }
  variance /= Math.max(1, frameCount - 1);
  let maxFlux = 0;
  for (let frame = 1; frame < frameCount; frame++) {
    if (flux[frame] > maxFlux) maxFlux = flux[frame];
  }
  if (maxFlux <= 1e-6) return [];

  // High sensitivity lowers the deviation multiplier; the 8% floor stops a
  // single huge attack from hiding every quieter ghost note after it.
  const multiplier = 2.2 - sensitivity * 1.8;
  const threshold = Math.max(
    mean + multiplier * Math.sqrt(variance),
    maxFlux * 0.08,
  );
  const minFrames = Math.max(1, Math.round(minSliceSeconds * buffer.sampleRate));
  const onsets: TransientOnset[] = [];
  let lastFrame = -minFrames;

  for (let frame = 1; frame < frameCount - 1; frame++) {
    const strength = flux[frame];
    if (strength < threshold) continue;
    // Require a local maximum so a rising attack yields one pad, not one per
    // analysis frame.
    if (strength < flux[frame - 1] || strength < flux[frame + 1]) continue;
    const absolute = frame * hop;
    if (absolute < minFrames || absolute > buffer.length - minFrames) continue;
    if (absolute - lastFrame < minFrames) continue;
    onsets.push({
      frame: absolute,
      time: absolute / buffer.sampleRate,
      strength,
    });
    lastFrame = absolute;
    if (onsets.length >= maxSlices - 1) break;
  }

  return onsets;
}

/**
 * Cut an AudioBuffer at explicit frame offsets. The first cut is always frame
 * 0, and the final slice keeps the tail, so transient chops never lose audio.
 */
export function sliceAudioBufferAtFrames(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  startFrames: readonly number[],
): AudioBuffer[] {
  if (!buffer || buffer.length <= 0) return [];
  const starts = Array.from(
    new Set(
      startFrames
        .filter((frame) => Number.isFinite(frame))
        .map((frame) => Math.max(0, Math.floor(frame)))
        .filter((frame) => frame < buffer.length),
    ),
  ).sort((a, b) => a - b);
  if (starts.length === 0) return [];
  if (starts[0] !== 0) starts.unshift(0);
  // A single buffer cannot produce more than 64 useful pads here; the final
  // retained slice still covers the whole tail.
  if (starts.length > 64) starts.length = 64;

  const out: AudioBuffer[] = [];
  for (let index = 0; index < starts.length; index++) {
    const start = starts[index];
    const end = index + 1 < starts.length ? starts[index + 1] : buffer.length;
    const length = end - start;
    if (length <= 0) continue;
    const slice = ctx.createBuffer(
      buffer.numberOfChannels,
      length,
      buffer.sampleRate,
    );
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      slice
        .getChannelData(channel)
        .set(buffer.getChannelData(channel).subarray(start, end));
    }
    out.push(slice);
  }
  return out;
}
