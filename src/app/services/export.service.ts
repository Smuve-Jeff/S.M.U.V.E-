import { LoggingService } from './logging.service';
import { Injectable, inject } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';
import { MusicManagerService } from './music-manager.service';

@Injectable({ providedIn: 'root' })
export class ExportService {
  private logger = inject(LoggingService);
  private engine = inject(AudioEngineService);
  private musicManager = inject(MusicManagerService);

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


  async startVideoExport(canvas: HTMLCanvasElement, includeHud = true) {
    this.logger.system('INITIALIZING INTEGRATED VIDEO EXPORT UPLINK...');
    this.engine.resume();

    let exportCanvas = canvas;
    if (includeHud) {
      this.logger.info('Injecting S.M.U.V.E. HUD Overlays into stream.');
    }

    const audioStream = this.engine.getMasterStream().stream;
    const canvasStream = (exportCanvas as any).captureStream(60);
    audioStream
      .getAudioTracks()
      .forEach((track) => canvasStream.addTrack(track));

    const recorder = new MediaRecorder(canvasStream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 12000000,
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



  async renderProjectOffline(durationSeconds?: number): Promise<AudioBuffer> {
    this.logger.system('INITIALIZING NEURAL OFFLINE RENDER ENGINE...');
    const tempo = this.engine.tempo();
    const stepsPerBeat = this.engine.stepsPerBeat();
    const loopEnd = this.engine.loopEnd();
    const stepDur = 60 / tempo / stepsPerBeat;

    // Default to one full loop if duration is not specified
    const totalDuration = durationSeconds || (loopEnd * stepDur);
    const sampleRate = this.engine.ctx.sampleRate;

    const offlineCtx = new OfflineAudioContext(
      2,
      Math.ceil(totalDuration * sampleRate),
      sampleRate
    );

    // Render the sequence into the offline context
    let currentTime = 0;
    while (currentTime < totalDuration) {
      const stepIndex = Math.floor(currentTime / stepDur) % loopEnd;
      this.musicManager.playStep(stepIndex, currentTime, stepDur, offlineCtx);
      currentTime += stepDur;
    }

    this.logger.info(`Neural Offline Render: ${totalDuration.toFixed(2)}s @ ${sampleRate}Hz`);
    return await offlineCtx.startRendering();
  }

  async exportToFormat(buffer: AudioBuffer, format: 'wav' | 'mp3' | 'aac' = 'wav', bitDepth: 16 | 24 = 16): Promise<Blob> {
    if (format === 'wav') {
      const wav = this.audioBufferToWav(buffer, bitDepth);
      return new Blob([wav], { type: 'audio/wav' });
    }

    // For MP3/AAC, we use a temporary MediaStream and MediaRecorder since we are in the browser
    const offlineCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    const dest = offlineCtx.createMediaStreamDestination();
    source.connect(dest);

    const mimeType = format === 'mp3' ? 'audio/mpeg' : 'audio/mp4';
    const finalMimeType = MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'audio/webm';

    const recorder = new MediaRecorder(dest.stream, { mimeType: finalMimeType, audioBitsPerSecond: 320000 });
    const chunks: Blob[] = [];

    return new Promise((resolve) => {
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: finalMimeType }));
        offlineCtx.close();
      };

      recorder.start();
      source.start(0);
      source.onended = () => {
        recorder.stop();
      };
    });
  }

  async applySmuvePolish(buffer: AudioBuffer): Promise<AudioBuffer> {
    this.logger.system('DEPLOYING S.M.U.V.E. POLISH PROTOCOL...');
    const offlineCtx = new OfflineAudioContext(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;

    const saturator = offlineCtx.createWaveShaper();
    const compressor = offlineCtx.createDynamicsCompressor();
    const limiter = offlineCtx.createDynamicsCompressor();

    const curve = new Float32Array(44100);
    for (let i = 0; i < 44100; i++) {
      const x = (i * 2) / 44100 - 1;
      curve[i] = (3 + x * x) * x / (3 + 3 * x * x);
    }
    saturator.curve = curve;

    compressor.threshold.value = -16;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.25;

    limiter.threshold.value = -0.3;
    limiter.ratio.value = 20;

    source.connect(saturator).connect(compressor).connect(limiter).connect(offlineCtx.destination);

    source.start(0);
    const polished = await offlineCtx.startRendering();
    this.logger.info('S.M.U.V.E. Polish Complete: Sonic Authority Infused.');
    return polished;
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


  public audioBufferToWav(buffer: AudioBuffer, bitDepth: 16 | 24 = 16): ArrayBuffer {
    const numOfChan = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bytesPerSample = bitDepth / 8;
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
    view.setUint32(offset, sampleRate * numOfChan * bytesPerSample, true);
    offset += 4;
    view.setUint16(offset, numOfChan * bytesPerSample, true);
    offset += 2;
    view.setUint16(offset, bitDepth, true);
    offset += 2;
    writeString(view, offset, 'data');
    offset += 4;
    view.setUint32(offset, buffer.length * numOfChan * bytesPerSample, true);
    offset += 4;

    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numOfChan; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        if (bitDepth === 16) {
          view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
          offset += 2;
        } else {
          const s = Math.floor(sample * (sample < 0 ? 0x800000 : 0x7fffff));
          view.setUint8(offset, s & 0xff);
          view.setUint8(offset + 1, (s >> 8) & 0xff);
          view.setUint8(offset + 2, (s >> 16) & 0xff);
          offset += 3;
        }
      }
    }
    return bufferOut;
  }

}
