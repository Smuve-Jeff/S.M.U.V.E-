/**
 * Cinema Engine — media analysis facade.
 *
 * Historically this package also carried nine descriptor modules (filters,
 * special effects, transitions, voice-over, crop, text editor, music-video,
 * live-streaming and movie-directing "features") that returned descriptor
 * objects instead of touching pixels, plus WGSL shader stubs nothing
 * executed. Those were removed: the app renders all of that itself on the
 * canvas. What remains is the part that reads a real file — metadata,
 * thumbnails, sprite sheets and upload — which `CinemaEngineService` uses
 * for ingest.
 */

import {
  VideoUploader,
  createVideoUploader,
  UploadOptions,
  UploadResult,
  UploadedVideo,
  UploaderConfig,
} from './upload';
import {
  VideoMetadata,
  ThumbnailOptions,
  ThumbnailResult,
  SpriteSheetOptions,
  SpriteSheetResult,
} from './videoAnalysis';
import { assessSource, SourceAssessment } from './sourceQuality';

export class CinemaEngine {
  private videoUploader: VideoUploader;

  constructor(uploadConfig?: UploaderConfig) {
    this.videoUploader = createVideoUploader(uploadConfig);
  }

  /**
   * Upload a video file to the server with multipart FormData.
   * @param file Video file to upload
   * @param options Upload options (endpoint, fields, headers, progress, abort signal)
   * @returns Promise resolving to the upload result with video metadata
   */
  async uploadVideo(file: File, options?: UploadOptions): Promise<UploadResult> {
    return this.videoUploader.upload(file, options);
  }

  /**
   * Generate a thumbnail from an uploaded video
   * @param video The uploaded video metadata
   * @returns Thumbnail result with URL or error
   */
  generateThumbnail(video: UploadedVideo): { thumbnailUrl: string } | { error: string } {
    return this.videoUploader.generateThumbnail(video);
  }

  /**
   * Read real duration and frame dimensions from a local video file.
   * @param file Video file
   * @param timeoutMs Abort after this many milliseconds (default 15000)
   */
  extractVideoMetadata(file: File, timeoutMs?: number): Promise<VideoMetadata> {
    return this.videoUploader.extractMetadata(file, timeoutMs);
  }

  /**
   * Measure a file and turn those measurements into delivery advice.
   *
   * The assessment is deliberately derived from real metadata only. It flags
   * long-form runtimes that a single 120s browser pass cannot cover and sources
   * whose 4K master would be an upscale, rather than guessing a codec or rate
   * the browser does not expose.
   */
  async assessVideo(
    file: File,
    timeoutMs?: number
  ): Promise<{ metadata: VideoMetadata; assessment: SourceAssessment }> {
    const metadata = await this.extractVideoMetadata(file, timeoutMs);
    return { metadata, assessment: assessSource(metadata) };
  }

  /**
   * Capture a real frame from a local video file as an encoded image.
   * @param file Video file
   * @param options Capture position, size and encoding options
   */
  captureThumbnail(file: File, options?: ThumbnailOptions): Promise<ThumbnailResult> {
    return this.videoUploader.extractThumbnail(file, options);
  }

  /**
   * Build a sprite sheet of evenly spaced frames for timeline hover previews.
   * @param file Video file
   * @param options Frame count, grid layout and encoding options
   */
  createSpriteSheet(file: File, options?: SpriteSheetOptions): Promise<SpriteSheetResult> {
    return this.videoUploader.createSpriteSheet(file, options);
  }
}
