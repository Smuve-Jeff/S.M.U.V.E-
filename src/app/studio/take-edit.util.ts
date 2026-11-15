/**
 * Non-destructive take editing helpers.
 *
 * These operate on decoded AudioBuffers and are shared by the Vocal Suite's
 * Edit step (normalize / trim silence) and any other surface that needs to
 * clean up a recorded take before it reaches the arrangement.
 */

/**
 * Peak-normalize every channel in place to `targetPeakDb`.
 *
 * Returns the gain that was applied (1 when the buffer is silent or already
 * unusable), so callers can report what happened.
 */
export function peakNormalizeInPlace(
  buffer: AudioBuffer,
  targetPeakDb = -1,
): number {
  const channels = buffer.numberOfChannels;
  let peak = 0;

  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }

  // Silence (or denormal noise) has nothing to normalize.
  if (!(peak > 1e-6)) return 1;

  const gain = Math.pow(10, targetPeakDb / 20) / peak;
  if (!Number.isFinite(gain) || gain <= 0) return 1;

  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) data[i] *= gain;
  }

  return gain;
}

export interface TrimmedSilence {
  /** The trimmed buffer, or the original when there was nothing to trim. */
  buffer: AudioBuffer;
  /** Seconds removed from the head (0 when untouched). */
  headTrimSeconds: number;
  /** Seconds removed from the tail (0 when untouched). */
  tailTrimSeconds: number;
}

/**
 * Trim leading/trailing silence, keeping `paddingMs` of room tone on each side
 * so the take does not start or end with an audible click.
 *
 * Returns the trimmed buffer *and* how much was removed from each edge. A vocal
 * sung against a backing track must keep its place after the head is trimmed:
 * the caller routes the take `headTrimSeconds` later, otherwise the vocal slides
 * earlier by exactly the silence that was cut.
 *
 * The buffer is the original instance when there is nothing to trim (or the
 * take is silent end to end — an all-silent take is left alone rather than
 * collapsed to a single frame).
 */
export function trimSilenceEdgesWithRange(
  buffer: AudioBuffer,
  ctx: Pick<AudioContext, "createBuffer">,
  thresholdDb = -50,
  paddingMs = 20,
): TrimmedSilence {
  const untouched: TrimmedSilence = {
    buffer,
    headTrimSeconds: 0,
    tailTrimSeconds: 0,
  };
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  if (length === 0 || channels === 0) return untouched;

  const threshold = Math.pow(10, thresholdDb / 20);
  const data: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) data.push(buffer.getChannelData(ch));

  let first = -1;
  let last = -1;
  for (let i = 0; i < length; i++) {
    let audible = false;
    for (let ch = 0; ch < channels; ch++) {
      if (Math.abs(data[ch][i]) >= threshold) {
        audible = true;
        break;
      }
    }
    if (audible) {
      if (first < 0) first = i;
      last = i;
    }
  }

  if (first < 0) return untouched;

  const pad = Math.floor((paddingMs / 1000) * buffer.sampleRate);
  const start = Math.max(0, first - pad);
  const end = Math.min(length, last + pad + 1);
  const outLength = Math.max(1, end - start);

  if (start === 0 && outLength === length) return untouched;

  const trimmed = ctx.createBuffer(channels, outLength, buffer.sampleRate);
  for (let ch = 0; ch < channels; ch++) {
    trimmed.getChannelData(ch).set(data[ch].subarray(start, end));
  }
  return {
    buffer: trimmed,
    headTrimSeconds: start / buffer.sampleRate,
    tailTrimSeconds: (length - end) / buffer.sampleRate,
  };
}

/**
 * Trim leading/trailing silence and return just the buffer.
 *
 * Kept for callers that only need the audio; anything that places the take on a
 * timeline should use `trimSilenceEdgesWithRange` so the trim can be compensated.
 */
/**
 * Copy the requested fraction of a buffer into a new one.
 *
 * The take editor's trim handles are a view over the recording: routing,
 * auditioning and export use the kept region while the original buffer stays
 * intact, so widening the handles again brings the audio back. The full range
 * returns the same buffer rather than copying a whole take on every play.
 */
export function sliceAudioByRatio(
  buffer: AudioBuffer,
  ctx: Pick<BaseAudioContext, "createBuffer">,
  startRatio: number,
  endRatio: number,
): AudioBuffer {
  if (!buffer || buffer.length <= 0) return buffer;
  const clamp = (value: number) =>
    Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const start = clamp(startRatio);
  const end = clamp(endRatio);
  if (!(end > start)) return buffer;
  const startFrame = Math.floor(start * buffer.length);
  const endFrame = Math.min(
    buffer.length,
    Math.max(startFrame + 1, Math.ceil(end * buffer.length)),
  );
  if (startFrame === 0 && endFrame >= buffer.length) return buffer;
  const length = endFrame - startFrame;
  const out = ctx.createBuffer(
    buffer.numberOfChannels,
    length,
    buffer.sampleRate,
  );
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    out
      .getChannelData(channel)
      .set(buffer.getChannelData(channel).subarray(startFrame, endFrame));
  }
  return out;
}

/**
 * Prefix a buffer with silence.
 *
 * A looped audition that needs a bar of count-in cannot delay its own wrap
 * point, so the silence is part of the buffer instead: the transport loop and
 * the take then have the same length and stay together on every pass.
 */
export function padBufferStart(
  buffer: AudioBuffer,
  ctx: Pick<BaseAudioContext, "createBuffer">,
  seconds: number,
): AudioBuffer {
  const pad = Number.isFinite(seconds)
    ? Math.max(0, Math.round(seconds * buffer.sampleRate))
    : 0;
  if (pad <= 0) return buffer;
  const out = ctx.createBuffer(
    buffer.numberOfChannels,
    buffer.length + pad,
    buffer.sampleRate,
  );
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    out.getChannelData(channel).set(buffer.getChannelData(channel), pad);
  }
  return out;
}

export function trimSilenceEdges(
  buffer: AudioBuffer,
  ctx: Pick<AudioContext, "createBuffer">,
  thresholdDb = -50,
  paddingMs = 20,
): AudioBuffer {
  return trimSilenceEdgesWithRange(buffer, ctx, thresholdDb, paddingMs).buffer;
}
