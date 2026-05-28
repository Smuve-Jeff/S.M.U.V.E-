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

  // Status Signals
  isInitialized = signal(false);
  isRecording = signal(false);
  isPaused = signal(false);
  recordingTime = signal(0);
  inputLevel = signal(0);
  recordedBlob = signal<Blob | null>(null);

  // Stream & Nodes
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  // Data Buffers
  private leftChannel: Float32Array[] = [];
  private rightChannel: Float32Array[] = [];
  private timerInterval: any;

  // Events
  recordingFinished$ = new Subject<{
    id: string;
    blob: Blob;
    url: string;
    metadata: RecordingMetadata;
  }>();

  constructor() {}

  async initialize(deviceId?: string): Promise<boolean> {
    this.cleanup();
    try {
      const constraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      const ctx = this.audioEngine.ctx;

      this.sourceNode = ctx.createMediaStreamSource(this.mediaStream);
      this.analyserNode = ctx.createAnalyser();
      this.analyserNode.fftSize = 2048;

      this.sourceNode.connect(this.analyserNode);

      this.isInitialized.set(true);
      this.startLevelMonitoring();
      this.logger.info('StudioRecordingEngine: Initialized lossless capture.');
      return true;
    } catch (error) {
      this.logger.error('StudioRecordingEngine: Initialization failed', error);
      return false;
    }
  }

  startRecording() {
    if (!this.isInitialized() || this.isRecording()) return;

    const ctx = this.audioEngine.ctx;
    this.leftChannel = [];
    this.rightChannel = [];
    this.recordingTime.set(0);
    this.recordedBlob.set(null);

    this.processorNode = ctx.createScriptProcessor(4096, 2, 2);

    this.processorNode.onaudioprocess = (e) => {
      if (!this.isRecording() || this.isPaused()) return;

      const left = e.inputBuffer.getChannelData(0);
      const right = e.inputBuffer.getChannelData(1);

      this.leftChannel.push(new Float32Array(left));
      this.rightChannel.push(new Float32Array(right));

      this.recordingTime.update(t => t + e.inputBuffer.duration);
    };

    this.sourceNode?.connect(this.processorNode);
    this.processorNode.connect(ctx.destination);

    this.isRecording.set(true);
    this.isPaused.set(false);
    this.logger.info('StudioRecordingEngine: Lossless recording started.');
  }

  pauseRecording() {
    if (this.isRecording()) {
      this.isPaused.set(true);
    }
  }

  resumeRecording() {
    if (this.isRecording() && this.isPaused()) {
      this.isPaused.set(false);
    }
  }

  async stopRecording() {
    if (!this.isRecording()) return;

    this.isRecording.set(false);
    this.processorNode?.disconnect();

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
      sampleRate
    };

    await this.localStorage.saveItem('audio_blobs', {
      id,
      blob: wavBlob,
      ...metadata
    });

    const url = URL.createObjectURL(wavBlob);
    this.recordingFinished$.next({ id, blob: wavBlob, url, metadata });
    this.logger.info('StudioRecordingEngine: Lossless recording saved as WAV.');
  }

  getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode;
  }

  private interleave(left: Float32Array[], right: Float32Array[]): Float32Array {
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
    const data = new Uint8Array(this.analyserNode!.frequencyBinCount);
    const monitor = () => {
      if (!this.isInitialized()) return;
      this.analyserNode!.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const level = Math.min(100, Math.round((sum / data.length) * 2));
      this.inputLevel.set(level);
      requestAnimationFrame(monitor);
    };
    monitor();
  }

  private cleanup() {
    this.processorNode?.disconnect();
    this.sourceNode?.disconnect();
    this.mediaStream?.getTracks().forEach(t => t.stop());
    this.isInitialized.set(false);
    this.isRecording.set(false);
  }

  ngOnDestroy() {
    this.cleanup();
  }
}
