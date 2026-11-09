import {
  DEFAULT_MASK,
  flattenPath,
  maskContains,
  maskKeeps,
  pipTransform,
  sanitizeMask,
  sanitizePip,
  type ClipMaskSettings,
} from './clip-mask';

const mask = (over: Partial<ClipMaskSettings> = {}): ClipMaskSettings => ({
  ...DEFAULT_MASK,
  ...over,
});

describe('maskContains / maskKeeps', () => {
  it('tests a rectangle in normalized frame space', () => {
    const m = mask({ shape: 'rect', x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    expect(maskContains(m, 0.5, 0.5)).toBe(true);
    expect(maskContains(m, 0.1, 0.5)).toBe(false);
    expect(maskContains(m, 0.5, 0.9)).toBe(false);
  });

  it('tests an ellipse by its centre and radii', () => {
    const m = mask({ shape: 'ellipse', x: 0.5, y: 0.5, w: 0.25, h: 0.25 });
    expect(maskContains(m, 0.5, 0.5)).toBe(true);
    expect(maskContains(m, 0.7, 0.5)).toBe(true);
    expect(maskContains(m, 0.9, 0.5)).toBe(false);
    expect(maskContains(m, 0.5, 0.9)).toBe(false);
  });

  it('tests a linear wipe by projection onto its angle', () => {
    const m = mask({ shape: 'linear', x: 0.5, angle: 0 });
    expect(maskContains(m, 0.25, 0.5)).toBe(true);
    expect(maskContains(m, 0.75, 0.5)).toBe(false);
  });

  it('inverts the kept region', () => {
    const m = mask({ shape: 'rect', x: 0.25, y: 0.25, w: 0.5, h: 0.5, invert: true });
    expect(maskKeeps(m, 0.5, 0.5)).toBe(false);
    expect(maskKeeps(m, 0.05, 0.05)).toBe(true);
  });
});

describe('freehand path masks', () => {
  const diamond = mask({
    shape: 'path',
    points: [
      { x: 0.5, y: 0.1 },
      { x: 0.9, y: 0.5 },
      { x: 0.5, y: 0.9 },
      { x: 0.1, y: 0.5 },
    ],
  });

  it('contains the centre and rejects the corners', () => {
    expect(maskContains(diamond, 0.5, 0.5)).toBe(true);
    expect(maskContains(diamond, 0.05, 0.05)).toBe(false);
    expect(maskContains(diamond, 0.5, 0.05)).toBe(false);
  });

  it('needs at least 3 anchors', () => {
    expect(maskContains(mask({ shape: 'path', points: [{ x: 0.5, y: 0.5 }] }), 0.5, 0.5)).toBe(false);
  });

  it('flattens the spline smoothly through every anchor', () => {
    const flat = flattenPath(diamond.points!);
    expect(flat.length).toBeGreaterThan(16);
    for (const pt of diamond.points!) {
      expect(flat.some((f) => Math.abs(f.x - pt.x) < 0.05 && Math.abs(f.y - pt.y) < 0.05)).toBe(true);
    }
  });
});

describe('pipTransform', () => {
  it('places a bottom-right PiP in the positive quadrant at the given size', () => {
    const t = pipTransform({ enabled: true, preset: 'bottom-right', size: 0.33 });
    expect(t.scale).toBeCloseTo(0.33);
    expect(t.positionX).toBeGreaterThan(0);
    expect(t.positionY).toBeGreaterThan(0);
  });

  it('mirrors corners and centres the center preset', () => {
    const tl = pipTransform({ enabled: true, preset: 'top-left', size: 0.5 });
    expect(tl.positionX).toBeLessThan(0);
    expect(tl.positionY).toBeLessThan(0);
    const c = pipTransform({ enabled: true, preset: 'center', size: 0.5 });
    expect(c.positionX).toBe(0);
    expect(c.positionY).toBe(0);
  });
});

describe('sanitizeMask / sanitizePip', () => {
  it('clamps geometry and defaults unknown shapes', () => {
    const clean = sanitizeMask({ shape: 'bogus', x: 99, w: 0, feather: 999 });
    expect(clean?.shape).toBe('rect');
    expect(clean?.x).toBe(1.5);
    expect(clean?.w).toBe(0.01);
    expect(clean?.feather).toBe(200);
  });

  it('returns null for missing records', () => {
    expect(sanitizeMask(undefined)).toBeNull();
    expect(sanitizePip(null)).toBeNull();
  });

  it('defaults an unknown PiP preset and clamps size', () => {
    expect(sanitizePip({ enabled: true, preset: 'middle', size: 5 }))
      .toMatchObject({ preset: 'bottom-right', size: 0.8 });
  });
});
