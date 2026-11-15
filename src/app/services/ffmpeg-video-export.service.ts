import { Injectable, inject } from '@angular/core';
import { LoggingService } from './logging.service';

/**
 * FFmpeg.wasm MP4/H.264 export for the Image & Video Lab.
 *
 * The lab captures the programme monitor in real time (canvas + master bus,
 * see `ExportService.startVideoExport`). That capture is an intermediate,
 * not the deliverable: browsers mux it as WebM/VP9, which most social
 * platforms, reels and desktop players do not accept. This service transcodes
 * the capture to a real MP4/H.264 + AAC file with FFmpeg.wasm
 * (`libx264`/`aac`, `+faststart` so the moov box sits up front and playback
 * can start before the download finishes), validates the bytes really are
 * an MP4, and only then hands the blob to the caller.
 *
 * The FFmpeg core (~30 MB wasm) is loaded lazily from a CDN on the first
 * export instead of being bundled, so it never weighs down the initial app
 * download. The single-thread core needs no COOP/COEP headers, which keeps
 * the build deployable to static hosts such as GitHub Pages.
 */

export const FFMPEG_CORE_VERSION = '0.12.10';
export const FFMPEG_CORE_BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`;

export interface Mp4Validation {
  valid: boolean;
  reason: string;
  /** ISO-BMFF major brand from the `ftyp` box, e.g. `isom` / `mp42`. */
  brand: string | null;
  hasFtyp: boolean;
  hasMoov: boolean;
  hasMdat: boolean;
  size: number;
}

export interface Mp4TranscodeOptions {
  crf?: number;
  preset?: string;
  audioBitrate?: string;
  /** Trim the output to this many seconds (queue sections carry a tail guard). */
  trimSeconds?: number;
  onProgress?: (progress: number) => void;
}

/** Minimal shape of the `@ffmpeg/ffmpeg` instance this service drives. */
export interface FfmpegLike {
  loaded: boolean;
  load(config: Record<string, unknown>): Promise<unknown>;
  writeFile(path: string, data: Uint8Array): Promise<unknown>;
  exec(args: string[]): Promise<number>;
  readFile(path: string): Promise<Uint8Array | string>;
  deleteFile(path: string): Promise<unknown>;
  on(event: 'progress', callback: (event: { progress: number }) => void): void;
  terminate?(): void;
}

export type FfmpegLoader = () => Promise<{
  ffmpeg: FfmpegLike;
  fetchFile: (input: Blob | string) => Promise<Uint8Array>;
}>;

const EBML_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];
const H264_BRANDS = new Set(['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'MMP4']);

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length && offset + i < bytes.length; i++) {
    out += String.fromCharCode(bytes[offset + i]);
  }
  return out;
}

function indexOfAscii(bytes: Uint8Array, needle: string): number {
  const n = needle.length;
  outer: for (let i = 0; i + n <= bytes.length; i++) {
    for (let j = 0; j < n; j++) {
      if (bytes[i + j] !== needle.charCodeAt(j)) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * Export-validity check for an MP4 file, without a media probe.
 *
 * A valid ISO-BMFF file starts with a `ftyp` box whose major brand names the
 * container family, and carries `moov` (metadata/tracks) and `mdat` (media
 * data) boxes somewhere in the file. A WebM capture starts with the EBML
 * magic instead, and a truncated transcode loses `moov` — both are rejected
 * here so a broken export can never be downloaded as if it were a master.
 */
export function validateMp4Bytes(bytes: Uint8Array): Mp4Validation {
  const size = bytes.length;
  if (size >= 4 && EBML_MAGIC.every((b, i) => bytes[i] === b)) {
    return {
      valid: false,
      reason: 'bytes are a WebM/EBML stream, not an MP4',
      brand: null,
      hasFtyp: false,
      hasMoov: false,
      hasMdat: false,
      size,
    };
  }
  if (size < 16) {
    return {
      valid: false,
      reason: 'file is too small to be an MP4',
      brand: null,
      hasFtyp: false,
      hasMoov: false,
      hasMdat: false,
      size,
    };
  }
  const hasFtyp = asciiAt(bytes, 4, 4) === 'ftyp';
  const brand = hasFtyp ? asciiAt(bytes, 8, 4) : null;
  const hasMoov = indexOfAscii(bytes, 'moov') >= 0;
  const hasMdat = indexOfAscii(bytes, 'mdat') >= 0;
  if (!hasFtyp) {
    return { valid: false, reason: 'missing ftyp box', brand, hasFtyp, hasMoov, hasMdat, size };
  }
  if (brand && !H264_BRANDS.has(brand)) {
    return {
      valid: false,
      reason: `unexpected MP4 brand "${brand}"`,
      brand,
      hasFtyp,
      hasMoov,
      hasMdat,
      size,
    };
  }
  if (!hasMoov) {
    return { valid: false, reason: 'missing moov box (truncated?)', brand, hasFtyp, hasMoov, hasMdat, size };
  }
  if (!hasMdat) {
    return { valid: false, reason: 'missing mdat box (no media data)', brand, hasFtyp, hasMoov, hasMdat, size };
  }
  return { valid: true, reason: 'ok', brand, hasFtyp, hasMoov, hasMdat, size };
}

export async function validateMp4Blob(blob: Blob): Promise<Mp4Validation> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return validateMp4Bytes(bytes);
}

/** FFmpeg argument list for the WebM capture → H.264/AAC MP4 transcode. */
/**
 * FFmpeg arguments for concatenating already-encoded sections.
 *
 * Stream copy is lossless and fast when every part is MP4 with matching
 * parameters. The re-encode fallback gives mixed or incompatible sections one
 * consistent H.264/AAC master.
 */
export function buildConcatArgs(
  list = 'concat-list.txt',
  output = 'output.mp4',
  options: { copy?: boolean } = {},
): string[] {
  // -y replaces any partial output left by a failed stream-copy attempt.
  const input = ['-y', '-f', 'concat', '-safe', '0', '-i', list];
  if (options.copy) {
    return [...input, '-c', 'copy', '-movflags', '+faststart', output];
  }
  return [
    ...input,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', '18',
    '-preset', 'veryfast',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    output,
  ];
}

/** Browser stitching is bounded by wasm memory, not by the timeline. */
export const MAX_STITCH_BYTES = 1_500_000_000;

export interface Mp4ConcatOptions {
  onProgress?: (progress: number) => void;
}

export function buildMp4Args(
  input = 'input.webm',
  output = 'output.mp4',
  options: Mp4TranscodeOptions = {},
): string[] {
  const crf = Number.isFinite(options.crf) ? Math.round(options.crf!) : 20;
  const trim = Number.isFinite(options.trimSeconds)
    ? Math.max(0, options.trimSeconds!)
    : null;
  return [
    '-i', input,
    // x264 needs even dimensions for yuv420p; odd rasters are nudged down
    // by at most one pixel instead of failing the whole encode.
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', String(Math.max(0, Math.min(51, crf))),
    '-preset', options.preset || 'veryfast',
    '-c:a', 'aac',
    '-b:a', options.audioBitrate || '192k',
    '-movflags', '+faststart',
    ...(trim ? ['-t', trim.toFixed(3)] : []),
    '-shortest',
    output,
  ];
}

@Injectable({ providedIn: 'root' })
export class FfmpegVideoExportService {
  private logger = inject(LoggingService, { optional: true });

  private ffmpegPromise: Promise<{ ffmpeg: FfmpegLike; fetchFile: (input: Blob | string) => Promise<Uint8Array> }> | null = null;

  /** Test seam: replace the dynamic import with a fake FFmpeg instance. */
  ffmpegLoader: FfmpegLoader | null = null;

  async loadFfmpeg(
    onProgress?: (progress: number) => void,
  ): Promise<{ ffmpeg: FfmpegLike; fetchFile: (input: Blob | string) => Promise<Uint8Array> }> {
    if (this.ffmpegLoader) return this.ffmpegLoader();
    if (!this.ffmpegPromise) {
      this.ffmpegPromise = (async () => {
        const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
          import('@ffmpeg/ffmpeg'),
          import('@ffmpeg/util'),
        ]);
        const ffmpeg = new FFmpeg() as unknown as FfmpegLike;
        const coreURL = await toBlobURL(
          `${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`,
          'text/javascript',
        );
        const wasmURL = await toBlobURL(
          `${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`,
          'application/wasm',
        );
        await ffmpeg.load({ coreURL, wasmURL });
        return { ffmpeg, fetchFile: fetchFile as (input: Blob | string) => Promise<Uint8Array> };
      })().catch((error) => {
        // Never cache a failed load: the next export retries the download.
        this.ffmpegPromise = null;
        throw error;
      });
    }
    const loaded = await this.ffmpegPromise;
    if (onProgress) {
      loaded.ffmpeg.on('progress', ({ progress }) => {
        onProgress(Math.max(0, Math.min(1, progress)));
      });
    }
    return loaded;
  }

  /**
   * Transcode one captured (WebM) blob to a validated MP4/H.264 blob.
   * Throws when FFmpeg is unavailable or the output fails validation, so
   * the caller can fall back to the original capture instead of shipping
   * a file that will not play.
   */
  async transcodeToMp4(input: Blob, options: Mp4TranscodeOptions = {}): Promise<Blob> {
    if (!input || input.size === 0) {
      throw new Error('Nothing to transcode: the capture produced no bytes.');
    }
    const { ffmpeg, fetchFile } = await this.loadFfmpeg(options.onProgress);
    const inputBytes = await fetchFile(input);
    const outputBytes = await this.transcodeWithFfmpeg(ffmpeg, inputBytes, options);
    const validation = validateMp4Bytes(outputBytes);
    if (!validation.valid) {
      throw new Error(`FFmpeg produced an invalid MP4: ${validation.reason}.`);
    }
    this.logger?.info(
      `FFmpeg MP4 export ready: ${validation.size} bytes, brand=${validation.brand ?? '?'}`,
    );
    return new Blob([outputBytes as BlobPart], { type: 'video/mp4' });
  }

  /**
   * Join downloaded sections into one MP4.
   *
   * MP4 sections with matching parameters take the stream-copy path, so the
   * join adds no generation loss. Anything else is re-encoded to a consistent
   * H.264/AAC master. The bytes are held in wasm memory, so a feature-size
   * join is rejected with a clear limit instead of crashing the tab.
   */
  async stitchToMp4(inputs: Blob[], options: Mp4ConcatOptions = {}): Promise<Blob> {
    if (!inputs || inputs.length < 2) {
      throw new Error('Choose at least two exported sections to stitch.');
    }
    const totalBytes = inputs.reduce((sum, input) => sum + (input?.size || 0), 0);
    if (totalBytes <= 0) {
      throw new Error('The selected sections are empty.');
    }
    if (totalBytes > MAX_STITCH_BYTES) {
      throw new Error(
        'The selected sections are too large for browser stitching. Use a desktop editor for this master.'
      );
    }

    const { ffmpeg, fetchFile } = await this.loadFfmpeg(options.onProgress);
    const listName = 'concat-list.txt';
    const outputName = 'output.mp4';
    const parts = inputs.map((input, index) => {
      const type = (input.type || '').toLowerCase();
      const extension = type.includes('webm') ? 'webm' : type.includes('mp4') ? 'mp4' : 'bin';
      return `part-${String(index).padStart(3, '0')}.${extension}`;
    });
    const canCopy = inputs.every((input) => (input.type || '').toLowerCase().includes('mp4'));

    try {
      for (let index = 0; index < inputs.length; index += 1) {
        await ffmpeg.writeFile(parts[index], await fetchFile(inputs[index]));
      }
      const list = parts.map((part) => `file '${part}'`).join('\n') + '\n';
      await ffmpeg.writeFile(listName, new TextEncoder().encode(list));

      let bytes: Uint8Array | null = null;
      if (canCopy) {
        try {
          const exitCode = await ffmpeg.exec(
            buildConcatArgs(listName, outputName, { copy: true }),
          );
          if (exitCode === 0) {
            bytes = await this.readOutput(ffmpeg, outputName);
            // A structurally invalid copy is as unusable as a failed one;
            // fall through to the re-encode instead of shipping it.
            if (!validateMp4Bytes(bytes).valid) bytes = null;
          }
        } catch {
          // A copy join can fail when the sections disagree on codec
          // parameters; the re-encode below is the recovery path.
        }
      }

      if (!bytes) {
        // The copy attempt may have left a file behind; start the re-encode
        // from a clean path even though -y also protects it.
        try { await ffmpeg.deleteFile(outputName); } catch { /* no copy output */ }
        const exitCode = await ffmpeg.exec(
          buildConcatArgs(listName, outputName, { copy: false }),
        );
        if (exitCode !== 0) {
          throw new Error(`FFmpeg could not stitch the sections (code ${exitCode}).`);
        }
        bytes = await this.readOutput(ffmpeg, outputName);
      }

      const validation = validateMp4Bytes(bytes);
      if (!validation.valid) {
        throw new Error(`FFmpeg produced an invalid stitched MP4: ${validation.reason}.`);
      }
      this.logger?.info(
        `Film stitch ready: ${inputs.length} sections, ${validation.size} bytes.`,
      );
      return new Blob([bytes as BlobPart], { type: 'video/mp4' });
    } finally {
      for (const part of parts) {
        try { await ffmpeg.deleteFile(part); } catch { /* already gone */ }
      }
      try { await ffmpeg.deleteFile(listName); } catch { /* already gone */ }
      try { await ffmpeg.deleteFile(outputName); } catch { /* already gone */ }
    }
  }

  private async readOutput(ffmpeg: FfmpegLike, path: string): Promise<Uint8Array> {
    const data = await ffmpeg.readFile(path);
    if (typeof data === 'string' || !data || data.length === 0) {
      throw new Error('FFmpeg produced no stitched output.');
    }
    return data;
  }

  /** Single transcode pass against an already-loaded FFmpeg instance. */
  async transcodeWithFfmpeg(
    ffmpeg: FfmpegLike,
    inputBytes: Uint8Array,
    options: Mp4TranscodeOptions = {},
  ): Promise<Uint8Array> {
    const inputName = 'input.webm';
    const outputName = 'output.mp4';
    try {
      await ffmpeg.writeFile(inputName, inputBytes);
      const exitCode = await ffmpeg.exec(buildMp4Args(inputName, outputName, options));
      if (exitCode !== 0) {
        throw new Error(`FFmpeg exited with code ${exitCode}.`);
      }
      const data = await ffmpeg.readFile(outputName);
      if (typeof data === 'string' || !data || data.length === 0) {
        throw new Error('FFmpeg produced no output file.');
      }
      return data;
    } finally {
      // The in-memory filesystem is tiny; never leave a take behind.
      try { await ffmpeg.deleteFile(outputName); } catch { /* already gone */ }
      try { await ffmpeg.deleteFile(inputName); } catch { /* already gone */ }
    }
  }
}
