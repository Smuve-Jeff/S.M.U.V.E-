/**
 * Video Analysis Module
 * Extracts real metadata and thumbnails from a video File in the browser,
 * using HTMLVideoElement for decoding and Canvas for frame capture.
 *
 * Requires a DOM; `isSupported()` reports whether the environment can run it.
 */

export interface VideoMetadata {
  /** Duration in seconds (0 when the browser reports an unknown length) */
  duration: number;
  /** Coded frame width in pixels */
  width: number;
  /** Coded frame height in pixels */
  height: number;
  /** width / height, rounded to 4 decimals (0 when height is unknown) */
  aspectRatio: number;
  /** MIME type reported by the File */
  type: string;
  /** File size in bytes */
  size: number;
  /** Original filename */
  filename: string;
}

export interface ThumbnailOptions {
  /**
   * Where to capture the frame.
   * When omitted, 10% into the video is used.
   * Interpreted as seconds unless `timeIsFraction` is true.
   */
  at?: number;
  /** Treat `at` as a fraction of the duration (0-1) */
  timeIsFraction?: boolean;
  /** Maximum output width in pixels. Default: 640 */
  maxWidth?: number;
  /** Maximum output height in pixels. Default: 360 */
  maxHeight?: number;
  /** Encoder quality for lossy formats (0-1). Default: 0.82 */
  quality?: number;
  /** Output image type. Default: "image/jpeg" */
  format?: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Abort the extraction after this many milliseconds. Default: 15000 */
  timeoutMs?: number;
}

export interface ThumbnailResult {
  /** Encoded image data */
  blob: Blob;
  /**
   * Object URL for the blob. Revoke it with `URL.revokeObjectURL` once the
   * consumer no longer needs the thumbnail.
   */
  url: string;
  /** Output width in pixels */
  width: number;
  /** Output height in pixels */
  height: number;
  /** Timestamp (seconds) the frame was captured from */
  time: number;
  /** Encoded image MIME type */
  type: string;
}

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_WIDTH = 640;
const DEFAULT_MAX_HEIGHT = 360;
const DEFAULT_QUALITY = 0.82;

/**
 * Reads metadata and captures thumbnails from video files.
 */
export class VideoAnalyzer {
  /**
   * Whether this environment exposes the DOM APIs extraction needs.
   */
  isSupported(): boolean {
    return (
      typeof document !== 'undefined' &&
      typeof document.createElement === 'function' &&
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function'
    );
  }

  /**
   * Read duration, dimensions and file details without uploading anything.
   * @param file Video file
   * @param timeoutMs Abort after this many milliseconds (default 15000)
   * @returns Real video metadata
   */
  async getMetadata(file: File, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<VideoMetadata> {
    const opened = await this.openVideo(file, timeoutMs);

    try {
      const width = opened.video.videoWidth;
      const height = opened.video.videoHeight;
      const duration = Number.isFinite(opened.video.duration) ? opened.video.duration : 0;

      return {
        duration,
        width,
        height,
        aspectRatio: height > 0 ? Math.round((width / height) * 10000) / 10000 : 0,
        type: file.type,
        size: file.size,
        filename: file.name,
      };
    } finally {
      this.dispose(opened.video, opened.objectUrl);
    }
  }

  /**
   * Capture a frame from the video as an encoded image.
   * @param file Video file
   * @param options Capture position, size and encoding options
   * @returns Thumbnail blob plus its object URL
   */
  async captureThumbnail(file: File, options: ThumbnailOptions = {}): Promise<ThumbnailResult> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const format = options.format ?? 'image/jpeg';
    const quality = this.clamp(options.quality ?? DEFAULT_QUALITY, 0, 1);
    const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;
    const maxHeight = options.maxHeight ?? DEFAULT_MAX_HEIGHT;

    const opened = await this.openVideo(file, timeoutMs);

    try {
      const { video } = opened;
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const time = this.resolveTime(options, duration);

      await this.ensureFrame(video, time, timeoutMs);

      const frameWidth = video.videoWidth;
      const frameHeight = video.videoHeight;
      if (!frameWidth || !frameHeight) {
        throw new Error('The video did not report frame dimensions');
      }

      const scale = Math.min(1, maxWidth / frameWidth, maxHeight / frameHeight);
      const width = Math.max(1, Math.round(frameWidth * scale));
      const height = Math.max(1, Math.round(frameHeight * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Could not create a 2D canvas context');
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(video, 0, 0, width, height);

      const blob = await this.toBlob(canvas, format, quality);

      return {
        blob,
        url: URL.createObjectURL(blob),
        width,
        height,
        time,
        type: format,
      };
    } finally {
      this.dispose(opened.video, opened.objectUrl);
    }
  }

  // --- internals -----------------------------------------------------------

  private async openVideo(
    file: File,
    timeoutMs: number
  ): Promise<{ video: HTMLVideoElement; objectUrl: string }> {
    if (!this.isSupported()) {
      throw new Error('Video analysis requires a browser DOM');
    }

    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    try {
      const metadataLoaded = this.waitFor(
        video,
        ['loadedmetadata'],
        timeoutMs,
        'Timed out reading video metadata'
      );
      video.src = objectUrl;
      await metadataLoaded;
      return { video, objectUrl };
    } catch (error) {
      this.dispose(video, objectUrl);
      throw error;
    }
  }

  private async ensureFrame(video: HTMLVideoElement, time: number, timeoutMs: number): Promise<void> {
    if (time > 0) {
      const seeked = this.waitFor(video, ['seeked'], timeoutMs, 'Timed out seeking to the capture frame');
      video.currentTime = time;
      await seeked;
      return;
    }

    if (video.readyState < 2) {
      await this.waitFor(video, ['loadeddata'], timeoutMs, 'Timed out decoding the first frame');
    }
  }

  private waitFor(
    video: HTMLVideoElement,
    events: string[],
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
        cleanup();
        reject(new Error(timeoutMessage));
      }, timeoutMs);

      const onEvent = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error(this.describeMediaError(video)));
      };

      const cleanup = () => {
        clearTimeout(timer);
        for (const event of events) {
          video.removeEventListener(event, onEvent);
        }
        video.removeEventListener('error', onError);
      };

      for (const event of events) {
        video.addEventListener(event, onEvent, { once: true });
      }
      video.addEventListener('error', onError, { once: true });
    });
  }

  private resolveTime(options: ThumbnailOptions, duration: number): number {
    const latest = Math.max(duration - 0.05, 0);

    if (options.at === undefined) {
      return Math.min(Math.max(duration * 0.1, 0), latest);
    }

    const seconds = options.timeIsFraction ? options.at * duration : options.at;
    return this.clamp(seconds, 0, latest);
  }

  private toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error(`The browser could not encode a ${type} thumbnail`));
          }
        },
        type,
        quality
      );
    });
  }

  private describeMediaError(video: HTMLVideoElement): string {
    switch (video.error?.code) {
      case 1:
        return 'Video loading was aborted';
      case 2:
        return 'A network error interrupted video loading';
      case 3:
        return 'The video could not be decoded';
      case 4:
        return 'This video format is not supported by the browser';
      default:
        return 'The video could not be loaded';
    }
  }

  private dispose(video: HTMLVideoElement, objectUrl: string): void {
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(objectUrl);
    }
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}

/**
 * Convenience factory for a VideoAnalyzer.
 */
export function createVideoAnalyzer(): VideoAnalyzer {
  return new VideoAnalyzer();
}
