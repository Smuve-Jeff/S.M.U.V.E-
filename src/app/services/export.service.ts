import { Injectable } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';

@Injectable({ providedIn: 'root' })
export class ExportService {
  constructor(private engine: AudioEngineService) {}

  // Live recording using MediaRecorder on the master stream
  startLiveRecording(mimeType: string = 'audio/webm;codecs=opus') {
    const dest = this.engine.getMasterStream();
    const recorder = new MediaRecorder(dest.stream, { mimeType });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const promise = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: mimeType }));
      };
    });

    recorder.start();
    return { recorder, result: promise };
  }

  // Offline render to WAV using OfflineAudioContext (simple capture pass-through)
  async renderOfflineToWav(durationSec: number): Promise<Blob> {
    const ctx = this.engine.getContext();
    const sampleRate = ctx.sampleRate;
    const offline = new OfflineAudioContext(
      2,
      Math.ceil(durationSec * sampleRate),
      sampleRate
    );

    // Simple usage: render silence placeholder; app can wire a custom graph later
    const silence = offline.createBufferSource();
    silence.start(0);
    silence.connect(offline.destination);

    const rendered = await offline.startRendering();
    const wav = this.audioBufferToWav(rendered);
    return new Blob([wav], { type: 'audio/wav' });
  }

  private audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
    const numOfChan = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferOut = new ArrayBuffer(length);
    const view = new DataView(bufferOut);

    function writeString(view: DataView, offset: number, str: string) {
      for (let i = 0; i < str.length; i++)
        view.setUint8(offset + i, str.charCodeAt(i));
    }

    let offset = 0;
    writeString(view, offset, 'RIFF');
    offset += 4;
    view.setUint32(offset, 36 + buffer.length * numOfChan * 2, true);
    offset += 4;
    writeString(view, offset, 'WAVE');
    offset += 4;
    writeString(view, offset, 'fmt ');
    offset += 4;
    view.setUint32(offset, 16, true);
    offset += 4;
    view.setUint16(offset, 1, true);
    offset += 2;
    view.setUint16(offset, numOfChan, true);
    offset += 2;
    view.setUint32(offset, sampleRate, true);
    offset += 4;
    view.setUint32(offset, sampleRate * numOfChan * 2, true);
    offset += 4;
    view.setUint16(offset, numOfChan * 2, true);
    offset += 2;
    view.setUint16(offset, 16, true);
    offset += 2;
    writeString(view, offset, 'data');
    offset += 4;
    view.setUint32(offset, buffer.length * numOfChan * 2, true);
    offset += 4;

    // Interleave channels
    const channels: Float32Array[] = [];
    for (let i = 0; i < numOfChan; i++) channels.push(buffer.getChannelData(i));
    let sampleIndex = 0;
    while (sampleIndex < buffer.length) {
      for (let c = 0; c < numOfChan; c++) {
        let sample = channels[c][sampleIndex];
        sample = Math.max(-1, Math.min(1, sample));
        view.setInt16(
          offset,
          sample < 0 ? sample * 0x8000 : sample * 0x7fff,
          true
        );
        offset += 2;
      }
      sampleIndex++;
    }

    return bufferOut;
  }
}
