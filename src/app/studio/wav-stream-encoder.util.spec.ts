import { WavEncoder } from "./wav-encoder.util";
import {
  WavStreamEncoder,
  WavStreamWriter,
  peakDbFs,
} from "./wav-stream-encoder.util";

/** jsdom's Blob lacks .arrayBuffer() in this setup — read via FileReader. */
function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

const concat = (chunks: Float32Array[]): Float32Array => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const joined = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
};

/** Bytes of the reference (contiguous) encoder for the same chunked PCM. */
const referenceBytes = async (
  channelChunks: Float32Array[][],
  sampleRate: number,
): Promise<Uint8Array> => {
  const blob = WavEncoder.encodeMultiChannel(
    channelChunks.map(concat),
    "wav-16",
    sampleRate,
  );
  return readBlobBytes(blob);
};

describe("WavStreamEncoder", () => {
  it("is byte-identical to the contiguous encoder for a single chunk per channel", async () => {
    const left = Float32Array.from([0, 0.5, -0.5, 1, -1, 2, -2, 0.25]);
    const right = Float32Array.from([0, -0.5, 0.5, -1, 1, -2, 2, -0.25]);

    const streamed = await readBlobBytes(
      WavStreamEncoder.encodeMultiChannel([[left], [right]], "wav-16", 48000),
    );

    expect(Array.from(streamed)).toEqual(
      Array.from(await referenceBytes([[left], [right]], 48000)),
    );
  });

  it("is byte-identical across ragged chunk boundaries", async () => {
    // Irregular chunk sizes, including an odd frame count, are exactly what the
    // capture worklet produces (50 ms chunks plus a shorter final flush).
    const left = [
      Float32Array.from([0, 0.1, -0.2]),
      Float32Array.from([0.3, -0.4, 0.5, -0.6, 0.7]),
      Float32Array.from([-0.8]),
      Float32Array.from([0.9, 1]),
    ];
    const right = [
      Float32Array.from([0, -0.1, 0.2]),
      Float32Array.from([-0.3, 0.4, -0.5, 0.6, -0.7]),
      Float32Array.from([0.8]),
      Float32Array.from([-0.9, -1]),
    ];

    const streamed = await readBlobBytes(
      WavStreamEncoder.encodeMultiChannel([left, right], "wav-16", 44100),
    );

    expect(Array.from(streamed)).toEqual(
      Array.from(await referenceBytes([left, right], 44100)),
    );
  });

  it("is byte-identical for a single (mono) channel", async () => {
    const mono = [Float32Array.from([0, 0.5]), Float32Array.from([-0.5, 1])];

    const streamed = await readBlobBytes(
      WavStreamEncoder.encodeMultiChannel([mono], "wav-16", 48000),
    );

    expect(Array.from(streamed)).toEqual(
      Array.from(await referenceBytes([mono], 48000)),
    );
  });

  it("writes a valid 16-bit PCM header for the whole take", async () => {
    const left = [new Float32Array(10), new Float32Array(6)];
    const right = [new Float32Array(10), new Float32Array(6)];

    const blob = WavStreamEncoder.encodeMultiChannel(
      [left, right],
      "wav-16",
      48000,
    );

    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(44 + 16 * 2 * 2);

    const bytes = await readBlobBytes(blob);
    const view = new DataView(bytes.buffer);
    const ascii = (offset: number, length: number) =>
      String.fromCharCode(...bytes.subarray(offset, offset + length));

    expect(ascii(0, 4)).toBe("RIFF");
    expect(ascii(8, 4)).toBe("WAVE");
    expect(ascii(12, 4)).toBe("fmt ");
    expect(ascii(36, 4)).toBe("data");
    expect(view.getUint32(4, true)).toBe(44 + 16 * 2 * 2 - 8);
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(2); // channels
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint32(28, true)).toBe(48000 * 2 * 2); // byte rate
    expect(view.getUint16(32, true)).toBe(4); // block align
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(view.getUint32(40, true)).toBe(16 * 2 * 2); // data length
  });

  it("rejects an empty take and mismatched channel lengths like the contiguous encoder", () => {
    expect(() =>
      WavStreamEncoder.encodeMultiChannel([[]], "wav-16", 48000),
    ).toThrow("Cannot encode an empty WAV channel set");

    expect(() =>
      WavStreamEncoder.encodeMultiChannel(
        [[new Float32Array(4)], [new Float32Array(6)]],
        "wav-16",
        48000,
      ),
    ).toThrow("WAV channels must contain the same number of frames");
  });

  it("delegates other bit depths to the contiguous encoder", async () => {
    const left = [Float32Array.from([0, 0.5, -0.5])];
    const right = [Float32Array.from([0, -0.5, 0.5])];

    const streamed = await readBlobBytes(
      WavStreamEncoder.encodeMultiChannel([left, right], "wav-32-float", 48000),
    );
    const reference = await readBlobBytes(
      WavEncoder.encodeMultiChannel(
        [concat(left), concat(right)],
        "wav-32-float",
        48000,
      ),
    );

    expect(Array.from(streamed)).toEqual(Array.from(reference));
  });

  it("falls back to the contiguous encoder when chunk layouts differ per channel", async () => {
    // Not a layout the capture buffer produces, but a streamed interleave
    // cannot be proven identical here, so the safe encoder must win.
    const left = [Float32Array.from([0, 0.5]), Float32Array.from([-0.5, 1])];
    const right = [Float32Array.from([0, -0.5, 0.5, -1])];

    const streamed = await readBlobBytes(
      WavStreamEncoder.encodeMultiChannel([left, right], "wav-16", 48000),
    );

    expect(Array.from(streamed)).toEqual(
      Array.from(await referenceBytes([left, right], 48000)),
    );
  });
});

describe("WavStreamWriter", () => {
  it("is byte-identical to the contiguous encoder when the take arrives in groups", async () => {
    // This is the recording path: a spilled group (two chunks) followed by the
    // resident window, pushed without ever joining the take.
    const groupA = [
      Float32Array.from([0, 0.1]),
      Float32Array.from([0.2, -0.3]),
    ];
    const groupB = [Float32Array.from([0.4, -0.5, 0.6])];
    const left = [...groupA, ...groupB];
    const right = left.map((chunk) => chunk.map((value) => -value));

    const writer = new WavStreamWriter({ channelCount: 2, sampleRate: 48000 });
    writer.push([groupA, groupA.map((chunk) => chunk.map((v) => -v))]);
    writer.push([groupB, groupB.map((chunk) => chunk.map((v) => -v))]);
    const { blob, stats } = writer.end();

    expect(stats.frames).toBe(7);
    expect(Array.from(await readBlobBytes(blob))).toEqual(
      Array.from(await referenceBytes([left, right], 48000)),
    );
  });

  it("measures each channel's peak while it writes", () => {
    const writer = new WavStreamWriter({ channelCount: 2, sampleRate: 48000 });
    writer.push([
      [Float32Array.from([0.5, -0.25])],
      [Float32Array.from([0.1, 0.1])],
    ]);
    writer.push([[Float32Array.from([0.125])], [Float32Array.from([-1])]]);

    const { stats } = writer.end();

    expect(stats.peakLeft).toBeCloseTo(0.5, 6);
    expect(stats.peakRight).toBe(1);
    // Same readout the comp view shows: floored at -60, rounded to 0.1 dB.
    expect(peakDbFs(stats.peakLeft)).toBe(-6);
    expect(peakDbFs(stats.peakRight)).toBe(0);
    expect(peakDbFs(0)).toBe(-60);
  });

  it("writes the header from the frames it actually received", async () => {
    const writer = new WavStreamWriter({ channelCount: 2, sampleRate: 44100 });
    writer.push([[new Float32Array(10)], [new Float32Array(10)]]);
    writer.push([[new Float32Array(6)], [new Float32Array(6)]]);
    writer.push([[new Float32Array(4)], [new Float32Array(4)]]);

    const { blob, stats } = writer.end();
    const view = new DataView((await readBlobBytes(blob)).buffer);

    expect(stats.frames).toBe(20);
    expect(blob.size).toBe(44 + 20 * 2 * 2);
    expect(view.getUint32(4, true)).toBe(44 + 20 * 2 * 2 - 8);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(40, true)).toBe(20 * 2 * 2);
  });

  it("mirrors the only channel as the right peak for a mono writer", () => {
    const writer = new WavStreamWriter({ channelCount: 1, sampleRate: 48000 });
    writer.push([[Float32Array.from([0.25])]]);

    const { stats } = writer.end();

    expect(stats.peakLeft).toBeCloseTo(0.25, 6);
    expect(stats.peakRight).toBeCloseTo(0.25, 6);
  });

  it("returns the same finished file twice so a retried save copies nothing", () => {
    const writer = new WavStreamWriter({ channelCount: 2, sampleRate: 48000 });
    writer.push([[Float32Array.from([0.5])], [Float32Array.from([0.5])]]);

    const first = writer.end();
    const second = writer.end();

    expect(second.blob).toBe(first.blob);
    expect(second.stats).toEqual(first.stats);
    expect(() =>
      writer.push([[new Float32Array(1)], [new Float32Array(1)]]),
    ).toThrow("Cannot push PCM after the WAV was finished");
  });

  it("rejects groups whose channels do not line up", () => {
    const writer = new WavStreamWriter({ channelCount: 2, sampleRate: 48000 });

    expect(() =>
      writer.push([
        [new Float32Array(2)],
        [new Float32Array(2), new Float32Array(2)],
      ]),
    ).toThrow("WAV channels must contain the same number of chunks per group");

    expect(() =>
      writer.push([[new Float32Array(2)], [new Float32Array(3)]]),
    ).toThrow("WAV channels must contain the same number of frames");

    expect(() => writer.push([[new Float32Array(2)]])).toThrow(
      "WAV channel count does not match the provided buffer",
    );
  });

  it("rejects a channel count that is not a channel set", () => {
    expect(
      () => new WavStreamWriter({ channelCount: 0, sampleRate: 48000 }),
    ).toThrow("Cannot encode an empty WAV channel set");
  });
});
