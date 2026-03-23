import { LoggingService } from './logging.service';
import { Injectable, signal, inject, OnDestroy } from '@angular/core';

export interface AudioInputDevice {
  deviceId: string;
  label: string;
  type: 'built-in' | 'interface' | 'midi' | 'virtual';
}

@Injectable({
  providedIn: 'root',
})
export class MicrophoneService implements OnDestroy {
  private logger = inject(LoggingService);
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  isInitialized = signal(false);
  isRecording = signal(false);
  isPaused = signal(false);
  recordingTime = signal(0);
  recordedBlob = signal<Blob | null>(null);

  availableDevices = signal<AudioInputDevice[]>([]);
  selectedDeviceId = signal<string | null>(null);

  private timerInterval: any;

  constructor() {
    this.updateAvailableDevices();
  }

  ngOnDestroy() {
    this.stop();
    this.stopTimer();
  }

  async updateAvailableDevices(): Promise<void> {
    if (typeof window === 'undefined' || !navigator.mediaDevices) return;

    try {
      // Permission check to get labels
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();

      // Stop the temp stream used for labels
      stream.getTracks().forEach(t => t.stop());

      const audioInputs = devices
        .filter(device => device.kind === 'audioinput')
        .map(device => {
          const label = device.label || `Microphone ${device.deviceId.slice(0, 5)}`;
          let type: AudioInputDevice['type'] = 'built-in';

          const lowerLabel = label.toLowerCase();
          if (lowerLabel.includes('interface') || lowerLabel.includes('focusrite') || lowerLabel.includes('universal audio') || lowerLabel.includes('behringer') || lowerLabel.includes('preamp')) {
            type = 'interface';
          } else if (lowerLabel.includes('midi')) {
            type = 'midi';
          } else if (lowerLabel.includes('virtual') || lowerLabel.includes('cable') || lowerLabel.includes('blackhole')) {
            type = 'virtual';
          }

          return {
            deviceId: device.deviceId,
            label,
            type
          };
        });

      this.availableDevices.set(audioInputs);
      if (audioInputs.length > 0 && !this.selectedDeviceId()) {
        this.selectedDeviceId.set(audioInputs[0].deviceId);
      }
    } catch (error) {
      this.logger.error('Error enumerating audio devices:', error);
    }
  }

  async initialize(deviceId?: string): Promise<void> {
    if (typeof window === 'undefined' || !navigator.mediaDevices) return;

    this.stop();

    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
          channelCount: 2
        },
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        latencyHint: 'interactive',
        sampleRate: 48000
      });

      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 2048;

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.sourceNode.connect(this.analyserNode);

      this.isInitialized.set(true);
      if (deviceId) this.selectedDeviceId.set(deviceId);
      this.logger.info('MicrophoneService (High Quality) initialized:', deviceId || 'default');
    } catch (error) {
      this.logger.error('Error initializing microphone service:', error);
      this.isInitialized.set(false);
    }
  }

  startRecording(): void {
    if (!this.mediaStream || !this.isInitialized()) return;

    this.chunks = [];
    const options = { mimeType: 'audio/webm;codecs=opus' };

    try {
      this.mediaRecorder = new MediaRecorder(this.mediaStream, options);
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm' });
        this.recordedBlob.set(blob);
        this.isRecording.set(false);
        this.isPaused.set(false);
        this.stopTimer();
      };

      this.mediaRecorder.start(100); // Collect data every 100ms
      this.isRecording.set(true);
      this.isPaused.set(false);
      this.startTimer();
      this.logger.info('Recording started');
    } catch (e) {
      this.logger.error('Failed to start MediaRecorder:', e);
    }
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  pauseRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      this.isPaused.set(true);
      this.stopTimer();
    }
  }

  resumeRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      this.isPaused.set(false);
      this.startTimer();
    }
  }

  private startTimer(): void {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      this.recordingTime.update(t => t + 0.1);
    }, 100);
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  getAnalyserNode(): AnalyserNode | undefined {
    return this.analyserNode ?? undefined;
  }

  stop(): void {
    this.stopRecording();
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
    this.mediaStream = null;
    this.audioContext = null;
    this.analyserNode = null;
    this.sourceNode = null;
  }
}
