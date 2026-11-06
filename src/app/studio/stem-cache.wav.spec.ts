import { decodeWav, encodeWav } from "./stem-cache.wav";

function makeBuffer(channels: number[][], sampleRate = 44100): AudioBuffer {
  const buffer = new AudioBuffer({
    length: channels[0].length,
    sampleRate,
    numberOfChannels: channels.length,
  });
  channels.forEach((samples, channel) => {
    buffer.getChannelData(channel).set(samples);
  });
  return buffer;
}

describe("stem cache WAV storage", () => {
  it("round-trips length, rate, channels and samples within 16-bit precision", () => {
    const source = makeBuffer([
      [0, 0.5, -0.5, 1, -1],
      [0.25, -0.25, 0.75, -0.75, 0],
    ]);

    const decoded = decodeWav(encodeWav(source));

    expect(decoded.length).toBe(5);
    expect(decoded.sampleRate).toBe(44100);
    expect(decoded.numberOfChannels).toBe(2);
    expect(decoded.getChannelData(0)[1]).toBeCloseTo(0.5, 3);
    expect(decoded.getChannelData(0)[2]).toBeCloseTo(-0.5, 3);
    expect(decoded.getChannelData(1)[0]).toBeCloseTo(0.25, 3);
    expect(decoded.getChannelData(1)[2]).toBeCloseTo(0.75, 3);
  });

  it("keeps the source sample rate instead of assuming 44.1 kHz", () => {
    const decoded = decodeWav(encodeWav(makeBuffer([[0.1, 0.2]], 48000)));

    expect(decoded.sampleRate).toBe(48000);
  });

  it("rejects bytes that are not a supported WAV", () => {
    expect(() => decodeWav(new ArrayBuffer(8))).toThrow("Not a WAV file");
  });
});
