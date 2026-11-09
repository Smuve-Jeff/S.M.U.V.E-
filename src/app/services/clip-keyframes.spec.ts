import {
  addKeyframe,
  applyEasing,
  evaluateKeyframes,
  removeKeyframe,
  sanitizeKeyframes,
  type ClipKeyframe,
} from './clip-keyframes';

const kf = (time: number, property: ClipKeyframe['property'], value: number, easing: ClipKeyframe['easing'] = 'linear', id = `k${time}-${property}`): ClipKeyframe =>
  ({ id, time, property, value, easing });

describe('evaluateKeyframes', () => {
  it('returns identity when there are no keyframes', () => {
    expect(evaluateKeyframes([], 1)).toEqual({
      positionX: 0, positionY: 0, scale: 1, opacity: 1, rotation: 0,
    });
    expect(evaluateKeyframes(undefined, 1).scale).toBe(1);
  });

  it('interpolates linearly between two keyframes', () => {
    const keys = [kf(0, 'scale', 1), kf(2, 'scale', 2)];
    expect(evaluateKeyframes(keys, 1).scale).toBeCloseTo(1.5);
    expect(evaluateKeyframes(keys, 0).scale).toBe(1);
    expect(evaluateKeyframes(keys, 2).scale).toBe(2);
  });

  it('holds the first value before it and the last after it', () => {
    const keys = [kf(1, 'opacity', 0.2), kf(3, 'opacity', 0.8)];
    expect(evaluateKeyframes(keys, 0).opacity).toBe(0.2);
    expect(evaluateKeyframes(keys, 99).opacity).toBe(0.8);
  });

  it('applies the outgoing keyframe easing (ease-in is slow at the start)', () => {
    const keys = [kf(0, 'positionX', 0, 'ease-in'), kf(1, 'positionX', 1)];
    const mid = evaluateKeyframes(keys, 0.5).positionX;
    expect(mid).toBeLessThan(0.5); // ease-in: 0.25
    expect(mid).toBeCloseTo(0.25);
  });

  it('step easing holds until the next keyframe', () => {
    const keys = [kf(0, 'scale', 1, 'step'), kf(1, 'scale', 3)];
    expect(evaluateKeyframes(keys, 0.99).scale).toBe(1);
    expect(evaluateKeyframes(keys, 1).scale).toBe(3);
  });

  it('animates multiple properties independently', () => {
    const keys = [
      kf(0, 'scale', 1), kf(2, 'scale', 2),
      kf(0, 'rotation', 0), kf(2, 'rotation', 90),
    ];
    const mid = evaluateKeyframes(keys, 1);
    expect(mid.scale).toBeCloseTo(1.5);
    expect(mid.rotation).toBeCloseTo(45);
    expect(mid.opacity).toBe(1); // untouched property stays identity
  });
});

describe('applyEasing', () => {
  it('covers each curve at its endpoints', () => {
    for (const e of ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'step'] as const) {
      expect(applyEasing(0, e)).toBe(0);
      expect(applyEasing(1, e)).toBe(1);
    }
    expect(applyEasing(0.5, 'ease-out')).toBeGreaterThan(0.5);
    expect(applyEasing(0.5, 'ease-in-out')).toBeCloseTo(0.5);
  });
});

describe('addKeyframe / removeKeyframe', () => {
  it('replaces a keyframe at the same time + property instead of duplicating', () => {
    let keys = addKeyframe([], kf(1, 'scale', 2), 5);
    keys = addKeyframe(keys, kf(1, 'scale', 3), 5);
    expect(keys).toHaveLength(1);
    expect(keys[0].value).toBe(3);
  });

  it('keeps sorted order and clamps to the clip duration and property range', () => {
    let keys = addKeyframe([], kf(4, 'scale', 2), 5);
    keys = addKeyframe(keys, kf(1, 'scale', 1), 5);
    expect(keys.map((k) => k.time)).toEqual([1, 4]);
    expect(addKeyframe([], kf(99, 'scale', 2), 5)[0].time).toBe(5);
    expect(addKeyframe([], kf(0, 'scale', 99), 5)[0].value).toBe(4);
    expect(addKeyframe([], kf(0, 'opacity', -1), 5)[0].value).toBe(0);
  });

  it('removes by id and never mutates the input', () => {
    const keys = [kf(0, 'scale', 1, 'linear', 'a'), kf(1, 'scale', 2, 'linear', 'b')];
    const next = removeKeyframe(keys, 'a');
    expect(next).toHaveLength(1);
    expect(keys).toHaveLength(2);
  });
});

describe('sanitizeKeyframes', () => {
  it('drops malformed entries and clamps the rest', () => {
    const clean = sanitizeKeyframes([
      { id: 'ok', time: 1, property: 'scale', value: 2, easing: 'ease-out' },
      { id: 'bad-prop', time: 1, property: 'nope', value: 2, easing: 'linear' },
      { id: 'nan', time: NaN, property: 'scale', value: 2, easing: 'linear' },
      null,
      { time: 0, property: 'opacity', value: 5 },
    ]);
    expect(clean).toHaveLength(2);
    expect(clean.find((k) => k.property === 'opacity')?.value).toBe(1);
    expect(clean.find((k) => k.property === 'opacity')?.easing).toBe('linear');
  });

  it('returns an empty list for non-arrays (older records)', () => {
    expect(sanitizeKeyframes(undefined)).toEqual([]);
    expect(sanitizeKeyframes('x')).toEqual([]);
  });
});
