/**
 * Real chroma key (green/blue screen) — replaces the old corner-key, which
 * sampled one pixel and erased everything within a fixed RGB tolerance no
 * matter what the backdrop actually was.
 *
 * The key distance is measured in YCbCr chroma space (Cb/Cr), which is how
 * professional keyers work: a green backdrop stays green under lighting
 * changes in luma, while a subject with similar luma but different chroma
 * survives. Alpha is a smooth ramp between `similarity` and
 * `similarity + smoothness`, and spill suppression pulls the key colour out
 * of semi-keyed edge pixels so fringes don't glow.
 */

/** Preset key colours, as sRGB triplets. */
export const CHROMA_KEY_COLORS = {
  green: [0, 255, 0] as const,
  blue: [0, 0, 255] as const,
} as const;

export type ChromaKeyPreset = keyof typeof CHROMA_KEY_COLORS;

export interface ChromaKeySettings {
  enabled: boolean;
  preset: ChromaKeyPreset | 'custom';
  /** Explicit key colour (used when preset is 'custom'). */
  keyColor: [number, number, number];
  /** 0..1 — chroma distance below this is fully keyed out. */
  similarity: number;
  /** 0..1 — width of the soft edge ramp above `similarity`. */
  smoothness: number;
  /** 0..1 — how strongly key-colour spill is pulled from edge pixels. */
  spill: number;
}

export const DEFAULT_CHROMA_KEY: ChromaKeySettings = {
  enabled: true,
  preset: 'green',
  keyColor: [0, 255, 0],
  similarity: 0.32,
  smoothness: 0.28,
  spill: 0.6,
};

export function resolveKeyColor(settings: ChromaKeySettings): [number, number, number] {
  if (settings.preset === 'green' || settings.preset === 'blue') {
    return [...CHROMA_KEY_COLORS[settings.preset]];
  }
  const [r, g, b] = settings.keyColor ?? [0, 255, 0];
  return [
    Math.max(0, Math.min(255, Math.round(r))),
    Math.max(0, Math.min(255, Math.round(g))),
    Math.max(0, Math.min(255, Math.round(b))),
  ];
}

/** sRGB → YCbCr (BT.601). Cb/Cr are centred on 128. */
export function rgbToYcbcr(r: number, g: number, b: number): [number, number, number] {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return [y, cb, cr];
}

/** Normalised chroma distance (0 = the key colour, ~1 = unrelated). */
export function chromaDistance(
  r: number, g: number, b: number,
  keyCb: number, keyCr: number,
  keyY = 128,
): number {
  // Normalized chroma: dividing by luma makes a half-bright green sit at the
  // same coordinates as a full-bright one, so lighting/shadow on the backdrop
  // does not move it out of the key.
  const [y, cb, cr] = rgbToYcbcr(r, g, b);
  const safeY = Math.max(16, y);
  const safeKeyY = Math.max(16, keyY);
  const dist = Math.hypot(
    (cb - 128) / safeY - (keyCb - 128) / safeKeyY,
    (cr - 128) / safeY - (keyCr - 128) / safeKeyY,
  );
  return Math.max(0, Math.min(1, dist / 1.1));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Key a raw RGBA buffer in place. Returns the share of pixels that were
 * keyed out, for diagnostics.
 *
 * Spill suppression: for partially-keyed pixels, the dominant key channel
 * (green for a green screen, blue for blue) is pulled toward the average of
 * the other two, which removes the coloured halo without a second pass.
 */
export function applyChromaKey(
  data: Uint8ClampedArray,
  settings: ChromaKeySettings,
): number {
  if (!settings.enabled || data.length < 4) return 0;
  const [kr, kg, kb] = resolveKeyColor(settings);
  const [keyY, keyCb, keyCr] = rgbToYcbcr(kr, kg, kb);
  const similarity = Math.max(0, Math.min(1, settings.similarity));
  const smoothness = Math.max(0.01, Math.min(1, settings.smoothness));
  const spill = Math.max(0, Math.min(1, settings.spill));
  const keyChannel = kg >= kb && kg >= kr ? 1 : kb >= kr ? 2 : 0;

  let keyed = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const alpha = data[i + 3];
    if (alpha === 0) continue;
    const dist = chromaDistance(r, g, b, keyCb, keyCr, keyY);
    // 0 inside the key, 1 outside — the subject's alpha ramp.
    const keep = smoothstep(similarity, similarity + smoothness, dist);
    if (keep <= 0) {
      data[i + 3] = 0;
      keyed++;
      continue;
    }
    if (keep < 1) {
      data[i + 3] = Math.round(alpha * keep);
      // Despill only on the fringe, proportional to how keyed it is.
      const fringe = (1 - keep) * spill;
      const ch = [r, g, b];
      const others = [0, 1, 2].filter((c) => c !== keyChannel);
      const avg = (ch[others[0]] + ch[others[1]]) / 2;
      ch[keyChannel] = Math.round(ch[keyChannel] + (avg - ch[keyChannel]) * fringe);
      data[i] = ch[0];
      data[i + 1] = ch[1];
      data[i + 2] = ch[2];
    }
  }
  return pixels ? keyed / pixels : 0;
}

/** Coerce untrusted settings (restored records, UI drafts) into a safe shape. */
export function sanitizeChromaKey(value: unknown): ChromaKeySettings | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<ChromaKeySettings>;
  const preset: ChromaKeySettings['preset'] =
    raw.preset === 'green' || raw.preset === 'blue' || raw.preset === 'custom'
      ? raw.preset
      : 'green';
  const num = (v: unknown, fallback: number, min = 0, max = 1) =>
    Number.isFinite(v) ? Math.max(min, Math.min(max, v as number)) : fallback;
  const colorRaw = Array.isArray(raw.keyColor) ? raw.keyColor : [0, 255, 0];
  return {
    enabled: raw.enabled !== false,
    preset,
    keyColor: [
      Math.max(0, Math.min(255, Math.round(Number(colorRaw[0]) || 0))),
      Math.max(0, Math.min(255, Math.round(Number(colorRaw[1]) || 0))),
      Math.max(0, Math.min(255, Math.round(Number(colorRaw[2]) || 0))),
    ],
    similarity: num(raw.similarity, DEFAULT_CHROMA_KEY.similarity),
    smoothness: num(raw.smoothness, DEFAULT_CHROMA_KEY.smoothness, 0.01),
    spill: num(raw.spill, DEFAULT_CHROMA_KEY.spill),
  };
}
