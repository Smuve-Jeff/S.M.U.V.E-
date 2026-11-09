import { Injectable, inject } from '@angular/core';
import { LoggingService } from './logging.service';
import type { CaptionCue } from './clip-captions';
import { estimateCaptionDuration, mintCaptionId } from './clip-captions';

/**
 * Whisper-based file transcription — the "auto captions" for audio that
 * already exists in a clip, as opposed to live mic capture.
 *
 * Runs Whisper Tiny (English) on-device via Transformers.js: the model
 * (~75 MB) downloads once from the Hugging Face CDN and then works offline.
 * The clip's audio is decoded with Web Audio, chunked into Whisper's 30s
 * windows, and each chunk's transcript becomes a caption cue offset by the
 * clip's timeline position.
 *
 * Everything is lazy and injectable: the model load is expensive, so it
 * happens on first use, and tests substitute `modelLoader`.
 */

export const WHISPER_MODEL_ID = 'Xenova/whisper-tiny.en';
export const WHISPER_CHUNK_SECONDS = 30;
export const WHISPER_SAMPLE_RATE = 16000;

export interface WhisperChunkResult {
  text: string;
}

export type WhisperModelLoader = () => Promise<{
  transcriber: (audio: Float32Array, options?: Record<string, unknown>) => Promise<WhisperChunkResult>;
}>;

export interface TranscribeOptions {
  onProgress?: (message: string) => void;
  /** Abort between chunks; an in-flight chunk must finish. */
  signal?: AbortSignal;
}

@Injectable({ providedIn: 'root' })
export class WhisperTranscriptionService {
  private logger = inject(LoggingService, { optional: true });

  private modelPromise: Promise<{ transcriber: (audio: Float32Array, options?: Record<string, unknown>) => Promise<WhisperChunkResult> }> | null = null;

  /** Test seam: replace the dynamic import + model download. */
  modelLoader: WhisperModelLoader | null = null;

  async loadModel(
    onProgress?: (message: string) => void,
  ): Promise<{ transcriber: (audio: Float32Array, options?: Record<string, unknown>) => Promise<WhisperChunkResult> }> {
    if (this.modelLoader) return this.modelLoader();
    if (!this.modelPromise) {
      this.modelPromise = (async () => {
        onProgress?.('DOWNLOADING WHISPER MODEL (ONE TIME, ~75 MB)…');
        // Loaded from CDN at runtime: the npm package drags in Node-only
        // native deps (onnxruntime-node) that cannot bundle for the browser.
        // The +esm build is the browser entry point.
        const transformersUrl =
          'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/+esm';
        // Indirect import: a literal URL would make the bundler try (and
        // fail) to resolve it; a variable keeps it a runtime fetch.
        const transformers = (await import(/* @vite-ignore */ transformersUrl)) as {
          pipeline: (task: string, model: string) => Promise<never>;
          env: { allowLocalModels: boolean };
        };
        const { pipeline, env } = transformers;
        // Transformers.js fetches from the HF CDN by default; workers are
        // not needed for the tiny model and single-thread keeps the build
        // deployable without COOP/COEP headers.
        env.allowLocalModels = false;
        const transcriber = await (pipeline as (task: string, model: string) => Promise<unknown>)(
          'automatic-speech-recognition',
          WHISPER_MODEL_ID,
        );
        return {
          transcriber: (async (audio: Float32Array, options?: Record<string, unknown>) => {
            const result = await (transcriber as unknown as (
              input: Float32Array,
              opts: Record<string, unknown>,
            ) => Promise<{ text: string }>)(audio, options ?? {});
            return { text: result.text ?? '' };
          }) as (audio: Float32Array, options?: Record<string, unknown>) => Promise<WhisperChunkResult>,
        };
      })().catch((error) => {
        this.modelPromise = null;
        throw error;
      });
    }
    return this.modelPromise;
  }

  /**
   * Transcribe one decoded mono 16 kHz buffer into caption cues.
   * Pure orchestration (chunking + cue building) — testable with a fake
   * transcriber and synthetic audio.
   */
  async transcribeAudio(
    audio: Float32Array,
    timelineOffset = 0,
    options: TranscribeOptions = {},
  ): Promise<CaptionCue[]> {
    const { transcriber } = await this.loadModel(options.onProgress);
    const chunkSamples = WHISPER_CHUNK_SECONDS * WHISPER_SAMPLE_RATE;
    const cues: CaptionCue[] = [];
    for (let offset = 0; offset < audio.length; offset += chunkSamples) {
      if (options.signal?.aborted) {
        throw new DOMException('Transcription cancelled.', 'AbortError');
      }
      const chunk = audio.subarray(offset, Math.min(audio.length, offset + chunkSamples));
      if (chunk.length < WHISPER_SAMPLE_RATE / 2) break; // <0.5s: not speech
      const chunkStart = timelineOffset + offset / WHISPER_SAMPLE_RATE;
      options.onProgress?.(`TRANSCRIBING ${chunkStart.toFixed(0)}S…`);
      const { text } = await transcriber(chunk, { chunk_length_s: WHISPER_CHUNK_SECONDS, stride_length_s: 5 });
      const clean = text.trim();
      if (!clean) continue;
      cues.push({
        id: mintCaptionId(),
        start: chunkStart,
        end: chunkStart + estimateCaptionDuration(clean),
        text: clean,
      });
    }
    this.logger?.info(`Whisper transcription: ${cues.length} cue(s)`);
    return cues;
  }

  /**
   * Decode a media blob (the clip's own bytes) to mono 16 kHz audio.
   * Throws when the host cannot decode it (cross-origin without CORS).
   */
  async decodeToMono16k(blob: Blob): Promise<Float32Array> {
    const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!Ctor) throw new Error('Audio decoding is not available in this browser.');
    const ctx = new Ctor();
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      const targetRate = WHISPER_SAMPLE_RATE;
      const length = Math.max(1, Math.round(decoded.duration * targetRate));
      const offline = new OfflineAudioContext(1, length, targetRate);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start(0);
      const resampled = await offline.startRendering();
      return new Float32Array(resampled.getChannelData(0));
    } finally {
      void ctx.close().catch(() => undefined);
    }
  }
}
