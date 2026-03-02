import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AudioRecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  recordingState = signal<'idle' | 'recording' | 'paused'>('idle');
  waveform = signal<number[]>([]);

  constructor() { }

  async startRecording(stream: MediaStream) {
    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.source = this.audioContext.createMediaStreamSource(stream);
    this.source.connect(this.analyser);

    this.mediaRecorder = new MediaRecorder(stream);
    this.audioChunks = [];

    this.mediaRecorder.ondataavailable = (event) => {
      this.audioChunks.push(event.data);
    };

    this.mediaRecorder.onstop = () => {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(audioBlob);
      console.log('Recording stopped. Audio URL:', audioUrl);
      this.recordingState.set('idle');
    };

    this.mediaRecorder.start();
    this.recordingState.set('recording');
    this.updateWaveform();
  }

  private updateWaveform() {
    if (this.recordingState() !== 'recording' || !this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(dataArray);

    const waveformValues = Array.from(dataArray).map(val => (val - 128) / 128);
    this.waveform.set(waveformValues);

    requestAnimationFrame(() => this.updateWaveform());
  }

  stopRecording() {
    if (this.mediaRecorder && this.recordingState() === 'recording') {
      this.mediaRecorder.stop();
      if (this.audioContext) {
        this.audioContext.close();
      }
    }
  }
}
