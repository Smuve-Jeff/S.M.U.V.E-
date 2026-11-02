import {
  detectTransientFrames,
  sliceAudioBufferAtFrames,
} from "./sampler-slice.util";

function fakeContext(): BaseAudioContext {
  return {
    createBuffer: (channels: number, length: number, sampleRate: number) => {
      const data = Array.from(
        { length: channels },
        () => new Float32Array(length),
      );
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: (channel: number) => data[channel],
      } as unknown as AudioBuffer;
    },
  } as unknown as BaseAudioContext;
}

function bufferWithImpulses(
  impulses: number[],
  length: number,
  sampleRate = 1000,
): AudioBuffer {
  const data = new Float32Array(length);
  for (const frame of impulses) {
    if (frame >= 0 && frame < length) data[frame] = 1;
  }
  return {
    numberOfChannels: 1,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

function steadyBuffer(length: number, sampleRate = 1000): AudioBuffer {
  const data = new Float32Array(length).fill(0.5);
  return {
    numberOfChannels: 1,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

describe("detectTransientFrames", () => {
  it("finds separated attacks in a percussive sample", () => {
    const onsets = detectTransientFrames(
      bufferWithImpulses([500, 1500, 2500], 3000),
      { sensitivity: 0.55, minSliceSeconds: 0.05, frameSeconds: 0.01 },
    );

    expect(onsets).toHaveLength(3);
    expect(onsets[0].time).toBeGreaterThan(0.47);
    expect(onsets[0].time).toBeLessThan(0.53);
    expect(onsets[1].time).toBeGreaterThan(1.47);
    expect(onsets[1].time).toBeLessThan(1.53);
    expect(onsets[2].time).toBeGreaterThan(2.47);
    expect(onsets[2].time).toBeLessThan(2.53);
  });

  it("does not invent attacks in a steady tone", () => {
    expect(detectTransientFrames(steadyBuffer(3000))).toEqual([]);
  });

  it("enforces the minimum pad spacing", () => {
    const onsets = detectTransientFrames(
      bufferWithImpulses([200, 260, 340, 920, 980], 1200),
      { minSliceSeconds: 0.08, sensitivity: 0.8, frameSeconds: 0.01 },
    );

    expect(onsets.length).toBeLessThanOrEqual(4);
    expect(onsets.every((onset) => onset.time > 0.08)).toBe(true);
  });

  it("caps the number of detected pads at maxSlices", () => {
    const onsets = detectTransientFrames(
      bufferWithImpulses([100, 300, 500, 700, 900, 1100], 1400),
      { maxSlices: 3, minSliceSeconds: 0.05, sensitivity: 0.8 },
    );

    expect(onsets).toHaveLength(2);
  });

  it("returns nothing for empty or too-short buffers", () => {
    expect(detectTransientFrames(bufferWithImpulses([], 0))).toEqual([]);
    expect(detectTransientFrames(bufferWithImpulses([2], 12))).toEqual([]);
  });
});

describe("sliceAudioBufferAtFrames", () => {
  it("cuts at explicit frames and preserves the tail", () => {
    const source = bufferWithImpulses([], 100);
    const slices = sliceAudioBufferAtFrames(fakeContext(), source, [0, 10, 30]);

    expect(slices.map((slice) => slice.length)).toEqual([10, 20, 70]);
  });

  it("always starts at frame zero and ignores duplicate offsets", () => {
    const source = bufferWithImpulses([], 20);
    const slices = sliceAudioBufferAtFrames(
      fakeContext(),
      source,
      [8, 8, 12, 12],
    );

    expect(slices.map((slice) => slice.length)).toEqual([8, 4, 8]);
  });

  it("preserves every channel independently", () => {
    const data = [
      Float32Array.from([1, 1, 2, 2]),
      Float32Array.from([9, 9, 8, 8]),
    ];
    const source = {
      numberOfChannels: 2,
      length: 4,
      sampleRate: 1000,
      duration: 4 / 1000,
      getChannelData: (channel: number) => data[channel],
    } as unknown as AudioBuffer;

    const slices = sliceAudioBufferAtFrames(fakeContext(), source, [0, 2]);

    expect(Array.from(slices[0].getChannelData(0))).toEqual([1, 1]);
    expect(Array.from(slices[0].getChannelData(1))).toEqual([9, 9]);
    expect(Array.from(slices[1].getChannelData(0))).toEqual([2, 2]);
    expect(Array.from(slices[1].getChannelData(1))).toEqual([8, 8]);
  });

  it("rejects empty buffers and empty offset lists", () => {
    expect(
      sliceAudioBufferAtFrames(fakeContext(), bufferWithImpulses([], 0), [0]),
    ).toEqual([]);
    expect(
      sliceAudioBufferAtFrames(fakeContext(), bufferWithImpulses([], 10), []),
    ).toEqual([]);
  });
});
