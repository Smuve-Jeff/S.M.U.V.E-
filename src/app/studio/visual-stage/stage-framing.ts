/** Size of a performer's axis-aligned bounds, in stage units. */
export interface StageExtents {
  x: number;
  y: number;
  z: number;
}

/** Orbit radius the stage uses for the built-in performer. */
export const DEFAULT_ORBIT_RADIUS = 7.2;
/** Radius of the stage floor's disc at its designed size. */
export const BASE_FLOOR_RADIUS = 4.8;
export const MIN_ORBIT_RADIUS = 4.2;
export const MAX_ORBIT_RADIUS = 11;

/** Breathing room around an imported performer, as a fraction of its bounds. */
const STAGE_MARGIN = 1.14;
const MIN_FRAMED_DISTANCE = 3;
const MAX_FRAMED_DISTANCE = 48;
/** The stage camera's far plane sits just beyond the deepest framed view. */
const MAX_FOG_FAR = 78;

/**
 * Orbit radius that keeps an imported performer fully in frame.
 *
 * A humanoid is limited by the vertical field of view; a wide model is limited
 * by the horizontal one, which narrows as the stage does. Both fits are
 * compared so neither extreme is cropped. The stage orbits, so the horizontal
 * fit uses the footprint diagonal rather than the width in one pose — a sofa
 * stays whole as it turns — and half the depth is added back because the orbit
 * radius is measured to the model's centre, not its nearest face.
 *
 * Returns 0 when the bounds are unusable, which callers treat as "keep the
 * built-in framing".
 */
export function stageCameraDistance(
  extents: StageExtents,
  fovDegrees: number,
  aspect: number,
  margin = STAGE_MARGIN,
): number {
  const halfTan = Math.tan((fovDegrees * Math.PI) / 180 / 2);
  const height = Math.max(0, extents.y);
  const footprint = Math.hypot(Math.max(0, extents.x), Math.max(0, extents.z));
  if (
    !Number.isFinite(halfTan) ||
    halfTan <= 0 ||
    !Number.isFinite(height) ||
    !Number.isFinite(footprint) ||
    (height <= 0 && footprint <= 0)
  ) {
    return 0;
  }
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const vertical = (height * margin) / 2 / halfTan;
  const horizontal = (footprint * margin) / 2 / halfTan / safeAspect;
  const distance = Math.max(vertical, horizontal) + Math.max(0, extents.z) / 2;
  return Math.min(MAX_FRAMED_DISTANCE, Math.max(MIN_FRAMED_DISTANCE, distance));
}

/** How far the floor reaches past a performer's furthest corner. */
const FLOOR_MARGIN = 1.3;
/** Beyond this the disc outgrows what the camera can frame, so it stops growing. */
const MAX_FLOOR_SCALE = 5;

/**
 * Uniform scale for the stage floor and its light rings. A performer wider than
 * the built-in slot would otherwise hang past the edge of the disc and bury the
 * rings under its body, so the stage grows just enough to sit under it.
 */
export function stageFloorScale(extents: StageExtents | null): number {
  if (!extents) return 1;
  const reach = Math.hypot(Math.max(0, extents.x), Math.max(0, extents.z)) / 2;
  if (!Number.isFinite(reach) || reach <= 0) return 1;
  const needed = (reach * FLOOR_MARGIN) / BASE_FLOOR_RADIUS;
  return Math.min(MAX_FLOOR_SCALE, Math.max(1, needed));
}

/** Radii of the spectrum's two light-bar rings at their designed size. */
export const BAR_RING_RADIUS = 2.02;
export const INNER_BAR_RING_RADIUS = 1.5;
/** The bars sit just outside the performer's furthest corner. */
const BAR_RING_CLEARANCE = 1.06;
/** Leave a sliver of floor between the outermost bars and the disc's edge. */
const BAR_RING_EDGE = 0.97;
const RING_GAP = BAR_RING_RADIUS - INNER_BAR_RING_RADIUS;

export interface BarRings {
  inner: number;
  outer: number;
}

/**
 * Radii for the spectrum's light-bar rings. They follow the floor outwards, the
 * inner ring clears the performer's footprint so a wide model cannot stand on
 * top of it, and the outer ring keeps the designed gap between the two while
 * staying on the floor disc — the floor growing is what makes room for both.
 */
export function stageBarRings(
  extents: StageExtents | null,
  floorScale = 1,
): BarRings {
  const floor = Number.isFinite(floorScale) && floorScale > 0 ? floorScale : 1;
  const disc = BASE_FLOOR_RADIUS * floor;
  let inner = INNER_BAR_RING_RADIUS * floor;
  let outer = BAR_RING_RADIUS * floor;
  const reach = extents
    ? Math.hypot(Math.max(0, extents.x), Math.max(0, extents.z)) / 2
    : 0;
  if (Number.isFinite(reach) && reach > 0) {
    inner = Math.max(inner, reach * BAR_RING_CLEARANCE);
  }
  outer = Math.min(Math.max(outer, inner + RING_GAP), disc * BAR_RING_EDGE);
  // Only a disc capped below the model itself can force the rings closer.
  inner = Math.min(inner, outer - RING_GAP);
  return { inner, outer };
}

export interface OrbitLimits {
  min: number;
  max: number;
}

/**
 * Zoom range for a framed performer. A pulled-back view needs to be zoomable
 * further out, and zooming in must not put the camera inside a wide model.
 */
export function orbitLimitsFor(distance: number): OrbitLimits {
  const framed =
    Number.isFinite(distance) && distance > 0 ? distance : DEFAULT_ORBIT_RADIUS;
  const max = Math.max(MAX_ORBIT_RADIUS, framed * 1.5);
  return {
    min: Math.min(max, Math.max(MIN_ORBIT_RADIUS, framed * 0.45)),
    max,
  };
}

/**
 * Fog depth matched to the framed camera. The default range keeps the stage's
 * look; when a wide performer forces the camera back, the fog follows so the
 * model is not washed out before it is framed.
 */
export function stageFogRange(distance: number): { near: number; far: number } {
  const framed =
    Number.isFinite(distance) && distance > 0 ? distance : DEFAULT_ORBIT_RADIUS;
  return {
    near: Math.max(7, framed * 0.97),
    far: Math.min(MAX_FOG_FAR, Math.max(22, framed * 3.05)),
  };
}
