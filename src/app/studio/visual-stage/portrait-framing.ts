/** Size of an imported model's axis-aligned bounds, in stage units. */
export interface PortraitExtents {
  x: number;
  y: number;
  z: number;
}

/** Breathing room around the character, as a fraction of its bounds. */
const DEFAULT_MARGIN = 1.12;
const MIN_DISTANCE = 0.6;
const MAX_DISTANCE = 50;

/**
 * Camera distance that fits a square portrait around a model's bounds.
 *
 * A square viewport gives the same vertical and horizontal field of view, so
 * the larger of the two extents decides the fit — a tall narrow character and a
 * wide low one both stay inside the frame. The front face of the bounding box
 * sits nearer to the camera than its centre, so half the depth is added back to
 * keep a deep model from clipping at its nose.
 */
export function portraitCameraDistance(
  extents: PortraitExtents,
  fovDegrees: number,
  margin = DEFAULT_MARGIN,
): number {
  const largest = Math.max(extents.y, extents.x);
  const halfTan = Math.tan((fovDegrees * Math.PI) / 180 / 2);
  if (
    !Number.isFinite(largest) ||
    largest <= 0 ||
    !Number.isFinite(halfTan) ||
    halfTan <= 0
  ) {
    return MIN_DISTANCE;
  }
  const distance =
    (largest * margin) / 2 / halfTan + Math.max(0, extents.z) / 2;
  return Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, distance));
}
