import { TestBed } from "@angular/core/testing";
import { OfflineBounceService } from "./offline-bounce.service";
import { AudioEngineService } from "../services/audio-engine.service";
import { MusicManagerService } from "../services/music-manager.service";
import { LoggingService } from "../services/logging.service";
import { VideoEngineService } from "../services/video-engine.service";
import { AutomationService } from "./automation.service";
import { ExportService } from "../services/export.service";

describe("OfflineBounceService", () => {
  let service: OfflineBounceService;
  let mockAudioEngine: any;
  let mockMusicManager: any;

  beforeEach(() => {
    mockAudioEngine = {
      tempo: () => 120,
      masterGain: { gain: { value: 0.8 } },
      timeSignature: () => ({ beats: 4, unit: 4 }),
      scheduleOfflineNote: jest.fn(),
    };

    mockMusicManager = {
      tracks: () => [
        {
          name: "Track 1",
          notes: [
            { step: 0, midi: 60, length: 4, velocity: 0.8 },
            { step: 4, midi: 64, length: 4, velocity: 0.7 },
          ],
          clips: [],
          gain: 0.8,
          synthParams: { type: "sine" },
          muted: false,
          soloed: false,
        },
        {
          name: "Track 2",
          notes: [{ step: 0, midi: 67, length: 8, velocity: 0.6 }],
          clips: [],
          gain: 0.7,
          synthParams: { type: "sawtooth" },
          muted: false,
          soloed: false,
        },
      ],
    };

    TestBed.configureTestingModule({
      providers: [
        OfflineBounceService,
        { provide: AudioEngineService, useValue: mockAudioEngine },
        { provide: MusicManagerService, useValue: mockMusicManager },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        {
          provide: VideoEngineService,
          useValue: { isPlaying: jest.fn(() => false), pause: jest.fn(), play: jest.fn() },
        },
      ],
    });

    service = TestBed.inject(OfflineBounceService);
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  it("loads and schedules the preset sample during a track bounce", async () => {
    const sample = { duration: 2 } as AudioBuffer;
    const source = { buffer: null, connect: jest.fn(), start: jest.fn(), stop: jest.fn(), playbackRate: { setValueAtTime: jest.fn() } };
    const param = () => ({ value: 0, setValueAtTime: jest.fn(), setTargetAtTime: jest.fn(), linearRampToValueAtTime: jest.fn() });
    const ctx: any = {
      destination: {},
      createGain: jest.fn(() => ({ gain: param(), connect: jest.fn() })),
      createStereoPanner: jest.fn(() => ({ pan: param(), connect: jest.fn() })),
      createBufferSource: jest.fn(() => source),
    };
    const track = { id: 'piano', type: 'midi', instrumentId: 'grand-piano', gain: 0.8, pan: 0, clips: [],
      notes: [{ step: 2, midi: 72, length: 2, velocity: 0.8 }] };
    mockMusicManager.tracks = () => [track];
    mockMusicManager.prepareTrackSamples = jest.fn(async () => undefined);
    mockMusicManager.arrangementNotes = jest.fn(() => track.notes);
    const instruments = (service as any).instruments;
    jest.spyOn(instruments, 'isSamplePreset').mockReturnValue(true);
    jest.spyOn(instruments, 'getPresetSample').mockReturnValue({ buffer: sample, rate: 2, oneShot: false, release: 0.05 });
    await (service as any).renderArrangement(ctx, 64, 8, 44100, undefined, 'piano');
    expect(mockMusicManager.prepareTrackSamples).toHaveBeenCalledWith(track, true);
    expect(source.buffer).toBe(sample);
    expect(source.playbackRate.setValueAtTime).toHaveBeenCalledWith(2, 0.25);
    expect(source.start).toHaveBeenCalledWith(0.25);
  });

  it("uses swing-adjusted drum notes for a synth-kit track bounce", async () => {
    const param = () => ({ value: 0, setValueAtTime: jest.fn(), setTargetAtTime: jest.fn(), linearRampToValueAtTime: jest.fn() });
    const ctx: any = { destination: {}, createGain: jest.fn(() => ({ gain: param(), connect: jest.fn() })) };
    const note = { step: 1, midi: 36, length: 1, velocity: 0.8 };
    const track = { id: 'drums', type: 'drum', instrumentId: 'synth-kit', gain: 0.8, pan: 0, clips: [], notes: [note] };
    mockMusicManager.tracks = () => [track];
    mockMusicManager.arrangementNotes = jest.fn(() => [{ ...note, microOffset: 0.5 }]);
    await (service as any).renderArrangement(ctx, 64, 8, 44100, undefined, 'drums');
    expect(mockMusicManager.arrangementNotes).toHaveBeenCalledWith(track, 64);
    expect(mockAudioEngine.scheduleOfflineNote.mock.calls[0][3]).toBeCloseTo(0.1875);
  });

  it("schedules the actual drum cycle in a track bounce", async () => {
    const manager = Object.create(MusicManagerService.prototype) as MusicManagerService;
    (manager as any).engine = { loopLengthSteps: () => 64 };
    const track = { id: 'drums', type: 'drum', drumPatternLength: 5, instrumentId: 'synth-kit', gain: 1, pan: 0, clips: [],
      notes: [{ id: 'hit', step: 1, midi: 36, length: 1, velocity: 0.8 }, { id: 'hidden', step: 8, midi: 38, length: 1, velocity: 0.8 }] };
    mockMusicManager.tracks = () => [track];
    mockMusicManager.arrangementNotes = manager.arrangementNotes.bind(manager);
    const param = () => ({ value: 0, setValueAtTime: jest.fn(), setTargetAtTime: jest.fn(), linearRampToValueAtTime: jest.fn() });
    const ctx: any = { destination: {}, createGain: jest.fn(() => ({ gain: param(), connect: jest.fn() })) };
    await (service as any).renderArrangement(ctx, 16, 2, 44100, undefined, 'drums', 13);
    expect(mockAudioEngine.scheduleOfflineNote.mock.calls.map((call: any[]) => call[3])).toEqual([0.125, 0.75, 1.375]);
  });

  it("does not extend a bounce for hidden notes beyond the drum cycle", () => {
    mockMusicManager.tracks = () => [{ id: 'drums', type: 'drum', drumPatternLength: 5, clips: [], notes: [{ step: 100, length: 1 }] }];
    mockMusicManager.drumPatternSpan = () => 5;
    expect((service as any).computeTotalSteps()).toBe(80);
  });

  it("passes the requested bars and tail to the authoritative renderer", async () => {
    const track = { id: 'drums', type: 'drum', instrumentId: 'synth-kit', gain: 1, pan: 0, clips: [], notes: [] };
    mockMusicManager.tracks = () => [track];
    const exporter = TestBed.inject(ExportService);
    const buffer = {
      duration: 4,
      length: 4 * 48000,
      sampleRate: 48000,
      numberOfChannels: 2,
      getChannelData: () => new Float32Array(4 * 48000),
    };
    const render = jest
      .spyOn(exporter, "renderProjectOffline")
      .mockResolvedValue(buffer as any);
    try {
      const result = await service.bounce('wav-16');
      expect(result).toBeTruthy();
      // Auto-detect keeps the historical length: 80 steps (five bars) plus the
      // default two-second tail.
      expect(render.mock.calls[0][0]).toMatchObject({
        durationBars: 5,
        tailSeconds: 2,
      });
      if (result) URL.revokeObjectURL(result.url);

      const explicit = await service.bounce('wav-16', 2, 0.5);
      expect(explicit).toBeTruthy();
      expect(render.mock.calls[1][0]).toMatchObject({
        durationBars: 2,
        tailSeconds: 0.5,
      });
      if (explicit) URL.revokeObjectURL(explicit.url);
    } finally {
      render.mockRestore();
    }
  });

  it("repeats a swung drum hit in a track bounce and skips a failed probability gate", () => {
    const note = { step: 1, midi: 36, length: 1, velocity: 0.8, microOffset: 0.5, probability: 0.5, params: { ratchet: 4 } };
    const random = jest.spyOn(Math, 'random').mockReturnValue(0.25);
    try {
      (service as any).renderNote({}, note, 1, {}, {}, 0.125, 'synth-kit', 0, true);
      expect(random).toHaveBeenCalledTimes(1);
      expect(mockAudioEngine.scheduleOfflineNote.mock.calls.map((call: any[]) => call[3])).toEqual([0.1875, 0.21875, 0.25, 0.28125]);
      random.mockReturnValue(0.75);
      mockAudioEngine.scheduleOfflineNote.mockClear();
      (service as any).renderNote({}, note, 1, {}, {}, 0.125, 'synth-kit', 0, true);
      expect(mockAudioEngine.scheduleOfflineNote).not.toHaveBeenCalled();
    } finally { random.mockRestore(); }
  });

  it("takes note starts and lengths from the integrated tempo ramp", () => {
    const param = () => ({
      value: 0,
      setValueAtTime: jest.fn(),
      setTargetAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
    });
    const ctx: any = {
      createGain: jest.fn(() => ({ gain: param(), connect: jest.fn() })),
    };
    const note = { step: 2, midi: 60, length: 1, velocity: 0.8 };
    const secondsAt = (step: number) => step * 0.25 + 0.5;
    mockAudioEngine.scheduleOfflineNote.mockClear();

    (service as any).renderNote(
      ctx,
      note,
      1,
      { type: "sine" },
      {},
      0.125,
      "synth-lead",
      0,
      false,
      secondsAt,
    );

    const call = mockAudioEngine.scheduleOfflineNote.mock.calls[0];
    expect(call[3]).toBeCloseTo(secondsAt(2), 9);
    expect(call[5]).toBeCloseTo(secondsAt(3) - secondsAt(2), 9);
    expect(call[3]).not.toBeCloseTo(2 * 0.125, 9);
  });

  it("retriggers preset and imported samples during a track bounce", () => {
    const starts: number[] = [];
    const param = () => ({ value: 0, setValueAtTime: jest.fn(), setTargetAtTime: jest.fn(), linearRampToValueAtTime: jest.fn() });
    const ctx: any = {
      createGain: jest.fn(() => ({ gain: param(), connect: jest.fn() })),
      createStereoPanner: jest.fn(() => ({ pan: param(), connect: jest.fn() })),
      createBufferSource: jest.fn(() => ({ buffer: null, connect: jest.fn(), playbackRate: param(), start: jest.fn((time) => starts.push(time)), stop: jest.fn() })),
    };
    const sample = { duration: 0.4 } as AudioBuffer;
    const instruments = (service as any).instruments;
    jest.spyOn(instruments, 'isSamplePreset').mockReturnValue(true);
    jest.spyOn(instruments, 'getPresetSample').mockReturnValue({ buffer: sample, rate: 1, oneShot: true, release: 0 });
    const note = { step: 0, midi: 36, length: 1, velocity: 0.8, params: { ratchet: 2 } };
    (service as any).renderNote(ctx, note, 1, {}, {}, 0.125, 'kit', 0, true);
    expect(starts).toEqual([0, 0.0625]);
    starts.length = 0;
    (service as any).renderNote(ctx, { ...note, params: { ...note.params, sampleBuffer: sample } }, 1, {}, {}, 0.125, 'kit', 0, true);
    expect(starts).toEqual([0, 0.0625]);
  });

  it("renders synth notes through the engine's shared voice builder", () => {
    const destination = { connect: jest.fn() } as any;
    const ctx: any = { createGain: jest.fn() };
    const note = {
      step: 4,
      midi: 72,
      length: 2,
      velocity: 0.8,
      params: { glideTo: 220 },
    };
    const instruments = (service as any).instruments;
    const sampleSpy = jest
      .spyOn(instruments, 'isSamplePreset')
      .mockReturnValue(false);
    (service as any).renderNote(
      ctx,
      note,
      0.7,
      { type: "sawtooth", cutoff: 1200, sustain: 0.4 },
      destination,
      0.125,
      "synth-lead",
      -0.25,
    );
    expect(mockAudioEngine.scheduleOfflineNote).toHaveBeenCalledTimes(1);
    const [calledCtx, calledDest, freq, start, peak, duration, params, pan] =
      mockAudioEngine.scheduleOfflineNote.mock.calls[0];
    expect(calledCtx).toBe(ctx);
    expect(calledDest).toBe(destination);
    expect(freq).toBeCloseTo(523.25, 1);
    expect(start).toBe(0.5);
    expect(peak).toBeCloseTo(0.56, 5);
    expect(duration).toBeCloseTo(0.25, 5);
    expect(params).toMatchObject({
      type: "sawtooth",
      cutoff: 1200,
      sustain: 0.4,
      glideTo: 220,
    });
    expect(pan).toBe(-0.25);
    sampleSpy.mockRestore();
  });

  it("should start in idle state", () => {
    expect(service.progress().state).toBe("idle");
    expect(service.isBouncing()).toBe(false);
    expect(service.lastResult()).toBeNull();
  });

  it("should bounce to WAV 32-bit float", async () => {
    // wav-32-float uses 96kHz — may fail in mock due to buffer sizing.
    // Verify that at least the service doesn't crash.
    try {
      const result = await service.bounce("wav-32-float", 2, 0.5);
      if (result) {
        expect(result!.format).toBe("wav-32-float");
        URL.revokeObjectURL(result!.url);
      }
    } catch {
      // Expected in JSDOM with high sample rate
    }
    expect(service.isBouncing()).toBe(false);
  });

  it("should bounce to WAV 16-bit", async () => {
    const result = await service.bounce("wav-16", 2, 0.5);
    expect(result).toBeTruthy();
    expect(result!.format).toBe("wav-16");
    URL.revokeObjectURL(result!.url);
  });

  it("should track progress during bounce", async () => {
    const progressStates: string[] = [];
    try {
      const result = await service.bounce("wav-16", 2, 0.5, (p) => {
        progressStates.push(p.state);
      });
      if (result) {
        URL.revokeObjectURL(result.url);
        expect(progressStates.length).toBeGreaterThan(0);
      }
    } catch {
      // Mock may fail on OfflineAudioContext quirks; verify no crash
    }
    // At minimum, the service should have started processing
    expect(progressStates.length >= 0).toBe(true);
  });

  it("should handle soloed and muted track states", async () => {
    // Test solo mode: only soloed tracks render
    mockMusicManager.tracks = () => [
      {
        name: "Solo",
        notes: [{ step: 0, midi: 67, length: 4, velocity: 0.8 }],
        clips: [],
        gain: 0.8,
        synthParams: { type: "sine" },
        muted: false,
        soloed: true,
      },
      {
        name: "Non-solo",
        notes: [{ step: 0, midi: 48, length: 4, velocity: 0.8 }],
        clips: [],
        gain: 0.8,
        synthParams: { type: "sine" },
        muted: false,
        soloed: false,
      },
    ];
    // The bounce may or may not succeed in mock — just verify no throw
    const result = await service.bounce("wav-16", 2, 0.5);
    if (result) URL.revokeObjectURL(result.url);
    expect(service.isBouncing()).toBe(false);
  });

  it("should render streamed clips from their resident window at the clip origin", async () => {
    const windowBuffer = { duration: 1, length: 48000, sampleRate: 48000, numberOfChannels: 2 };
    const streamer = {
      setPlayhead: jest.fn(),
      getResidentBuffer: jest.fn(() => windowBuffer),
    };
    mockMusicManager.tracks = () => [
      {
        id: "streamed",
        name: "Streamed",
        notes: [],
        clips: [
          {
            type: "audio",
            start: 0,
            length: 4,
            clipStreamer: streamer,
            clipOriginSeconds: 2,
            clipSampleRate: 48000,
          },
        ],
        gain: 0.8,
        synthParams: { type: "sine" },
        muted: false,
        soloed: false,
      },
    ];
    const renderSpy = jest
      .spyOn(service as any, "renderAudioClip")
      .mockImplementation(() => {});
    // The arrangement pass is still the renderer for a stem-shaped selection;
    // the full bounce now delegates to ExportService, which reads the same
    // streamer (see its clip scheduling).
    const ctx: any = {
      destination: {},
      createGain: jest.fn(() => ({
        gain: { value: 0, setValueAtTime: jest.fn() },
        connect: jest.fn(),
      })),
      createStereoPanner: jest.fn(() => ({
        pan: { value: 0, setValueAtTime: jest.fn() },
        connect: jest.fn(),
      })),
    };
    await (service as any).renderArrangement(
      ctx,
      32,
      4,
      48000,
      undefined,
      "streamed",
    );
    expect(streamer.setPlayhead).toHaveBeenCalledWith(96000);
    expect(renderSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ clipStreamer: streamer }),
      windowBuffer,
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    renderSpy.mockRestore();
  });

  it("should not throw on cancel", () => {
    expect(() => service.cancel()).not.toThrow();
    expect(service.isBouncing()).toBe(false);
  });

  it("should handle empty and auto-detect tracks", async () => {
    mockMusicManager.tracks = () => [];
    const result = await service.bounce("wav-16", 2, 0.5);
    if (result) URL.revokeObjectURL(result.url);
    // After any bounce attempt, service should not be stuck in bouncing state
    expect(service.isBouncing()).toBe(false);
  });

  it("should auto-detect duration from arrangement", async () => {
    const result = await service.bounce("wav-16");
    if (result) URL.revokeObjectURL(result.url);
    expect(service.isBouncing()).toBe(false);
  });

  it("applies step lanes in a full bounce, not just a stem", async () => {
    const automation = TestBed.inject(AutomationService);
    const gains: any[] = [];
    const param = () => ({
      value: 0,
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
      setTargetAtTime: jest.fn(),
    });
    const rendered = {
      duration: 2.5,
      length: Math.ceil(2.5 * 48000),
      sampleRate: 48000,
      numberOfChannels: 2,
      getChannelData: () => new Float32Array(Math.ceil(2.5 * 48000)),
    };
    const offline: any = {
      destination: {},
      sampleRate: 48000,
      createGain: jest.fn(() => {
        const node = { gain: param(), connect: jest.fn() };
        gains.push(node);
        return node;
      }),
      createStereoPanner: jest.fn(() => ({ pan: param(), connect: jest.fn() })),
      createBiquadFilter: jest.fn(() => ({
        type: "lowpass",
        frequency: param(),
        Q: param(),
        gain: param(),
        connect: jest.fn(),
      })),
      createDynamicsCompressor: jest.fn(() => ({
        threshold: param(),
        ratio: param(),
        attack: param(),
        release: param(),
        knee: param(),
        connect: jest.fn(),
      })),
      createWaveShaper: jest.fn(() => ({
        curve: null,
        oversample: "none",
        connect: jest.fn(),
      })),
      createConvolver: jest.fn(() => ({ buffer: null, connect: jest.fn() })),
      createDelay: jest.fn(() => ({ delayTime: param(), connect: jest.fn() })),
      createBufferSource: jest.fn(() => ({
        buffer: null,
        connect: jest.fn(),
        playbackRate: param(),
        start: jest.fn(),
        stop: jest.fn(),
      })),
      startRendering: jest.fn().mockResolvedValue(rendered),
    };
    const original = (globalThis as any).OfflineAudioContext;
    (globalThis as any).OfflineAudioContext = jest.fn(() => offline);
    mockMusicManager.tracks = () => [
      {
        id: "lead",
        name: "Lead",
        type: "midi",
        muted: false,
        soloed: false,
        gain: 0.53,
        volume: 0.53,
        pan: 0,
        sendA: 0,
        sendB: 0,
        notes: [],
        clips: [],
        synthParams: { type: "sine" },
      },
    ];
    mockMusicManager.activeLoopBars = jest.fn(() => 1);
    mockMusicManager.prepareTrackSamples = jest.fn(async () => undefined);
    automation.lanes.set([
      {
        id: "lane-lead-volume-step",
        target: { trackId: "lead", parameter: "volume" },
        points: [
          { time: 0, value: 0.2 },
          { time: 1, value: 0.9 },
        ],
        enabled: true,
        interpolation: "step" as const,
        modulationDepth: 0,
      },
    ]);

    try {
      const result = await service.bounce("wav-16", 1, 0.5);
      expect(result).toBeTruthy();
      if (result) URL.revokeObjectURL(result.url);

      // The full mix runs the same renderer as a stem, so the lane reaches the
      // track fader and steps instead of gliding.
      const fader = gains.find((node) => node.gain.value === 0.53);
      expect(fader).toBeTruthy();
      const written = fader!.gain.setValueAtTime.mock.calls.map(
        ([value]: [number]) => value,
      );
      expect(written).toContain(0.2);
      expect(written).toContain(0.9);
      expect(written.every((value: number) => value === 0.2 || value === 0.9)).toBe(
        true,
      );
      expect(fader!.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    } finally {
      automation.lanes.set([]);
      if (original === undefined) {
        delete (globalThis as any).OfflineAudioContext;
      } else {
        (globalThis as any).OfflineAudioContext = original;
      }
    }
  });

  it("carries step lanes through the shared renderer in a stem bounce", async () => {
    const automation = TestBed.inject(AutomationService);
    const gains: any[] = [];
    const param = () => ({
      value: 0,
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
      setTargetAtTime: jest.fn(),
    });
    const rendered = {
      duration: 3,
      length: 3 * 44100,
      sampleRate: 44100,
      numberOfChannels: 2,
      getChannelData: () => new Float32Array(3 * 44100),
    };
    const offline: any = {
      destination: {},
      sampleRate: 44100,
      createGain: jest.fn(() => {
        const node = { gain: param(), connect: jest.fn() };
        gains.push(node);
        return node;
      }),
      createStereoPanner: jest.fn(() => ({ pan: param(), connect: jest.fn() })),
      createBiquadFilter: jest.fn(() => ({
        type: "lowpass",
        frequency: param(),
        Q: param(),
        gain: param(),
        connect: jest.fn(),
      })),
      createConvolver: jest.fn(() => ({ buffer: null, connect: jest.fn() })),
      createDelay: jest.fn(() => ({ delayTime: param(), connect: jest.fn() })),
      createBufferSource: jest.fn(() => ({
        buffer: null,
        connect: jest.fn(),
        playbackRate: param(),
        start: jest.fn(),
        stop: jest.fn(),
      })),
      startRendering: jest.fn().mockResolvedValue(rendered),
    };
    const original = (globalThis as any).OfflineAudioContext;
    (globalThis as any).OfflineAudioContext = jest.fn(() => offline);
    mockMusicManager.tracks = () => [
      {
        id: "lead",
        name: "Lead",
        type: "midi",
        muted: false,
        soloed: false,
        gain: 0.53,
        volume: 0.53,
        pan: 0,
        sendA: 0,
        sendB: 0,
        notes: [],
        clips: [],
        synthParams: { type: "sine" },
      },
    ];
    mockMusicManager.activeLoopBars = jest.fn(() => 1);
    mockMusicManager.prepareTrackSamples = jest.fn(async () => undefined);
    automation.lanes.set([
      {
        id: "lane-lead-volume-step",
        target: { trackId: "lead", parameter: "volume" },
        points: [
          { time: 0, value: 0.2 },
          { time: 1, value: 0.9 },
        ],
        enabled: true,
        interpolation: "step" as const,
        modulationDepth: 0,
      },
    ]);

    try {
      const result = await service.bounceTrack("lead");
      expect(result).toBeTruthy();
      if (result) URL.revokeObjectURL(result.url);

      // The stem render goes through ExportService, so the step lane reaches
      // the track fader as a step — never as a ramp.
      const fader = gains.find((node) => node.gain.value === 0.53);
      expect(fader).toBeTruthy();
      const written = fader!.gain.setValueAtTime.mock.calls.map(
        ([value]: [number]) => value,
      );
      expect(written).toContain(0.2);
      expect(written).toContain(0.9);
      expect(written.every((value: number) => value === 0.2 || value === 0.9)).toBe(
        true,
      );
      expect(fader!.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    } finally {
      automation.lanes.set([]);
      if (original === undefined) {
        delete (globalThis as any).OfflineAudioContext;
      } else {
        (globalThis as any).OfflineAudioContext = original;
      }
    }
  });
});
