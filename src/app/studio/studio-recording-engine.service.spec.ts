import { TestBed } from "@angular/core/testing";
import { StudioRecordingEngineService } from "./studio-recording-engine.service";
import { AudioEngineService } from "../services/audio-engine.service";
import { AudioEngineLatencyService } from "../services/audio-engine-latency.service";
import { LoggingService } from "../services/logging.service";
import { LocalStorageService } from "../services/local-storage.service";
import { RecordingCaptureBuffer } from "./recording-capture-buffer";
import {
  IdbRecordingSpillStore,
  RECORDING_CHUNK_STORE,
} from "./recording-spill.store";

describe("StudioRecordingEngineService", () => {
  let service: StudioRecordingEngineService;
  let audioCtxMock: any;
  let mediaStreamMock: MediaStream;
  let latencyMock: { getAppliedCompensationMs: jest.Mock<number, []> };

  beforeEach(() => {
    // Mock AudioContext
    audioCtxMock = {
      sampleRate: 48000,
      createAnalyser: jest.fn(() => ({
        fftSize: 0,
        connect: jest.fn(),
        getByteFrequencyData: jest.fn(),
        frequencyBinCount: 128,
        disconnect: jest.fn(),
      })),
      createMediaStreamSource: jest.fn(() => ({
        connect: jest.fn(),
        disconnect: jest.fn(),
      })),
      createGain: jest.fn(() => ({
        gain: { value: 0 },
        connect: jest.fn(),
        disconnect: jest.fn(),
      })),
      destination: {},
      audioWorklet: {
        addModule: jest.fn().mockResolvedValue(undefined),
      },
    };

    mediaStreamMock = {
      getAudioTracks: () => [
        { kind: "audio", stop: jest.fn() } as unknown as MediaStreamTrack,
      ],
      getTracks: () => [
        { kind: "audio", stop: jest.fn() } as unknown as MediaStreamTrack,
      ],
    } as unknown as MediaStream;
    latencyMock = {
      getAppliedCompensationMs: jest.fn(() => 0),
    };

    // Mock getUserMedia
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: jest.fn().mockResolvedValue(mediaStreamMock) },
      writable: true,
      configurable: true,
    });

    TestBed.configureTestingModule({
      providers: [
        StudioRecordingEngineService,
        { provide: AudioEngineService, useValue: { ctx: audioCtxMock } },
        { provide: AudioEngineLatencyService, useValue: latencyMock },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        {
          provide: LocalStorageService,
          useValue: { saveItem: jest.fn(), getItem: jest.fn() },
        },
      ],
    });
    service = TestBed.inject(StudioRecordingEngineService);
  });

  it("should create with default state", () => {
    expect(service.isInitialized()).toBe(false);
    expect(service.isRecording()).toBe(false);
    expect(service.isPaused()).toBe(false);
    expect(service.recordingTime()).toBe(0);
    expect(service.takes().length).toBe(0);
  });

  it("should return empty buffers when not recording", () => {
    const buffers = service.getRecordedBuffers();
    expect(buffers.left).toEqual([]);
    expect(buffers.right).toEqual([]);
  });

  it("should fully trim recorded buffers when compensation exceeds the take length", () => {
    latencyMock.getAppliedCompensationMs.mockReturnValue(1000);
    service.capture.append(
      [Float32Array.from([1, 2])],
      [Float32Array.from([3, 4])],
    );

    const buffers = service.getRecordedBuffers();

    expect(buffers.left).toEqual([]);
    expect(buffers.right).toEqual([]);
  });

  it("should return null analyser when not initialized", () => {
    expect(service.getAnalyserNode()).toBeNull();
  });

  it("should refuse to start recording without initialization", () => {
    service.startRecording();
    expect(service.isRecording()).toBe(false);
  });

  it("should not double-start recording", () => {
    // Force internal state
    (service as any).isRecording.set(true);
    service.startRecording();
    // Still true, never called again
    expect(service.isRecording()).toBe(true);
  });

  it("should pause and resume recording", () => {
    // Simulate recording state
    (service as any).isRecording.set(true);
    (service as any).recordingWorkletReady = true;

    service.pauseRecording();
    expect(service.isPaused()).toBe(true);

    service.resumeRecording();
    expect(service.isPaused()).toBe(false);
  });

  it("should not stop when not recording", async () => {
    await service.stopRecording();
    expect(service.isRecording()).toBe(false);
  });

  it("should surface the take even when persistence fails", async () => {
    const localStorage = TestBed.inject(LocalStorageService) as any;
    localStorage.saveItem.mockRejectedValue(new Error("quota exceeded"));
    const finished: any[] = [];
    service.recordingFinished$.subscribe((take) => finished.push(take));

    (service as any).isRecording.set(true);
    (service as any).workletNode = {
      port: { postMessage: jest.fn() },
      disconnect: jest.fn(),
    };

    await expect(service.stopRecording()).resolves.toBeUndefined();

    // The performance must not be lost just because the offline copy failed.
    expect(service.recordedBlob()).not.toBeNull();
    expect(finished).toHaveLength(1);
    expect(finished[0].blob).toBe(service.recordedBlob());
  });

  it("reassembles a spilled long take when recording stops", async () => {
    // A take longer than the resident window must come back whole: the chunks
    // that spilled to storage are rehydrated before the WAV is built.
    const localStorage = TestBed.inject(LocalStorageService) as any;
    const spilled: any[] = [];
    localStorage.persistenceStatus = jest.fn().mockResolvedValue("ready");
    localStorage.saveItem = jest.fn(async (_store: string, item: any) => {
      spilled.push(item);
    });
    localStorage.getItem = jest.fn(
      async (_store: string, id: string) =>
        spilled.find((record) => record.id === id) ?? null,
    );
    localStorage.getAllItems = jest.fn(async () => [...spilled]);
    localStorage.deleteItems = jest.fn(async () => undefined);

    // 64 bytes of resident PCM: two 16-frame stereo pairs already overflow it.
    service.capture = new RecordingCaptureBuffer({
      sampleRate: 48000,
      maxResidentBytes: 64,
      spill: new IdbRecordingSpillStore(localStorage),
    });

    const port = {
      postMessage: jest.fn(),
      onmessage: null as any,
    };
    (service as any).isRecording.set(true);
    (service as any).workletNode = { port, disconnect: jest.fn() };
    port.postMessage.mockImplementation((message: any) => {
      if (message?.command === "FLUSH") {
        // The worklet acknowledges the flush after posting its DATA.
        queueMicrotask(() =>
          (service as any).handleWorkletMessage({
            data: { command: "FLUSHED" },
          }),
        );
      }
    });

    const finished: any[] = [];
    service.recordingFinished$.subscribe((take) => finished.push(take));

    for (let i = 0; i < 3; i++) {
      (service as any).handleWorkletMessage({
        data: {
          command: "DATA",
          left: [new Float32Array(16).fill(i), new Float32Array(16).fill(i)],
          right: [new Float32Array(16).fill(i), new Float32Array(16).fill(i)],
        },
      });
    }

    expect(service.capture.frames).toBe(96);

    await service.stopRecording();

    expect(service.capture.spilledRecords).toBeGreaterThan(0);
    expect(spilled.length).toBeGreaterThan(0);
    // The full 96-frame take survived: resident window + spilled groups.
    expect(service.recordingTime()).toBeCloseTo(96 / 48000, 6);
    expect(finished).toHaveLength(1);
    expect(finished[0].metadata.duration).toBeCloseTo(96 / 48000, 6);
  });

  it("produces byte-identical take audio whether or not the take had to spill", async () => {
    // The end-to-end guarantee of the bounded buffer: spilling changes where
    // the PCM lived, never what the artist hears.
    const runTake = async (maxResidentBytes: number) => {
      const store = TestBed.inject(LocalStorageService) as any;
      const spilled: any[] = [];
      store.persistenceStatus = jest.fn().mockResolvedValue("ready");
      store.saveItem = jest.fn(async (storeName: string, item: any) => {
        // The engine also persists the finished take (audio_blobs) — only the
        // capture-chunk records are spill evidence.
        if (storeName === RECORDING_CHUNK_STORE) spilled.push(item);
      });
      store.getItem = jest.fn(
        async (_s: string, id: string) =>
          spilled.find((record) => record.id === id) ?? null,
      );
      store.getAllItems = jest.fn(async () => [...spilled]);
      store.deleteItems = jest.fn(async () => undefined);

      service.capture = new RecordingCaptureBuffer({
        sampleRate: 48000,
        maxResidentBytes,
        spill: new IdbRecordingSpillStore(store),
      });

      const port = { postMessage: jest.fn(), onmessage: null as any };
      (service as any).isRecording.set(true);
      (service as any).workletNode = { port, disconnect: jest.fn() };
      port.postMessage.mockImplementation((message: any) => {
        if (message?.command === "FLUSH") {
          queueMicrotask(() =>
            (service as any).handleWorkletMessage({
              data: { command: "FLUSHED" },
            }),
          );
        }
      });

      for (let i = 0; i < 3; i++) {
        (service as any).handleWorkletMessage({
          data: {
            command: "DATA",
            left: [
              Float32Array.from({ length: 16 }, (_, f) => (i + f) / 100),
              Float32Array.from({ length: 16 }, (_, f) => -(i + f) / 100),
            ],
            right: [
              Float32Array.from({ length: 16 }, (_, f) => -(i + f) / 100),
              Float32Array.from({ length: 16 }, (_, f) => (i + f) / 200),
            ],
          },
        });
      }

      await service.stopRecording();
      return { blob: service.recordedBlob()!, spilled };
    };

    const spilledTake = await runTake(64);
    const residentTake = await runTake(64 * 1024 * 1024);

    expect(spilledTake.spilled.length).toBeGreaterThan(0);
    expect(residentTake.spilled).toHaveLength(0);
    expect(new Uint8Array(await spilledTake.blob.arrayBuffer())).toEqual(
      new Uint8Array(await residentTake.blob.arrayBuffer()),
    );
  });

  it("should clean up on destroy", () => {
    // Set some internal state to verify cleanup
    (service as any).isInitialized.set(true);
    service.ngOnDestroy();
    expect(service.isInitialized()).toBe(false);
    expect(service.isRecording()).toBe(false);
  });

  it("should return recorded blob when set", () => {
    expect(service.recordedBlob()).toBeNull();
    const blob = new Blob(["test"], { type: "audio/wav" });
    service.recordedBlob.set(blob);
    expect(service.recordedBlob()).toBe(blob);
  });
});
