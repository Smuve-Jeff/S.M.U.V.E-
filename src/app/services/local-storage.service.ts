import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LocalStorageService {
  private dbName = 'SMUVE_OFFLINE_DB';
  private dbVersion = 2;
  private db: IDBDatabase | null = null;

  constructor() {
    this.initDB();
  }

  private initDB() {
    if (typeof window === 'undefined') return;

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
    };

    request.onsuccess = (event: any) => {
      this.db = event.target.result;
    };

    request.onerror = (event: any) => {
      console.error('IndexedDB error:', event.target.error);
    };
  }

  async saveItem(storeName: string, item: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        setTimeout(() => {
          this.saveItem(storeName, item).then(resolve).catch(reject);
        }, 100);
        return;
      }
      try {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(item);
        request.onsuccess = () => resolve();
        request.onerror = (event: any) => reject(event.target.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async getItem(storeName: string, id: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        setTimeout(() => {
          this.getItem(storeName, id).then(resolve).catch(reject);
        }, 100);
        return;
      }
      try {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(id);
        request.onsuccess = (event: any) => resolve(event.target.result);
        request.onerror = (event: any) => reject(event.target.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async getAllItems(storeName: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        setTimeout(() => {
          this.getAllItems(storeName).then(resolve).catch(reject);
        }, 100);
        return;
      }
      try {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = (event: any) => resolve(event.target.result);
        request.onerror = (event: any) => reject(event.target.error);
      } catch (e) {
        reject(e);
      }
    });
  }
}
