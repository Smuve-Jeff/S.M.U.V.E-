import { takePlacementFor } from "./recorded-take-placement.util";

describe("takePlacementFor", () => {
  it("starts the clip exactly on the punch step, not a rounded bar", () => {
    // Step 40 is bar 2.5 — a take punched in mid-bar must not drift.
    expect(
      takePlacementFor({ startStep: 40, durationSeconds: 2, tempo: 120 })
        .startBar,
    ).toBe(2.5);
  });

  it("sizes the clip in bars for the tempo it was played at", () => {
    // 120 BPM: 4 beats × 0.5 s = 2 s per bar.
    expect(
      takePlacementFor({ startStep: 0, durationSeconds: 2, tempo: 120 })
        .lengthBars,
    ).toBe(1);
    expect(
      takePlacementFor({ startStep: 0, durationSeconds: 4, tempo: 120 })
        .lengthBars,
    ).toBe(2);
    // 90 BPM: 2.667 s per bar — the same performance spans more bars.
    expect(
      takePlacementFor({ startStep: 0, durationSeconds: 4, tempo: 90 })
        .lengthBars,
    ).toBe(1.5);
  });

  it("rounds the tail up to a quarter bar so no audio is clipped", () => {
    expect(
      takePlacementFor({ startStep: 0, durationSeconds: 2.05, tempo: 120 })
        .lengthBars,
    ).toBe(1.25);
    expect(
      takePlacementFor({ startStep: 0, durationSeconds: 0.1, tempo: 120 })
        .lengthBars,
    ).toBe(0.25);
  });

  it("falls back to 120 BPM and clamps impossible positions", () => {
    const placement = takePlacementFor({
      startStep: -8,
      durationSeconds: -1,
      tempo: 0,
    });
    expect(placement).toEqual({ startBar: 0, lengthBars: 0.25 });
  });
});
