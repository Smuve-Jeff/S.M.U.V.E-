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
  /** Zero-gain sink keeps the capture graph pulled without monitoring input. */
  private silentSink: GainNode | null = null;
  private flushResolver: (() => void) | null = null;
  private recordingWorkletReady = false;
  private recordingWorkletContext: AudioContext | null = null;
  private isFlushing = false;

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
        if (this.recordingWorkletContext !== ctx) {
          await ctx.audioWorklet.addModule(
            'assets/worklets/recording-processor.worklet.js'
          );
          this.recordingWorkletContext = ctx;
        }
        this.recordingWorkletReady = true;
      } catch (e) {
        this.recordingWorkletReady = false;
        this.logger.error(
          'StudioRecordingEngine: Recording worklet failed to load; capture was not started.',
          e
        );
        this.cleanup();
        return false;
      }

      this.sourceNode = ctx.createMediaStreamSource(this.mediaStream);
      this.analyserNode = ctx.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.silentSink = ctx.createGain();
      this.silentSink.gain.value = 0;
      this.silentSink.connect(ctx.destination);

      this.sourceNode.connect(this.analyserNode);
      // Analyser/worklet nodes are otherwise not pulled by the Web Audio
      // graph. The zero-gain sink preserves sample capture without feedback.
      this.analyserNode.connect(this.silentSink);

      this.isInitialized.set(true);
      this.startLevelMonitoring();
      this.logger.info(
        'StudioRecordingEngine: Initialized high-performance capture via AudioWorklet.'
      );
      return true;
    } catch (error) {
      this.logger.error('StudioRecordingEngine: Initialization failed', error);
      this.cleanup();
      return false;
    }
  }

  startRecording(stream?: MediaStream) {
    if (this.isRecording() || this.isFlushing) return;
    const ctx = this.audioEngine.ctx;
    if (!this.recordingWorkletReady || this.recordingWorkletContext !== ctx) {
      this.logger.error(
        'StudioRecordingEngine: Cannot start recording because the recording worklet is unavailable.'
      );
      return;
    }
    if (stream) {
      const workletWasReady =
        this.recordingWorkletReady && this.recordingWorkletContext === ctx;
      this.cleanup();
      if (!workletWasReady) {
        this.logger.error(
          'StudioRecordingEngine: Cannot start a stream-backed recording before initialization.'
        );
        return;
      }
      this.recordingWorkletReady = true;
      this.mediaStream = stream;
      // cleanup() tears down the previous graph but the processor module is
      // still loaded in this AudioContext, so preserve readiness for this
      // stream-backed start path.
      this.sourceNode = ctx.createMediaStreamSource(stream);
      this.analyserNode = ctx.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.silentSink = ctx.createGain();
      this.silentSink.gain.value = 0;
      this.silentSink.connect(ctx.destination);
      this.sourceNode.connect(this.analyserNode);
      this.analyserNode.connect(this.silentSink);
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
      } else if (event.data.command === 'FLUSHED') {
        this.flushResolver?.();
        this.flushResolver = null;
      }
    };

    this.sourceNode?.connect(this.workletNode);
    // Keep the AudioWorklet active while preventing microphone feedback.
    this.workletNode.connect(this.silentSink ?? ctx.destination);
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
    this.isFlushing = true;
    this.workletNode?.port.postMessage({ command: 'STOP' });
    await new Promise<void>((resolve) => {
      this.flushResolver = resolve;
      this.workletNode?.port.postMessage({ command: 'FLUSH' });
      setTimeout(() => {
        this.flushResolver = null;
        resolve();
      }, 250);
    });
    this.isFlushing = false;
    this.workletNode?.disconnect();

    const sampleRate = this.audioEngine.ctx.sampleRate;
    let channels = this.joinChannels(this.leftChannel, this.rightChannel);
    // A user can stop before the first render quantum arrives. Keep that
    // zero-duration take exportable as a valid (silent) WAV instead of
    // throwing from the channel validator.
    if (channels[0].length === 0) {
      channels = [new Float32Array(1), new Float32Array(1)];
    }
    const wavBlob = WavEncoder.encodeMultiChannel(channels, 'wav-16', sampleRate);
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

  /** Return the current left/right channel buffers for SmartRecordingService to pull real comp takes */
  getRecordedBuffers(): { left: Float32Array[]; right: Float32Array[] } {
    return { left: this.leftChannel, right: this.rightChannel };
  }

  private joinChannels(
    left: Float32Array[],
    right: Float32Array[]
  ): [Float32Array, Float32Array] {
    const totalLength = left.reduce((sum, chunk) => sum + chunk.length, 0);
    const leftChannel = new Float32Array(totalLength);
    const rightChannel = new Float32Array(totalLength);
    let offset = 0;
    for (let i = 0; i < left.length; i++) {
      const leftChunk = left[i];
      const rightChunk = right[i] ?? leftChunk;
      leftChannel.set(leftChunk, offset);
      rightChannel.set(rightChunk.subarray(0, leftChunk.length), offset);
      offset += leftChunk.length;
    }
    return [leftChannel, rightChannel];
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
    this.flushResolver = null;
    this.sourceNode?.disconnect();
    this.analyserNode?.disconnect();
    this.silentSink?.disconnect();
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.isInitialized.set(false);
    this.isRecording.set(false);
    this.isFlushing = false;
    this.mediaStream = null;
    this.sourceNode = null;
    this.analyserNode = null;
    this.silentSink = null;
  }

  ngOnDestroy() {
    this.cleanup();
  }
}
