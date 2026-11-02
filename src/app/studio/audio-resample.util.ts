/**
 * Resample a decoded buffer to the engine's sample rate.
 *
 * A 44.1 kHz file played through a 48 kHz graph otherwise runs the DSP at the
 * wrong rate (pitch and tempo drift, filters tuned for 48k). Rendering once
 * through an OfflineAudioContext at the target rate keeps the imported PCM
 * aligned with every other voice in the graph. Hosts without
 * OfflineAudioContext keep the original buffer rather than failing the import.
 */
export async function resampleToRate(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  targetRate: number,
): Promise<AudioBuffer> {
  if (!buffer || !Number.isFinite(targetRate) || targetRate <= 0) {
    return buffer;
  }
  if (Math.abs(buffer.sampleRate - targetRate) < 1) return buffer;

  const OfflineCtor =
    (globalThis as unknown as { OfflineAudioContext?: typeof OfflineAudioContext })
      .OfflineAudioContext ??
    (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  if (!OfflineCtor) return buffer;

  try {
    const frames = Math.max(1, Math.ceil(buffer.duration * targetRate));
    const offline = new OfflineCtor(
      buffer.numberOfChannels,
      frames,
      targetRate,
    );
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.connect(offline.destination);
    source.start();
    return await offline.startRendering();
  } catch {
    // A host that advertises OfflineAudioContext but cannot render must still
    // get a usable import.
    return buffer;
  }
}
