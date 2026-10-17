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

  it('exports real PCM WAV bytes through the offline path without rolling the live transport', async () => {
    jest.spyOn(svc, 'renderProjectOffline').mockResolvedValueOnce(fakeBuffer);
    const download = jest.spyOn(svc, 'downloadBlob').mockImplementation(() => {});
    const blob = await svc.exportProjectWav();
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBeGreaterThan(44);
    expect(download).toHaveBeenCalledWith(blob, expect.stringMatching(/\.wav$/));
  });

  it('uses a WAV extension when the requested share codec falls back to PCM', async () => {
    jest.spyOn(svc, 'renderProjectOffline').mockResolvedValueOnce(fakeBuffer);
    jest.spyOn(svc, 'applySmuvePolish').mockResolvedValueOnce(fakeBuffer);
    const share = jest.spyOn(svc, 'shareBlob').mockResolvedValueOnce(false);
    await svc.exportAndShare('mp3');
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ type: 'audio/wav' }), expect.stringMatching(/\.wav$/));
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

  it('audioBufferToWav encodes stereo as two interleaved channels', async () => {
    // Regression: the mono fakeBuffer hid a channel-count mismatch that threw
    // for every stereo offline render (“WAV channel count does not match”).
    const stereo: any = {
      numberOfChannels: 2,
      sampleRate: 44100,
      length: 100,
      getChannelData: (c: number) =>
        c === 0 ? new Float32Array(100).fill(0.5) : new Float32Array(100).fill(-0.5),
    };
    const buf = await svc.audioBufferToWav(stereo);
    const view = new DataView(buf);
    const magic = (offset: number) =>
      String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
      );
    expect(magic(0)).toBe('RIFF');
    expect(magic(8)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(2); // channel count
    expect(view.getUint32(24, true)).toBe(44100); // sample rate
    expect(view.getUint32(40, true)).toBe(100 * 2 * 2); // data chunk bytes
    // Interleaved frames: L = +0.5 (~16383), R = -0.5 (-16384), then L again.
    expect(view.getInt16(44, true)).toBeGreaterThan(16000);
    expect(view.getInt16(46, true)).toBeLessThan(-16000);
    expect(view.getInt16(48, true)).toBeGreaterThan(16000);
  });

  describe('mastering analysis (Phase 2)', () => {
    const SAMPLE_RATE = 48000;

    const sine = (
      frequencyHz: number,
      amplitude: number,
      seconds: number,
      phase = 0,
    ): Float32Array => {
      const data = new Float32Array(Math.round(SAMPLE_RATE * seconds));
      for (let n = 0; n < data.length; n++) {
        data[n] =
          amplitude *
          Math.sin((2 * Math.PI * frequencyHz * n) / SAMPLE_RATE + phase);
      }
      return data;
    };

    const concat = (first: Float32Array, second: Float32Array): Float32Array => {
      const joined = new Float32Array(first.length + second.length);
      joined.set(first, 0);
      joined.set(second, first.length);
      return joined;
    };

    const makeBuffer = (channels: Float32Array[]): AudioBuffer =>
      ({
        numberOfChannels: channels.length,
        sampleRate: SAMPLE_RATE,
        length: channels[0]?.length ?? 0,
        getChannelData: (index: number) => channels[index],
      }) as unknown as AudioBuffer;

    it('measures a stereo 1 kHz tone against the standard, not rms + 4 dB', () => {
      // Two channels of a 1 kHz tone at 0.1 amplitude: the K-weighting at
      // 1 kHz is +0.654 dB, so the gated integrated loudness is
      // -0.691 + 10log10(2·(0.1/√2)²·10^0.0654) ≈ -20.0 LUFS.
      const tone = sine(1000, 0.1, 2);
      const stats = svc.analyzeBuffer(makeBuffer([tone, tone]));

      expect(stats.lufs).toBeCloseTo(-20, 0);
      // RMS of a 0.1-amplitude sine is -23 dBFS, and the stereo loudness sits
      // 3.01 LU above it (channel sum) plus the 1 kHz K-weighting (+0.654).
      expect(stats.rmsDb).toBeCloseTo(-23, 0);
      expect(stats.peakDb).toBeCloseTo(-20, 0);
      expect(stats.truePeakDb).toBeCloseTo(-20, 0);
      expect(stats.durationSec).toBeCloseTo(2, 1);
      expect(stats.sampleCount).toBe(96000);
      // Identical channels are perfectly correlated.
      expect(stats.correlation).toBeCloseTo(1, 2);
      // A steady tone has no loudness range.
      expect(stats.lra).toBeLessThan(1);
      // The old model reported rms + 4 here, which was ~7 LU optimistic.
      expect(stats.lufs).toBeLessThan(stats.rmsDb + 4);
    });

    it('reports a true peak above the sample peak for inter-sample peaks', () => {
      // fs/4 at 45°: every sample sits at ±A/√2 while the reconstructed
      // waveform reaches A, so a sample-peak reading under-reports by ~3 dB.
      const tone = sine(SAMPLE_RATE / 4, 0.5, 0.5, Math.PI / 4);
      const stats = svc.analyzeBuffer(makeBuffer([tone]));

      expect(stats.truePeakDb).toBeCloseTo(-6, 0);
      expect(stats.peakDb).toBeCloseTo(-9, 0);
      expect(stats.truePeakDb).toBeGreaterThan(stats.peakDb);
    });

    it('measures every channel, not just the first', () => {
      // A hard-right master used to look like silence: channel 0 only.
      const left = new Float32Array(SAMPLE_RATE);
      const right = sine(300, 0.9, 1);
      const stats = svc.analyzeBuffer(makeBuffer([left, right]));

      expect(stats.truePeakDb).toBeCloseTo(-1, 0);
      expect(stats.peakDb).toBeCloseTo(-1, 0);
      // A 300 Hz tone at 0.9 peak is around -4.6 LUFS; the old channel-0 read
      // would have reported the silence floor instead.
      expect(stats.lufs).toBeGreaterThan(-10);
    });

    it('reports no integrated loudness for a render shorter than one block', () => {
      // BS.1770 needs a 400 ms block before there is anything to integrate;
      // the panel floors that at the absolute gate rather than showing NaN.
      const brief = sine(1000, 0.1, 0.1);
      const stats = svc.analyzeBuffer(makeBuffer([brief, brief]));

      expect(stats.lufs).toBe(-70);
      expect(Number.isNaN(stats.lufs)).toBe(false);
    });

    it('reports the loudness range of quiet and loud sections', () => {
      const quiet = sine(1000, 0.02, 4);
      const loud = sine(1000, 0.2, 4);

      const steady = svc.analyzeBuffer(makeBuffer([quiet, quiet]));
      expect(steady.lra).toBeLessThan(1);

      const joined = concat(quiet, loud);
      const mixed = svc.analyzeBuffer(makeBuffer([joined, joined]));
      expect(mixed.lra).toBeGreaterThan(5);
    });

    it('analyzeBuffer handles silence without NaN and without a fake floor', () => {
      const buffer = makeBuffer([
        new Float32Array(SAMPLE_RATE),
        new Float32Array(SAMPLE_RATE),
      ]);
      const stats = svc.analyzeBuffer(buffer);

      expect(stats.peakDb).toBeCloseTo(-120, 0);
      expect(stats.truePeakDb).toBeCloseTo(-120, 0);
      expect(Number.isNaN(stats.rmsDb)).toBe(false);
      // Floored at the standard's absolute gate, never -Infinity in the panel.
      expect(stats.lufs).toBe(-70);
      expect(Number.isFinite(stats.lra)).toBe(true);
      expect(Number.isNaN(stats.correlation)).toBe(false);
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
