import {
  FLAC_BLOCK_SIZE,
  encodeFlacSamples,
  flacCrc8,
  flacCrc16,
  floatToIntSample,
} from "./flac-encoder.util";

/** Parse the STREAMINFO block plus frame headers of an encoded stream. */
function parseFlac(bytes: Uint8Array) {
  const marker = String.fromCharCode(...bytes.slice(0, 4));
  const lastBlock = (bytes[4] & 0x80) !== 0;
  const blockType = bytes[4] & 0x7f;
  const length = (bytes[5] << 16) | (bytes[6] << 8) | bytes[7];
  const info = bytes.slice(8, 8 + length);
  const read = (offset: number, count: number) => {
    let value = 0;
    for (let i = 0; i < count; i++) value = value * 256 + info[offset + i];
    return value;
  };
  const minBlock = read(0, 2);
  const maxBlock = read(2, 2);
  const sampleRate =
    (info[10] << 12) | (info[11] << 4) | (info[12] >> 4);
  const channels = ((info[12] >> 1) & 0x07) + 1;
  const bitDepth = (((info[12] & 0x01) << 4) | (info[13] >> 4)) + 1;
  const totalSamples =
    (info[13] & 0x0f) * 2 ** 32 +
    ((info[14] << 24) >>> 0) +
    (info[15] << 16) +
    (info[16] << 8) +
    info[17];
  return {
    marker,
    lastBlock,
    blockType,
    length,
    minBlock,
    maxBlock,
    sampleRate,
    channels,
    bitDepth,
    totalSamples,
    frameOffset: 8 + length,
  };
}

describe("FLAC encoder", () => {
  const rate = 44100;
  const channels = [
    Float32Array.from({ length: 5000 }, (_, i) => Math.sin(i / 20) * 0.5),
    Float32Array.from({ length: 5000 }, (_, i) => Math.cos(i / 15) * 0.4),
  ];

  it("writes a valid stream marker and STREAMINFO", () => {
    const bytes = encodeFlacSamples(channels, rate);
    const info = parseFlac(bytes);

    expect(info.marker).toBe("fLaC");
    expect(info.lastBlock).toBe(true);
    expect(info.blockType).toBe(0);
    expect(info.length).toBe(34);
    expect(info.sampleRate).toBe(rate);
    expect(info.channels).toBe(2);
    expect(info.bitDepth).toBe(16);
    expect(info.totalSamples).toBe(5000);
    expect(info.maxBlock).toBe(FLAC_BLOCK_SIZE);
    expect(info.minBlock).toBe(5000 - FLAC_BLOCK_SIZE);
  });

  it("starts each frame on a valid sync code with matching CRCs", () => {
    const bytes = encodeFlacSamples(channels, rate);
    const { frameOffset } = parseFlac(bytes);

    expect(bytes[frameOffset]).toBe(0xff);
    // 1111100x: 14-bit sync, reserved 0, variable-blocking strategy.
    expect(bytes[frameOffset + 1]).toBe(0xf9);

    // Header: sync(2) + 2 field bytes + coded sample number + 2 block-size
    // bytes, then CRC-8.
    const headerLength = 2 + 2 + 1 + 2;
    const header = bytes.slice(frameOffset, frameOffset + headerLength);
    expect(bytes[frameOffset + headerLength]).toBe(flacCrc8(header));

    // The whole frame (header through its CRC-16) must verify.
    // The first frame holds a full block; the remaining samples follow in a
    // second, shorter frame.
    // header + CRC-8 + one verbatim subframe header per channel + samples,
    // then the frame's CRC-16.
    const frameLength =
      headerLength +
      1 +
      channels.length +
      FLAC_BLOCK_SIZE * 2 * channels.length +
      2;
    const body = bytes.slice(frameOffset, frameOffset + frameLength - 2);
    const stored = (bytes[frameOffset + frameLength - 2] << 8) | bytes[frameOffset + frameLength - 1];
    expect(stored).toBe(flacCrc16(body));
    // A short second frame carries the remaining 904 samples.
    expect(bytes.length).toBeGreaterThan(frameOffset + frameLength);
  });

  it("round-trips samples through verbatim subframes", () => {
    const bytes = encodeFlacSamples(channels, rate);
    const { frameOffset } = parseFlac(bytes);
    // Header (7 bytes) + CRC-8, then the first subframe.
    let cursor = frameOffset + 8;
    for (let channel = 0; channel < 2; channel++) {
      // Verbatim subframe header: zero bit, type 000001, no wasted bits.
      expect(bytes[cursor]).toBe(0x02);
      cursor += 1;
      for (let i = 0; i < 4096; i++) {
        const raw = (bytes[cursor] << 8) | bytes[cursor + 1];
        const signed = raw >= 0x8000 ? raw - 0x10000 : raw;
        expect(signed).toBe(floatToIntSample(channels[channel][i], 16));
        cursor += 2;
      }
    }
  });

  it("states the sample rate explicitly (libFLAC rejects the deferred code)", () => {
    const bytes = encodeFlacSamples(channels, 44100);
    const { frameOffset } = parseFlac(bytes);
    // Block size code 0111 | sample rate code 1001 (44.1 kHz).
    expect(bytes[frameOffset + 2]).toBe(0x79);
    // Independent stereo | sample size code 100 (16-bit) | reserved 0.
    expect(bytes[frameOffset + 3]).toBe(0x18);
  });

  it("falls back to the 16-bit Hz field for an uncommon rate", () => {
    const bytes = encodeFlacSamples(channels, 37800);
    const { frameOffset } = parseFlac(bytes);
    // Block size code 0111 | sample rate code 1101 (16-bit Hz follows).
    expect(bytes[frameOffset + 2]).toBe(0x7d);
    // After sync(2) + fields(2) + sample number(1) comes the block size, then
    // the rate.
    const blockSizeField = (bytes[frameOffset + 5] << 8) | bytes[frameOffset + 6];
    expect(blockSizeField).toBe(FLAC_BLOCK_SIZE - 1);
    expect((bytes[frameOffset + 7] << 8) | bytes[frameOffset + 8]).toBe(37800);
  });

  it("writes 24-bit samples when asked", () => {
    const bytes = encodeFlacSamples(channels, rate, { bitDepth: 24 });
    const info = parseFlac(bytes);
    expect(info.bitDepth).toBe(24);
    // 3 bytes per sample instead of 2.
    expect(bytes.length).toBeGreaterThan(
      encodeFlacSamples(channels, rate).length * 1.4,
    );
  });

  it("handles a mono buffer and a single short block", () => {
    const mono = [Float32Array.from({ length: 10 }, () => 0.25)];
    const bytes = encodeFlacSamples(mono, 48000);
    const info = parseFlac(bytes);
    expect(info.channels).toBe(1);
    expect(info.totalSamples).toBe(10);
    expect(info.minBlock).toBe(10);
    expect(info.sampleRate).toBe(48000);
  });

  it("clamps out-of-range floats instead of wrapping", () => {
    expect(floatToIntSample(2, 16)).toBe(32767);
    expect(floatToIntSample(-2, 16)).toBe(-32768);
    expect(floatToIntSample(Number.NaN, 16)).toBe(0);
  });
});
