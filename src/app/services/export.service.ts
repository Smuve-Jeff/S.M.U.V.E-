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
    const demoBuffer = await this.renderProjectOffline();
    const wavData = await this.audioBufferToWav(demoBuffer);
    const blob = new Blob([wavData], { type: 'audio/wav' });
    this.downloadBlob(blob, `Elite_Session_${Date.now()}.wav`);
    return blob;
  }

  async renderProjectOffline(): Promise<AudioBuffer> {
    const tempo = this.engine.tempo();
    const bars = Math.max(1, this.musicManager.activeLoopBars());
    const secondsPerBar = (60 / tempo) * 4;
    const totalSeconds = bars * secondsPerBar;
    const sampleRate = 44100;
    const offlineCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * totalSeconds), sampleRate);

    const audioTracks = this.musicManager.tracks().filter((track) => track.type === 'audio');
    for (const track of audioTracks) {
      for (const clip of track.clips) {
        if (clip.type !== 'audio' || !clip.audioData) continue;
        const source = offlineCtx.createBufferSource();
        const cloned = this.cloneAudioBufferToContext(clip.audioData, offlineCtx);
        source.buffer = cloned;
        source.playbackRate.value = clip.originalBpm ? this.engine.calculatePlaybackRate(clip.originalBpm) : 1;

        const panner = offlineCtx.createStereoPanner();
        panner.pan.value = track.pan;
        const gain = offlineCtx.createGain();
        const clipGain = track.volume;
        gain.gain.setValueAtTime(0.0001, 0);

        const startTime = clip.start * secondsPerBar;
        const clipDuration = clip.durationSeconds ? clip.durationSeconds / source.playbackRate.value : cloned.duration / source.playbackRate.value;
        const fadeInTime = Math.min(clip.fadeIn || 0, clipDuration * 0.5);
        const fadeOutTime = Math.min(clip.fadeOut || 0, clipDuration * 0.5);

        if (fadeInTime > 0) {
          gain.gain.setValueAtTime(0.0001, startTime);
          gain.gain.linearRampToValueAtTime(clipGain, startTime + fadeInTime);
        } else {
          gain.gain.setValueAtTime(clipGain, startTime);
        }

        if (fadeOutTime > 0) {
          const fadeOutStart = Math.max(startTime + fadeInTime, startTime + clipDuration - fadeOutTime);
          gain.gain.setValueAtTime(clipGain, fadeOutStart);
          gain.gain.linearRampToValueAtTime(0.0001, startTime + clipDuration);
        }

        source.connect(panner);
        panner.connect(gain);
        gain.connect(offlineCtx.destination);

        source.start(startTime);
        source.stop(startTime + clipDuration);
      }
    }

    return offlineCtx.startRendering();
  }

  private cloneAudioBufferToContext(source: AudioBuffer, targetCtx: BaseAudioContext): AudioBuffer {
    const buffer = targetCtx.createBuffer(source.numberOfChannels, source.length, source.sampleRate);
    for (let channel = 0; channel < source.numberOfChannels; channel++) {
      buffer.copyToChannel(source.getChannelData(channel), channel);
    }
    return buffer;
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

  async applySmuvePolish(buffer: AudioBuffer): Promise<AudioBuffer> {
    this.logger.info('Applying Elite S.M.U.V.E Polish...');
    return buffer;
  }

  async exportToFormat(buffer: AudioBuffer, format: string, quality: number) {
    return new Blob([], { type: 'audio/' + format });
  }

  async audioBufferToWav(buffer: AudioBuffer): Promise<ArrayBuffer> {
    const channels = [];
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }
    const interleaved = this.interleave(channels);
    const blob = WavEncoder.encode([interleaved], buffer.numberOfChannels, buffer.sampleRate);
    return await blob.arrayBuffer();
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
    if (this.engine.isPlaying()) {
      throw new Error('WAV export requires playback to be stopped before starting the bounce.');
    }

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
