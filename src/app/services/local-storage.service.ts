import { Injectable } from '@angular/core';

export interface CacheMetadata {
  key: string;
  size: number;
  createdAt: number;
  lastAccessedAt: number;
  expiresAt?: number;
}

@Injectable({
  providedIn: 'root',
})
export class LocalStorageService {
  private dbName = 'SMUVE_OFFLINE_DB';
  private dbVersion = 3;
  private db: IDBDatabase | null = null;
  private dbUnsupported = false;
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
      this.dbUnsupported = true;
      this.resolveDbReady();
      return;
    }

    const request = indexedDB.open(this.dbName, this.dbVersion);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('audio_blobs')) {
        db.createObjectStore('audio_blobs', { keyPath: 'id' });
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
        const metaStore = db.createObjectStore('cache_metadata', { keyPath: 'key' });
        metaStore.createIndex('expiresAt', 'expiresAt', { unique: false });
        metaStore.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('offline_assets')) {
        db.createObjectStore('offline_assets', { keyPath: 'url' });
      }
    };

    request.onsuccess = (event: any) => {
      this.db = event.target.result;
      this.resolveDbReady();
      void this.runCacheCleanup();
    };

    request.onerror = (event: any) => {
      console.error('IndexedDB error:', event.target.error);
      this.resolveDbReady();
    };
  }

  private async ensureReady(): Promise<boolean> {
    await this.dbReady;
    return !this.dbUnsupported && this.db !== null;
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

  private async touchCacheMetadata(storeName: string, id: string): Promise<void> {
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

    const storeNames = ['audio_cache', 'offline_assets', 'cache_metadata'];

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
