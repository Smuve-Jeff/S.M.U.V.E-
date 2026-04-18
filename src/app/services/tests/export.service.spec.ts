import { TestBed } from '@angular/core/testing';
import { ExportService } from '../export.service';
import { AudioEngineService } from '../audio-engine.service';

describe('ExportService', () => {
  let service: ExportService;
  let audioEngineMock: any;
  let mediaRecorderMock: any;

  beforeEach(() => {
    audioEngineMock = {
      getContext: jest.fn().mockReturnValue({
        sampleRate: 44100,
        createBuffer: jest.fn().mockReturnValue({
          numberOfChannels: 2,
          length: 44100,
          sampleRate: 44100,
          getChannelData: jest.fn().mockReturnValue(new Float32Array(44100)),
        }),
      }),
      resume: jest.fn(),
      getMasterStream: jest.fn().mockReturnValue({
        stream: {},
      }),
    };

    mediaRecorderMock = class {
      static isTypeSupported = jest.fn().mockReturnValue(true);
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      mimeType = 'audio/webm';
      state = 'inactive';
      constructor(
        public stream: MediaStream,
        public options: MediaRecorderOptions = {}
      ) {}
      start = jest.fn(() => {
        this.state = 'recording';
      });
      stop = jest.fn(() => {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['sample']) });
        this.onstop?.();
      });
    };
    (globalThis as any).MediaRecorder = mediaRecorderMock;

    TestBed.configureTestingModule({
      providers: [
        ExportService,
        { provide: AudioEngineService, useValue: audioEngineMock },
      ],
    });
    service = TestBed.inject(ExportService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should correctly encode AudioBuffer to WAV', () => {
    const sampleRate = 44100;
    const length = 100;
    const buffer = {
      numberOfChannels: 1,
      sampleRate: sampleRate,
      length: length,
      getChannelData: (c: number) => new Float32Array(length).fill(0.5),
    } as any;

    const wavArrayBuffer = service.audioBufferToWav(buffer);
    const view = new DataView(wavArrayBuffer);

    // Check RIFF header
    expect(view.getUint8(0)).toBe('R'.charCodeAt(0));
    expect(view.getUint8(1)).toBe('I'.charCodeAt(0));
    expect(view.getUint8(2)).toBe('F'.charCodeAt(0));
    expect(view.getUint8(3)).toBe('F'.charCodeAt(0));

    // Check WAVE header
    expect(view.getUint8(8)).toBe('W'.charCodeAt(0));
    expect(view.getUint8(9)).toBe('A'.charCodeAt(0));
    expect(view.getUint8(10)).toBe('V'.charCodeAt(0));
    expect(view.getUint8(11)).toBe('E'.charCodeAt(0));

    // Check audio format at offset 20 (1 = PCM)
    expect(view.getUint16(20, true)).toBe(1);

    // Check sample rate at offset 24
    expect(view.getUint32(24, true)).toBe(sampleRate);

    // Check bits per sample at offset 34
    expect(view.getUint16(34, true)).toBe(16);
  });

  it('starts high-quality live recording with supported codec', async () => {
    mediaRecorderMock.isTypeSupported.mockImplementation(
      (type: string) => type === 'audio/webm;codecs=opus'
    );

    const { recorder, result } = service.startLiveRecording();

    expect(audioEngineMock.resume).toHaveBeenCalled();
    expect(recorder.options).toEqual({
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 256000,
    });

    recorder.stop();
    const blob = await result;
    expect(blob.type).toBe('audio/webm;codecs=opus');
  });

  it('falls back safely when no explicit mime type is supported', async () => {
    mediaRecorderMock.isTypeSupported.mockReturnValue(false);

    const { recorder, result } = service.startLiveRecording();

    expect(recorder.options).toEqual({ audioBitsPerSecond: 256000 });
    recorder.stop();
    const blob = await result;
    expect(blob.type).toBe('audio/webm');
  });
});
