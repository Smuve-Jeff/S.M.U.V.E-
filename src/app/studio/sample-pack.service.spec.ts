import { TestBed } from "@angular/core/testing";
import { LocalStorageService } from "../services/local-storage.service";
import { LoggingService } from "../services/logging.service";
import { SamplePackService } from "./sample-pack.service";
import { validateSamplePackManifest } from "./sample-pack.types";

const PACKS_KEY = "smuve_sample_packs_v1";

function wavFile(name: string, size = 64): File {
  const bytes = new Uint8Array(Math.max(size, 12));
  const tag = (s: string): number[] => s.split("").map((c) => c.charCodeAt(0));
  bytes.set(tag("RIFF"), 0);
  bytes.set(tag("WAVE"), 8);
  return new File([bytes], name, { type: "audio/wav" });
}

function mp3File(name: string): File {
  const bytes = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00]);
  return new File([bytes], name, { type: "audio/mpeg" });
}

function textFile(name: string, text = "not audio"): File {
  return new File([text], name, { type: "text/plain" });
}

function manifestJson(overrides: Record<string, unknown> = {}): File {
  const manifest = {
    format: "smuve-pack",
    id: "midnight-drums",
    name: "Midnight Drums",
    version: "1.0.0",
    author: "Test Press",
    description: "Two hits for the grid.",
    genre: "trap",
    samples: [
      { file: "kick.wav", name: "MIDNIGHT KICK", category: "drum", tags: ["kick"] },
      { file: "hat.mp3", name: "MIDNIGHT HAT", category: "drum" },
    ],
    ...overrides,
  };
  return new File([JSON.stringify(manifest)], "midnight-drums.smuvepack.json", {
    type: "application/json",
  });
}

function packFiles(): File[] {
  return [manifestJson(), wavFile("kick.wav"), mp3File("hat.mp3")];
}

describe("SamplePackService", () => {
  let store: Map<string, any>;
  let service: SamplePackService;

  beforeEach(() => {
    store = new Map();
    localStorage.removeItem(PACKS_KEY);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: LocalStorageService,
          useValue: {
            persistenceStatus: jest.fn().mockResolvedValue("ready"),
            saveItem: jest.fn(async (_store: string, item: any) => {
              store.set(item.id, item);
            }),
            getItem: jest.fn(async (_store: string, id: string) => store.get(id) ?? null),
            deleteItem: jest.fn(async (_store: string, id: string) => {
              store.delete(id);
            }),
            deleteItems: jest.fn(async (_store: string, ids: string[]) => {
              ids.forEach((id) => store.delete(id));
            }),
          },
        },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
        },
      ],
    });
    service = TestBed.inject(SamplePackService);
  });

  afterEach(() => {
    localStorage.removeItem(PACKS_KEY);
  });

  it("installs a manifest plus its audio and persists both", async () => {
    const result = await service.installFromFiles(packFiles());

    expect(result).toEqual({ ok: true, packId: "midnight-drums" });
    expect(service.packs()).toHaveLength(1);
    expect(service.packs()[0].blobIds).toEqual([
      "pack:midnight-drums/kick.wav",
      "pack:midnight-drums/hat.mp3",
    ]);
    expect(store.has("pack:midnight-drums/kick.wav")).toBe(true);
    const persisted = JSON.parse(localStorage.getItem(PACKS_KEY)!);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].id).toBe("midnight-drums");
  });

  it("refuses a second install of the same pack", async () => {
    await service.installFromFiles(packFiles());

    const result = await service.installFromFiles(packFiles());

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already installed/);
    expect(service.packs()).toHaveLength(1);
  });

  it("rejects a manifest that is not JSON, not a pack, or broken", async () => {
    await expect(
      service.installFromFiles([textFile("pack.smuvepack.json", "{oops")]),
    ).resolves.toMatchObject({ ok: false });

    await expect(
      service.installFromFiles([textFile("x.smuvepack.json", "{}")]),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/Not a sample pack/) });

    const badId = manifestJson({ id: "NOPE" });
    await expect(
      service.installFromFiles([badId, wavFile("kick.wav"), mp3File("hat.mp3")]),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/pack id/) });
  });

  it("rejects missing audio, unlisted audio, and non-audio files", async () => {
    await expect(
      service.installFromFiles([manifestJson(), wavFile("kick.wav")]),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/Missing audio: hat\.mp3/) });

    await expect(
      service.installFromFiles([...packFiles(), wavFile("stowaway.wav")]),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/Not listed in the manifest/) });

    await expect(
      service.installFromFiles([
        manifestJson(),
        textFile("kick.wav"),
        mp3File("hat.mp3"),
      ]),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/not a WAV, MP3 or OGG/) });
  });

  it("rejects audio over the per-file limit", async () => {
    const big = wavFile("kick.wav", 17 * 1024 * 1024);

    const result = await service.installFromFiles([
      manifestJson(),
      big,
      mp3File("hat.mp3"),
    ]);

    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/16 MB/) });
    expect(service.packs()).toHaveLength(0);
  });

  it("uninstalls the manifest and deletes every stored blob", async () => {
    await service.installFromFiles(packFiles());

    await service.uninstall("midnight-drums");

    expect(service.packs()).toHaveLength(0);
    expect(store.size).toBe(0);
    expect(JSON.parse(localStorage.getItem(PACKS_KEY)!)).toHaveLength(0);
  });

  it("reads stored audio back and reports missing blobs as null", async () => {
    await service.installFromFiles(packFiles());

    const blob = await service.readSample("midnight-drums", "kick.wav");

    expect(blob).toBeInstanceOf(Blob);
    await expect(service.readSample("midnight-drums", "ghost.wav")).resolves.toBeNull();
    await expect(service.readSample("nope", "kick.wav")).resolves.toBeNull();
  });

  it("builds a shareable export bundle of manifest plus audio", async () => {
    await service.installFromFiles(packFiles());

    const bundle = await service.buildExport("midnight-drums");

    expect(bundle?.manifestName).toBe("midnight-drums.smuvepack.json");
    expect(bundle?.files.map((f) => f.name)).toEqual(["kick.wav", "hat.mp3"]);
    const manifestBytes = new Uint8Array(await bundle!.manifestBlob.arrayBuffer());
    const manifestText = new TextDecoder().decode(manifestBytes);
    expect(JSON.parse(manifestText).id).toBe("midnight-drums");
    expect(JSON.parse(manifestText).blobIds).toBeUndefined();
    await expect(service.buildExport("nope")).resolves.toBeNull();
  });

  it("fails an export whose audio went missing", async () => {
    await service.installFromFiles(packFiles());
    store.delete("pack:midnight-drums/hat.mp3");

    await expect(service.buildExport("midnight-drums")).resolves.toBeNull();
  });
});

describe("validateSamplePackManifest", () => {
  const good = () => ({
    format: "smuve-pack",
    id: "deep-loops",
    name: "Deep Loops",
    version: "2.1.0",
    author: "A",
    description: "Loops.",
    samples: [{ file: "loop.wav", name: "LOOP", category: "loop" }],
  });

  it("accepts a well-formed manifest", () => {
    expect(validateSamplePackManifest(good())).toMatchObject({ ok: true });
  });

  it("rejects duplicate files, bad filenames, and bad tags", () => {
    const dup = good();
    dup.samples.push({ file: "loop.wav", name: "AGAIN", category: "loop" });
    expect(validateSamplePackManifest(dup)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/twice/),
    });

    const folders = good();
    folders.samples = [{ file: "../evil.wav", name: "EVIL", category: "drum" }];
    expect(validateSamplePackManifest(folders).ok).toBe(false);

    const badTags = good();
    (badTags.samples[0] as Record<string, unknown>)["tags"] = [42];
    expect(validateSamplePackManifest(badTags).ok).toBe(false);
  });
});
