/**
 * One source of truth for delivery targets.
 *
 * Mastering conforms the master to these numbers; the export review measures
 * the rendered file against the same definitions. Before this module they were
 * two separate lists, so the review could pass a master that Mastering would
 * have called miss (CD was -9 / -0.1 in one place and -9 / -0.3 in the other).
 *
 * Values come from the platforms' published mastering guidance. Where no
 * standard exists (CD has no loudness spec), the note says so instead of
 * presenting a convention as a rule.
 */

export interface DeliveryTarget {
  id: string;
  /** Short platform name for Mastering's conform chips. */
  platform: string;
  /** Descriptive label for the export review's selector. */
  label: string;
  /** Integrated loudness the platform normalizes to, LUFS. */
  targetLufs: number;
  /** True-peak ceiling, dBTP. */
  ceilingDbtp: number;
  /** Allowed distance from the loudness target before it counts as a miss. */
  toleranceLu: number;
  /** Honest context, including where the number comes from. */
  note: string;
}

export const DELIVERY_TARGETS: readonly DeliveryTarget[] = [
  {
    id: "spotify",
    platform: "Spotify",
    label: "Spotify · streaming",
    targetLufs: -14,
    ceilingDbtp: -1,
    toleranceLu: 1,
    note: "Normalized to about -14 LUFS; loud masters are turned down, not up.",
  },
  {
    id: "apple",
    platform: "Apple Music",
    label: "Apple Music · Sound Check",
    targetLufs: -16,
    ceilingDbtp: -1,
    toleranceLu: 1,
    note: "Sound Check normalizes to about -16 LUFS with a tight -1 dBTP ceiling.",
  },
  {
    id: "youtube",
    platform: "YouTube",
    label: "YouTube · streaming",
    targetLufs: -14,
    ceilingDbtp: -1,
    toleranceLu: 1,
    note: "Same integrated target as Spotify; phones monitor in mono.",
  },
  {
    id: "podcast",
    platform: "Podcast / spoken",
    label: "Podcast · spoken",
    targetLufs: -16,
    ceilingDbtp: -1.5,
    toleranceLu: 1,
    note: "Speech-first spec; leaves room for phone-speaker intelligibility.",
  },
  {
    id: "club",
    platform: "Club / loud",
    label: "Club · loud master",
    targetLufs: -9,
    ceilingDbtp: -0.3,
    toleranceLu: 1,
    note: "Deliberately hot: play systems, not streamers, hear this one.",
  },
  {
    id: "cd",
    platform: "CD",
    label: "CD / full-scale master",
    targetLufs: -9,
    ceilingDbtp: -0.1,
    toleranceLu: 1,
    note: "Red Book has no loudness standard; -9 LUFS is a common modern CD level. Stay below -0.1 dBTP.",
  },
];

/** The measurements compared against a target. */
export interface MeasuredMaster {
  truePeakDb: number;
  lufs: number;
  correlation: number;
}

/** A one-shot request to conform Mastering to a target chosen elsewhere. */
export interface DeliveryTargetRequest {
  targetId: string;
  /** Makes each request distinct, so asking twice re-conforms. */
  at: number;
}

export interface DeliveryCheck {
  id: "loudness" | "truePeak" | "phase";
  label: string;
  measured: string;
  target: string;
  pass: boolean;
}

export interface DeliveryComparison {
  targetId: string;
  targetLabel: string;
  checks: DeliveryCheck[];
  allPass: boolean;
}

/**
 * Compare a measured master with a target, one row per measurement.
 *
 * Phase has no platform number: it only passes when the channels do not
 * cancel in mono, so it is reported as pass/miss on its own.
 */
export function compareToDeliveryTarget(
  master: MeasuredMaster,
  target: DeliveryTarget,
): DeliveryComparison {
  const loudnessPass =
    Math.abs(master.lufs - target.targetLufs) <= target.toleranceLu;
  const truePeakPass = master.truePeakDb <= target.ceilingDbtp;
  const phasePass = master.correlation >= 0;

  return {
    targetId: target.id,
    targetLabel: target.label,
    allPass: loudnessPass && truePeakPass && phasePass,
    checks: [
      {
        id: "loudness",
        label: "Integrated loudness",
        measured: `${master.lufs} LUFS`,
        target: `${target.targetLufs} ±${target.toleranceLu} LUFS`,
        pass: loudnessPass,
      },
      {
        id: "truePeak",
        label: "True peak",
        measured: `${master.truePeakDb} dBTP`,
        target: `≤ ${target.ceilingDbtp} dBTP`,
        pass: truePeakPass,
      },
      {
        id: "phase",
        label: "Mono phase",
        measured: `${master.correlation}`,
        target: "≥ 0",
        pass: phasePass,
      },
    ],
  };
}
