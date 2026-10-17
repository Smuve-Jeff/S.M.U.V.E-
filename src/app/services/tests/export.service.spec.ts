import { TestBed } from '@angular/core/testing';
import { ExportService } from '../export.service';
import { AudioEngineService } from '../audio-engine.service';
import { MusicManagerService } from '../music-manager.service';
import { LoggingService } from '../logging.service';
import { VideoEngineService } from '../video-engine.service';

describe('ExportService', () => {
  let service: ExportService;
  let audioEngineMock: any;
  let mediaRecorderMock: any;
  let videoEngineMock: any;
  /** Every recorder this suite created, so a test can end one mid-capture. */
  let recorders: any[] = [];

  beforeEach(() => {
    const mockCtx = {
      sampleRate: 44100,
      currentTime: 0,
      state: 'running',
      destination: {} as any,
      createGain: jest.fn().mockReturnValue({
        gain: {
          value: 0,
          setTargetAtTime: jest.fn(),
          setValueAtTime: jest.fn(),
        },
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

    recorders = [];
    mediaRecorderMock = class {
      static isTypeSupported = jest.fn().mockReturnValue(true);
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: ((event: { error: Error }) => void) | null = null;
      mimeType = 'audio/webm';
      state = 'inactive';
      constructor(
        public stream: MediaStream,
        public options: MediaRecorderOptions = {}
      ) {
        recorders.push(this);
      }
      start = jest.fn(() => {
        this.state = 'recording';
      });
      stop = jest.fn(() => {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['sample']) });
        this.onstop?.();
      });
      fail = jest.fn((error: Error) => {
        this.state = 'inactive';
        this.onerror?.({ error });
      });
    };
    (globalThis as any).MediaRecorder = mediaRecorderMock;

    videoEngineMock = {
      isPlaying: jest.fn().mockReturnValue(false),
      pause: jest.fn(),
      play: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        ExportService,
        { provide: AudioEngineService, useValue: audioEngineMock },
        { provide: VideoEngineService, useValue: videoEngineMock },
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
            warn: jest.fn(),
            error: jest.fn(),
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

  it('captures the preview canvas into a real video recording', async () => {
    const canvas = {
      captureStream: jest.fn().mockReturnValue({ addTrack: jest.fn() }),
    } as unknown as HTMLCanvasElement;

    const { recorder, result } = await service.startVideoExport(canvas, {
      fps: 30,
    });

    expect(canvas.captureStream).toHaveBeenCalledWith(30);
    expect(recorder).toBeDefined();
    expect(typeof recorder.stop).toBe('function');

    recorder.stop();
    const blob = await result;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('refuses a canvas that cannot be captured', async () => {
    await expect(
      service.startVideoExport({} as HTMLCanvasElement)
    ).rejects.toThrow(/Canvas capture/);
  });

  /**
   * A capture always rolls the timeline, but it can also end on a path the
   * caller's capture window never sees. The transport has to be handed back
   * either way, otherwise the timeline is left rolling with no export to show.
   */
  describe('transport handoff around a capture', () => {
    const canvas = () =>
      ({
        captureStream: jest.fn().mockReturnValue({ addTrack: jest.fn() }),
      }) as unknown as HTMLCanvasElement;

    it('stops the timeline when the recorder ends before the capture window', async () => {
      // Transport idle before the take: it must be idle again afterwards.
      videoEngineMock.isPlaying.mockReturnValue(false);

      const { result } = await service.startVideoExport(canvas());
      recorders[0].fail(new Error('display track ended'));

      await expect(result).rejects.toThrow('display track ended');
      expect(videoEngineMock.pause).toHaveBeenCalled();
      expect(videoEngineMock.play).not.toHaveBeenCalled();
    });

    it('resumes the timeline when it was rolling before the take', async () => {
      videoEngineMock.isPlaying.mockReturnValue(true);

      const { result } = await service.startVideoExport(canvas());
      recorders[0].fail(new Error('recorder crashed'));

      await expect(result).rejects.toThrow('recorder crashed');
      expect(videoEngineMock.pause).toHaveBeenCalled();
      expect(videoEngineMock.play).toHaveBeenCalled();
    });

    it('hands the transport back after a normal stop without resuming', async () => {
      videoEngineMock.isPlaying.mockReturnValue(false);

      const { recorder, result } = await service.startVideoExport(canvas());
      recorder.stop();
      await result;

      // A late `onerror` must not roll the timeline a second time.
      recorders[0].fail(new Error('late error'));

      expect(videoEngineMock.pause).toHaveBeenCalledTimes(1);
      expect(videoEngineMock.play).not.toHaveBeenCalled();
    });
  });
});
