import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { RecordingWaveformComponent } from './recording-waveform.component';
import { WaveformRendererComponent } from '../waveform-renderer/waveform-renderer.component';
import { StudioRecordingEngineService } from '../studio-recording-engine.service';
import { RecordingLimiterService } from '../recording-limiter.service';

describe('RecordingWaveformComponent', () => {
  let component: RecordingWaveformComponent;
  let fixture: ComponentFixture<RecordingWaveformComponent>;
  let engineMock: any;
  let limiterMock: any;
  let rafSpy: jest.SpyInstance;
  let cafSpy: jest.SpyInstance;
  let rafCallbacks: Array<FrameRequestCallback> = [];
  let mockTime = 0;

  beforeEach(async () => {
    rafCallbacks = [];
    mockTime = 0;
    rafSpy = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      });
    cafSpy = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    engineMock = {
      isRecording: signal(false),
      recordingTime: signal(0),
      getAnalyserNode: jest.fn().mockReturnValue(null),
    } as any;

    limiterMock = {
      headroomPercent: signal(0),
      peakInputDb: signal(-60),
      isLimitingActive: signal(false),
      enabled: signal(true),
      setEnabled: jest.fn((v: boolean) => limiterMock.enabled.set(v)),
    } as any;

    await TestBed.configureTestingModule({
      imports: [RecordingWaveformComponent],
      providers: [
        { provide: StudioRecordingEngineService, useValue: engineMock },
        { provide: RecordingLimiterService, useValue: limiterMock },
      ],
    }).compileComponents();

    // Stub any rendered child canvas context so the waveform child is inert.
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: jest.fn().mockReturnValue(null),
      writable: true,
      configurable: true,
    });

    fixture = TestBed.createComponent(RecordingWaveformComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    component.ngOnDestroy();
    rafSpy.mockRestore();
    cafSpy.mockRestore();
  });

  function runFrames(count: number) {
    mockTime = 0;
    for (let i = 0; i < count; i++) {
      const cb = rafCallbacks.shift();
      mockTime += 40; // advance past the 33ms throttle so frames actually sample
      if (cb) cb(mockTime);
    }
  }

  it('creates and formats zero time', () => {
    expect(component).toBeTruthy();
    expect(component.recordingTimeFormatted()).toBe('00:00.0');
  });

  it('formats elapsed recording time', () => {
    engineMock.recordingTime.set(65.4);
    expect(component.recordingTimeFormatted()).toBe('01:05.4');
  });

  it('accumulates live analyser frames into a growing waveform buffer', () => {
    const frame = new Float32Array(2048).fill(0.3);
    // Simulate incoming capture frames feeding the sampling accumulator.
    (component as any).appendSamples(frame);
    expect(component.waveformData()).not.toBeNull();
    expect(component.waveformData()!.length).toBe(2048);
    (component as any).appendSamples(frame);
    expect(component.waveformData()!.length).toBe(4096);
  });

  it('caps the rolling waveform buffer while recording', () => {
    const buffer = new Float32Array(2048);
    engineMock.getAnalyserNode.mockReturnValue({
      getFloatTimeDomainData: (b: Float32Array) => b.set(buffer),
    });
    engineMock.isRecording.set(true);

    // Push well past the cap (capSamples = 48000*20) through the rAF loop.
    const needed = Math.ceil((48000 * 20) / 2048) + 5;
    runFrames(needed);
    expect(component.waveformData()).not.toBeNull();
    expect(component.waveformData()!.length).toBeLessThanOrEqual(48000 * 20);
  });

  it('resetWaveform clears captured data', () => {
    component.waveformData.set(new Float32Array(10));
    component.resetWaveform();
    expect(component.waveformData()).toBeNull();
  });

  it('toggleLimiter delegates to the limiter service', () => {
    component.toggleLimiter();
    expect(limiterMock.setEnabled).toHaveBeenCalledWith(false);
    component.toggleLimiter();
    expect(limiterMock.setEnabled).toHaveBeenCalledWith(true);
  });
});