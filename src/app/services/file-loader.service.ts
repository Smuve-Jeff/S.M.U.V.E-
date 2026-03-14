import { LoggingService } from './logging.service';
import { Injectable , inject} from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FileLoaderService {
  private logger = inject(LoggingService);
  constructor() {}

  async pickLocalFiles(accept = '.mp3,.wav,.ogg,.webm'): Promise<File[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = accept;
      input.onchange = () => {
        const files = input.files ? Array.from(input.files) : [];
        resolve(files);
      };
      // For testing environments, we might want to handle the case where click() doesn't work
      try {
        input.click();
      } catch (err) {
        this.logger.warn('FileLoaderService: Failed to trigger file picker', err);
        resolve([]);
      }
    });
  }

  async decodeToAudioBuffer(
    ctx: AudioContext,
    fileOrArrayBuffer: File | ArrayBuffer
  ): Promise<AudioBuffer> {
    try {
      let arrayBuffer: ArrayBuffer;
      if (fileOrArrayBuffer instanceof File) {
        arrayBuffer = await fileOrArrayBuffer.arrayBuffer();
      } else {
        arrayBuffer = fileOrArrayBuffer;
      }

      // We slice the buffer because decodeAudioData detaches it
      return await ctx.decodeAudioData(arrayBuffer.slice(0));
    } catch (err) {
      this.logger.error('FileLoaderService: Error decoding audio data', err);
      throw new Error('Failed to decode audio file. Please ensure it is a valid audio format.');
    }
  }

  async fetchArrayBuffer(
    url: string,
    signal?: AbortSignal
  ): Promise<ArrayBuffer> {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
      return await res.arrayBuffer();
    } catch (err) {
      this.logger.error('FileLoaderService: Error fetching array buffer', err);
      throw err;
    }
  }
}
