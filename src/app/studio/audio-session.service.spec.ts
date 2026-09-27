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
        {
          provide: MusicManagerService,
          useValue: {
            selectedTrackId: jest.fn(() => ""),
            startRecording: jest.fn(),
            stopRecording: jest.fn(),
            tracks: jest.fn(() => []),
          },
        },
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
    wakeLockMock.request.mockClear();
    wakeLockMock.release.mockClear();
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
});
