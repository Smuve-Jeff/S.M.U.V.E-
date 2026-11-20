import { ArrayBufferTarget, Muxer } from 'webm-muxer';
import {
  createFrameLockPlan,
  frameDurationMicros,
  frameKeyInterval,
  frameTimestampMicros,
  type FrameLockPlan,
} from './frame-locked-export';
import type { WebmOpusAudio } from './webm-opus';

/**
 * WebCodecs video encoder for the true frame-locked export.
 *
 * The old capture path sampled a canvas in real time: a slow CGI frame simply
 * did not arrive, and the file's cadence was decided by render cost. This
 * encoder receives one already-painted canvas per delivery slot, stamps it
 * from the frame index, and muxes the chunks into WebM. The result is exactly
 * `totalFrames` encoded frames at the requested interval, however long each
 * paint took.
 *
 * Audio is recorded separately and muxed by FFmpeg afterwards, because a
 * canvas stream cannot carry the Studio's Web Audio graph through WebCodecs.
 */
export interface FrameLockedEncoderOptions {
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  bitrate: number;
  alpha?: boolean;
  /** Opus packets from the separately recorded audio WebM. */
  audio?: WebmOpusAudio | null;
}

export interface FrameLockedEncodeResult {
  blob: Blob;
  /** WebM codec id, reported so the UI can name what it delivered. */
  codec: string;
  frameCount: number;
}

interface EncoderCandidate {
  encoderCodec: string;
  muxerCodec: string;
  label: string;
  hardwareAcceleration?: HardwareAcceleration;
}

/**
 * VP9 first for detail, VP8 as the compatibility fallback. Both are WebM
 * codecs, so the muxer never has to pretend an AVC chunk is WebM.
 */
const ENCODER_CANDIDATES: readonly EncoderCandidate[] = [
  // Hardware first: a frame-locked master is the slowest path in the editor,
  // and a GPU encoder can be an order of magnitude faster than software VP9.
  // Each codec is offered twice so a browser that cannot honour the hint still
  // falls back to its software encoder instead of refusing the export.
  {
    encoderCodec: 'vp09.00.10.08',
    muxerCodec: 'V_VP9',
    label: 'VP9',
    hardwareAcceleration: 'prefer-hardware',
  },
  { encoderCodec: 'vp09.00.10.08', muxerCodec: 'V_VP9', label: 'VP9' },
  {
    encoderCodec: 'vp8',
    muxerCodec: 'V_VP8',
    label: 'VP8',
    hardwareAcceleration: 'prefer-hardware',
  },
  { encoderCodec: 'vp8', muxerCodec: 'V_VP8', label: 'VP8' },
];

/** True when the browser exposes the two WebCodecs primitives this path needs. */
export function isFrameLockedEncodeSupported(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as { VideoEncoder?: unknown }).VideoEncoder ===
      'function' &&
    typeof (globalThis as { VideoFrame?: unknown }).VideoFrame === 'function'
  );
}

export function createFrameLockedVideoEncoder(
  options: FrameLockedEncoderOptions,
): Promise<FrameLockedVideoEncoder> {
  return FrameLockedVideoEncoder.create(options);
}

export class FrameLockedVideoEncoder {
  readonly plan: FrameLockPlan;
  private readonly encoder: VideoEncoder;
  private readonly muxer: Muxer<ArrayBufferTarget>;
  private readonly target: ArrayBufferTarget;
  private readonly codec: string;
  private readonly alpha: boolean;
  private encodeError: Error | null = null;
  private finished = false;

  private constructor(
    plan: FrameLockPlan,
    encoder: VideoEncoder,
    muxer: Muxer<ArrayBufferTarget>,
    target: ArrayBufferTarget,
    codec: string,
    alpha: boolean,
  ) {
    this.plan = plan;
    this.encoder = encoder;
    this.muxer = muxer;
    this.target = target;
    this.codec = codec;
    this.alpha = alpha;
  }

  static async create(
    options: FrameLockedEncoderOptions,
  ): Promise<FrameLockedVideoEncoder> {
    if (!isFrameLockedEncodeSupported()) {
      throw new Error(
        'This browser does not support WebCodecs frame-locked export.',
      );
    }

    const width = Math.max(2, Math.round(options.width));
    const height = Math.max(2, Math.round(options.height));
    const plan = createFrameLockPlan(
      options.durationSeconds,
      options.fps,
    );
    const bitrate =
      Number.isFinite(options.bitrate) && options.bitrate > 0
        ? Math.round(options.bitrate)
        : 12_000_000;
    const alpha = options.alpha === true;

    let lastReason = '';
    for (const candidate of ENCODER_CANDIDATES) {
      const config: VideoEncoderConfig = {
        codec: candidate.encoderCodec,
        width,
        height,
        bitrate,
        framerate: plan.fps,
        ...(candidate.hardwareAcceleration
          ? { hardwareAcceleration: candidate.hardwareAcceleration }
          : {}),
        // Offline quality tuning made a software encoder spend seconds per
        // frame, so a short export could outlast the tab. Realtime mode keeps
        // the same frame-locked timeline while letting the encoder pipeline
        // work; the bitrate still bounds the master's quality.
        latencyMode: 'realtime',
        alpha: alpha ? 'keep' : 'discard',
      };

      let supported = false;
      try {
        const result = await VideoEncoder.isConfigSupported(config);
        supported = result.supported === true;
      } catch (error) {
        lastReason = error instanceof Error ? error.message : String(error);
      }
      if (!supported) continue;

      const target = new ArrayBufferTarget();
      const audio = options.audio;
      const muxer = new Muxer({
        target,
        video: {
          codec: candidate.muxerCodec,
          width,
          height,
          frameRate: plan.fps,
          alpha,
        },
        ...(audio
          ? {
              audio: {
                codec: 'A_OPUS',
                numberOfChannels: audio.channels,
                sampleRate: audio.sampleRate,
              },
            }
          : {}),
        firstTimestampBehavior: 'strict',
      });

      // Add the already-encoded audio first. The muxer writes the tracks into
      // clusters by timestamp, so audio can arrive before any video chunk.
      if (audio) {
        const maxTimestampUs = plan.durationSeconds * 1_000_000;
        for (const packet of audio.packets) {
          if (packet.timestampUs < 0 || packet.timestampUs >= maxTimestampUs) {
            continue;
          }
          muxer.addAudioChunkRaw(packet.data, 'key', packet.timestampUs);
        }
      }

      const holder: { current: FrameLockedVideoEncoder | null } = {
        current: null,
      };
      const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (error) => {
          holder.current?.recordError(error);
        },
      });
      const instance = new FrameLockedVideoEncoder(
        plan,
        encoder,
        muxer,
        target,
        candidate.label,
        alpha,
      );
      holder.current = instance;

      try {
        encoder.configure(config);
      } catch (error) {
        encoder.close();
        lastReason = error instanceof Error ? error.message : String(error);
        continue;
      }
      return instance;
    }

    throw new Error(
      lastReason
        ? `This browser cannot configure a WebM video encoder: ${lastReason}`
        : 'This browser cannot encode VP9 or VP8 video.',
    );
  }

  /** Create one VideoFrame for the next delivery slot and encode it. */
  async encode(source: CanvasImageSource, frameIndex: number): Promise<void> {
    if (this.finished) throw new Error('The frame-locked encoder is closed.');
    this.throwIfFailed();

    const timestamp = frameTimestampMicros(this.plan, frameIndex);
    const frame = new VideoFrame(source, {
      timestamp,
      duration: frameDurationMicros(this.plan),
      alpha: this.alpha ? 'keep' : 'discard',
    });
    try {
      this.encoder.encode(frame, {
        keyFrame: frameIndex % frameKeyInterval(this.plan) === 0,
      });
    } finally {
      frame.close();
    }
    await this.drainQueue();
    this.throwIfFailed();
  }

  /** Flush the encoder, finalize the WebM container, and return its bytes. */
  async finish(): Promise<FrameLockedEncodeResult> {
    if (this.finished) {
      throw new Error('The frame-locked encoder has already been finished.');
    }
    this.finished = true;
    try {
      await this.encoder.flush();
      this.throwIfFailed();
      this.muxer.finalize();
      const buffer = this.target.buffer;
      if (!buffer || buffer.byteLength === 0) {
        throw new Error('The frame-locked encoder produced no video bytes.');
      }
      return {
        blob: new Blob([buffer], { type: 'video/webm' }),
        codec: this.codec,
        frameCount: this.plan.totalFrames,
      };
    } finally {
      try {
        this.encoder.close();
      } catch {
        /* already closed */
      }
    }
  }

  /** Release the encoder after an aborted export. */
  close(): void {
    this.finished = true;
    try {
      this.encoder.close();
    } catch {
      /* already closed */
    }
  }

  private recordError(error: Error): void {
    if (!this.encodeError) this.encodeError = error;
  }

  private throwIfFailed(): void {
    if (this.encodeError) {
      throw new Error(`Video encoding failed: ${this.encodeError.message}`);
    }
  }

  /**
   * Let the hardware encoder catch up. A deep queue holds every full-size
   * VideoFrame alive, which is exactly the memory a 4K master cannot spare.
   */
  private async drainQueue(): Promise<void> {
    while (this.encoder.encodeQueueSize > 4) {
      this.throwIfFailed();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
}
