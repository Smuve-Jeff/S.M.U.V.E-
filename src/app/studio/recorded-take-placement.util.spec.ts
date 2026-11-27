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

  it("places a take across a mid-song meter change from the engine's bar map", () => {
    // Two 4/4 bars at steps 0 and 16, then 3/4 from step 32 (12-step bars).
    const barPositionAtStep = (step: number) => {
      if (step < 16) return step / 16;
      if (step < 32) return 1 + (step - 16) / 16;
      if (step < 44) return 2 + (step - 32) / 12;
      return 3 + (step - 44) / 16;
    };
    const placement = takePlacementFor({
      startStep: 32,
      durationSeconds: 1.5, // one 3/4 bar at 120 BPM, not a 2 s 4/4 bar
      tempo: 120,
      barPositionAtStep,
    });
    expect(placement).toEqual({ startBar: 2, lengthBars: 1 });
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
