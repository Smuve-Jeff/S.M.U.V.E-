/**
 * Source quality assessment.
 *
 * The analyser can read a file's real duration and frame size. Those two
 * numbers already answer the questions that decide a delivery: is this a
 * music-video-length source or a feature, is a 4K master honest or an
 * upscale, and will the browser's real-time capture window cover it? This
 * module turns measured metadata into that advice without pretending to know
 * the source frame rate or codec, which the browser does not expose.
 */

import type { VideoMetadata } from './videoAnalysis';

/** Seconds a single browser master pass can record (the lab's export cap). */
export const MASTER_CAPTURE_WINDOW_SECONDS = 120;

export type SourceTier = 'sd' | 'hd' | 'fhd' | 'qhd' | 'uhd';
export type SourceOrientation = 'landscape' | 'portrait' | 'square' | 'unknown';
export type RuntimeClass = 'spot' | 'music-video' | 'long-form' | 'feature';

export interface MasterRecommendation {
  /** Even width in pixels. */
  width: number;
  /** Even height in pixels. */
  height: number;
  /** Delivery frame rate. The source rate is not exposed by HTMLVideoElement. */
  fps: number;
  /** Encoder target in megabits per second. */
  bitrateMbps: number;
}

export interface SourceAssessment {
  /** Resolution class measured from the source's long edge. */
  tier: SourceTier;
  orientation: SourceOrientation;
  /** How the runtime is normally delivered. */
  runtimeClass: RuntimeClass;
  /** Source megapixels, rounded to two decimals. */
  megapixels: number;
  /** Size-derived average bitrate, or null when duration is unknown. */
  estimatedBitrateMbps: number | null;
  /** How many times a 4K long edge would enlarge this source (1 = no upscale). */
  upscaleTo4k: number;
  /** True for pieces long enough to need a long-form workflow. */
  longForm: boolean;
  /** True when one 120-second browser pass cannot cover the source. */
  exceedsCaptureWindow: boolean;
  /** Operator-facing issues, strongest first. Empty when nothing is wrong. */
  warnings: string[];
  /** A master that preserves the source aspect without inventing detail. */
  recommendedMaster: MasterRecommendation;
}

const TARGET_LONG_EDGE = 3840;
const MIN_MASTER_LONG_EDGE = 640;
const BITS_PER_PIXEL = 0.12;
const MIN_BITRATE_MBPS = 6;
const MAX_BITRATE_MBPS = 60;
const LOW_BITRATE_MBPS = 8;

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

function tierFor(longEdge: number): SourceTier {
  if (longEdge >= 3840) return 'uhd';
  if (longEdge >= 2560) return 'qhd';
  if (longEdge >= 1920) return 'fhd';
  if (longEdge >= 1280) return 'hd';
  return 'sd';
}

function runtimeClassFor(duration: number): RuntimeClass {
  if (duration >= 3600) return 'feature';
  if (duration >= 900) return 'long-form';
  if (duration >= 180) return 'music-video';
  return 'spot';
}

function formatRuntime(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

/**
 * Assess a measured source for delivery.
 *
 * The recommendation never upscales beyond 4K and never recommends a master
 * smaller than 640px on its long edge. Frame rate is fixed at 30 because the
 * browser's video element exposes no reliable source-rate reading; callers
 * that know the project's rate can override it.
 */
export function assessSource(metadata: VideoMetadata): SourceAssessment {
  const width = Math.max(0, Math.round(metadata.width || 0));
  const height = Math.max(0, Math.round(metadata.height || 0));
  const longEdge = Math.max(width, height);
  const duration = Number.isFinite(metadata.duration)
    ? Math.max(0, metadata.duration)
    : 0;
  const size = Math.max(0, metadata.size || 0);

  const orientation: SourceOrientation =
    width === 0 || height === 0
      ? 'unknown'
      : width === height
        ? 'square'
        : width > height
          ? 'landscape'
          : 'portrait';
  const runtimeClass = runtimeClassFor(duration);
  const longForm = duration >= 900;
  const exceedsCaptureWindow = duration > MASTER_CAPTURE_WINDOW_SECONDS;
  const estimatedBitrateMbps =
    duration > 0 && size > 0 ? round((size * 8) / duration / 1_000_000, 1) : null;
  const upscaleTo4k =
    longEdge > 0 ? round(Math.max(1, TARGET_LONG_EDGE / longEdge), 2) : 1;

  const warnings: string[] = [];
  if (longEdge === 0) {
    warnings.push('The file did not report usable frame dimensions.');
  }
  if (upscaleTo4k >= 1.5) {
    warnings.push(
      `Source is ${width}×${height}; a 4K master would upscale it ${upscaleTo4k}× and cannot add detail.`
    );
  }
  if (estimatedBitrateMbps !== null && estimatedBitrateMbps < LOW_BITRATE_MBPS) {
    warnings.push(
      `Average source bitrate is about ${estimatedBitrateMbps} Mbps; a large master may magnify compression artifacts.`
    );
  }
  if (runtimeClass === 'feature') {
    warnings.push(
      'Feature-length source: use the 2-hour delivery preset and export it section by section.'
    );
  } else if (exceedsCaptureWindow) {
    warnings.push(
      `Runtime is ${formatRuntime(duration)}; the browser records ${MASTER_CAPTURE_WINDOW_SECONDS}s per pass. Export it in ranges.`
    );
  }
  if (duration === 0) {
    warnings.push('Duration is unknown, so the timeline keeps its preset fallback length.');
  }

  const masterLongEdge = Math.min(
    TARGET_LONG_EDGE,
    Math.max(MIN_MASTER_LONG_EDGE, longEdge || 1920)
  );
  const ratio = width > 0 && height > 0 ? width / height : 16 / 9;
  const masterWidth =
    ratio >= 1 ? masterLongEdge : Math.round(masterLongEdge * ratio);
  const masterHeight =
    ratio >= 1 ? Math.round(masterLongEdge / ratio) : masterLongEdge;
  const masterPixels = even(masterWidth) * even(masterHeight);
  const bitrateMbps = Math.min(
    MAX_BITRATE_MBPS,
    Math.max(MIN_BITRATE_MBPS, round((masterPixels * 30 * BITS_PER_PIXEL) / 1_000_000, 1))
  );

  return {
    tier: tierFor(longEdge),
    orientation,
    runtimeClass,
    megapixels: round((width * height) / 1_000_000, 2),
    estimatedBitrateMbps,
    upscaleTo4k,
    longForm,
    exceedsCaptureWindow,
    warnings,
    recommendedMaster: {
      width: even(masterWidth),
      height: even(masterHeight),
      fps: 30,
      bitrateMbps,
    },
  };
}
