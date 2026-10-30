import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { AudioSessionService } from "./audio-session.service";
import { LoggingService } from "../services/logging.service";
import { InstrumentService } from "./instrument.service";
import { AudioEngineService } from "../services/audio-engine.service";
import { MicrophoneService } from "../services/microphone.service";
import { StudioRecordingEngineService } from "./studio-recording-engine.service";
import { MusicManagerService } from "../services/music-manager.service";
import { RecordingStatusService } from "./recording-status.service";
import { ScreenWakeLockService } from "../services/screen-wake-lock.service";
import { SnackbarService } from "../services/snackbar.service";

describe("AudioSessionService", () => {
  let service: AudioSessionService;

  const engineMock = {
    isPlaying: jest.fn(() => false),
    start: jest.fn(),
    stop: jest.fn(),
    setMasterOutputLevel: jest.fn(),
    visualStep: signal(32),
    tempo: signal(120),
    transportStepAt: jest.fn(() => engineMock.visualStep()),
    stepsPerBeat: () => 4,
    ctx: { currentTime: 10, decodeAudioData: jest.fn() },
  };

  const recordingEngineMock = {
    initialize: jest.fn(() => Promise.resolve()),
    isInitialized: jest.fn(() => false),
    isRecording: jest.fn(() => false),
    recordedBlob: jest.fn(() => null as Blob | null),
    getRecordedFrameCount: jest.fn(() => 0),
    getCaptureStartedAt: jest.fn(() => null as number | null),
    getInputLatencySeconds: jest.fn(() => 0),
  };

  const wakeLockMock = {
    request: jest.fn(),
    release: jest.fn(),
  };

  const snackbarMock = {
    info: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  };

  const musicManagerMock = {
    selectedTrackId: jest.fn(() => "track-1"),
    startRecording: jest.fn(),
    stopRecording: jest.fn(),
    tracks: jest.fn(() => [{ id: "track-1", name: "Lead" }]),
    placeRecordedTake: jest.fn(),
  };

  const armedTrackIds = signal<Set<string>>(new Set());
  const recordDestinations = signal<
    { trackId: string; trackName: string }[]
  >([]);

  const recordingStatusMock = {
    clearRecordingSource: jest.fn(),
    setRecordingSource: jest.fn(),
    beginRecording: jest.fn(),
    endRecording: jest.fn(),
    armedTrackIds,
    isTrackArmed: (id: string) => armedTrackIds().has(id),
    recordDestinations: recordDestinations.asReadonly(),
    setRecordDestinations: jest.fn(
      (destinations: { trackId: string; trackName: string }[]) =>
        recordDestinations.set(destinations),
    ),
    clearRecordDestinations: jest.fn(() => recordDestinations.set([])),
  };

  const setVisibility = (state: "visible" | "hidden") => {
    Object.defineProperty(document, "visibilityState", {
      value: state,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        { provide: InstrumentService, useValue: { play: jest.fn() } },
        { provide: AudioEngineService, useValue: engineMock },
        {
          provide: MicrophoneService,
          useValue: { availableDevices: signal([]) },
        },
        {
          provide: StudioRecordingEngineService,
          useValue: recordingEngineMock,
        },
        { provide: MusicManagerService, useValue: musicManagerMock },
        { provide: SnackbarService, useValue: snackbarMock },
        { provide: RecordingStatusService, useValue: recordingStatusMock },
        { provide: ScreenWakeLockService, useValue: wakeLockMock },
      ],
    });
    service = TestBed.inject(AudioSessionService);
    engineMock.stop.mockClear();
    engineMock.start.mockClear();
    wakeLockMock.request.mockClear();
    wakeLockMock.release.mockClear();
    snackbarMock.warning.mockClear();
    musicManagerMock.startRecording.mockClear();
    musicManagerMock.stopRecording.mockReset();
    recordingEngineMock.isRecording.mockReturnValue(false);
    armedTrackIds.set(new Set());
    recordDestinations.set([]);
    musicManagerMock.selectedTrackId.mockReturnValue("track-1");
    musicManagerMock.tracks.mockReturnValue([{ id: "track-1", name: "Lead" }]);
    musicManagerMock.placeRecordedTake.mockReset();
    recordingEngineMock.isInitialized.mockReturnValue(false);
    recordingEngineMock.recordedBlob.mockReturnValue(null);
    recordingEngineMock.getRecordedFrameCount.mockReturnValue(0);
    recordingEngineMock.getCaptureStartedAt.mockReturnValue(null);
    recordingEngineMock.getInputLatencySeconds.mockReturnValue(0);
    engineMock.ctx.currentTime = 10;
    engineMock.visualStep.set(32);
    engineMock.transportStepAt.mockReset();
    engineMock.transportStepAt.mockImplementation(() => engineMock.visualStep());
  });

  describe("record destination", () => {
    it("records onto the armed mixer tracks, not merely the selected one", async () => {
      musicManagerMock.tracks.mockReturnValue([
        { id: "track-1", name: "Lead" },
        { id: "track-2", name: "Bass" },
      ]);
      armedTrackIds.set(new Set(["track-2"]));

      await service.toggleRecord();

      const source = recordingStatusMock.beginRecording.mock.calls.at(-1)?.[1];
      expect(source.type).toBe("transport");
      expect(source.trackId).toBe("track-2");
      expect(source.destinations).toEqual([
        { trackId: "track-2", trackName: "Bass" },
      ]);
      expect(recordingStatusMock.setRecordDestinations).toHaveBeenCalledWith([
        { trackId: "track-2", trackName: "Bass" },
      ]);
      expect(service.isRecording()).toBe(true);
    });

    it("falls back to the selected track when nothing is armed", () => {
      expect(service.recordDestinations()).toEqual([
        { trackId: "track-1", trackName: "Lead" },
      ]);
      expect(service.recordTargetLabel()).toBe("Rec target: Lead");
    });

    it("refuses to arm REC with no track to write to", async () => {
      musicManagerMock.tracks.mockReturnValue([]);
      musicManagerMock.selectedTrackId.mockReturnValue(null);
      service.playbackState.set("stopped");

      await service.toggleRecord();

      expect(engineMock.start).not.toHaveBeenCalled();
      expect(musicManagerMock.startRecording).not.toHaveBeenCalled();
      expect(snackbarMock.warning).toHaveBeenCalledWith(
        expect.stringContaining("Arm a track"),
      );
      expect(service.isRecording()).toBe(false);
    });

    it("places the finished pass on its destination track at the punch position", async () => {
      service.playbackState.set("stopped");
      const buffer = { duration: 2 } as AudioBuffer;
      const blob = {
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Blob;
      engineMock.ctx.decodeAudioData.mockResolvedValue(buffer);
      recordingEngineMock.isInitialized.mockReturnValue(true);
      recordingEngineMock.recordedBlob.mockReturnValue(blob);
      recordingEngineMock.getRecordedFrameCount.mockReturnValue(96000);
      musicManagerMock.placeRecordedTake.mockReturnValue({
        trackId: "track-1",
        trackName: "Lead",
        clipId: "clip_rec",
        startBar: 2,
        lengthBars: 1,
      });
      engineMock.visualStep.set(32);

      await service.toggleRecord(); // arm
      await service.toggleRecord(); // stop and place
      await service.whenTakeSaved();

      expect(musicManagerMock.placeRecordedTake).toHaveBeenCalledWith(
        expect.objectContaining({
          trackId: "track-1",
          startStep: 32,
          tempo: 120,
          buffer,
        }),
      );
      expect(snackbarMock.success).toHaveBeenCalledWith(
        "Take placed on Lead at bar 3",
      );
    });

    it("aligns the clip to the worklet's first captured block", async () => {
      service.playbackState.set("stopped");
      const blob = {
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Blob;
      engineMock.ctx.decodeAudioData.mockResolvedValue({ duration: 2 });
      engineMock.transportStepAt.mockReturnValue(32);
      recordingEngineMock.isInitialized.mockReturnValue(true);
      recordingEngineMock.recordedBlob.mockReturnValue(blob);
      recordingEngineMock.getRecordedFrameCount.mockReturnValue(96000);
      // Capture began 40 ms after the punch: 0.32 steps at 120 BPM (0.125 s
      // per 16th). The clip must move with it instead of assuming the punch
      // step was the first sample.
      recordingEngineMock.getCaptureStartedAt.mockReturnValue(10.04);
      musicManagerMock.placeRecordedTake.mockReturnValue({
        trackId: "track-1",
        trackName: "Lead",
        clipId: "clip_rec",
        startBar: 2.02,
        lengthBars: 1,
      });

      await service.toggleRecord();
      await service.toggleRecord();
      await service.whenTakeSaved();

      const call = musicManagerMock.placeRecordedTake.mock.calls.at(-1)?.[0];
      expect(call.startStep).toBeCloseTo(32.32, 6);
      expect(call.trimSeconds).toBe(0);
    });

    it("subtracts the applied input round-trip latency from the anchor", async () => {
      service.playbackState.set("stopped");
      const blob = {
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Blob;
      engineMock.ctx.decodeAudioData.mockResolvedValue({ duration: 2 });
      engineMock.transportStepAt.mockReturnValue(32);
      recordingEngineMock.isInitialized.mockReturnValue(true);
      recordingEngineMock.recordedBlob.mockReturnValue(blob);
      recordingEngineMock.getRecordedFrameCount.mockReturnValue(96000);
      recordingEngineMock.getCaptureStartedAt.mockReturnValue(10.04);
      // 20 ms of interface latency → the performance anchor is 10.02.
      recordingEngineMock.getInputLatencySeconds.mockReturnValue(0.02);
      musicManagerMock.placeRecordedTake.mockReturnValue({
        trackId: "track-1",
        trackName: "Lead",
        clipId: "clip_rec",
        startBar: 2.01,
        lengthBars: 1,
      });

      await service.toggleRecord();
      await service.toggleRecord();
      await service.whenTakeSaved();

      const call = musicManagerMock.placeRecordedTake.mock.calls.at(-1)?.[0];
      expect(call.startStep).toBeCloseTo(32.16, 6);
      expect(call.trimSeconds).toBe(0);
    });

    it("trims pre-roll when capture started before the punch", async () => {
      service.playbackState.set("stopped");
      const blob = {
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Blob;
      engineMock.ctx.decodeAudioData.mockResolvedValue({ duration: 2 });
      engineMock.transportStepAt.mockReturnValue(-0.36);
      recordingEngineMock.isInitialized.mockReturnValue(true);
      recordingEngineMock.recordedBlob.mockReturnValue(blob);
      recordingEngineMock.getRecordedFrameCount.mockReturnValue(96000);
      // 4 ms after arm; the transport's first step is still ~46 ms away.
      recordingEngineMock.getCaptureStartedAt.mockReturnValue(10.004);
      musicManagerMock.placeRecordedTake.mockReturnValue({
        trackId: "track-1",
        trackName: "Lead",
        clipId: "clip_rec",
        startBar: 0,
        lengthBars: 1,
      });

      await service.toggleRecord();
      await service.toggleRecord();
      await service.whenTakeSaved();

      const call = musicManagerMock.placeRecordedTake.mock.calls.at(-1)?.[0];
      expect(call.startStep).toBe(0);
      // 0.328 steps of pre-roll × 0.125 s per step.
      expect(call.trimSeconds).toBeCloseTo(0.041, 6);
    });

    it("does not create a clip when the pass captured no audio", async () => {
      service.playbackState.set("stopped");
      recordingEngineMock.isInitialized.mockReturnValue(true);
      recordingEngineMock.recordedBlob.mockReturnValue(null);
      recordingEngineMock.getRecordedFrameCount.mockReturnValue(0);

      await service.toggleRecord();
      await service.toggleRecord();
      await service.whenTakeSaved();

      expect(musicManagerMock.placeRecordedTake).not.toHaveBeenCalled();
      expect(snackbarMock.warning).toHaveBeenCalledWith(
        expect.stringContaining("No audio"),
      );
    });

    it("clears the destination highlights when the pass stops", async () => {
      recordDestinations.set([{ trackId: "track-1", trackName: "Lead" }]);
      recordingStatusMock.endRecording.mockClear();
      service.playbackState.set("recording");

      await service.toggleRecord();

      expect(recordingStatusMock.endRecording).toHaveBeenCalledWith("transport");
      expect(service.isRecording()).toBe(false);
    });
  });

  // ── Background/freeze safety: a live take must not die with the process ──
  describe("background safety stop", () => {
    it("finalizes a live take when the page is discarded (pagehide)", () => {
      // A record pass: the transport reads 'recording' and the capture engine
      // is actually capturing, which is the state that must be saved.
      recordingEngineMock.isRecording.mockReturnValue(true);
      service.playbackState.set("recording");

      window.dispatchEvent(new Event("pagehide"));

      expect(engineMock.stop).toHaveBeenCalled();
      expect(musicManagerMock.stopRecording).toHaveBeenCalledWith("track-1");
      expect(service.lastBackgroundStopAt()).not.toBeNull();
      expect(service.playbackState()).toBe("stopped");
    });

    it("finalizes when the app is frozen", () => {
      recordingEngineMock.isRecording.mockReturnValue(true);
      service.playbackState.set("recording");

      document.dispatchEvent(new Event("freeze"));

      expect(engineMock.stop).toHaveBeenCalled();
      expect(service.lastBackgroundStopAt()).not.toBeNull();
    });

    it("finalizes a capture that outlived the transport", () => {
      // A pass started outside the transport record button leaves the capture
      // graph running while playbackState already reads 'stopped'.
      recordingEngineMock.isRecording.mockReturnValue(true);

      setVisibility("hidden");

      expect(engineMock.stop).toHaveBeenCalled();
      expect(musicManagerMock.stopRecording).toHaveBeenCalled();
    });

    it("leaves an idle session untouched when the page is discarded", () => {
      service.playbackState.set("stopped");

      window.dispatchEvent(new Event("pagehide"));

      expect(engineMock.stop).not.toHaveBeenCalled();
      expect(musicManagerMock.stopRecording).not.toHaveBeenCalled();
      expect(service.lastBackgroundStopAt()).toBeNull();
    });

    it("exposes the take save so a caller can await durability", async () => {
      let release!: () => void;
      musicManagerMock.stopRecording.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
      recordingEngineMock.isRecording.mockReturnValue(true);
      service.playbackState.set("recording");

      window.dispatchEvent(new Event("pagehide"));

      let saved = false;
      const pending = service.whenTakeSaved().then(() => {
        saved = true;
      });
      await Promise.resolve();
      expect(saved).toBe(false);

      release();
      await pending;
      expect(saved).toBe(true);
    });

    it("does not ask to save a pass that captured nothing", async () => {
      // Transport says 'recording' but the capture graph never started (input
      // unavailable → MIDI-only pass). There is no audio to persist, so the
      // background stop must not fake a save.
      service.playbackState.set("recording");

      window.dispatchEvent(new Event("pagehide"));

      expect(musicManagerMock.stopRecording).not.toHaveBeenCalled();
      await expect(service.whenTakeSaved()).resolves.toBeNull();
    });
  });

  it("stops playback when the tab/app is hidden mid-transport", () => {
    service.playbackState.set("playing");

    setVisibility("hidden");

    expect(engineMock.stop).toHaveBeenCalled();
    expect(service.playbackState()).toBe("stopped");
  });

  it("does not stop the transport when the tab stays visible", () => {
    service.playbackState.set("playing");

    setVisibility("visible");

    expect(engineMock.stop).not.toHaveBeenCalled();
    expect(service.playbackState()).toBe("playing");
  });

  it("does not stop the transport for a hidden tab when already stopped", () => {
    service.playbackState.set("stopped");

    setVisibility("hidden");

    expect(engineMock.stop).not.toHaveBeenCalled();
  });

  it("holds the screen awake while playing and releases it on stop", () => {
    service.playbackState.set("playing");
    TestBed.flushEffects();

    expect(wakeLockMock.request).toHaveBeenCalled();

    wakeLockMock.request.mockClear();
    service.stop();
    TestBed.flushEffects();

    expect(wakeLockMock.request).not.toHaveBeenCalled();
    expect(wakeLockMock.release).toHaveBeenCalled();
  });

  it("holds the screen awake while recording", () => {
    service.playbackState.set("recording");
    TestBed.flushEffects();

    expect(wakeLockMock.request).toHaveBeenCalled();
  });

  // ── Pre-armed mic init is gesture-gated, not boot-time ──
  describe("pre-armed microphone", () => {
    it("does NOT call getUserMedia during service construction", () => {
      // A fresh TestBed instance: construction must not touch the engine.
      recordingEngineMock.initialize.mockClear();
      TestBed.inject(AudioSessionService);

      expect(recordingEngineMock.initialize).not.toHaveBeenCalled();
    });

    it("initializes the armed channel after the first user gesture", async () => {
      recordingEngineMock.initialize.mockClear();
      TestBed.inject(AudioSessionService);

      document.body.dispatchEvent(new Event("click"));
      // The arm handler awaits initializeMic asynchronously.
      await Promise.resolve();
      await Promise.resolve();

      expect(recordingEngineMock.initialize).toHaveBeenCalledTimes(1);
    });

    it("initializes at most once even after several gestures", async () => {
      recordingEngineMock.initialize.mockClear();
      TestBed.inject(AudioSessionService);

      for (let i = 0; i < 5; i += 1) {
        document.body.dispatchEvent(new Event("click"));
      }
      await Promise.resolve();
      await Promise.resolve();

      expect(recordingEngineMock.initialize).toHaveBeenCalledTimes(1);
    });

    it("degrades to a warning when the armed channel has no device", async () => {
      recordingEngineMock.initialize.mockClear();
      recordingEngineMock.initialize.mockRejectedValueOnce(
        Object.assign(new Error("Requested device not found"), {
          name: "NotFoundError",
        }),
      );
      TestBed.inject(AudioSessionService);

      document.body.dispatchEvent(new Event("click"));
      await Promise.resolve();
      await Promise.resolve();

      expect(recordingEngineMock.initialize).toHaveBeenCalledTimes(1);
    });
  });

  // ── A record pass must never claim REC over a dead input ──
  describe("record pass priming", () => {
    it("opens the input before arming REC", async () => {
      recordingEngineMock.initialize.mockClear();
      recordingEngineMock.isInitialized.mockReturnValue(false);
      recordingEngineMock.initialize.mockImplementation(() => {
        // The real engine only reports ready once the graph is live.
        recordingEngineMock.isInitialized.mockReturnValue(true);
        recordingEngineMock.isRecording.mockReturnValue(true);
        return Promise.resolve(true);
      });

      await service.toggleRecord();

      expect(recordingEngineMock.initialize).toHaveBeenCalledTimes(1);
      expect(engineMock.start).toHaveBeenCalled();
      expect(musicManagerMock.startRecording).toHaveBeenCalled();
      expect(service.isRecording()).toBe(true);
      expect(snackbarMock.warning).not.toHaveBeenCalled();
    });

    it("still rolls for MIDI, with a warning, when no input can be opened", async () => {
      recordingEngineMock.initialize.mockClear();
      recordingEngineMock.isInitialized.mockReturnValue(false);
      recordingEngineMock.initialize.mockResolvedValue(false);
      recordingEngineMock.isRecording.mockReturnValue(false);

      await service.toggleRecord();

      expect(service.isRecording()).toBe(true);
      expect(musicManagerMock.startRecording).toHaveBeenCalled();
      expect(snackbarMock.warning).toHaveBeenCalledTimes(1);
    });

    it("ignores a second press while the pass is still being armed", async () => {
      let releaseInput: (ready: boolean) => void = () => {};
      recordingEngineMock.initialize.mockClear();
      recordingEngineMock.isInitialized.mockReturnValue(false);
      recordingEngineMock.initialize.mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            releaseInput = resolve;
          }),
      );

      const first = service.toggleRecord();
      const second = service.toggleRecord();
      releaseInput(true);
      recordingEngineMock.isInitialized.mockReturnValue(true);
      recordingEngineMock.isRecording.mockReturnValue(true);
      await Promise.all([first, second]);

      expect(engineMock.start).toHaveBeenCalledTimes(1);
      expect(musicManagerMock.startRecording).toHaveBeenCalledTimes(1);
    });
  });
});
