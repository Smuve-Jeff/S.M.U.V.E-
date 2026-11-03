import {
  FADE_RAMP_STEPS,
  fadeValueAtPhase,
  normalizeFadeCurve,
  scheduleFadeSegment,
} from "./clip-fade.util";

function fakeParam() {
  const ramps: Array<{ value: number; time: number }> = [];
  return {
    ramps,
    linearRampToValueAtTime: (value: number, time: number) => {
      ramps.push({ value, time });
    },
  } as unknown as AudioParam & { ramps: typeof ramps };
}

describe("clip fade curves", () => {
  it("keeps the original linear envelope by default", () => {
    expect(fadeValueAtPhase(0.25, "in", "linear")).toBeCloseTo(0.25);
    expect(fadeValueAtPhase(0.25, "out", "linear")).toBeCloseTo(0.75);
  });

  it("uses complementary sine/cosine gains for an equal-power hand-off", () => {
    const incoming = fadeValueAtPhase(0.5, "in", "equalPower");
    const outgoing = fadeValueAtPhase(0.5, "out", "equalPower");

    expect(incoming).toBeCloseTo(Math.SQRT1_2, 6);
    expect(outgoing).toBeCloseTo(Math.SQRT1_2, 6);
    expect(incoming ** 2 + outgoing ** 2).toBeCloseTo(1, 6);
  });

  it("falls back to linear for persisted or unknown curve values", () => {
    expect(normalizeFadeCurve("equalPower")).toBe("equalPower");
    expect(normalizeFadeCurve("bezier")).toBe("linear");
    expect(normalizeFadeCurve(undefined)).toBe("linear");
  });

  it("schedules equal-power fades as a ramp chain that reaches the endpoints", () => {
    const incoming = fakeParam();
    scheduleFadeSegment(incoming, "in", "equalPower", 2, 4, 0.8);

    expect(incoming.ramps).toHaveLength(FADE_RAMP_STEPS);
    expect(incoming.ramps.at(-1)).toEqual({ value: 0.8, time: 6 });

    const outgoing = fakeParam();
    scheduleFadeSegment(outgoing, "out", "equalPower", 10, 2, 0.8);

    expect(outgoing.ramps).toHaveLength(FADE_RAMP_STEPS);
    expect(outgoing.ramps.at(-1)).toEqual({ value: 0, time: 12 });
  });

  it("resumes a fade from its current phase without restarting at zero", () => {
    const param = fakeParam();
    scheduleFadeSegment(param, "in", "equalPower", 5, 4, 1, 0.5);

    expect(param.ramps).toHaveLength(FADE_RAMP_STEPS);
    expect(param.ramps[0].value).toBeGreaterThan(Math.SQRT1_2);
    expect(param.ramps[0].time).toBeCloseTo(5.0833, 3);
    expect(param.ramps.at(-1)).toEqual({ value: 1, time: 7 });
  });
});
