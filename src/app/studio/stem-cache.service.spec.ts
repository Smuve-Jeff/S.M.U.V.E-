import { TestBed } from "@angular/core/testing";
import {
  StemCacheService,
  StemCacheStore,
  type StoredStemRecord,
} from "./stem-cache.service";

class MemoryStore extends StemCacheStore {
  readonly records = new Map<string, StoredStemRecord>();

  async put(record: StoredStemRecord): Promise<void> {
    this.records.set(record.key, record);
  }

  async get(key: string): Promise<StoredStemRecord | undefined> {
    return this.records.get(key);
  }

  async mostRecent(): Promise<StoredStemRecord | undefined> {
    return [...this.records.values()].sort(
      (left, right) => right.lastUsed - left.lastUsed,
    )[0];
  }

  async touch(key: string, lastUsed: number): Promise<void> {
    const record = this.records.get(key);
    if (record) this.records.set(key, { ...record, lastUsed });
  }

  async delete(key: string): Promise<void> {
    this.records.delete(key);
  }

  async prune(budgetBytes: number): Promise<void> {
    const all = [...this.records.values()].sort(
      (left, right) => left.lastUsed - right.lastUsed,
    );
    let total = all.reduce((sum, record) => sum + record.bytes, 0);
    for (const record of all) {
      if (total <= budgetBytes) break;
      this.records.delete(record.key);
      total -= record.bytes;
    }
  }
}

function makeBuffer(samples: number[], sampleRate = 44100): AudioBuffer {
  const buffer = new AudioBuffer({
    length: samples.length,
    sampleRate,
    numberOfChannels: 1,
  });
  buffer.getChannelData(0).set(samples);
  return buffer;
}

function makeStems() {
  return {
    vocals: makeBuffer([0, 0.4, -0.4]),
    drums: makeBuffer([0.1, 0.1, 0.1]),
    bass: makeBuffer([-0.2, 0, 0.2]),
    instrumental: makeBuffer([0.3, 0.3, 0.3]),
    other: makeBuffer([0, 0, 0]),
  };
}

describe("StemCacheService persistence", () => {
  let store: MemoryStore;

  const service = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        StemCacheService,
        { provide: StemCacheStore, useValue: store },
      ],
    });
    return TestBed.inject(StemCacheService);
  };

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("reloads a saved split in a fresh service instance", async () => {
    const first = service();
    await first.remember(
      "key",
      "song.wav",
      makeBuffer([0, 0.25, -0.25]),
      makeStems(),
    );
    expect(store.records.size).toBe(1);

    const second = service();
    expect(second.size).toBe(0);
    const restored = await second.loadMostRecent();

    expect(restored?.fileName).toBe("song.wav");
    expect(restored?.stems.vocals.length).toBe(3);
    expect(restored?.stems.vocals.getChannelData(0)[1]).toBeCloseTo(0.4, 3);
    expect(restored?.source.getChannelData(0)[2]).toBeCloseTo(-0.25, 3);
    expect(second.mostRecent).toBe(restored);
  });

  it("loads by file key and ignores an unknown key", async () => {
    await service().remember(
      "song-key",
      "song.wav",
      makeBuffer([0, 0.5]),
      makeStems(),
    );

    const fresh = service();
    expect(await fresh.load("missing")).toBeNull();
    expect((await fresh.load("song-key"))?.fileName).toBe("song.wav");
  });

  it("keeps the in-memory cache under its own budget", async () => {
    const cache = service();
    (cache as any).budgetBytes = 1;

    await cache.remember("a", "a.wav", makeBuffer([0]), makeStems());
    await cache.remember("b", "b.wav", makeBuffer([0]), makeStems());

    expect(cache.size).toBe(1);
    expect(cache.mostRecent?.fileName).toBe("b.wav");
  });

  it("drops a corrupt saved record instead of returning it", async () => {
    const junk = () => new Uint8Array([1, 2, 3]).buffer as ArrayBuffer;
    store.records.set("broken", {
      key: "broken",
      fileName: "broken.wav",
      bytes: 1,
      sampleRate: 44100,
      lastUsed: 1,
      source: junk(),
      stems: {
        vocals: junk(),
        drums: junk(),
        bass: junk(),
        instrumental: junk(),
        other: junk(),
      },
    });

    const cache = service();

    expect(await cache.load("broken")).toBeNull();
    expect(store.records.has("broken")).toBe(false);
  });
});
