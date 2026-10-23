import { TestBed } from '@angular/core/testing';
import {
  STUDIO_AUDIO_BUDGETS,
  StudioDeviceProfileService,
  type StudioDeviceSignals,
  classifyStudioDevice,
  readStudioDeviceSignals,
} from './studio-device-profile.service';
import { AudioEngineService } from './audio-engine.service';
import { LoggingService } from './logging.service';

const signals = (
  overrides: Partial<StudioDeviceSignals> = {}
): StudioDeviceSignals => ({
  cores: 8,
  memoryGb: 8,
  mobile: false,
  audioWorklet: true,
  webAssembly: true,
  wasmSimd: true,
  saveData: false,
  reducedMotion: false,
  ...overrides,
});

class StubEngine {
  updateAdaptivePerformance = jest.fn();
  setVoiceBudget = jest.fn();
}

class StubLogger {
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
}

describe('StudioDeviceProfileService · capability classifier', () => {
  describe('classifyStudioDevice', () => {
    it('classifies a modern desktop as high with the full budget', () => {
      const profile = classifyStudioDevice(signals());
      expect(profile.tier).toBe('high');
      expect(profile.performanceTier).toBe('ultra');
      expect(profile.capabilityPressure).toBe(10);
      expect(profile.budget).toEqual(STUDIO_AUDIO_BUDGETS.high);
      expect(profile.lowPowerSuggested).toBe(false);
      expect(profile.reasons).toEqual([]);
    });

    it('classifies a typical mid-range Android phone as mid, not low', () => {
      // 8 cores but only 4GB and a mobile WebView audio path: the common
      // Android case. It must keep the full feature set (tier 'ultra') while
      // still getting a smaller voice/effects budget.
      const profile = classifyStudioDevice(
        signals({ cores: 8, memoryGb: 4, mobile: true })
      );
      expect(profile.tier).toBe('mid');
      expect(profile.performanceTier).toBe('ultra');
      expect(profile.capabilityPressure).toBe(55);
      expect(profile.budget.maxVoices).toBeLessThan(
        STUDIO_AUDIO_BUDGETS.high.maxVoices
      );
      expect(profile.reasons).toContain('mobile WebView audio path');
      expect(profile.lowPowerSuggested).toBe(false);
    });

    it('drops a low-end device into the low-power engine tier', () => {
      const profile = classifyStudioDevice(
        signals({
          cores: 4,
          memoryGb: 2,
          mobile: true,
          wasmSimd: false,
        })
      );
      expect(profile.tier).toBe('low');
      expect(profile.performanceTier).toBe('performance');
      expect(profile.capabilityPressure).toBeGreaterThan(70);
      expect(profile.budget).toEqual(STUDIO_AUDIO_BUDGETS.low);
      expect(profile.lowPowerSuggested).toBe(true);
      expect(profile.reducedVisuals).toBe(true);
      expect(profile.reasons.join(' · ')).toContain('2GB device memory');
      expect(profile.reasons.join(' · ')).toContain(
        'WebAssembly SIMD unavailable'
      );
    });

    it('treats missing core/memory signals as mid rather than worst case', () => {
      const profile = classifyStudioDevice(
        signals({ cores: 0, memoryGb: null })
      );
      expect(profile.tier).toBe('mid');
      expect(profile.performanceTier).toBe('ultra');
      expect(profile.reasons.join(' · ')).toContain('CPU core count unavailable');
    });

    it('never recommends the full tier without AudioWorklet', () => {
      const profile = classifyStudioDevice(
        signals({ cores: 2, audioWorklet: false })
      );
      expect(profile.tier).toBe('low');
      expect(profile.reasons.join(' · ')).toContain('AudioWorklet unavailable');
    });

    it('honours Data Saver by trimming the score', () => {
      const withoutSaveData = classifyStudioDevice(
        signals({ cores: 6, memoryGb: 4, mobile: true })
      );
      const withSaveData = classifyStudioDevice(
        signals({ cores: 6, memoryGb: 4, mobile: true, saveData: true })
      );
      expect(withoutSaveData.tier).toBe('mid');
      expect(withSaveData.tier).toBe('low');
      expect(withSaveData.reasons).toContain('Data Saver enabled');
    });

    it('flags reduced motion as a visual-only signal', () => {
      const profile = classifyStudioDevice(signals({ reducedMotion: true }));
      expect(profile.reducedVisuals).toBe(true);
      // A motion preference is not an audio-capability signal.
      expect(profile.tier).toBe('high');
      expect(profile.performanceTier).toBe('ultra');
    });
  });

  describe('readStudioDeviceSignals', () => {
    it('reads core count, memory and Data Saver off a navigator-shaped source', () => {
      const read = readStudioDeviceSignals({
        hardwareConcurrency: 12,
        deviceMemory: 8,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile',
        connection: { saveData: true },
      });
      expect(read.cores).toBe(12);
      expect(read.memoryGb).toBe(8);
      expect(read.mobile).toBe(true);
      expect(read.saveData).toBe(true);
      expect(read.webAssembly).toBe(true);
    });

    it('prefers userAgentData.mobile over the UA string', () => {
      const read = readStudioDeviceSignals({
        hardwareConcurrency: 8,
        userAgentData: { mobile: false },
        userAgent: 'Mozilla/5.0 (Linux; Android 14)',
      });
      expect(read.mobile).toBe(false);
    });

    it('degrades safely when the browser reports nothing', () => {
      const read = readStudioDeviceSignals({});
      expect(read.cores).toBe(0);
      expect(read.memoryGb).toBeNull();
      expect(read.mobile).toBe(false);
      expect(read.saveData).toBe(false);
    });
  });

  describe('service wiring', () => {
    let engine: StubEngine;
    let sut: StudioDeviceProfileService;

    const build = (stub: StubEngine) => {
      TestBed.configureTestingModule({
        providers: [
          StudioDeviceProfileService,
          { provide: AudioEngineService, useValue: stub },
          { provide: LoggingService, useValue: new StubLogger() },
        ],
      });
      return TestBed.inject(StudioDeviceProfileService);
    };

    beforeEach(() => {
      TestBed.resetTestingModule();
      engine = new StubEngine();
      sut = build(engine);
    });

    it('publishes a profile on construction and drives the adaptive tier', () => {
      expect(sut.profile().tier).toBeDefined();
      expect(engine.updateAdaptivePerformance).toHaveBeenCalledTimes(1);
      expect(engine.updateAdaptivePerformance).toHaveBeenCalledWith(
        sut.profile().capabilityPressure
      );
    });

    it('re-applies the tier on refresh()', () => {
      sut.refresh();
      expect(engine.updateAdaptivePerformance).toHaveBeenCalledTimes(2);
    });

    it('pushes the classified voice ceiling into the engine', () => {
      // The engine cannot import this profile (it would close a construction
      // cycle), so budget().maxVoices travels down the same road as the tier.
      expect(engine.setVoiceBudget).toHaveBeenCalledTimes(1);
      expect(engine.setVoiceBudget).toHaveBeenCalledWith(
        sut.profile().budget.maxVoices
      );
    });

    it('re-pushes the ceiling on refresh()', () => {
      sut.refresh();
      expect(engine.setVoiceBudget).toHaveBeenCalledTimes(2);
      expect(engine.setVoiceBudget).toHaveBeenLastCalledWith(
        sut.profile().budget.maxVoices
      );
    });

    it('degrades silently when the engine cannot adapt', () => {
      TestBed.resetTestingModule();
      const broken = build({} as StubEngine);
      expect(broken.profile().tier).toBeDefined();
    });
  });
});
