import { Injectable, inject, signal, OnDestroy } from '@angular/core';
import { LoggingService } from '../services/logging.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { LocalStorageService } from '../services/local-storage.service';
import { WavEncoder } from './wav-encoder.util';
import { Subject } from 'rxjs';

export interface RecordingMetadata {
  id: string;
  name: string;
  timestamp: number;
  duration: number;
  format: 'wav' | 'webm';
  bitDepth: number;
  sampleRate: number;
}

@Injectable({
  providedIn: 'root',
})
export class StudioRecordingEngineService implements OnDestroy {
  private logger = inject(LoggingService);
  private audioEngine = inject(AudioEngineService);
  private localStorage = inject(LocalStorageService);

  isInitialized = signal(false);
  isRecording = signal(false);
  isPaused = signal(false);
  recordingTime = signal(0);
  inputLevel = signal(0);
  recordedBlob = signal<Blob | null>(null);
  takes = signal<any[]>([]);
  pendingMidi: any[] = [];

  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  private leftChannel: Float32Array[] = [];
  private rightChannel: Float32Array[] = [];

  recordingFinished$ = new Subject<{
    id: string;
    blob: Blob;
    url: string;
    metadata: RecordingMetadata;
  }>();

  async initialize(deviceId?: string): Promise<boolean> {
    this.cleanup();
    try {
      const constraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      const ctx = this.audioEngine.ctx;

      try {
        await ctx.audioWorklet.addModule(
          'assets/worklets/recording-processor.js'
        );
      } catch (e) {
        this.logger.warn(
          'StudioRecordingEngine: Worklet might already be loaded or failed to load via assets path.',
          e
        );
      }

      this.sourceNode = ctx.createMediaStreamSource(this.mediaStream);
      this.analyserNode = ctx.createAnalyser();
      this.analyserNode.fftSize = 2048;

      this.sourceNode.connect(this.analyserNode);

      this.isInitialized.set(true);
      this.startLevelMonitoring();
      this.logger.info(
        'StudioRecordingEngine: Initialized high-performance capture via AudioWorklet.'
      );
      return true;
    } catch (error) {
      this.logger.error('StudioRecordingEngine: Initialization failed', error);
      return false;
    }
  }

  startRecording(stream?: MediaStream) {
    if (this.isRecording()) return;
    const ctx = this.audioEngine.ctx;
    if (stream) {
      this.cleanup();
      this.sourceNode = ctx.createMediaStreamSource(stream);
      this.analyserNode = ctx.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.sourceNode.connect(this.analyserNode);
      this.isInitialized.set(true);
      this.startLevelMonitoring();
    } else if (!this.isInitialized()) {
      this.logger.error(
        'StudioRecordingEngine: Cannot start recording without initialization'
      );
      return;
    }

    this.leftChannel = [];
    this.rightChannel = [];
    this.recordingTime.set(0);
    this.pendingMidi = [];
    this.recordedBlob.set(null);

    this.workletNode = new AudioWorkletNode(ctx, 'recording-processor');
    this.workletNode.port.onmessage = (event) => {
      if (event.data.command === 'DATA') {
        this.leftChannel.push(...event.data.left);
        this.rightChannel.push(...event.data.right);
        const sampleCount = event.data.left.reduce(
          (acc: number, cur: Float32Array) => acc + cur.length,
          0
        );
        this.recordingTime.update((t) => t + sampleCount / ctx.sampleRate);
      }
    };

    this.sourceNode?.connect(this.workletNode);
    this.workletNode.port.postMessage({ command: 'START' });
    this.isRecording.set(true);
    this.isPaused.set(false);
  }

  pauseRecording() {
    if (this.isRecording()) {
      this.isPaused.set(true);
      this.workletNode?.port.postMessage({ command: 'STOP' });
    }
  }

  resumeRecording() {
    if (this.isRecording() && this.isPaused()) {
      this.isPaused.set(false);
      this.workletNode?.port.postMessage({ command: 'START' });
    }
  }

  async stopRecording() {
    if (!this.isRecording()) return;
    this.isRecording.set(false);
    this.workletNode?.port.postMessage({ command: 'STOP' });
    this.workletNode?.port.postMessage({ command: 'FLUSH' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    this.workletNode?.disconnect();

    const sampleRate = this.audioEngine.ctx.sampleRate;
    const interleaved = this.interleave(this.leftChannel, this.rightChannel);
    const wavBlob = WavEncoder.encode([interleaved], 2, sampleRate);
    this.recordedBlob.set(wavBlob);

    const id = `studio_rec_${Date.now()}`;
    const metadata: RecordingMetadata = {
      id,
      name: `Studio Session ${new Date().toLocaleTimeString()}`,
      timestamp: Date.now(),
      duration: this.recordingTime(),
      format: 'wav',
      bitDepth: 16,
      sampleRate,
    };
    await this.localStorage.saveItem('audio_blobs', {
      id,
      blob: wavBlob,
      ...metadata,
    });
    const url = URL.createObjectURL(wavBlob);
    this.recordingFinished$.next({ id, blob: wavBlob, url, metadata });
  }

  getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode;
  }

  private interleave(
    left: Float32Array[],
    right: Float32Array[]
  ): Float32Array {
    let totalLength = 0;
    for (const chunk of left) totalLength += chunk.length;
    const result = new Float32Array(totalLength * 2);
    let offset = 0;
    for (let i = 0; i < left.length; i++) {
      for (let j = 0; j < left[i].length; j++) {
        result[offset++] = left[i][j];
        result[offset++] = right[i][j];
      }
    }
    return result;
  }

  private startLevelMonitoring() {
    if (!this.analyserNode) return;
    const data = new Uint8Array(this.analyserNode.frequencyBinCount);
    const monitor = () => {
      if (!this.isInitialized() || !this.analyserNode) return;
      this.analyserNode.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const level = Math.min(100, Math.round((sum / data.length) * 2));
      this.inputLevel.set(level);
      requestAnimationFrame(monitor);
    };
    monitor();
  }

  private cleanup() {
    this.workletNode?.disconnect();
    this.sourceNode?.disconnect();
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.isInitialized.set(false);
    this.isRecording.set(false);
    this.mediaStream = null;
    this.sourceNode = null;
    this.analyserNode = null;
  }

  ngOnDestroy() {
    this.cleanup();
  }
}
