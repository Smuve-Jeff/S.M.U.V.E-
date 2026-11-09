import {
  applyChromaKey,
  chromaDistance,
  DEFAULT_CHROMA_KEY,
  rgbToYcbcr,
  sanitizeChromaKey,
  type ChromaKeySettings,
} from './chroma-key';

const settings = (over: Partial<ChromaKeySettings> = {}): ChromaKeySettings => ({
  ...DEFAULT_CHROMA_KEY,
  ...over,
});

function buffer(pixels: [number, number, number][]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b], i) => {
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255;
  });
  return out;
}

describe('chromaDistance / rgbToYcbcr', () => {
  it('measures green as zero against a green key and red as far', () => {
    const [kY, kCb, kCr] = rgbToYcbcr(0, 255, 0);
    expect(chromaDistance(0, 255, 0, kCb, kCr, kY)).toBe(0);
    expect(chromaDistance(255, 0, 0, kCb, kCr, kY)).toBeGreaterThan(0.5);
  });

  it('is insensitive to luma: a darker green is still keyed', () => {
    const [kY, kCb, kCr] = rgbToYcbcr(0, 255, 0);
    // Half-brightness green: very different luma, same chroma direction.
    expect(chromaDistance(0, 128, 0, kCb, kCr, kY)).toBeLessThan(0.2);
  });
});

describe('applyChromaKey', () => {
  it('keys out a green backdrop and keeps a red subject', () => {
    const data = buffer([[0, 255, 0], [255, 0, 0], [0, 200, 50]]);
    applyChromaKey(data, settings());
    expect(data[3]).toBe(0); // green backdrop gone
    expect(data[7]).toBe(255); // red subject untouched
    expect(data[11]).toBe(0); // second green shade gone
  });

  it('keys a blue screen with the blue preset, not with green', () => {
    const blue = buffer([[0, 0, 255]]);
    applyChromaKey(blue, settings({ preset: 'blue' }));
    expect(blue[3]).toBe(0);

    const blue2 = buffer([[0, 0, 255]]);
    applyChromaKey(blue2, settings({ preset: 'green' }));
    expect(blue2[3]).toBe(255);
  });

  it('softens the edge: a fringe pixel gets partial alpha, not a hard cut', () => {
    // Between green and red — sits in the similarity..similarity+smoothness ramp.
    const fringe = buffer([[120, 130, 20]]);
    applyChromaKey(fringe, settings({ similarity: 0.1, smoothness: 0.9, spill: 0 }));
    expect(fringe[3]).toBeGreaterThan(0);
    expect(fringe[3]).toBeLessThan(255);
  });

  it('despills: a greenish fringe pixel has its green pulled down', () => {
    const data = buffer([[60, 140, 40]]);
    const before = data[1];
    applyChromaKey(data, settings({ similarity: 0.05, smoothness: 0.9, spill: 1 }));
    expect(data[1]).toBeLessThan(before);
  });

  it('is a no-op when disabled', () => {
    const data = buffer([[0, 255, 0]]);
    const share = applyChromaKey(data, settings({ enabled: false }));
    expect(share).toBe(0);
    expect(data[3]).toBe(255);
  });

  it('reports the keyed share for diagnostics', () => {
    const data = buffer([[0, 255, 0], [0, 255, 0], [255, 0, 0], [255, 0, 0]]);
    expect(applyChromaKey(data, settings())).toBeCloseTo(0.5);
  });
});

describe('sanitizeChromaKey', () => {
  it('clamps similarity/smoothness/spill and defaults unknown presets to green', () => {
    const clean = sanitizeChromaKey({
      enabled: true, preset: 'bogus', similarity: 5, smoothness: -1, spill: 2, keyColor: [300, -5, 12],
    });
    expect(clean).toMatchObject({ preset: 'green', similarity: 1, smoothness: 0.01, spill: 1 });
    expect(clean?.keyColor).toEqual([255, 0, 12]);
  });

  it('returns null for missing records so old clips stay unkeyed', () => {
    expect(sanitizeChromaKey(undefined)).toBeNull();
    expect(sanitizeChromaKey(null)).toBeNull();
  });
});
