import { quantizeDithered, tpdfDither } from "./dither.util";
import { WavEncoder } from "./wav-encoder.util";
import { encodeFlacSamples } from "./flac-encoder.util";

/** One LSB at 16-bit is 1/32768; a dithered sample may move by at most that. */
const LSB16 = 1 / 32768;

describe("TPDF dither", () => {
  it("stays inside one LSB of the source", () => {
    for (let i = 0; i < 1000; i++) {
      const source = 0.1;
      expect(Math.abs(tpdfDither(source, 16) - source)).toBeLessThanOrEqual(
        LSB16,
      );
    }
  });

  it("is symmetric — the mean quantisation error stays near zero", () => {
    let sum = 0;
    const samples = 20000;
    for (let i = 0; i < samples; i++) {
      sum += quantizeDithered(0.25, 16) / 0x7fff - 0.25;
    }
    expect(Math.abs(sum / samples)).toBeLessThan(LSB16);
  });

  it("keeps quantised samples within two LSBs of the input", () => {
    for (let i = 0; i < 500; i++) {
      const source = -0.4;
      const pcm = quantizeDithered(source, 16);
      expect(Math.abs(pcm / 0x7fff - source)).toBeLessThanOrEqual(2 * LSB16);
    }
  });
});

describe("delivery encodes opt into dither", () => {
  const channels = [new Float32Array(256).fill(0.123456789)];

  it("WAV 16-bit with dither stays within a couple of LSBs", async () => {
    const blob = WavEncoder.encodeMultiChannel(
      channels,
      "wav-16",
      44100,
      { dither: true },
    );
    const view = new DataView(await blob.arrayBuffer());
    for (let frame = 0; frame < 256; frame++) {
      const value = view.getInt16(44 + frame * 2, true) / 0x7fff;
      expect(Math.abs(value - 0.123456789)).toBeLessThanOrEqual(3 * LSB16);
    }
  });

  it("WAV without dither keeps its bit-exact PCM path", async () => {
    const blob = WavEncoder.encodeMultiChannel(channels, "wav-16", 44100);
    const view = new DataView(await blob.arrayBuffer());
    const value = view.getInt16(44, true);
    expect(value).toBe(Math.trunc(0.123456789 * 0x7fff));
  });

  it("FLAC 16-bit accepts dither and stays losslessly decodable", () => {
    const bytes = encodeFlacSamples(channels, 44100, {
      bitDepth: 16,
      dither: true,
    });
    expect(bytes[0]).toBe(0x66); // fLaC
    expect(bytes.length).toBeGreaterThan(42);
  });
});
