import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AudioEngineLatencyService } from './audio-engine-latency.service';
import { AudioEngineService } from './audio-engine.service';
import { LoggingService } from './logging.service';
import { UserProfileService } from './user-profile.service';

class StubEngine {
  ctx = {
    baseLatency: 0.02,
    outputLatency: 0.03,
    sampleRate: 48000,
    state: 'running' as AudioContextState,
  };
  nativeSampleRate = 48000;
  masterWorkletActive = () => false;
  performanceTier = () => 'ultra' as const;
}

class StubLogger {
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
}

describe('AudioEngineLatencyService · Sprint C1', () => {
  let sut: AudioEngineLatencyService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AudioEngineLatencyService,
        { provide: AudioEngineService, useValue: new StubEngine() },
        { provide: LoggingService, useValue: new StubLogger() },
      ],
    });
    sut = TestBed.inject(AudioEngineLatencyService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('captureSnapshot reads the engine public surface verbatim', () => {
    const snap = sut.captureSnapshot();
    expect(snap.sampleRateHz).toBe(48000);
    expect(snap.baseLatencySec).toBeCloseTo(0.02, 5);
    expect(snap.outputLatencySec).toBeCloseTo(0.03, 5);
    expect(snap.totalLatencyMs).toBeCloseTo(50, 0);
    expect(snap.schedulerLookaheadMs).toBe(100);
    expect(snap.schedulerIntervalMs).toBe(25);
    expect(snap.masterWorkletActive).toBe(false);
    expect(snap.performanceTier).toBe('ultra');
    // 50ms total → 'near' (between 30 and 60)
    expect(snap.cpuHeadroomHint).toBe('near');
    expect(snap.contextState).toBe('running');
  });

  it('cpuHeadroomHint escalates from headroom → near → tight', () => {
    const cheap = { ...new StubEngine(), ctx: { ...new StubEngine().ctx, baseLatency: 0.005, outputLatency: 0.01 } } as any;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AudioEngineLatencyService,
        { provide: AudioEngineService, useValue: cheap },
        { provide: LoggingService, useValue: new StubLogger() },
      ],
    });
    sut = TestBed.inject(AudioEngineLatencyService);
    expect(sut.captureSnapshot().cpuHeadroomHint).toBe('headroom');

    const tight = { ...new StubEngine(), ctx: { ...new StubEngine().ctx, baseLatency: 0.04, outputLatency: 0.04 } } as any;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AudioEngineLatencyService,
        { provide: AudioEngineService, useValue: tight },
        { provide: LoggingService, useValue: new StubLogger() },
      ],
    });
    sut = TestBed.inject(AudioEngineLatencyService);
    expect(sut.captureSnapshot().cpuHeadroomHint).toBe('tight');
  });

  it('profileSummary prompts when context is not running', () => {
    const stopped = new StubEngine();
    stopped.ctx = { ...stopped.ctx, state: 'suspended' };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AudioEngineLatencyService,
        { provide: AudioEngineService, useValue: stopped },
        { provide: LoggingService, useValue: new StubLogger() },
      ],
    });
    sut = TestBed.inject(AudioEngineLatencyService);
    // Force a refresh so the snapshot reflects the suspended state.
    sut.snapshot.set(sut.captureSnapshot());
    const summary = sut.buildSummary();
    expect(summary.recommendations).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/AudioContext is suspended/),
      ])
    );
  });

  it('profileSummary flags missing master worklet', () => {
    sut.snapshot.set(sut.captureSnapshot());
    const summary = sut.buildSummary();
    expect(summary.recommendations).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Master worklet is off/),
      ])
    );
  });

  it('runOfflineBenchmark appends a result to the recent benchmark window', async () => {
    expect(sut.recentBenchmarks().length).toBe(0);
    const result = await sut.runOfflineBenchmark(1);
    expect(result.durationSec).toBe(1);
    expect(typeof result.offlineRenderMs).toBe('number');
    expect(typeof result.speedRatio).toBe('number');
    expect(result.capturedAt).toBeLessThanOrEqual(Date.now());
    expect(sut.recentBenchmarks().length).toBe(1);
  });

  it('runOfflineBenchmark keeps a rolling window of at most 10 samples', async () => {
    for (let i = 0; i < 12; i++) {
      // Silence: give the mocked OfflineContext a microtask to settle.
      await sut.runOfflineBenchmark(0.5);
    }
    expect(sut.recentBenchmarks().length).toBeLessThanOrEqual(10);
  });

  it('getEngineMetrics is a plain-object compatible read', () => {
    const m = sut.getEngineMetrics();
    expect(m.sampleRateHz).toBe(48000);
    expect(Array.isArray([])).toBe(true); // sanity
    expect(typeof m.totalLatencyMs).toBe('number');
  });

  it('reads applied compensation from profile settings and trims recorded channels', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AudioEngineLatencyService,
        { provide: AudioEngineService, useValue: new StubEngine() },
        { provide: LoggingService, useValue: new StubLogger() },
        {
          provide: UserProfileService,
          useValue: {
            profile: signal({
              settings: { studio: { latencyCompensation: 20 } },
            }),
          },
        },
      ],
    });
    sut = TestBed.inject(AudioEngineLatencyService);

    const trimmed = sut.trimChannels([Float32Array.from([1, 2, 3, 4])], 100);

    expect(sut.getAppliedCompensationMs()).toBe(20);
    expect(Array.from(trimmed[0])).toEqual([3, 4]);
  });
});
