import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  AudioEngineLatencyService,
  readDeviceIdentity,
  resolveDeviceIdentity,
} from './audio-engine-latency.service';
import { AudioEngineService } from './audio-engine.service';
import { LoggingService } from './logging.service';
import { UserProfileService } from './user-profile.service';
import { DatabaseService } from './database.service';
import { ProfileStoreService } from './profile-store.service';
import { initialProfile } from '../types/profile.types';

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
    // Device baselines live in localStorage; keep one test's persisted
    // record from leaking into the next test's construction.
    localStorage.clear();
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

  it('returns empty channels when compensation exceeds the channel length', () => {
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
              settings: { studio: { latencyCompensation: 100 } },
            }),
          },
        },
      ],
    });
    sut = TestBed.inject(AudioEngineLatencyService);

    const trimmed = sut.trimChannels([Float32Array.from([1, 2, 3, 4])], 100);

    expect(trimmed).toHaveLength(1);
    expect(trimmed[0]).toEqual(new Float32Array(0));
  });

  it('returns a silent one-frame audio buffer when compensation exceeds the buffer length', () => {
    const createMockBuffer = (
      channelData: number[][],
      sampleRate: number
    ): AudioBuffer =>
      ({
        numberOfChannels: channelData.length,
        length: channelData[0]?.length ?? 0,
        sampleRate,
        getChannelData: (channel: number) => Float32Array.from(channelData[channel] ?? []),
        copyToChannel: jest.fn(),
      }) as unknown as AudioBuffer;

    const engine = new StubEngine();
    engine.ctx = {
      ...engine.ctx,
      sampleRate: 100,
      createBuffer: jest.fn((channels: number, length: number, sampleRate: number) =>
        createMockBuffer(
          Array.from({ length: channels }, () => Array.from({ length }, () => 0)),
          sampleRate
        )
      ),
    } as any;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AudioEngineLatencyService,
        { provide: AudioEngineService, useValue: engine },
        { provide: LoggingService, useValue: new StubLogger() },
        {
          provide: UserProfileService,
          useValue: {
            profile: signal({
              settings: { studio: { latencyCompensation: 100 } },
            }),
          },
        },
      ],
    });
    sut = TestBed.inject(AudioEngineLatencyService);

    const trimmed = sut.trimAudioBuffer(
      createMockBuffer([[1, 2, 3, 4]], 100)
    );

    expect(trimmed.length).toBe(1);
    expect(Array.from(trimmed.getChannelData(0))).toEqual([0]);
  });

  describe('device baseline persistence (parity audit §5)', () => {
    const seededBaseline = JSON.stringify({
      deviceModel: 'Pixel 8',
      apiLevel: 34,
      totalLatencyMs: 42,
      benchmarkSpeedRatio: 3.5,
      capturedAt: 1,
    });

    const configureWithProfile = (
      latencyCompensation: number,
      updateProfile = jest.fn().mockResolvedValue(undefined),
      studio: Record<string, unknown> = {}
    ) => {
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
                settings: { studio: { latencyCompensation, ...studio } },
              }),
              hydrated: signal(true),
              updateProfile,
            },
          },
        ],
      });
      return {
        service: TestBed.inject(AudioEngineLatencyService),
        updateProfile,
      };
    };

    it('readDeviceIdentity parses model and API level off the Android UA', () => {
      const identity = readDeviceIdentity({
        userAgent:
          'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UP1A.231005.007) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko)',
      });
      expect(identity.deviceModel).toBe('Pixel 8');
      expect(identity.apiLevel).toBe(34);
    });

    it('readDeviceIdentity reports the platform with no API level off-Android', () => {
      const identity = readDeviceIdentity({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
      });
      expect(identity.deviceModel).toBe('MacIntel');
      expect(identity.apiLevel).toBeNull();
    });

    it('readDeviceIdentity refuses to label the reduced Android UA as a device', () => {
      // Chrome freezes every Android handset to "Android 10; K"; storing that
      // as `{ deviceModel: 'K', apiLevel: 29 }` mislabels every modern phone.
      const identity = readDeviceIdentity({
        userAgent:
          'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
        userAgentData: { platform: 'Android' },
      });
      expect(identity.deviceModel).toBe('Unknown Android device');
      expect(identity.apiLevel).toBeNull();
    });

    it('resolveDeviceIdentity recovers model and API level from client hints', async () => {
      const identity = await resolveDeviceIdentity({
        userAgent:
          'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
        userAgentData: {
          platform: 'Android',
          getHighEntropyValues: jest
            .fn()
            .mockResolvedValue({ model: 'Pixel 8', platformVersion: '14.0.0' }),
        },
      });
      expect(identity.deviceModel).toBe('Pixel 8');
      expect(identity.apiLevel).toBe(34);
    });

    it('resolveDeviceIdentity falls back to the UA when hints are refused', async () => {
      const identity = await resolveDeviceIdentity({
        userAgent:
          'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UP1A.231005.007) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko)',
        userAgentData: {
          platform: 'Android',
          getHighEntropyValues: jest
            .fn()
            .mockRejectedValue(new Error('user has not granted hints')),
        },
      });
      expect(identity.deviceModel).toBe('Pixel 8');
      expect(identity.apiLevel).toBe(34);
    });

    it('persists the hint-resolved identity instead of the reduced UA', async () => {
      const hints = {
        platform: 'Android',
        getHighEntropyValues: jest
          .fn()
          .mockResolvedValue({ model: 'Pixel 8', platformVersion: '14.0.0' }),
      };
      Object.defineProperty(navigator, 'userAgentData', {
        value: hints,
        configurable: true,
      });
      try {
        await sut.calibrateFromCurrentDevice(0.1);
      } finally {
        delete (navigator as any).userAgentData;
      }

      const stored = sut.storedBaseline();
      expect(stored).not.toBeNull();
      expect(stored!.deviceModel).toBe('Pixel 8');
      expect(stored!.apiLevel).toBe(34);
    });

    it('reports a previously stored reduced-UA baseline honestly', () => {
      // A record written before client hints existed must not keep claiming
      // "K / API 29" — the identity reads as unknown, the timing survives.
      localStorage.setItem(
        'smuve_device_latency_baseline',
        JSON.stringify({
          deviceModel: 'K',
          apiLevel: 29,
          totalLatencyMs: 42,
          benchmarkSpeedRatio: 3.5,
          capturedAt: 1,
        })
      );
      const { service } = configureWithProfile(0);

      expect(service.storedBaseline()?.deviceModel).toBe(
        'Unknown Android device'
      );
      expect(service.storedBaseline()?.apiLevel).toBeNull();
      expect(service.storedBaseline()?.totalLatencyMs).toBe(42);
    });

    it('persists a calibration run as a baseline a fresh session reloads', async () => {
      const first = await sut.calibrateFromCurrentDevice(0.1);

      const stored = sut.storedBaseline();
      expect(stored).not.toBeNull();
      // Identity comes from whatever UA this environment reports — never a
      // hardcoded guess the stored record could contradict.
      const identity = readDeviceIdentity();
      expect(stored!.deviceModel).toBe(identity.deviceModel);
      expect(stored!.apiLevel).toBe(identity.apiLevel);
      expect(stored!.totalLatencyMs).toBe(first.measuredLatencyMs);
      expect(stored!.benchmarkSpeedRatio).toBe(first.benchmarkSpeedRatio);

      // A fresh construction (next session) reloads the record from storage.
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          AudioEngineLatencyService,
          { provide: AudioEngineService, useValue: new StubEngine() },
          { provide: LoggingService, useValue: new StubLogger() },
        ],
      });
      const reloaded = TestBed.inject(AudioEngineLatencyService);
      expect(reloaded.storedBaseline()).toEqual(stored);
    });

    it('pre-fills compensation from a stored baseline when the profile has none', () => {
      localStorage.setItem('smuve_device_latency_baseline', seededBaseline);
      const { service, updateProfile } = configureWithProfile(0);

      expect(service.storedBaseline()?.totalLatencyMs).toBe(42);
      TestBed.flushEffects();

      expect(updateProfile).toHaveBeenCalledTimes(1);
      expect(updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            studio: expect.objectContaining({ latencyCompensation: 42 }),
          }),
        })
      );
    });

    it('pre-fills only after the profile hydrates, never over the placeholder', async () => {
      localStorage.setItem('smuve_device_latency_baseline', seededBaseline);
      const saveUserProfile = jest.fn().mockResolvedValue(undefined);
      let resolveLoad!: (value: any) => void;
      const loadUserProfile = jest.fn(
        () =>
          new Promise((resolve) => {
            resolveLoad = resolve;
          })
      );

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          AudioEngineLatencyService,
          UserProfileService,
          ProfileStoreService,
          { provide: AudioEngineService, useValue: new StubEngine() },
          { provide: LoggingService, useValue: new StubLogger() },
          { provide: DatabaseService, useValue: { saveUserProfile, loadUserProfile } },
        ],
      });

      // App boot: the profile request is in flight, the store still holds the
      // stock placeholder (artist name, compensation 0) — so a pre-fill here
      // would persist that placeholder over the artist's real profile.
      const profiles = TestBed.inject(UserProfileService);
      const load = profiles.loadProfile('user-1');
      const service = TestBed.inject(AudioEngineLatencyService);
      TestBed.flushEffects();

      expect(service.storedBaseline()?.totalLatencyMs).toBe(42);
      expect(profiles.hydrated()).toBe(false);
      expect(saveUserProfile).not.toHaveBeenCalled();

      // Hydration lands: the artist's own profile (compensation 0) installs.
      resolveLoad({
        ...JSON.parse(JSON.stringify(initialProfile)),
        artistName: 'Real Artist',
        settings: {
          ...initialProfile.settings,
          studio: { ...initialProfile.settings.studio, latencyCompensation: 0 },
        },
      });
      await load;
      TestBed.flushEffects();
      await Promise.resolve();

      expect(saveUserProfile).toHaveBeenCalledTimes(1);
      const persisted = saveUserProfile.mock.calls[0][0];
      expect(persisted.artistName).toBe('Real Artist');
      expect(persisted.settings.studio.latencyCompensation).toBe(42);
    });

    it('honours the artist opt-out and leaves a 0 ms setting alone', () => {
      localStorage.setItem('smuve_device_latency_baseline', seededBaseline);
      const updateProfile = jest.fn().mockResolvedValue(undefined);
      const { service } = configureWithProfile(0, updateProfile, {
        autoLatencyCompensation: false,
      });

      TestBed.flushEffects();

      expect(updateProfile).not.toHaveBeenCalled();
      // The baseline is still surfaced; only the automatic write is refused.
      expect(service.storedBaseline()?.totalLatencyMs).toBe(42);
      expect(service.getAppliedCompensationMs()).toBe(0);
    });

    it('never overwrites a compensation the artist already set', () => {
      localStorage.setItem('smuve_device_latency_baseline', seededBaseline);
      const { service, updateProfile } = configureWithProfile(100);

      TestBed.flushEffects();

      expect(updateProfile).not.toHaveBeenCalled();
      // The baseline itself is still surfaced — only the pre-fill is refused.
      expect(service.storedBaseline()?.totalLatencyMs).toBe(42);
      expect(service.getAppliedCompensationMs()).toBe(100);
    });
  });
});
