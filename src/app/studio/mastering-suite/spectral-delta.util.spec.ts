import {
  SPECTRAL_BANDS,
  spectralDelta,
  spectralProfileFromAnalyser,
  spectralProfileFromBuffer,
} from './spectral-delta.util';

function sineBuffer(frequency: number): Pick<
  AudioBuffer,
  'sampleRate' | 'length' | 'numberOfChannels' | 'getChannelData'
> {
  const sampleRate = 48_000;
  const length = 32_768;
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.7;
  }
  return {
    sampleRate,
    length,
    numberOfChannels: 1,
    getChannelData: () => data,
  };
}

function analyserWithPeak(bin = 10): AnalyserNode {
  const frequencyBinCount = 1024;
  return {
    frequencyBinCount,
    context: { sampleRate: 48_000 },
    getByteFrequencyData: (target: Uint8Array) => {
      target.fill(16);
      target[bin] = 220;
    },
  } as unknown as AnalyserNode;
}

describe('spectral delta', () => {
  it('returns one finite normalised value per band', () => {
    const profile = spectralProfileFromBuffer(sineBuffer(1000));
    expect(profile).toHaveLength(SPECTRAL_BANDS.length);
    expect(profile.every((value) => Number.isFinite(value))).toBe(true);
    expect(Math.max(...profile)).toBe(0);
    expect(Math.min(...profile)).toBeGreaterThanOrEqual(-60);
  });

  it('survives a minimal buffer without channel data', () => {
    const profile = spectralProfileFromBuffer({} as AudioBuffer);
    expect(profile).toEqual(SPECTRAL_BANDS.map(() => 0));
  });

  it('profiles the live analyser through the same band count', () => {
    const profile = spectralProfileFromAnalyser(analyserWithPeak());
    expect(profile).toHaveLength(SPECTRAL_BANDS.length);
    expect(Math.max(...profile)).toBe(0);
  });

  it('reports signed master-minus-reference deltas inside the display range', () => {
    const reference = SPECTRAL_BANDS.map(() => 0);
    const master = SPECTRAL_BANDS.map((_, index) => (index % 2 === 0 ? 4 : -8));
    expect(spectralDelta(reference, master)).toEqual([4, -8, 4, -8, 4, -8, 4, -8, 4]);

    const extreme = spectralDelta(reference, SPECTRAL_BANDS.map(() => 99));
    expect(extreme.every((value) => value === 12)).toBe(true);
  });
});
