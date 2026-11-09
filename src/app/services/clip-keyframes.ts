/**
 * Keyframe animation for video clips — the core editing vocabulary that
 * professional mobile editors (CapCut, VN, KineMaster, LumaFusion) all share
 * and that the Lab previously lacked: instead of one fixed Ken Burns preset,
 * any clip can carry its own timed transforms.
 *
 * This module is pure (no Angular, no canvas): the component evaluates it
 * per frame inside `renderClipLayer`, and the video engine persists it.
 * Times are clip-local seconds; values are in each property's own unit.
 */

export type KeyframeProperty =
  | 'positionX'
  | 'positionY'
  | 'scale'
  | 'opacity'
  | 'rotation';

export type KeyframeEasing =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'step';

export interface ClipKeyframe {
  id: string;
  /** Clip-local time in seconds. */
  time: number;
  property: KeyframeProperty;
  value: number;
  easing: KeyframeEasing;
}

/** Fully resolved transform at one instant. */
export interface ClipTransformState {
  /** Fraction of canvas width, -0.5 (left edge) .. 0.5 (right edge). */
  positionX: number;
  /** Fraction of canvas height, -0.5 (top) .. 0.5 (bottom). */
  positionY: number;
  /** 1 = source size. */
  scale: number;
  /** 0..1 */
  opacity: number;
  /** Degrees, clockwise. */
  rotation: number;
}

export const DEFAULT_CLIP_TRANSFORM: ClipTransformState = {
  positionX: 0,
  positionY: 0,
  scale: 1,
  opacity: 1,
  rotation: 0,
};

export const KEYFRAME_PROPERTIES: {
  id: KeyframeProperty;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}[] = [
  { id: 'positionX', label: 'Position X', min: -0.5, max: 0.5, step: 0.01, defaultValue: 0 },
  { id: 'positionY', label: 'Position Y', min: -0.5, max: 0.5, step: 0.01, defaultValue: 0 },
  { id: 'scale', label: 'Scale', min: 0.25, max: 4, step: 0.01, defaultValue: 1 },
  { id: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.01, defaultValue: 1 },
  { id: 'rotation', label: 'Rotation', min: -180, max: 180, step: 1, defaultValue: 0 },
];

export const KEYFRAME_EASINGS: { id: KeyframeEasing; label: string }[] = [
  { id: 'linear', label: 'Linear' },
  { id: 'ease-in', label: 'Ease In' },
  { id: 'ease-out', label: 'Ease Out' },
  { id: 'ease-in-out', label: 'Ease In/Out' },
  { id: 'step', label: 'Hold (Step)' },
];

export function isKeyframeProperty(value: unknown): value is KeyframeProperty {
  return KEYFRAME_PROPERTIES.some((p) => p.id === value);
}

export function isKeyframeEasing(value: unknown): value is KeyframeEasing {
  return KEYFRAME_EASINGS.some((e) => e.id === value);
}

/** Apply an easing curve to a 0..1 segment progress. */
export function applyEasing(progress: number, easing: KeyframeEasing): number {
  const t = Math.max(0, Math.min(1, progress));
  switch (easing) {
    case 'ease-in':
      return t * t;
    case 'ease-out':
      return 1 - (1 - t) * (1 - t);
    case 'ease-in-out':
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case 'step':
      return t >= 1 ? 1 : 0;
    case 'linear':
    default:
      return t;
  }
}

function clampToProperty(property: KeyframeProperty, value: number): number {
  const spec = KEYFRAME_PROPERTIES.find((p) => p.id === property);
  if (!spec || !Number.isFinite(value)) return spec?.defaultValue ?? 0;
  return Math.max(spec.min, Math.min(spec.max, value));
}

/**
 * Drop malformed entries (hand-edited/old records) and clamp the rest, so a
 * restored project can never evaluate to NaN on the canvas.
 */
export function sanitizeKeyframes(value: unknown): ClipKeyframe[] {
  if (!Array.isArray(value)) return [];
  const out: ClipKeyframe[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const kf = entry as Partial<ClipKeyframe>;
    if (!isKeyframeProperty(kf.property)) continue;
    if (!Number.isFinite(kf.time) || !Number.isFinite(kf.value)) continue;
    out.push({
      id: typeof kf.id === 'string' && kf.id ? kf.id : `kf-${out.length}`,
      time: Math.max(0, kf.time as number),
      property: kf.property,
      value: clampToProperty(kf.property, kf.value as number),
      easing: isKeyframeEasing(kf.easing) ? kf.easing : 'linear',
    });
  }
  return sortKeyframes(out);
}

export function sortKeyframes(keyframes: ClipKeyframe[]): ClipKeyframe[] {
  return [...keyframes].sort((a, b) => a.time - b.time || a.property.localeCompare(b.property));
}

/**
 * Add (or replace) a keyframe at the same time + property, clamped to the
 * clip's duration. Returns a new sorted list; the input is never mutated.
 */
export function addKeyframe(
  keyframes: ClipKeyframe[] | undefined,
  keyframe: ClipKeyframe,
  clipDuration: number,
): ClipKeyframe[] {
  const clean: ClipKeyframe = {
    id: keyframe.id || `kf-${Math.random().toString(36).slice(2, 9)}`,
    time: Math.max(0, Math.min(Math.max(0.01, clipDuration), keyframe.time)),
    property: keyframe.property,
    value: clampToProperty(keyframe.property, keyframe.value),
    easing: isKeyframeEasing(keyframe.easing) ? keyframe.easing : 'linear',
  };
  const rest = (keyframes ?? []).filter(
    (kf) => !(kf.property === clean.property && Math.abs(kf.time - clean.time) < 1e-6),
  );
  return sortKeyframes([...rest, clean]);
}

export function removeKeyframe(
  keyframes: ClipKeyframe[] | undefined,
  keyframeId: string,
): ClipKeyframe[] {
  return (keyframes ?? []).filter((kf) => kf.id !== keyframeId);
}

/**
 * Evaluate every property at `clipLocalTime`.
 *
 * Before a property's first keyframe it holds that first value;
 * after its last it holds that value; between two it interpolates with the
 * *earlier* keyframe's easing, matching how pro editors attach easing to the
 * outgoing keyframe. No keyframes at all → identity, so existing clips are
 * pixel-identical to before.
 */
export function evaluateKeyframes(
  keyframes: ClipKeyframe[] | undefined,
  clipLocalTime: number,
): ClipTransformState {
  const state: ClipTransformState = { ...DEFAULT_CLIP_TRANSFORM };
  if (!keyframes?.length) return state;
  const time = Math.max(0, clipLocalTime);

  for (const property of KEYFRAME_PROPERTIES) {
    const keys = keyframes
      .filter((kf) => kf.property === property.id)
      .sort((a, b) => a.time - b.time);
    if (!keys.length) continue;
    if (time <= keys[0].time) {
      state[property.id] = keys[0].value;
      continue;
    }
    const last = keys[keys.length - 1];
    if (time >= last.time) {
      state[property.id] = last.value;
      continue;
    }
    for (let i = 0; i < keys.length - 1; i++) {
      const from = keys[i];
      const to = keys[i + 1];
      if (time >= from.time && time <= to.time) {
        const span = to.time - from.time;
        const progress = span <= 0 ? 1 : (time - from.time) / span;
        const eased = applyEasing(progress, from.easing);
        state[property.id] = from.value + (to.value - from.value) * eased;
        break;
      }
    }
  }
  return state;
}

export function hasKeyframes(keyframes: ClipKeyframe[] | undefined): boolean {
  return Array.isArray(keyframes) && keyframes.length > 0;
}
