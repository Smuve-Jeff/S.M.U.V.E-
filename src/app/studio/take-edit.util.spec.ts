import { peakNormalizeInPlace, trimSilenceEdges } from './take-edit.util';

function makeBuffer(
  channels: number,
  length: number,
  sampleRate = 48000
): AudioBuffer {
  return new (globalThis as any).AudioBuffer({
    length,
    sampleRate,
    numberOfChannels: channels,
  });
}

const ctxStub = {
  createBuffer: (channels: number, length: number, sampleRate: number) =>
    new (globalThis as any).AudioBuffer({
      length,
      sampleRate,
      numberOfChannels: channels,
    }),
} as unknown as Pick<AudioContext, 'createBuffer'>;

describe('take-edit.util', () => {
  describe('peakNormalizeInPlace', () => {
    it('lifts a quiet take to the requested peak', () => {
      const buffer = makeBuffer(2, 512);
      buffer.getChannelData(0).fill(0.25);
      buffer.getChannelData(1).fill(-0.5);

      const gain = peakNormalizeInPlace(buffer, -6);

      // The loudest channel lands on the target; the other keeps its relative
      // level (6 dB below), which is what peak normalization means.
      const target = Math.pow(10, -6 / 20);
      expect(gain).toBeCloseTo(target / 0.5, 3);
      expect(Math.abs(buffer.getChannelData(1)[0])).toBeCloseTo(target, 3);
      expect(Math.abs(buffer.getChannelData(0)[0])).toBeCloseTo(
        target / 2,
        3
      );
    });

    it('leaves a silent take untouched', () => {
      const buffer = makeBuffer(1, 128);

      const gain = peakNormalizeInPlace(buffer, -1);

      expect(gain).toBe(1);
      expect(buffer.getChannelData(0)[0]).toBe(0);
    });
  });

  describe('trimSilenceEdges', () => {
    it('trims leading and trailing silence while keeping padding', () => {
      const buffer = makeBuffer(1, 4800); // 100 ms at 48 kHz
      const data = buffer.getChannelData(0);
      const pad = 480; // 10 ms
      const first = 1440;
      const last = 2880;
      for (let i = first; i <= last; i++) data[i] = 0.5;

      const trimmed = trimSilenceEdges(buffer, ctxStub, -50, 10);

      expect(trimmed.length).toBe(last + 1 + pad - (first - pad));
      const out = trimmed.getChannelData(0);
      expect(out[0]).toBe(0);
      expect(out[Math.floor(out.length / 2)]).toBeCloseTo(0.5, 5);
    });

    it('returns the original when the take already fills the buffer', () => {
      const buffer = makeBuffer(1, 256);
      buffer.getChannelData(0).fill(0.4);

      expect(trimSilenceEdges(buffer, ctxStub)).toBe(buffer);
    });

    it('keeps an all-silent take instead of collapsing it', () => {
      const buffer = makeBuffer(2, 256);

      expect(trimSilenceEdges(buffer, ctxStub)).toBe(buffer);
    });

    it('ignores content below the threshold', () => {
      const buffer = makeBuffer(1, 4800);
      const data = buffer.getChannelData(0);
      // -80 dBFS noise outside the audible region must not hold the trim open.
      data.fill(1e-5);
      for (let i = 960; i <= 1920; i++) data[i] = 0.3;

      const trimmed = trimSilenceEdges(buffer, ctxStub, -50, 0);

      expect(trimmed.length).toBe(1921 - 960);
    });
  });
});
