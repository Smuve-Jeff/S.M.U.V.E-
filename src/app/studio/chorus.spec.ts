import { Chorus } from "./chorus";

// MockAudioContext is installed globally by setup-jest.ts. Its factory methods
// are jest.fn()s, so `mock.results` gives us the very nodes the Chorus built —
// the only way to assert the modulation graph (the class keeps its nodes
// private) short of a real Web Audio renderer.

/** All nodes a class under test created through one factory method. */
function createdNodes(ctx: AudioContext, factory: keyof AudioContext): any[] {
  return (ctx[factory] as unknown as jest.Mock).mock.results.map(
    (r: jest.MockResult<any>) => r.value,
  );
}

describe("Chorus", () => {
  let ctx: AudioContext;
  let chorus: Chorus;

  beforeEach(() => {
    ctx = new AudioContext();
    chorus = new Chorus(ctx);
  });

  it("should expose input and output nodes", () => {
    expect(chorus.input).toBeTruthy();
    expect(chorus.output).toBeTruthy();
  });

  it("should start on the Python engine's defaults (1.2 Hz, 5 ms, 0.4 mix)", () => {
    expect(chorus.rate).toBe(1.2);
    expect(chorus.depthMs).toBe(5);
    expect(chorus.mix).toBe(0.4);
  });

  describe("modulation graph", () => {
    it("should build one delay line per channel so the effect is actually stereo", () => {
      expect(ctx.createChannelSplitter).toHaveBeenCalledWith(2);
      expect(ctx.createChannelMerger).toHaveBeenCalledWith(2);
      expect(ctx.createDelay).toHaveBeenCalledTimes(2);
      // Sized for base + max depth + headroom.
      expect(ctx.createDelay).toHaveBeenCalledWith(
        expect.closeTo(5 / 44100 + 0.02 + 0.001, 9),
      );
    });

    it("should sweep the engine's base..base+depth window", () => {
      const [delayLeft, delayRight] = createdNodes(ctx, "createDelay");
      const [depthLeft] = createdNodes(ctx, "createGain").slice(4);

      // Default depth is 5 ms, so the line centres at base + 2.5 ms and the LFO
      // swings 2.5 ms either side — a sweep of 0.11 ms to 5.11 ms.
      expect(depthLeft.gain.setTargetAtTime).toHaveBeenLastCalledWith(
        0.0025,
        0,
        0.01,
      );
      const centre = expect.closeTo(5 / 44100 + 0.0025, 9);
      expect(delayLeft.delayTime.setTargetAtTime).toHaveBeenLastCalledWith(
        centre,
        0,
        0.01,
      );
      expect(delayRight.delayTime.setTargetAtTime).toHaveBeenLastCalledWith(
        centre,
        0,
        0.01,
      );
    });

    it("keeps the sweep above zero even at full depth", () => {
      chorus.setDepthMs(Chorus.MAX_DEPTH_MS);
      const [delayLeft] = createdNodes(ctx, "createDelay");
      const [depthLeft] = createdNodes(ctx, "createGain").slice(4);

      const centre = delayLeft.delayTime.setTargetAtTime.mock.calls.at(-1)![0];
      const halfSwing = depthLeft.gain.setTargetAtTime.mock.calls.at(-1)![0];

      // Centring on the base instead of the midpoint would make the trough
      // negative, where Web Audio clamps it to 0 and flattens half the cycle.
      expect(centre - halfSwing).toBeCloseTo(5 / 44100, 9);
      expect(centre - halfSwing).toBeGreaterThan(0);
      expect(centre + halfSwing).toBeCloseTo(5 / 44100 + 0.02, 9);
    });

    it("should route each channel through its own delay line into the merger", () => {
      const splitter = createdNodes(ctx, "createChannelSplitter")[0];
      const merger = createdNodes(ctx, "createChannelMerger")[0];
      const [delayLeft, delayRight] = createdNodes(ctx, "createDelay");

      expect(splitter.connect).toHaveBeenCalledWith(delayLeft, 0);
      expect(splitter.connect).toHaveBeenCalledWith(delayRight, 1);
      expect(delayLeft.connect).toHaveBeenCalledWith(merger, 0, 0);
      expect(delayRight.connect).toHaveBeenCalledWith(merger, 0, 1);
    });

    it("should drive each delay time from its own LFO through a depth gain", () => {
      const [depthLeft, depthRight] = createdNodes(ctx, "createGain").slice(4);
      const [delayLeft, delayRight] = createdNodes(ctx, "createDelay");
      const [lfoLeft, lfoRight] = createdNodes(ctx, "createOscillator");

      expect(lfoLeft.type).toBe("sine");
      expect(lfoRight.type).toBe("sine");
      expect(lfoLeft.connect).toHaveBeenCalledWith(depthLeft);
      expect(lfoRight.connect).toHaveBeenCalledWith(depthRight);
      expect(depthLeft.connect).toHaveBeenCalledWith(delayLeft.delayTime);
      expect(depthRight.connect).toHaveBeenCalledWith(delayRight.delayTime);
    });

    it("should offset the right LFO by a quarter period for stereo width", () => {
      const [lfoLeft, lfoRight] = createdNodes(ctx, "createOscillator");

      expect(lfoLeft.start).toHaveBeenCalled();
      expect(lfoRight.start).toHaveBeenCalledTimes(1);
      expect(lfoRight.start.mock.calls[0][0]).toBeCloseTo(1 / (4 * 1.2), 6);
    });
  });

  describe("parameters", () => {
    it("should apply rate to both LFOs", () => {
      chorus.setRate(3.5);
      const [lfoLeft, lfoRight] = createdNodes(ctx, "createOscillator");

      expect(chorus.rate).toBe(3.5);
      expect(lfoLeft.frequency.setTargetAtTime).toHaveBeenCalledWith(3.5, 0, 0.01);
      expect(lfoRight.frequency.setTargetAtTime).toHaveBeenCalledWith(3.5, 0, 0.01);
    });

    it("should clamp rate to the audible modulation range", () => {
      chorus.setRate(999);
      expect(chorus.rate).toBe(Chorus.MAX_RATE_HZ);
      chorus.setRate(0);
      expect(chorus.rate).toBe(Chorus.MIN_RATE_HZ);
    });

    it("should convert depth to the half-swing the LFO spans", () => {
      chorus.setDepthMs(10);
      const [depthLeft, depthRight] = createdNodes(ctx, "createGain").slice(4);

      expect(chorus.depthMs).toBe(10);
      // A sine swings +/-1 around the base, so 10 ms of swing needs a 5 ms gain.
      expect(depthLeft.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.005, 0, 0.01);
      expect(depthRight.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.005, 0, 0.01);
    });

    it("should clamp depth and reject non-finite values", () => {
      chorus.setDepthMs(500);
      expect(chorus.depthMs).toBe(Chorus.MAX_DEPTH_MS);
      chorus.setDepthMs(-4);
      expect(chorus.depthMs).toBe(0);
      chorus.setDepthMs(Number.NaN);
      expect(chorus.depthMs).toBe(0);
    });

    it("should split dry and wet gain from the mix", () => {
      const [dryGain, wetGain] = createdNodes(ctx, "createGain").slice(2, 4);

      // Default mix of 0.4 — the same balance the Python engine mixes.
      expect(dryGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.6, 0, 0.01);
      expect(wetGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.4, 0, 0.01);

      chorus.setMix(0.75);
      expect(chorus.mix).toBe(0.75);
      expect(dryGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.25, 0, 0.01);
      expect(wetGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.75, 0, 0.01);
    });

    it("should clamp mix into 0..1", () => {
      chorus.setMix(4);
      expect(chorus.mix).toBe(1);
      chorus.setMix(-1);
      expect(chorus.mix).toBe(0);
    });
  });

  it("should stop its oscillators on disconnect so they cannot outlive the effect", () => {
    chorus.disconnect();
    const [lfoLeft, lfoRight] = createdNodes(ctx, "createOscillator");

    expect(lfoLeft.stop).toHaveBeenCalled();
    expect(lfoRight.stop).toHaveBeenCalled();
    expect(chorus.output.disconnect).toHaveBeenCalled();
  });
});
