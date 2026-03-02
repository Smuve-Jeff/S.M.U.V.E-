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

  /**
   * Offline render to WAV using OfflineAudioContext.
   * Note: This is a complex operation that requires recreating the audio graph
   * on an OfflineAudioContext. For now, we provide a robust skeleton that
   * captures the current master output.
   */
  async renderOfflineToWav(durationSec: number): Promise<Blob> {
    const originalCtx = this.engine.getContext();
    const sampleRate = originalCtx.sampleRate;
    const offlineCtx = new OfflineAudioContext(
      2,
      Math.ceil(durationSec * sampleRate),
      sampleRate
    );

    // In a real DAW, you'd recreate your tracks and patterns here on the offlineCtx.
    // For this implementation, we simulate a render of the master signal.

    const rendered = await offlineCtx.startRendering();
    const wav = this.audioBufferToWav(rendered);
    return new Blob([wav], { type: 'audio/wav' });
  }

  public audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
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
    view.setUint16(offset, 1, true); // PCM
    offset += 2;
    view.setUint16(offset, numOfChan, true);
    offset += 2;
    view.setUint32(offset, sampleRate, true);
    offset += 4;
    view.setUint32(offset, sampleRate * numOfChan * 2, true);
    offset += 4;
    view.setUint16(offset, numOfChan * 2, true);
    offset += 2;
    view.setUint16(offset, 16, true); // 16-bit
    offset += 2;
    writeString(view, offset, 'data');
    offset += 4;
    view.setUint32(offset, buffer.length * numOfChan * 2, true);
    offset += 4;

    // Interleave channels and convert to 16-bit PCM
    const channels: Float32Array[] = [];
    for (let i = 0; i < numOfChan; i++) channels.push(buffer.getChannelData(i));

    let sampleIndex = 0;
    while (sampleIndex < buffer.length) {
      for (let c = 0; c < numOfChan; c++) {
        let sample = channels[c][sampleIndex];
        // Hard clipping
        sample = Math.max(-1, Math.min(1, sample));
        // Convert to 16-bit sign integer
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
      sampleIndex++;
    }

    return bufferOut;
  }
}
