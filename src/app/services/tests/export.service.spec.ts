import { TestBed } from "@angular/core/testing";
import { ExportService } from "../export.service";
import { AudioEngineService } from "../audio-engine.service";
import { MusicManagerService } from "../music-manager.service";
import { LoggingService } from "../logging.service";
import { VideoEngineService } from "../video-engine.service";
import { PluginRegistry } from "../../studio/effects/plugin-interface";

describe("ExportService", () => {
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
      state: "running",
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
        type: "sine",
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
      scheduleOfflineNote: jest.fn(),
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
      mimeType = "audio/webm";
      state = "inactive";
      constructor(
        public stream: MediaStream,
        public options: MediaRecorderOptions = {},
      ) {
        recorders.push(this);
      }
      start = jest.fn(() => {
        this.state = "recording";
      });
      stop = jest.fn(() => {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["sample"]) });
        this.onstop?.();
      });
      fail = jest.fn((error: Error) => {
        this.state = "inactive";
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

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  it("should correctly encode AudioBuffer to WAV", async () => {
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
    expect(view.getUint8(0)).toBe("R".charCodeAt(0));
    expect(view.getUint8(1)).toBe("I".charCodeAt(0));
    expect(view.getUint8(2)).toBe("F".charCodeAt(0));
    expect(view.getUint8(3)).toBe("F".charCodeAt(0));

    // Check WAVE header
    expect(view.getUint8(8)).toBe("W".charCodeAt(0));
    expect(view.getUint8(9)).toBe("A".charCodeAt(0));
    expect(view.getUint8(10)).toBe("V".charCodeAt(0));
    expect(view.getUint8(11)).toBe("E".charCodeAt(0));

    // Check audio format at offset 20 (1 = PCM)
    expect(view.getUint16(20, true)).toBe(1);

    // Check sample rate at offset 24
    expect(view.getUint32(24, true)).toBe(sampleRate);

    // Check bits per sample at offset 34
    expect(view.getUint16(34, true)).toBe(16);
  });

  it("offline export schedules every resident window of a long streamed clip", async () => {
    const first = { duration: 4, sampleRate: 44100 } as AudioBuffer;
    const second = { duration: 4, sampleRate: 44100 } as AudioBuffer;
    const streamer = {
      setPlayhead: jest.fn(),
      getResidentBuffer: jest
        .fn()
        .mockReturnValueOnce(first)
        .mockReturnValueOnce(second),
      getResidentOffsetSeconds: jest.fn(() => 0),
      getRemainingSecondsFrom: jest.fn(() => 8),
    };
    const starts: number[][] = [];
    const offline = {
      destination: {},
      createGain: jest.fn(() => ({
        gain: {
          value: 1,
          setValueAtTime: jest.fn(),
          linearRampToValueAtTime: jest.fn(),
          setTargetAtTime: jest.fn(),
        },
        connect: jest.fn(),
      })),
      createStereoPanner: jest.fn(() => ({
        pan: { value: 0 },
        connect: jest.fn(),
      })),
      createBufferSource: jest.fn(() => ({
        buffer: null,
        connect: jest.fn(),
        playbackRate: { setValueAtTime: jest.fn() },
        start: (...args: number[]) => starts.push(args),
      })),
      startRendering: jest.fn().mockResolvedValue({}),
    };
    const originalOfflineAudioContext = (globalThis as any).OfflineAudioContext;
    (globalThis as any).OfflineAudioContext = jest.fn(() => offline);
    (service as any).engine.masterGain = { gain: { value: 1 } };
    (service as any).engine.tempo = jest.fn(() => 120);
    (service as any).musicManager.tracks = jest.fn(() => [
      {
        id: "stream-track",
        name: "Long sample",
        type: "audio",
        muted: false,
        soloed: false,
        gain: 1,
        pan: 0,
        notes: [],
        clips: [
          {
            type: "audio",
            start: 0,
            length: 8,
            clipStreamer: streamer,
            clipOriginSeconds: 0,
            clipLengthSeconds: 8,
            clipSampleRate: 44100,
          },
        ],
      },
    ]);
    (service as any).musicManager.activeLoopBars = jest.fn(() => 2);

    try {
      await service.renderProjectOffline();
    } finally {
      if (originalOfflineAudioContext === undefined) {
        delete (globalThis as any).OfflineAudioContext;
      } else {
        (globalThis as any).OfflineAudioContext = originalOfflineAudioContext;
      }
    }

    expect(starts).toEqual([
      [0, 0, 4],
      [4, 0, 4],
    ]);
    expect(streamer.setPlayhead).toHaveBeenLastCalledWith(4 * 44100);
  });

  it("bounces an audio clip's fades instead of exporting a hard edge", async () => {
    const gains: any[] = [];
    const offline = {
      destination: {},
      createGain: jest.fn(() => {
        const node = {
          gain: {
            value: 1,
            setValueAtTime: jest.fn(),
            linearRampToValueAtTime: jest.fn(),
            setTargetAtTime: jest.fn(),
          },
          connect: jest.fn(),
        };
        gains.push(node);
        return node;
      }),
      createStereoPanner: jest.fn(() => ({
        pan: { value: 0 },
        connect: jest.fn(),
      })),
      createBufferSource: jest.fn(() => ({
        buffer: null,
        connect: jest.fn(),
        playbackRate: { setValueAtTime: jest.fn() },
        start: jest.fn(),
        stop: jest.fn(),
      })),
      startRendering: jest.fn().mockResolvedValue({}),
    };
    const original = (globalThis as any).OfflineAudioContext;
    (globalThis as any).OfflineAudioContext = jest.fn(() => offline);
    (service as any).engine.masterGain = { gain: { value: 1 } };
    (service as any).engine.tempo = jest.fn(() => 120);
    (service as any).musicManager.activeLoopBars = jest.fn(() => 4);
    (service as any).musicManager.tracks = jest.fn(() => [
      {
        id: "vo",
        name: "Vocal",
        type: "audio",
        muted: false,
        soloed: false,
        gain: 1,
        pan: 0,
        notes: [],
        clips: [
          {
            type: "audio",
            start: 0,
            length: 4,
            fadeIn: 1,
            fadeOut: 1,
            audioData: { duration: 8, sampleRate: 44100 },
          },
        ],
      },
    ]);

    try {
      await service.renderProjectOffline();
    } finally {
      if (original === undefined) {
        delete (globalThis as any).OfflineAudioContext;
      } else {
        (globalThis as any).OfflineAudioContext = original;
      }
    }

    // 120 BPM → 2 s per bar: the 1-bar fades are 2 s inside the 8 s clip, so
    // the envelope is 0→1 over 0–2 s and 1→0 over 6–8 s — the live sampler's
    // ramps, now present in the bounce.
    const fader = gains.find(
      (node) => node.gain.linearRampToValueAtTime.mock.calls.length > 0,
    );
    expect(fader).toBeTruthy();
    expect(fader!.gain.setValueAtTime).toHaveBeenNthCalledWith(1, 0, 0);
    expect(fader!.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(
      1,
      1,
      2,
    );
    expect(fader!.gain.setValueAtTime).toHaveBeenNthCalledWith(2, 1, 6);
    expect(fader!.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(
      2,
      0,
      8,
    );
  });

  /**
   * Render one audio clip through the offline bounce and hand back every gain
   * the mocked context created, so an envelope test can pick out the clip's
   * fader (the only stage carrying ramps / a target approach).
   */
  async function renderClipGains(clip: Record<string, unknown>) {
    const gains: any[] = [];
    const offline = {
      destination: {},
      createGain: jest.fn(() => {
        const node = {
          gain: {
            value: 1,
            setValueAtTime: jest.fn(),
            linearRampToValueAtTime: jest.fn(),
            setTargetAtTime: jest.fn(),
          },
          connect: jest.fn(),
        };
        gains.push(node);
        return node;
      }),
      createStereoPanner: jest.fn(() => ({
        pan: { value: 0 },
        connect: jest.fn(),
      })),
      createBufferSource: jest.fn(() => ({
        buffer: null,
        connect: jest.fn(),
        playbackRate: { setValueAtTime: jest.fn() },
        start: jest.fn(),
        stop: jest.fn(),
      })),
      startRendering: jest.fn().mockResolvedValue({}),
    };
    const original = (globalThis as any).OfflineAudioContext;
    (globalThis as any).OfflineAudioContext = jest.fn(() => offline);
    (service as any).engine.masterGain = { gain: { value: 1 } };
    (service as any).engine.tempo = jest.fn(() => 120);
    (service as any).musicManager.activeLoopBars = jest.fn(() => 4);
    (service as any).musicManager.tracks = jest.fn(() => [
      {
        id: "vo",
        name: "Vocal",
        type: "audio",
        muted: false,
        soloed: false,
        gain: 1,
        pan: 0,
        notes: [],
        clips: [clip],
      },
    ]);
    try {
      await service.renderProjectOffline();
    } finally {
      if (original === undefined) {
        delete (globalThis as any).OfflineAudioContext;
      } else {
        (globalThis as any).OfflineAudioContext = original;
      }
    }
    return gains;
  }

  it("applies clip-level gain as the fade envelope's ceiling in the bounce", async () => {
    // Phase L regression: clipGain used to be stamped with a standalone
    // setValueAtTime(0.5, 0) that the envelope's own setValueAtTime(0, 0)
    // overwrote at the same instant — every ramp then targeted 1 and the
    // clip gain silently vanished from the export.
    const gains = await renderClipGains({
      type: "audio",
      start: 0,
      length: 4,
      fadeIn: 1,
      fadeOut: 1,
      clipGain: 0.5,
      audioData: { duration: 8, sampleRate: 44100 },
    });

    const fader = gains.find(
      (node) => node.gain.linearRampToValueAtTime.mock.calls.length > 0,
    );
    expect(fader).toBeTruthy();
    // 120 BPM → 2 s per bar: the envelope is 0 → 0.5 over the 2 s fade-in,
    // holds at clipGain, then 0.5 → 0 over the last 2 s — the live
    // triggerSampler shape with velocity = t.gain * clipGain (gain 1 here).
    expect(fader!.gain.setValueAtTime).toHaveBeenNthCalledWith(1, 0, 0);
    expect(fader!.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(
      1,
      0.5,
      2,
    );
    expect(fader!.gain.setValueAtTime).toHaveBeenNthCalledWith(2, 0.5, 6);
    expect(fader!.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(
      2,
      0,
      8,
    );
  });

  it("applies clip-level gain when the clip has no fades", async () => {
    const gains = await renderClipGains({
      type: "audio",
      start: 0,
      length: 4,
      clipGain: 0.5,
      audioData: { duration: 8, sampleRate: 44100 },
    });

    const fader = gains.find(
      (node) => node.gain.setTargetAtTime.mock.calls.length > 0,
    );
    expect(fader).toBeTruthy();
    // The no-fade branch mirrors triggerSampler: zero the stage, then a
    // 5 ms approach to clipGain — not to full scale.
    expect(fader!.gain.setValueAtTime).toHaveBeenNthCalledWith(1, 0, 0);
    expect(fader!.gain.setTargetAtTime).toHaveBeenNthCalledWith(
      1,
      0.5,
      0,
      0.005,
    );
  });

  it("renders a 48 kHz master at 48 kHz instead of relabelling a 44.1 kHz bounce", async () => {
    const offline = {
      destination: {},
      createGain: jest.fn(() => ({
        gain: { value: 1 },
        connect: jest.fn(),
      })),
      createStereoPanner: jest.fn(() => ({
        pan: { value: 0 },
        connect: jest.fn(),
      })),
      createBufferSource: jest.fn(() => ({
        buffer: null,
        connect: jest.fn(),
        playbackRate: { setValueAtTime: jest.fn() },
        start: jest.fn(),
        stop: jest.fn(),
      })),
      startRendering: jest.fn().mockResolvedValue({}),
    };
    const contexts: any[][] = [];
    const original = (globalThis as any).OfflineAudioContext;
    (globalThis as any).OfflineAudioContext = jest.fn((...args: any[]) => {
      contexts.push(args);
      return offline;
    });
    (service as any).engine.masterGain = { gain: { value: 1 } };
    (service as any).engine.tempo = jest.fn(() => 120);
    (service as any).musicManager.activeLoopBars = jest.fn(() => 2);
    (service as any).musicManager.tracks = jest.fn(() => []);

    try {
      await service.renderProjectOffline({ sampleRate: 48000 });
    } finally {
      if (original === undefined) {
        delete (globalThis as any).OfflineAudioContext;
      } else {
        (globalThis as any).OfflineAudioContext = original;
      }
    }

    // 2 bars at 120 BPM = 4 s, plus the 1 s tail: 5 s of frames at 48 kHz.
    expect(contexts).toEqual([[2, 5 * 48000, 48000]]);
  });

  it("renders only the requested tracks and can ignore solo for a stem set", async () => {
    const offline = {
      destination: {},
      createGain: jest.fn(() => ({
        gain: {
          value: 1,
          setValueAtTime: jest.fn(),
          linearRampToValueAtTime: jest.fn(),
          setTargetAtTime: jest.fn(),
        },
        connect: jest.fn(),
      })),
      createStereoPanner: jest.fn(() => ({
        pan: { value: 0 },
        connect: jest.fn(),
      })),
      createBufferSource: jest.fn(() => ({
        buffer: null,
        connect: jest.fn(),
        playbackRate: { setValueAtTime: jest.fn() },
        start: jest.fn(),
        stop: jest.fn(),
      })),
      startRendering: jest.fn().mockResolvedValue({}),
    };
    const original = (globalThis as any).OfflineAudioContext;
    (globalThis as any).OfflineAudioContext = jest.fn(() => offline);
    const schedule = audioEngineMock.scheduleOfflineNote as jest.Mock;
    schedule.mockClear();
    (service as any).engine.masterGain = { gain: { value: 1 } };
    (service as any).engine.tempo = jest.fn(() => 120);
    (service as any).musicManager.activeLoopBars = jest.fn(() => 2);
    (service as any).musicManager.tracks = jest.fn(() => [
      {
        id: "a",
        name: "Lead",
        type: "midi",
        muted: false,
        soloed: false,
        gain: 1,
        pan: 0,
        synthParams: { type: "sine" },
        clips: [],
        notes: [{ midi: 60, step: 0, length: 4, velocity: 0.8 }],
      },
      {
        id: "b",
        name: "Soloed pad",
        type: "midi",
        muted: false,
        soloed: true,
        gain: 1,
        pan: 0,
        synthParams: { type: "sine" },
        clips: [],
        notes: [{ midi: 67, step: 0, length: 4, velocity: 0.8 }],
      },
    ]);

    try {
      // Stem render: one track, even though the other track is soloed.
      await service.renderProjectOffline({ onlyTrackIds: new Set(["a"]) });
      expect(schedule).toHaveBeenCalledTimes(1);

      // Full render with solo respected: only the soloed pad.
      schedule.mockClear();
      await service.renderProjectOffline();
      expect(schedule).toHaveBeenCalledTimes(1);

      // Full render ignoring solo: every track.
      schedule.mockClear();
      await service.renderProjectOffline({ ignoreSolo: true });
      expect(schedule).toHaveBeenCalledTimes(2);
    } finally {
      if (original === undefined) {
        delete (globalThis as any).OfflineAudioContext;
      } else {
        (globalThis as any).OfflineAudioContext = original;
      }
    }
  });

  it("exportStems bundles the master plus one WAV per unmuted track", async () => {
    const stemBuffer = {
      numberOfChannels: 1,
      sampleRate: 44100,
      length: 32,
      getChannelData: () => new Float32Array(32).fill(0.25),
    } as unknown as AudioBuffer;
    jest.spyOn(service, "renderProjectOffline").mockResolvedValue(stemBuffer);
    const download = jest
      .spyOn(service, "downloadBlob")
      .mockImplementation(() => {});
    (service as any).musicManager.tracks = () => [
      {
        id: "t1",
        name: "Lead",
        type: "midi",
        muted: false,
        notes: [],
        clips: [],
      },
      {
        id: "t2",
        name: "Vocal",
        type: "audio",
        muted: false,
        notes: [],
        clips: [],
      },
      {
        id: "t3",
        name: "Muted",
        type: "midi",
        muted: true,
        notes: [],
        clips: [],
      },
      {
        id: "bus1",
        name: "Drum Bus",
        type: "bus",
        muted: false,
        notes: [],
        clips: [],
      },
    ];

    const wavDepth = jest.spyOn(service, "audioBufferToWav");
    const zip = await service.exportStems();

    // Stems are delivery files, so every entry is written at 24-bit.
    expect(wavDepth).toHaveBeenCalledTimes(3);
    expect(wavDepth.mock.calls.every(([, depth]) => depth === 24)).toBe(true);

    // Master + the two audible tracks; muted tracks and buses are skipped.
    expect(service.renderProjectOffline).toHaveBeenCalledTimes(3);
    expect(service.renderProjectOffline).toHaveBeenNthCalledWith(1, {
      sampleRate: 44100,
    });
    expect(service.renderProjectOffline).toHaveBeenNthCalledWith(2, {
      onlyTrackIds: new Set(["t1"]),
      ignoreSolo: true,
      sampleRate: 44100,
    });
    expect(service.renderProjectOffline).toHaveBeenNthCalledWith(3, {
      onlyTrackIds: new Set(["t2"]),
      ignoreSolo: true,
      sampleRate: 44100,
    });
    expect(zip.type).toBe("application/zip");
    expect(zip.size).toBeGreaterThan(0);
    expect(download).toHaveBeenCalledWith(
      zip,
      expect.stringMatching(/_stems_\d+\.zip$/),
    );
  });

  it("starts live recording and creates a media stream destination", () => {
    const { recorder, result } = service.startLiveRecording();

    expect(audioEngineMock.ctx.createMediaStreamDestination).toHaveBeenCalled();
    expect(audioEngineMock.masterGain.connect).toHaveBeenCalled();
    expect(recorder).toBeDefined();
    expect(recorder.start).toHaveBeenCalled();

    recorder.stop();
    return expect(result).resolves.toBeInstanceOf(Blob);
  });

  it("can stop a live recording and receive a blob", async () => {
    const { recorder, result } = service.startLiveRecording();

    recorder.stop();
    const blob = await result;
    expect(blob).toBeInstanceOf(Blob);
  });

  it("captures the preview canvas into a real video recording", async () => {
    const canvas = {
      captureStream: jest.fn().mockReturnValue({ addTrack: jest.fn() }),
    } as unknown as HTMLCanvasElement;

    const { recorder, result } = await service.startVideoExport(canvas, {
      fps: 30,
    });

    expect(canvas.captureStream).toHaveBeenCalledWith(30);
    expect(recorder).toBeDefined();
    expect(typeof recorder.stop).toBe("function");

    recorder.stop();
    const blob = await result;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it("refuses a canvas that cannot be captured", async () => {
    await expect(
      service.startVideoExport({} as HTMLCanvasElement),
    ).rejects.toThrow(/Canvas capture/);
  });

  it("sums a tapped clip into the export track and reports its container", async () => {
    audioEngineMock.ctx.createMediaStreamDestination.mockReturnValueOnce({
      stream: { getAudioTracks: () => [{ id: "mix-audio" }] },
    });
    const addTrack = jest.fn();
    const canvas = {
      captureStream: jest.fn().mockReturnValue({ addTrack }),
    } as unknown as HTMLCanvasElement;
    const clipAudio = { connect: jest.fn() };

    const session = await service.startVideoExport(canvas, {
      clipAudio: clipAudio as unknown as AudioNode,
    });

    // The clip's own soundtrack has to reach the recording, or a take with
    // dialogue in it downloads silent.
    expect(clipAudio.connect).toHaveBeenCalled();
    expect(addTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: "mix-audio" }),
    );
    // The caller names the file from this, so it cannot guess `.webm`.
    expect(session.mimeType).toMatch(/webm/);

    session.recorder.stop();
    await session.result;
  });

  it("declines a clip it cannot tap instead of throwing", () => {
    expect(service.connectClipAudio({} as HTMLMediaElement)).toBe(false);
    expect(() => service.setClipAudioLevel(1)).not.toThrow();
  });

  /**
   * A capture always rolls the timeline, but it can also end on a path the
   * caller's capture window never sees. The transport has to be handed back
   * either way, otherwise the timeline is left rolling with no export to show.
   */
  describe("transport handoff around a capture", () => {
    const canvas = () =>
      ({
        captureStream: jest.fn().mockReturnValue({ addTrack: jest.fn() }),
      }) as unknown as HTMLCanvasElement;

    it("stops the timeline when the recorder ends before the capture window", async () => {
      // Transport idle before the take: it must be idle again afterwards.
      videoEngineMock.isPlaying.mockReturnValue(false);

      const { result } = await service.startVideoExport(canvas());
      recorders[0].fail(new Error("display track ended"));

      await expect(result).rejects.toThrow("display track ended");
      expect(videoEngineMock.pause).toHaveBeenCalled();
      expect(videoEngineMock.play).not.toHaveBeenCalled();
    });

    it("resumes the timeline when it was rolling before the take", async () => {
      videoEngineMock.isPlaying.mockReturnValue(true);

      const { result } = await service.startVideoExport(canvas());
      recorders[0].fail(new Error("recorder crashed"));

      await expect(result).rejects.toThrow("recorder crashed");
      expect(videoEngineMock.pause).toHaveBeenCalled();
      expect(videoEngineMock.play).toHaveBeenCalled();
    });

    it("hands the transport back after a normal stop without resuming", async () => {
      videoEngineMock.isPlaying.mockReturnValue(false);

      const { recorder, result } = await service.startVideoExport(canvas());
      recorder.stop();
      await result;

      // A late `onerror` must not roll the timeline a second time.
      recorders[0].fail(new Error("late error"));

      expect(videoEngineMock.pause).toHaveBeenCalledTimes(1);
      expect(videoEngineMock.play).not.toHaveBeenCalled();
    });
  });
  /**
   * Offline bounce — automation and aux sends.
   *
   * The renderer used to follow the static mix only: a lane drew a curve that
   * song playback honoured and the bounce dropped, and a raised send added a
   * dry copy of the track because no return existed offline. These tests drive
   * the real renderer against a recording context and read the ramps it wrote.
   */
  describe("offline bounce: automation and aux sends", () => {
    const param = () => ({
      value: 0,
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
      setTargetAtTime: jest.fn(),
    });

    function recordingContext() {
      const gains: any[] = [];
      const panners: any[] = [];
      const filters: any[] = [];
      const convolvers: any[] = [];
      const delays: any[] = [];
      const offline = {
        destination: {},
        createGain: jest.fn(() => {
          const node = { gain: param(), connect: jest.fn() };
          gains.push(node);
          return node;
        }),
        createStereoPanner: jest.fn(() => {
          const node = { pan: param(), connect: jest.fn() };
          panners.push(node);
          return node;
        }),
        createBiquadFilter: jest.fn(() => {
          const node = {
            type: "lowpass",
            frequency: param(),
            Q: param(),
            connect: jest.fn(),
          };
          filters.push(node);
          return node;
        }),
        createConvolver: jest.fn(() => {
          const node = { buffer: null, connect: jest.fn() };
          convolvers.push(node);
          return node;
        }),
        createDelay: jest.fn(() => {
          const node = { delayTime: param(), connect: jest.fn() };
          delays.push(node);
          return node;
        }),
        createBufferSource: jest.fn(() => ({
          buffer: null,
          connect: jest.fn(),
          playbackRate: { setValueAtTime: jest.fn() },
          start: jest.fn(),
          stop: jest.fn(),
        })),
        startRendering: jest.fn().mockResolvedValue({}),
      };
      return { offline, gains, panners, filters, convolvers, delays };
    }

    function lane(
      parameter: string,
      points: Array<{ time: number; value: number }>,
    ) {
      return {
        id: `lane-${parameter}`,
        target: { trackId: "lead", parameter },
        points,
        enabled: true,
        interpolation: "linear" as const,
        modulationDepth: 0,
      };
    }

    function track(overrides: Record<string, unknown> = {}) {
      return {
        id: "lead",
        name: "Lead",
        type: "midi",
        muted: false,
        soloed: false,
        gain: 0.8,
        volume: 0.8,
        pan: 0,
        sendA: 0,
        sendB: 0,
        notes: [],
        clips: [],
        synthParams: { type: "sine" },
        ...overrides,
      };
    }

    async function render(
      recording: ReturnType<typeof recordingContext>,
      tracks: any[],
    ) {
      const original = (globalThis as any).OfflineAudioContext;
      (globalThis as any).OfflineAudioContext = jest.fn(
        () => recording.offline,
      );
      (service as any).engine.masterGain = { gain: { value: 1 } };
      (service as any).engine.tempo = jest.fn(() => 120);
      (service as any).musicManager.tracks = jest.fn(() => tracks);
      (service as any).musicManager.activeLoopBars = jest.fn(() => 4);
      try {
        await service.renderProjectOffline();
      } finally {
        if (original === undefined) {
          delete (globalThis as any).OfflineAudioContext;
        } else {
          (globalThis as any).OfflineAudioContext = original;
        }
      }
    }

    it("bounces a level lane onto the channel fader instead of the static gain", async () => {
      const recording = recordingContext();
      (service as any).automation.lanes.set([
        lane("volume", [
          { time: 0, value: 0.2 },
          { time: 4, value: 1 },
        ]),
      ]);

      await render(recording, [track()]);

      // 120 BPM, 4 bars → the render is 9 s long; the lane is 0 → 4 s and then
      // holds. The fader is the only stage carrying ramps in this bounce.
      const fader = recording.gains.find(
        (node) => node.gain.linearRampToValueAtTime.mock.calls.length > 0,
      );
      expect(fader).toBeTruthy();
      expect(fader!.gain.setValueAtTime).toHaveBeenNthCalledWith(1, 0.2, 0);
      const midpoint = fader!.gain.linearRampToValueAtTime.mock.calls.find(
        ([, time]: [number, number]) => Math.abs(time - 2) < 0.001,
      );
      expect(midpoint?.[0]).toBeCloseTo(0.6, 5);
      const last = fader!.gain.linearRampToValueAtTime.mock.calls.at(-1)!;
      expect(last[0]).toBeCloseTo(1, 5);
    });

    it("bounces pan and cutoff lanes onto the channel's own stages", async () => {
      const recording = recordingContext();
      (service as any).automation.lanes.set([
        lane("pan", [
          { time: 0, value: 0 },
          { time: 4, value: -1 },
        ]),
        lane("cutoff", [
          { time: 0, value: 20000 },
          { time: 4, value: 200 },
        ]),
      ]);

      await render(recording, [track()]);

      expect(recording.panners).toHaveLength(1);
      const panRamps = recording.panners[0].pan.linearRampToValueAtTime.mock.calls;
      expect(panRamps.at(-1)![0]).toBeCloseTo(-1, 5);

      expect(recording.filters).toHaveLength(1);
      const cutoffRamps =
        recording.filters[0].frequency.linearRampToValueAtTime.mock.calls;
      expect(cutoffRamps.at(-1)![0]).toBeCloseTo(200, 5);
    });

    it("feeds a raised send into a real reverb return in the bounce", async () => {
      const recording = recordingContext();
      const impulse = { duration: 2, sampleRate: 44100 } as AudioBuffer;
      (service as any).engine.getSendBusSnapshot = jest.fn(() => ({
        impulse,
        reverbWet: 0.25,
        echo: { delaySeconds: 0.375, feedback: 0.32, dampingHz: 3200, wet: 0.45 },
      }));

      await render(recording, [track({ sendA: 0.4, sendB: 0.5 })]);

      // Both returns exist, with the live convolver's own impulse and the
      // echo's tempo-synced delay — not a dry copy of the track.
      expect(recording.convolvers).toHaveLength(1);
      expect(recording.convolvers[0].buffer).toBe(impulse);
      expect(recording.delays).toHaveLength(1);
      expect(recording.delays[0].delayTime.value).toBeCloseTo(0.375, 5);
      // The send tap itself sits post-fader at the model's level.
      const tap = recording.gains.find((node) => node.gain.value === 0.4);
      expect(tap).toBeTruthy();
    });

    it("chains a track's enabled insert slots into the bounce in rack order", async () => {
      const recording = recordingContext();
      const created: any[] = [];
      const create = jest
        .spyOn(PluginRegistry, "create")
        .mockImplementation((id: string) => {
          const plugin = {
            id,
            input: { connect: jest.fn() },
            output: { connect: jest.fn() },
          };
          created.push(plugin);
          return plugin as any;
        });

      try {
        await render(recording, [
          track({
            notes: [{ step: 0, midi: 60, length: 1, velocity: 0.8 }],
            fxSlots: [
              { id: "a", type: "EQ", params: {}, enabled: true },
              { id: "b", type: "Compressor", params: {}, enabled: false },
              { id: "c", type: "Reverb", params: {}, enabled: true },
            ],
          }),
        ]);
      } finally {
        create.mockRestore();
      }

      // Built from the tail backwards so the rack's first slot sits closest to
      // the sources; the bypassed compressor never instantiates.
      expect(created.map((plugin) => plugin.id)).toEqual([
        "smuve.reverb.v1",
        "smuve.eq.v1",
      ]);
      expect(created[1].output.connect).toHaveBeenCalledWith(created[0].input);

      // The voices feed the head of the chain, not the fader.
      const [, head] = audioEngineMock.scheduleOfflineNote.mock.calls[0];
      expect(head).toBe(created[1].input);
    });

    it("bounces the slot's knob values into its plugin", async () => {
      const recording = recordingContext();
      const setParam = jest.fn();
      const create = jest
        .spyOn(PluginRegistry, "create")
        .mockImplementation((id: string) => ({
          id,
          input: { connect: jest.fn() },
          output: { connect: jest.fn() },
          params: [
            { id: "wet", value: 60 },
            { id: "decay", value: 2.5 },
          ],
          setParam,
        }) as any);

      try {
        await render(recording, [
          track({
            notes: [{ step: 0, midi: 60, length: 1, velocity: 0.8 }],
            fxSlots: [
              {
                id: "a",
                type: "Reverb",
                params: { wet: 80, decay: 4.5 },
                enabled: true,
              },
            ],
          }),
        ]);
      } finally {
        create.mockRestore();
      }

      // A bounced insert has to be the one the artist dialled in, not the
      // plugin's factory defaults.
      expect(setParam).toHaveBeenCalledWith("wet", 80);
      expect(setParam).toHaveBeenCalledWith("decay", 4.5);
    });

    it("keeps bouncing when an insert cannot be built offline", async () => {
      const recording = recordingContext();
      const create = jest
        .spyOn(PluginRegistry, "create")
        .mockImplementation((id: string) => {
          if (id === "smuve.reverb.v1") throw new Error("no convolver offline");
          return {
            id,
            input: { connect: jest.fn() },
            output: { connect: jest.fn() },
          } as any;
        });

      try {
        await expect(
          render(recording, [
            track({
              notes: [{ step: 0, midi: 60, length: 1, velocity: 0.8 }],
              fxSlots: [
                { id: "a", type: "EQ", params: {}, enabled: true },
                { id: "c", type: "Reverb", params: {}, enabled: true },
              ],
            }),
          ]),
        ).resolves.toBeUndefined();
      } finally {
        create.mockRestore();
      }

      // One failed insert must not silence the track: the EQ still rendered.
      expect(audioEngineMock.scheduleOfflineNote).toHaveBeenCalled();
    });

    it("ignores a disabled lane and leaves the static mix untouched", async () => {
      const recording = recordingContext();
      const disabled = lane("volume", [
        { time: 0, value: 0 },
        { time: 4, value: 1 },
      ]);
      disabled.enabled = false;
      (service as any).automation.lanes.set([disabled]);

      await render(recording, [track()]);

      const fader = recording.gains.find(
        (node) => node.gain.value === 0.8,
      );
      expect(fader).toBeTruthy();
      expect(fader!.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    });
  });
  describe("offline master bus", () => {
    const bands = [
      { id: 1, threshold: -24, ratio: 3 },
      { id: 2, threshold: -20, ratio: 2.5 },
      { id: 3, threshold: -14, ratio: 2 },
      { id: 4, threshold: -10, ratio: 2.2 },
      { id: 5, threshold: -6, ratio: 1.8 },
    ];

    function masterContext() {
      const compressors: any[] = [];
      const filters: any[] = [];
      const gains: any[] = [];
      const offline: any = {
        destination: {},
        createGain: jest.fn(() => {
          const node = {
            gain: { value: 0, setTargetAtTime: jest.fn() },
            connect: jest.fn(),
          };
          gains.push(node);
          return node;
        }),
        createBiquadFilter: jest.fn(() => {
          const node = {
            type: "lowpass",
            frequency: { value: 0 },
            Q: { value: 0 },
            gain: { value: 0 },
            connect: jest.fn(),
          };
          filters.push(node);
          return node;
        }),
        createDynamicsCompressor: jest.fn(() => {
          const node = {
            threshold: { value: -24 },
            ratio: { value: 12 },
            attack: { value: 0.003 },
            release: { value: 0.25 },
            knee: { value: 30 },
            connect: jest.fn(),
          };
          compressors.push(node);
          return node;
        }),
        createWaveShaper: jest.fn(() => ({
          curve: null,
          oversample: "none",
          connect: jest.fn(),
        })),
        startRendering: jest.fn().mockResolvedValue({}),
      };
      return { offline, compressors, filters, gains };
    }

    async function renderMaster(onlyTrackIds?: ReadonlySet<string>) {
      const recording = masterContext();
      const original = (globalThis as any).OfflineAudioContext;
      (globalThis as any).OfflineAudioContext = jest.fn(() => recording.offline);
      Object.assign(audioEngineMock, {
        masterGain: { gain: { value: 0.8 } },
        limiter: {
          ratio: { value: 20 },
          attack: { value: 0.001 },
          release: { value: 0.05 },
          knee: { value: 0 },
        },
        masterEQ: { frequency: { value: 20000 } },
        masterShelf: { frequency: { value: 5000 } },
        saturationNode: { curve: null, oversample: "none" },
        quantumSaturation: { curve: null, oversample: "none" },
        spectralExciter: {
          type: "highshelf",
          gain: { value: 0 },
          frequency: { value: 8000 },
        },
        subAtomicEnhancer: { gain: { value: 1 } },
        getMasteringBands: jest.fn(() => bands),
        getMasteringTargets: jest.fn(() => ({ lufs: -14, truePeak: -0.7 })),
        getMasterToneEq: jest.fn(() => ({
          lowShelfDb: 2,
          lowMidDb: -1,
          highShelfDb: 1.5,
        })),
        getMasterMakeupDb: jest.fn(() => 2),
        getCompressorSettings: jest.fn(() => ({ threshold: -20, ratio: 3 })),
      });
      (service as any).musicManager.tracks = jest.fn(() => []);
      (service as any).musicManager.activeLoopBars = jest.fn(() => 1);
      (service as any).automation.lanes.set([]);
      try {
        await service.renderProjectOffline(
          onlyTrackIds ? { onlyTrackIds } : {},
        );
      } finally {
        if (original === undefined) {
          delete (globalThis as any).OfflineAudioContext;
        } else {
          (globalThis as any).OfflineAudioContext = original;
        }
      }
      return recording;
    }

    it("uses the five live bands and the true-peak ceiling in a full mix", async () => {
      const { compressors, filters } = await renderMaster();

      expect(compressors).toHaveLength(6);
      expect(compressors.slice(0, 5).map((node) => node.threshold.value)).toEqual(
        bands.map((band) => band.threshold),
      );
      expect(compressors.slice(0, 5).map((node) => node.ratio.value)).toEqual(
        bands.map((band) => band.ratio),
      );
      // The sixth compressor is the safety limiter, not another band.
      expect(compressors[5].threshold.value).toBe(-0.7);
      expect(compressors[5].knee.value).toBe(0);
      const highShelf = filters.find((node) => node.type === "highshelf");
      expect(highShelf?.gain.value).toBe(1.5);
    });

    it("leaves stems pre-master so a stem set still sums to the mix", async () => {
      const { compressors, offline } = await renderMaster(
        new Set(["not-rendered"]),
      );

      expect(compressors).toHaveLength(0);
      expect(offline.createDynamicsCompressor).not.toHaveBeenCalled();
    });
  });

});
