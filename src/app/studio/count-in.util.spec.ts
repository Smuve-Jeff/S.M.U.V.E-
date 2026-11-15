import {
  countInBeatSeconds,
  countInBeats,
  countInDurationSeconds,
} from "./count-in.util";

describe("count-in timing", () => {
  it("gives a one-bar count-in four beats", () => {
    expect(countInBeats(1)).toBe(4);
    expect(countInBeats(2)).toBe(8);
  });

  it("clamps to a usable bar count", () => {
    expect(countInBeats(0)).toBe(4);
    expect(countInBeats(Number.NaN)).toBe(4);
    expect(countInBeats(99)).toBe(16);
  });

  it("follows the tempo", () => {
    expect(countInBeatSeconds(120)).toBeCloseTo(0.5, 6);
    expect(countInDurationSeconds(1, 120)).toBeCloseTo(2, 6);
    expect(countInDurationSeconds(1, 60)).toBeCloseTo(4, 6);
  });

  it("falls back to 120 BPM for an unusable tempo", () => {
    expect(countInBeatSeconds(0)).toBeCloseTo(0.5, 6);
    expect(countInDurationSeconds(1, Number.NaN)).toBeCloseTo(2, 6);
  });
});
