import { TestBed } from '@angular/core/testing';
import { StudioRecordingEngineService } from './studio-recording-engine.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { AudioEngineLatencyService } from '../services/audio-engine-latency.service';
import { LoggingService } from '../services/logging.service';
import { LocalStorageService } from '../services/local-storage.service';

describe('StudioRecordingEngineService', () => {
  let service: StudioRecordingEngineService;
  let audioCtxMock: any;
  let mediaStreamMock: MediaStream;

  beforeEach(() => {
    // Mock AudioContext
    audioCtxMock = {
      sampleRate: 48000,
      createAnalyser: jest.fn(() => ({
        fftSize: 0,
        connect: jest.fn(),
        getByteFrequencyData: jest.fn(),
        frequencyBinCount: 128,
        disconnect: jest.fn(),
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
      audioWorklet: {
        addModule: jest.fn().mockResolvedValue(undefined),
      },
    };

    mediaStreamMock = {
      getAudioTracks: () => [{ kind: 'audio', stop: jest.fn() } as unknown as MediaStreamTrack],
      getTracks: () => [{ kind: 'audio', stop: jest.fn() } as unknown as MediaStreamTrack],
    } as unknown as MediaStream;

    // Mock getUserMedia
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: jest.fn().mockResolvedValue(mediaStreamMock) },
      writable: true,
      configurable: true,
    });

    TestBed.configureTestingModule({
      providers: [
        StudioRecordingEngineService,
        { provide: AudioEngineService, useValue: { ctx: audioCtxMock } },
        { provide: AudioEngineLatencyService, useValue: { getAppliedCompensationMs: () => 0 } },
        { provide: LoggingService, useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } },
        { provide: LocalStorageService, useValue: { saveItem: jest.fn(), getItem: jest.fn() } },
      ],
    });
    service = TestBed.inject(StudioRecordingEngineService);
  });

  it('should create with default state', () => {
    expect(service.isInitialized()).toBe(false);
    expect(service.isRecording()).toBe(false);
    expect(service.isPaused()).toBe(false);
    expect(service.recordingTime()).toBe(0);
    expect(service.takes().length).toBe(0);
  });

  it('should return empty buffers when not recording', () => {
    const buffers = service.getRecordedBuffers();
    expect(buffers.left).toEqual([]);
    expect(buffers.right).toEqual([]);
  });

  it('should return null analyser when not initialized', () => {
    expect(service.getAnalyserNode()).toBeNull();
  });

  it('should refuse to start recording without initialization', () => {
    service.startRecording();
    expect(service.isRecording()).toBe(false);
  });

  it('should not double-start recording', () => {
    // Force internal state
    (service as any).isRecording.set(true);
    service.startRecording();
    // Still true, never called again
    expect(service.isRecording()).toBe(true);
  });

  it('should pause and resume recording', () => {
    // Simulate recording state
    (service as any).isRecording.set(true);
    (service as any).recordingWorkletReady = true;

    service.pauseRecording();
    expect(service.isPaused()).toBe(true);

    service.resumeRecording();
    expect(service.isPaused()).toBe(false);
  });

  it('should not stop when not recording', async () => {
    await service.stopRecording();
    expect(service.isRecording()).toBe(false);
  });

  it('should clean up on destroy', () => {
    // Set some internal state to verify cleanup
    (service as any).isInitialized.set(true);
    service.ngOnDestroy();
    expect(service.isInitialized()).toBe(false);
    expect(service.isRecording()).toBe(false);
  });

  it('should return recorded blob when set', () => {
    expect(service.recordedBlob()).toBeNull();
    const blob = new Blob(['test'], { type: 'audio/wav' });
    service.recordedBlob.set(blob);
    expect(service.recordedBlob()).toBe(blob);
  });
});