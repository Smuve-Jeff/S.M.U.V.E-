import { WavEncoder, type WavFormat } from "./wav-encoder.util";

/**
 * Streaming 16-bit WAV encoder for chunked PCM.
 *
 * Why this exists: `WavEncoder.encodeMultiChannel()` needs two *contiguous*
 * channel arrays, so the recording engine had to `joinChannels()` a whole take
 * into two `Float32Array`s and then allocate one more buffer of the encoded
 * size — roughly 2× the take in memory at the instant the artist presses stop
 * (a 60-minute 48 kHz stereo take wants ~700 MB). This encoder takes the same
 * PCM while it is still chunked: it writes the header once and turns each chunk
 * into its own part of the Blob, so the peak is one chunk instead of the whole
 * file.
 *
 * Output is byte-identical to `WavEncoder.encodeMultiChannel(joined, …)` for the
 * same samples, including the 16-bit conversion's clamp/scale and
 * `DataView.setInt16` truncation — {@link WavStreamEncoder.encodeMultiChannel}
 * is asserted against it in the spec, so the two encoders cannot drift.
 *
 * Only 16-bit PCM is implemented because that is the recording engine's take
 * format (`wav-16`); 24/32-bit float encoding stays on `WavEncoder`, where the
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
      WavStreamEncoder.frameCount(chunks)
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
    const numFrames = frameCounts[0];

    const dataLength = numFrames * numChannels * 2;
    const header = WavStreamEncoder.buildHeader(
      numChannels,
      sampleRate,
      dataLength,
    );

    // One Uint8Array per chunk keeps the whole take out of a single allocation.
    const parts: BlobPart[] = [header];
    for (let index = 0; index < channelChunks[0].length; index++) {
      const frames = channelChunks[0][index].length;
      if (frames === 0) continue;
      parts.push(WavStreamEncoder.encodeSlice(channelChunks, index, frames));
    }

    return new Blob(parts, { type: "audio/wav" });
  }

  private static encodeSlice(
    channelChunks: Float32Array[][],
    index: number,
    frames: number,
  ): Uint8Array<ArrayBuffer> {
    const numChannels = channelChunks.length;
    // Explicit ArrayBuffer (not the ArrayBufferLike of `new Uint8Array(n)`) so
    // the result is a valid BlobPart without a cast.
    const bytes = new Uint8Array(new ArrayBuffer(frames * numChannels * 2));
    const view = new DataView(bytes.buffer);
    let offset = 0;
    for (let frame = 0; frame < frames; frame++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const value = channelChunks[channel][index][frame];
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

    WavStreamEncoder.writeString(view, 0, "RIFF");
    view.setUint32(4, totalLength - 8, true);
    WavStreamEncoder.writeString(view, 8, "WAVE");
    WavStreamEncoder.writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, 16, true);
    WavStreamEncoder.writeString(view, 36, "data");
    view.setUint32(40, dataLength, true);
    return header;
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
          (chunk, index) => chunk.length === reference[index].length
        )
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

  private static writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}
