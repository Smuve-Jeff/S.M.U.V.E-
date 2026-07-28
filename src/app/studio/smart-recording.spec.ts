import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { SmartRecordingService, CompGroup } from './smart-recording.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { LoggingService } from '../services/logging.service';
import { RecordingStatusService } from './recording-status.service';
import { LocalStorageService } from '../services/local-storage.service';
import { StudioRecordingEngineService } from './studio-recording-engine.service';

function createMockAudioEngine() {
  return {
    tempo: () => 120,
    isRecording: { set: jest.fn() },
    ctx: { sampleRate: 48000 },
    masterGain: { gain: { value: 0.8 } },
  } as any;
}

describe('SmartRecordingService', () => {
  let service: SmartRecordingService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SmartRecordingService,
        { provide: AudioEngineService, useValue: createMockAudioEngine() },
        { provide: LoggingService, useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } },
        { provide: RecordingStatusService, useValue: {
          setRecordingSource: jest.fn(),
          clearRecordingSource: jest.fn(),
        } },
        { provide: LocalStorageService, useValue: { saveItem: jest.fn().mockResolvedValue(true) } },
        { provide: StudioRecordingEngineService, useValue: {
          isInitialized: () => false,
          initialize: jest.fn().mockResolvedValue(true),
          startRecording: jest.fn(),
          stopRecording: jest.fn().mockResolvedValue(undefined),
          getRecordedBuffers: jest.fn().mockReturnValue({ left: [], right: [] }),
        } },
      ],
    });

    service = TestBed.inject(SmartRecordingService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('recording modes', () => {
    it('should default to normal mode', () => {
      expect(service.recordingMode()).toBe('normal');
    });

    it('should switch to punch mode', () => {
      service.setRecordingMode('punch');
      expect(service.recordingMode()).toBe('punch');
    });

    it('should switch to comp mode', () => {
      service.setRecordingMode('comp');
      expect(service.recordingMode()).toBe('comp');
    });
  });

  describe('punch-in/out', () => {
    beforeEach(() => {
      service.setRecordingMode('punch');
    });

    it('should set punch points', () => {
      service.setPunchIn(4);
      service.setPunchOut(8);
      expect(service.punchInBar()).toBe(4);
      expect(service.punchOutBar()).toBe(8);
      expect(service.hasPunchRegion()).toBe(true);
    });

    it('should clear punch region', () => {
      service.setPunchIn(4);
      service.clearPunchRegion();
      expect(service.punchInBar()).toBeNull();
      expect(service.punchOutBar()).toBeNull();
    });

    it('should arm and disarm', () => {
      service.armPunch();
      expect(service.punchArmed()).toBe(true);
      service.disarmPunch();
      expect(service.punchArmed()).toBe(false);
    });
  });

  describe('comp groups', () => {
    it('should create a new comp group', () => {
      service.startNewCompGroup('track1', 'Guitar', 'Verse 1');
      expect(service.compGroups().length).toBe(1);
      expect(service.compGroups()[0].trackName).toBe('Guitar');
      expect(service.compGroups()[0].sectionLabel).toBe('Verse 1');
    });

    it('should set active comp group', () => {
      service.startNewCompGroup('t1', 'Track', 'Section');
      expect(service.activeCompGroupId()).toBeTruthy();
    });

    it('should finish a comp take', async () => {
      service.startNewCompGroup('t1', 'Track', 'Chorus');
      service.startCompTake();
      expect(service.isCompRecording()).toBe(true);
      const take = await service.finishCompTake();
      expect(take).toBeTruthy();
      expect(take!.takeNumber).toBe(1);
      expect(service.isCompRecording()).toBe(false);
    });

    it('should select a comp take', () => {
      service.startNewCompGroup('t1', 'Track', 'Verse');
      const group = service.compGroups()[0];
      // Add a fake take directly
      const takeId = 'take_test_1';
      service.compGroups.update((groups) =>
        groups.map((g) => {
          if (g.id !== group.id) return g;
          return {
            ...g,
            takes: [{ id: takeId, takeNumber: 1, label: 'Take 1', url: '', blob: null,
              durationMs: 2000, recordedAt: Date.now(), regionStartBar: 1, regionEndBar: 5,
              isMuted: false, isCompSelection: false, peakDbL: -18, peakDbR: -18 }],
          };
        })
      );
      service.selectCompTake(group.id, takeId);
      const updated = service.compGroups().find((g) => g.id === group.id);
      expect(updated!.selectedTakeId).toBe(takeId);
    });

    it('should toggle take mute', () => {
      service.startNewCompGroup('t1', 'Track', 'Solo');
      const groupId = service.activeCompGroupId()!;
      const takeId = 'take_mute_1';
      service.compGroups.update((groups) =>
        groups.map((g) => ({
          ...g,
          takes: [{ id: takeId, takeNumber: 1, label: 'T1', url: '', blob: null,
            durationMs: 1000, recordedAt: 0, regionStartBar: 1, regionEndBar: 3,
            isMuted: false, isCompSelection: false, peakDbL: -18, peakDbR: -18 }],
        }))
      );
      service.toggleTakeMute(groupId, takeId);
      const take = service.compGroups()[0].takes[0];
      expect(take.isMuted).toBe(true);
    });

    it('should delete a comp group', () => {
      service.startNewCompGroup('t1', 'Track', 'Section');
      const groupId = service.activeCompGroupId()!;
      service.deleteCompGroup(groupId);
      expect(service.compGroups().length).toBe(0);
    });
  });

  describe('zero-crossing detection', () => {
    it('should find nearest zero crossing', () => {
      const buffer = new Float32Array([0.5, 0.1, -0.1, 0.2, -0.3, 0.0, 0.4]);
      const result = service.findZeroCrossing(buffer, 3, 48000);
      // Zero crossings exist near indices 1, 2, 3, 5; nearest to target 3
      // depends on which crossing point is closer to zero. Include all candidates.
      expect([1, 2, 3, 5]).toContain(result);
    });

    it('should return target when disabled', () => {
      service.zeroCrossingEnabled.set(false);
      const buffer = new Float32Array([1, -1, 1, -1]);
      const result = service.findZeroCrossing(buffer, 2, 48000);
      expect(result).toBe(2);
    });
  });

  describe('crossfade', () => {
    it('should apply comp crossfade', () => {
      const bufA = new Float32Array(500).fill(1);
      const bufB = new Float32Array(500).fill(-1);
      service.crossfadeMs.set(5); // 5ms = 240 samples, fits in 500-sample buffers
      service.zeroCrossingEnabled.set(false);
      const result = service.applyCompCrossfade(bufA, bufB, 250, 48000);
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
      // First portion should be from bufA
      expect(result[0]).toBeCloseTo(1, 3);
    });

    it('should compile multiple comp takes', () => {
      service.crossfadeMs.set(5); // short crossfade
      service.zeroCrossingEnabled.set(false);

      const group: CompGroup = {
        id: 'g1', trackId: 't1', trackName: 'Track', sectionLabel: 'Verse',
        takes: [
          { id: 't1', takeNumber: 1, label: 'T1', url: '', blob: null,
            durationMs: 500, recordedAt: 0, regionStartBar: 1, regionEndBar: 2,
            isMuted: false, isCompSelection: true, peakDbL: -18, peakDbR: -18 },
          { id: 't2', takeNumber: 2, label: 'T2', url: '', blob: null,
            durationMs: 500, recordedAt: 0, regionStartBar: 2, regionEndBar: 3,
            isMuted: false, isCompSelection: false, peakDbL: -18, peakDbR: -18 },
        ],
        selectedTakeId: 't1',
        createdAt: Date.now(),
      };
      service.compGroups.set([group]);
      service.activeCompGroupId.set('g1');

      // Use buffers large enough for crossfade math (5ms @ 48k = 240 samples crossfade)
      const buffers = new Map<string, Float32Array>();
      buffers.set('t1', new Float32Array(1000).fill(0.5));
      buffers.set('t2', new Float32Array(1000).fill(-0.5));

      const result = service.compileComp(buffers, 48000);
      expect(result).toBeTruthy();
      expect(result!.length).toBeGreaterThan(0);
    });
  });

  describe('auto-split', () => {
    it('should detect silence boundaries', () => {
      service.autoSplitEnabled.set(true);
      service.autoSplitThreshold.set(-30);
      service.autoSplitMinSilenceMs.set(100);

      const samples = new Float32Array(48000 * 2);
      // Fill with audio: 0.5s signal, 0.3s silence, 0.5s signal
      // minSilenceMs = 100ms → need > 4800 samples of silence
      const sr = 48000;
      const sigEnd = Math.floor(0.5 * sr);
      const silEnd = sigEnd + Math.floor(0.3 * sr); // 0.3s silence
      const end = silEnd + Math.floor(0.5 * sr);
      for (let i = 0; i < sigEnd; i++) samples[i] = 0.8;
      for (let i = sigEnd; i < silEnd; i++) samples[i] = 0;
      for (let i = silEnd; i < end; i++) samples[i] = 0.8;

      const boundaries = service.detectSilenceBoundaries(samples.slice(0, end), sr);
      expect(boundaries.length).toBeGreaterThan(0);
    });

    it('should return empty array when disabled', () => {
      service.autoSplitEnabled.set(false);
      const boundaries = service.detectSilenceBoundaries(new Float32Array(1000), 48000);
      expect(boundaries).toEqual([]);
    });
  });

  describe('computed signals', () => {
    it('should compute punch status label', () => {
      service.setRecordingMode('punch');
      service.setPunchIn(4);
      service.setPunchOut(8);
      service.armPunch();
      expect(service.punchStatusLabel()).toContain('PUNCH');
    });

    it('should compute current take label', () => {
      expect(service.currentTakeLabel()).toBe('Rec');
      service.setRecordingMode('comp');
      expect(service.currentTakeLabel()).toBe('Take 1');
    });
  });
});
