import { resampleToRate } from "./audio-resample.util";

function buffer(sampleRate: number): AudioBuffer {
  return {
    numberOfChannels: 2,
    length: sampleRate,
    sampleRate,
    duration: 1,
  } as unknown as AudioBuffer;
}

describe("resampleToRate", () => {
  afterEach(() => {
    delete (globalThis as { OfflineAudioContext?: unknown })
      .OfflineAudioContext;
  });

  it("returns the original buffer when the rates already match", async () => {
    const source = buffer(48000);
    const result = await resampleToRate(
      { sampleRate: 48000 } as BaseAudioContext,
      source,
      48000,
    );
    expect(result).toBe(source);
  });

  it("renders at the engine rate when the import differs", async () => {
    const rendered = buffer(48000);
    const start = jest.fn();
    let renderedRate = 0;
    let renderedFrames = 0;

    class FakeOffline {
      readonly destination = {};
      constructor(
        readonly channels: number,
        readonly frames: number,
        readonly sampleRate: number,
      ) {
        renderedRate = sampleRate;
        renderedFrames = frames;
      }
      createBufferSource() {
        return { buffer: null, connect: jest.fn(), start };
      }
      startRendering() {
        return Promise.resolve(rendered);
      }
    }
    (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext =
      FakeOffline;

    const source = buffer(44100);
    const result = await resampleToRate(
      { sampleRate: 48000 } as BaseAudioContext,
      source,
      48000,
    );

    expect(result).toBe(rendered);
    expect(renderedRate).toBe(48000);
    expect(renderedFrames).toBe(48000);
    expect(start).toHaveBeenCalled();
  });

  it("keeps the source when the host cannot render offline", async () => {
    const source = buffer(44100);
    const result = await resampleToRate(
      { sampleRate: 48000 } as BaseAudioContext,
      source,
      48000,
    );
    expect(result).toBe(source);
  });
});
