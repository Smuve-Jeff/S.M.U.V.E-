/**
 * 3D LUT (.cube) import and application — the professional colour-grading
 * format (DaVinci, Premiere, Capture One). A .cube file declares a lattice
 * size and domain, then one RGB triplet per lattice point; applying it is a
 * trilinear lookup per pixel.
 */

export interface CubeLut {
  name: string;
  size: number;
  /** Flattened RGB triplets, size³ entries, values in domain range. */
  data: number[];
  domainMin: [number, number, number];
  domainMax: [number, number, number];
}

export const MAX_LUT_SIZE = 65;
export const MAX_LUT_ENTRIES = 200_000;

export function parseCubeLut(text: string, fallbackName = 'Imported LUT'): CubeLut | null {
  if (!text || text.length > 5_000_000) return null;
  let title = fallbackName;
  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const rows: number[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const titleMatch = line.match(/^#\s*(?:title|name)\s*[:=]\s*(.+)/i);
      if (titleMatch) title = titleMatch[1].trim();
      continue;
    }
    if (line.startsWith('LUT_3D_SIZE')) {
      size = parseInt(line.split(/\s+/).pop() ?? '0', 10);
      continue;
    }
    if (line.startsWith('DOMAIN_MIN')) {
      const parts = line.split(/\s+/).slice(1).map(Number);
      if (parts.length === 3 && parts.every(Number.isFinite)) {
        domainMin = [parts[0], parts[1], parts[2]];
      }
      continue;
    }
    if (line.startsWith('DOMAIN_MAX')) {
      const parts = line.split(/\s+/).slice(1).map(Number);
      if (parts.length === 3 && parts.every(Number.isFinite)) {
        domainMax = [parts[0], parts[1], parts[2]];
      }
      continue;
    }
    if (/^[A-Z_]/.test(line)) continue; // other keywords (LUT_1D, etc.)
    const parts = line.split(/\s+/).map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
      rows.push(parts[0], parts[1], parts[2]);
    }
  }

  if (!size || size < 2 || size > MAX_LUT_SIZE) return null;
  const expected = size * size * size * 3;
  if (rows.length < expected || rows.length > MAX_LUT_ENTRIES * 3) return null;
  return { name: title, size, data: rows.slice(0, expected), domainMin, domainMax };
}

/**
 * Apply the LUT to an RGBA buffer in place with trilinear interpolation.
 * `intensity` 0..1 blends the graded result with the original.
 */
export function applyLut(
  rgba: Uint8ClampedArray,
  lut: CubeLut,
  intensity = 1,
): void {
  const n = lut.size;
  const amount = Math.max(0, Math.min(1, intensity));
  if (amount <= 0) return;
  const [minR, minG, minB] = lut.domainMin;
  const [maxR, maxG, maxB] = lut.domainMax;
  const spanR = Math.max(1e-6, maxR - minR);
  const spanG = Math.max(1e-6, maxG - minG);
  const spanB = Math.max(1e-6, maxB - minB);
  const data = lut.data;

  const sample = (r: number, g: number, b: number, channel: number): number => {
    const x = Math.max(0, Math.min(1, (r / 255 - minR) / spanR)) * (n - 1);
    const y = Math.max(0, Math.min(1, (g / 255 - minG) / spanG)) * (n - 1);
    const z = Math.max(0, Math.min(1, (b / 255 - minB) / spanB)) * (n - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const x1 = Math.min(n - 1, x0 + 1);
    const y1 = Math.min(n - 1, y0 + 1);
    const z1 = Math.min(n - 1, z0 + 1);
    const fx = x - x0;
    const fy = y - y0;
    const fz = z - z0;
    const at = (xx: number, yy: number, zz: number) =>
      data[((zz * n + yy) * n + xx) * 3 + channel];
    const c000 = at(x0, y0, z0);
    const c100 = at(x1, y0, z0);
    const c010 = at(x0, y1, z0);
    const c110 = at(x1, y1, z0);
    const c001 = at(x0, y0, z1);
    const c101 = at(x1, y0, z1);
    const c011 = at(x0, y1, z1);
    const c111 = at(x1, y1, z1);
    const lerp = (a: number, bb: number, t: number) => a + (bb - a) * t;
    return lerp(
      lerp(lerp(c000, c100, fx), lerp(c010, c110, fx), fy),
      lerp(lerp(c001, c101, fx), lerp(c011, c111, fx), fy),
      fz,
    );
  };

  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    rgba[i] = Math.round(r + (sample(r, g, b, 0) * 255 - r) * amount);
    rgba[i + 1] = Math.round(g + (sample(r, g, b, 1) * 255 - g) * amount);
    rgba[i + 2] = Math.round(b + (sample(r, g, b, 2) * 255 - b) * amount);
  }
}

export function sanitizeLut(value: unknown): CubeLut | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<CubeLut>;
  if (!Number.isFinite(raw.size) || !Array.isArray(raw.data)) return null;
  const size = raw.size as number;
  if (size < 2 || size > MAX_LUT_SIZE) return null;
  const expected = size * size * size * 3;
  if (raw.data.length !== expected) return null;
  if (!raw.data.every((v) => Number.isFinite(v))) return null;
  return {
    name: typeof raw.name === 'string' && raw.name ? raw.name : 'Imported LUT',
    size,
    data: [...raw.data],
    domainMin: Array.isArray(raw.domainMin) ? (raw.domainMin as [number, number, number]) : [0, 0, 0],
    domainMax: Array.isArray(raw.domainMax) ? (raw.domainMax as [number, number, number]) : [1, 1, 1],
  };
}
