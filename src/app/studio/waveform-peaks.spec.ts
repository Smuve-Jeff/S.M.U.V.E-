import { computeWaveformPeaks, foldChannelsToPeak } from "./waveform-peaks";

/**
 * The comp view draws one strip per take, so the buckets have to describe the
 * audio: peaks (not averages), folded across channels, and never NaN from an
 * empty decode.
 */
describe("computeWaveformPeaks", () => {
  it("reports the loudest sample in each bucket", () => {
    const samples = Float32Array.from([0, 0.2, -0.9, 0.1, 0.4, -0.3, 0.05, 0]);

    const peaks = computeWaveformPeaks([samples], 4);

    expect(peaks).toHaveLength(4);
    expect(peaks[0]).toBeCloseTo(0.2);
    expect(peaks[1]).toBeCloseTo(0.9);
    expect(peaks[2]).toBeCloseTo(0.4);
    expect(peaks[3]).toBeCloseTo(0.05);
  });

  it("keeps a one-sided take at full height", () => {
    const left = Float32Array.from([0, 0, 0, 0]);
    const right = Float32Array.from([0.5, -0.75, 0.2, 0.1]);

    const peaks = computeWaveformPeaks([left, right], 2);

    expect(peaks[0]).toBeCloseTo(0.75);
    expect(peaks[1]).toBeCloseTo(0.2);
  });

  it("folds a one-sided file into a strip instead of channel zero", () => {
    const left = Float32Array.from([0, 0.2, 0, 0]);
    const right = Float32Array.from([0.6, -0.9, 0, 0.3]);

    const folded = foldChannelsToPeak([left, right]);

    // Loudest absolute sample wins per frame and keeps its sign.
    [0.6, -0.9, 0, 0.3].forEach((sample, index) => {
      expect(folded[index]).toBeCloseTo(sample);
    });
  });

  it("never truncates the longer channel while folding", () => {
    const short = Float32Array.from([0.1, -0.2]);
    const long = Float32Array.from([0, 0, 0.8, -0.4]);

    const folded = foldChannelsToPeak([short, long]);

    expect(folded).toHaveLength(4);
    // Float32Array storage rounds the values, so compare per frame.
    [0.1, -0.2, 0.8, -0.4].forEach((sample, index) => {
      expect(folded[index]).toBeCloseTo(sample);
    });
  });

  it("clamps overshoot and ignores non-finite samples", () => {
    const samples = Float32Array.from([2, Number.NaN, -1]);

    const peaks = computeWaveformPeaks([samples], 1);

    expect(peaks).toEqual([1]);
  });

  it("gives buckets to very short takes", () => {
    const peaks = computeWaveformPeaks([Float32Array.from([0.4])], 3);

    expect(peaks).toHaveLength(3);
    for (const peak of peaks) expect(peak).toBeCloseTo(0.4);
  });

  it("returns nothing for empty input or no bars", () => {
    expect(computeWaveformPeaks([], 48)).toEqual([]);
    expect(computeWaveformPeaks([new Float32Array(0)], 48)).toEqual([]);
    expect(computeWaveformPeaks([Float32Array.from([0.5])], 0)).toEqual([]);
  });
});
