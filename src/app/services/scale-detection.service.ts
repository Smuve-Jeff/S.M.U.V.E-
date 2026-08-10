import { Injectable } from '@angular/core';

/**
 * Phase F3 — Auto Key / Scale Detection.
 *
 * Analyzes a track's notes and guesses the most likely root key and scale
 * using the Krumhansl–Kessler key-finding algorithm (correlation of the
 * pitch-class histogram against the two canonical K–K profiles), refined
 * with pentatonic/blues subset detection. This closes the "scale guessing"
 * gap vs FL Studio Mobile / Caustic / Koala — a one-tap ✨ Auto button in the
 * piano roll applies the result straight to the key/scale selector.
 */

/** Chromatic key names in MIDI pitch-class order (C = 0). */
export const KEY_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

export type DetectedScale = 'major' | 'minor' | 'blues' | 'pentatonic' | 'chromatic';

export interface ScaleDetectionResult {
  /** Root key name, e.g. 'C', 'F#'. */
  key: string;
  /** Detected scale name (one of the piano-roll scaleOptions). */
  scale: DetectedScale;
  /** 0.5..1 — match quality: 0.5 = the best key only ties the runner-up
   * (coin-flip), 1 = the best key beats every other candidate decisively. */
  confidence: number;
}

/** Krumhansl–Kessler major-key profile (C..B pitch classes). */
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
/** Krumhansl–Kessler minor-key profile (C..B pitch classes). */
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** Scale pitch-class sets relative to the root (0 = tonic). */
const SCALE_SETS: Record<DetectedScale, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  blues: [0, 3, 5, 6, 7, 10],
  pentatonic: [0, 2, 4, 7, 9],
  // Full chromatic — every key highlights (used by the piano-roll selector).
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

/** Exported for tests + callers that need the raw scale intervals. */
export function scaleIntervals(scale: DetectedScale): number[] {
  return [...SCALE_SETS[scale]];
}

/** Pearson correlation between two equal-length numeric arrays. */
function pearson(a: number[], b: number[]): number {
  const n = a.length;
  if (n !== b.length || n === 0) return 0;
  let sumA = 0;
  let sumB = 0;
  let sumAB = 0;
  let sumA2 = 0;
  let sumB2 = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
    sumAB += a[i] * b[i];
    sumA2 += a[i] * a[i];
    sumB2 += b[i] * b[i];
  }
  const denom = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB));
  if (denom === 0) return 0;
  return (n * sumAB - sumA * sumB) / denom;
}

@Injectable({ providedIn: 'root' })
export class ScaleDetectionService {
  /**
   * Detect the most likely key + scale for a set of notes.
   *
   * @param notes MIDI notes (only `midi` and `length` are read; length is
   *   used as a duration weight so long held notes shape the key more).
   * @returns a result, or null when there are no notes to analyze.
   */
  detectKeyAndScale(
    notes: { midi: number; length?: number }[]
  ): ScaleDetectionResult | null {
    if (!notes || notes.length === 0) return null;

    // 1. Weighted pitch-class histogram (duration weights long notes more).
    const histogram = new Array(12).fill(0);
    let total = 0;
    for (const n of notes) {
      const pc = ((Math.round(n.midi) % 12) + 12) % 12;
      const weight = Math.max(0.25, Math.min(8, n.length ?? 1));
      histogram[pc] += weight;
      total += weight;
    }
    if (total <= 0) return null;
    // Normalize so the histogram is length-invariant.
    const norm = histogram.map((v) => v / total);

    // 2. Score every (root, mode) pair with the K–K profiles.
    let bestCorr = -Infinity;
    let bestRoot = 0;
    let bestMode: 'major' | 'minor' = 'major';
    for (let root = 0; root < 12; root++) {
      for (const mode of ['major', 'minor'] as const) {
        const profile = mode === 'major' ? KK_MAJOR : KK_MINOR;
        // Rotate the profile so its tonic lands on `root`.
        const rotated = profile.map((_, i) => profile[(i - root + 12) % 12]);
        const corr = pearson(norm, rotated);
        if (corr > bestCorr) {
          bestCorr = corr;
          bestRoot = root;
          bestMode = mode;
        }
      }
    }

    // 3. Refine to pentatonic / blues when the note set is a strict subset
    //    of those scale tones for the detected root (K–K often returns
    //    'minor' for blues lines; the subset test is more specific).
    const pcs = new Set(norm.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0));
    const subsetOf = (set: number[]): boolean => {
      if (pcs.size === 0) return false;
      const shifted = set.map((iv) => (bestRoot + iv) % 12);
      return Array.from(pcs).every((pc) => shifted.includes(pc));
    };
    let scale: DetectedScale = bestMode;
    if (pcs.size <= 5 && subsetOf(SCALE_SETS.pentatonic)) scale = 'pentatonic';
    else if (subsetOf(SCALE_SETS.blues)) scale = 'blues';

    // 4. Confidence = margin over the runner-up candidate (0.5..1).
    let runnerUp = -Infinity;
    for (let root = 0; root < 12; root++) {
      for (const mode of ['major', 'minor'] as const) {
        if (root === bestRoot && mode === bestMode) continue;
        const profile = mode === 'major' ? KK_MAJOR : KK_MINOR;
        const rotated = profile.map((_, i) => profile[(i - root + 12) % 12]);
        const corr = pearson(norm, rotated);
        if (corr > runnerUp) runnerUp = corr;
      }
    }
    // bestCorr >= runnerUp by construction, so the floor is 0.5 (a complete
    // tie). The +0.5 offset maps a tie to 50% and a decisive win toward 100%.
    const confidence = Math.min(1, bestCorr - runnerUp + 0.5);

    return {
      key: KEY_NAMES[bestRoot],
      scale,
      confidence: Number(confidence.toFixed(2)),
    };
  }

  /** True when `midi` belongs to `scale` transposed to `keyName`. */
  isInScale(midi: number, keyName: string, scale: string): boolean {
    const root = KEY_NAMES.indexOf(keyName as (typeof KEY_NAMES)[number]);
    if (root < 0) return false;
    const set = SCALE_SETS[scale as DetectedScale] ?? SCALE_SETS.major;
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    return set.includes((pc - root + 12) % 12);
  }
}
