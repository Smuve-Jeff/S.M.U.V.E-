import {
  findClickOnset,
  loopbackRoundTripMs,
} from "./loopback-latency.util";

function silent(frames: number): Float32Array {
  return new Float32Array(frames);
}

describe("findClickOnset", () => {
  it("finds the first sample of a click after a noise bed", () => {
    const channel = silent(1000);
    for (let i = 0; i < 400; i++) channel[i] = 0.002;
    channel[402] = 0.9;
    channel[403] = 0.7;
    channel[404] = 0.3;

    expect(findClickOnset([channel])).toBe(402);
  });

  it("uses the loudest channel so a mic on one side still registers", () => {
    const left = silent(600);
    const right = silent(600);
    right[320] = 0.8;
    right[321] = 0.6;

    expect(findClickOnset([left, right])).toBe(320);
  });

  it("returns null for silence and for sub-threshold noise", () => {
    expect(findClickOnset([silent(480)])).toBeNull();
    const noise = silent(480).fill(0.005);
    expect(findClickOnset([noise])).toBeNull();
    expect(findClickOnset([])).toBeNull();
  });
});

describe("loopbackRoundTripMs", () => {
  it("maps the onset frame onto the audio clock", () => {
    // Capture began at 5.0 s; the click at frame 9600 (48 kHz) arrives 0.2 s
    // later. It was scheduled for 5.1 s → 100 ms round trip.
    expect(
      loopbackRoundTripMs({
        clickScheduledAt: 5.1,
        captureStartedAt: 5,
        onsetFrame: 9600,
        sampleRate: 48000,
      }),
    ).toBe(100);
  });

  it("clamps impossible negative results to zero", () => {
    expect(
      loopbackRoundTripMs({
        clickScheduledAt: 10,
        captureStartedAt: 9,
        onsetFrame: 0,
        sampleRate: 48000,
      }),
    ).toBe(0);
  });

  it("returns zero without a usable sample rate", () => {
    expect(
      loopbackRoundTripMs({
        clickScheduledAt: 1,
        captureStartedAt: 1,
        onsetFrame: 100,
        sampleRate: 0,
      }),
    ).toBe(0);
  });
});
