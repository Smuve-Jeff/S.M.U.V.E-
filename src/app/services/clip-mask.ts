/**
 * Shape masks and picture-in-picture presets for video clips.
 *
 * A mask clips what a clip *shows* (rect / ellipse / linear wipe), a PiP
 * preset decides where a clip *sits* (corner + size). Both are pure geometry
 * here; the lab applies them on the canvas in `renderClipLayer`, so preview
 * and export share one implementation. PiP composes with the keyframe
 * transform: the preset is the base position/scale, keyframes animate on top.
 */

export type MaskShape = 'rect' | 'ellipse' | 'linear' | 'path';

/** One anchor of a freehand Bézier path mask (normalized 0..1). */
export interface MaskPathPoint {
  x: number;
  y: number;
}

export interface ClipMaskSettings {
  shape: MaskShape;
  /** Normalized 0..1 across the frame. Rect: top-left. Ellipse: centre. */
  x: number;
  y: number;
  /** Normalized width (rect) or radius-x (ellipse). */
  w: number;
  /** Normalized height (rect) or radius-y (ellipse). Linear: ignored. */
  h: number;
  /** Linear masks only: wipe angle in degrees. */
  angle: number;
  /** Soft edge, in pixels at render time. */
  feather: number;
  /** Freehand path anchors (shape 'path' only). */
  points?: MaskPathPoint[];
  /** Keep the outside instead of the inside. */
  invert: boolean;
}

export const DEFAULT_MASK: ClipMaskSettings = {
  shape: 'rect',
  points: [
    { x: 0.5, y: 0.18 },
    { x: 0.82, y: 0.5 },
    { x: 0.5, y: 0.82 },
    { x: 0.18, y: 0.5 },
  ],
  x: 0.25,
  y: 0.25,
  w: 0.5,
  h: 0.5,
  angle: 0,
  feather: 8,
  invert: false,
};

export type PipPreset = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

export interface PipSettings {
  enabled: boolean;
  preset: PipPreset;
  /** Frame-width fraction the PiP occupies (0.2..0.6). */
  size: number;
}

export const DEFAULT_PIP: PipSettings = {
  enabled: false,
  preset: 'bottom-right',
  size: 0.33,
};

export const PIP_PRESETS: { id: PipPreset; label: string }[] = [
  { id: 'top-left', label: 'Top Left' },
  { id: 'top-right', label: 'Top Right' },
  { id: 'bottom-left', label: 'Bottom Left' },
  { id: 'bottom-right', label: 'Bottom Right' },
  { id: 'center', label: 'Center' },
];

/**
 * PiP as a base transform in the same units as the keyframe engine:
 * position is a frame fraction from centre, scale a frame-width fraction.
 */
export function pipTransform(pip: PipSettings): { positionX: number; positionY: number; scale: number } {
  const size = Math.max(0.1, Math.min(0.8, pip.size || DEFAULT_PIP.size));
  const margin = 0.06;
  const half = (1 - size) / 2 - margin;
  switch (pip.preset) {
    case 'top-left': return { positionX: -half, positionY: -half, scale: size };
    case 'top-right': return { positionX: half, positionY: -half, scale: size };
    case 'bottom-left': return { positionX: -half, positionY: half, scale: size };
    case 'center': return { positionX: 0, positionY: 0, scale: size };
    case 'bottom-right':
    default: return { positionX: half, positionY: half, scale: size };
  }
}

/**
 * Flatten a closed Catmull-Rom spline through the anchors into a polygon.
 * Catmull-Rom → cubic Bézier is the standard freehand path smoothing and
 * matches what the canvas draws with bezierCurveTo.
 */
export function flattenPath(points: MaskPathPoint[], segmentsPerSpan = 8): MaskPathPoint[] {
  if (points.length < 3) return [...points];
  const out: MaskPathPoint[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let j = 0; j < segmentsPerSpan; j++) {
      const t = j / segmentsPerSpan;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  return out;
}

function pointInPath(points: MaskPathPoint[], nx: number, ny: number): boolean {
  const poly = flattenPath(points);
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    if (yi > ny !== yj > ny && nx < ((xj - xi) * (ny - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Is a normalized point inside the mask shape (before invert/feather)? */
export function maskContains(mask: ClipMaskSettings, nx: number, ny: number): boolean {
  switch (mask.shape) {
    case 'rect':
      return nx >= mask.x && nx <= mask.x + mask.w && ny >= mask.y && ny <= mask.y + mask.h;
    case 'ellipse': {
      const dx = (nx - mask.x) / Math.max(1e-6, mask.w);
      const dy = (ny - mask.y) / Math.max(1e-6, mask.h);
      return dx * dx + dy * dy <= 1;
    }
    case 'path': {
      const pts = mask.points ?? [];
      if (pts.length < 3) return false;
      return pointInPath(pts, nx, ny);
    }
    case 'linear': {
      // Project onto the wipe direction; x is the reveal threshold.
      const rad = (mask.angle * Math.PI) / 180;
      const proj = nx * Math.cos(rad) + ny * Math.sin(rad);
      return proj <= mask.x;
    }
  }
}

/** Full mask test including invert (feather is a render-time soft edge). */
export function maskKeeps(mask: ClipMaskSettings, nx: number, ny: number): boolean {
  const inside = maskContains(mask, nx, ny);
  return mask.invert ? !inside : inside;
}

const num = (v: unknown, fallback: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.max(min, Math.min(max, v as number)) : fallback;

export function sanitizeMask(value: unknown): ClipMaskSettings | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<ClipMaskSettings>;
  const shape: MaskShape =
    raw.shape === 'rect' || raw.shape === 'ellipse' || raw.shape === 'linear'
      ? raw.shape
      : 'rect';
  return {
    shape,
    x: num(raw.x, DEFAULT_MASK.x, -0.5, 1.5),
    y: num(raw.y, DEFAULT_MASK.y, -0.5, 1.5),
    w: num(raw.w, DEFAULT_MASK.w, 0.01, 2),
    h: num(raw.h, DEFAULT_MASK.h, 0.01, 2),
    angle: num(raw.angle, 0, -180, 180),
    feather: num(raw.feather, DEFAULT_MASK.feather, 0, 200),
    invert: raw.invert === true,
    points: Array.isArray(raw.points)
      ? (raw.points as unknown[])
          .filter((pt): pt is MaskPathPoint => !!pt && typeof pt === 'object' && Number.isFinite((pt as MaskPathPoint).x) && Number.isFinite((pt as MaskPathPoint).y))
          .map((pt) => ({ x: num(pt.x, 0.5, -0.5, 1.5), y: num(pt.y, 0.5, -0.5, 1.5) }))
          .slice(0, 64)
      : undefined,
  };
}

export function sanitizePip(value: unknown): PipSettings | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<PipSettings>;
  const preset: PipPreset = PIP_PRESETS.some((p) => p.id === raw.preset)
    ? (raw.preset as PipPreset)
    : DEFAULT_PIP.preset;
  return {
    enabled: raw.enabled === true,
    preset,
    size: num(raw.size, DEFAULT_PIP.size, 0.1, 0.8),
  };
}
