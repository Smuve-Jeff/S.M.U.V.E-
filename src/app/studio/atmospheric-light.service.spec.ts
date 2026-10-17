import { TestBed } from "@angular/core/testing";
import {
  ATMOSPHERE_VARS,
  AtmosphericLightService,
} from "./atmospheric-light.service";

const SAMPLE_RATE = 48_000;
const FFT_SIZE = 2048;
const BIN_COUNT = FFT_SIZE / 2;
const HZ_PER_BIN = SAMPLE_RATE / 2 / BIN_COUNT;

/** Byte index of the first bin at or above `hz`. */
const binFor = (hz: number) => Math.round(hz / HZ_PER_BIN);

/**
 * A stand-in for the engine's master analyser. `spectrum` is a per-band
 * amplitude map (0..1) that gets expanded into the byte buffer exactly the way
 * a real analyser would report it.
 */
function fakeAnalyser(
  spectrum: { low?: number; mid?: number; high?: number } = {},
  opts: { silent?: boolean; silentReads?: boolean } = {},
) {
  const data = new Uint8Array(BIN_COUNT);
  const paint = () => {
    data.fill(0);
    if (opts.silent) return;
    for (let i = binFor(20); i < binFor(200); i += 1)
      data[i] = (spectrum.low ?? 0) * 255;
    for (let i = binFor(200); i < binFor(2000); i += 1)
      data[i] = (spectrum.mid ?? 0) * 255;
    for (let i = binFor(2000); i < binFor(12000); i += 1)
      data[i] = (spectrum.high ?? 0) * 255;
  };
  paint();
  return {
    fftSize: FFT_SIZE,
    frequencyBinCount: BIN_COUNT,
    context: { sampleRate: SAMPLE_RATE },
    getByteFrequencyData(target: Uint8Array) {
      if (opts.silentReads) throw new Error("detached");
      target.set(data);
    },
    setSpectrum(next: { low?: number; mid?: number; high?: number }) {
      Object.assign(spectrum, next);
      paint();
    },
    silence() {
      spectrum.low = 0;
      spectrum.mid = 0;
      spectrum.high = 0;
      paint();
    },
  } as unknown as AnalyserNode & {
    setSpectrum(next: { low?: number; mid?: number; high?: number }): void;
    silence(): void;
  };
}

describe("AtmosphericLightService", () => {
  let service: AtmosphericLightService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AtmosphericLightService);
  });

  afterEach(() => {
    service.stop();
    jest.restoreAllMocks();
  });

  it("reports silence before anything is bound", () => {
    const frame = service.sample(0);
    expect(frame).toEqual({
      level: 0,
      low: 0,
      mid: 0,
      high: 0,
      brightness: 0.5,
    });
    expect(service.reacting()).toBe(false);
  });

  it("splits the spectrum into the musical bands, not equal thirds of the bins", () => {
    const analyser = fakeAnalyser({ low: 0.9, mid: 0, high: 0 });
    service.bind(analyser as unknown as AnalyserNode);

    const frame = service.sample(0);

    // The low band is ~4% of the bins, so an equal-thirds split would read ~0.04.
    expect(frame.low).toBeGreaterThan(0.4);
    expect(frame.mid).toBe(0);
    expect(frame.high).toBe(0);
  });

  it("weights the body of the mix above the extremes when setting the master level", () => {
    const lowOnly = fakeAnalyser({ low: 1 });
    service.bind(lowOnly as unknown as AnalyserNode);
    for (let i = 0; i < 40; i += 1) service.sample(i * 16);
    const lowLevel = service.level();

    service.bind(fakeAnalyser({ mid: 1 }) as unknown as AnalyserNode);
    for (let i = 0; i < 40; i += 1) service.sample(i * 16);
    const midLevel = service.level();

    service.bind(fakeAnalyser({ high: 1 }) as unknown as AnalyserNode);
    for (let i = 0; i < 40; i += 1) service.sample(i * 16);
    const highLevel = service.level();

    expect(midLevel).toBeGreaterThan(lowLevel);
    expect(lowLevel).toBeGreaterThan(highLevel);
  });

  it("attacks fast and releases slow, so transients show but nothing strobes", () => {
    const analyser = fakeAnalyser({ mid: 1 });
    service.bind(analyser as unknown as AnalyserNode);

    const firstFrame = service.sample(0).mid;
    expect(firstFrame).toBeGreaterThan(0.3); // visible on frame one

    const attackFrames: number[] = [];
    for (let i = 1; i <= 6; i += 1)
      attackFrames.push(service.sample(i * 16).mid);
    expect(attackFrames[attackFrames.length - 1]).toBeGreaterThan(0.9);

    // Cut the music: the fall must be gradual, i.e. still clearly lit one frame
    // later but measurably dimmer over the same span the attack covered.
    const litValue = service.mid();
    analyser.silence();
    const afterOneFrame = service.sample(1000).mid;
    expect(afterOneFrame).toBeLessThan(litValue);
    expect(afterOneFrame).toBeGreaterThan(litValue * 0.5);

    for (let i = 0; i < 200; i += 1) service.sample(2000 + i * 16);
    expect(service.mid()).toBeLessThan(0.02);
  });

  it("tracks the spectral centroid so the hue can follow the brightness", () => {
    service.bind(fakeAnalyser({ low: 1 }) as unknown as AnalyserNode);
    for (let i = 0; i < 60; i += 1) service.sample(i * 16);
    const dark = service.brightness();

    service.bind(fakeAnalyser({ high: 1 }) as unknown as AnalyserNode);
    for (let i = 0; i < 60; i += 1) service.sample(i * 16);
    const bright = service.brightness();

    expect(bright).toBeGreaterThan(dark);
  });

  it("writes only the properties it owns onto the style target", () => {
    const target = document.createElement("div");
    target.style.setProperty("--unrelated", "keep-me");
    service.setStyleTarget(target);
    service.bind(
      fakeAnalyser({
        low: 0.8,
        mid: 0.6,
        high: 0.4,
      }) as unknown as AnalyserNode,
    );

    for (let i = 0; i < 40; i += 1) service.sample(i * 16);
    service.paint(target, 10_000);

    expect(
      Number(target.style.getPropertyValue(ATMOSPHERE_VARS.low)),
    ).toBeGreaterThan(0.5);
    expect(
      Number(target.style.getPropertyValue(ATMOSPHERE_VARS.mid)),
    ).toBeGreaterThan(0.3);
    expect(target.style.getPropertyValue(ATMOSPHERE_VARS.active)).toBe("1");
    expect(target.style.getPropertyValue("--unrelated")).toBe("keep-me");
    expect(target.style.getPropertyValue("--stage-canvas")).toBe("");
  });

  it("skips style writes that a 72px blur could not show", () => {
    const target = document.createElement("div");
    service.bind(fakeAnalyser({ mid: 0.5 }) as unknown as AnalyserNode);
    for (let i = 0; i < 60; i += 1) service.sample(i * 16);

    service.paint(target, 0);
    const first = target.style.getPropertyValue(ATMOSPHERE_VARS.mid);
    const setProperty = jest.spyOn(target.style, "setProperty");

    // Same audio, one frame later: the value is stable, so nothing is rewritten.
    service.sample(1000);
    service.paint(target, 40);
    expect(setProperty).not.toHaveBeenCalledWith(
      ATMOSPHERE_VARS.mid,
      expect.anything(),
    );
    expect(target.style.getPropertyValue(ATMOSPHERE_VARS.mid)).toBe(first);
  });

  it("is rate limited to roughly 30fps however often it is asked to paint", () => {
    const target = document.createElement("div");
    service.bind(fakeAnalyser({ mid: 0.9 }) as unknown as AnalyserNode);
    for (let i = 0; i < 60; i += 1) service.sample(i * 16);

    service.paint(target, 1000);
    const setProperty = jest.spyOn(target.style, "setProperty");
    service.paint(target, 1010); // 10ms later — too soon
    expect(setProperty).not.toHaveBeenCalled();
    service.paint(target, 1040); // 40ms later — allowed
    expect(setProperty).toHaveBeenCalled();
  });

  it("never starts the reactive loop for a reduced-motion user", () => {
    const raf = jest.spyOn(globalThis, "requestAnimationFrame");
    service.bind(fakeAnalyser({ mid: 1 }) as unknown as AnalyserNode);

    service.setActive(true, true);

    expect(raf).not.toHaveBeenCalled();
    expect(service.reacting()).toBe(false);
  });

  it("does not start without an analyser, and settles to the authored defaults", () => {
    const raf = jest.spyOn(globalThis, "requestAnimationFrame");
    service.setActive(true, false);
    expect(raf).not.toHaveBeenCalled();
    expect(service.level()).toBe(0);
  });

  it("stops the loop and resets the frame when deactivated", () => {
    const cancel = jest.spyOn(globalThis, "cancelAnimationFrame");
    service.bind(fakeAnalyser({ mid: 1 }) as unknown as AnalyserNode);
    service.setActive(true, false);
    expect(service.reacting()).toBe(true);

    service.setActive(false);
    expect(cancel).toHaveBeenCalled();
    expect(service.reacting()).toBe(false);
    expect(service.mid()).toBe(0);
  });

  it("survives a detached analyser read without taking the audio thread down", () => {
    const analyser = fakeAnalyser({ mid: 1 }, { silentReads: true });
    service.bind(analyser as unknown as AnalyserNode);
    expect(() => service.sample(0)).not.toThrow();
    expect(service.level()).toBe(0);
  });

  it("clears its own variables when the target is detached", () => {
    const target = document.createElement("div");
    service.setStyleTarget(target);
    service.setStyleTarget(null);
    // Re-attaching a fresh target must start from a clean, non-reactive state.
    const next = document.createElement("div");
    service.setStyleTarget(next);
    expect(next.style.getPropertyValue(ATMOSPHERE_VARS.active)).toBe("0");
  });
});
