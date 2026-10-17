import { WavEncoder, type WavFormat } from "./wav-encoder.util";

/**
 * Peak level of a channel in dBFS, floored at -60 and rounded to 0.1 dB.
 * Shared with the take readout (`smart-recording.service.ts`) so the number the
 * artist sees is the number that was measured during the encode.
 */
export function peakDbFs(peak: number): number {
  if (!(peak > 0)) return -60;
  return Math.max(-60, Math.round(20 * Math.log10(peak) * 10) / 10);
}

export interface WavStreamStats {
  /** Frames actually written to the data chunk. */
  frames: number;
  /** Highest absolute sample per channel (linear, so 1 = full scale). */
  peakLeft: number;
  peakRight: number;
}

export interface WavStreamResult {
  blob: Blob;
  stats: WavStreamStats;
}

/**
 * Streaming 16-bit WAV writer for a take that arrives in chunks.
 *
 * Why this exists: `WavEncoder.encodeMultiChannel()` needs two *contiguous*
 * channel arrays, so a capture path had to `join` the whole take into two
 * `Float32Array`s and then allocate one more buffer of the encoded size —
 * roughly 2× the take in memory at the instant the artist presses stop (a
 * 60-minute 48 kHz stereo take wants ~700 MB).
 *
 * Feed this one group of PCM at a time (`push`) and it emits one encoded Blob
 * part per chunk group, so the live peak is the group being encoded plus the
 * output already produced. `end()` writes the header from the frames it
 * actually received, which means the caller never has to count frames up front
 * — and a header that disagrees with the data becomes impossible.
 *
 * Output is byte-identical to `WavEncoder.encodeMultiChannel(joined, …)` for the
 * same samples, including the 16-bit clamp/scale and the `DataView.setInt16`
 * truncation; both are asserted against each other in the spec.
 */
export class WavStreamWriter {
  private readonly parts: BlobPart[] = [];
  private readonly channelCount: number;
  private readonly sampleRate: number;
  private frames = 0;
  private peakLeft = 0;
  private peakRight = 0;
  private result: WavStreamResult | null = null;

  constructor(options: { channelCount: number; sampleRate: number }) {
    if (!Number.isFinite(options.channelCount) || options.channelCount < 1) {
      throw new Error("Cannot encode an empty WAV channel set");
    }
    this.channelCount = Math.floor(options.channelCount);
    this.sampleRate = options.sampleRate > 0 ? options.sampleRate : 48000;
  }

  /** Frames written so far. */
  get frameCount(): number {
    return this.frames;
  }

  /**
   * Encode one group: `channels[c]` is that channel's ordered chunk list for
   * this group. Every channel must supply the same chunk layout, otherwise the
   * interleave would shift and the file would be quietly wrong.
   */
  push(channels: Float32Array[][]): void {
    if (this.result) {
      throw new Error("Cannot push PCM after the WAV was finished");
    }
    if (channels.length !== this.channelCount) {
      throw new Error("WAV channel count does not match the provided buffer");
    }
    const groupLength = channels[0]?.length ?? 0;
    for (const chunks of channels) {
      if (chunks.length !== groupLength) {
        throw new Error(
          "WAV channels must contain the same number of chunks per group",
        );
      }
    }

    for (let index = 0; index < groupLength; index++) {
      const frames = channels[0][index]?.length ?? 0;
      if (frames === 0) continue;
      for (const chunks of channels) {
        if ((chunks[index]?.length ?? 0) !== frames) {
          throw new Error(
            "WAV channels must contain the same number of frames",
          );
        }
      }
      this.measurePeaks(channels, index, frames);
      this.parts.push(WavStreamWriter.encodeSlice(channels, index, frames));
      this.frames += frames;
    }
  }

  /**
   * Close the file. The header is built from the frames that were actually
   * pushed, so it is never able to disagree with the data chunk. Safe to call
   * twice (the result is cached) — a caller that retries a save does not need a
   * second copy of the audio.
   */
  end(): WavStreamResult {
    if (this.result) return this.result;
    const header = WavStreamWriter.buildHeader(
      this.channelCount,
      this.sampleRate,
      this.frames * this.channelCount * 2,
    );
    const blob = new Blob([header, ...this.parts], { type: "audio/wav" });
    this.result = {
      blob,
      stats: {
        frames: this.frames,
        peakLeft: this.peakLeft,
        peakRight: this.channelCount > 1 ? this.peakRight : this.peakLeft,
      },
    };
    return this.result;
  }

  private measurePeaks(
    channels: Float32Array[][],
    index: number,
    frames: number,
  ): void {
    for (let channel = 0; channel < Math.min(2, channels.length); channel++) {
      const chunk = channels[channel][index];
      let peak = channel === 0 ? this.peakLeft : this.peakRight;
      for (let frame = 0; frame < frames; frame++) {
        const abs = Math.abs(chunk[frame]);
        if (abs > peak) peak = abs;
      }
      if (channel === 0) this.peakLeft = peak;
      else this.peakRight = peak;
    }
  }

  private static encodeSlice(
    channels: Float32Array[][],
    index: number,
    frames: number,
  ): Uint8Array<ArrayBuffer> {
    const numChannels = channels.length;
    // Explicit ArrayBuffer (not the ArrayBufferLike of `new Uint8Array(n)`) so
    // the result is a valid BlobPart without a cast.
    const bytes = new Uint8Array(new ArrayBuffer(frames * numChannels * 2));
    const view = new DataView(bytes.buffer);
    let offset = 0;
    for (let frame = 0; frame < frames; frame++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const value = channels[channel][index][frame];
        // Byte-for-byte the conversion `WavEncoder.encodeInternal` performs for
        // 16-bit PCM, including letting setInt16 do the truncation.
        const sample = Math.max(-1, Math.min(1, value));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }
    return bytes;
  }

  private static buildHeader(
    numChannels: number,
    sampleRate: number,
    dataLength: number,
  ): Uint8Array<ArrayBuffer> {
    const header = new Uint8Array(new ArrayBuffer(44));
    const view = new DataView(header.buffer);
    const bytesPerSample = 2;
    const totalLength = 44 + dataLength;

    WavStreamWriter.writeString(view, 0, "RIFF");
    view.setUint32(4, totalLength - 8, true);
    WavStreamWriter.writeString(view, 8, "WAVE");
    WavStreamWriter.writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, 16, true);
    WavStreamWriter.writeString(view, 36, "data");
    view.setUint32(40, dataLength, true);
    return header;
  }

  private static writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}

/**
 * Streaming 16-bit WAV encoder for a take whose PCM is already chunked.
 *
 * Thin wrapper over {@link WavStreamWriter} kept for the capture paths (and
 * existing callers) that hand over the whole chunk layout at once; the writer
 * is what the recording engine uses, so a take is never rehydrated just to be
 * encoded.
 *
 * Only 16-bit PCM is implemented because that is the recording take format
 * (`wav-16`); 24/32-bit float encoding stays on `WavEncoder`, where the
 * mastering/export paths already produce contiguous data.
 */
export class WavStreamEncoder {
  /**
   * @param channelChunks one entry per channel, each an ordered list of chunks
   *   whose concatenation is that channel's PCM.
   */
  static encodeMultiChannel(
    channelChunks: Float32Array[][],
    format: WavFormat,
    sampleRate: number,
  ): Blob {
    if (format !== "wav-16") {
      // Fall back rather than silently encoding the wrong bit depth.
      return WavEncoder.encodeMultiChannel(
        channelChunks.map((chunks) => WavStreamEncoder.concat(chunks)),
        format,
        sampleRate,
      );
    }

    const numChannels = channelChunks.length;
    const frameCounts = channelChunks.map((chunks) =>
      WavStreamEncoder.frameCount(chunks),
    );
    WavStreamEncoder.validate(frameCounts);
    if (!WavStreamEncoder.isChunkAligned(channelChunks)) {
      // Chunk boundaries differ per channel, so a slice-by-slice interleave
      // could not be proven identical to the joined encoding. Fall back to the
      // contiguous encoder (still correct, just not chunked).
      return WavEncoder.encodeMultiChannel(
        channelChunks.map((chunks) => WavStreamEncoder.concat(chunks)),
        format,
        sampleRate,
      );
    }

    const writer = new WavStreamWriter({
      channelCount: numChannels,
      sampleRate,
    });
    for (let index = 0; index < channelChunks[0].length; index++) {
      writer.push(channelChunks.map((chunks) => [chunks[index]]));
    }
    return writer.end().blob;
  }

  private static frameCount(chunks: Float32Array[]): number {
    return chunks.reduce((sum, chunk) => sum + (chunk?.length ?? 0), 0);
  }

  /** True when every channel has the same chunk layout (the buffer's case). */
  private static isChunkAligned(channelChunks: Float32Array[][]): boolean {
    const reference = channelChunks[0];
    return channelChunks.every(
      (chunks) =>
        chunks.length === reference.length &&
        chunks.every(
          (chunk, index) => chunk.length === reference[index].length,
        ),
    );
  }

  private static concat(chunks: Float32Array[]): Float32Array {
    const total = WavStreamEncoder.frameCount(chunks);
    const joined = new Float32Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.length;
    }
    return joined;
  }

  /** Same contract (and messages) as `WavEncoder.validateChannels`. */
  private static validate(frameCounts: number[]): void {
    if (frameCounts.length === 0 || frameCounts.some((count) => count === 0)) {
      throw new Error("Cannot encode an empty WAV channel set");
    }
    const frameCount = frameCounts[0];
    if (frameCounts.some((count) => count !== frameCount)) {
      throw new Error("WAV channels must contain the same number of frames");
    }
  }
}
