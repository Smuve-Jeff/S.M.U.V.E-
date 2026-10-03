/**
 * Value-range helpers for the automation curve editor.
 *
 * Automation lanes store raw parameter values (volume 0–1, pan -1–1,
 * cutoff in Hz, CC lanes 0–127). The curve editor needs a normalized 0–1
 * axis for every parameter family, so this module owns the mapping in both
 * directions — including the log scale a filter sweep needs to look right.
 */

export interface AutomationRange {
  min: number;
  max: number;
  /** Log-scaled display (filter cutoffs). */
  logarithmic?: boolean;
}

/** Resolve the display/edit range for a lane's parameter. */
export function laneRange(
  parameter: string,
  min?: number,
  max?: number,
): AutomationRange {
  if (typeof min === 'number' && typeof max === 'number' && max > min) {
    return { min, max };
  }
  if (parameter.startsWith('cc_')) {
    return {
      min: typeof min === 'number' ? min : 0,
      max: typeof max === 'number' ? max : 127,
    };
  }
  if (parameter === 'pan') return { min: -1, max: 1 };
  if (/cutoff|freq|filter/i.test(parameter)) {
    return { min: 20, max: 20_000, logarithmic: true };
  }
  return { min: 0, max: 1 };
}

/** Map a raw parameter value onto the 0–1 axis, clamped to the range. */
export function valueToNorm(value: number, range: AutomationRange): number {
  const span = range.max - range.min;
  if (!(span > 0)) return 0;
  const clamped = Math.max(range.min, Math.min(range.max, value));
  if (range.logarithmic && range.min > 0) {
    return Math.log(clamped / range.min) / Math.log(range.max / range.min);
  }
  return (clamped - range.min) / span;
}

/** Inverse of `valueToNorm`: map a 0–1 axis position back to a raw value. */
export function normToValue(norm: number, range: AutomationRange): number {
  const n = Math.max(0, Math.min(1, norm));
  if (range.logarithmic && range.min > 0) {
    return range.min * Math.pow(range.max / range.min, n);
  }
  return range.min + n * (range.max - range.min);
}

/** Human label for a lane parameter (used by the editor + tests). */
export function laneParameterLabel(parameter: string): string {
  if (parameter.startsWith('cc_')) {
    return `CC ${parameter.slice(3).trim().toUpperCase()}`;
  }
  return parameter
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toUpperCase();
}
