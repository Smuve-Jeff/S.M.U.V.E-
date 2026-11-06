/**
 * S.M.U.V.E. 2.0 — Stem Separation DSP
 *
 * Spectral separation with a phase-coherent mask, deliberately free of Web
 * Audio so it can be tested exactly.
 *
 *  - vocals are the centre channel's 300–4000 Hz band, extracted with an STFT
 *    mask. Because the mask is real and the window is symmetric, the vocal
 *    signal stays phase-aligned with the mix, so `mix - vocals` cancels the
 *    centre band instead of leaving comb artefacts. Side-only material has no
 *    centre component and therefore cannot leak into vocals.
 *  - bass and drums are spectral bands of each channel with soft 80 Hz skirts,
 *    so a hard cut does not ring.
 *  - instrumental is the mix minus vocals; other is whatever vocals, bass and
 *    drums did not claim.
 *
 * Vocals + bass + drums + other therefore reconstructs the input sample for
 * sample, replacing four fixed-gain biquad renders that did not add up.
 */

const FFT_SIZE = 2048;
const HOP = 512;
const BAND_EDGE_HZ = 80;

const VOCAL_LOW_HZ = 300;
const VOCAL_HIGH_HZ = 4000;
const BASS_HIGH_HZ = 160;
const DRUM_LOW_HZ = 5000;

export interface StemChannels {
  vocals: Float32Array[];
  drums: Float32Array[];
  bass: Float32Array[];
  instrumental: Float32Array[];
  other: Float32Array[];
}

/** In-place iterative radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / len;
    const stepRe = Math.cos(angle);
    const stepIm = Math.sin(angle);
    for (let start = 0; start < n; start += len) {
      let curRe = 1;
      let curIm = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const evenRe = re[start + k];
        const evenIm = im[start + k];
        const oddRe = re[start + k + half];
        const oddIm = im[start + k + half];
        const vRe = oddRe * curRe - oddIm * curIm;
        const vIm = oddRe * curIm + oddIm * curRe;
        re[start + k] = evenRe + vRe;
        im[start + k] = evenIm + vIm;
        re[start + k + half] = evenRe - vRe;
        im[start + k + half] = evenIm - vIm;
        const nextRe = curRe * stepRe - curIm * stepIm;
        curIm = curRe * stepIm + curIm * stepRe;
        curRe = nextRe;
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

function raisedCosine(x: number): number {
  const clamped = Math.min(1, Math.max(0, x));
  return 0.5 - 0.5 * Math.cos(Math.PI * clamped);
}

/** Soft band mask: 1 inside [low, high], 0 outside, with an 80 Hz skirt. */
function bandGain(hz: number, low: number, high: number): number {
  if (hz <= low - BAND_EDGE_HZ || hz >= high + BAND_EDGE_HZ) {
    return 0;
  }
  const lowGain =
    low <= 0 ? 1 : raisedCosine((hz - (low - BAND_EDGE_HZ)) / (2 * BAND_EDGE_HZ));
  const highGain =
    high >= 22050
      ? 1
      : 1 - raisedCosine((hz - (high - BAND_EDGE_HZ)) / (2 * BAND_EDGE_HZ));
  return Math.min(lowGain, highGain);
}

/**
 * Extract one frequency band with weighted overlap-add. The weight buffer
 * normalises the window sum, so the output has the input's amplitude at the
 * edges as well as in the middle.
 */
function stftBand(
  input: Float32Array,
  sampleRate: number,
  low: number,
  high: number
): Float32Array {
  const length = input.length;
  if (length === 0) {
    return new Float32Array(0);
  }

  const padded = length + FFT_SIZE * 2;
  const accumulated = new Float32Array(padded);
  const weights = new Float32Array(padded);

  const window = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
  }

  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const gains = new Float32Array(FFT_SIZE / 2 + 1);
  for (let bin = 0; bin < gains.length; bin++) {
    gains[bin] = bandGain((bin * sampleRate) / FFT_SIZE, low, high);
  }

  const half = FFT_SIZE / 2;
  for (let start = 0; start + FFT_SIZE <= padded; start += HOP) {
    for (let i = 0; i < FFT_SIZE; i++) {
      const src = start + i - FFT_SIZE;
      re[i] = src >= 0 && src < length ? input[src] * window[i] : 0;
      im[i] = 0;
    }

    fft(re, im, false);

    for (let bin = 0; bin <= half; bin++) {
      const gain = gains[bin];
      re[bin] *= gain;
      im[bin] *= gain;
      if (bin > 0 && bin < half) {
        re[FFT_SIZE - bin] = re[bin];
        im[FFT_SIZE - bin] = -im[bin];
      }
    }

    fft(re, im, true);

    for (let i = 0; i < FFT_SIZE; i++) {
      const index = start + i;
      accumulated[index] += re[i] * window[i];
      weights[index] += window[i] * window[i];
    }
  }

  const output = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const index = i + FFT_SIZE;
    output[i] = weights[index] > 1e-6 ? accumulated[index] / weights[index] : 0;
  }
  return output;
}

export function separateIntoStems(
  channels: Float32Array[],
  sampleRate: number
): StemChannels {
  const channelCount = Math.max(1, channels.length);
  const length = channels[0]?.length ?? 0;
  const source = channels.length > 0 ? channels : [new Float32Array(0)];
  const left = source[0];
  const right = source[1] ?? left;

  const mid = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    mid[i] = (left[i] + right[i]) * 0.5;
  }

  const vocalMono = stftBand(mid, sampleRate, VOCAL_LOW_HZ, VOCAL_HIGH_HZ);

  const vocals: Float32Array[] = [];
  const drums: Float32Array[] = [];
  const bass: Float32Array[] = [];
  const instrumental: Float32Array[] = [];
  const other: Float32Array[] = [];

  for (let c = 0; c < channelCount; c++) {
    const mix = source[c] ?? source[0] ?? new Float32Array(length);
    const bassChannel = stftBand(mix, sampleRate, 0, BASS_HIGH_HZ);
    const drumChannel = stftBand(mix, sampleRate, DRUM_LOW_HZ, sampleRate / 2);

    const vocalChannel = new Float32Array(length);
    const instrumentalChannel = new Float32Array(length);
    const otherChannel = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const vocal = vocalMono[i];
      vocalChannel[i] = vocal;
      instrumentalChannel[i] = mix[i] - vocal;
      otherChannel[i] = mix[i] - vocal - bassChannel[i] - drumChannel[i];
    }

    vocals.push(vocalChannel);
    drums.push(drumChannel);
    bass.push(bassChannel);
    instrumental.push(instrumentalChannel);
    other.push(otherChannel);
  }

  return { vocals, drums, bass, instrumental, other };
}
