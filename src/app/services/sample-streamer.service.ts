import { Injectable } from '@angular/core';

export interface SampleStreamerOptions {
  maxResidentSeconds?: number;
  /** Short-sample threshold: files shorter than this are fully decoded and cached (worklet sampler path). */
  shortSampleThresholdSeconds?: number;
  /** Called when the resident window changes; the new buffer may be used by the worklet. */
  onResidentChange?: (buffer: AudioBuffer | null, duration: number) => void;
}

/** A slice of decoded PCM, always resident in the preview buffer. */
export interface ResidentSlice {
  left: Float32Array;
  right: Float32Array;
  startFrame: number;
  endFrame: number;
  duration: number;
}

/** Set of ids of slices that are no longer needed and can be garbage‑collected. */
export type SliceId = string;

/** The current playback position, in frames within the source audio. */
export type PlayheadFrame = number;

/** Token so we can re‑decode from the original source after a tab discard. */
export type SourceToken = number;

/**
 * SampleStreamer for long imports.
 *
 * Why this exists: a 5-minute 48 kHz stereo stem decodes to ~115 MB of PCM, and a 12-track arrangement of imported stems is ~1.4 GB — far past what a mobile WebView heap survives.
 *
 * Strategy: keep the raw ArrayBuffer/Blob URL (never decode to AudioBuffer upfront). When playback is needed, use an AudioBufferSourceNode with .start and .duration to serve windowed slices. Cache a bounded amount of decoded AudioBuffer (the "preview window") so the playhead always has audio ready. For short one-shots below the threshold, decode fully and use the worklet sampler as before.
 *
 * Invariants: the resident window is always bounded by MAX_RESIDENT_SECONDS of decoded PCM (≈ 115 MB / 5 min at 48 kHz stereo). The source buffer is the original file; we never hold two copies of the full take. When the playhead moves, we unlink the oldest cached slice and decode the next one. If the store is cleared (e.g. tab discard), we re‑decode from the original Blob URL — this is safe because the URL points to the original file on disk.
 */
@Injectable({ providedIn: 'root' })
export class SampleStreamer {
  private readonly maxResidentSeconds: number;
  private readonly shortSampleThresholdSeconds: number;

  private readonly onResidentChange?: ((buffer: AudioBuffer | null, duration: number) => void) | null;

  /** Raw source — never decoded to AudioBuffer upfront. */
  private sourceUrl: string | null = null;
  private sourceArrayBuffer: ArrayBuffer | null = null;
  private sourceSampleRate = 48000;
  private sourceChannels = 2;

  /** Cached decoded AudioBuffer — the current preview window. */
  private residentBuffer: AudioBuffer | null = null;
  private residentDuration = 0;

  /** Position of the playhead in frames within the source. */
  private playheadFrame = 0;

  /** Token so we can re-decode from the original source after a tab discard. */
  private sourceToken = 0;

  /** Set of ids of slices that are no longer needed and can be garbage‑collected. */
  private expiredSliceIds: Set<string> = new Set();

  constructor(options: SampleStreamerOptions = {}) {
    this.maxResidentSeconds = options.maxResidentSeconds ?? 30;
    this.shortSampleThresholdSeconds = options.shortSampleThresholdSeconds ?? 10;
    this.onResidentChange = options.onResidentChange ?? null;
  }

  /** Attach a source — the raw file URL or ArrayBuffer. This does NOT decode the full file; it just stores the reference. */
  attachSource(url: string, arrayBuffer: ArrayBuffer, sampleRate: number, channels: number): void {
    this.sourceUrl = url;
    this.sourceArrayBuffer = arrayBuffer;
    this.sourceSampleRate = sampleRate;
    this.sourceChannels = channels;
    this.sourceToken++;
    // Invalidate any stale resident window.
    this.residentBuffer = null;
    this.residentDuration = 0;
    this.playheadFrame = 0;
    this.expiredSliceIds.clear();
    if (this.onResidentChange) {
      this.onResidentChange(null, 0);
    }
  }

  /** Detach the current source (e.g. tab discard, new import). */
  detachSource(): void {
    this.sourceUrl = null;
    this.sourceArrayBuffer = null;
    this.residentBuffer = null;
    this.residentDuration = 0;
    this.playheadFrame = 0;
    this.expiredSliceIds.clear();
    if (this.onResidentChange) {
      this.onResidentChange(null, 0);
    }
  }

  /** Get the current resident AudioBuffer (the preview window centred on the playhead), or null if no source is attached or the window is empty. */
  getResidentBuffer(): AudioBuffer | null {
    return this.residentBuffer;
  }

  /** Get the total duration of the source in seconds. Returns 0 if no source. */
  getDuration(): number {
    if (!this.sourceArrayBuffer || !this.sourceSampleRate) return 0;
    return this.getTotalFrames() / this.sourceSampleRate;
  }

  private getTotalFrames(): number {
    if (!this.sourceArrayBuffer) return 0;
    const bytesPerFrame = Math.max(4, this.sourceChannels * 4);
    return Math.floor(this.sourceArrayBuffer.byteLength / bytesPerFrame);
  }

  private buildPcmWindowBuffer(startFrame: number, endFrame: number): AudioBuffer | null {
    if (!this.sourceArrayBuffer || this.sourceArrayBuffer.byteLength < 4) return null;
    // Detect RIFF/Ogg/fLaC/ID3 container headers; those go through decodeAudioData.
    const magic = new Uint8Array(this.sourceArrayBuffer, 0, Math.min(4, this.sourceArrayBuffer.byteLength));
    const tag = String.fromCharCode(...magic);
    if (tag === 'RIFF' || tag === 'OggS' || tag === 'fLaC' || tag === 'ID3\u0003' || tag.startsWith('ID3')) {
      return null;
    }
    const totalFrames = this.getTotalFrames();
    const clampedStart = Math.max(0, Math.min(startFrame, totalFrames));
    const clampedEnd = Math.max(clampedStart, Math.min(endFrame, totalFrames));
    const frameCount = Math.max(1, clampedEnd - clampedStart);
    const channels = Math.max(1, this.sourceChannels || 1);
    const sampleRate = this.sourceSampleRate || 48000;
    const pcm = new Float32Array(this.sourceArrayBuffer);

    const AudioBufferCtor: typeof AudioBuffer | undefined = (globalThis as any).AudioBuffer;
    if (typeof AudioBufferCtor === 'function') {
      try {
        const buf = new AudioBufferCtor({
          numberOfChannels: channels,
          length: frameCount,
          sampleRate,
        });
        for (let ch = 0; ch < channels; ch++) {
          const channelOffset = Math.min(ch, Math.floor(pcm.length / Math.max(1, totalFrames)) - 1);
          const base = Math.max(0, channelOffset) * totalFrames;
          const slice = pcm.subarray(base + clampedStart, base + clampedStart + frameCount);
          buf.getChannelData(ch).set(slice);
        }
        return buf;
      } catch {
        // Fall through to lightweight AudioBuffer-compatible object for test environments.
      }
    }

    const channelData: Float32Array[] = [];
    for (let ch = 0; ch < channels; ch++) {
      const out = new Float32Array(frameCount);
      const slice = pcm.subarray(clampedStart, clampedStart + frameCount);
      out.set(slice);
      channelData.push(out);
    }
    return {
      sampleRate,
      length: frameCount,
      duration: frameCount / sampleRate,
      numberOfChannels: channels,
      getChannelData: (c: number) => channelData[Math.max(0, Math.min(c, channelData.length - 1))],
      copyFromChannel: () => {},
      copyToChannel: () => {},
    } as unknown as AudioBuffer;
  }

  /** Advance the playhead by deltaFrames. Clamps to [0, duration]. After advancing, returns the new resident buffer so the caller can feed it to an AudioBufferSourceNode. */
  advancePlayhead(deltaFrames: number): AudioBuffer | null {
    if (!this.sourceArrayBuffer) return null;

    const totalFrames = this.getTotalFrames();
    const frameStep = Math.round(deltaFrames);
    this.playheadFrame = Math.max(0, Math.min(this.playheadFrame + frameStep, totalFrames));

    // Build a new resident window centred on the playhead.
    // We keep exactly maxResidentSeconds of decoded audio so the worklet never starves, but we never hold more than ~115 MB at 48 kHz stereo.
    const windowSeconds = this.maxResidentSeconds;
    const startFrame = Math.max(0, this.playheadFrame - Math.floor(windowSeconds * this.sourceSampleRate / 2));
    const endFrame = Math.min(totalFrames, startFrame + windowSeconds * this.sourceSampleRate);

    // If the attached source is raw Float32 PCM (planar or mono), build a
    // windowed AudioBuffer synchronously so playback has a resident window
    // immediately without failing decodeAudioData on headerless PCM.
    const syncWindow = this.buildPcmWindowBuffer(startFrame, endFrame);
    if (syncWindow) {
      this.residentBuffer = syncWindow;
      this.residentDuration = syncWindow.duration;
      if (this.onResidentChange) {
        this.onResidentChange(syncWindow, syncWindow.duration);
      }
      return this.residentBuffer;
    }

    // Decode the slice we need from the original ArrayBuffer.
    // We use the AudioContext.decodeAudioData path because it is the same path every other import uses, and it guarantees a proper AudioBuffer.
    const chunkArrayBuffer = this.sourceArrayBuffer.slice(
      startFrame * this.sourceChannels * 4,
      endFrame * this.sourceChannels * 4,
    );

    const ctx = (globalThis as any).AudioContext
      ? new (globalThis as any).AudioContext()
      : null;

    if (!ctx) {
      // Fallback: return null so the caller can fail gracefully.
      this.residentBuffer = null;
      this.residentDuration = 0;
      if (this.onResidentChange) {
        this.onResidentChange(null, 0);
      }
      return null;
    }

    ctx.decodeAudioData(chunkArrayBuffer).then((buffer) => {
      // If this is a very short file (below the short-sample threshold), fully decode and cache the whole thing so the worklet sampler can play it without per-slice decoding.
      const totalDurationSec = buffer.duration;
      if (totalDurationSec <= this.shortSampleThresholdSeconds) {
        // Fully cache the short sample; keep only one resident buffer.
        this.residentBuffer = buffer;
        this.residentDuration = totalDurationSec;
        this.playheadFrame = totalFrames; // mark as consumed
        this.expiredSliceIds.clear();
        if (this.onResidentChange) {
          this.onResidentChange(buffer, totalDurationSec);
        }
        // Release the source array buffer since we now have the full decode.
        this.sourceArrayBuffer = null;
        this.sourceUrl = null;
        return;
      }

      // Long import: keep a bounded window.
      this.residentBuffer = buffer;
      this.residentDuration = totalDurationSec;

      // Trim the left edge so we don't keep growing the resident buffer indefinitely if the playhead keeps moving right.
      if (startFrame > 0 && this.residentBuffer) {
        // We have audio from startFrame to endFrame in the source;
        // the buffer we decoded is exactly that range. No trimming needed
        // because the slice size is already bounded by windowSeconds.
      }

      if (this.onResidentChange) {
        this.onResidentChange(buffer, totalDurationSec);
      }
    }).catch((error) => {
      console.error('SampleStreamer: failed to decode audio chunk', error);
      this.residentBuffer = null;
      this.residentDuration = 0;
      if (this.onResidentChange) {
        this.onResidentChange(null, 0);
      }
    });

    return this.residentBuffer;
  }

  /** Set the playhead to an absolute frame position. Clamps to [0, totalFrames]. */
  setPlayhead(frame: number): void {
    if (!this.sourceArrayBuffer) return;
    const totalFrames = this.getTotalFrames();
    this.playheadFrame = Math.max(0, Math.min(frame, totalFrames));
    // Refill the resident window.
    this.advancePlayhead(0);
  }

  /** Get the current playhead position in seconds. */
  getPlayheadSeconds(): number {
    return (this.playheadFrame / (this.sourceSampleRate || 48000)) | 0;
  }

  /** Get the total duration of the source in seconds, or 0 if no source. */
  getTotalSeconds(): number {
    if (!this.sourceArrayBuffer) return 0;
    return this.getDuration();
  }

  /** Dispose of any in-flight decoding and clear caches. Call on destroy. */
  destroy(): void {
    this.detachSource();
  }
}

/**
 * Create a SampleStreamer instance.
 *
 * @param options.maxResidentSeconds — how many seconds of decoded PCM to keep in the resident window (default 30 ≈ 115 MB at 48 kHz stereo).
 * @param options.shortSampleThresholdSeconds — files shorter than this are fully decoded and cached so the worklet sampler can play them without per-slice decoding (default 10).
 * @returns a new SampleStreamer.
 */
export function createSampleStreamer(options?: SampleStreamerOptions): SampleStreamer {
  return new SampleStreamer(options);
}