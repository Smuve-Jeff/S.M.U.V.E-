import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA, signal } from "@angular/core";
import { AudioRecorderViewComponent } from "./audio-recorder-view.component";
import { AudioRecorderService } from "../audio-recorder.service";
import { HapticService } from "../../services/haptic.service";
import { SnackbarService } from "../../services/snackbar.service";
import { LoggingService } from "../../services/logging.service";
import { AudioEngineService } from "../../services/audio-engine.service";
import { AudioEngineLatencyService } from "../../services/audio-engine-latency.service";
import { MusicManagerService } from "../../services/music-manager.service";
import { InteractionDialogService } from "../../services/interaction-dialog.service";

describe("AudioRecorderViewComponent", () => {
  let component: AudioRecorderViewComponent;
  let fixture: ComponentFixture<AudioRecorderViewComponent>;

  const mockRecorder = {

    isRecording: signal(false),
    recordingFinished$: { subscribe: jest.fn(() => ({ unsubscribe: jest.fn() })) },
    createRecordingUrl: jest.fn(() => "blob:restored"),
    getOfflineRecordings: jest.fn().mockResolvedValue([]),
    startRecording: jest.fn().mockResolvedValue(undefined),
    stopRecording: jest.fn(),
    deleteOfflineRecording: jest.fn().mockResolvedValue(undefined),
    renameOfflineRecording: jest.fn().mockResolvedValue(undefined),
    revokeRecordingUrl: jest.fn(),
  };

  const mockHaptic = { light: jest.fn(), medium: jest.fn(), heavy: jest.fn() };
  const mockSnackbar = {
    success: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  };
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    system: jest.fn(),
  };
  const mockAudioEngine = {
    resume: jest.fn(),
    ctx: new (window as any).AudioContext(),
  };

  const mockDialog = {
    confirm: jest.fn().mockResolvedValue(true),
  };
  const mockMusicManager = {
    ensureTrack: jest.fn(),
    addAudioTrack: jest.fn(),
    selectedTrackId: signal<string | null>(null),
    setInstrument: jest.fn(),
    importAudio: jest.fn(),
  };

  const rec = (over: Partial<Record<string, unknown>> = {}) => ({
    id: "rec_1",
    name: "Take One",
    timestamp: 1000,
    durationSec: 5,
    url: "blob:rec_1",
    ...over,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [AudioRecorderViewComponent],
      providers: [
        { provide: AudioRecorderService, useValue: mockRecorder },
        { provide: HapticService, useValue: mockHaptic },
        { provide: SnackbarService, useValue: mockSnackbar },
        { provide: LoggingService, useValue: mockLogger },
        { provide: AudioEngineService, useValue: mockAudioEngine },
        {
          provide: AudioEngineLatencyService,
          useValue: {
            trimAudioBuffer: jest.fn((buffer: AudioBuffer) => buffer),
          },
        },
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: InteractionDialogService, useValue: mockDialog },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(AudioRecorderViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("maps dBFS input levels to a 0-100 percentage", () => {
    expect(component.levelToPct(-60)).toBe(0);
    expect(component.levelToPct(-30)).toBe(50);
    expect(component.levelToPct(0)).toBe(100);
    expect(component.levelToPct(-999)).toBe(0);
    expect(component.levelToPct(NaN)).toBe(0);
  });

  it("formats elapsed seconds as mm:ss", () => {
    expect(component.formatTime(0)).toBe("00:00");
    expect(component.formatTime(65)).toBe("01:05");
    expect(component.formatTime(125)).toBe("02:05");
  });

  it("formats take ages as relative time", () => {
    expect(component.formatTakeAge(Date.now() - 30_000)).toBe("30s ago");
    expect(component.formatTakeAge(Date.now() - 120_000)).toBe("2m ago");
  });

  it("loads offline recordings from the recorder service", async () => {
    mockRecorder.getOfflineRecordings.mockResolvedValue([
      { id: "r1", blob: new Blob(["audio"]), name: "Rough", timestamp: 42, settings: {} },
    ]);
    component.ngOnInit();
    await fixture.whenStable();
    expect(component.recordings()).toHaveLength(1);
    expect(component.recordings()[0].name).toBe("Rough");
    expect(component.recordingCount()).toBe(1);
  });

  it("restores the take duration persisted with the blob", async () => {
    mockRecorder.getOfflineRecordings.mockResolvedValue([
      {
        id: "r2",
        blob: new Blob(["audio"]),
        name: "Kept take",
        timestamp: 7,
        settings: { durationSec: 42 },
      },
    ]);
    component.ngOnInit();
    await fixture.whenStable();
    // The bank row must show the real take length, not 0:00.
    expect(component.recordings()[0].durationSec).toBe(42);
  });

  it("re-reads offline takes when the app regains focus", async () => {
    mockRecorder.getOfflineRecordings.mockResolvedValue([
      {
        id: "r_focus",
        blob: new Blob(["audio"]),
        name: "Saved elsewhere",
        timestamp: 5,
        settings: { durationSec: 3 },
      },
    ]);
    component.onAppFocus();
    await fixture.whenStable();
    expect(component.recordings().map(({ id }) => id)).toContain("r_focus");
  });

  it("does not refresh takes while a capture is armed", () => {
    mockRecorder.isRecording.set(true);
    mockRecorder.getOfflineRecordings.mockClear();
    component.onAppFocus();
    expect(mockRecorder.getOfflineRecordings).not.toHaveBeenCalled();
    mockRecorder.isRecording.set(false);
  });

  it("banks the duration measured by the recorder service", () => {
    (component as any).handleRecordingFinished({
      id: "rec_9",
      blob: new Blob(),
      url: "blob:rec_9",
      name: "Recorded chorus",
      durationSec: 12,
    });
    expect(component.recordings()[0].durationSec).toBe(12);
    expect(component.recordings()[0].name).toBe("Recorded chorus");
  });

  it("releases the microphone once a take is banked", () => {
    const stop = jest.fn();
    component.currentStream = {
      getTracks: () => [{ stop }],
      getAudioTracks: () => [{ stop }],
    } as unknown as MediaStream;
    (component as any).handleRecordingFinished({
      id: "rec_10",
      blob: new Blob(),
      url: "blob:rec_10",
      durationSec: 3,
    });
    expect(stop).toHaveBeenCalled();
    expect(component.currentStream).toBeNull();
  });

  it("promotes the latest recording even when the offline list is newest-first", () => {
    component.recordings.set([
      rec({ id: "rec_latest", name: "Latest", durationSec: 7 }),
      rec({ id: "rec_old", name: "Older", durationSec: 3 }),
    ]);
    component.promoteToTake();
    expect(component.takes()[0].durationSec).toBe(7);
  });

  it("deletes a recording from persistence before revoking its object URL", async () => {
    component.recordings.set([rec()]);
    await component.deleteRecording("rec_1");
    expect(mockRecorder.deleteOfflineRecording).toHaveBeenCalledWith("rec_1");
    expect(mockRecorder.revokeRecordingUrl).toHaveBeenCalledWith("blob:rec_1");
    expect(component.recordings()).toHaveLength(0);
    expect(mockSnackbar.info).toHaveBeenCalledWith(
      "Recording removed from list",
    );
  });

  it("keeps the recording and URL when persistent deletion fails", async () => {
    mockRecorder.deleteOfflineRecording.mockRejectedValueOnce(new Error("disk full"));
    component.recordings.set([rec()]);
    await component.deleteRecording("rec_1");
    expect(component.recordings()).toHaveLength(1);
    expect(mockRecorder.revokeRecordingUrl).not.toHaveBeenCalled();
    expect(mockSnackbar.error).toHaveBeenCalledWith(
      "Could not delete recording — try again",
    );
  });

  it("persists a renamed take and ignores whitespace-only names", async () => {
    component.recordings.set([rec()]);
    component.startRename(component.recordings()[0]);
    component.renameValue.set("  Verse comp  ");
    await component.confirmRename();
    expect(mockRecorder.renameOfflineRecording).toHaveBeenCalledWith("rec_1", "Verse comp");
    expect(component.recordings()[0].name).toBe("Verse comp");
    expect(component.renamingId()).toBeNull();

    component.startRename(component.recordings()[0]);
    component.renameValue.set("  ");
    await component.confirmRename();
    expect(component.recordings()[0].name).toBe("Verse comp");
    expect(component.renamingId()).toBe("rec_1");
  });

  it("rolls back an in-memory rename if persistence fails", async () => {
    mockRecorder.renameOfflineRecording.mockRejectedValueOnce(new Error("disk full"));
    component.recordings.set([rec()]);
    component.startRename(component.recordings()[0]);
    component.renameValue.set("New name");
    await component.confirmRename();
    expect(component.recordings()[0].name).toBe("Take One");
    expect(component.renamingId()).toBe("rec_1");
  });

  it("does not allow concurrent microphone acquisition from repeated taps", async () => {
    let finishRequest!: (stream: MediaStream) => void;
    const getUserMedia = jest.fn(() => new Promise<MediaStream>((resolve) => {
      finishRequest = resolve;
    }));
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });

    const firstTap = component.toggleRecord();
    await component.toggleRecord();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    finishRequest({ getAudioTracks: () => [], getTracks: () => [] } as unknown as MediaStream);
    await firstTap;
    expect(mockRecorder.startRecording).toHaveBeenCalledTimes(1);
    component.ngOnDestroy();
  });

  it("preserves an in-memory take if offline persistence fails", () => {
    (component as any).handleRecordingFinished({
      id: "rec_ephemeral",
      blob: new Blob(["audio"]),
      url: "blob:ephemeral",
      name: "Ephemeral take",
      durationSec: 6,
      persisted: false,
    });
    expect(component.recordings()[0]).toEqual(expect.objectContaining({
      id: "rec_ephemeral",
      savedOffline: false,
    }));
    expect((component as any).pendingRecordingSaves.get("rec_ephemeral").blob).toBeInstanceOf(Blob);
    expect(mockSnackbar.warning).toHaveBeenCalledWith(expect.stringContaining("could not be saved offline"));
  });

  it("saves an ephemeral take when storage becomes available", async () => {
    const item = { id: "rec_ephemeral", blob: new Blob(["audio"]), name: "Take", timestamp: 1, settings: {} };
    (component as any).pendingRecordingSaves.set(item.id, item);
    (mockRecorder as any).saveOfflineRecording = jest.fn().mockResolvedValue(undefined);
    component.recordings.set([rec({ id: item.id, name: "New name", savedOffline: false })]);
    await component.saveRecordingOffline(item.id);
    expect((mockRecorder as any).saveOfflineRecording).toHaveBeenCalledWith({ ...item, name: "New name" });
    expect(component.recordings()[0].savedOffline).toBe(true);
  });

  it("shows recorder format based on the active MediaRecorder codec", () => {
    (mockRecorder as any).mediaRecorder = { mimeType: "audio/mp4;codecs=mp4a.40.2" };
    expect(component.recordingFormatLabel()).toBe("MP4 / MP4A.40.2");
  });

  it("does not replace fresh recordings with a late storage refresh", async () => {
    let finishLoad!: (items: any[]) => void;
    mockRecorder.getOfflineRecordings.mockReturnValueOnce(new Promise((resolve) => {
      finishLoad = resolve;
    }));
    const pendingLoad = (component as any).loadOfflineRecordings();
    (component as any).handleRecordingFinished({
      id: "rec_live",
      blob: new Blob(),
      url: "blob:rec_live",
      name: "Live take",
      durationSec: 8,
      persisted: false,
    });
    finishLoad([]);
    await pendingLoad;
    expect(component.recordings().map(({ id }) => id)).toContain("rec_live");
  });

  it("renames a recording in place", async () => {
    component.recordings.set([rec()]);
    component.startRename(component.recordings()[0]);
    expect(component.renamingId()).toBe("rec_1");
    component.renameValue.set("Final Take");
    await component.confirmRename();
    expect(component.recordings()[0].name).toBe("Final Take");
    expect(component.renamingId()).toBeNull();
  });

  it("toggles the noise gate and notifies via snackbar", () => {
    component.toggleNoiseGate();
    expect(component.noiseGateEnabled()).toBe(true);
    expect(mockSnackbar.warning).toHaveBeenCalledWith(
      "Arm the microphone first to use the noise gate",
    );
    expect(mockSnackbar.info).toHaveBeenCalledWith(
      "Noise gate ON (threshold: -50 dB)",
    );
    component.toggleNoiseGate();
    expect(component.noiseGateEnabled()).toBe(false);
  });

  it("clamps the noise gate threshold to the -80..-20 range", () => {
    component.setNoiseGateThreshold(-90);
    expect(component.noiseGateThreshold()).toBe(-80);
    component.setNoiseGateThreshold(-10);
    expect(component.noiseGateThreshold()).toBe(-20);
    component.setNoiseGateThreshold(-40);
    expect(component.noiseGateThreshold()).toBe(-40);
  });

  it("promotes the most recent recording into an active take", () => {
    component.recordings.set([rec({ durationSec: 7 })]);
    component.promoteToTake();
    expect(component.takes()).toHaveLength(1);
    expect(component.takes()[0].isActive).toBe(true);
    expect(component.takes()[0].name).toBe("Take 1");
    expect(component.takes()[0].durationSec).toBe(7);
  });

  it("refuses to promote a take when nothing is recorded", () => {
    component.recordings.set([]);
    component.promoteToTake();
    expect(component.takes()).toHaveLength(0);
    expect(mockSnackbar.error).toHaveBeenCalledWith(
      "Record something first to promote a take",
    );
  });

  it("selects a single take as active for comping", () => {
    component.recordings.set([rec()]);
    component.promoteToTake();
    component.promoteToTake();
    component.selectTake(component.takes()[0].id);
    expect(component.takes()[0].isActive).toBe(true);
    expect(component.takes()[1].isActive).toBe(false);
  });

  it("toggles per-take mute state", () => {
    component.recordings.set([rec()]);
    component.promoteToTake();
    const takeId = component.takes()[0].id;
    component.toggleTakeMute(takeId);
    expect(component.takeMuted()[takeId]).toBe(true);
    component.toggleTakeMute(takeId);
    expect(component.takeMuted()[takeId]).toBe(false);
  });

  it("removes a take and its mute entry", () => {
    component.recordings.set([rec()]);
    component.promoteToTake();
    const takeId = component.takes()[0].id;
    component.toggleTakeMute(takeId);
    component.removeTake(takeId);
    expect(component.takes()).toHaveLength(0);
    expect(component.takeMuted()[takeId]).toBeUndefined();
  });

  it("clears all takes after a confirmed dialog", async () => {
    component.recordings.set([rec()]);
    component.promoteToTake();
    await component.clearAllTakes();
    expect(mockDialog.confirm).toHaveBeenCalled();
    expect(component.takes()).toHaveLength(0);
    expect(mockSnackbar.info).toHaveBeenCalledWith("All takes cleared");
  });

  it("keeps takes intact when the clear dialog is cancelled", async () => {
    mockDialog.confirm.mockResolvedValueOnce(false);
    component.recordings.set([rec()]);
    component.promoteToTake();
    await component.clearAllTakes();
    expect(component.takes()).toHaveLength(1);
    expect(mockSnackbar.info).not.toHaveBeenCalledWith("All takes cleared");
  });

  it("arms recording from the idle REC state", async () => {
    const getUserMedia = jest.fn().mockResolvedValue({
      getAudioTracks: () => [],
      getTracks: () => [],
    });
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });
    await component.toggleRecord();
    expect(getUserMedia).toHaveBeenCalled();
    expect(mockRecorder.startRecording).toHaveBeenCalled();
    expect(mockSnackbar.success).toHaveBeenCalledWith(
      "Recording armed — capture live input",
    );
    component.ngOnDestroy(); // clear intervals / contexts
  });

  it("records through the noise gate and closes it when armed", async () => {
    const gateGain = { value: 1, setTargetAtTime: jest.fn() };
    const captureStream = { id: "gated-stream" };
    const analyser = {
      fftSize: 0,
      frequencyBinCount: 128,
      getByteFrequencyData: jest.fn(),
    };
    const FakeAudioContext = jest.fn().mockImplementation(() => ({
      currentTime: 0,
      destination: {},
      createAnalyser: jest.fn(() => analyser),
      createGain: jest.fn(() => ({
        gain: gateGain,
        connect: jest.fn(),
        disconnect: jest.fn(),
      })),
      createMediaStreamSource: jest.fn(() => ({ connect: jest.fn() })),
      createMediaStreamDestination: jest.fn(() => ({ stream: captureStream })),
      close: jest.fn().mockResolvedValue(undefined),
    }));
    const OriginalCtx = (globalThis as any).AudioContext;
    (globalThis as any).AudioContext = FakeAudioContext;

    const getUserMedia = jest.fn().mockResolvedValue({
      getAudioTracks: () => [],
      getTracks: () => [],
    });
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });

    try {
      await component.toggleRecord();

      // The recorder receives the gated bus, not the raw microphone stream.
      expect(mockRecorder.startRecording).toHaveBeenCalledWith(captureStream);

      component.toggleNoiseGate();
      expect(gateGain.setTargetAtTime).toHaveBeenCalledWith(0, 0, 0.01);
    } finally {
      (globalThis as any).AudioContext = OriginalCtx;
      component.ngOnDestroy();
    }
  });

  it("stops recording when already armed", () => {
    mockRecorder.isRecording.set(true);
    component.toggleRecord();
    expect(mockRecorder.stopRecording).toHaveBeenCalled();
    expect(mockSnackbar.info).toHaveBeenCalledWith("Recording stopped");
    component.ngOnDestroy();
  });

  it("rejects exporting a recording that has no audio data", () => {
    component.recordings.set([rec({ url: "" })]);
    component.exportToArrangement(component.recordings()[0]);
    expect(mockSnackbar.error).toHaveBeenCalledWith(
      "Recording has no audio data to export",
    );
    expect(mockMusicManager.addAudioTrack).not.toHaveBeenCalled();
  });
});
