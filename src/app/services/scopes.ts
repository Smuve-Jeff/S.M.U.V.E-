/**
 * Video scopes — the measurement overlays pro editors grade by: luma
 * histogram, luma waveform (per-column), and vectorscope (Cb/Cr scatter).
 * Computed from the painted frame each render; drawn only in the operator
 * view, never in the exported master.
 */

export interface Histogram {
  /** 64 luma bins, normalized 0..1. */
  bins: number[];
  max: number;
}

export interface Waveform {
  /** Per-column luma distributions, flattened: columns × 48 rows, 0..1. */
  columns: number[];
  columnCount: number;
  rowCount: number;
}

export interface Vectorscope {
  /** Cb/Cr scatter bins on a grid, normalized 0..1. */
  bins: number[];
  grid: number;
}

export const WAV_COLUMNS = 120;
export const WAV_ROWS = 48;
export const VEC_GRID = 48;

function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function computeHistogram(rgba: Uint8ClampedArray): Histogram {
  const bins = new Array(64).fill(0);
  let max = 0;
  const stride = rgba.length > 400_000 ? 16 : 4;
  for (let i = 0; i < rgba.length; i += stride) {
    const bin = Math.min(63, Math.floor((luma(rgba[i], rgba[i + 1], rgba[i + 2]) / 255) * 64));
    bins[bin]++;
    if (bins[bin] > max) max = bins[bin];
  }
  if (max > 0) for (let i = 0; i < bins.length; i++) bins[i] /= max;
  return { bins, max };
}

export function computeWaveform(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Waveform {
  const columns = new Array(WAV_COLUMNS * WAV_ROWS).fill(0);
  const perColumn = new Array(WAV_COLUMNS).fill(0);
  const xStep = width > 480 ? 4 : 1;
  const yStep = height > 270 ? 4 : 1;
  for (let y = 0; y < height; y += yStep) {
    for (let x = 0; x < width; x += xStep) {
      const i = (y * width + x) * 4;
      const col = Math.min(WAV_COLUMNS - 1, Math.floor((x / Math.max(1, width)) * WAV_COLUMNS));
      const row = Math.min(WAV_ROWS - 1, Math.floor((luma(rgba[i], rgba[i + 1], rgba[i + 2]) / 255) * WAV_ROWS));
      columns[col * WAV_ROWS + row]++;
      perColumn[col]++;
    }
  }
  const maxPer = Math.max(1, ...perColumn);
  for (let i = 0; i < columns.length; i++) columns[i] /= maxPer;
  return { columns, columnCount: WAV_COLUMNS, rowCount: WAV_ROWS };
}

export function computeVectorscope(rgba: Uint8ClampedArray): Vectorscope {
  const bins = new Array(VEC_GRID * VEC_GRID).fill(0);
  let max = 0;
  const stride = rgba.length > 400_000 ? 16 : 4;
  for (let i = 0; i < rgba.length; i += stride) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    const x = Math.max(0, Math.min(VEC_GRID - 1, Math.floor(((cb / 255) * VEC_GRID))));
    const y = Math.max(0, Math.min(VEC_GRID - 1, Math.floor(((cr / 255) * VEC_GRID))));
    const idx = y * VEC_GRID + x;
    bins[idx]++;
    if (bins[idx] > max) max = bins[idx];
  }
  if (max > 0) for (let i = 0; i < bins.length; i++) bins[i] /= max;
  return { bins, grid: VEC_GRID };
}

/** Brightest/heaviest luma percentile — a quick exposure read. */
export function lumaPercentiles(rgba: Uint8ClampedArray): { p50: number; p95: number } {
  const samples: number[] = [];
  const step = Math.max(4, Math.floor(rgba.length / 4 / 2000)) * 4;
  for (let i = 0; i < rgba.length; i += step) {
    samples.push(luma(rgba[i], rgba[i + 1], rgba[i + 2]));
  }
  samples.sort((a, b) => a - b);
  if (!samples.length) return { p50: 0, p95: 0 };
  return {
    p50: samples[Math.floor(samples.length * 0.5)],
    p95: samples[Math.floor(samples.length * 0.95)],
  };
}
