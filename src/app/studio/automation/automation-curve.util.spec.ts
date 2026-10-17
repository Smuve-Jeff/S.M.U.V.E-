import {
  laneParameterLabel,
  laneRange,
  normToValue,
  valueToNorm,
} from './automation-curve.util';

describe('automation-curve.util', () => {
  it('resolves ranges per parameter family, honoring explicit min/max', () => {
    expect(laneRange('volume')).toEqual({ min: 0, max: 1 });
    expect(laneRange('pan')).toEqual({ min: -1, max: 1 });
    expect(laneRange('cutoff', 100, 5000)).toEqual({ min: 100, max: 5000 });
    expect(laneRange('cutoff')).toMatchObject({
      min: 20,
      max: 20_000,
      logarithmic: true,
    });
    expect(laneRange('cc_11')).toEqual({ min: 0, max: 127 });
    expect(laneRange('cc_1', 0, 64)).toEqual({ min: 0, max: 64 });
  });

  it('maps values to the 0–1 axis and back (linear)', () => {
    const range = laneRange('volume');
    expect(valueToNorm(0.25, range)).toBeCloseTo(0.25, 6);
    expect(valueToNorm(2, range)).toBe(1); // clamped
    expect(valueToNorm(-1, range)).toBe(0);
    expect(normToValue(0.75, range)).toBeCloseTo(0.75, 6);
    expect(normToValue(5, range)).toBe(1); // clamped axis
  });

  it('maps bipolar and log ranges round-trip', () => {
    const pan = laneRange('pan');
    expect(valueToNorm(0, pan)).toBeCloseTo(0.5, 6);
    expect(normToValue(valueToNorm(-0.5, pan), pan)).toBeCloseTo(-0.5, 6);

    const cutoff = laneRange('cutoff');
    const mid = normToValue(0.5, cutoff);
    expect(mid).toBeCloseTo(Math.sqrt(20 * 20_000), 3);
    expect(valueToNorm(mid, cutoff)).toBeCloseTo(0.5, 6);
  });

  it('labels parameters for the editor UI', () => {
    expect(laneParameterLabel('volume')).toBe('VOLUME');
    expect(laneParameterLabel('sendA')).toBe('SEND A');
    expect(laneParameterLabel('high_cut')).toBe('HIGH CUT');
    expect(laneParameterLabel('cc_11')).toBe('CC 11');
  });
});
