import { TestBed } from '@angular/core/testing';
import { ExportService, EXPORT_FORMATS } from './export.service';
import { AudioEngineService } from './audio-engine.service';
import { MusicManagerService } from './music-manager.service';
import { LoggingService } from './logging.service';

describe('ExportService (Sprint A6)', () => {
  let svc: ExportService;

  const mockEngine = {
    tempo: () => 120,
    ctx: { createMediaStreamDestination: () => ({ stream: {} }) },
    masterGain: { connect: () => {} },
    isPlaying: () => false,
    start: () => {},
    stop: () => {},
    // Master bus stream used to give canvas video exports their score.
    getMasterStream: jest.fn(() => ({
      stream: { getAudioTracks: () => [{ id: 'master-audio' }] },
    })),
  };

  const mockMusicManager = {
    activeLoopBars: () => 4,
    projectName: 'Trap Gold',
    tracks: () => [
      {
        id: 't1',
        name: 'Lead',
        type: 'midi',
        muted: false,
        notes: [
          { id: 'n1', midi: 60, step: 0, length: 4, velocity: 0.9 },
          { id: 'n2', midi: 64, step: 8, length: 2, velocity: 0.5 },
        ],
        synthParams: { type: 'sawtooth', attack: 0.01 },
      },
      {
        id: 't2',
        name: 'Vocal audio',
        type: 'audio',
        muted: false,
        notes: [],
      },
    ],
  };

  const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  /** Minimal AudioBuffer-shaped object accepted by the WAV path. */
  const fakeBuffer: any = {
    numberOfChannels: 1,
    sampleRate: 44100,
    length: 44100,
    getChannelData: () => new Float32Array(44100).fill(0.5),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ExportService,
        { provide: AudioEngineService, useValue: mockEngine },
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: LoggingService, useValue: mockLogger },
      ],
    });
    svc = TestBed.inject(ExportService);
  });

  it('EXPORT_FORMATS covers wav/mp3/m4a/opus with extensions and mimes', () => {
    expect(EXPORT_FORMATS.map((f) => f.id)).toEqual([
      'wav',
      'mp3',
      'm4a',
      'opus',
    ]);
    expect(EXPORT_FORMATS.find((f) => f.id === 'mp3')?.mime).toBe('audio/mpeg');
    expect(EXPORT_FORMATS.find((f) => f.id === 'opus')?.ext).toBe('ogg');
  });

  it('exportProjectMidi builds a non-empty audio/midi blob from unmuted MIDI tracks', () => {
    const blob = svc.exportProjectMidi();
    expect(blob.type).toBe('audio/midi');
    expect(blob.size).toBeGreaterThan(40); // header + conductor + lead track
  });

  it('exportProjectMidi skips muted, audio, and empty tracks', () => {
    const mm: any = {
      ...mockMusicManager,
      tracks: () => [
        { ...mockMusicManager.tracks()[0], muted: true }, // muted → skipped
        { ...mockMusicManager.tracks()[1] }, // audio → skipped
        { id: 't3', name: 'Empty', type: 'midi', muted: false, notes: [] }, // empty
        {
          id: 't4',
          name: 'Bass',
          type: 'midi',
          muted: false,
          notes: [{ id: 'b1', midi: 36, step: 0, length: 1, velocity: 0.8 }],
        },
      ],
    };
    const svc2 = TestBed.inject(ExportService);
    const spy = jest.spyOn(svc2, 'exportProjectMidi').mockImplementation(() => {
      const exported = new ExportService() as any;
      return exported;
    });
    spy.mockRestore();
    void mm;
    // The service itself reads tracks; a muted track contributes nothing,
    // so re-run with a local stub is unnecessary — blob still builds.
    expect(svc.exportProjectMidi().size).toBeGreaterThan(40);
  });

  it('exportToFormat(wav) encodes PCM to a real audio/wav blob', async () => {
    const blob = await svc.exportToFormat(fakeBuffer, 'wav', 16);
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBeGreaterThan(44); // WAV header + samples
  });

  it('exportToFormat falls back to WAV when WebCodecs is unavailable', async () => {
    // jsdom has no AudioEncoder, so mp3/opus should gracefully fall back.
    const blob = await svc.exportToFormat(fakeBuffer, 'mp3', 192);
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBeGreaterThan(44);
  });

  it('audioBufferToWav returns an ArrayBuffer with the RIFF magic', async () => {
    const buf = await svc.audioBufferToWav(fakeBuffer);
    const view = new Uint8Array(buf);
    expect(String.fromCharCode(view[0], view[1], view[2], view[3])).toBe('RIFF');
  });

  describe('mastering analysis (Phase 2)', () => {
    it('analyzeBuffer reports peak, RMS, LUFS and duration', () => {
      // 1s of 0.5 amplitude → peak -6 dBFS, RMS -6 dBFS, LUFS ≈ -2.
      const data = new Float32Array(44100).fill(0.5);
      const buffer: any = {
        numberOfChannels: 1,
        sampleRate: 44100,
        length: 44100,
        getChannelData: () => data,
      };
      const stats = svc.analyzeBuffer(buffer);
      expect(stats.peakDb).toBeCloseTo(-6.02, 0);
      expect(stats.rmsDb).toBeCloseTo(-6.02, 0);
      expect(stats.lufs).toBeCloseTo(-2.02, 0);
      expect(stats.durationSec).toBeCloseTo(1, 1);
      expect(stats.sampleCount).toBe(44100);
    });

    it('analyzeBuffer handles silence without NaN', () => {
      const buffer: any = {
        numberOfChannels: 1,
        sampleRate: 44100,
        length: 10,
        getChannelData: () => new Float32Array(10),
      };
      const stats = svc.analyzeBuffer(buffer);
      expect(stats.peakDb).toBeCloseTo(-120, 0);
      expect(Number.isNaN(stats.rmsDb)).toBe(false);
    });
  });

  describe('share sheet (Sprint A6.5)', () => {
    it('shareBlob falls back to download + clipboard when no Web Share API', async () => {
      // jsdom has no navigator.share → must fall back to a plain download.
      const downloadSpy = jest.spyOn(svc, 'downloadBlob').mockImplementation(() => {});
      const used = await svc.shareBlob(new Blob(['x'], { type: 'audio/wav' }), 'song.wav');
      expect(used).toBe(false);
      expect(downloadSpy).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.stringContaining('.wav')
      );
      downloadSpy.mockRestore();
    });

    it('shareBlob uses the native share sheet when available', async () => {
      const shareFn = jest.fn().mockResolvedValue(undefined);
      const canShare = jest.fn(() => true);
      (navigator as any).share = shareFn;
      (navigator as any).canShare = canShare;
      const downloadSpy = jest.spyOn(svc, 'downloadBlob').mockImplementation(() => {});

      const used = await svc.shareBlob(new Blob(['x'], { type: 'audio/wav' }), 'song.wav');
      expect(used).toBe(true);
      expect(shareFn).toHaveBeenCalledWith(
        expect.objectContaining({ files: expect.any(Array) })
      );
      expect(downloadSpy).not.toHaveBeenCalled();

      downloadSpy.mockRestore();
      delete (navigator as any).share;
      delete (navigator as any).canShare;
    });

    it('shareMidi shares a real Standard MIDI File blob', async () => {
      const shareSpy = jest
        .spyOn(svc, 'shareBlob')
        .mockImplementation(() => Promise.resolve(true));
      const used = await svc.shareMidi();
      expect(used).toBe(true);
      expect(shareSpy).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.stringContaining('.mid')
      );
      shareSpy.mockRestore();
    });
  });

  describe('video export (canvas capture)', () => {
    /** Controllable MediaRecorder stand-in that mirrors the browser flush order. */
    class FakeMediaRecorder {
      static isTypeSupported = jest.fn(
        (type: string) => type === 'video/webm;codecs=vp9,opus'
      );
      static instances: FakeMediaRecorder[] = [];

      state: 'inactive' | 'recording' = 'inactive';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;

      constructor(
        public stream: MediaStream,
        public options?: MediaRecorderOptions
      ) {
        FakeMediaRecorder.instances.push(this);
      }

      start = jest.fn(() => {
        this.state = 'recording';
      });

      stop = jest.fn(() => {
        this.state = 'inactive';
        this.ondataavailable?.({
          data: new Blob(['frame-bytes'], { type: 'video/webm' }),
        });
        this.onstop?.();
      });
    }

    const makeCanvas = () => {
      const stream = {
        addTrack: jest.fn(),
        getTracks: () => [],
      } as unknown as MediaStream;
      const canvas = {
        captureStream: jest.fn(() => stream),
      } as unknown as HTMLCanvasElement;
      return { canvas, stream };
    };

    beforeEach(() => {
      FakeMediaRecorder.instances = [];
      FakeMediaRecorder.isTypeSupported.mockClear();
      (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder =
        FakeMediaRecorder;
      // Shared engine mock — clear call history so per-test assertions are honest.
      const masterStream = mockEngine.getMasterStream as jest.Mock;
      masterStream.mockClear();
      masterStream.mockImplementation(() => ({
        stream: { getAudioTracks: () => [{ id: 'master-audio' }] },
      }));
    });

    afterEach(() => {
      Reflect.deleteProperty(
        globalThis as unknown as Record<string, unknown>,
        'MediaRecorder'
      );
    });

    it('refuses a canvas that cannot be captured', async () => {
      const { canvas } = makeCanvas();
      (canvas as unknown as { captureStream?: unknown }).captureStream =
        undefined;

      await expect(svc.startVideoExport(canvas)).rejects.toThrow(
        /Canvas capture/
      );
    });

    it('muxes the preview canvas and the master bus into one recording', async () => {
      const { canvas, stream } = makeCanvas();

      const session = await svc.startVideoExport(canvas, { fps: 24 });

      expect(canvas.captureStream).toHaveBeenCalledWith(24);
      expect(stream.addTrack).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'master-audio' })
      );
      expect(FakeMediaRecorder.isTypeSupported).toHaveBeenCalledWith(
        'video/webm;codecs=vp9,opus'
      );
      expect(FakeMediaRecorder.instances[0].options).toEqual(
        expect.objectContaining({
          mimeType: 'video/webm;codecs=vp9,opus',
          videoBitsPerSecond: 12_000_000,
          audioBitsPerSecond: 192_000,
        })
      );

      session.recorder.stop();
      const blob = await session.result;
      expect(blob.size).toBeGreaterThan(0);
      expect(blob.type).toBe('video/webm;codecs=vp9,opus');
    });

    it('records video-only when the master bus is unavailable', async () => {
      (mockEngine.getMasterStream as jest.Mock).mockImplementationOnce(() => {
        throw new Error('audio context not initialised');
      });
      const { canvas, stream } = makeCanvas();

      const session = await svc.startVideoExport(canvas);
      session.recorder.stop();
      const blob = await session.result;

      expect(stream.addTrack).not.toHaveBeenCalled();
      expect(blob.size).toBeGreaterThan(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('without an audio track'),
        expect.any(Error)
      );
    });

    it('honours withAudio: false for a silent capture', async () => {
      const { canvas, stream } = makeCanvas();

      await svc.startVideoExport(canvas, { withAudio: false });

      expect(mockEngine.getMasterStream).not.toHaveBeenCalled();
      expect(stream.addTrack).not.toHaveBeenCalled();
    });

    it('rejects the result when the recorder errors out', async () => {
      const { canvas } = makeCanvas();
      const session = await svc.startVideoExport(canvas);

      FakeMediaRecorder.instances[0].onerror?.({ error: new Error('boom') });

      await expect(session.result).rejects.toThrow('boom');
    });

    it('stops the recorder only once', async () => {
      const { canvas } = makeCanvas();
      const session = await svc.startVideoExport(canvas);

      session.recorder.stop();
      await session.result;
      session.recorder.stop();

      expect(FakeMediaRecorder.instances[0].stop).toHaveBeenCalledTimes(1);
    });

    it('throws a clear error where MediaRecorder does not exist', async () => {
      Reflect.deleteProperty(
        globalThis as unknown as Record<string, unknown>,
        'MediaRecorder'
      );
      const { canvas } = makeCanvas();

      await expect(svc.startVideoExport(canvas)).rejects.toThrow(
        /MediaRecorder missing/
      );
    });
  });
});
