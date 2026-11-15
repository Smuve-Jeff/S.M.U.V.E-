import { clipStartBarForHeadTrim } from "./backing-track-alignment.util";

describe("clipStartBarForHeadTrim", () => {
  it("starts an untrimmed take at the beginning of the arrangement", () => {
    expect(clipStartBarForHeadTrim({ headTrimSeconds: 0, tempo: 124 })).toBe(0);
  });

  it("moves a take later by the silence removed from its head", () => {
    // 120 BPM in 4/4: one bar is 2 s, so 1.5 s of trimmed silence is 0.75 bar.
    expect(
      clipStartBarForHeadTrim({ headTrimSeconds: 1.5, tempo: 120 }),
    ).toBeCloseTo(0.75, 6);
  });

  it("follows the project tempo", () => {
    // 60 BPM: one bar is 4 s, so the same 2 s is half a bar.
    expect(
      clipStartBarForHeadTrim({ headTrimSeconds: 2, tempo: 60 }),
    ).toBeCloseTo(0.5, 6);
  });

  it("never places a take before the arrangement", () => {
    expect(
      clipStartBarForHeadTrim({ headTrimSeconds: -3, tempo: 120 }),
    ).toBe(0);
    expect(
      clipStartBarForHeadTrim({
        headTrimSeconds: Number.NaN,
        tempo: 120,
      }),
    ).toBe(0);
  });

  it("falls back to 120 BPM for an unusable tempo", () => {
    expect(
      clipStartBarForHeadTrim({ headTrimSeconds: 2, tempo: 0 }),
    ).toBeCloseTo(1, 6);
  });
});
