/**
 * Per-viewer link thresholds. A delivery preset owns its own values so a 4K
 * film master is not judged by the bitrate a vertical social stream needs,
 * and so an interactive live preset can demand lower latency.
 */
export interface ViewerHealthThresholds {
  rttFairMs: number;
  rttPoorMs: number;
  kbpsFair: number;
  kbpsPoor: number;
}

/** Used by surfaces with no delivery preset (for example Tha Spot). */
export const DEFAULT_VIEWER_HEALTH: ViewerHealthThresholds = {
  rttFairMs: 120,
  rttPoorMs: 250,
  kbpsFair: 1500,
  kbpsPoor: 500,
};

/** True when all four limits are positive and ordered fair-before-poor. */
export function isValidViewerHealth(
  thresholds: ViewerHealthThresholds | null | undefined,
): thresholds is ViewerHealthThresholds {
  if (!thresholds) return false;
  return (
    [
      thresholds.rttFairMs,
      thresholds.rttPoorMs,
      thresholds.kbpsFair,
      thresholds.kbpsPoor,
    ].every((value) => Number.isFinite(value) && value > 0) &&
    thresholds.rttFairMs < thresholds.rttPoorMs &&
    thresholds.kbpsFair > thresholds.kbpsPoor
  );
}
