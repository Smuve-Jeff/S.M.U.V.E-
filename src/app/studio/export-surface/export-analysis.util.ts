/**
 * The measurements the shared BS.1770 meter returns for a rendered buffer.
 *
 * Delivery targets and their comparison live in `studio/shared/delivery-targets`
 * because Mastering and the export review must describe one master with one
 * set of numbers. This module re-exports them so export code has one import.
 */
import {
  DELIVERY_TARGETS,
  compareToDeliveryTarget,
} from "../shared/delivery-targets";

export { DELIVERY_TARGETS, compareToDeliveryTarget };
export type {
  DeliveryCheck,
  DeliveryComparison,
  DeliveryTarget,
} from "../shared/delivery-targets";

export interface ExportAnalysis {
  peakDb: number;
  truePeakDb: number;
  lufs: number;
  lra: number;
  correlation: number;
}

export interface ExportAnalysisVerdict extends ExportAnalysis {
  /** Delivery risks, each with the measurement that triggered it. */
  warnings: string[];
}

/**
 * Practical delivery checks on the audio that was just encoded.
 *
 * These are measurements, not a score: every warning names the number that
 * triggered it so the artist can decide. The thresholds are deliberately loose
 * (they catch clipped, silent, phase-inverted or wildly loud masters, not style
 * choices), because a DAW has no business calling a quiet bridge or a loud
 * chorus wrong.
 */
export function describeExportAnalysis(
  analysis: ExportAnalysis,
): ExportAnalysisVerdict {
  const warnings: string[] = [];

  if (analysis.peakDb <= -60 || analysis.lufs <= -60) {
    warnings.push(
      "The exported file is effectively silent. Check track levels, mute/solo and master gain.",
    );
  } else {
    if (analysis.truePeakDb > -1) {
      warnings.push(
        `True peak is ${analysis.truePeakDb} dBTP — leave about 1 dB of headroom so lossy encoding and playback do not clip.`,
      );
    }
    if (analysis.lufs > -8) {
      warnings.push(
        `Mastered at ${analysis.lufs} LUFS — loud enough that streaming services will turn it down.`,
      );
    } else if (analysis.lufs < -20) {
      warnings.push(
        `Mastered at ${analysis.lufs} LUFS — quiet next to typical streaming releases (-14 to -9 LUFS).`,
      );
    }
    if (analysis.correlation < 0) {
      warnings.push(
        `Phase correlation is ${analysis.correlation} — the mix may cancel when summed to mono.`,
      );
    }
  }

  return { ...analysis, warnings };
}
