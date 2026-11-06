import { Injectable, inject } from "@angular/core";
import type { Stems } from "../services/stem-separation.service";
import { decodeWav, encodeWav } from "./stem-cache.wav";

const STEM_KEYS = ["vocals", "drums", "bass", "instrumental", "other"] as const;
type StemKey = (typeof STEM_KEYS)[number];

const DB_NAME = "smuve-stem-cache";
const DB_VERSION = 2;
const META_STORE = "meta";
const AUDIO_STORE = "audio";
const LEGACY_STORE = "stems";

/** One file's separated stems, kept so re-opening the splitter is instant. */
export interface StemCacheEntry {
  key: string;
  fileName: string;
  source: AudioBuffer;
  stems: Stems;
  bytes: number;
}

/**
 * What actually goes to IndexedDB: 16-bit WAV buffers, not live AudioBuffers.
 * Metadata lives in its own store so pruning never has to load the audio.
 */
/** Metadata the splitter needs to list saved splits without loading audio. */
export interface StemCacheSummary {
  key: string;
  fileName: string;
  bytes: number;
  lastUsed: number;
}

export interface StoredStemRecord {
  key: string;
  fileName: string;
  bytes: number;
  sampleRate: number;
  lastUsed: number;
  source: ArrayBuffer;
  stems: Record<StemKey, ArrayBuffer>;
}

interface StoredStemMeta {
  key: string;
  fileName: string;
  bytes: number;
  sampleRate: number;
  lastUsed: number;
}

interface StoredStemAudio {
  key: string;
  source: ArrayBuffer;
  stems: Record<StemKey, ArrayBuffer>;
}

export abstract class StemCacheStore {
  abstract put(record: StoredStemRecord): Promise<void>;
  abstract get(key: string): Promise<StoredStemRecord | undefined>;
  abstract mostRecent(): Promise<StoredStemRecord | undefined>;
  abstract touch(key: string, lastUsed: number): Promise<void>;
  abstract delete(key: string): Promise<void>;
  abstract list(): Promise<StemCacheSummary[]>;
  abstract clear(): Promise<void>;
  abstract prune(budgetBytes: number): Promise<void>;
}

@Injectable()
export class IndexedDbStemCacheStore extends StemCacheStore {
  private database: Promise<IDBDatabase | null> | null = null;

  async put(record: StoredStemRecord): Promise<void> {
    const db = await this.open();
    if (!db) return;
    const {
      key,
      fileName,
      bytes,
      sampleRate,
      lastUsed,
      source,
      stems,
    } = record;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([META_STORE, AUDIO_STORE], "readwrite");
      transaction.objectStore(AUDIO_STORE).put({ key, source, stems });
      transaction
        .objectStore(META_STORE)
        .put({ key, fileName, bytes, sampleRate, lastUsed });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async get(key: string): Promise<StoredStemRecord | undefined> {
    const db = await this.open();
    if (!db) return undefined;
    const meta = (await this.request(db, META_STORE, "readonly", (store) =>
      store.get(key),
    )) as StoredStemMeta | undefined;
    if (!meta) return undefined;
    const audio = (await this.request(db, AUDIO_STORE, "readonly", (store) =>
      store.get(key),
    )) as StoredStemAudio | undefined;
    return audio ? { ...meta, ...audio } : undefined;
  }

  async mostRecent(): Promise<StoredStemRecord | undefined> {
    const db = await this.open();
    if (!db) return undefined;
    return new Promise((resolve) => {
      const transaction = db.transaction([META_STORE, AUDIO_STORE], "readonly");
      const cursor = transaction
        .objectStore(META_STORE)
        .index("lastUsed")
        .openCursor(null, "prev");
      cursor.onsuccess = () => {
        const meta = cursor.result?.value as StoredStemMeta | undefined;
        if (!meta) {
          resolve(undefined);
          return;
        }
        const audio = transaction.objectStore(AUDIO_STORE).get(meta.key);
        audio.onsuccess = () => {
          const stored = audio.result as StoredStemAudio | undefined;
          resolve(stored ? { ...meta, ...stored } : undefined);
        };
        audio.onerror = () => resolve(undefined);
      };
      cursor.onerror = () => resolve(undefined);
    });
  }

  async touch(key: string, lastUsed: number): Promise<void> {
    const db = await this.open();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const transaction = db.transaction(META_STORE, "readwrite");
      const store = transaction.objectStore(META_STORE);
      const request = store.get(key);
      request.onsuccess = () => {
        const meta = request.result as StoredStemMeta | undefined;
        if (meta) store.put({ ...meta, lastUsed });
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    });
  }

  async delete(key: string): Promise<void> {
    const db = await this.open();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const transaction = db.transaction([META_STORE, AUDIO_STORE], "readwrite");
      transaction.objectStore(META_STORE).delete(key);
      transaction.objectStore(AUDIO_STORE).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    });
  }

  async prune(budgetBytes: number): Promise<void> {
    const db = await this.open();
    if (!db) return;
    const metas = (await this.request(db, META_STORE, "readonly", (store) =>
      store.getAll(),
    )) as StoredStemMeta[];
    metas.sort((left, right) => left.lastUsed - right.lastUsed);
    let total = metas.reduce((sum, meta) => sum + meta.bytes, 0);
    if (total <= budgetBytes) return;

    const doomed: string[] = [];
    for (const meta of metas) {
      if (total <= budgetBytes) break;
      doomed.push(meta.key);
      total -= meta.bytes;
    }
    if (!doomed.length) return;

    await new Promise<void>((resolve) => {
      const transaction = db.transaction([META_STORE, AUDIO_STORE], "readwrite");
      for (const key of doomed) {
        transaction.objectStore(META_STORE).delete(key);
        transaction.objectStore(AUDIO_STORE).delete(key);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    });
  }

  async list(): Promise<StemCacheSummary[]> {
    const db = await this.open();
    if (!db) return [];
    const metas = (await this.request(db, META_STORE, "readonly", (store) =>
      store.getAll(),
    )) as StoredStemMeta[];
    return metas
      .sort((left, right) => right.lastUsed - left.lastUsed)
      .map(({ key, fileName, bytes, lastUsed }) => ({
        key,
        fileName,
        bytes,
        lastUsed,
      }));
  }

  async clear(): Promise<void> {
    const db = await this.open();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const transaction = db.transaction([META_STORE, AUDIO_STORE], "readwrite");
      transaction.objectStore(META_STORE).clear();
      transaction.objectStore(AUDIO_STORE).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    });
  }

  private open(): Promise<IDBDatabase | null> {
    if (this.database) return this.database;
    this.database = new Promise((resolve) => {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch {
        resolve(null);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (db.objectStoreNames.contains(LEGACY_STORE)) {
          db.deleteObjectStore(LEGACY_STORE);
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: "key" }).createIndex(
            "lastUsed",
            "lastUsed",
          );
        }
        if (!db.objectStoreNames.contains(AUDIO_STORE)) {
          db.createObjectStore(AUDIO_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
    return this.database;
  }

  private request(
    db: IDBDatabase,
    storeName: string,
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = run(transaction.objectStore(storeName));
      let result: unknown;
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
}

/**
 * Holds separated stems for the lifetime of the Studio rather than a single
 * surface, so switching between arrangement, mixer and the rest does not throw
 * away seconds of DSP, and persists them to IndexedDB so a reload does not
 * either. Closing the Studio releases the in-memory copy; the saved copy stays
 * until the disk budget evicts it.
 *
 * Stems cost about 85 MB per stereo stem-minute as Float32, so only the newest
 * results live in memory, under a byte budget. The on-disk copy is 16-bit WAV,
 * roughly half that, with its own larger budget.
 */
@Injectable()
export class StemCacheService {
  private readonly store = inject(StemCacheStore);
  private readonly entries: StemCacheEntry[] = [];
  private budgetBytes = 600 * 1024 * 1024;
  readonly storageBudgetBytes = 800 * 1024 * 1024;
  private clearTimer: ReturnType<typeof setTimeout> | null = null;

  get size(): number {
    return this.entries.length;
  }

  get mostRecent(): StemCacheEntry | null {
    return this.entries[0] ?? null;
  }

  /** Identity of the file itself, so an edited or different file misses. */
  keyFor(file: Pick<File, "type" | "name" | "size" | "lastModified">): string {
    return `${file.type}:${file.name}:${file.size}:${file.lastModified}`;
  }

  /** Oldest-first recency: a hit jumps to the front, so re-use is cheap. */
  take(key: string): StemCacheEntry | null {
    const index = this.entries.findIndex((entry) => entry.key === key);
    if (index < 0) return null;
    const [entry] = this.entries.splice(index, 1);
    this.entries.unshift(entry);
    void this.touch(key);
    return entry;
  }

  /** Memory copy is immediate; the saved copy is written in the background. */
  async remember(
    key: string,
    fileName: string,
    source: AudioBuffer,
    stems: Stems,
  ): Promise<void> {
    const entry: StemCacheEntry = {
      key,
      fileName,
      source,
      stems,
      bytes: this.entryBytes(source, stems),
    };
    this.putInMemory(entry);
    // Let the ready state paint before the WAV encoding occupies the thread.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await this.persist(entry);
  }

  async load(key: string): Promise<StemCacheEntry | null> {
    const cached = this.take(key);
    if (cached) return cached;
    const record = await this.readRecord(() => this.store.get(key));
    return record ? this.restore(record) : null;
  }

  async loadMostRecent(): Promise<StemCacheEntry | null> {
    if (this.entries[0]) return this.entries[0];
    const record = await this.readRecord(() => this.store.mostRecent());
    return record ? this.restore(record) : null;
  }

  async savedSplits(): Promise<StemCacheSummary[]> {
    try {
      return await this.store.list();
    } catch {
      return [];
    }
  }

  async forget(key: string): Promise<void> {
    this.forgetInMemory(key);
    try {
      await this.store.delete(key);
    } catch {
      // Best-effort: the record will go with the next successful prune.
    }
  }

  /**
   * Hide the saved splits now but keep the records until the window closes,
   * so an undo is a cancellation rather than a re-encode.
   */
  scheduleClearSaved(delayMs = 6000): void {
    this.cancelScheduledClearSaved();
    this.entries.length = 0;
    this.clearTimer = setTimeout(() => {
      this.clearTimer = null;
      void this.clearSaved();
    }, delayMs);
  }

  cancelScheduledClearSaved(): boolean {
    if (!this.clearTimer) return false;
    clearTimeout(this.clearTimer);
    this.clearTimer = null;
    return true;
  }

  async clearSaved(): Promise<void> {
    this.cancelScheduledClearSaved();
    this.entries.length = 0;
    try {
      await this.store.clear();
    } catch {
      // Best-effort: an unavailable database leaves nothing persisted anyway.
    }
  }

  private forgetInMemory(key: string): void {
    const index = this.entries.findIndex((entry) => entry.key === key);
    if (index >= 0) this.entries.splice(index, 1);
  }

  private putInMemory(entry: StemCacheEntry): void {
    const existing = this.entries.findIndex(
      (candidate) => candidate.key === entry.key,
    );
    if (existing >= 0) this.entries.splice(existing, 1);
    this.entries.unshift(entry);
    let total = this.entries.reduce((sum, candidate) => sum + candidate.bytes, 0);
    while (total > this.budgetBytes && this.entries.length > 1) {
      const evicted = this.entries.pop();
      if (!evicted) break;
      total -= evicted.bytes;
    }
  }

  private async persist(entry: StemCacheEntry): Promise<void> {
    try {
      const stems = {} as Record<StemKey, ArrayBuffer>;
      let bytes = 0;
      for (const key of STEM_KEYS) {
        const wav = encodeWav(entry.stems[key]);
        stems[key] = wav;
        bytes += wav.byteLength;
      }
      const source = encodeWav(entry.source);
      bytes += source.byteLength;
      await this.store.put({
        key: entry.key,
        fileName: entry.fileName,
        bytes,
        sampleRate: entry.source.sampleRate,
        lastUsed: Date.now(),
        source,
        stems,
      });
      await this.store.prune(this.storageBudgetBytes);
    } catch {
      // Best-effort: a full or unsupported database leaves the memory cache working.
    }
  }

  private async restore(
    record: StoredStemRecord,
  ): Promise<StemCacheEntry | null> {
    const cached = this.take(record.key);
    if (cached) return cached;
    try {
      const source = decodeWav(record.source);
      const stems = {} as Stems;
      for (const key of STEM_KEYS) {
        stems[key] = decodeWav(record.stems[key]);
      }
      const entry: StemCacheEntry = {
        key: record.key,
        fileName: record.fileName,
        source,
        stems,
        bytes: this.entryBytes(source, stems),
      };
      this.putInMemory(entry);
      return entry;
    } catch {
      // Corrupt or unsupported: drop it so it cannot block a future split.
      try {
        await this.store.delete(record.key);
      } catch {
        // Ignore — the next prune will try again.
      }
      return null;
    }
  }

  private async readRecord(
    run: () => Promise<StoredStemRecord | undefined>,
  ): Promise<StoredStemRecord | null> {
    try {
      return (await run()) ?? null;
    } catch {
      return null;
    }
  }

  private async touch(key: string): Promise<void> {
    try {
      await this.store.touch(key, Date.now());
    } catch {
      // Recency is best-effort.
    }
  }

  private entryBytes(source: AudioBuffer, stems: Stems): number {
    return (
      this.audioBufferBytes(source) +
      STEM_KEYS.reduce(
        (total, key) => total + this.audioBufferBytes(stems[key]),
        0,
      )
    );
  }

  private audioBufferBytes(buffer: AudioBuffer): number {
    return buffer.numberOfChannels * buffer.length * 4;
  }
}
