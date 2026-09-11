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
  targetPeakDb = -1
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

/**
 * Trim leading/trailing silence, keeping `paddingMs` of room tone on each side
 * so the take does not start or end with an audible click.
 *
 * Returns a new buffer, or the original when there is nothing to trim (or the
 * take is silent end to end — an all-silent take is left alone rather than
 * collapsed to a single frame).
 */
export function trimSilenceEdges(
  buffer: AudioBuffer,
  ctx: Pick<AudioContext, 'createBuffer'>,
  thresholdDb = -50,
  paddingMs = 20
): AudioBuffer {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  if (length === 0 || channels === 0) return buffer;

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

  if (first < 0) return buffer;

  const pad = Math.floor((paddingMs / 1000) * buffer.sampleRate);
  const start = Math.max(0, first - pad);
  const end = Math.min(length, last + pad + 1);
  const outLength = Math.max(1, end - start);

  if (start === 0 && outLength === length) return buffer;

  const trimmed = ctx.createBuffer(channels, outLength, buffer.sampleRate);
  for (let ch = 0; ch < channels; ch++) {
    trimmed.getChannelData(ch).set(data[ch].subarray(start, end));
  }
  return trimmed;
}
