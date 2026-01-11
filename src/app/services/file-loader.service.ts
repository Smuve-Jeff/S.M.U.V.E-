import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FileLoaderService {
  constructor() {}

  async pickLocalFiles(accept = '.mp3,.wav'): Promise<File[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = accept;
      input.onchange = () => {
        const files = input.files ? Array.from(input.files) : [];
        resolve(files);
      };
      input.click();
    });
  }

  async decodeToAudioBuffer(
    ctx: AudioContext,
    fileOrArrayBuffer: File | ArrayBuffer
  ): Promise<AudioBuffer> {
    let arrayBuffer: ArrayBuffer;
    if (fileOrArrayBuffer instanceof File) {
      arrayBuffer = await fileOrArrayBuffer.arrayBuffer();
    } else {
      arrayBuffer = fileOrArrayBuffer;
    }
    return await ctx.decodeAudioData(arrayBuffer.slice(0));
  }

  async fetchArrayBuffer(
    url: string,
    signal?: AbortSignal
  ): Promise<ArrayBuffer> {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return await res.arrayBuffer();
  }
}
