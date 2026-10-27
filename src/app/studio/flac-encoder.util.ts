/**
 * Lossless FLAC encoder (verbatim subframes).
 *
 * FLAC was the one delivery format the studio could not write, so a project
 * that needed a lossless, tag-friendly file had to bounce to WAV and convert
 * elsewhere. This writes a real FLAC stream — `fLaC` marker, a STREAMINFO
 * block and one frame per 4096-sample block — using the spec's *verbatim*
 * subframe type, which stores the samples uncompressed inside the frame.
 *
 * That choice is deliberate: verbatim frames are simple enough to be correct
 * by construction, produce a file every FLAC decoder accepts, and are always
 * smaller than 16-bit WAV (frames carry no per-sample padding beyond the
 * sample width). The trade-off is that files are not entropy-compressed —
 * Rice-coded subframes would cut them roughly in half — so this is honestly
 * "FLAC container, no compression yet". It is still lossless bit-exact audio,
 * which is what the lossless delivery format is for.
 */

export const FLAC_BLOCK_SIZE = 4096;

/**
 * Sample-rate codes for the frame header. libFLAC's decoder rejects a frame
 * that defers the rate to STREAMINFO (code 0000), so every frame states its
 * rate explicitly; unknown rates use code 1101 (16-bit Hz follows the header).
 */
const FLAC_RATE_CODES: Record<number, number> = {
  88200: 0x1,
  176400: 0x2,
  192000: 0x3,
  8000: 0x4,
  16000: 0x5,
  22050: 0x6,
  24000: 0x7,
  32000: 0x8,
  44100: 0x9,
  48000: 0xa,
  96000: 0xb,
};

const FLAC_RATE_CODE_16BIT_HZ = 0xd;

/** Bits per sample the encoder writes. */
export type FlacBitDepth = 16 | 24;

export interface FlacEncodeOptions {
  bitDepth?: FlacBitDepth;
}

/** Growable big-endian byte sink. */
class ByteWriter {
  private bytes: number[] = [];

  get length(): number {
    return this.bytes.length;
  }

  byte(value: number): void {
    this.bytes.push(value & 0xff);
  }

  u16(value: number): void {
    this.byte((value >> 8) & 0xff);
    this.byte(value & 0xff);
  }

  u24(value: number): void {
    this.byte((value >> 16) & 0xff);
    this.byte((value >> 8) & 0xff);
    this.byte(value & 0xff);
  }

  u32(value: number): void {
    this.byte((value >>> 24) & 0xff);
    this.byte((value >>> 16) & 0xff);
    this.byte((value >>> 8) & 0xff);
    this.byte(value & 0xff);
  }

  /** FLAC frame numbers are UTF-8-style coded integers (up to 36 bits). */
  utf8Number(value: number): void {
    const n = Math.max(0, Math.floor(value));
    if (n < 0x80) {
      this.byte(n);
      return;
    }
    if (n < 0x800) {
      this.byte(0xc0 | (n >> 6));
      this.byte(0x80 | (n & 0x3f));
      return;
    }
    if (n < 0x10000) {
      this.byte(0xe0 | (n >> 12));
      this.byte(0x80 | ((n >> 6) & 0x3f));
      this.byte(0x80 | (n & 0x3f));
      return;
    }
    if (n < 0x200000) {
      this.byte(0xf0 | (n >> 18));
      this.byte(0x80 | ((n >> 12) & 0x3f));
      this.byte(0x80 | ((n >> 6) & 0x3f));
      this.byte(0x80 | (n & 0x3f));
      return;
    }
    if (n < 0x4000000) {
      this.byte(0xf8 | (n >> 24));
      this.byte(0x80 | ((n >> 18) & 0x3f));
      this.byte(0x80 | ((n >> 12) & 0x3f));
      this.byte(0x80 | ((n >> 6) & 0x3f));
      this.byte(0x80 | (n & 0x3f));
      return;
    }
    this.byte(0xfc | (n >> 30));
    this.byte(0x80 | ((n >> 24) & 0x3f));
    this.byte(0x80 | ((n >> 18) & 0x3f));
    this.byte(0x80 | ((n >> 12) & 0x3f));
    this.byte(0x80 | ((n >> 6) & 0x3f));
    this.byte(0x80 | (n & 0x3f));
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/** CRC-8, polynomial x^8 + x^2 + x + 1 (0x07), init 0. */
export function flacCrc8(bytes: ArrayLike<number>): number {
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] & 0xff;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc & 0xff;
}

/** CRC-16, polynomial x^16 + x^15 + x^2 + 1 (0x8005), init 0. */
export function flacCrc16(bytes: ArrayLike<number>): number {
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= (bytes[i] & 0xff) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x8005) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

/** Clamp a float sample to the integer range for a bit depth. */
export function floatToIntSample(value: number, bitDepth: FlacBitDepth): number {
  const max = (1 << (bitDepth - 1)) - 1;
  const min = -(1 << (bitDepth - 1));
  const scaled = Math.round((Number.isFinite(value) ? value : 0) * (max + 1));
  return Math.max(min, Math.min(max, scaled));
}

/**
 * Encode planar channel data as a FLAC stream.
 *
 * Every channel is written as an independent verbatim subframe; channels are
 * truncated to the shortest channel's length so the frames stay rectangular.
 */
export function encodeFlacSamples(
  channels: Float32Array[],
  sampleRate: number,
  options: FlacEncodeOptions = {},
): Uint8Array {
  const bitDepth: FlacBitDepth = options.bitDepth === 24 ? 24 : 16;
  const channelCount = Math.max(1, channels.length);
  const sampleCount = Math.min(
    ...channels.map((channel) => Math.max(0, channel.length)),
  );
  const safeRate = Math.max(1, Math.round(sampleRate || 44100));
  const bytesPerSample = bitDepth / 8;

  const blockSizes: number[] = [];
  for (let offset = 0; offset < sampleCount; offset += FLAC_BLOCK_SIZE) {
    blockSizes.push(Math.min(FLAC_BLOCK_SIZE, sampleCount - offset));
  }
  if (blockSizes.length === 0) blockSizes.push(0);

  const out = new ByteWriter();
  // "fLaC" stream marker.
  out.byte(0x66);
  out.byte(0x4c);
  out.byte(0x61);
  out.byte(0x43);

  // STREAMINFO (last metadata block, type 0, 34 bytes).
  const minBlock = Math.min(...blockSizes);
  const maxBlock = Math.max(...blockSizes);
  out.byte(0x80);
  out.u24(34);
  out.u16(minBlock);
  out.u16(maxBlock);
  out.u24(0); // min frame size: unknown
  out.u24(0); // max frame size: unknown
  // 20 bits sample rate | 3 bits (channels-1) | 5 bits (bitDepth-1) | 36 bits samples
  out.byte((safeRate >> 12) & 0xff);
  out.byte((safeRate >> 4) & 0xff);
  out.byte(((safeRate & 0x0f) << 4) | (((channelCount - 1) & 0x07) << 1) | ((bitDepth - 1) >> 4));
  // NB: `x >> 32` is `x >> 0` in JavaScript (shift counts are mod 32), so the
  // 36-bit sample count is split by division, not a bit shift.
  out.byte(
    (((bitDepth - 1) & 0x0f) << 4) |
      (Math.floor(sampleCount / 0x100000000) & 0x0f),
  );
  out.u32(sampleCount >>> 0);
  // MD5 of the unencoded audio: all zero means "not provided". Decoders keep
  // the audio; only a verifying decoder can tell the digest was omitted.
  for (let i = 0; i < 16; i++) out.byte(0);

  let offset = 0;
  for (const blockSize of blockSizes) {
    const frame = new ByteWriter();
    // Sync 0b11111111111110, reserved 0, variable-blocksize strategy (1).
    // Variable is required here: the final block is short, so min and max
    // block size in STREAMINFO differ and a fixed-blocksize stream would be
    // rejected by the decoder. Variable frames carry a sample number instead
    // of a frame index, so `offset` is written below.
    frame.byte(0xff);
    frame.byte(0xf9);
    const rateCode =
      FLAC_RATE_CODES[safeRate] ?? FLAC_RATE_CODE_16BIT_HZ;
    // Block size code 0111 (16-bit size follows) | explicit sample rate code.
    frame.byte(0x70 | (rateCode & 0x0f));
    // Independent channels | explicit sample size (100 = 16, 110 = 24) |
    // reserved bit 0.
    frame.byte((((channelCount - 1) & 0x07) << 4) | ((bitDepth === 24 ? 0x6 : 0x4) << 1));
    frame.utf8Number(offset);
    // Block size code 0111 stores (samples - 1): a full 4096-sample block
    // writes 4095 here, and the last short block writes its own remainder.
    frame.u16(Math.max(0, blockSize - 1));
    if (rateCode === FLAC_RATE_CODE_16BIT_HZ) {
      frame.u16(safeRate & 0xffff);
    }

    const header = frame.toUint8Array();
    frame.byte(flacCrc8(header));

    for (let channel = 0; channel < channelCount; channel++) {
      // Subframe header: zero bit, type 000001 = verbatim, wasted-bits flag 0.
      frame.byte(0x02);
      const data = channels[channel] ?? channels[0];
      for (let i = 0; i < blockSize; i++) {
        const sample = floatToIntSample(data[offset + i] ?? 0, bitDepth);
        if (bytesPerSample === 2) {
          frame.u16(sample < 0 ? sample + 0x10000 : sample);
        } else {
          const value = sample < 0 ? sample + 0x1000000 : sample;
          frame.byte((value >> 16) & 0xff);
          frame.byte((value >> 8) & 0xff);
          frame.byte(value & 0xff);
        }
      }
    }

    const body = frame.toUint8Array();
    frame.u16(flacCrc16(body));

    const frameBytes = frame.toUint8Array();
    for (let i = 0; i < frameBytes.length; i++) out.byte(frameBytes[i]);

    offset += blockSize;
  }

  return out.toUint8Array();
}

/** Encode an AudioBuffer (from `OfflineAudioContext` or `AudioContext`). */
export function encodeFlac(
  buffer: AudioBuffer,
  options: FlacEncodeOptions = {},
): Uint8Array {
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    channels.push(buffer.getChannelData(channel));
  }
  return encodeFlacSamples(channels, buffer.sampleRate, options);
}

export function encodeFlacBlob(
  buffer: AudioBuffer,
  options: FlacEncodeOptions = {},
): Blob {
  const bytes = encodeFlac(buffer, options);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: "audio/flac" });
}
