/** Bar counts the Music Video Maker offers for one delivery part. */
export const MUSIC_BARS_PER_PART_OPTIONS = [4, 8, 16, 32] as const;
export type MusicBarsPerPart = (typeof MUSIC_BARS_PER_PART_OPTIONS)[number];
export const DEFAULT_MUSIC_BARS_PER_PART: MusicBarsPerPart = 16;

/** Clamp a stored or UI-supplied bar choice to a supported option. */
export function sanitizeMusicBarsPerPart(value: unknown): MusicBarsPerPart {
  const parsed = Math.round(Number(value));
  return (
    MUSIC_BARS_PER_PART_OPTIONS.find((option) => option === parsed) ??
    DEFAULT_MUSIC_BARS_PER_PART
  );
}

/**
 * Range planning for long-form master exports.
 *
 * The renderer captures in real time, so a two-hour feature cannot be one
 * browser take. These ranges walk from a chosen start to the end of the
 * timeline in fixed sections; the queue records and downloads each one before
 * starting the next.
 */

export interface MasterExportRange {
  /** Zero-based position in the queue. */
  index: number;
  /** Timeline offset the section starts at, in seconds. */
  start: number;
  /** Captured length, in seconds. The final section may be shorter. */
  seconds: number;
  /** Timeline offset just past this section. */
  end: number;
}

const MIN_RANGE_SECONDS = 0.05;

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Split `[start, duration)` into sections no longer than `sectionSeconds`.
 *
 * The first section begins at the clamped start, every intermediate section is
 * exactly one `sectionSeconds` long, and the final section carries the
 * remainder. A start at or past the tail returns no ranges rather than a
 * zero-length capture.
 */
export function planMasterRanges(
  start: number,
  duration: number,
  sectionSeconds = 120
): MasterExportRange[] {
  const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  const safeSection = Math.max(
    MIN_RANGE_SECONDS,
    Math.floor(Number.isFinite(sectionSeconds) ? sectionSeconds : 120)
  );
  if (safeDuration <= 0) return [];

  const requestedStart = Number.isFinite(start) ? start : 0;
  const first = Math.min(Math.max(0, requestedStart), safeDuration);
  if (first >= safeDuration - 0.0001) return [];

  const ranges: MasterExportRange[] = [];
  let cursor = first;
  let index = 0;

  while (cursor < safeDuration - 0.0001) {
    const seconds = Math.min(safeSection, safeDuration - cursor);
    if (seconds < MIN_RANGE_SECONDS) break;

    ranges.push({
      index,
      start: roundSeconds(cursor),
      seconds: roundSeconds(seconds),
      end: roundSeconds(cursor + seconds),
    });
    cursor += safeSection;
    index += 1;
  }

  return ranges;
}

/**
 * Seconds in one 4/4 bar at a tempo. Mirrors the engine's grid so a music-video
 * delivery section ends exactly where the edit's bar line does.
 */
export function barLengthSeconds(bpm: number): number {
  const safeBpm = Number.isFinite(bpm) ? Math.max(1, bpm) : 120;
  return (60 / safeBpm) * 4;
}

/**
 * Split a music-video timeline on bar boundaries.
 *
 * A song is cut in bars, not fixed minute windows. Sections therefore span
 * whole bars (`barsPerSection`) and start on a bar line, capped at
 * `maxSectionSeconds` so every pass still fits the recorder. The first section
 * floors to the bar containing the requested start, preserving the operator's
 * coverage instead of skipping ahead.
 */
export function planMusicVideoRanges(
  start: number,
  duration: number,
  bpm: number,
  barsPerSection = 16,
  maxSectionSeconds = 120
): MasterExportRange[] {
  const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  if (safeDuration <= 0) return [];

  const bar = barLengthSeconds(bpm);
  const maxBars = Math.max(
    1,
    Math.floor(Math.max(0.05, maxSectionSeconds) / bar + 1e-9)
  );
  const requestedBars = Math.floor(
    Number.isFinite(barsPerSection) ? barsPerSection : 16
  );
  const bars = Math.min(Math.max(1, requestedBars), maxBars);
  const sectionSeconds = bars * bar;

  const requestedStart = Number.isFinite(start) ? start : 0;
  const first = Math.max(
    0,
    Math.floor(Math.max(0, requestedStart) / bar + 1e-9) * bar
  );
  if (first >= safeDuration - 0.0001) return [];

  const ranges: MasterExportRange[] = [];
  let index = 0;
  let cursor = first;
  while (cursor < safeDuration - 0.0001) {
    const seconds = Math.min(sectionSeconds, safeDuration - cursor);
    if (seconds < MIN_RANGE_SECONDS) break;
    ranges.push({
      index,
      start: roundSeconds(cursor),
      seconds: roundSeconds(seconds),
      end: roundSeconds(cursor + seconds),
    });
    index += 1;
    cursor = first + index * sectionSeconds;
  }

  return ranges;
}

export type ExportSectionStatus = 'pending' | 'rendered' | 'failed' | 'skipped';

/** One queued section plus the file it produced, for the film manifest. */
export interface FilmSectionRecord extends MasterExportRange {
  fileName: string | null;
  status: ExportSectionStatus;
}

export interface MusicGridMeta {
  bpm: number;
  beatSeconds: number;
  barSeconds: number;
  barsPerSection: number;
}

export interface FilmManifestMeta {
  project: string;
  productionMode: string;
  presetId: string;
  presetName: string;
  width: number;
  height: number;
  fps: number;
  codec: string;
  bitrate: number;
  sectionSeconds: number;
  /** Present for music-video deliveries so the join can be verified on-grid. */
  music?: MusicGridMeta;
}

const MANIFEST_FORMAT = 'smuve-film-manifest/v1';

/**
 * Serialize a downloadable assembly manifest.
 *
 * The queue writes one file per section; the manifest is what makes a folder
 * of downloads reconstructable later. Times are timeline seconds, filenames
 * are the exact names the browser saved, and skipped sections are explicit
 * rather than silently absent.
 */
export function buildFilmManifest(
  meta: FilmManifestMeta,
  sections: readonly FilmSectionRecord[],
  generatedAt = new Date().toISOString()
): string {
  return JSON.stringify(
    {
      format: MANIFEST_FORMAT,
      generatedAt,
      project: meta.project,
      productionMode: meta.productionMode,
      deliveryPreset: {
        id: meta.presetId,
        name: meta.presetName,
        width: meta.width,
        height: meta.height,
      },
      master: {
        width: meta.width,
        height: meta.height,
        fps: meta.fps,
        codec: meta.codec,
        bitrate: meta.bitrate,
      },
      sectionSeconds: meta.sectionSeconds,
      ...(meta.music ? { music: meta.music } : {}),
      sections: sections.map((section) => ({
        index: section.index,
        start: section.start,
        end: section.end,
        seconds: section.seconds,
        fileName: section.fileName,
        status: section.status,
        // 1-based inclusive bar span, so a music-video manifest can be
        // checked against the song grid without recomputing the tempo.
        ...(meta.music && meta.music.barSeconds > 0
          ? {
              barStart:
                Math.floor(section.start / meta.music.barSeconds + 1e-6) + 1,
              barEnd: Math.max(
                1,
                Math.ceil(section.end / meta.music.barSeconds - 1e-6)
              ),
            }
          : {}),
      })),
    },
    null,
    2
  );
}
