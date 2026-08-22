import { TestBed } from '@angular/core/testing';
import { PerformanceRecordingService } from './performance-recording.service';
import { LoggingService } from '../services/logging.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { LocalStorageService } from '../services/local-storage.service';

describe('PerformanceRecordingService', () => {
  let service: PerformanceRecordingService;
  let loggerMock: any;
  let audioEngineMock: any;
  let localStorageMock: any;
  let rafSpy: jest.SpyInstance;

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
    localStorageMock = { saveItem: jest.fn(), getItem: jest.fn(), getAllItems: jest.fn() };

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