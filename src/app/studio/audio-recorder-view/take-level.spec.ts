import {
  SILENT_PEAK,
  LOW_PEAK,
  classifyTakeLevel,
  measureTakeSignal,
  takeLevelNotice,
} from "./take-level";

describe("take level", () => {
  it("measures peak across every channel, not just the first", () => {
    const signal = measureTakeSignal([
      new Float32Array([0, 0.1, -0.2]),
      new Float32Array([0, 0.05, -0.9]),
    ]);

    expect(signal?.peak).toBeCloseTo(0.9, 5);
    expect(signal?.rms).toBeGreaterThan(0);
  });

  it("reports no measurement for zero-length audio, but real silence as silent", () => {
    expect(measureTakeSignal([])).toBeNull();
    expect(measureTakeSignal([new Float32Array(0)])).toBeNull();
    // A channel of genuine zeros *is* a silent take and must be flagged.
    expect(classifyTakeLevel(measureTakeSignal([new Float32Array(48)]))).toBe(
      "silent",
    );
  });

  it("treats an empty or missing reading as unknown rather than silent", () => {
    // No samples is not evidence of a silent take — it is evidence of no
    // measurement, and a red flag the artist cannot act on is worse than none.
    expect(classifyTakeLevel(null)).toBe("unknown");
    expect(classifyTakeLevel(measureTakeSignal([]))).toBe("unknown");
    expect(classifyTakeLevel({ peak: Number.NaN, rms: 0 })).toBe("unknown");
  });

  it("classifies a denormal take as silent", () => {
    // The real capture measured ~2.7e-34 when the fake device fell back to
    // silence: quantization noise, not signal.
    expect(classifyTakeLevel({ peak: 2.7e-34, rms: 1e-34 })).toBe("silent");
    expect(classifyTakeLevel({ peak: SILENT_PEAK / 2, rms: 0 })).toBe("silent");
  });

  it("classifies a quiet-but-real take as low", () => {
    expect(classifyTakeLevel({ peak: SILENT_PEAK, rms: 0.0001 })).toBe("low");
    expect(classifyTakeLevel({ peak: LOW_PEAK / 2, rms: 0.001 })).toBe("low");
    expect(classifyTakeLevel({ peak: LOW_PEAK, rms: 0.005 })).toBe("ok");
  });

  it("only badges and warns for the two problem levels", () => {
    expect(takeLevelNotice("silent").badge).toBe("SILENT");
    expect(takeLevelNotice("silent").message).toContain("muted");
    expect(takeLevelNotice("low").badge).toBe("LOW");
    expect(takeLevelNotice("ok")).toEqual({ badge: "", message: null });
    expect(takeLevelNotice("unknown")).toEqual({ badge: "", message: null });
  });
});
