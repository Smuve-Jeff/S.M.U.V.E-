import { Injectable, inject } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';

@Injectable({ providedIn: 'root' })
export class ExportService {
  private engine = inject(AudioEngineService);

  constructor() {}

  // Live recording using MediaRecorder on the master stream
  startLiveRecording(mimeType: string = 'audio/webm;codecs=opus') {
    this.engine.resume();
    const dest = this.engine.getMasterStream();

    // Check supported types
    const types = [
      'audio/webm;codecs=opus',
      'audio/ogg;codecs=opus',
      'audio/webm',
      'audio/wav'
    ];
    const supportedType = types.find(t => MediaRecorder.isTypeSupported(t)) || '';

    const recorder = new MediaRecorder(dest.stream, {
      mimeType: supportedType,
      audioBitsPerSecond: 256000 // High quality
    });

    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const promise = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: supportedType }));
      };
    });

    recorder.start();
    return { recorder, result: promise };
  }

  async downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Offline render to WAV using OfflineAudioContext.
   */
  async renderOfflineToWav(durationSec: number): Promise<Blob> {
    const originalCtx = this.engine.getContext();
    const sampleRate = originalCtx.sampleRate;
    const offlineCtx = new OfflineAudioContext(
      2,
      Math.ceil(durationSec * sampleRate),
      sampleRate
    );

    // Implementation would involve recreating the audio graph on offlineCtx.
    // For now, return a placeholder or simulate.
    const rendered = await offlineCtx.startRendering();
    const wav = this.audioBufferToWav(rendered);
    return new Blob([wav], { type: 'audio/wav' });
  }

  public audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
    const numOfChan = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length * numOfChan * 4 + 44; // 32-bit float
    const bufferOut = new ArrayBuffer(length);
    const view = new DataView(bufferOut);

    function writeString(view: DataView, offset: number, str: string) {
      for (let i = 0; i < str.length; i++)
        view.setUint8(offset + i, str.charCodeAt(i));
    }

    let offset = 0;
    writeString(view, offset, 'RIFF');
    offset += 4;
    view.setUint32(offset, 36 + buffer.length * numOfChan * 4, true);
    offset += 4;
    writeString(view, offset, 'WAVE');
    offset += 4;
    writeString(view, offset, 'fmt ');
    offset += 4;
    view.setUint32(offset, 16, true);
    offset += 4;
    view.setUint16(offset, 3, true); // IEEE Float
    offset += 2;
    view.setUint16(offset, numOfChan, true);
    offset += 2;
    view.setUint32(offset, sampleRate, true);
    offset += 4;
    view.setUint32(offset, sampleRate * numOfChan * 4, true);
    offset += 4;
    view.setUint16(offset, numOfChan * 4, true);
    offset += 2;
    view.setUint16(offset, 32, true); // 32-bit
    offset += 2;
    writeString(view, offset, 'data');
    offset += 4;
    view.setUint32(offset, buffer.length * numOfChan * 4, true);
    offset += 4;

    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numOfChan; channel++) {
        let sample = buffer.getChannelData(channel)[i];
        view.setFloat32(offset, sample, true);
        offset += 4;
      }
    }

    return bufferOut;
  }
}
