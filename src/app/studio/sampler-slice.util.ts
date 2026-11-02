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
