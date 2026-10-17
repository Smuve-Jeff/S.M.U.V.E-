/**
 * Cinema Engine Module
 * Special effects capabilities, transitions, voice over, filters, crops, text editor
 * and anything else that enhance music video, live streaming, movie directing quality
 */

/**
 * Performance metrics for video enhancement
 */
export interface EnhancementMetrics {
  /** Time in milliseconds spent on enhancement */
  durationMs: number;
  /** Whether AI was used */
  usedAI: boolean;
  /** AI model used (if applicable) */
  aiModel?: string;
  /** Integration backend used (if applicable) */
  integration?: 'webgpu' | 'onnx' | 'mediapipe' | 'none';
}

import { SpecialEffects } from './specialEffects';
import { Transitions } from './transitions';
import { VoiceOver } from './voiceOver';
import { Filters } from './filters';
import { Crop } from './crop';
import { TextEditor } from './textEditor';
import { MusicVideoFeatures } from './musicVideoFeatures';
import { LiveStreamingFeatures } from './liveStreamingFeatures';
import { MovieDirectingFeatures } from './movieDirectingFeatures';
import { VideoUploader, UploadOptions, UploadResult, UploadProgress, UploadedVideo } from './upload';
import { createVideoUploader } from './upload';

/**
 * Main Cinema Engine class
 */
export class CinemaEngine {
  private specialEffects: SpecialEffects;
  private transitions: Transitions;
  private voiceOver: VoiceOver;
  private filters: Filters;
  private crop: Crop;
  private textEditor: TextEditor;
  private musicVideoFeatures: MusicVideoFeatures;
  private liveStreamingFeatures: LiveStreamingFeatures;
  private movieDirectingFeatures: MovieDirectingFeatures;
  private videoUploader: VideoUploader;

  constructor() {
    this.specialEffects = new SpecialEffects();
    this.transitions = new Transitions();
    this.voiceOver = new VoiceOver();
    this.filters = new Filters();
    this.crop = new Crop();
    this.textEditor = new TextEditor();
    this.musicVideoFeatures = new MusicVideoFeatures();
    this.liveStreamingFeatures = new LiveStreamingFeatures();
    this.movieDirectingFeatures = new MovieDirectingFeatures();
    this.videoUploader = createVideoUploader();
  }

  /**
   * Apply special effect to video frame
   * @param effectName Name of the effect
   * @param params Effect parameters
   * @returns Processed frame data
   */
  applyEffect(effectName: string, params: any): any {
    return this.specialEffects.apply(effectName, params);
  }

  /**
   * Apply transition between two video clips
   * @param transitionName Name of the transition
   * @param fromClip Source clip data
   * @param toClip Target clip data
   * @returns Transition result
   */
  applyTransition(transitionName: string, fromClip: any, toClip: any): any {
    return this.transitions.apply(transitionName, fromClip, toClip);
  }

  /**
   * Add voice over to video
   * @param text Voice over text
   * @param options Voice over options
   * @returns Voice over result
   */
  addVoiceOver(text: string, options?: any): any {
    return this.voiceOver.generate(text, options);
  }

  /**
   * Apply filter to video
   * @param filterName Name of the filter
   @param intensity Filter intensity (0-1)
   * @returns Filtered frame data
   */
  applyFilter(filterName: string, intensity: number): any {
    return this.filters.apply(filterName, { intensity });
  }

  /**
   * Crop video frame
   * @param width Crop width
   * @param height Crop height
   * @param x X offset
   * @param y Y offset
   * @returns Cropped frame data
   */
  cropFrame(width: number, height: number, x: number, y: number): any {
    return this.crop.crop(width, height, x, y);
  }

  /**
   * Upload a video file with progress tracking
   * @param file Video file to upload
   * @param options Upload options
   * @returns Upload result with video metadata
   */
  uploadVideo(file: File, options?: UploadOptions): UploadResult {
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
   * Edit text for captions or titles
   * @param text Text content
   * @param style Text style options
   * @returns Edited text configuration
   */
  editText(text: string, style?: any): any {
    return this.textEditor.edit(text, style);
  }

  /**
   * Get music video specific features
   * @returns Music video features configuration
   */
  getMusicVideoFeatures(): any {
    return this.musicVideoFeatures.getFeatures();
  }

  /**
   * Get live streaming specific features
   * @returns Live streaming features configuration
   */
  getLiveStreamingFeatures(): any {
    return this.liveStreamingFeatures.getFeatures();
  }

  /**
   * Get movie directing specific features
   * @returns Movie directing features configuration
   */
  getMovieDirectingFeatures(): any {
    return this.movieDirectingFeatures.getFeatures();
  }

  /**
   * Comprehensive video enhancement for music video quality
   * @param videoInput Input video data
   * @param options Enhancement options
   * @returns Enhanced video data with metrics
   */
  enhanceForMusicVideo(videoInput: any, options?: any): { result: any; metrics: EnhancementMetrics } {
    const startTime = performance.now();
    let result = videoInput;
    let usedAI = false;
    let aiModel: string | undefined;
    let integration: 'webgpu' | 'onnx' | 'mediapipe' | 'none' = 'none';
    
    // Apply special effects (including AI)
    result = this.specialEffects.enhance(result, options?.effects);
    
    // Track if AI was used in effects
    if (options?.effects?.some?.( (e: string) => e.startsWith('ai-'))) {
      usedAI = true;
      aiModel = options.effects.find((e: string) => e.startsWith('ai-'))?.replace('ai-', '');
    }

    // Apply filters
    result = this.filters.apply(result, { type: options?.filter, intensity: options?.intensity ?? 0.5 });

    // Apply crop if needed
    if (options?.crop) {
      result = this.crop.crop(
        result.width,
        result.height,
        options.crop.x,
        options.crop.y
      );
    }

    // Add voice over if text provided
    if (options?.voiceOver?.text) {
      result = this.voiceOver.generate(options.voiceOver.text, options.voiceOver);
    }

    // Apply text editor for captions
    if (options?.captions) {
      result = this.textEditor.editBatch(options.captions);
    }

    // Apply music video specific enhancements
    result = this.musicVideoFeatures.enhance(result, options?.musicVideo);

    // Apply AI enhancement if enabled
    if (options?.aiEnhance) {
      result = this.specialEffects.apply('ai-enhance', { intensity: options.aiEnhance.intensity ?? 0.5, aiModel: options.aiEnhance.model });
      usedAI = true;
      aiModel = options.aiEnhance.model;
      integration = options.aiEnhance.integration || 'none';
    }

    const endTime = performance.now();
    const metrics: EnhancementMetrics = {
      durationMs: Math.round(endTime - startTime),
      usedAI,
      aiModel,
      integration,
    };

    return { result, metrics };
  }

  /**
   * Comprehensive video enhancement for live streaming quality
   * @param videoInput Input video data
   * @param options Enhancement options
   * @returns Enhanced video data with metrics
   */
  enhanceForLiveStreaming(videoInput: any, options?: any): { result: any; metrics: EnhancementMetrics } {
    const startTime = performance.now();
    let result = videoInput;
    let usedAI = false;
    let aiModel: string | undefined;
    let integration: 'webgpu' | 'onnx' | 'mediapipe' | 'none' = 'none';
    
    // Apply special effects (performance-friendly)
    result = this.specialEffects.enhance(result, options?.effects, { realTime: true });
    
    // Track if AI was used in effects
    if (options?.effects?.some?.( (e: string) => e.startsWith('ai-'))) {
      usedAI = true;
      aiModel = options.effects.find((e: string) => e.startsWith('ai-'))?.replace('ai-', '');
    }

    // Apply filters (lightweight)
    result = this.filters.apply(result, { type: options?.filter, intensity: options?.intensity ?? 0.5 });
    
    // Apply transition if switching scenes
    if (options?.transition) {
      result = this.transitions.apply(
        options.transition.name,
        videoInput,
        result,
        {}
      );
    }
    
    // Apply crop for layout adjustments
    if (options?.crop) {
      result = this.crop.crop(
        result.width,
        result.height,
        options.crop.x,
        options.crop.y
      );
    }
    
    // Apply text editor for lower-third graphics
    if (options?.graphics) {
      result = this.textEditor.editBatch(options.graphics);
    }
    
    // Apply live streaming specific enhancements
    result = this.liveStreamingFeatures.enhance(result, options?.liveStreaming);
    
    // Apply AI enhancement if enabled
    if (options?.aiEnhance) {
      result = this.specialEffects.apply('ai-enhance', { intensity: options.aiEnhance.intensity ?? 0.5, aiModel: options.aiEnhance.model });
      usedAI = true;
      aiModel = options.aiEnhance.model;
      integration = options.aiEnhance.integration || 'none';
    }
    
    const endTime = performance.now();
    const metrics: EnhancementMetrics = {
      durationMs: Math.round(endTime - startTime),
      usedAI,
      aiModel,
      integration,
    };

    return { result, metrics };
  }

  /**
   * Comprehensive video enhancement for movie directing quality
   * @param videoInput Input video data
   * @param options Enhancement options
   * @returns Enhanced video data with metrics
   */
  enhanceForMovieDirecting(videoInput: any, options?: any): { result: any; metrics: EnhancementMetrics } {
    const startTime = performance.now();
    let result = videoInput;
    let usedAI = false;
    let aiModel: string | undefined;
    let integration: 'webgpu' | 'onnx' | 'mediapipe' | 'none' = 'none';
    
    // Apply special effects (cinematic)
    result = this.specialEffects.enhance(result, options?.effects, { cinematic: true });
    
    // Track if AI was used in effects
    if (options?.effects?.some?.( (e: string) => e.startsWith('ai-'))) {
      usedAI = true;
      aiModel = options.effects.find((e: string) => e.startsWith('ai-'))?.replace('ai-', '');
    }

    // Apply filters (film-like)
    result = this.filters.apply(result, { type: options?.filter, intensity: options?.intensity ?? 0.5 });
    
    // Apply transition (dramatic)
    if (options?.transition) {
      result = this.transitions.apply(
        options.transition.name,
        videoInput,
        result,
        {}
      );
    }
    
    // Apply crop (composition)
    if (options?.crop) {
      result = this.crop.crop(
        result.width,
        result.height,
        options.crop.x,
        options.crop.y
      );
    }
    
    // Apply text editor for titles and credits
    if (options?.titles) {
      result = this.textEditor.editBatch(options.titles);
    }
    
    // Apply movie directing specific enhancements
    result = this.movieDirectingFeatures.enhance(result, options?.movieDirecting);
    
    // Apply AI enhancement if enabled
    if (options?.aiEnhance) {
      result = this.specialEffects.apply('ai-enhance', { intensity: options.aiEnhance.intensity ?? 0.5, aiModel: options.aiEnhance.model });
      usedAI = true;
      aiModel = options.aiEnhance.model;
      integration = options.aiEnhance.integration || 'none';
    }
    
    const endTime = performance.now();
    const metrics: EnhancementMetrics = {
      durationMs: Math.round(endTime - startTime),
      usedAI,
      aiModel,
      integration,
    };

    return { result, metrics };
  }
}

export default CinemaEngine;