import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { ComponentRecordingService } from "./component-recording.service";
import { AudioEngineService } from "../services/audio-engine.service";
import { MusicManagerService } from "../services/music-manager.service";
import { MicrophoneService } from "../services/microphone.service";
import { StudioRecordingEngineService } from "./studio-recording-engine.service";
import { RecordingStatusService } from "./recording-status.service";
import { LoggingService } from "../services/logging.service";
import { SnackbarService } from "../services/snackbar.service";

describe("ComponentRecordingService", () => {
  let service: ComponentRecordingService;
  let audioEngineMock: any;
  let recordingEngineMock: any;
  let musicManagerMock: any;
  let recordingStatusMock: any;
  let snackbarMock: any;

  const fakeBlob = {
    arrayBuffer: jest.fn(async () => new ArrayBuffer(16)),
  } as unknown as Blob;
  const decodedBuffer = { duration: 4.2 } as AudioBuffer;
  const masterStream = {} as MediaStream;

  beforeEach(async () => {
    audioEngineMock = {
      isRecording: signal(false),
      isPlaying: signal(false),
      resume: jest.fn(),
      ctx: {
        decodeAudioData: jest.fn().mockResolvedValue(decodedBuffer),
      },
      getMasterStream: jest.fn(() => ({ stream: masterStream })),
    };

    recordingEngineMock = {
      isInitialized: jest.fn().mockReturnValue(false),
      initialize: jest.fn().mockResolvedValue(true),
      prepareCaptureWorklet: jest.fn().mockResolvedValue(true),
      startRecording: jest.fn().mockImplementation(() => {
        // The real engine flips its state signal only once capture is live.
        recordingEngineMock.isRecording.mockReturnValue(true);
      }),
      isRecording: jest.fn().mockReturnValue(false),
      stopRecording: jest.fn().mockResolvedValue(undefined),
      recordedBlob: signal<Blob | null>(null),
      getRecordedFrameCount: jest.fn().mockReturnValue(0),
    };

    musicManagerMock = {
      addAudioTrack: jest.fn(),
    };

    recordingStatusMock = {
      beginRecording: jest.fn(),
      endRecording: jest.fn(),
    };

    snackbarMock = {
      info: jest.fn(),
      warning: jest.fn(),
      error: jest.fn(),
      success: jest.fn(),
    };

    await TestBed.configureTestingModule({
      providers: [
        ComponentRecordingService,
        { provide: AudioEngineService, useValue: audioEngineMock },
        { provide: MusicManagerService, useValue: musicManagerMock },
        {
          provide: MicrophoneService,
          useValue: { inputDeviceName: signal("Scarlett 2i2") },
        },
        {
          provide: StudioRecordingEngineService,
          useValue: recordingEngineMock,
        },
        { provide: RecordingStatusService, useValue: recordingStatusMock },
        {
          provide: LoggingService,
          useValue: { error: jest.fn(), warn: jest.fn() },
        },
        { provide: SnackbarService, useValue: snackbarMock },
      ],
    }).compileComponents();

    service = TestBed.inject(ComponentRecordingService);
    jest.useFakeTimers();
  });

  afterEach(() => {
    service.ngOnDestroy();
    jest.useRealTimers();
  });

  it("should create with default state", () => {
    expect(service.isRecording()).toBe(false);
    expect(service.activeSource()).toBeNull();
    expect(service.recordingDuration()).toBe(0);
    expect(service.lastTake()).toBeNull();
  });

  it("should list 7 component configs", () => {
    expect(service.componentConfigs.length).toBe(7);
  });

  it("should get config by ID", () => {
    const config = service.getConfig("drum-machine");
    expect(config).toBeDefined();
    expect(config!.label).toBe("Drum Machine");
    expect(config!.sourceBus).toBe("master");
    expect(config!.supportsMidi).toBe(true);
  });

  it("should return undefined for unknown component", () => {
    expect(service.getConfig("nonexistent" as any)).toBeUndefined();
  });

  it("should set active source and describe the exact route", () => {
    service.setActiveSource("vocal-suite");

    expect(service.activeSource()).toBe("vocal-suite");
    expect(service.captureSummary()).toContain("Scarlett 2i2");
    expect(service.captureSummary()).toContain("New arrangement track");
  });

  it("should refuse to record without a source", async () => {
    const result = await service.startRecording();
    expect(result).toBe(false);
  });

  it("captures internal components from the master bus, not the microphone", async () => {
    service.setActiveSource("drum-machine");
    const started = await service.startRecording();

    expect(started).toBe(true);
    expect(recordingEngineMock.prepareCaptureWorklet).toHaveBeenCalled();
    expect(recordingEngineMock.initialize).not.toHaveBeenCalled();
    expect(recordingEngineMock.startRecording).toHaveBeenCalledWith(masterStream);
    expect(audioEngineMock.isRecording()).toBe(true);
  });

  it("opens the microphone for input-based components", async () => {
    service.setActiveSource("vocal-suite");
    await service.startRecording();

    expect(recordingEngineMock.initialize).toHaveBeenCalled();
    expect(recordingEngineMock.prepareCaptureWorklet).not.toHaveBeenCalled();
    expect(recordingEngineMock.startRecording).toHaveBeenCalledWith(undefined);
  });

  it("registers the component and its real capture bus with the REC readout", async () => {
    service.setActiveSource("drum-machine");
    await service.startRecording();

    expect(recordingStatusMock.beginRecording).toHaveBeenCalledWith(
      "component-recording",
      expect.objectContaining({
        type: "component",
        componentId: "drum-machine",
        componentLabel: "Drum Machine",
        captureMode: "master",
        inputLabel: "Studio master output",
      }),
    );
  });

  it("reports the microphone route for an input-based component", async () => {
    service.setActiveSource("audio-recorder");
    await service.startRecording();

    expect(recordingStatusMock.beginRecording).toHaveBeenCalledWith(
      "component-recording",
      expect.objectContaining({
        componentId: "audio-recorder",
        captureMode: "input",
        inputLabel: "Scarlett 2i2",
      }),
    );
  });

  it("should report failure instead of claiming REC when capture is refused", async () => {
    recordingEngineMock.startRecording.mockImplementation(() => undefined);
    recordingEngineMock.isRecording.mockReturnValue(false);

    service.setActiveSource("drum-machine");
    const started = await service.startRecording();

    expect(started).toBe(false);
    expect(service.isRecording()).toBe(false);
    expect(audioEngineMock.isRecording()).toBe(false);
    expect(recordingStatusMock.beginRecording).not.toHaveBeenCalled();
    expect(snackbarMock.error).toHaveBeenCalled();
  });

  it("does not switch source while a pass is running", async () => {
    service.setActiveSource("drum-machine");
    await service.startRecording();

    service.setActiveSource("mixer");

    expect(service.activeSource()).toBe("drum-machine");
    expect(snackbarMock.warning).toHaveBeenCalledWith(
      "Stop the current pass before changing source",
    );
  });

  it("should not double-start recording", async () => {
    service.setActiveSource("drum-machine");
    await service.startRecording();
    const result = await service.startRecording();
    expect(result).toBe(false);
  });

  it("commits a finished component pass to the arrangement", async () => {
    recordingEngineMock.recordedBlob.set(fakeBlob);
    recordingEngineMock.getRecordedFrameCount.mockReturnValue(96000);

    service.setActiveSource("drum-machine");
    await service.startRecording();
    const take = await service.stopRecording();

    expect(recordingEngineMock.stopRecording).toHaveBeenCalled();
    expect(audioEngineMock.ctx.decodeAudioData).toHaveBeenCalled();
    expect(musicManagerMock.addAudioTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringContaining("Drum Machine"),
        buffer: decodedBuffer,
        offset: 0,
      }),
    );
    expect(take).toEqual(
      expect.objectContaining({
        componentLabel: "Drum Machine",
        durationSec: 4.2,
      }),
    );
    expect(service.lastTake()).toBe(take);
    expect(service.isRecording()).toBe(false);
    expect(recordingStatusMock.endRecording).toHaveBeenCalledWith(
      "component-recording",
    );
  });

  it("does not add an empty component pass to the arrangement", async () => {
    recordingEngineMock.recordedBlob.set(null);
    recordingEngineMock.getRecordedFrameCount.mockReturnValue(0);

    service.setActiveSource("drum-machine");
    await service.startRecording();
    const take = await service.stopRecording();

    expect(take).toBeNull();
    expect(musicManagerMock.addAudioTrack).not.toHaveBeenCalled();
    expect(snackbarMock.warning).toHaveBeenCalledWith(
      "Component pass finished with no audio — not added",
    );
  });

  it("should not stop when not recording", async () => {
    await service.stopRecording();
    expect(recordingEngineMock.stopRecording).not.toHaveBeenCalled();
  });

  it("should toggle recording", async () => {
    service.setActiveSource("drum-machine");
    await service.toggleRecording();
    expect(service.isRecording()).toBe(true);

    await service.toggleRecording();
    expect(service.isRecording()).toBe(false);
  });

  it("should track recording duration", async () => {
    service.setActiveSource("drum-machine");
    await service.startRecording();

    jest.advanceTimersByTime(5000);
    expect(service.recordingDuration()).toBe(5);

    await service.stopRecording();
    jest.advanceTimersByTime(3000);
    expect(service.recordingDuration()).toBe(5);
  });

  it("clears the duration timer and REC registration on destroy", async () => {
    service.setActiveSource("drum-machine");
    await service.startRecording();

    service.ngOnDestroy();
    jest.advanceTimersByTime(5000);

    expect(service.recordingDuration()).toBe(0);
    expect(recordingStatusMock.endRecording).toHaveBeenCalledWith(
      "component-recording",
    );
  });
});
