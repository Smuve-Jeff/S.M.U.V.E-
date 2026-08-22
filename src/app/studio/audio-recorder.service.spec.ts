import { TestBed } from '@angular/core/testing';
import { AudioRecorderService } from './audio-recorder.service';
import { LocalStorageService } from '../services/local-storage.service';
import { LoggingService } from '../services/logging.service';

describe('AudioRecorderService', () => {
  let service: AudioRecorderService;
  let localStorageMock: any;
  let loggerMock: any;

  beforeEach(() => {
    localStorageMock = { saveItem: jest.fn(), getItem: jest.fn(), getAllItems: jest.fn() };
    loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        AudioRecorderService,
        { provide: LocalStorageService, useValue: localStorageMock },
        { provide: LoggingService, useValue: loggerMock },
      ],
    });
    service = TestBed.inject(AudioRecorderService);
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('should start with isRecording false', () => {
    expect(service.isRecording()).toBe(false);
  });

  it('should reject startRecording when stream has no audio tracks', async () => {
    const emptyStream = { getAudioTracks: () => [] } as unknown as MediaStream;
    await expect(service.startRecording(emptyStream)).rejects.toThrow(
      'No audio tracks found in stream'
    );
  });

  it('should start recording with a valid stream', async () => {
    const mediaRecorderMock = {
      start: jest.fn(),
      stop: jest.fn(),
      state: 'inactive',
      ondataavailable: null as any,
      onstop: null as any,
    };
    (globalThis as any).MediaRecorder = jest
      .fn()
      .mockImplementation(() => mediaRecorderMock);
    (MediaRecorder as any).isTypeSupported = jest.fn().mockReturnValue(true);

    const audioTrack = { kind: 'audio' } as MediaStreamTrack;
    const stream = { getAudioTracks: () => [audioTrack] } as unknown as MediaStream;

    await service.startRecording(stream);

    expect(service.isRecording()).toBe(true);
    expect(service.mediaRecorder).toBe(mediaRecorderMock);
    expect(mediaRecorderMock.start).toHaveBeenCalled();
  });

  it('should stop recording and clear state', () => {
    const stopSpy = jest.fn();
    service.mediaRecorder = {
      state: 'recording',
      stop: stopSpy,
    } as unknown as MediaRecorder;

    service.isRecording.set(true);
    service.stopRecording();

    expect(stopSpy).toHaveBeenCalled();
  });

  it('should not throw when stopping a null recorder', () => {
    expect(() => service.stopRecording()).not.toThrow();
  });

  it('should not stop an already inactive recorder', () => {
    const stopSpy = jest.fn();
    service.mediaRecorder = {
      state: 'inactive',
      stop: stopSpy,
    } as unknown as MediaRecorder;

    service.stopRecording();
    expect(stopSpy).not.toHaveBeenCalled();
  });

  it('should revoke recording URLs', () => {
    const revokeSpy = jest.spyOn(URL, 'revokeObjectURL');

    // Manually add a URL to the active set via onstop simulation
    const blob = new Blob(['test'], { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);
    (service as any).activeUrls.add(url);

    service.revokeRecordingUrl(url);

    expect(revokeSpy).toHaveBeenCalled();
  });

  it('should clean up all URLs on destroy', () => {
    const revokeSpy = jest.spyOn(URL, 'revokeObjectURL');
    const blob = new Blob(['test'], { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);
    (service as any).activeUrls.add(url);

    service.ngOnDestroy();

    expect(revokeSpy).toHaveBeenCalled();
  });

  it('should emit recordingFinished$ on mediaRecorder.onstop', async () => {
    let onstopCb: (() => void) | null = null;
    const mediaRecorderMock = {
      start: jest.fn(),
      stop: jest.fn(),
      state: 'recording',
      set ondataavailable(_: any) {},
      set onstop(cb: any) {
        onstopCb = cb;
      },
    };
    (globalThis as any).MediaRecorder = jest
      .fn()
      .mockImplementation(() => mediaRecorderMock);
    (MediaRecorder as any).isTypeSupported = jest.fn().mockReturnValue(true);

    const audioTrack = { kind: 'audio' } as MediaStreamTrack;
    const stream = { getAudioTracks: () => [audioTrack] } as unknown as MediaStream;

    const emitted: any[] = [];
    service.recordingFinished$.subscribe((v) => emitted.push(v));

    await service.startRecording(stream);
    expect(service.isRecording()).toBe(true);

    // Simulate onstop
    onstopCb?.();

    // Let microtasks settle
    await new Promise((r) => setTimeout(r, 10));

    expect(emitted.length).toBe(1);
    expect(emitted[0].id).toMatch(/^rec_/);
    expect(emitted[0].blob).toBeInstanceOf(Blob);
    expect(service.isRecording()).toBe(false);
  });
});