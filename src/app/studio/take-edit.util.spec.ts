import {
  padBufferStart,
  peakNormalizeInPlace,
  sliceAudioByRatio,
  trimSilenceEdges,
  trimSilenceEdgesWithRange,
} from "./take-edit.util";

function makeBuffer(
  channels: number,
  length: number,
  sampleRate = 48000,
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
} as unknown as Pick<AudioContext, "createBuffer">;

describe("padBufferStart", () => {
  it("puts silence in front without losing the take", () => {
    const buffer = makeBuffer(1, 1000, 1000); // 1 s
    buffer.getChannelData(0).fill(0.4);

    const padded = padBufferStart(buffer, ctxStub, 0.5);

    expect(padded.length).toBe(1500);
    expect(padded.getChannelData(0)[0]).toBe(0);
    expect(padded.getChannelData(0)[499]).toBe(0);
    expect(padded.getChannelData(0)[500]).toBeCloseTo(0.4, 5);
  });

  it("returns the same buffer when there is no pad", () => {
    const buffer = makeBuffer(1, 128);

    expect(padBufferStart(buffer, ctxStub, 0)).toBe(buffer);
  });
});

describe("sliceAudioByRatio", () => {
  it("keeps only the requested fraction of the take", () => {
    const buffer = makeBuffer(2, 1000, 1000); // 1 second
    buffer.getChannelData(0).fill(0.5);
    buffer.getChannelData(1).fill(-0.25);

    const sliced = sliceAudioByRatio(buffer, ctxStub, 0.25, 0.75);

    expect(sliced.length).toBe(500);
    expect(sliced.numberOfChannels).toBe(2);
    expect(sliced.getChannelData(0)[0]).toBeCloseTo(0.5, 5);
    expect(sliced.getChannelData(1)[0]).toBeCloseTo(-0.25, 5);
  });

  it("returns the original buffer when the whole take is kept", () => {
    const buffer = makeBuffer(1, 256);

    expect(sliceAudioByRatio(buffer, ctxStub, 0, 1)).toBe(buffer);
  });

  it("refuses an inverted region instead of inventing audio", () => {
    const buffer = makeBuffer(1, 256);

    expect(sliceAudioByRatio(buffer, ctxStub, 0.8, 0.2)).toBe(buffer);
  });
});

describe("take-edit.util", () => {
  describe("peakNormalizeInPlace", () => {
    it("lifts a quiet take to the requested peak", () => {
      const buffer = makeBuffer(2, 512);
      buffer.getChannelData(0).fill(0.25);
      buffer.getChannelData(1).fill(-0.5);

      const gain = peakNormalizeInPlace(buffer, -6);

      // The loudest channel lands on the target; the other keeps its relative
      // level (6 dB below), which is what peak normalization means.
      const target = Math.pow(10, -6 / 20);
      expect(gain).toBeCloseTo(target / 0.5, 3);
      expect(Math.abs(buffer.getChannelData(1)[0])).toBeCloseTo(target, 3);
      expect(Math.abs(buffer.getChannelData(0)[0])).toBeCloseTo(target / 2, 3);
    });

    it("leaves a silent take untouched", () => {
      const buffer = makeBuffer(1, 128);

      const gain = peakNormalizeInPlace(buffer, -1);

      expect(gain).toBe(1);
      expect(buffer.getChannelData(0)[0]).toBe(0);
    });
  });

  describe("trimSilenceEdges", () => {
    it("trims leading and trailing silence while keeping padding", () => {
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

    it("returns the original when the take already fills the buffer", () => {
      const buffer = makeBuffer(1, 256);
      buffer.getChannelData(0).fill(0.4);

      expect(trimSilenceEdges(buffer, ctxStub)).toBe(buffer);
    });

    it("keeps an all-silent take instead of collapsing it", () => {
      const buffer = makeBuffer(2, 256);

      expect(trimSilenceEdges(buffer, ctxStub)).toBe(buffer);
    });

    it("reports the seconds removed from each edge", () => {
      const buffer = makeBuffer(1, 4800);
      const data = buffer.getChannelData(0);
      const pad = 480; // 10 ms
      const first = 1440;
      const last = 2880;
      for (let i = first; i <= last; i++) data[i] = 0.5;

      const result = trimSilenceEdgesWithRange(buffer, ctxStub, -50, 10);

      expect(result.buffer).not.toBe(buffer);
      expect(result.headTrimSeconds).toBeCloseTo((first - pad) / 48000, 6);
      expect(result.tailTrimSeconds).toBeCloseTo(
        (4800 - (last + pad + 1)) / 48000,
        6,
      );
    });

    it("reports no trim when the take is left untouched", () => {
      const buffer = makeBuffer(1, 256);
      buffer.getChannelData(0).fill(0.4);

      const result = trimSilenceEdgesWithRange(buffer, ctxStub);

      expect(result.buffer).toBe(buffer);
      expect(result.headTrimSeconds).toBe(0);
      expect(result.tailTrimSeconds).toBe(0);
    });

    it("ignores content below the threshold", () => {
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
