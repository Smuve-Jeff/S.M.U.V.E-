/**
 * Cinema Engine public entry point.
 *
 * Media analysis only: metadata, thumbnails, sprite sheets and upload.
 * Rendering (filters, effects, transitions, titles, voice-over) lives in
 * the app's canvas renderer — see the removal note in `cinemaEngine.ts`.
 */

export { CinemaEngine } from './cinemaEngine';

export {
  VideoUploader,
  createVideoUploader,
  DEFAULT_UPLOAD_ENDPOINT,
  DEFAULT_ACCEPTED_TYPES,
} from './upload';
export type {
  UploadOptions,
  UploadResult,
  UploadProgress,
  UploadedVideo,
  UploaderConfig,
} from './upload';

export {
  VideoAnalyzer,
  createVideoAnalyzer,
  findSpriteFrame,
  spriteBackgroundStyle,
  toSpriteSheetMeta,
} from './videoAnalysis';
export type {
  VideoMetadata,
  ThumbnailOptions,
  ThumbnailResult,
  SpriteSheetOptions,
  SpriteSheetResult,
  SpriteSheetMeta,
  SpriteFrame,
  SpriteBackgroundStyle,
} from './videoAnalysis';
