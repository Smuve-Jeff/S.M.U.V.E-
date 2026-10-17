/**
 * Cinema Engine public entry point.
 * Re-exports every feature module plus the upload and analysis helpers.
 */

export { CinemaEngine, default } from './cinemaEngine';
export type { EnhancementMetrics } from './cinemaEngine';

export { SpecialEffects } from './specialEffects';
export type { EffectParams } from './specialEffects';

export { Transitions } from './transitions';
export type { TransitionParams } from './transitions';

export { VoiceOver } from './voiceOver';
export type { VoiceOverParams } from './voiceOver';

export { Filters } from './filters';
export type { FilterParams } from './filters';

export { Crop } from './crop';
export type { CropParams } from './crop';

export { TextEditor } from './textEditor';
export type { TextStyle } from './textEditor';

export { MusicVideoFeatures } from './musicVideoFeatures';
export type { MusicVideoParams } from './musicVideoFeatures';

export { LiveStreamingFeatures } from './liveStreamingFeatures';
export type { LiveStreamingParams } from './liveStreamingFeatures';

export { MovieDirectingFeatures } from './movieDirectingFeatures';
export type { MovieDirectingParams } from './movieDirectingFeatures';

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
