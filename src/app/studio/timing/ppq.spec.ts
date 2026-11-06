import {
  PPQ,
  PPQ_TICKS,
  TICKS_PER_STEP,
  quantizeMicroOffset,
  ratchetOffsetTicks,
  secondsToTicks,
  stepTiming,
  stepsToTicks,
  swingDelayTicks,
  ticksToSecondsAtBpm,
  ticksToSteps,
} from "./ppq";

describe("PPQ timing", () => {
  it("uses 960 ticks per quarter and 240 per 16th step", () => {
    expect(PPQ).toBe(960);
    expect(TICKS_PER_STEP).toBe(240);
    expect(PPQ_TICKS.quarter).toBe(960);
    expect(PPQ_TICKS.sixteenth).toBe(240);
  });

  it("represents triplets and dotted values as whole ticks", () => {
    expect(PPQ_TICKS.eighthTriplet).toBe(320);
    expect(PPQ_TICKS.sixteenthTriplet).toBe(160);
    expect(PPQ_TICKS.dottedSixteenth).toBe(360);
    expect(stepsToTicks(4 / 3)).toBe(320);
    expect(stepsToTicks(4 + 4 / 3)).toBe(1280);
    expect(ticksToSteps(320)).toBeCloseTo(4 / 3, 12);
  });

  it.each([60, 90, 124, 120, 174, 200])(
    "keeps a triplet exactly a third of a step late at %i BPM",
    (bpm) => {
      const stepDuration = 60 / bpm / 4;
      const timing = stepTiming(5, stepDuration);
      const tripletSeconds = stepsToTicks(1 / 3) * timing.secondsPerTick;

      expect(timing.ticksPerStep).toBe(240);
      expect(timing.secondsPerTick * 240).toBeCloseTo(stepDuration, 12);
      expect(tripletSeconds).toBeCloseTo(stepDuration / 3, 12);
      expect(ticksToSecondsAtBpm(320, bpm)).toBeCloseTo(
        (4 / 3) * stepDuration,
        12,
      );
    },
  );

  it("round-trips seconds through the tick grid at each tempo", () => {
    for (const bpm of [60, 90, 120, 174]) {
      const seconds = 0.3333333333;
      const ticks = secondsToTicks(seconds, bpm);
      expect(ticksToSecondsAtBpm(ticks, bpm)).toBeCloseTo(seconds, 8);
    }
  });

  it("quantizes swing and ratchets to integer ticks", () => {
    expect(swingDelayTicks(0.5)).toBe(120);
    expect(swingDelayTicks(0.4, 0.5)).toBe(48);
    expect(swingDelayTicks(0.9)).toBe(216);
    expect(swingDelayTicks(1.2)).toBe(240); // clamped to one step
    expect(ratchetOffsetTicks(1, 4)).toBe(60);
    expect(ratchetOffsetTicks(2, 3)).toBe(160);
    expect(ratchetOffsetTicks(1, 5)).toBe(48);
  });

  it("snaps micro-offsets to whole ticks without drifting", () => {
    expect(quantizeMicroOffset(1 / 3)).toBeCloseTo(80 / 240, 12);
    expect(stepsToTicks(quantizeMicroOffset(1 / 3))).toBe(80);
    expect(quantizeMicroOffset(-1 / 7)).toBeCloseTo(-34 / 240, 12);
  });
});
