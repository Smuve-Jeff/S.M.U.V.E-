import {
  estimateTranslation,
  smoothCorrection,
  toGrayscaleThumb,
} from './video-stabilization';

function frame(width: number, height: number, paint: (x: number, y: number) => number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) out[y * width + x] = paint(x, y);
  }
  return out;
}

describe('estimateTranslation', () => {
  // A deterministic pseudo-random pattern: every shift is a unique optimum.
  const pattern = (ox: number, oy: number) =>
    frame(32, 24, (x, y) => {
      const v = Math.sin((x + ox) * 12.9898 + (y + oy) * 78.233) * 43758.5453;
      return Math.floor((v - Math.floor(v)) * 255);
    });

  it('measures zero shift for identical frames', () => {
    const a = pattern(0, 0);
    const est = estimateTranslation(a, a, 32, 24, 4);
    expect(est.dx).toBe(0);
    expect(est.dy).toBe(0);
  });

  it('measures a known 2px right, 1px down shift', () => {
    const prev = pattern(0, 0);
    const curr = pattern(-2, -1); // content moved +2/+1, so sampling shifts back
    const est = estimateTranslation(prev, curr, 32, 24, 4);
    expect(Math.abs(est.dx)).toBeGreaterThanOrEqual(1);
    expect(Math.abs(est.dy)).toBeGreaterThanOrEqual(1);
    expect(Math.sign(est.dx)).not.toBe(0);
  });

  it('returns infinity error for mismatched buffers', () => {
    expect(estimateTranslation(new Uint8ClampedArray(10), new Uint8ClampedArray(10), 32, 24).error)
      .toBe(Infinity);
  });
});

describe('smoothCorrection', () => {
  it('counter-translates and smooths toward the measured shift', () => {
    const next = smoothCorrection({ x: 0, y: 0 }, { dx: 4, dy: -2, error: 0 }, 0.5);
    expect(next.x).toBe(-2);
    expect(next.y).toBe(1);
  });

  it('converges over repeated frames', () => {
    let c = { x: 0, y: 0 };
    for (let i = 0; i < 40; i++) c = smoothCorrection(c, { dx: 3, dy: 0, error: 0 }, 0.3);
    expect(c.x).toBeCloseTo(-3, 0);
  });
});

describe('toGrayscaleThumb', () => {
  it('downsamples RGBA to grayscale', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const thumb = toGrayscaleThumb(rgba, 2, 1, 2, 1);
    expect(thumb[0]).toBeCloseTo(76);
    expect(thumb[1]).toBeCloseTo(150);
  });
});
