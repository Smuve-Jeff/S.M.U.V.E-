import { applyLut, parseCubeLut, sanitizeLut } from './lut';

function identityCube(size = 2): string {
  const lines = ['# test', `LUT_3D_SIZE ${size}`];
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        lines.push(`${r / (size - 1)} ${g / (size - 1)} ${b / (size - 1)}`);
      }
    }
  }
  return lines.join('\n');
}

describe('parseCubeLut', () => {
  it('parses size, title and lattice data', () => {
    const lut = parseCubeLut(identityCube(2), 'fallback');
    expect(lut?.size).toBe(2);
    expect(lut?.data).toHaveLength(24);
    expect(lut?.name).toBe('fallback');
  });

  it('reads the title comment and domain', () => {
    const text = '# Title: Teal Push\nLUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n' +
      identityCube(2).split('\n').slice(2).join('\n');
    expect(parseCubeLut(text)?.name).toBe('Teal Push');
  });

  it('rejects missing size, wrong row counts and oversized lattices', () => {
    expect(parseCubeLut('LUT_3D_SIZE 2\n0 0 0\n')).toBeNull();
    expect(parseCubeLut('no lut here')).toBeNull();
    expect(parseCubeLut('LUT_3D_SIZE 99\n' + '0 0 0\n'.repeat(10))).toBeNull();
  });
});

describe('applyLut', () => {
  it('an identity LUT leaves pixels unchanged', () => {
    const lut = parseCubeLut(identityCube(4))!;
    const data = new Uint8ClampedArray([10, 128, 250, 255, 0, 0, 0, 255]);
    applyLut(data, lut, 1);
    expect([...data.slice(0, 3)]).toEqual([10, 128, 250]);
    expect([...data.slice(4, 7)]).toEqual([0, 0, 0]);
  });

  it('a constant LUT maps every pixel to its colour at full intensity', () => {
    // Every lattice point maps to (1, 0, 0) = pure red.
    const rows = Array.from({ length: 8 }, () => '1 0 0').join('\n');
    const lut = parseCubeLut(`LUT_3D_SIZE 2\n${rows}`)!;
    const data = new Uint8ClampedArray([0, 90, 200, 255]);
    applyLut(data, lut, 1);
    expect([...data.slice(0, 3)]).toEqual([255, 0, 0]);
  });

  it('intensity 0 is a no-op', () => {
    const lut = parseCubeLut(identityCube(2))!;
    const data = new Uint8ClampedArray([10, 20, 30, 255]);
    applyLut(data, lut, 0);
    expect([...data.slice(0, 3)]).toEqual([10, 20, 30]);
  });
});

describe('sanitizeLut', () => {
  it('accepts a well-formed LUT and rejects malformed ones', () => {
    const lut = parseCubeLut(identityCube(2))!;
    expect(sanitizeLut(lut)?.size).toBe(2);
    expect(sanitizeLut({ size: 2, data: [1, 2, 3] })).toBeNull();
    expect(sanitizeLut(null)).toBeNull();
  });
});
