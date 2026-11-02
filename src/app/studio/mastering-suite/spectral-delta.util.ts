/**
 * Spectral reference matching.
 *
 * Loudness matching alone cannot tell an artist whether a reference is
 * brighter, chunkier or more scooped. This utility profiles the same log-spaced
 * bands on both sides and returns a signed dB delta, so the Mastering Suite can
 * show where the master needs shaping instead of guessing from a single number.
 *
 * The reference is measured offline from its decoded PCM; the master is read
 * from the existing AnalyserNode. Both profiles are normalised to their own
 * loudest band, which makes the result about tonal balance rather than absolute
 * playback level (the LUFS matching path handles level).
 */

export interface SpectralBand {
  id: string;
  label: string;
  /** Centre frequency in Hz. */
  hz: number;
}

export const SPECTRAL_BANDS: readonly SpectralBand[] = [
  { id: 'sub', label: '50', hz: 50 },
  { id: 'low', label: '100', hz: 100 },
  { id: 'lowmid', label: '200', hz: 200 },
  { id: 'mid', label: '400', hz: 400 },
  { id: 'presence', label: '1k', hz: 1000 },
  { id: 'upper', label: '2k', hz: 2000 },
  { id: 'high', label: '4k', hz: 4000 },
  { id: 'air', label: '8k', hz: 8000 },
  { id: 'top', label: '12k', hz: 12000 },
];

const MAX_PROFILE_SAMPLES = 32_768;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalise(values: number[]): number[] {
  const loudest = Math.max(...values.map((value) => (Number.isFinite(value) ? value : -120)));
  return values.map((value) => {
    const db = Number.isFinite(value) ? value - loudest : -60;
    return Math.round(clamp(db, -60, 0) * 10) / 10;
  });
}

/**
 * Measure a decoded reference buffer. A centred window is used so an intro or
 * fade-out does not define the tonal fingerprint of the whole record.
 */
export function spectralProfileFromBuffer(
  buffer: Pick<AudioBuffer, 'sampleRate' | 'length' | 'numberOfChannels' | 'getChannelData'>,
  bands: readonly SpectralBand[] = SPECTRAL_BANDS,
): number[] {
  if (!buffer || typeof buffer.getChannelData !== 'function') {
    return bands.map(() => 0);
  }
  const length = Math.max(1, Math.min(MAX_PROFILE_SAMPLES, buffer.length || 0));
  const start = Math.max(0, Math.floor(((buffer.length || length) - length) / 2));
  const channelCount = Math.max(1, buffer.numberOfChannels || 1);
  const mono = new Float32Array(length);
  for (let channel = 0; channel < channelCount; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length && start + i < data.length; i++) {
      mono[i] += data[start + i] / channelCount;
    }
  }

  const sampleRate = buffer.sampleRate || 48_000;
  const values = bands.map((band) => {
    const frequency = clamp(band.hz, 20, sampleRate * 0.45);
    const omega = (2 * Math.PI * frequency) / sampleRate;
    const coefficient = 2 * Math.cos(omega);
    let previous = 0;
    let previous2 = 0;
    let current = 0;
    for (let i = 0; i < length; i++) {
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, length - 1));
      current = mono[i] * window + coefficient * previous - previous2;
      previous2 = previous;
      previous = current;
    }
    const power = Math.sqrt(
      Math.max(0, previous * previous + previous2 * previous2 - coefficient * previous * previous2),
    );
    return 20 * Math.log10(power / length + 1e-12);
  });
  return normalise(values);
}

/** Measure the live master through the same band layout. */
export function spectralProfileFromAnalyser(
  analyser: AnalyserNode,
  bands: readonly SpectralBand[] = SPECTRAL_BANDS,
): number[] {
  const bins = analyser.frequencyBinCount;
  if (!bins) return bands.map(() => 0);
  const data = new Uint8Array(bins);
  try {
    analyser.getByteFrequencyData(data);
  } catch {
    return bands.map(() => 0);
  }
  const sampleRate = (analyser.context as BaseAudioContext | undefined)?.sampleRate ?? 48_000;
  const nyquist = sampleRate / 2;
  const values = bands.map((band) => {
    const low = Math.max(20, band.hz / Math.SQRT2);
    const high = Math.min(nyquist, band.hz * Math.SQRT2);
    const first = Math.max(1, Math.floor((low / nyquist) * bins));
    const last = Math.min(bins - 1, Math.ceil((high / nyquist) * bins));
    let sum = 0;
    let count = 0;
    for (let bin = first; bin <= last; bin++) {
      sum += data[bin];
      count++;
    }
    const byte = count ? sum / count : 0;
    return (byte / 255) * 100 - 100;
  });
  return normalise(values);
}

/** Signed per-band delta in dB: positive means the master has more energy. */
export function spectralDelta(
  reference: readonly number[],
  master: readonly number[],
): number[] {
  return SPECTRAL_BANDS.map((_, index) => {
    const value = (master[index] ?? 0) - (reference[index] ?? 0);
    return Math.round(clamp(value, -12, 12) * 10) / 10;
  });
}
