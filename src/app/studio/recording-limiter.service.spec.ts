import { TestBed } from '@angular/core/testing';
import { RecordingLimiterService } from './recording-limiter.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { LoggingService } from '../services/logging.service';

describe('RecordingLimiterService', () => {
  let service: RecordingLimiterService;
  let ctxMock: any;
  let rafSpy: jest.SpyInstance;
  let cafSpy: jest.SpyInstance;

  beforeEach(() => {
    let connectCalls: string[] = [];
    ctxMock = {
      createDynamicsCompressor: jest.fn(() => ({
        threshold: { value: 0 },
        ratio: { value: 1 },
        knee: { value: 0 },
        attack: { value: 0 },
        release: { value: 0 },
        connect: jest.fn(),
        disconnect: jest.fn(),
      })),
      createAnalyser: jest.fn(() => ({
        fftSize: 0,
        connect: jest.fn(),
        disconnect: jest.fn(),
        getFloatTimeDomainData: jest.fn((buf: Float32Array) => buf.fill(0)),
      })),
    };

    rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    cafSpy = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    TestBed.configureTestingModule({
      providers: [
        RecordingLimiterService,
        { provide: AudioEngineService, useValue: { ctx: ctxMock } },
        { provide: LoggingService, useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } },
      ],
    });
    service = TestBed.inject(RecordingLimiterService);
  });

  afterEach(() => {
    service.ngOnDestroy();
    rafSpy.mockRestore();
    cafSpy.mockRestore();
  });

  it('starts with sensible defaults', () => {
    expect(service.enabled()).toBe(true);
    expect(service.thresholdDb()).toBe(-6);
    expect(service.ratio()).toBe(20);
    expect(service.peakInputDb()).toBe(-60);
    expect(service.isLimitingActive()).toBe(false);
  });

  it('passes through untouched when disabled', () => {
    service.setEnabled(false);
    const source = { foo: 1 } as any;
    const result = service.connectToRecordingChain(source);
    expect(result).toBe(source);
    expect(ctxMock.createDynamicsCompressor).not.toHaveBeenCalled();
  });

  it('engages a compressor and returns it as downstream when enabled', () => {
    const source = { connect: jest.fn() } as any;
    const result = service.connectToRecordingChain(source);
    expect(ctxMock.createDynamicsCompressor).toHaveBeenCalledTimes(1);
    expect(ctxMock.createAnalyser).toHaveBeenCalledTimes(2);
    expect(result).not.toBe(source);
    expect(source.connect).toHaveBeenCalledTimes(2); // input analyser + compressor
    expect(service.isLimitingActive()).toBe(false);
  });

  it('updates an engaged compressor parameters reactively', () => {
    const source = { connect: jest.fn() } as any;
    const comp = service.connectToRecordingChain(source) as any;
    service.setThresholdDb(-10);
    service.setRatio(4);
    service.setKneeDb(6);
    service.setReleaseTimeMs(250);
    expect(comp.threshold.value).toBe(-10);
    expect(comp.ratio.value).toBe(4);
    expect(comp.knee.value).toBe(6);
    expect(comp.release.value).toBe(0.25);
  });

  it('reports limiting active when input exceeds threshold', () => {
    service.peakInputDb.set(-3);
    expect(service.isLimitingActive()).toBe(true);
    service.peakInputDb.set(-30);
    expect(service.isLimitingActive()).toBe(false);
  });

  it('maps headroom percent to a 0-100 perceptual scale', () => {
    service.peakInputDb.set(-60);
    expect(service.headroomPercent()).toBe(0);
    service.peakInputDb.set(0);
    expect(service.headroomPercent()).toBe(100);
    service.peakInputDb.set(-18);
    expect(service.headroomPercent()).toBeCloseTo(70, 4);
  });

  it('disconnects and resets the graph', () => {
    const source = { connect: jest.fn() } as any;
    service.connectToRecordingChain(source);
    const comp = service['compressor'];
    service.disconnect();
    expect(service['compressor']).toBeNull();
    expect(comp.disconnect).toHaveBeenCalled();
  });
});