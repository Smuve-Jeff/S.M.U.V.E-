import {
  LoudnessMeter,
  analyseChannels,
  kWeightedGainDb,
  phaseCorrelation,
  samplePeakDb,
  truePeakDb,
  toDecibels,
} from './loudness-meter';

const SAMPLE_RATE = 48000;

/** Steady sine, `amplitude` peak, in one channel. */
const sine = (
  frequencyHz: number,
  amplitude: number,
  seconds: number,
  phase = 0,
  sampleRate = SAMPLE_RATE,
): Float32Array => {
  const data = new Float32Array(Math.round(sampleRate * seconds));
  for (let n = 0; n < data.length; n++) {
    data[n] = amplitude * Math.sin((2 * Math.PI * frequencyHz * n) / sampleRate + phase);
  }
  return data;
};

/** dBFS of a sine's RMS level. */
const rmsDb = (amplitude: number): number => toDecibels(amplitude / Math.SQRT2);

/** The standard's equation for a steady tone, per the module's own filters. */
const expectedLufs = (
  amplitude: number,
  frequencyHz: number,
  channelCount: number,
): number =>
  -0.691 +
  10 *
    Math.log10(
      channelCount * (amplitude / Math.SQRT2) ** 2 *
        10 ** (kWeightedGainDb(SAMPLE_RATE, frequencyHz) / 10),
    );

describe('K-weighting filters (BS.1770-4)', () => {
  it('reproduces the published K-weighting curve', () => {
    // The standard's curve, as published: +0.65 dB at the 1 kHz reference,
    // a +4 dB plateau above ~10 kHz, and -13.3 dB / -5.6 dB at 20 / 40 Hz.
    // These are the values the K-weighting network is defined by, so they are
    // the tightest check that the filter design is the standard's.
    expect(kWeightedGainDb(SAMPLE_RATE, 1000)).toBeCloseTo(0.654, 2);
    expect(kWeightedGainDb(SAMPLE_RATE, 10000)).toBeCloseTo(4, 1);
    expect(kWeightedGainDb(SAMPLE_RATE, 20000)).toBeCloseTo(4, 1);
    expect(kWeightedGainDb(SAMPLE_RATE, 20)).toBeCloseTo(-13.3, 1);
    expect(kWeightedGainDb(SAMPLE_RATE, 40)).toBeCloseTo(-5.6, 1);
    // The design is rate-independent: 44.1 kHz agrees with 48 kHz.
    expect(kWeightedGainDb(44100, 1000)).toBeCloseTo(
      kWeightedGainDb(48000, 1000),
      2,
    );
    expect(kWeightedGainDb(44100, 20)).toBeCloseTo(kWeightedGainDb(48000, 20), 1);
    // Monotonic rise through the shelf region.
    expect(kWeightedGainDb(SAMPLE_RATE, 2000)).toBeGreaterThan(
      kWeightedGainDb(SAMPLE_RATE, 1000),
    );
  });
});

describe('LoudnessMeter integrated loudness', () => {
  it('measures a stereo 1 kHz tone against the standard equation', () => {
    const amplitude = 0.1;
    const channel = sine(1000, amplitude, 2);
    const meter = new LoudnessMeter(SAMPLE_RATE, 2);
    meter.push([channel, channel]);

    expect(meter.integratedLufs()).toBeCloseTo(
      expectedLufs(amplitude, 1000, 2),
      0,
    );
  });

  it('reports one channel of a stereo pair lower than two', () => {
    const channel = sine(1000, 0.1, 2);
    const mono = new LoudnessMeter(SAMPLE_RATE, 1);
    mono.push([channel]);
    const stereo = new LoudnessMeter(SAMPLE_RATE, 2);
    stereo.push([channel, channel]);

    // Summing the weighted channel energies is worth +3.01 LU.
    expect(stereo.integratedLufs() - mono.integratedLufs()).toBeCloseTo(3.01, 1);
  });

  it('gates silence out instead of averaging it in', () => {
    const tone = sine(1000, 0.1, 2);
    const silence = new Float32Array(SAMPLE_RATE * 2);

    const toneOnly = new LoudnessMeter(SAMPLE_RATE, 2);
    toneOnly.push([tone, tone]);

    const toneThenSilence = new LoudnessMeter(SAMPLE_RATE, 2);
    toneThenSilence.push([tone, tone]);
    toneThenSilence.push([silence, silence]);

    const gated = toneThenSilence.integratedLufs();
    const reference = toneOnly.integratedLufs();

    // An ungated mean over equal loud and silent halves would land ~3 LU low;
    // only the 400 ms blocks straddling the edit may pull it down at all.
    expect(gated).toBeCloseTo(reference, 0);
    expect(gated - reference).toBeGreaterThan(-0.5);
    expect(gated - reference).toBeLessThan(0.1);
    expect(gated).toBeGreaterThan(reference - 3.01 + 2);
  });

  it('averages flagged program material in the energy domain', () => {
    const loud = sine(1000, 0.1, 2);
    const quiet = sine(1000, 0.02, 2); // 14 dB down: below the relative gate
    const meter = new LoudnessMeter(SAMPLE_RATE, 2);
    meter.push([loud, loud]);
    meter.push([quiet, quiet]);

    // The quiet half is 14 LU under the mean, so the relative gate discards it
    // and the reading stays on the loud section.
    expect(meter.integratedLufs()).toBeCloseTo(expectedLufs(0.1, 1000, 2), 0);
  });

  it('returns -Infinity rather than a fake floor before it has a block', () => {
    const meter = new LoudnessMeter(SAMPLE_RATE, 2);
    expect(meter.integratedLufs()).toBe(Number.NEGATIVE_INFINITY);
    // A single 100 ms hop is not yet a 400 ms block.
    meter.push([new Float32Array(4800), new Float32Array(4800)]);
    expect(meter.integratedLufs()).toBe(Number.NEGATIVE_INFINITY);
  });

  it('resets all measurement history', () => {
    const channel = sine(1000, 0.1, 1);
    const meter = new LoudnessMeter(SAMPLE_RATE, 2);
    meter.push([channel, channel]);
    expect(meter.hopCount).toBeGreaterThan(0);
    meter.reset();
    expect(meter.hopCount).toBe(0);
    expect(meter.integratedLufs()).toBe(Number.NEGATIVE_INFINITY);
  });

  it('measures loudness range across quiet and loud sections', () => {
    const quiet = sine(1000, 0.02, 4);
    const loud = sine(1000, 0.2, 4);
    const meter = new LoudnessMeter(SAMPLE_RATE, 2);
    meter.push([quiet, quiet]);
    meter.push([loud, loud]);

    // 20 dB between the two sections; the range must see it (and never be a
    // constant, which is what the panel used to display).
    expect(meter.loudnessRangeLu()).toBeGreaterThan(10);
    expect(meter.loudnessRangeLu()).toBeLessThan(25);
  });
});

describe('true peak', () => {
  it('sees the inter-sample peak a sample meter misses', () => {
    // fs/4 tone at 45 degrees: every sample lands on ±A/√2, so the sample peak
    // reads -3 dB while the reconstructed waveform really reaches A.
    const amplitude = 0.5;
    const channel = sine(SAMPLE_RATE / 4, amplitude, 0.5, Math.PI / 4);

    expect(samplePeakDb([channel])).toBeCloseTo(
      toDecibels(amplitude / Math.SQRT2),
      1,
    );
    expect(truePeakDb([channel])).toBeCloseTo(toDecibels(amplitude), 1);
    expect(truePeakDb([channel]) - samplePeakDb([channel])).toBeCloseTo(3.01, 0);
  });

  it('cannot report less than the sample peak', () => {
    const channel = sine(440, 0.8, 0.2);
    expect(truePeakDb([channel])).toBeGreaterThanOrEqual(
      samplePeakDb([channel]) - 0.01,
    );
  });

  it('measures every channel, not just the first', () => {
    const left = new Float32Array(SAMPLE_RATE / 10);
    const right = sine(300, 0.9, 0.1);

    // The old analysis read channel 0 only, so a hard-right master looked silent.
    expect(truePeakDb([left, right])).toBeCloseTo(toDecibels(0.9), 0);
    expect(samplePeakDb([left, right])).toBeCloseTo(toDecibels(0.9), 0);
  });
});

describe('phase correlation', () => {
  it('reports +1 for identical channels and -1 when inverted', () => {
    const left = sine(220, 0.5, 0.3);
    const inverted = Float32Array.from(left, (value) => -value);
    expect(phaseCorrelation(left, left)).toBeCloseTo(1, 2);
    expect(phaseCorrelation(left, inverted)).toBeCloseTo(-1, 2);
  });

  it('reports a wide value for decorrelated channels', () => {
    const left = sine(220, 0.5, 0.3);
    const right = sine(330, 0.5, 0.3);
    const correlation = phaseCorrelation(left, right);
    expect(correlation).toBeGreaterThan(-1);
    expect(correlation).toBeLessThan(1);
  });

  it('does not let a DC offset masquerade as correlation', () => {
    const left = new Float32Array(4800).fill(0.5);
    const right = sine(1000, 0.5, 0.1);
    // A DC-vs-sine comparison has no shared movement once the means are gone.
    expect(Math.abs(phaseCorrelation(left, right))).toBeLessThan(0.05);
  });
});

describe('analyseChannels', () => {
  it('reports the standard set of measurements for a render', () => {
    const channel = sine(1000, 0.1, 2);
    const stats = analyseChannels([channel, channel], SAMPLE_RATE);

    expect(stats.lufs).toBeCloseTo(expectedLufs(0.1, 1000, 2), 0);
    expect(stats.truePeakDb).toBeCloseTo(toDecibels(0.1), 1);
    expect(stats.samplePeakDb).toBeCloseTo(toDecibels(0.1), 1);
    // A steady tone has no loudness range to speak of.
    expect(stats.lra).toBeLessThan(1);
  });

  it('reports silence without NaN and without a phantom loudness', () => {
    const silence = new Float32Array(SAMPLE_RATE);
    const stats = analyseChannels([silence, silence], SAMPLE_RATE);

    expect(Number.isNaN(stats.lufs)).toBe(false);
    expect(stats.lufs).toBe(-Infinity);
    expect(stats.truePeakDb).toBeCloseTo(-120, 0);
    expect(Number.isNaN(stats.lra)).toBe(false);
  });

  it('keeps RMS-based arithmetic sane for a known level', () => {
    const channel = sine(1000, 0.5, 1);
    const stats = analyseChannels([channel], SAMPLE_RATE);
    // Not the point of this module, but the classic reference must still hold.
    expect(toDecibels(0.5 / Math.SQRT2)).toBeCloseTo(rmsDb(0.5), 3);
    expect(stats.truePeakDb).toBeCloseTo(toDecibels(0.5), 1);
  });
});
