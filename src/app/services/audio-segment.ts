/**
 * Cut a slice of an audio buffer into WAV bytes a provider can fetch.
 *
 * The Lab's audio overlay is a blob: URL, which fal.ai cannot open — so the
 * overlay's decoded buffer is re-encoded on-device (16 kHz mono PCM) and
 * handed over as a data URL, the same trick the Lab already uses for
 * frames. The function depends only on the buffer's shape, so tests can
 * fabricate a buffer without a real AudioContext.
 */

export interface AudioBufferShape {
  sampleRate: number;
  duration: number;
  length: number;
  getChannelData: (channel: number) => Float32Array;
}

export interface WavSegment {
  wav: Uint8Array;
  sampleRate: number;
  durationSeconds: number;
}

/** Longest slice rendered: provider cost scales with audio length. */
export const MAX_SEGMENT_SECONDS = 60;
/** 16 kHz mono is plenty for voice-like audio and keeps payloads small. */
export const SEGMENT_SAMPLE_RATE = 16_000;

export function encodeWavSegment(
  buffer: AudioBufferShape,
  startSeconds: number,
  durationSeconds: number,
  targetSampleRate: number = SEGMENT_SAMPLE_RATE,
): WavSegment {
  const source = buffer.getChannelData(0);
  const ratio = buffer.sampleRate / targetSampleRate;
  const start = Number.isFinite(startSeconds) ? Math.max(0, startSeconds) : 0;
  const startFrame = Math.min(
    Math.floor(start * buffer.sampleRate),
    Math.max(0, source.length - 1),
  );
  const available = Math.max(0, source.length - startFrame);
  const want = Number.isFinite(durationSeconds)
    ? durationSeconds
    : MAX_SEGMENT_SECONDS;
  const frames = Math.max(
    1,
    Math.min(
      Math.floor(Math.min(want, MAX_SEGMENT_SECONDS) * targetSampleRate),
      Math.max(1, Math.floor(available / ratio)),
    ),
  );

  // Linear-interpolation resample into the target rate.
  const pcm = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const position = startFrame + i * ratio;
    const lower = Math.floor(position);
    const fraction = position - lower;
    const a = source[Math.min(lower, source.length - 1)] ?? 0;
    const b = source[Math.min(lower + 1, source.length - 1)] ?? 0;
    pcm[i] = a + (b - a) * fraction;
  }

  const bytes = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(bytes);
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + frames * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, targetSampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeText(36, 'data');
  view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) {
    const sample = Math.min(1, Math.max(-1, pcm[i]));
    view.setInt16(
      44 + i * 2,
      sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff),
      true,
    );
  }
  return {
    wav: new Uint8Array(bytes),
    sampleRate: targetSampleRate,
    durationSeconds: frames / targetSampleRate,
  };
}
