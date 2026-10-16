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
  };

  const recordingEngineMock = {
    initialize: jest.fn(() => Promise.resolve()),
    isInitialized: jest.fn(() => false),
    isRecording: jest.fn(() => false),
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
        {
          provide: RecordingStatusService,
          useValue: {
            clearRecordingSource: jest.fn(),
            setRecordingSource: jest.fn(),
          },
        },
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
