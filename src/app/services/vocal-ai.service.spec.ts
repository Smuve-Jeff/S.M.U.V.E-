import { analyzeVocalBuffer } from './vocal-ai.service';

function fakeBuffer(samples: number[], sampleRate = 44100): AudioBuffer {
  const data = new Float32Array(samples);
  return {
    getChannelData: () => data,
    duration: samples.length / sampleRate,
    sampleRate,
    numberOfChannels: 1,
  } as unknown as AudioBuffer;
}

describe('analyzeVocalBuffer', () => {
  it('measures peak, RMS, crest, silence and clipping from raw samples', () => {
    const analysis = analyzeVocalBuffer(
      fakeBuffer([0, 0, 1, -1, 0.5, -0.5, 0, 0]),
    );

    expect(analysis.peakDb).toBe(0);
    expect(analysis.clippedSamples).toBe(2);
    expect(analysis.rmsDb).toBeLessThan(0);
    expect(analysis.crestDb).toBeGreaterThan(0);
    expect(analysis.silentRatio).toBeGreaterThan(0);
    expect(analysis.channels).toBe(1);
    expect(analysis.sampleRate).toBe(44100);
  });

  it('reports a fully silent take as silent with a floor peak', () => {
    const analysis = analyzeVocalBuffer(fakeBuffer(new Array(100).fill(0)));

    expect(analysis.silentRatio).toBe(1);
    expect(analysis.peakDb).toBe(-120);
    expect(analysis.clippedSamples).toBe(0);
  });

  it('floors the dB reading for a near-silent signal', () => {
    const analysis = analyzeVocalBuffer(fakeBuffer([1e-8, -1e-8, 1e-8, -1e-8]));

    expect(analysis.peakDb).toBeLessThan(-100);
    expect(Number.isFinite(analysis.crestDb)).toBe(true);
  });
});
