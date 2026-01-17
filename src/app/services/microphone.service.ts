
import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class MicrophoneService {
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private noiseGate: AudioWorkletNode | BiquadFilterNode | null = null;
  private deEsser: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  isInitialized = signal(false);

  constructor() { }

  async initialize(): Promise<void> {
    if (this.isInitialized() || typeof window === 'undefined' || !navigator.mediaDevices) {
      return;
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyserNode = this.audioContext.createAnalyser();
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Professional Mic Channel Strip
      // 1. Noise Gate (simple high-pass/gate placeholder)
      this.noiseGate = this.audioContext.createBiquadFilter();
      this.noiseGate.type = 'highpass';
      this.noiseGate.frequency.value = 80;

      // 2. De-Esser (peaking filter to reduce sibilance)
      this.deEsser = this.audioContext.createBiquadFilter();
      this.deEsser.type = 'peaking';
      this.deEsser.frequency.value = 6000;
      this.deEsser.Q.value = 2;
      this.deEsser.gain.value = -6;

      // 3. Compressor
      this.compressor = this.audioContext.createDynamicsCompressor();
      this.compressor.threshold.value = -24;
      this.compressor.knee.value = 30;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;

      this.sourceNode
        .connect(this.noiseGate)
        .connect(this.deEsser)
        .connect(this.compressor)
        .connect(this.analyserNode);

      this.isInitialized.set(true);
      console.log('MicrophoneService initialized.');
    } catch (error) {
      console.error('Error initializing microphone service:', error);
      this.isInitialized.set(false);
    }
  }

  getAnalyserNode(): AnalyserNode | undefined {
    if (!this.analyserNode) {
        this.initialize();
    }
    return this.analyserNode ?? undefined;
  }

  stop(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.isInitialized.set(false);
  }
}
