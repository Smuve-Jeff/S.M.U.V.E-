import {
  evaluateSpeedCurve,
  sanitizeSpeedCurve,
  sourceSecondsForClipTime,
} from './speed-curve';

const swoosh = [
  { time: 0, speed: 1 },
  { time: 4, speed: 1 },
  { time: 5.5, speed: 4 },
  { time: 7, speed: 1 },
  { time: 10, speed: 1 },
];

describe('evaluateSpeedCurve', () => {
  it('holds the constant rate before the ramp', () => {
    expect(evaluateSpeedCurve(swoosh, 2)).toBe(1);
  });

  it('ramps up through the swoosh and back down', () => {
    expect(evaluateSpeedCurve(swoosh, 5.5)).toBe(4);
    const mid = evaluateSpeedCurve(swoosh, 4.75);
    expect(mid).toBeGreaterThan(1);
    expect(mid).toBeLessThan(4);
  });

  it('holds the last rate after the curve ends', () => {
    expect(evaluateSpeedCurve(swoosh, 99)).toBe(1);
  });

  it('falls back to the constant speed with no curve', () => {
    expect(evaluateSpeedCurve([], 3, 2)).toBe(2);
    expect(evaluateSpeedCurve(undefined, 3, 0.5)).toBe(0.5);
  });
});

describe('sourceSecondsForClipTime (integration)', () => {
  it('matches constant-rate math with no curve', () => {
    expect(sourceSecondsForClipTime([], 3, 2)).toBe(6);
  });

  it('integrates a ramp: faster than real time through the swoosh', () => {
    // 0-4s at 1x = 4, 4-5.5 trapezoid (1→4) = 3.75, 5.5-7 trapezoid (4→1) = 3.75
    expect(sourceSecondsForClipTime(swoosh, 7)).toBeCloseTo(11.5);
    expect(sourceSecondsForClipTime(swoosh, 7)).toBeGreaterThan(7);
  });

  it('a slow-mo section consumes less source time than real time', () => {
    const slow = [
      { time: 0, speed: 1 },
      { time: 3, speed: 0.25 },
      { time: 7, speed: 0.25 },
      { time: 10, speed: 1 },
    ];
    expect(sourceSecondsForClipTime(slow, 10)).toBeLessThan(10);
  });

  it('is monotonic and starts at zero', () => {
    expect(sourceSecondsForClipTime(swoosh, 0)).toBe(0);
    let prev = 0;
    for (let t = 0; t <= 10; t += 0.5) {
      const v = sourceSecondsForClipTime(swoosh, t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('sanitizeSpeedCurve', () => {
  it('sorts, clamps and drops malformed points', () => {
    const clean = sanitizeSpeedCurve([
      { time: 5, speed: 99 },
      { time: 1, speed: 0.01 },
      { time: NaN, speed: 2 },
      null,
    ]);
    expect(clean).toEqual([
      { time: 1, speed: 0.1 },
      { time: 5, speed: 8 },
    ]);
  });

  it('returns an empty list for non-arrays', () => {
    expect(sanitizeSpeedCurve(undefined)).toEqual([]);
  });
});
