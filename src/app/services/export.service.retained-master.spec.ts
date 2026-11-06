import { TestBed } from "@angular/core/testing";
import { OfflineAudioContext as EngineOfflineAudioContext } from "web-audio-engine";

import { AudioEngineService } from "./audio-engine.service";
import { ExportService } from "./export.service";
import { LoggingService } from "./logging.service";
import { MusicManagerService } from "./music-manager.service";

/**
 * The production chain cannot run sample-for-sample here: the pure-JS engine
 * stubs DynamicsCompressor. The service path still renders real samples, so
 * this test replaces the chain with a ceiling-shaped waveshaper reading the
 * current true-peak target, then verifies the production chain separately
 * maps that same target onto its limiter.
 */
jest.mock("./offline-master-chain", () => {
  const actual = jest.requireActual("./offline-master-chain");

  const ceilingCurve = (ceilingDb: number): Float32Array => {
    const ceiling = Math.pow(10, ceilingDb / 20);
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i += 1) {
      const input = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.max(-ceiling, Math.min(ceiling, input));
    }
    return curve;
  };

  return {
    ...actual,
    connectOfflineMasterChain: jest.fn(
      (offline: any, input: any, engine: any) => {
        const limiter = offline.createWaveShaper();
        limiter.curve = ceilingCurve(engine.getMasteringTargets().truePeak);
        input.connect(limiter);
        limiter.connect(offline.destination);

        // The helper schedules automation against these nodes; this test has
        // no master lanes, so only the shape of the object matters.
        const param = {};
        const filter = { gain: param, frequency: param };
        return {
          makeup: { gain: param },
          lowShelf: filter,
          lowMid: filter,
          highShelf: filter,
          compressors: [],
          limiter: { threshold: param },
          filter,
        };
      },
    ),
  };
});

describe("ExportService retained-master rendering", () => {
  let svc: ExportService;
  let ceilingDb = -1;

  const engine = {
    tempo: () => 120,
    getTempoMap: () => [],
    masterGain: { gain: { value: 0.8 } },
    getMasteringTargets: () => ({ lufs: -14, truePeak: ceilingDb }),
    getMasterMakeupDb: () => 0,
    getMasterToneEq: () => ({
      lowShelfDb: 0,
      lowMidDb: 0,
      highShelfDb: 0,
    }),
    getMasteringBands: () => [],
    getCompressorSettings: () => ({ threshold: -16, ratio: 3 }),
    limiter: {
      ratio: { value: 20 },
      attack: { value: 0.001 },
      release: { value: 0.05 },
      knee: { value: 0 },
    },
    masterEQ: { frequency: { value: 20000 } },
    masterShelf: { frequency: { value: 5000 } },
  };

  const originalOfflineContext = (globalThis as any).OfflineAudioContext;

  beforeAll(() => {
    (globalThis as any).OfflineAudioContext = EngineOfflineAudioContext;
  });

  afterAll(() => {
    (globalThis as any).OfflineAudioContext = originalOfflineContext;
  });

  beforeEach(() => {
    ceilingDb = -1;
    TestBed.configureTestingModule({
      providers: [
        ExportService,
        { provide: AudioEngineService, useValue: engine },
        { provide: MusicManagerService, useValue: { tracks: () => [] } },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    });
    svc = TestBed.inject(ExportService);
  });

  /** A stereo 440 Hz tone near full scale: loud enough to hit any ceiling. */
  function makeRetainedMix(amplitude = 0.99): AudioBuffer {
    const context = new EngineOfflineAudioContext(2, 8192, 44100);
    const buffer = context.createBuffer(2, 8192, 44100);
    for (let channel = 0; channel < 2; channel += 1) {
      const samples = buffer.getChannelData(channel);
      for (let i = 0; i < samples.length; i += 1) {
        samples[i] =
          Math.sin((2 * Math.PI * 440 * i) / 44100) * amplitude;
      }
    }
    return buffer as AudioBuffer;
  }

  function peak(buffer: AudioBuffer): number {
    const samples = buffer.getChannelData(0);
    let max = 0;
    for (let i = 0; i < samples.length; i += 1) {
      max = Math.max(max, Math.abs(samples[i]));
    }
    return max;
  }

  it("re-masters at the current ceiling without changing the retained mix", async () => {
    const retained = makeRetainedMix();
    const leftBefore = Float32Array.from(retained.getChannelData(0));
    const rightBefore = Float32Array.from(retained.getChannelData(1));

    ceilingDb = -1;
    const atMinusOne = await svc.masterRetainedMix(retained);
    ceilingDb = -6;
    const atMinusSix = await svc.masterRetainedMix(retained);

    // A new buffer each time, shaped by the ceiling in force for that pass.
    expect(atMinusOne).not.toBe(retained);
    expect(atMinusSix).not.toBe(atMinusOne);
    expect(peak(atMinusOne)).toBeGreaterThan(0.88);
    expect(peak(atMinusOne)).toBeLessThanOrEqual(0.892);
    expect(peak(atMinusSix)).toBeGreaterThan(0.49);
    expect(peak(atMinusSix)).toBeLessThanOrEqual(0.502);
    expect(peak(atMinusSix)).toBeLessThan(peak(atMinusOne));

    // The retained mix is source material, not a scratch buffer: mastering it
    // twice must not bake the first ceiling into the second pass.
    expect(Array.from(retained.getChannelData(0))).toEqual(Array.from(leftBefore));
    expect(Array.from(retained.getChannelData(1))).toEqual(Array.from(rightBefore));
  });

  it("maps the current true-peak target onto the production limiter", () => {
    const actual = jest.requireActual("./offline-master-chain");
    const context = new EngineOfflineAudioContext(2, 128, 44100);
    const input = context.createGain();
    ceilingDb = -6;

    const chain = actual.connectOfflineMasterChain(
      context,
      input,
      engine,
      false,
    );

    expect(chain).not.toBeNull();
    expect(chain.limiter.threshold.value).toBeCloseTo(-6);
  });
});
