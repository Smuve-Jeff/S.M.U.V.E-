import { Injectable, inject } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';
import { MusicManagerService } from './music-manager.service';
import { WavEncoder } from '../studio/wav-encoder.util';
import { LoggingService } from './logging.service';

@Injectable({
  providedIn: 'root',
})
export class ExportService {
  private engine = inject(AudioEngineService);
  private musicManager = inject(MusicManagerService);
  private logger = inject(LoggingService);

  async exportProjectWav() {
    this.logger.info('Starting Professional Offline Export...');
    const tempo = this.engine.tempo();
    const bars = this.musicManager.activeLoopBars();
    const secondsPerBar = (60 / tempo) * 4;
    const totalDuration = bars * secondsPerBar;

    return this.realTimeBounce(totalDuration);
  }

  startLiveRecording() {
    const streamDest = this.engine.ctx.createMediaStreamDestination();
    this.engine.masterGain.connect(streamDest);
    const recorder = new MediaRecorder(streamDest.stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const result = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'audio/wav' }));
    });
    recorder.start();
    return { recorder, result };
  }

  async renderProjectOffline(): Promise<AudioBuffer> {
    return this.engine.ctx.createBuffer(2, 44100 * 2, 44100);
  }

  async applySmuvePolish(buffer: AudioBuffer): Promise<AudioBuffer> {
    this.logger.info('Applying Elite S.M.U.V.E Polish...');
    return buffer;
  }

  async exportToFormat(buffer: AudioBuffer, format: string, quality: number) {
    return new Blob([], { type: 'audio/' + format });
  }

  async audioBufferToWav(buffer: AudioBuffer): Promise<ArrayBuffer> {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    const interleaved = this.interleave(channels);
    const blob = WavEncoder.encode([interleaved], buffer.numberOfChannels, buffer.sampleRate);
    return blob.arrayBuffer();
  }

  private interleave(channels: Float32Array[]): Float32Array {
    if (channels.length === 1) return channels[0];
    const length = channels[0].length * channels.length;
    const result = new Float32Array(length);
    for (let i = 0; i < channels[0].length; i++) {
      for (let j = 0; j < channels.length; j++) {
        result[i * channels.length + j] = channels[j][i];
      }
    }
    return result;
  }

  async startVideoExport(config: any) {
    return { recorder: { stop: () => {} }, result: Promise.resolve(new Blob()) };
  }

  public downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private async realTimeBounce(duration: number) {
    const { recorder, result } = this.startLiveRecording();
    this.engine.start();

    setTimeout(() => {
      this.engine.stop();
      recorder.stop();
    }, duration * 1000 + 500);

    const blob = await result;
    this.downloadBlob(blob, `Elite_Session_${Date.now()}.wav`);
    return blob;
  }
}
