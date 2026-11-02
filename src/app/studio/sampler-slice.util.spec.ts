import { sliceAudioBuffer } from "./sampler-slice.util";

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

function sourceBuffer(samples: number[], channels = 1): AudioBuffer {
  const data = Array.from({ length: channels }, () =>
    Float32Array.from(samples),
  );
  return {
    numberOfChannels: channels,
    length: samples.length,
    sampleRate: 48000,
    duration: samples.length / 48000,
    getChannelData: (channel: number) => data[channel],
  } as unknown as AudioBuffer;
}

describe("sliceAudioBuffer", () => {
  it("splits a buffer into equal slices that cover every frame", () => {
    const slices = sliceAudioBuffer(
      fakeContext(),
      sourceBuffer([0, 1, 2, 3, 4, 5, 6, 7]),
      4,
    );

    expect(slices).toHaveLength(4);
    expect(slices.map((slice) => slice.length)).toEqual([2, 2, 2, 2]);
    expect(Array.from(slices[0].getChannelData(0))).toEqual([0, 1]);
    expect(Array.from(slices[3].getChannelData(0))).toEqual([6, 7]);
  });

  it("keeps the tail in the last slice when the length is not divisible", () => {
    const slices = sliceAudioBuffer(
      fakeContext(),
      sourceBuffer([0, 1, 2, 3, 4, 5, 6]),
      3,
    );

    expect(slices).toHaveLength(3);
    expect(slices.map((slice) => slice.length)).toEqual([2, 2, 3]);
    expect(Array.from(slices[2].getChannelData(0))).toEqual([4, 5, 6]);
  });

  it("slices every channel independently", () => {
    const source = {
      numberOfChannels: 2,
      length: 4,
      sampleRate: 44100,
      duration: 4 / 44100,
      getChannelData: (channel: number) =>
        channel === 0
          ? Float32Array.from([1, 1, 2, 2])
          : Float32Array.from([9, 9, 8, 8]),
    } as unknown as AudioBuffer;

    const slices = sliceAudioBuffer(fakeContext(), source, 2);

    expect(Array.from(slices[0].getChannelData(0))).toEqual([1, 1]);
    expect(Array.from(slices[0].getChannelData(1))).toEqual([9, 9]);
    expect(Array.from(slices[1].getChannelData(1))).toEqual([8, 8]);
  });

  it("clamps the slice count and rejects empty buffers", () => {
    const buffer = sourceBuffer([0, 1, 2, 3]);
    expect(sliceAudioBuffer(fakeContext(), buffer, 0)).toHaveLength(1);
    expect(sliceAudioBuffer(fakeContext(), buffer, 1000)).toHaveLength(4);
    expect(
      sliceAudioBuffer(fakeContext(), sourceBuffer([]), 4),
    ).toHaveLength(0);
  });
});
