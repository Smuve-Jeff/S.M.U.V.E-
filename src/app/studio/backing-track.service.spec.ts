import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { VocalBackingTrackService } from "./backing-track.service";
import { AudioEngineService } from "../services/audio-engine.service";
import { LoggingService } from "../services/logging.service";
import { MusicManagerService } from "../services/music-manager.service";
import { LocalStorageService } from "../services/local-storage.service";

function makeBuffer(durationSeconds: number): AudioBuffer {
  return {
    duration: durationSeconds,
    numberOfChannels: 1,
    length: Math.round(durationSeconds * 48000),
    sampleRate: 48000,
  } as unknown as AudioBuffer;
}

describe("VocalBackingTrackService", () => {
  let service: VocalBackingTrackService;
  let ctx: any;
  let source: any;
  let gain: any;
  const addAudioTrack = jest.fn();
  const tracks = signal<Array<{ id: string }>>([]);
  // Keyed like IndexedDB, so a different project id finds nothing.
  const records = new Map<string, any>();
  const storageMock = {
    saveItem: jest.fn(async (_store: string, item: any) => {
      records.set(item.id, item);
    }),
    getItem: jest.fn(async (_store: string, id: string) => records.get(id) ?? null),
    deleteItem: jest.fn(async (_store: string, id: string) => {
      records.delete(id);
    }),
  };

  beforeEach(() => {
    addAudioTrack.mockClear();
    tracks.set([]);
    records.clear();
    storageMock.saveItem.mockClear();
    storageMock.getItem.mockClear();
    storageMock.deleteItem.mockClear();
    source = {
      buffer: null,
      loop: false,
      onended: null,
      connect: jest.fn(),
      disconnect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
    };
    gain = {
      gain: { value: 1, setTargetAtTime: jest.fn() },
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    ctx = {
      currentTime: 5,
      state: "running",
      destination: {},
      decodeAudioData: jest.fn().mockResolvedValue(makeBuffer(30)),
      createBufferSource: jest.fn(() => source),
      createGain: jest.fn(() => gain),
      resume: jest.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        VocalBackingTrackService,
        { provide: AudioEngineService, useValue: { ctx, tempo: signal(120) } },
        { provide: MusicManagerService, useValue: { addAudioTrack, tracks } },
        { provide: LocalStorageService, useValue: storageMock },
        {
          provide: LoggingService,
          useValue: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
        },
      ],
    });
    service = TestBed.inject(VocalBackingTrackService);
  });

  afterEach(() => {
    service.clear();
  });

  it("decodes an uploaded file as the backing track", async () => {
    const loaded = await service.loadFile(
      new File([new Uint8Array([1])], "Beat 01.mp3"),
    );

    expect(loaded).toBe(true);
    expect(service.track()?.name).toBe("Beat 01");
    expect(service.hasTrack()).toBe(true);
    expect(service.durationLabel()).toBe("0:30");
  });

  it("stores the uploaded file with the project and restores it", async () => {
    await service.loadFile(new File([new Uint8Array([1, 2, 3])], "Bed.wav"));

    await service.persistProject("project-1");

    expect(storageMock.saveItem).toHaveBeenCalledWith(
      "project_media",
      expect.objectContaining({ id: "backing_project-1", name: "Bed" }),
    );

    service.clear();
    expect(service.hasTrack()).toBe(false);

    expect(await service.restoreProject("project-1")).toBe(true);
    expect(service.track()?.name).toBe("Bed");
  });

  it("writes the file once instead of on every autosave", async () => {
    await service.loadFile(new File([new Uint8Array([1])], "Bed.wav"));

    await service.persistProject("project-1");
    await service.persistProject("project-1");

    expect(storageMock.saveItem).toHaveBeenCalledTimes(1);
  });

  it("removes the stored guide once the track is cleared", async () => {
    await service.loadFile(new File([new Uint8Array([1])], "Bed.wav"));
    await service.persistProject("project-1");

    service.clear();
    await service.persistProject("project-1");

    expect(storageMock.deleteItem).toHaveBeenCalledWith(
      "project_media",
      "backing_project-1",
    );
  });

  it("does not inherit the previous set's guide track", async () => {
    await service.loadFile(new File([new Uint8Array([1])], "Bed.wav"));
    await service.persistProject("project-1");

    expect(await service.restoreProject("project-2")).toBe(false);
    expect(service.hasTrack()).toBe(false);
  });

  it("will not add a guide that is already in the song", () => {
    const buffer = new (globalThis as any).AudioBuffer({
      length: 480,
      sampleRate: 48000,
      numberOfChannels: 1,
    });
    tracks.set([{ id: "audio_1" }]);

    service.useBuffer(buffer, "Beat", "audio_1");

    expect(service.addToArrangement()).toBeNull();
    expect(addAudioTrack).not.toHaveBeenCalled();
  });

  it("uses a song track as the guide with storable WAV bytes", () => {
    const buffer = new (globalThis as any).AudioBuffer({
      length: 480,
      sampleRate: 48000,
      numberOfChannels: 1,
    });
    buffer.getChannelData(0).fill(0.25);

    expect(service.useBuffer(buffer, "Beat")).toBe(true);

    const file = service.archiveFile()!;
    expect(file.name).toBe("Beat");
    expect(file.mimeType).toBe("audio/wav");
    expect(new TextDecoder().decode(file.data.subarray(0, 4))).toBe("RIFF");
    expect(service.track()?.buffer).toBe(buffer);
  });

  it("hands the uploaded file to the project archive", async () => {
    await service.loadFile(
      new File([new Uint8Array([1, 2, 3])], "Bed.wav", { type: "audio/wav" }),
    );

    const file = service.archiveFile();

    expect(file?.name).toBe("Bed");
    expect(file?.mimeType).toBe("audio/wav");
    expect(Array.from(file!.data)).toEqual([1, 2, 3]);
  });

  it("adopts the guide track an imported archive carried", async () => {
    const blob = new Blob([new Uint8Array([4, 5])], { type: "audio/wav" });

    expect(
      await service.adoptProject("project-9", { name: "Imported Bed", blob }),
    ).toBe(true);

    expect(service.track()?.name).toBe("Imported Bed");
    expect(storageMock.saveItem).toHaveBeenCalledWith(
      "project_media",
      expect.objectContaining({ id: "backing_project-9", name: "Imported Bed" }),
    );
    expect(Array.from(service.archiveFile()!.data)).toEqual([4, 5]);
  });

  it("reports a file it cannot decode instead of pretending it loaded", async () => {
    ctx.decodeAudioData.mockRejectedValue(new Error("unsupported container"));

    const loaded = await service.loadFile(
      new File([new Uint8Array([1])], "broken.mp3"),
    );

    expect(loaded).toBe(false);
    expect(service.hasTrack()).toBe(false);
    expect(service.lastError()).toMatch(/could not read/i);
  });

  it("plays from the requested offset at the scheduled time", async () => {
    await service.loadFile(new File([new Uint8Array([1])], "beat.wav"));

    expect(service.play(4, 6)).toBe(true);

    expect(source.start).toHaveBeenCalledWith(6, 4);
    expect(source.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(ctx.destination);
    expect(service.isPlaying()).toBe(true);
    expect(service.positionSeconds()).toBe(4);
  });

  it("starts a play press at the end of the track from the top", async () => {
    await service.loadFile(new File([new Uint8Array([1])], "beat.wav"));

    service.play(29.999, 6);

    expect(source.start).toHaveBeenCalledWith(6, 0);
    expect(service.positionSeconds()).toBe(0);
  });

  it("stops the source and clears the playing state", async () => {
    await service.loadFile(new File([new Uint8Array([1])], "beat.wav"));
    service.play(0);

    service.stop();

    expect(source.stop).toHaveBeenCalled();
    expect(source.disconnect).toHaveBeenCalled();
    expect(service.isPlaying()).toBe(false);
  });

  it("keeps the monitor level in sync with the control", async () => {
    await service.loadFile(new File([new Uint8Array([1])], "beat.wav"));
    service.play(0);

    service.setLevel(25);

    expect(service.level()).toBeCloseTo(0.25, 6);
    expect(gain.gain.setTargetAtTime).toHaveBeenCalledWith(0.25, 5, 0.02);
  });

  it("applies loop changes to the playing source", async () => {
    await service.loadFile(new File([new Uint8Array([1])], "beat.wav"));
    service.play(0);

    service.toggleLoop();

    expect(service.loop()).toBe(true);
    expect(source.loop).toBe(true);
  });

  it("adds the loaded track to the arrangement at bar 1", async () => {
    await service.loadFile(new File([new Uint8Array([1])], "beat.wav"));

    expect(service.addToArrangement()).toBe("beat");
    expect(addAudioTrack).toHaveBeenCalledWith(
      expect.objectContaining({ name: "beat", offset: 0 }),
    );
  });

  it("adds nothing when no track is loaded", () => {
    expect(service.addToArrangement()).toBeNull();
    expect(addAudioTrack).not.toHaveBeenCalled();
  });

  it("clears the loaded track", async () => {
    await service.loadFile(new File([new Uint8Array([1])], "beat.wav"));

    service.clear();

    expect(service.track()).toBeNull();
    expect(service.hasTrack()).toBe(false);
  });
});
