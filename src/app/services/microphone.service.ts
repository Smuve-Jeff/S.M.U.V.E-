import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class MicrophoneService {
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;

  isInitialized = signal(false);

  constructor() {}

  async initialize(): Promise<void> {
    if (
      this.isInitialized() ||
      typeof window === 'undefined' ||
      !navigator.mediaDevices
    ) {
      return;
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      this.audioContext = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();
      this.analyserNode = this.audioContext.createAnalyser();
      this.sourceNode = this.audioContext.createMediaStreamSource(
        this.mediaStream
      );
      this.sourceNode.connect(this.analyserNode);
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
      this.mediaStream.getTracks().forEach((track) => track.stop());
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
