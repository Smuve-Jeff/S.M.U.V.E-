import {
  encodeWavSegment,
  MAX_SEGMENT_SECONDS,
  type AudioBufferShape,
} from './audio-segment';

const fakeBuffer = (
  sampleRate: number,
  seconds: number,
  fill: (index: number) => number = (i) => Math.sin(i / 10),
): AudioBufferShape => {
  const length = Math.floor(sampleRate * seconds);
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) data[i] = fill(i);
  return {
    sampleRate,
    duration: seconds,
    length,
    getChannelData: () => data,
  };
};

const textAt = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.slice(offset, offset + length));

describe('encodeWavSegment', () => {
  it('writes a valid 16 kHz mono WAV with the segment length', () => {
    const { wav, sampleRate, durationSeconds } = encodeWavSegment(
      fakeBuffer(48_000, 2),
      0,
      2,
    );
    expect(sampleRate).toBe(16_000);
    expect(durationSeconds).toBeCloseTo(2, 2);
    expect(wav.length).toBe(44 + 32_000 * 2);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(textAt(wav, 0, 4)).toBe('RIFF');
    expect(textAt(wav, 8, 4)).toBe('WAVE');
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint32(40, true)).toBe(32_000 * 2);
  });

  it('cuts from the start offset without overshooting the buffer', () => {
    const { wav, durationSeconds } = encodeWavSegment(fakeBuffer(16_000, 30), 25, 1000);
    expect(durationSeconds).toBe(5);
    expect(wav.length - 44).toBe(5 * 16_000 * 2);
  });

  it('never exceeds the 60 second render budget', () => {
    const { durationSeconds } = encodeWavSegment(fakeBuffer(16_000, 120), 0, 1000);
    expect(durationSeconds).toBe(MAX_SEGMENT_SECONDS);
  });

  it('reads only the requested window of the source', () => {
    const buffer = fakeBuffer(16_000, 4, (i) => (i < 16_000 ? 0 : 0.5));
    const { wav } = encodeWavSegment(buffer, 1, 1);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(view.getInt16(44, true)).toBe(Math.round(0.5 * 0x7fff));
  });

  it('survives a negative start and a zero-length request', () => {
    const { durationSeconds } = encodeWavSegment(fakeBuffer(16_000, 4), -5, 0);
    expect(durationSeconds).toBeCloseTo(1 / 16_000, 6);
  });
});
