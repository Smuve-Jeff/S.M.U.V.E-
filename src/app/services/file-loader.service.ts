import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LocalStorageService } from './local-storage.service';

export interface SampleLayer {
  url: string;
  minVelocity: number;
  maxVelocity: number;
}

export interface SampleZone {
  midiRange: [number, number];
  rootNote: number;
  layers: SampleLayer[];
}

export interface SampleMap {
  id: string;
  name: string;
  zones: SampleZone[];
}

@Injectable({
  providedIn: 'root',
})
export class FileLoaderService {
  private http = inject(HttpClient);
  private localStorage = inject(LocalStorageService);

  private audioContext: AudioContext | null = null;

  private static readonly BUFFER_CACHE_MAX = 64;
  private bufferCache: Map<string, AudioBuffer> = new Map();

  private cacheGet(url: string): AudioBuffer | undefined {
    const buf = this.bufferCache.get(url);
    if (buf !== undefined) {
      // Move to most-recently-used position
      this.bufferCache.delete(url);
      this.bufferCache.set(url, buf);
    }
    return buf;
  }

  private cacheSet(url: string, buffer: AudioBuffer): void {
    if (this.bufferCache.has(url)) {
      this.bufferCache.delete(url);
    } else if (this.bufferCache.size >= FileLoaderService.BUFFER_CACHE_MAX) {
      // Evict the least-recently-used entry (first key in insertion order)
      const lruKey = this.bufferCache.keys().next().value;
      if (lruKey !== undefined) {
        this.bufferCache.delete(lruKey);
      }
    }
    this.bufferCache.set(url, buffer);
  }

  private ensureContext(context?: BaseAudioContext | null): BaseAudioContext {
    if (context) return context;
    if (this.audioContext) return this.audioContext;
    if (typeof window === 'undefined') {
      throw new Error('AudioContext unavailable in this environment');
    }
    const Ctor =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) {
      throw new Error('AudioContext constructor not found');
    }
    const audioContext = new Ctor() as AudioContext;
    this.audioContext = audioContext;
    return audioContext;
  }

  async loadAudio(
    url: string,
    context?: BaseAudioContext | null
  ): Promise<AudioBuffer> {
    const ctx = this.ensureContext(context);

    // Memory Cache check
    const cached_mem = this.cacheGet(url);
    if (cached_mem !== undefined) {
      return cached_mem;
    }

    // Disk Cache check
    const cached = await this.localStorage.getItem('audio_cache', url);
    if (cached && cached.data) {
      const buffer = await ctx.decodeAudioData(cached.data.slice(0));
      this.cacheSet(url, buffer);
      return buffer;
    }

    // Network fetch
    const arrayBuffer = await firstValueFrom(
      this.http.get(url, { responseType: 'arraybuffer' })
    );

    // Save to Disk Cache
    void this.localStorage.saveItem('audio_cache', {
      url,
      data: arrayBuffer.slice(0),
      timestamp: Date.now(),
    });

    const buffer = await ctx.decodeAudioData(arrayBuffer);
    this.cacheSet(url, buffer);
    return buffer;
  }

  async loadSampleMap(map: SampleMap, context?: BaseAudioContext | null): Promise<void> {
    const urls = new Set<string>();
    map.zones.forEach(zone => {
      zone.layers.forEach(layer => urls.add(layer.url));
    });

    const promises = Array.from(urls).map(url => this.loadAudio(url, context));
    await Promise.all(promises);
  }

  getBuffer(url: string): AudioBuffer | undefined {
    return this.cacheGet(url);
  }

  async pickLocalFiles(accept: string): Promise<File[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.multiple = true;
      input.onchange = () => resolve(Array.from(input.files || []));
      input.click();
    });
  }

  async decodeToAudioBuffer(
    context: BaseAudioContext | null,
    source: File | Blob | ArrayBuffer
  ): Promise<AudioBuffer> {
    const ctx = this.ensureContext(context);
    const arrayBuffer =
      source instanceof ArrayBuffer
        ? source
        : 'arrayBuffer' in source
          ? await (source as File | Blob).arrayBuffer()
          : null;

    if (!arrayBuffer) {
      throw new Error('Unsupported audio source');
    }

    try {
      return await ctx.decodeAudioData(arrayBuffer.slice(0));
    } catch (_error) {
      throw new Error('Failed to decode audio file');
    }
  }

  async loadExternalTrack(): Promise<void> {
    console.log('FileLoader: Initializing track ingestion protocol.');
  }
}
