import { LoggingService } from '../services/logging.service';
import { Injectable, signal, inject } from '@angular/core';
import { AudioEngineService } from '../services/audio-engine.service';

@Injectable({
  providedIn: 'root'
})
export class AudioRecorderService {
  private logger = inject(LoggingService);
  private engine = inject(AudioEngineService);
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private analyser: AnalyserNode | null = null;

  recordingState = signal<'idle' | 'recording' | 'paused'>('idle');
  waveform = signal<number[]>([]);

  constructor() { }

  async startRecording(stream?: MediaStream) {
    this.engine.resume();

    // If no stream provided, use the master stream from engine
    const sourceStream = stream || this.engine.getMasterStream().stream;

    const ctx = this.engine.getContext();
    this.analyser = ctx.createAnalyser();
    const source = ctx.createMediaStreamSource(sourceStream);
    source.connect(this.analyser);

    this.mediaRecorder = new MediaRecorder(sourceStream);
    this.audioChunks = [];

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm;codecs=opus' });
      const audioUrl = URL.createObjectURL(audioBlob);
      this.logger.info('Recording stopped. Audio URL:', audioUrl);

      // Auto-download for the user to verify
      const link = document.createElement('a');
      link.href = audioUrl;
      link.download = `smuve_recording_${Date.now()}.webm`;
      link.click();

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
    }
  }
}
