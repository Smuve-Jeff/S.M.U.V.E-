import "fake-indexeddb/auto";
import {
  IndexedDbStemCacheStore,
  type StoredStemRecord,
} from "./stem-cache.service";

function bytes(value: number): ArrayBuffer {
  return new Uint8Array([value, value + 1, value + 2]).buffer as ArrayBuffer;
}

function record(
  key: string,
  lastUsed: number,
  size: number,
): StoredStemRecord {
  return {
    key,
    fileName: `${key}.wav`,
    bytes: size,
    sampleRate: 44100,
    lastUsed,
    source: bytes(1),
    stems: {
      vocals: bytes(1),
      drums: bytes(1),
      bass: bytes(1),
      instrumental: bytes(1),
      other: bytes(1),
    },
  };
}

describe("IndexedDbStemCacheStore", () => {
  let store: IndexedDbStemCacheStore;

  beforeEach(async () => {
    store = new IndexedDbStemCacheStore();
    await store.prune(0);
  });

  it("round-trips a record, including its audio buffers", async () => {
    await store.put(record("song", 100, 10));

    const stored = await store.get("song");

    expect(stored?.fileName).toBe("song.wav");
    expect(stored?.sampleRate).toBe(44100);
    expect(new Uint8Array(stored!.source)).toEqual(new Uint8Array([1, 2, 3]));
    expect(new Uint8Array(stored!.stems.vocals)).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("orders by last use and moves a touched record to the front", async () => {
    await store.put(record("older", 100, 10));
    await store.put(record("newer", 200, 10));
    expect((await store.mostRecent())?.key).toBe("newer");

    await store.touch("older", 300);

    expect((await store.mostRecent())?.key).toBe("older");
  });

  it("deletes the least recently used records to meet the byte budget", async () => {
    await store.put(record("old", 100, 100));
    await store.put(record("new", 200, 100));

    await store.prune(150);

    expect(await store.get("old")).toBeUndefined();
    expect(await store.get("new")).toBeDefined();
  });

  it("removes a record on delete", async () => {
    await store.put(record("gone", 100, 10));

    await store.delete("gone");

    expect(await store.get("gone")).toBeUndefined();
  });

  it("lists records newest first and clears both stores", async () => {
    await store.put(record("old", 100, 10));
    await store.put(record("new", 200, 10));

    expect((await store.list()).map((entry) => entry.key)).toEqual([
      "new",
      "old",
    ]);

    await store.clear();

    expect(await store.list()).toEqual([]);
    expect(await store.get("new")).toBeUndefined();
  });


});
