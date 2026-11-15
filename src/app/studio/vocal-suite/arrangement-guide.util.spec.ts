import { buildArrangementGuide } from "./arrangement-guide.util";

function makeBuffer(seconds: number, sampleRate = 1000, channels = 1): AudioBuffer {
  return new (globalThis as any).AudioBuffer({
    length: Math.round(seconds * sampleRate),
    sampleRate,
    numberOfChannels: channels,
  });
}

const options = {
  secondsPerBar: 2,
  createBuffer: (channels: number, length: number, sampleRate: number) =>
    new (globalThis as any).AudioBuffer({ length, sampleRate, numberOfChannels: channels }),
};

describe("buildArrangementGuide", () => {
  it("returns a whole first clip unchanged", () => {
    const buffer = makeBuffer(1);

    const guide = buildArrangementGuide(
      [{ startBar: 0, originSeconds: 0, lengthSeconds: null, buffer }],
      options,
    );

    expect(guide).toBe(buffer);
  });

  it("lays every clip at its bar with silence in the gaps", () => {
    const first = makeBuffer(1);
    first.getChannelData(0).fill(0.5);
    const second = makeBuffer(0.5);
    second.getChannelData(0).fill(-0.25);

    const guide = buildArrangementGuide(
      [
        { startBar: 0, originSeconds: 0, lengthSeconds: null, buffer: first },
        { startBar: 2, originSeconds: 0, lengthSeconds: null, buffer: second },
      ],
      options,
    )!;

    // Bar 2 starts at 4 s; the half-second clip ends at 4.5 s.
    expect(guide.duration).toBeCloseTo(4.5, 3);
    const data = guide.getChannelData(0);
    expect(data[0]).toBeCloseTo(0.5, 5);
    // The gap between the clips stays silent instead of repeating the first.
    expect(data[Math.round(2.5 * 1000)]).toBe(0);
    expect(data[Math.round(4.1 * 1000)]).toBeCloseTo(-0.25, 5);
  });

  it("honours a clip's read offset and length", () => {
    const source = makeBuffer(2);
    const data = source.getChannelData(0);
    for (let frame = 0; frame < data.length; frame++) {
      data[frame] = frame / data.length; // 0 → 1 across 2 s
    }

    const guide = buildArrangementGuide(
      [{ startBar: 1, originSeconds: 1, lengthSeconds: 0.5, buffer: source }],
      options,
    )!;

    expect(guide.duration).toBeCloseTo(2.5, 3);
    // Bar 1 = 2 s, and the slice starts halfway through the source.
    expect(guide.getChannelData(0)[Math.round(2 * 1000)]).toBeCloseTo(0.5, 2);
    expect(guide.getChannelData(0)[Math.round(2.1 * 1000)]).toBeCloseTo(0.55, 2);
  });

  it("returns null when the track has no usable clip", () => {
    expect(buildArrangementGuide([], options)).toBeNull();
  });
});
