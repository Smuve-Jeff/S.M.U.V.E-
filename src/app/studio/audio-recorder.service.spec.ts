import { TestBed } from "@angular/core/testing";
import { AudioRecorderService } from "./audio-recorder.service";
import { LocalStorageService } from "../services/local-storage.service";
import { LoggingService } from "../services/logging.service";

describe("AudioRecorderService", () => {
  let service: AudioRecorderService;
  let localStorageMock: any;
  let loggerMock: any;

  beforeEach(() => {
    localStorageMock = {
      saveItem: jest.fn().mockResolvedValue(undefined),
      getItem: jest.fn().mockResolvedValue(null),
      getAllItems: jest.fn().mockResolvedValue([]),
      persistenceStatus: jest.fn().mockResolvedValue("ready"),
      deleteItem: jest.fn().mockResolvedValue(undefined),
    };
    loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        AudioRecorderService,
        { provide: LocalStorageService, useValue: localStorageMock },
        { provide: LoggingService, useValue: loggerMock },
      ],
    });
    service = TestBed.inject(AudioRecorderService);
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  it("should create", () => {
    expect(service).toBeTruthy();
  });

  it("should start with isRecording false", () => {
    expect(service.isRecording()).toBe(false);
  });

  it("should reject startRecording when stream has no audio tracks", async () => {
    const emptyStream = { getAudioTracks: () => [] } as unknown as MediaStream;
    await expect(service.startRecording(emptyStream)).rejects.toThrow(
      "No audio tracks found in stream",
    );
  });

  it("should start recording with a valid stream", async () => {
    const mediaRecorderMock = {
      start: jest.fn(),
      stop: jest.fn(),
      state: "inactive",
      ondataavailable: null as any,
      onstop: null as any,
    };
    (globalThis as any).MediaRecorder = jest
      .fn()
      .mockImplementation(() => mediaRecorderMock);
    (MediaRecorder as any).isTypeSupported = jest.fn().mockReturnValue(true);

    const audioTrack = { kind: "audio" } as MediaStreamTrack;
    const stream = {
      getAudioTracks: () => [audioTrack],
    } as unknown as MediaStream;

    await service.startRecording(stream);

    expect(service.isRecording()).toBe(true);
    expect(service.mediaRecorder).toBe(mediaRecorderMock);
    expect(mediaRecorderMock.start).toHaveBeenCalled();
  });

  it("should reject a second recording while the current take is active", async () => {
    const mediaRecorderMock = {
      start: jest.fn(),
      stop: jest.fn(),
      state: "inactive",
      ondataavailable: null as any,
      onstop: null as any,
    };
    (globalThis as any).MediaRecorder = jest.fn().mockImplementation(() => mediaRecorderMock);
    (MediaRecorder as any).isTypeSupported = jest.fn().mockReturnValue(true);
    const stream = { getAudioTracks: () => [{}] } as unknown as MediaStream;

    await service.startRecording(stream);
    await expect(service.startRecording(stream)).rejects.toThrow("already in progress");
    expect(mediaRecorderMock.start).toHaveBeenCalledTimes(1);
  });

  it("prefers a supported recording format and preserves the recorder MIME type", async () => {
    const mediaRecorderMock = {
      start: jest.fn(),
      stop: jest.fn(),
      state: "recording",
      mimeType: "audio/mp4",
      ondataavailable: null as any,
      onstop: null as any,
    };
    (globalThis as any).MediaRecorder = jest.fn().mockImplementation(() => mediaRecorderMock);
    (MediaRecorder as any).isTypeSupported = jest.fn((type: string) => type === "audio/mp4");
    const stream = { getAudioTracks: () => [{}] } as unknown as MediaStream;
    await service.startRecording(stream);
    expect((MediaRecorder as unknown as jest.Mock).mock.calls.at(-1)?.[1]).toEqual({ mimeType: "audio/mp4" });
  });

  it("should stop recording and clear state", () => {
    const stopSpy = jest.fn();
    service.mediaRecorder = {
      state: "recording",
      stop: stopSpy,
    } as unknown as MediaRecorder;

    service.isRecording.set(true);
    service.stopRecording();

    expect(stopSpy).toHaveBeenCalled();
  });

  it("persists a custom take name to the offline recording record", async () => {
    const item = {
      id: "rec_named",
      blob: new Blob(["audio"]),
      name: "Old name",
      timestamp: 1,
      settings: {},
    };
    localStorageMock.getItem.mockResolvedValueOnce(item);
    await service.renameOfflineRecording("rec_named", "Verse comp");
    expect(localStorageMock.saveItem).toHaveBeenCalledWith("audio_blobs", {
      ...item,
      name: "Verse comp",
    });
  });

  it("refuses offline recording saves when durable storage is unavailable", async () => {
    localStorageMock.persistenceStatus.mockResolvedValueOnce("failed");
    await expect(service.saveOfflineRecording({
      id: "rec_unsaved", blob: new Blob(), name: "Take", timestamp: 1, settings: {},
    })).rejects.toThrow("unavailable");
    expect(localStorageMock.saveItem).not.toHaveBeenCalled();
  });

  it("deletes a take through the storage service deletion API", async () => {
    await service.deleteOfflineRecording("rec_delete");
    expect(localStorageMock.deleteItem).toHaveBeenCalledWith("audio_blobs", "rec_delete");
  });

  it("should not throw when stopping a null recorder", () => {
    expect(() => service.stopRecording()).not.toThrow();
  });

  it("should not stop an already inactive recorder", () => {
    const stopSpy = jest.fn();
    service.mediaRecorder = {
      state: "inactive",
      stop: stopSpy,
    } as unknown as MediaRecorder;

    service.stopRecording();
    expect(stopSpy).not.toHaveBeenCalled();
  });

  it("should revoke recording URLs", () => {
    const revokeSpy = jest.spyOn(URL, "revokeObjectURL");

    // Manually add a URL to the active set via onstop simulation
    const blob = new Blob(["test"], { type: "audio/webm" });
    const url = URL.createObjectURL(blob);
    (service as any).activeUrls.add(url);

    service.revokeRecordingUrl(url);

    expect(revokeSpy).toHaveBeenCalled();
  });

  it("should clean up all URLs on destroy", () => {
    const revokeSpy = jest.spyOn(URL, "revokeObjectURL");
    const blob = new Blob(["test"], { type: "audio/webm" });
    const url = URL.createObjectURL(blob);
    (service as any).activeUrls.add(url);

    service.ngOnDestroy();

    expect(revokeSpy).toHaveBeenCalled();
  });

  it("should emit recordingFinished$ on mediaRecorder.onstop", async () => {
    let onstopCb: (() => void) | null = null;
    const mediaRecorderMock = {
      start: jest.fn(),
      stop: jest.fn(),
      state: "recording",
      mimeType: "audio/mp4",
      set ondataavailable(_: any) {},
      set onstop(cb: any) {
        onstopCb = cb;
      },
    };
    (globalThis as any).MediaRecorder = jest
      .fn()
      .mockImplementation(() => mediaRecorderMock);
    (MediaRecorder as any).isTypeSupported = jest.fn().mockReturnValue(true);

    const audioTrack = { kind: "audio" } as MediaStreamTrack;
    const stream = {
      getAudioTracks: () => [audioTrack],
    } as unknown as MediaStream;

    const emitted: any[] = [];
    service.recordingFinished$.subscribe((v) => emitted.push(v));

    await service.startRecording(stream);
    expect(service.isRecording()).toBe(true);

    // Simulate onstop
    onstopCb?.();

    // Let microtasks settle
    await new Promise((r) => setTimeout(r, 10));

    expect(emitted.length).toBe(1);
    expect(emitted[0].id).toMatch(/^rec_/);
    expect(emitted[0].blob).toBeInstanceOf(Blob);
    expect(emitted[0].blob.type).toBe("audio/mp4");
    expect(emitted[0].name).toMatch(/^Recording /);
    expect(localStorageMock.saveItem).toHaveBeenCalledWith(
      "audio_blobs",
      expect.objectContaining({ id: emitted[0].id, name: emitted[0].name }),
    );
    expect(service.isRecording()).toBe(false);
  });
});
