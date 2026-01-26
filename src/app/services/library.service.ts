import { Injectable, signal, inject } from '@angular/core';
import { AiService } from './ai.service';

export interface LibraryItem {
  id: string;
  name: string;
  url?: string; // remote
  size?: number;
  addedAt: number;
  // offline
  blob?: Blob;
}

@Injectable({ providedIn: 'root' })
export class LibraryService {
  private aiService = inject(AiService);
  items = signal<LibraryItem[]>([]);

  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('dj-library', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('tracks')) {
          db.createObjectStore('tracks');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  async putOffline(id: string, blob: Blob) {
    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('tracks', 'readwrite');
      tx.objectStore('tracks').put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Auto-trigger AI Study
    try {
      const buffer = await blob.arrayBuffer();
      const audioContext = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();
      const audioBuffer = await audioContext.decodeAudioData(buffer);
      const item = this.items().find((i) => i.id === id);
      if (item) {
        this.aiService.studyTrack(audioBuffer, item.name);
      }
    } catch (error) {
      console.warn('LibraryService: Failed to trigger AI study', error);
    }
  }

  async getOffline(id: string): Promise<Blob | undefined> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tracks', 'readonly');
      const req = tx.objectStore('tracks').get(id);
      req.onsuccess = () => resolve(req.result || undefined);
      req.onerror = () => reject(req.error);
    });
  }

  addOrUpdate(item: LibraryItem) {
    const arr = this.items();
    const idx = arr.findIndex((i) => i.id === item.id);
    if (idx >= 0) arr[idx] = { ...arr[idx], ...item };
    else arr.push(item);
    this.items.set([...arr]);
  }

  remove(id: string) {
    const arr = this.items().filter((i) => i.id !== id);
    this.items.set(arr);
    this.getDB().then((db) => {
      const tx = db.transaction('tracks', 'readwrite');
      tx.objectStore('tracks').delete(id);
    });
  }
}
