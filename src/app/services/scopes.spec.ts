import {
  computeHistogram,
  computeVectorscope,
  computeWaveform,
  lumaPercentiles,
} from './scopes';

function solid(r: number, g: number, b: number, count = 100): Uint8ClampedArray {
  const out = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255;
  }
  return out;
}

describe('computeHistogram', () => {
  it('peaks in the bin matching the solid colour luma', () => {
    const hist = computeHistogram(solid(255, 255, 255));
    expect(hist.bins[63]).toBe(1);
    expect(hist.bins[0]).toBe(0);
  });

  it('is normalized', () => {
    const hist = computeHistogram(solid(128, 128, 128));
    expect(Math.max(...hist.bins)).toBe(1);
  });
});

describe('computeVectorscope', () => {
  it('clusters neutral gray at the centre bin', () => {
    const vec = computeVectorscope(solid(128, 128, 128));
    const centre = 24 * 48 + 24;
    expect(vec.bins[centre]).toBe(1);
  });

  it('puts pure red away from centre', () => {
    const vec = computeVectorscope(solid(255, 0, 0));
    const centre = 24 * 48 + 24;
    expect(vec.bins[centre]).toBe(0);
    expect(Math.max(...vec.bins)).toBe(1);
  });
});

describe('computeWaveform', () => {
  it('has the requested shape and peaks at the solid luma row', () => {
    const wave = computeWaveform(solid(255, 255, 255, 120 * 48), 120, 48);
    expect(wave.columns).toHaveLength(120 * 48);
    // White sits at the top row of every column.
    expect(wave.columns[0 * 48 + 47]).toBe(1);
    expect(wave.columns[0 * 48 + 0]).toBe(0);
  });
});

describe('lumaPercentiles', () => {
  it('reads a solid frame', () => {
    const { p50, p95 } = lumaPercentiles(solid(100, 100, 100));
    expect(p50).toBeCloseTo(100);
    expect(p95).toBeCloseTo(100);
  });

  it('returns zeros for empty input', () => {
    expect(lumaPercentiles(new Uint8ClampedArray(0))).toEqual({ p50: 0, p95: 0 });
  });
});
