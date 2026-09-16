import { Injectable } from '@angular/core';

export interface CacheMetadata {
  key: string;
  size: number;
  createdAt: number;
  lastAccessedAt: number;
  expiresAt?: number;
}

/**
 * Why persistence is, or is not, usable.
 *
 * `blocked` is the one that must never be folded into the others. The browser is
 * perfectly capable of storing data — another open tab is holding the old schema
 * version and has to be closed first. Telling that operator their browser
 * "cannot store projects" sends them somewhere no fix exists.
 */
export type PersistenceState = 'ready' | 'unsupported' | 'blocked' | 'failed';

@Injectable({
  providedIn: 'root',
})
export class LocalStorageService {
  private dbName = 'SMUVE_OFFLINE_DB';
  private dbVersion = 7;
  private db: IDBDatabase | null = null;
  /** Why persistence is unavailable, when it is. Null while everything works. */
  private unavailableReason: Exclude<PersistenceState, 'ready'> | null = null;
  private dbReady: Promise<void>;
  private resolveDbReady!: () => void;

  private readonly MAX_CACHE_SIZE_MB = 100;
  private readonly CACHE_CLEANUP_THRESHOLD = 0.9;

  constructor() {
    this.dbReady = new Promise((resolve) => {
      this.resolveDbReady = resolve;
    });
    this.initDB();
  }

  private initDB() {
    if (typeof window === 'undefined' || !(window as any).indexedDB) {
      this.unavailableReason = 'unsupported';
      this.resolveDbReady();
      return;
    }

    const request = indexedDB.open(this.dbName, this.dbVersion);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }
      // CinemaEngine edits live in their own store on purpose. `projects` is read
      // back whole by ProjectService as `Project[]` (bpm, key, mixer tracks), so
      // a video timeline parked there would appear in the Studio project list as
      // a malformed audio project. Added in v6 — earlier DBs get it on upgrade.
      if (!db.objectStoreNames.contains('cinema_projects')) {
        db.createObjectStore('cinema_projects', { keyPath: 'id' });
      }
      // Stored footage, kept apart from the project record on purpose: listing
      // projects must not drag every take in the library into memory. Added in
      // v7 — earlier DBs get it on upgrade.
      if (!db.objectStoreNames.contains('cinema_media')) {
        db.createObjectStore('cinema_media', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('audio_blobs')) {
        db.createObjectStore('audio_blobs', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('performance_takes')) {
        // PerformanceRecordingService persists takes here (audio blobs are
        // structured-cloneable). Added in v5 — earlier DBs get it on upgrade.
        db.createObjectStore('performance_takes', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('audio_cache')) {
        db.createObjectStore('audio_cache', { keyPath: 'url' });
      }
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('sync_dead_letter')) {
        db.createObjectStore('sync_dead_letter', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('cache_metadata')) {
        const metaStore = db.createObjectStore('cache_metadata', {
          keyPath: 'key',
        });
        metaStore.createIndex('expiresAt', 'expiresAt', { unique: false });
        metaStore.createIndex('lastAccessedAt', 'lastAccessedAt', {
          unique: false,
        });
      }
      if (!db.objectStoreNames.contains('offline_assets')) {
        db.createObjectStore('offline_assets', { keyPath: 'url' });
      }
      if (!db.objectStoreNames.contains('offline_local_cache')) {
        db.createObjectStore('offline_local_cache', { keyPath: 'id' });
      }
    };

    /**
     * Another tab is holding this database open at an older version, so the
     * upgrade cannot start. Without this handler the request never settles:
     * `dbReady` never resolves, every caller awaiting it hangs, and a project
     * save sits on its in-flight flag forever showing neither success nor
     * failure.
     */
    request.onblocked = () => {
      this.unavailableReason = 'blocked';
      console.error(
        'IndexedDB upgrade blocked by another open tab. Close the other tabs of this app and reload.'
      );
      this.resolveDbReady();
    };

    request.onsuccess = (event: any) => {
      const db: IDBDatabase = event.target.result;
      this.db = db;
      this.unavailableReason = null;
      // Yield to a newer version instead of blocking it. A tab that keeps its
      // connection open is what makes the *next* upgrade hang for whoever
      // triggers it, so closing here is what stops the block propagating.
      db.onversionchange = () => {
        db.close();
        if (this.db === db) this.db = null;
        this.unavailableReason = 'blocked';
      };
      this.resolveDbReady();
      void this.runCacheCleanup();
    };

    request.onerror = (event: any) => {
      this.unavailableReason = 'failed';
      console.error('IndexedDB error:', event.target.error);
      this.resolveDbReady();
    };
  }

  private async ensureReady(): Promise<boolean> {
    return (await this.persistenceStatus()) === 'ready';
  }

  /**
   * Whether persistence works, and if not, why.
   *
   * Every read and write below silently becomes a no-op when IndexedDB is
   * missing, blocked by another tab, or failed to open, so a caller that wants
   * to tell the operator the truth (a save that did not happen, a project list
   * that is empty because it could not be read) has to ask first rather than
   * infer it from a resolved promise — and has to be able to say *which* of
   * those happened, because the remedy differs.
   */
  async persistenceStatus(): Promise<PersistenceState> {
    await this.dbReady;
    if (this.db !== null) return 'ready';
    return this.unavailableReason ?? 'failed';
  }

  async saveItem(
    storeName: string,
    item: any,
    expiresInMs?: number
  ): Promise<void> {
    const ready = await this.ensureReady();
    if (!ready || !this.db) return;

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(item);

        request.onsuccess = () => {
          // Track cache metadata for expiration
          if (expiresInMs) {
            void this.updateCacheMetadata(storeName, item, expiresInMs);
          }
          resolve();
        };
        request.onerror = (event: any) => reject(event.target.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async getItem(storeName: string, id: string): Promise<any> {
    const ready = await this.ensureReady();
    if (!ready || !this.db) return null;

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(id);

        request.onsuccess = (event: any) => {
          const result = event.target.result;
          if (result) {
            void this.touchCacheMetadata(storeName, id);
          }
          resolve(result);
        };
        request.onerror = (event: any) => reject(event.target.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Just the keys of a store, without reading a single record.
   *
   * Pruning stored footage needs to know which entries belong to a project and
   * which of those are still referenced — reading the records back to find out
   * would pull every stored take into memory to answer a question about names.
   */
  async getAllKeys(storeName: string): Promise<IDBValidKey[]> {
    const ready = await this.ensureReady();
    if (!ready || !this.db) return [];

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAllKeys();

        request.onsuccess = (event: any) => resolve(event.target.result ?? []);
        request.onerror = (event: any) => reject(event.target.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async getAllItems(storeName: string): Promise<any[]> {
    const ready = await this.ensureReady();
    if (!ready || !this.db) return [];

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = (event: any) => resolve(event.target.result);
        request.onerror = (event: any) => reject(event.target.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async deleteItem(storeName: string, id: string): Promise<void> {
    const ready = await this.ensureReady();
    if (!ready || !this.db) return;

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(id);

        request.onsuccess = () => {
          void this.deleteCacheMetadata(`${storeName}:${id}`);
          resolve();
        };
        request.onerror = (event: any) => reject(event.target.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  private async updateCacheMetadata(
    storeName: string,
    item: any,
    expiresInMs: number
  ): Promise<void> {
    if (!this.db) return;

    const key = `${storeName}:${item.id || item.url || 'unknown'}`;
    const size = JSON.stringify(item).length;
    const now = Date.now();

    const metadata: CacheMetadata = {
      key,
      size,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt: now + expiresInMs,
    };

    try {
      const transaction = this.db.transaction(['cache_metadata'], 'readwrite');
      const store = transaction.objectStore('cache_metadata');
      store.put(metadata);
    } catch {
      // Silent fail for metadata
    }
  }

  private async touchCacheMetadata(
    storeName: string,
    id: string
  ): Promise<void> {
    if (!this.db) return;

    const key = `${storeName}:${id}`;

    try {
      const transaction = this.db.transaction(['cache_metadata'], 'readwrite');
      const store = transaction.objectStore('cache_metadata');
      const getRequest = store.get(key);

      getRequest.onsuccess = () => {
        const metadata = getRequest.result as CacheMetadata;
        if (metadata) {
          metadata.lastAccessedAt = Date.now();
          store.put(metadata);
        }
      };
    } catch {
      // Silent fail for metadata
    }
  }

  private async deleteCacheMetadata(key: string): Promise<void> {
    if (!this.db) return;

    try {
      const transaction = this.db.transaction(['cache_metadata'], 'readwrite');
      const store = transaction.objectStore('cache_metadata');
      store.delete(key);
    } catch {
      // Silent fail for metadata
    }
  }

  private async runCacheCleanup(): Promise<void> {
    if (!this.db) return;

    try {
      // Clean expired items
      const transaction = this.db.transaction(['cache_metadata'], 'readonly');
      const store = transaction.objectStore('cache_metadata');
      const now = Date.now();

      const request = store.getAll();
      request.onsuccess = async () => {
        const items = request.result as CacheMetadata[];
        const expiredKeys = items
          .filter((m) => m.expiresAt && m.expiresAt < now)
          .map((m) => m.key);

        for (const key of expiredKeys) {
          const [storeName, id] = key.split(':');
          if (storeName && id) {
            await this.deleteItem(storeName, id);
          }
        }
      };
    } catch {
      // Silent fail for cleanup
    }
  }

  /**
   * Gets storage usage statistics.
   */
  async getStorageStats(): Promise<{
    usedBytes: number;
    totalBytes: number;
    percentUsed: number;
  }> {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
      return { usedBytes: 0, totalBytes: 0, percentUsed: 0 };
    }

    try {
      const estimate = await navigator.storage.estimate();
      const usedBytes = estimate.usage || 0;
      const totalBytes = estimate.quota || 0;
      const percentUsed = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

      return { usedBytes, totalBytes, percentUsed };
    } catch {
      return { usedBytes: 0, totalBytes: 0, percentUsed: 0 };
    }
  }

  /**
   * Clears all cached data (use with caution).
   */
  async clearAllCache(): Promise<void> {
    if (!this.db) return;

    const storeNames = [
      'audio_cache',
      'offline_assets',
      'offline_local_cache',
      'cache_metadata',
    ];

    for (const storeName of storeNames) {
      try {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        store.clear();
      } catch {
        // Silent fail for individual stores
      }
    }
  }

  async saveAdvancedProductionState(
    projectId: string,
    state: {
      automation?: unknown;
      macros?: unknown;
      routing?: unknown;
      patternVariants?: unknown;
    }
  ): Promise<void> {
    await this.saveItem('projects', {
      id: `advanced-production:${projectId}`,
      ...state,
      updatedAt: Date.now(),
    });
  }

  async getAdvancedProductionState(projectId: string): Promise<{
    automation?: unknown;
    macros?: unknown;
    routing?: unknown;
    patternVariants?: unknown;
    updatedAt?: number;
  } | null> {
    return this.getItem('projects', `advanced-production:${projectId}`);
  }
}
