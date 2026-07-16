import { TestBed } from '@angular/core/testing';
import { ExportService } from '../export.service';
import { AudioEngineService } from '../audio-engine.service';
import { MusicManagerService } from '../music-manager.service';
import { LoggingService } from '../logging.service';

describe('ExportService', () => {
  let service: ExportService;
  let audioEngineMock: any;
  let mediaRecorderMock: any;

  beforeEach(() => {
    const mockCtx = {
      sampleRate: 44100,
      currentTime: 0,
      state: 'running',
      destination: {} as any,
      createGain: jest.fn().mockReturnValue({
        gain: { value: 0, setTargetAtTime: jest.fn(), setValueAtTime: jest.fn() },
        connect: jest.fn(),
      }),
      createBuffer: jest.fn().mockReturnValue({
        numberOfChannels: 2,
        length: 44100,
        sampleRate: 44100,
        getChannelData: jest.fn().mockReturnValue(new Float32Array(44100)),
      }),
      createMediaStreamDestination: jest.fn().mockReturnValue({
        stream: new MediaStream(),
      }),
      createBufferSource: jest.fn().mockReturnValue({
        buffer: null,
        connect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
        playbackRate: { setValueAtTime: jest.fn() },
      }),
      createStereoPanner: jest.fn().mockReturnValue({
        pan: { setValueAtTime: jest.fn(), value: 0 },
        connect: jest.fn(),
      }),
      resume: jest.fn(),
      createOscillator: jest.fn().mockReturnValue({
        type: 'sine',
        frequency: { setValueAtTime: jest.fn(), value: 440 },
        connect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
      }),
    };

    audioEngineMock = {
      ctx: mockCtx,
      masterGain: mockCtx.createGain(),
      limiter: mockCtx.createGain(),
      masterAnalyser: {
        connect: jest.fn(),
        frequencyBinCount: 1024,
        getByteFrequencyData: jest.fn(),
        getByteTimeDomainData: jest.fn(),
      },
      getContext: jest.fn().mockReturnValue(mockCtx),
      resume: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      isPlaying: jest.fn().mockReturnValue(false),
      isRecording: jest.fn().mockReturnValue(false),
      tempo: jest.fn().mockReturnValue(124),
      getMasterStream: jest.fn().mockReturnValue({
        stream: { getAudioTracks: jest.fn().mockReturnValue([]) },
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
        {
          provide: MusicManagerService,
          useValue: {
            playStep: jest.fn(),
          },
        },
        {
          provide: LoggingService,
          useValue: {
            system: jest.fn(),
            info: jest.fn(),
          },
        },
      ],
    });
    service = TestBed.inject(ExportService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should correctly encode AudioBuffer to WAV', async () => {
    const sampleRate = 44100;
    const length = 100;
    const buffer = {
      numberOfChannels: 1,
      sampleRate: sampleRate,
      length: length,
      getChannelData: (_channel: number) => new Float32Array(length).fill(0.5),
    } as any;

    const wavArrayBuffer = await service.audioBufferToWav(buffer);
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

  it('starts live recording and creates a media stream destination', () => {
    const { recorder, result } = service.startLiveRecording();

    expect(audioEngineMock.ctx.createMediaStreamDestination).toHaveBeenCalled();
    expect(audioEngineMock.masterGain.connect).toHaveBeenCalled();
    expect(recorder).toBeDefined();
    expect(recorder.start).toHaveBeenCalled();

    recorder.stop();
    return expect(result).resolves.toBeInstanceOf(Blob);
  });

  it('can stop a live recording and receive a blob', async () => {
    const { recorder, result } = service.startLiveRecording();

    recorder.stop();
    const blob = await result;
    expect(blob).toBeInstanceOf(Blob);
  });

  it('returns a stub video export result', async () => {
    const canvas = {} as HTMLCanvasElement;
    const { recorder, result } = await service.startVideoExport(canvas);

    expect(recorder).toBeDefined();
    expect(typeof recorder.stop).toBe('function');
    const blob = await result;
    expect(blob).toBeInstanceOf(Blob);
  });
});
