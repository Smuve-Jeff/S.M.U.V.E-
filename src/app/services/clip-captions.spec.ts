import { captionAt, estimateCaptionDuration, sanitizeCaptions } from './clip-captions';

describe('captionAt', () => {
  const cues = [
    { id: 'a', start: 1, end: 3, text: 'Hello' },
    { id: 'b', start: 5, end: 8, text: 'World' },
  ];

  it('finds the active cue and none in gaps', () => {
    expect(captionAt(cues, 2)?.text).toBe('Hello');
    expect(captionAt(cues, 4)).toBeNull();
    expect(captionAt(cues, 5)?.text).toBe('World');
    expect(captionAt(cues, 8)).toBeNull(); // end is exclusive
  });

  it('returns null with no cues', () => {
    expect(captionAt([], 1)).toBeNull();
    expect(captionAt(undefined, 1)).toBeNull();
  });
});

describe('estimateCaptionDuration', () => {
  it('scales with text length and clamps', () => {
    expect(estimateCaptionDuration('hi')).toBe(1.2);
    expect(estimateCaptionDuration('x'.repeat(170))).toBeCloseTo(7);
    expect(estimateCaptionDuration('x'.repeat(34))).toBeCloseTo(2);
  });
});

describe('sanitizeCaptions', () => {
  it('drops empty/invalid cues and fixes reversed ranges', () => {
    const clean = sanitizeCaptions([
      { id: 'ok', start: 2, end: 5, text: ' Real ' },
      { id: 'empty', start: 0, end: 1, text: '  ' },
      { id: 'bad', start: NaN, end: 1, text: 'x' },
      { id: 'rev', start: 4, end: 2, text: 'fixed' },
      null,
    ]);
    expect(clean).toHaveLength(2);
    expect(clean[0].text).toBe('Real');
    const fixed = clean.find((c) => c.id === 'rev');
    expect(fixed!.end).toBeGreaterThan(fixed!.start);
  });

  it('returns an empty list for non-arrays', () => {
    expect(sanitizeCaptions(undefined)).toEqual([]);
  });
});
