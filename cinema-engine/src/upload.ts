/**
 * Video Upload Module
 * Real upload transport (multipart FormData -> HTTP) with progress tracking
 *
 * Server contract: the configured endpoint receives a `multipart/form-data`
 * POST containing the file (default field name `file`) plus any extra fields,
 * and answers with JSON shaped like:
 *
 *   { id, url, thumbnailUrl?, duration?, width?, height?, size?, filename?, type? }
 *
 * or the same object nested under `data` / `video`.
 *
 * When set, `generateThumbnails` and `extractMetadata` are also sent as form
 * fields so the server can act on them, alongside every entry of `fields`.
 * In a browser, `extractMetadata` additionally reads real duration and frame
 * dimensions locally and sends them as `duration` / `width` / `height`, and
 * `generateThumbnails` captures a local frame into `UploadResult.thumbnail`.
 */

import {
  VideoAnalyzer,
  VideoMetadata,
  ThumbnailOptions,
  ThumbnailResult,
  createVideoAnalyzer,
} from './videoAnalysis';

/** Default endpoint used when `UploadOptions.endpoint` is not provided. */
export const DEFAULT_UPLOAD_ENDPOINT = '/api/videos/upload';

/** File types accepted when `UploadOptions.allowedTypes` is not provided. */
export const DEFAULT_ACCEPTED_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
];

export interface UploadProgress {
  /** Progress percentage (0-100) */
  percentage: number;
  /** Bytes uploaded so far */
  uploadedBytes: number;
  /** Total bytes */
  totalBytes: number;
  /** Human-readable speed (e.g., "1.2 MB/s") */
  speed?: string;
  /** Estimated time remaining in seconds */
  eta?: number;
  /** Whether upload is complete */
  isComplete: boolean;
  /** Whether upload has failed */
  isError: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Uploaded video file metadata
 */
export interface UploadedVideo {
  /** Unique identifier for the uploaded video */
  id: string;
  /** Original filename */
  filename: string;
  /** URL to access the uploaded video */
  url: string;
  /** Thumbnail URL (generated from video) */
  thumbnailUrl?: string;
  /** File size in bytes */
  size: number;
  /** Video duration in seconds (if available) */
  duration?: number;
  /** Video width in pixels */
  width?: number;
  /** Video height in pixels */
  height?: number;
  /** MIME type */
  type?: string;
  /** Upload timestamp */
  uploadedAt: number;
}

/**
 * Options for video upload
 */
export interface UploadOptions {
  /** Maximum file size in bytes (optional) */
  maxSize?: number;
  /** Allowed MIME types (optional) */
  allowedTypes?: string[];
  /** Whether to generate thumbnails */
  generateThumbnails?: boolean;
  /** Whether to extract metadata (locally in browsers, otherwise asks the server) */
  extractMetadata?: boolean;
  /** Capture options used when `generateThumbnails` is enabled in a browser */
  thumbnailOptions?: ThumbnailOptions;
  /** Server endpoint receiving the multipart POST. Default: /api/videos/upload */
  endpoint?: string;
  /** Form field name used for the file part. Default: "file" */
  fieldName?: string;
  /** Additional multipart form fields sent with the upload */
  fields?: Record<string, string>;
  /** Additional request headers (do not set Content-Type: the browser adds the boundary) */
  headers?: Record<string, string>;
  /**
   * Real upload progress callback.
   * When provided the upload uses XMLHttpRequest, because fetch cannot report
   * upload progress for multipart bodies. Without it the request uses fetch.
   */
  onProgress?: (progress: UploadProgress) => void;
  /** Cancellation signal forwarded to the request */
  signal?: AbortSignal;
  /** Fetch credentials mode. Default: "same-origin" */
  credentials?: RequestCredentials;
}

/**
 * Options for constructing a VideoUploader
 */
export interface UploaderConfig {
  /** Default server endpoint for uploads */
  endpoint?: string;
  /** Default maximum file size in bytes */
  maxSize?: number;
  /** Default allowed MIME types */
  allowedTypes?: string[];
}

/**
 * Result of a video upload operation
 */
export interface UploadResult {
  /** The uploaded video metadata (empty when `error` is set) */
  video: UploadedVideo;
  /** Locally captured thumbnail when `generateThumbnails` is enabled (browser only) */
  thumbnail?: ThumbnailResult;
  /** Why local thumbnail capture failed, when it was requested but did not succeed */
  thumbnailError?: string;
  /** Error message if upload failed */
  error?: string;
}

/**
 * Video Upload Capabilities
 * Provides a real multipart upload transport integrated with the enhancement pipeline
 */
export class VideoUploader {
  private readonly defaultEndpoint: string;
  private readonly maxDefaultSize: number;
  private readonly acceptedTypes: string[];
  private readonly analyzer: VideoAnalyzer;

  constructor(config: UploaderConfig = {}) {
    this.defaultEndpoint = config.endpoint || DEFAULT_UPLOAD_ENDPOINT;
    this.maxDefaultSize = config.maxSize ?? 500 * 1024 * 1024; // 500MB default
    this.acceptedTypes = config.allowedTypes || DEFAULT_ACCEPTED_TYPES;
    this.analyzer = createVideoAnalyzer();
  }

  /**
   * Read real duration and frame dimensions from the file without uploading it.
   * @param file Video file
   * @param timeoutMs Abort after this many milliseconds (default 15000)
   */
  extractMetadata(file: File, timeoutMs?: number): Promise<VideoMetadata> {
    return this.analyzer.getMetadata(file, timeoutMs);
  }

  /**
   * Capture a frame from the file as an encoded image, locally in the browser.
   * @param file Video file
   * @param options Capture position, size and encoding options
   */
  extractThumbnail(file: File, options?: ThumbnailOptions): Promise<ThumbnailResult> {
    return this.analyzer.captureThumbnail(file, options);
  }

  /**
   * Upload a video file to the configured server endpoint.
   * @param file Video file to upload
   * @param options Upload options
   * @returns Upload result with video metadata, or an error message
   */
  async upload(file: File, options: UploadOptions = {}): Promise<UploadResult> {
    const validationError = this.validate(file, options);
    if (validationError) {
      return { video: this.getEmptyVideo(), error: validationError };
    }

    const endpoint = options.endpoint || this.defaultEndpoint;
    const metadata =
      options.extractMetadata && this.analyzer.isSupported()
        ? await this.tryExtractMetadata(file)
        : undefined;
    const formData = this.buildFormData(file, options, metadata);

    try {
      const uploaded =
        options.onProgress && typeof XMLHttpRequest !== 'undefined'
          ? await this.sendWithXHR(endpoint, formData, file, options)
          : await this.sendWithFetch(endpoint, formData, file, options);

      const video = this.mergeMetadata(uploaded, metadata);

      let thumbnail: ThumbnailResult | undefined;
      let thumbnailError: string | undefined;
      if (options.generateThumbnails) {
        try {
          thumbnail = await this.analyzer.captureThumbnail(file, options.thumbnailOptions);
        } catch (error) {
          thumbnailError = error instanceof Error ? error.message : String(error);
        }
      }

      return { video, thumbnail, thumbnailError };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (options.onProgress) {
        options.onProgress({
          percentage: 0,
          uploadedBytes: 0,
          totalBytes: file.size,
          isComplete: false,
          isError: true,
          error: message,
        });
      }
      return { video: this.getEmptyVideo(), error: message };
    }
  }

  /**
   * Generate (or read) a thumbnail URL for an uploaded video
   * @param video The uploaded video metadata
   * @returns Thumbnail result with URL or error
   */
  generateThumbnail(video: UploadedVideo): { thumbnailUrl: string } | { error: string } {
    if (!video.id) {
      return { error: 'No video ID available for thumbnail generation' };
    }

    if (video.thumbnailUrl) {
      return { thumbnailUrl: video.thumbnailUrl };
    }

    // Fall back to the deterministic server path used by the upload pipeline
    return { thumbnailUrl: `${this.getApiBase(video.url)}/videos/${video.id}/thumbnail` };
  }

  // --- transport -----------------------------------------------------------

  /**
   * POST the multipart body with fetch. Progress is coarse because fetch does
   * not expose upload progress for FormData bodies.
   */
  private async sendWithFetch(
    endpoint: string,
    formData: FormData,
    file: File,
    options: UploadOptions
  ): Promise<UploadedVideo> {
    if (typeof fetch !== 'function') {
      throw new Error('fetch is not available in this environment');
    }

    // Fail fast: never start a request that is already cancelled.
    if (options.signal?.aborted) {
      throw new DOMException('Upload aborted', 'AbortError');
    }

    const startedAt = Date.now();
    options.onProgress?.(this.buildProgress(0, file.size, startedAt));

    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      headers: options.headers,
      credentials: options.credentials || 'same-origin',
      signal: options.signal,
    });

    const bodyText = await response.text();

    if (!response.ok) {
      throw new Error(this.describeHttpError(response.status, response.statusText, bodyText));
    }

    const video = this.toUploadedVideo(this.parseJson(bodyText), file);
    options.onProgress?.(this.buildProgress(file.size, file.size, startedAt));
    return video;
  }

  /**
   * POST the multipart body with XMLHttpRequest to obtain real upload progress.
   */
  private sendWithXHR(
    endpoint: string,
    formData: FormData,
    file: File,
    options: UploadOptions
  ): Promise<UploadedVideo> {
    return new Promise<UploadedVideo>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const startedAt = Date.now();

      if (options.signal?.aborted) {
        reject(new DOMException('Upload aborted', 'AbortError'));
        return;
      }

      xhr.open('POST', endpoint, true);
      xhr.responseType = 'text';

      xhr.withCredentials = options.credentials === 'include';

      for (const [name, value] of Object.entries(options.headers || {})) {
        xhr.setRequestHeader(name, value);
      }

      xhr.upload.onprogress = (event: ProgressEvent) => {
        if (!event.lengthComputable) return;
        options.onProgress?.(
          this.buildProgress(event.loaded, event.total || file.size, startedAt, event.lengthComputable)
        );
      };

      xhr.onload = () => {
        const bodyText = typeof xhr.response === 'string' ? xhr.response : xhr.responseText;
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(this.describeHttpError(xhr.status, xhr.statusText, bodyText)));
          return;
        }

        try {
          const video = this.toUploadedVideo(this.parseJson(bodyText), file);
          options.onProgress?.(this.buildProgress(file.size, file.size, startedAt));
          resolve(video);
        } catch (error) {
          reject(error);
        }
      };

      xhr.onerror = () => reject(new Error('Network error while uploading the video'));
      xhr.ontimeout = () => reject(new Error('The upload request timed out'));
      xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));

      options.signal?.addEventListener(
        'abort',
        () => {
          xhr.abort();
        },
        { once: true }
      );

      // Emit an initial 0% event so both transports report progress consistently.
      options.onProgress?.(this.buildProgress(0, file.size, startedAt));
      xhr.send(formData);
    });
  }

  // --- helpers -------------------------------------------------------------

  private buildFormData(file: File, options: UploadOptions, metadata?: VideoMetadata): FormData {
    const formData = new FormData();
    formData.append(options.fieldName || 'file', file, file.name);

    // Let the server honour the post-processing flags.
    if (typeof options.generateThumbnails === 'boolean') {
      formData.append('generateThumbnails', String(options.generateThumbnails));
    }

    if (metadata) {
      // Real values read from the file outperform a server-side probe.
      if (metadata.duration > 0) formData.append('duration', String(metadata.duration));
      if (metadata.width > 0) formData.append('width', String(metadata.width));
      if (metadata.height > 0) formData.append('height', String(metadata.height));
    } else if (typeof options.extractMetadata === 'boolean') {
      formData.append('extractMetadata', String(options.extractMetadata));
    }

    for (const [name, value] of Object.entries(options.fields || {})) {
      formData.append(name, value);
    }

    return formData;
  }

  /** Local extraction is a convenience: never let it fail the upload. */
  private async tryExtractMetadata(file: File): Promise<VideoMetadata | undefined> {
    try {
      return await this.analyzer.getMetadata(file);
    } catch {
      return undefined;
    }
  }

  /** Prefer server-reported values, filling gaps with local measurements. */
  private mergeMetadata(video: UploadedVideo, metadata?: VideoMetadata): UploadedVideo {
    if (!metadata) return video;

    return {
      ...video,
      duration: video.duration ?? (metadata.duration > 0 ? metadata.duration : undefined),
      width: video.width ?? (metadata.width > 0 ? metadata.width : undefined),
      height: video.height ?? (metadata.height > 0 ? metadata.height : undefined),
      size: video.size || metadata.size,
      filename: video.filename || metadata.filename,
      type: video.type || metadata.type,
    };
  }

  private validate(file: File, options: UploadOptions): string | null {
    if (!file) {
      return 'No file provided';
    }

    const maxSize = options.maxSize ?? this.maxDefaultSize;
    if (file.size > maxSize) {
      return `File too large: ${this.formatBytes(file.size)} (max: ${this.formatBytes(maxSize)})`;
    }

    const allowedTypes = options.allowedTypes ?? this.acceptedTypes;
    if (
      allowedTypes.length > 0 &&
      file.type &&
      !allowedTypes.some((allowed) => this.matchesType(file.type, allowed))
    ) {
      return `Unsupported file type: ${file.type}`;
    }

    return null;
  }

  /** Match a concrete MIME type against a full type or a wildcard family. */
  private matchesType(mimeType: string, allowed: string): boolean {
    if (allowed === mimeType || allowed === '*/*') return true;
    if (allowed.endsWith('/*')) {
      return mimeType.startsWith(`${allowed.slice(0, -1)}`);
    }
    return false;
  }

  private buildProgress(
    uploadedBytes: number,
    totalBytes: number,
    startedAt: number,
    lengthComputable = true
  ): UploadProgress {
    const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0);
    const safeTotal = totalBytes > 0 ? totalBytes : 0;
    const percentage =
      lengthComputable && safeTotal > 0
        ? Math.min(100, Math.round((uploadedBytes / safeTotal) * 100))
        : 0;
    const bytesPerSecond = elapsedSeconds > 0 ? uploadedBytes / elapsedSeconds : 0;
    const remainingBytes = Math.max(safeTotal - uploadedBytes, 0);

    const progress: UploadProgress = {
      percentage,
      uploadedBytes,
      totalBytes: safeTotal,
      isComplete: lengthComputable && safeTotal > 0 && uploadedBytes >= safeTotal,
      isError: false,
    };

    if (bytesPerSecond > 0) {
      progress.speed = `${this.formatBytes(bytesPerSecond)}/s`;
      if (remainingBytes > 0) {
        progress.eta = Math.ceil(remainingBytes / bytesPerSecond);
      }
    }

    return progress;
  }

  private describeHttpError(status: number, statusText: string, bodyText: string): string {
    const detail = this.extractErrorMessage(bodyText);
    const statusLabel = statusText ? `${status} ${statusText}` : `${status}`;
    return `Upload failed with HTTP ${statusLabel}${detail ? `: ${detail}` : ''}`;
  }

  private extractErrorMessage(bodyText: string): string | undefined {
    const payload = this.parseJson(bodyText);
    if (!payload || typeof payload !== 'object') return undefined;

    const record = payload as Record<string, unknown>;
    const candidate = record.error ?? record.message ?? record.detail;
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (candidate && typeof candidate === 'object') {
      const nested = (candidate as Record<string, unknown>).message;
      if (typeof nested === 'string' && nested.trim()) return nested.trim();
    }
    return undefined;
  }

  private parseJson(bodyText: string): unknown {
    if (!bodyText) return null;
    try {
      return JSON.parse(bodyText);
    } catch {
      return null;
    }
  }

  /** Map a server response onto UploadedVideo. */
  private toUploadedVideo(payload: unknown, file: File): UploadedVideo {
    const record = this.unwrapPayload(payload);
    const rawUrl = record.url ?? record.fileUrl ?? record.src ?? record.location;

    if (typeof rawUrl !== 'string' || !rawUrl) {
      throw new Error('Upload response did not include a video URL');
    }

    return {
      id: this.toStringOr(record.id ?? record.videoId, file.name),
      filename: this.toStringOr(record.filename ?? record.name, file.name),
      url: rawUrl,
      thumbnailUrl: this.toOptionalString(record.thumbnailUrl ?? record.thumbnail),
      size: this.toOptionalNumber(record.size) ?? file.size,
      duration: this.toOptionalNumber(record.duration),
      width: this.toOptionalNumber(record.width),
      height: this.toOptionalNumber(record.height),
      type: this.toOptionalString(record.type) ?? file.type,
      uploadedAt: this.toOptionalNumber(record.uploadedAt) ?? Date.now(),
    };
  }

  private unwrapPayload(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Upload response was not a JSON object');
    }

    const record = payload as Record<string, unknown>;
    const nested = record.data ?? record.video ?? record.result;
    if (nested && typeof nested === 'object') {
      return nested as Record<string, unknown>;
    }
    return record;
  }

  /** Origin for absolute video URLs; empty for relative ones (same-origin). */
  private getApiBase(videoUrl: string): string {
    if (!/^https?:\/\//i.test(videoUrl)) return '';
    try {
      return new URL(videoUrl).origin;
    } catch {
      return '';
    }
  }

  private toStringOr(value: unknown, fallback: string): string {
    if (typeof value === 'string' && value) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return fallback;
  }

  private toOptionalString(value: unknown): string | undefined {
    if (typeof value === 'string' && value) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return undefined;
  }

  private toOptionalNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  }

  /**
   * Format bytes into human-readable string
   * @param bytes Number of bytes
   * @returns Formatted string (e.g., "1.5 MB")
   */
  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  /**
   * Get empty uploaded video structure
   * @returns Empty uploaded video
   */
  private getEmptyVideo(): UploadedVideo {
    return {
      id: '',
      filename: '',
      url: '',
      size: 0,
      uploadedAt: Date.now(),
      type: '',
    };
  }
}

/**
 * Convenience function to create a VideoUploader instance
 * @param config Optional transport configuration
 * @returns New VideoUploader instance
 */
export function createVideoUploader(config?: UploaderConfig): VideoUploader {
  return new VideoUploader(config);
}
