import { LoggingService } from './logging.service';
import { Injectable, inject } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';

@Injectable({ providedIn: 'root' })
export class ExportService {
  private logger = inject(LoggingService);
  private engine = inject(AudioEngineService);

  startLiveRecording() {
    this.engine.resume();
    const dest = this.engine.getMasterStream();
    const types = [
      'audio/webm;codecs=opus',
      'audio/ogg;codecs=opus',
      'audio/webm',
      'audio/wav',
    ];
    const supportedType =
      types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const recorderOptions = supportedType
      ? {
          mimeType: supportedType,
          audioBitsPerSecond: 256000,
        }
      : { audioBitsPerSecond: 256000 };
    const recorder = new MediaRecorder(dest.stream, recorderOptions);
    const outputType = supportedType || recorder.mimeType || 'audio/webm';
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const promise = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: outputType }));
    });
    recorder.start();
    return { recorder, result: promise };
  }

  async startVideoExport(canvas: HTMLCanvasElement) {
    this.logger.system('INITIALIZING INTEGRATED VIDEO EXPORT UPLINK...');
    this.engine.resume();
    const audioStream = this.engine.getMasterStream().stream;
    const canvasStream = (canvas as any).captureStream(60);
    audioStream
      .getAudioTracks()
      .forEach((track) => canvasStream.addTrack(track));
    const recorder = new MediaRecorder(canvasStream, {
      mimeType: 'video/webm',
      videoBitsPerSecond: 8000000,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const promise = new Promise<Blob>((resolve) => {
      recorder.onstop = () =>
        resolve(new Blob(chunks, { type: recorder.mimeType }));
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

  public audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
    const numOfChan = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bytesPerSample = 2; // 16-bit PCM
    const length = buffer.length * numOfChan * bytesPerSample + 44;
    const bufferOut = new ArrayBuffer(length);
    const view = new DataView(bufferOut);
    const writeString = (v: DataView, o: number, s: string) => {
      for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
    };
    let offset = 0;
    writeString(view, offset, 'RIFF');
    offset += 4;
    view.setUint32(offset, length - 8, true);
    offset += 4;
    writeString(view, offset, 'WAVE');
    offset += 4;
    writeString(view, offset, 'fmt ');
    offset += 4;
    view.setUint32(offset, 16, true);
    offset += 4;
    view.setUint16(offset, 1, true); // PCM format
    offset += 2;
    view.setUint16(offset, numOfChan, true);
    offset += 2;
    view.setUint32(offset, sampleRate, true);
    offset += 4;
    view.setUint32(offset, sampleRate * numOfChan * bytesPerSample, true); // byte rate
    offset += 4;
    view.setUint16(offset, numOfChan * bytesPerSample, true); // block align
    offset += 2;
    view.setUint16(offset, 16, true); // bits per sample
    offset += 2;
    writeString(view, offset, 'data');
    offset += 4;
    view.setUint32(offset, buffer.length * numOfChan * bytesPerSample, true);
    offset += 4;
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numOfChan; channel++) {
        const sample = Math.max(
          -1,
          Math.min(1, buffer.getChannelData(channel)[i])
        );
        view.setInt16(
          offset,
          sample < 0 ? sample * 0x8000 : sample * 0x7fff,
          true
        );
        offset += 2;
      }
    }
    return bufferOut;
  }
}
