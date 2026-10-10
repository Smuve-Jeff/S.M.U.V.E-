/**
 * ITU-R BS.1770-4 / EBU R 128 loudness measurement, shared by every surface
 * that claims to report loudness.
 *
 * This exists because the numbers were previously produced two different ways
 * that disagreed with each other and with the standard:
 *
 *  - the offline render analysed `20·log10(rms) + 4` of ONE channel and showed
 *    it as "Integrated LUFS";
 *  - the live meter read one K-weighted analyser frame every 50 ms and showed
 *    the momentary value under the same label.
 *
 * Neither applied the standard's gating, so a track with quiet passages or
 * silence read differently from the loudness a streaming platform will
 * normalise on. Everything here follows BS.1770-4:
 *
 *  - two-stage K-weighting (high-shelf then RLB high-pass), designed per rate;
 *  - 400 ms blocks with 75% overlap (100 ms hop);
 *  - absolute gate at -70 LUFS, then a relative gate 10 LU below;
 *  - integrated loudness = -0.691 + 10·log10(mean of the gated block energies).
 *
 * Channel weighting follows the standard for the stereo case we produce:
 * left and right each weight 1.0, and the channel energies are summed.
 */

/** One normalised biquad (a0 folded into the other coefficients). */
export interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** Loudness offset from BS.1770 (`L = -0.691 + 10·log10(z)`). */
export const LOUDNESS_OFFSET_DB = -0.691;
/** Below this, a block is discarded (absolute gate), in LUFS. */
export const ABSOLUTE_GATE_LUFS = -70;
/** Relative gate: this many LU below the absolute-gated mean. */
export const RELATIVE_GATE_LU = 10;
/** Short-term (LRA) relative gate, per EBU Tech 3342. */
export const LRA_RELATIVE_GATE_LU = 20;
/** 400 ms measurement blocks, 75% overlap → 100 ms hop. */
export const BLOCK_SECONDS = 0.4;
export const HOP_SECONDS = 0.1;
/** Short-term window used for loudness range (EBU Tech 3342). */
export const SHORT_TERM_SECONDS = 3;

/**
 * K-weighting stage 1 — the high-frequency shelving filter ("head/torso"
 * model). Parameters as documented for BS.1770-4 (DeMan parameterisation).
 */
const SHELF_FREQUENCY_HZ = 1681.974450955533;
const SHELF_GAIN_DB = 3.999843853973347;
const SHELF_Q = 0.7071752369554196;

/** K-weighting stage 2 — the RLB high-pass filter. */
const RLB_FREQUENCY_HZ = 38.13547087602444;
const RLB_Q = 0.5003270373238773;

/** RBJ high-shelf, with the BS.1770 shelf's Vb exponent. */
export function kWeightingShelfCoefficients(
  sampleRate: number,
): BiquadCoefficients {
  const k = Math.tan((Math.PI * SHELF_FREQUENCY_HZ) / sampleRate);
  const vh = Math.pow(10, SHELF_GAIN_DB / 20);
  const vb = Math.pow(vh, 0.4996667741545416);
  const kSquared = k * k;
  const a0 = 1 + k / SHELF_Q + kSquared;
  return {
    b0: (vh + (vb * k) / SHELF_Q + kSquared) / a0,
    b1: (2 * (kSquared - vh)) / a0,
    b2: (vh - (vb * k) / SHELF_Q + kSquared) / a0,
    a1: (2 * (kSquared - 1)) / a0,
    a2: (1 - k / SHELF_Q + kSquared) / a0,
  };
}

/** RBJ high-pass — the RLB stage that removes the very low end. */
export function rlbHighPassCoefficients(
  sampleRate: number,
): BiquadCoefficients {
  const k = Math.tan((Math.PI * RLB_FREQUENCY_HZ) / sampleRate);
  const kSquared = k * k;
  const a0 = 1 + k / RLB_Q + kSquared;
  return {
    b0: 1 / a0,
    b1: -2 / a0,
    b2: 1 / a0,
    a1: (2 * (kSquared - 1)) / a0,
    a2: (1 - k / RLB_Q + kSquared) / a0,
  };
}

/** Magnitude response of a biquad at `frequencyHz`, as a linear gain. */
export function biquadGainAt(
  coefficients: BiquadCoefficients,
  sampleRate: number,
  frequencyHz: number,
): number {
  const w = (2 * Math.PI * frequencyHz) / sampleRate;
  const cos1 = Math.cos(w);
  const sin1 = Math.sin(w);
  const cos2 = Math.cos(2 * w);
  const sin2 = Math.sin(2 * w);
  const { b0, b1, b2, a1, a2 } = coefficients;
  const numReal = b0 + b1 * cos1 + b2 * cos2;
  const numImag = -(b1 * sin1 + b2 * sin2);
  const denReal = 1 + a1 * cos1 + a2 * cos2;
  const denImag = -(a1 * sin1 + a2 * sin2);
  const num = Math.hypot(numReal, numImag);
  const den = Math.hypot(denReal, denImag);
  return den === 0 ? 0 : num / den;
}

/**
 * Combined K-weighting gain (dB) at `frequencyHz`.
 *
 * Exposed so tests can check the meter's output against the standard's own
 * equation instead of against a number copied from a table.
 */
export function kWeightedGainDb(
  sampleRate: number,
  frequencyHz: number,
): number {
  const shelf = biquadGainAt(
    kWeightingShelfCoefficients(sampleRate),
    sampleRate,
    frequencyHz,
  );
  const highPass = biquadGainAt(
    rlbHighPassCoefficients(sampleRate),
    sampleRate,
    frequencyHz,
  );
  const gain = shelf * highPass;
  return gain <= 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(gain);
}

/** Stateful direct-form-1 biquad applied sample by sample. */
export class BiquadFilter {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(private coefficients: BiquadCoefficients) {}

  process(sample: number): number {
    const { b0, b1, b2, a1, a2 } = this.coefficients;
    const y = b0 * sample + b1 * this.x1 + b2 * this.x2 - a1 * this.y1 - a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = sample;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }

  reset(): void {
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }
}

interface GatedBlock {
  /** Block energy sum (mean squares already summed across weighted channels). */
  energy: number;
  /** Block loudness in LUFS. */
  loudness: number;
}

/**
 * Streaming loudness meter.
 *
 * Holds no sample history: it accumulates squared K-weighted samples into
 * 100 ms hops and derives the 400 ms blocks (and 3 s short-term windows) from
 * sliding sums of those hops, which is O(1) memory per sample and keeps the
 * live meter cheap on a phone.
 */
export class LoudnessMeter {
  private readonly shelf: BiquadFilter[];
  private readonly highPass: BiquadFilter[];
  /** Per-channel partial sums for the hop currently being filled. */
  private readonly hopAccumulator: number[];
  private readonly hopSampleCount: number;
  private readonly hopSamples: number;
  /** Completed hops, newest last: `hopSums[channel][hopIndex]`. */
  private hopSums: number[][];
  private samplesUntilHop: number;

  constructor(
    readonly sampleRate: number,
    readonly channelCount: number,
  ) {
    this.shelf = Array.from(
      { length: channelCount },
      () => new BiquadFilter(kWeightingShelfCoefficients(sampleRate)),
    );
    this.highPass = Array.from(
      { length: channelCount },
      () => new BiquadFilter(rlbHighPassCoefficients(sampleRate)),
    );
    this.hopAccumulator = new Array(channelCount).fill(0);
    this.hopSums = Array.from({ length: channelCount }, () => [] as number[]);
    this.hopSamples = Math.max(1, Math.round(sampleRate * HOP_SECONDS));
    this.samplesUntilHop = this.hopSamples;
  }

  /**
   * Feed the next contiguous run of frames. `channels[i]` holds `frameCount`
   * samples of channel i; every channel must supply the same frame count,
   * because the standard sums identical time spans across channels.
   */
  push(channels: Float32Array[], frameCount = channels[0]?.length ?? 0): void {
    if (channels.length < this.channelCount || frameCount <= 0) return;
    let frame = 0;
    while (frame < frameCount) {
      // Only advance as far as the current hop can take us.
      const run = Math.min(this.samplesUntilHop, frameCount - frame);
      for (let channel = 0; channel < this.channelCount; channel++) {
        const input = channels[channel];
        const shelf = this.shelf[channel];
        const highPass = this.highPass[channel];
        let sum = this.hopAccumulator[channel];
        for (let i = frame; i < frame + run; i++) {
          const weighted = highPass.process(shelf.process(input[i]));
          sum += weighted * weighted;
        }
        this.hopAccumulator[channel] = sum;
      }
      frame += run;
      this.samplesUntilHop -= run;
      if (this.samplesUntilHop === 0) this.completeHop();
    }
  }

  private completeHop(): void {
    for (let channel = 0; channel < this.channelCount; channel++) {
      this.hopSums[channel].push(this.hopAccumulator[channel]);
      this.hopAccumulator[channel] = 0;
    }
    this.samplesUntilHop = this.hopSamples;
  }

  /** Number of full 100 ms hops measured so far. */
  get hopCount(): number {
    return this.hopSums[0]?.length ?? 0;
  }

  /** Drop all measurement history (call on transport start). */
  reset(): void {
    for (const filter of this.shelf) filter.reset();
    for (const filter of this.highPass) filter.reset();
    this.hopAccumulator.fill(0);
    this.hopSums = Array.from(
      { length: this.channelCount },
      () => [] as number[],
    );
    this.samplesUntilHop = this.hopSamples;
  }

  /**
   * K-weighted block energies for a sliding window of `windowHops` hops,
   * stepped every hop — the standard's overlapping-block geometry.
   * Returns an empty list until a full window has been measured.
   */
  private blockEnergies(windowHops: number, strideHops = 1): number[] {
    const hops = this.hopCount;
    if (hops < windowHops) return [];
    const energies: number[] = [];
    for (let end = windowHops; end <= hops; end += strideHops) {
      let energy = 0;
      for (let channel = 0; channel < this.channelCount; channel++) {
        const sums = this.hopSums[channel];
        let channelSum = 0;
        for (let hop = end - windowHops; hop < end; hop++) {
          channelSum += sums[hop];
        }
        // Channel weighting for stereo is 1.0 per channel; summing the
        // channels is what the standard's G_i coefficient expresses.
        energy += channelSum / (windowHops * this.hopSamples);
      }
      energies.push(energy);
    }
    return energies;
  }

  /** Gated integrated loudness in LUFS, or `-Infinity` before any block. */
  integratedLufs(): number {
    const blocks = this.gatedBlocks(BLOCK_SECONDS / HOP_SECONDS);
    if (blocks.length === 0) return Number.NEGATIVE_INFINITY;
    const mean =
      blocks.reduce((total, block) => total + block.energy, 0) / blocks.length;
    return LOUDNESS_OFFSET_DB + 10 * Math.log10(Math.max(mean, 1e-12));
  }

  /** Loudness of the most recent 400 ms window, in LUFS (momentary). */
  momentaryLufs(): number {
    const energies = this.blockEnergies(BLOCK_SECONDS / HOP_SECONDS);
    if (energies.length === 0) return Number.NEGATIVE_INFINITY;
    const energy = energies[energies.length - 1];
    return LOUDNESS_OFFSET_DB + 10 * Math.log10(Math.max(energy, 1e-12));
  }

  /** Loudness of the most recent 3 s window, in LUFS (short-term). */
  shortTermLufs(): number {
    const energies = this.blockEnergies(SHORT_TERM_SECONDS / HOP_SECONDS);
    if (energies.length === 0) return Number.NEGATIVE_INFINITY;
    const energy = energies[energies.length - 1];
    return LOUDNESS_OFFSET_DB + 10 * Math.log10(Math.max(energy, 1e-12));
  }

  /**
   * Loudness range (LRA) in LU, per EBU Tech 3342: the spread between the 10th
   * and 95th percentile of the gated short-term loudness.
   */
  loudnessRangeLu(): number {
    const energies = this.blockEnergies(SHORT_TERM_SECONDS / HOP_SECONDS);
    if (energies.length === 0) return 0;
    const loudness = energies.map((energy) =>
      LOUDNESS_OFFSET_DB + 10 * Math.log10(Math.max(energy, 1e-12)),
    );
    const gated = gateLoudness(loudness, LRA_RELATIVE_GATE_LU);
    if (gated.length < 2) return 0;
    return percentile(gated, 95) - percentile(gated, 10);
  }

  /** Absolute-then-relative gated 400 ms blocks, per BS.1770-4. */
  private gatedBlocks(windowHops: number): GatedBlock[] {
    const energies = this.blockEnergies(windowHops);
    const blocks = energies.map((energy) => ({
      energy,
      loudness: LOUDNESS_OFFSET_DB + 10 * Math.log10(Math.max(energy, 1e-12)),
    }));
    const aboveAbsolute = blocks.filter(
      (block) => block.loudness > ABSOLUTE_GATE_LUFS,
    );
    if (aboveAbsolute.length === 0) return [];
    const meanEnergy =
      aboveAbsolute.reduce((total, block) => total + block.energy, 0) /
      aboveAbsolute.length;
    const relativeGate =
      LOUDNESS_OFFSET_DB + 10 * Math.log10(Math.max(meanEnergy, 1e-12)) -
      RELATIVE_GATE_LU;
    return aboveAbsolute.filter((block) => block.loudness > relativeGate);
  }
}

/** Apply the absolute gate, then a relative gate `relativeGateLu` below. */
function gateLoudness(loudness: number[], relativeGateLu: number): number[] {
  const aboveAbsolute = loudness.filter((value) => value > ABSOLUTE_GATE_LUFS);
  if (aboveAbsolute.length === 0) return [];
  const meanLinear =
    aboveAbsolute.reduce((total, value) => total + 10 ** (value / 10), 0) /
    aboveAbsolute.length;
  const relativeGate = 10 * Math.log10(Math.max(meanLinear, 1e-12)) - relativeGateLu;
  return aboveAbsolute.filter((value) => value > relativeGate);
}

/** Linear-interpolated percentile of an ascending-copied sample set. */
function percentile(values: number[], percent: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const position = (percent / 100) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/** dBFS, floored so silence reports the same number everywhere. */
export function toDecibels(amplitude: number): number {
  return 20 * Math.log10(Math.max(Math.abs(amplitude), 1e-6));
}

/** Sample peak (dBFS) across every channel — the plain digital maximum. */
export function samplePeakDb(channels: Float32Array[]): number {
  let peak = 0;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i++) {
      const abs = Math.abs(channel[i]);
      if (abs > peak) peak = abs;
    }
  }
  return toDecibels(peak);
}

/** Taps per phase in the 4x true-peak interpolator (12 × 4 = 48 taps). */
const TRUE_PEAK_TAPS_PER_PHASE = 12;
const TRUE_PEAK_PHASES = 4;

/**
 * Windowed-sinc polyphase interpolation coefficients for 4x oversampling.
 *
 * BS.1770-4 measures true peak by *estimating* the reconstructed waveform, so
 * the interpolator only has to be good enough that the estimate cannot be off
 * by a meaningful fraction of a dB — a Blackman-Harris windowed sinc does that
 * comfortably, which is why meters use one rather than a shorter filter.
 */
const truePeakPhases: number[][] = (() => {
  const phases: number[][] = [];
  const half = TRUE_PEAK_TAPS_PER_PHASE / 2;
  for (let phase = 0; phase < TRUE_PEAK_PHASES; phase++) {
    const taps: number[] = [];
    const fraction = phase / TRUE_PEAK_PHASES;
    let sum = 0;
    for (let tap = 0; tap < TRUE_PEAK_TAPS_PER_PHASE; tap++) {
      const x = tap - half + 1 - fraction;
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      // Blackman-Harris window over the tap span.
      const windowPosition = (tap + 0.5) / TRUE_PEAK_TAPS_PER_PHASE;
      const window =
        0.35875 -
        0.48829 * Math.cos(2 * Math.PI * windowPosition) +
        0.14128 * Math.cos(4 * Math.PI * windowPosition) -
        0.01168 * Math.cos(6 * Math.PI * windowPosition);
      const value = sinc * window;
      taps.push(value);
      sum += value;
    }
    // Normalise each phase to unity DC gain so interpolation cannot scale the
    // signal (and therefore cannot invent or hide headroom).
    phases.push(taps.map((tap) => tap / sum));
  }
  return phases;
})();

/**
 * True-peak estimate in dBFS (BS.1770-4): the maximum of the 4x
 * over-sampled, reconstructed waveform across ALL channels.
 *
 * The old code took the largest stored sample of channel 0, which misses both
 * the right channel and every inter-sample peak, so a master could read "-1
 * dBTP" and still clip after a lossy transcode.
 */
export function truePeakDb(channels: Float32Array[]): number {
  let peak = 0;
  for (const channel of channels) {
    const length = channel.length;
    if (length === 0) continue;
    for (let i = 0; i < length; i++) {
      const abs = Math.abs(channel[i]);
      if (abs > peak) peak = abs;
    }
    const taps = TRUE_PEAK_TAPS_PER_PHASE;
    for (let i = 0; i < length; i++) {
      for (let phase = 1; phase < TRUE_PEAK_PHASES; phase++) {
        const coefficients = truePeakPhases[phase];
        let interpolated = 0;
        for (let tap = 0; tap < taps; tap++) {
          const index = i - (taps / 2 - 1) + tap;
          if (index < 0 || index >= length) continue;
          interpolated += coefficients[tap] * channel[index];
        }
        const abs = Math.abs(interpolated);
        if (abs > peak) peak = abs;
      }
    }
  }
  return toDecibels(peak);
}

/**
 * Phase correlation in [-1, 1] from real left/right vectors: +1 identical,
 * 0 uncorrelated, -1 out of phase. Means are removed so a DC offset cannot
 * masquerade as correlation.
 */
export function phaseCorrelation(
  left: Float32Array,
  right: Float32Array,
): number {
  const length = Math.min(left.length, right.length);
  if (length < 2) return 0;
  let leftMean = 0;
  let rightMean = 0;
  for (let i = 0; i < length; i++) {
    leftMean += left[i];
    rightMean += right[i];
  }
  leftMean /= length;
  rightMean /= length;
  let covariance = 0;
  let leftEnergy = 0;
  let rightEnergy = 0;
  for (let i = 0; i < length; i++) {
    const l = left[i] - leftMean;
    const r = right[i] - rightMean;
    covariance += l * r;
    leftEnergy += l * l;
    rightEnergy += r * r;
  }
  const denominator = Math.sqrt(leftEnergy * rightEnergy);
  return denominator === 0 ? 0 : covariance / denominator;
}

/**
 * One-shot analysis of a rendered buffer. Every channel is measured, the
 * loudness is properly gated, and the peak is a true-peak estimate.
 */
export function analyseChannels(
  channels: Float32Array[],
  sampleRate: number,
): {
  lufs: number;
  lra: number;
  truePeakDb: number;
  samplePeakDb: number;
} {
  const meter = new LoudnessMeter(sampleRate, Math.max(1, channels.length));
  meter.push(channels);
  return {
    lufs: meter.integratedLufs(),
    lra: meter.loudnessRangeLu(),
    truePeakDb: truePeakDb(channels),
    samplePeakDb: samplePeakDb(channels),
  };
}
