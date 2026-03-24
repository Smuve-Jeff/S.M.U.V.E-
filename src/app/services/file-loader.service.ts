import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LocalStorageService } from './local-storage.service';

@Injectable({
  providedIn: 'root',
})
export class FileLoaderService {
  private http = inject(HttpClient);
  private localStorage = inject(LocalStorageService);
  private audioContext = new (
    window.AudioContext || (window as any).webkitAudioContext
  )();

  async loadAudio(url: string): Promise<AudioBuffer> {
    const cached = await this.localStorage.getItem('audio_cache', url);
    if (cached && cached.data) {
      return await this.audioContext.decodeAudioData(cached.data.slice(0));
    }
    const arrayBuffer = await firstValueFrom(
      this.http.get(url, { responseType: 'arraybuffer' })
    );
    await this.localStorage.saveItem('audio_cache', {
      url,
      data: arrayBuffer.slice(0),
      timestamp: Date.now(),
    });
    return await this.audioContext.decodeAudioData(arrayBuffer);
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

  async decodeToAudioBuffer(context: any, file: File): Promise<AudioBuffer> {
    const buffer = await file.arrayBuffer();
    return await this.audioContext.decodeAudioData(buffer);
  }

  async loadExternalTrack(): Promise<void> {
    console.log('FileLoader: Initializing track ingestion protocol.');
  }
}
