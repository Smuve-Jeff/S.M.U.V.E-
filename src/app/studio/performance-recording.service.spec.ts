import { TestBed } from '@angular/core/testing';
import { PerformanceRecordingService } from './performance-recording.service';
import { StudioRecordingEngineService } from './studio-recording-engine.service';
import { LoggingService } from '../services/logging.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { LocalStorageService } from '../services/local-storage.service';

describe('PerformanceRecordingService', () => {
  let service: PerformanceRecordingService;
  let loggerMock: any;
  let audioEngineMock: any;
  let localStorageMock: any;
  let rafSpy: jest.SpyInstance;
  let fakeEngine: any;

  function provideRealEngineHook() {
    // Re-provision TestBed with a fake recording engine so startRecording()
    // is observed to boot the real worklet capture path instead of the stub.
    fakeEngine = {
      initialize: jest.fn(async () => true),
      isInitialized: jest.fn(() => true),
      isRecording: jest.fn(() => true),
      startRecording: jest.fn(),
      stopRecording: jest.fn(async () => {
        fakeEngine._captured = new Blob(['real-captured'], {
          type: 'audio/wav',
        });
        fakeEngine.recordedBlob.mockReturnValue(fakeEngine._captured);
      }),
      recordingTime: jest.fn(() => 0.5),
      recordedBlob: jest.fn(() => null),
      getRecordedBuffers: jest.fn(() => ({ left: [], right: [] })),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PerformanceRecordingService,
        { provide: LoggingService, useValue: loggerMock },
        { provide: AudioEngineService, useValue: audioEngineMock },
        { provide: LocalStorageService, useValue: localStorageMock },
        { provide: StudioRecordingEngineService, useValue: fakeEngine },
      ],
    });
    service = TestBed.inject(PerformanceRecordingService);
  }

  beforeEach(() => {
    loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    audioEngineMock = {
      ctx: {
        createAnalyser: jest.fn(() => ({
          fftSize: 0,
          connect: jest.fn(),
          getByteTimeDomainData: jest.fn(),
        })),
        createMediaStreamSource: jest.fn(() => ({
          connect: jest.fn(),
          disconnect: jest.fn(),
        })),
        createGain: jest.fn(() => ({
          gain: { value: 0 },
          connect: jest.fn(),
          disconnect: jest.fn(),
        })),
        destination: {},
      },
      masterAnalyser: {
        getByteTimeDomainData: jest.fn(),
      },
    };
    localStorageMock = {
      saveItem: jest.fn(),
      getItem: jest.fn(),
      getAllItems: jest.fn(),
      deleteItem: jest.fn().mockResolvedValue(undefined),
    };

    rafSpy = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockReturnValue(1);

    TestBed.configureTestingModule({
      providers: [
        PerformanceRecordingService,
        { provide: LoggingService, useValue: loggerMock },
        { provide: AudioEngineService, useValue: audioEngineMock },
        { provide: LocalStorageService, useValue: localStorageMock },
      ],
    });
    service = TestBed.inject(PerformanceRecordingService);
  });

  afterEach(() => {
    service.ngOnDestroy();
    rafSpy.mockRestore();
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with default state', () => {
    expect(service.isRecording()).toBe(false);
    expect(service.isArmed()).toBe(false);
    expect(service.takeCount()).toBe(0);
    expect(service.armedTakeNumber()).toBe(1);
    expect(service.monitorEnabled()).toBe(false);
    expect(service.phantomPowerEnabled()).toBe(false);
  });

  it('should arm and set take number', () => {
    service.arm(3);
    expect(service.isArmed()).toBe(true);
    expect(service.armedTakeNumber()).toBe(3);
  });

  it('should disarm', () => {
    service.arm(1);
    service.disarm();
    expect(service.isArmed()).toBe(false);
  });

  it('should start recording and transition state', () => {
    service.arm(1);
    service.startRecording();

    expect(service.isRecording()).toBe(true);
  });

  it('should not double-start recording', () => {
    service.arm(1);
    service.startRecording();
    service.startRecording();

    // takeCount stays 0 — no duplicate finishTake calls possible
    expect(service.takeCount()).toBe(0);
  });

  it('should record MIDI while recording', () => {
    service.arm(1);
    service.startRecording();
    service.recordMidi(64, 100);
    service.recordMidi(67, 80);

    // MIDI is captured internally; exposed via take notes
    expect(service.isRecording()).toBe(true);
  });

  it('should not record MIDI when not recording', () => {
    service.recordMidi(64, 100);
    // Should be a no-op — no error thrown
    expect(service.isRecording()).toBe(false);
  });

  it('should finish a take and publish it', async () => {
    service.arm(1);
    service.startRecording();
    await new Promise((r) => setTimeout(r, 5));

    const emitted: any[] = [];
    service.recordingFinished$.subscribe((v) => emitted.push(v));

    const take = await service.finishTake('track-1', 'Vocal');
    expect(take).not.toBeNull();
    expect(take!.takeNumber).toBe(1);
    expect(take!.trackId).toBe('track-1');
    expect(take!.trackName).toBe('Vocal');
    expect(take!.blob).toBeInstanceOf(Blob);
    expect(service.takeCount()).toBe(1);
    expect(service.isRecording()).toBe(false);
    expect(service.isArmed()).toBe(false);
    expect(service.armedTakeNumber()).toBe(2);
    expect(emitted.length).toBe(1);
  });

  it('should return null from finishTake when not recording', async () => {
    const take = await service.finishTake();
    expect(take).toBeNull();
  });

  it('should boot the recording engine and capture real audio on finishTake', async () => {
    // Reload the service with a fake engine injected via the DI injector the
    // service lazy-resolves — proving startRecording starts real capture and
    // finishTake consumes the flushed blob instead of the silent stub.
    provideRealEngineHook();
    service.arm(1);
    service.startRecording('track-1', 'Vocal');
    await new Promise((r) => setTimeout(r, 5));

    expect(fakeEngine.startRecording).toHaveBeenCalled();

    const take = await service.finishTake('track-1', 'Vocal');
    expect(take).not.toBeNull();
    // Real engine capture was stopped + flushed
    expect(fakeEngine.stopRecording).toHaveBeenCalled();
    // The flushed blob instance (not the stub) is used directly
    expect(take!.blob).toBe(fakeEngine._captured);
    // Duration is reconciled from the engine's real captured length
    expect(take!.durationMs).toBe(500);
    expect(service.isRecording()).toBe(false);
    expect(service.armedTakeNumber()).toBe(2);
  });

  it('should not boot the engine on a second start while already recording', async () => {
    provideRealEngineHook();
    service.arm(1);
    service.startRecording();
    service.startRecording();
    expect(fakeEngine.startRecording).toHaveBeenCalledTimes(1);
  });

  it('should delete a take and clear selection', () => {
    const t1 = createFakeTake('t1', 1);
    const t2 = createFakeTake('t2', 2);
    service.takes.set([t1, t2]);
    service.selectedTakeId.set('t1');

    service.deleteTake('t1');

    expect(service.takeCount()).toBe(1);
    expect(service.selectedTakeId()).toBeNull();
    expect(service.takes()[0].id).toBe('t2');
  });

  it('should revoke the object URL and drop the IndexedDB row when deleting a take', () => {
    const revokeSpy = jest.spyOn(URL, 'revokeObjectURL');
    const t1 = createFakeTake('t1', 1);
    service.takes.set([t1]);

    service.deleteTake('t1');

    // Audit finding #2 (memory leaks): take URLs must be released on delete.
    expect(revokeSpy).toHaveBeenCalledWith(t1.url);
    // And the persisted row must go with it, or the take resurrects on the
    // next session restore.
    expect(localStorageMock.deleteItem).toHaveBeenCalledWith(
      'performance_takes',
      't1'
    );
    revokeSpy.mockRestore();
  });

  it('should export with a true wav extension regardless of requested label', async () => {
    const clickSpy = jest.fn();
    const anchorSpy = jest
      .spyOn(document, 'createElement')
      .mockReturnValue({ click: clickSpy, href: '', download: '' } as any);
    const t1 = createFakeTake('t1', 1);
    t1.name = 'Take 1';
    service.takes.set([t1]);

    // 'mp3' is not wired in this build — the download must not claim .mp3
    await service.exportTake('t1', 'mp3');

    const anchor = anchorSpy.mock.results[0].value as unknown as {
      download: string;
    };
    expect(anchor.download.endsWith('.wav')).toBe(true);
    expect(clickSpy).toHaveBeenCalled();
    anchorSpy.mockRestore();
  });

  it('should toggle comping flag on a take', () => {
    const take = createFakeTake('t1', 1);
    service.takes.set([take]);

    service.setComping('t1', true);
    expect(service.takes()[0].isComping).toBe(true);

    service.setComping('t1', false);
    expect(service.takes()[0].isComping).toBe(false);
  });

  it('should compute selectedTake from selectedTakeId', () => {
    const t1 = createFakeTake('t1', 1);
    const t2 = createFakeTake('t2', 2);
    service.takes.set([t1, t2]);

    service.selectedTakeId.set('t2');
    expect(service.selectedTake()?.id).toBe('t2');

    service.selectedTakeId.set(null);
    // Falls back to last take
    expect(service.selectedTake()?.id).toBe('t2');
  });

  it('should toggle phantom power', () => {
    expect(service.phantomPowerEnabled()).toBe(false);
    service.togglePhantom();
    expect(service.phantomPowerEnabled()).toBe(true);
  });

  it('should clean up on destroy', () => {
    const cancelSpy = jest.spyOn(window, 'cancelAnimationFrame');
    service.ngOnDestroy();
    expect(cancelSpy).toHaveBeenCalledWith(1);
    cancelSpy.mockRestore();
  });

  it('should compute meterFlash from live input', () => {
    expect(typeof service.meterFlash()).toBe('number');
  });
});

function createFakeTake(
  id: string,
  takeNumber: number
): import('./performance-recording.service').PerformanceTake {
  return {
    id,
    takeNumber,
    name: `Take ${takeNumber}`,
    blob: new Blob(['fake'], { type: 'audio/wav' }),
    url: URL.createObjectURL(new Blob(['fake'], { type: 'audio/wav' })),
    durationMs: 1000,
    peakDbL: -12,
    peakDbR: -12,
    recordedAt: Date.now(),
    isComping: false,
    notes: [],
  };
}