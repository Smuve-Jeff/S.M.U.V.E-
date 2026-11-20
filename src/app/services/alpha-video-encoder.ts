import {
  AudioBufferSource,
  BufferTarget,
  EncodedPacket,
  EncodedVideoPacketSource,
  Output,
  Quality,
  WebMOutputFormat,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny';
import {
  createFrameLockPlan,
  frameDurationMicros,
  frameKeyInterval,
  frameTimestampMicros,
  type FrameLockPlan,
} from './frame-locked-export';

export interface AlphaFrameEncoderOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  bitrate: number;
  /** Already-recorded Studio audio, decoded to an AudioBuffer. */
  audio?: AudioBuffer | null;
}

export interface AlphaFrameEncodeResult {
  blob: Blob;
  codec: string;
  frameCount: number;
  audioMuxed: boolean;
}

interface EncodedColorFrame {
  chunk: EncodedVideoChunk;
  meta?: EncodedVideoChunkMetadata;
}

/**
 * Frame-locked transparent WebM encoder.
 *
 * Chrome's VideoEncoder rejects `alpha: 'keep'`, but WebM can still carry VP9
 * alpha as a second encoded stream in each block's BlockAdditions. This path
 * encodes colour and alpha with two ordinary VP9 encoders, then hands each
 * paired chunk to Mediabunny as alpha side data. It deliberately does not use
 * Mediabunny's CanvasSource: that path builds its splitter Worker from
 * `Function.toString()`, which breaks when the app bundle downlevels `async`
 * for development. Direct readback also keeps the browser's worker policy out
 * of the export path.
 *
 * The recorded Opus track is encoded into the same WebM by Mediabunny. Audio
 * and video packets are queued independently; the Matroska interleaver only
 * writes when both tracks have data, so neither source blocks the other.
 */
export async function createAlphaVideoEncoder(
  options: AlphaFrameEncoderOptions,
): Promise<AlphaVideoEncoder> {
  const width = Math.max(2, Math.round(options.width));
  const height = Math.max(2, Math.round(options.height));
  const fps = Math.max(1, Math.round(options.fps));
  const plan = createFrameLockPlan(options.durationSeconds, fps);
  const bitrate =
    Number.isFinite(options.bitrate) && options.bitrate > 0
      ? Math.round(options.bitrate)
      : 12_000_000;

  const supported = await canEncodeVideo('vp9', {
    width,
    height,
    frameRate: plan.fps,
    alpha: 'keep',
  });
  if (!supported) {
    throw new Error('This browser cannot encode VP9 video with alpha.');
  }

  const target = new BufferTarget();
  const output = new Output({
    format: new WebMOutputFormat(),
    target,
  });
  const packets = new EncodedVideoPacketSource('vp9');
  output.addVideoTrack(packets);

  const audio = options.audio
    ? trimAudioBuffer(options.audio, plan.durationSeconds)
    : null;
  let audioSource: AudioBufferSource | null = null;
  let audioIncluded = false;
  if (audio) {
    try {
      audioIncluded = await canEncodeAudio('opus');
    } catch {
      audioIncluded = false;
    }
    if (audioIncluded) {
      audioSource = new AudioBufferSource({
        codec: 'opus',
        quality: new Quality({ bitrate: 192_000 }),
      });
      output.addAudioTrack(audioSource);
    }
  }

  const config: VideoEncoderConfig = {
    codec: 'vp09.00.10.08',
    width,
    height,
    bitrate,
    framerate: plan.fps,
    // Alpha and colour must produce the same frames. Quality mode forbids
    // dropping frames to hit a target rate, which keeps the two encoders in
    // lockstep.
    latencyMode: 'quality',
    alpha: 'discard',
  };

  let instance: AlphaVideoEncoder | null = null;
  const colorEncoder = new VideoEncoder({
    output: (chunk, meta) => instance?.pushColor(chunk, meta),
    error: (error) => instance?.recordError(error),
  });
  const alphaEncoder = new VideoEncoder({
    output: (chunk) => instance?.pushAlpha(chunk),
    error: (error) => instance?.recordError(error),
  });
  colorEncoder.configure(config);
  alphaEncoder.configure(config);

  try {
    await output.start();
  } catch (error) {
    colorEncoder.close();
    alphaEncoder.close();
    try {
      audioSource?.close();
    } catch {
      /* already closed */
    }
    await output.cancel().catch(() => undefined);
    throw error;
  }

  // Audio encoding can finish independently of the first video packet; the
  // muxer holds both queues until it has enough from each track to interleave.
  const audioReady =
    audioSource && audio
      ? audioSource.add(audio).then(
          () => true,
          () => false,
        )
      : null;

  instance = new AlphaVideoEncoder(
    plan,
    options.canvas,
    packets,
    audioSource,
    audioReady,
    colorEncoder,
    alphaEncoder,
    output,
    target,
    width,
    height,
  );
  return instance;
}

function trimAudioBuffer(buffer: AudioBuffer, seconds: number): AudioBuffer {
  const duration = Math.max(0, seconds);
  if (buffer.duration <= duration + 1e-3) return buffer;
  const length = Math.max(1, Math.floor(duration * buffer.sampleRate));
  const trimmed = new AudioBuffer({
    length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    trimmed.copyToChannel(buffer.getChannelData(channel).subarray(0, length), channel);
  }
  return trimmed;
}

export class AlphaVideoEncoder {
  readonly plan: FrameLockPlan;
  private readonly canvas: HTMLCanvasElement;
  private readonly packets: EncodedVideoPacketSource;
  private readonly audio: AudioBufferSource | null;
  private readonly audioReady: Promise<boolean> | null;
  private readonly colorEncoder: VideoEncoder;
  private readonly alphaEncoder: VideoEncoder;
  private readonly output: Output<WebMOutputFormat, BufferTarget>;
  private readonly target: BufferTarget;
  private readonly width: number;
  private readonly height: number;
  private readonly colorQueue: EncodedColorFrame[] = [];
  private readonly alphaQueue: EncodedVideoChunk[] = [];
  private packetChain: Promise<void> = Promise.resolve();
  private addedPackets = 0;
  private encodeError: Error | null = null;
  private finished = false;

  constructor(
    plan: FrameLockPlan,
    canvas: HTMLCanvasElement,
    packets: EncodedVideoPacketSource,
    audio: AudioBufferSource | null,
    audioReady: Promise<boolean> | null,
    colorEncoder: VideoEncoder,
    alphaEncoder: VideoEncoder,
    output: Output<WebMOutputFormat, BufferTarget>,
    target: BufferTarget,
    width: number,
    height: number,
  ) {
    this.plan = plan;
    this.canvas = canvas;
    this.packets = packets;
    this.audio = audio;
    this.audioReady = audioReady;
    this.colorEncoder = colorEncoder;
    this.alphaEncoder = alphaEncoder;
    this.output = output;
    this.target = target;
    this.width = width;
    this.height = height;
  }

  /** Split the canvas into colour and alpha, then encode the exact slot. */
  async encode(frameIndex: number): Promise<void> {
    if (this.finished) throw new Error('The alpha encoder is closed.');
    this.throwIfFailed();

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('The alpha encoder has no 2D canvas context.');
    const image = ctx.getImageData(0, 0, this.width, this.height);
    const timestamp = frameTimestampMicros(this.plan, frameIndex);
    const duration = frameDurationMicros(this.plan);
    const keyFrame = frameIndex % frameKeyInterval(this.plan) === 0;

    const color = new VideoFrame(image.data, {
      format: 'RGBX',
      codedWidth: this.width,
      codedHeight: this.height,
      timestamp,
      duration,
    });
    const alpha = new VideoFrame(this.alphaPlane(image.data), {
      format: 'I420',
      codedWidth: this.width,
      codedHeight: this.height,
      timestamp,
      duration,
    });
    try {
      this.colorEncoder.encode(color, { keyFrame });
      this.alphaEncoder.encode(alpha, { keyFrame });
    } finally {
      color.close();
      alpha.close();
    }

    // Keep both encoder queues shallow. A frame holds a full RGBA readback and
    // two encoder copies, which a 4K master cannot spare.
    while (
      this.colorEncoder.encodeQueueSize > 4 ||
      this.alphaEncoder.encodeQueueSize > 4
    ) {
      this.throwIfFailed();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    this.throwIfFailed();
  }

  /** Flush both streams, wait for the muxer, and return the WebM bytes. */
  async finish(): Promise<AlphaFrameEncodeResult> {
    if (this.finished) {
      throw new Error('The alpha encoder has already been finished.');
    }
    this.finished = true;
    await this.colorEncoder.flush();
    await this.alphaEncoder.flush();
    this.throwIfFailed();
    await this.packetChain;
    const audioMuxed = this.audioReady ? await this.audioReady : false;
    try {
      this.audio?.close();
    } catch {
      /* already closed after its buffer was added */
    }
    this.packets.close();
    await this.output.finalize();

    const buffer = this.target.buffer;
    if (!buffer || buffer.byteLength === 0) {
      throw new Error('The alpha encoder produced no video bytes.');
    }
    return {
      blob: new Blob([buffer], { type: 'video/webm' }),
      codec: 'VP9 ALPHA',
      frameCount: this.plan.totalFrames,
      audioMuxed,
    };
  }

  /** Release encoder and muxer resources after an aborted export. */
  close(): void {
    if (this.finished) return;
    this.finished = true;
    try {
      this.colorEncoder.close();
    } catch {
      /* already closed */
    }
    try {
      this.alphaEncoder.close();
    } catch {
      /* already closed */
    }
    try {
      this.audio?.close();
    } catch {
      /* already closed */
    }
    this.packets.close();
    void this.output.cancel().catch(() => undefined);
  }

  /** @internal Called from the colour encoder's output callback. */
  pushColor(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void {
    this.colorQueue.push({ chunk, meta });
    this.drainPairs();
  }

  /** @internal Called from the alpha encoder's output callback. */
  pushAlpha(chunk: EncodedVideoChunk): void {
    this.alphaQueue.push(chunk);
    this.drainPairs();
  }

  /** @internal Record an asynchronous encoder failure. */
  recordError(error: DOMException): void {
    if (!this.encodeError) {
      this.encodeError = new Error(
        error.message || 'VP9 alpha encoding failed.',
      );
    }
  }

  private drainPairs(): void {
    while (this.colorQueue.length && this.alphaQueue.length) {
      const color = this.colorQueue.shift()!;
      const alpha = this.alphaQueue.shift()!;
      if (color.chunk.timestamp !== alpha.timestamp) {
        this.recordError(
          new DOMException(
            `Colour and alpha timestamps differ (${color.chunk.timestamp} vs ${alpha.timestamp}).`,
          ),
        );
        return;
      }
      const alphaData = new Uint8Array(alpha.byteLength);
      alpha.copyTo(alphaData);
      const packet = EncodedPacket.fromEncodedChunk(color.chunk, {
        alpha: alphaData,
      });
      const meta = this.addedPackets === 0 ? color.meta : undefined;
      this.addedPackets += 1;
      this.packetChain = this.packetChain.then(() =>
        this.packets.add(packet, meta),
      );
    }
  }

  private throwIfFailed(): void {
    if (this.encodeError) {
      throw new Error(`Alpha encoding failed: ${this.encodeError.message}`);
    }
  }

  /** I420 luma carries the canvas alpha; chroma is neutral 128. */
  private alphaPlane(rgba: Uint8ClampedArray): Uint8Array {
    const luma = this.width * this.height;
    const chroma =
      Math.ceil(this.width / 2) * Math.ceil(this.height / 2);
    const plane = new Uint8Array(luma + chroma * 2);
    for (let index = 0; index < luma; index += 1) {
      plane[index] = rgba[index * 4 + 3];
    }
    plane.fill(128, luma);
    return plane;
  }
}
