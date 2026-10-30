import { alignRecordingStart } from "./recording-start-alignment.util";

/** 120 BPM in 4/4: one 16th step is 0.125 s. */
const TEMPO = 120;

describe("alignRecordingStart", () => {
  it("starts on the punch with no trim when capture timing is unknown", () => {
    expect(
      alignRecordingStart({
        punchStep: 32,
        punchTime: 10,
        captureStartTime: null,
        tempo: TEMPO,
      }),
    ).toEqual({
      startStep: 32,
      trimSeconds: 0,
      captureStep: null,
      startLatencySeconds: 0,
    });
  });

  it("moves the clip with capture that started after the punch", () => {
    // 40 ms late = 0.32 steps.
    const result = alignRecordingStart({
      punchStep: 32,
      punchTime: 10,
      captureStartTime: 10.04,
      tempo: TEMPO,
    });

    expect(result.startStep).toBeCloseTo(32.32, 6);
    expect(result.captureStep).toBeCloseTo(32.32, 6);
    expect(result.trimSeconds).toBe(0);
    expect(result.startLatencySeconds).toBeCloseTo(0.04, 6);
  });

  it("trims pre-roll when capture starts before the punch", () => {
    // The transport's first audible step is still 45 ms away: capture is at
    // -0.36 steps, 4 ms after arm (-0.32 steps after frame arrival).
    const result = alignRecordingStart({
      punchStep: -0.36,
      punchTime: 10,
      captureStartTime: 10.004,
      tempo: TEMPO,
    });

    expect(result.startStep).toBe(0);
    expect(result.captureStep).toBeCloseTo(-0.328, 6);
    expect(result.trimSeconds).toBeCloseTo(0.041, 6);
  });

  it("moves the performance anchor earlier by input round-trip latency", () => {
    const result = alignRecordingStart({
      punchStep: 32,
      punchTime: 10,
      captureStartTime: 10.04,
      tempo: TEMPO,
      inputLatencySeconds: 0.02,
    });

    // 40 ms to the worklet minus 20 ms of interface latency = 0.16 steps.
    expect(result.captureStep).toBeCloseTo(32.16, 6);
    expect(result.trimSeconds).toBe(0);
  });

  it("trims pre-roll created by input latency", () => {
    const result = alignRecordingStart({
      punchStep: 0,
      punchTime: 0,
      captureStartTime: 0.01,
      tempo: TEMPO,
      inputLatencySeconds: 0.03,
    });

    // Anchor is 20 ms before the punch, so those 20 ms are pre-roll.
    expect(result.startStep).toBe(0);
    expect(result.trimSeconds).toBeCloseTo(0.02, 6);
  });

  it("scales with tempo and the step grid", () => {
    // At 90 BPM a 16th is 0.1666 s, so 0.05 s is 0.3 steps.
    const result = alignRecordingStart({
      punchStep: 8,
      punchTime: 2,
      captureStartTime: 2.05,
      tempo: 90,
    });

    expect(result.startStep).toBeCloseTo(8.3, 6);
    expect(result.trimSeconds).toBe(0);
  });

  it("clamps impossible punch positions and falls back to 120 BPM", () => {
    const result = alignRecordingStart({
      punchStep: -2,
      punchTime: 0,
      captureStartTime: 0,
      tempo: 0,
    });

    expect(result.startStep).toBe(0);
    expect(result.trimSeconds).toBeCloseTo(0.25, 6);
  });
});
