import { LoggingService } from './logging.service';
import { Injectable, signal, inject, OnDestroy } from '@angular/core';

export interface AudioInputDevice {
  deviceId: string;
  label: string;
  type:
    | 'built-in'
    | 'interface'
    | 'midi'
    | 'virtual'
    | 'headset'
    | 'speakerphone';
  isDefault: boolean;
  capabilities: Array<
    | 'default'
    | 'phantom-power'
    | 'headphone-monitoring'
    | 'speakerphone'
    | 'midi-ready'
    | 'stereo'
    | 'usb-interface'
  >;
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

  describeDevice(device: Pick<MediaDeviceInfo, 'deviceId' | 'label'>): AudioInputDevice {
    const label = device.label || `Microphone ${device.deviceId.slice(0, 5)}`;
    const lowerLabel = label.toLowerCase();
    const type = this.resolveDeviceType(lowerLabel);
    const capabilities = new Set<AudioInputDevice['capabilities'][number]>();

    if (
      device.deviceId === 'default' ||
      device.deviceId === 'communications' ||
      lowerLabel.includes('default') ||
      lowerLabel.includes('communications')
    ) {
      capabilities.add('default');
    }

    if (
      type === 'interface' ||
      lowerLabel.includes('phantom') ||
      lowerLabel.includes('48v') ||
      lowerLabel.includes('xlr') ||
      lowerLabel.includes('condenser')
    ) {
      capabilities.add('phantom-power');
      capabilities.add('usb-interface');
    }

    if (
      type === 'headset' ||
      type === 'interface' ||
      lowerLabel.includes('headphone') ||
      lowerLabel.includes('monitor')
    ) {
      capabilities.add('headphone-monitoring');
    }

    if (type === 'speakerphone' || lowerLabel.includes('speakerphone')) {
      capabilities.add('speakerphone');
    }

    if (
      type === 'midi' ||
      lowerLabel.includes('midi') ||
      lowerLabel.includes('controller')
    ) {
      capabilities.add('midi-ready');
    }

    if (
      lowerLabel.includes('stereo') ||
      type === 'interface' ||
      type === 'headset'
    ) {
      capabilities.add('stereo');
    }

    return {
      deviceId: device.deviceId,
      label,
      type,
      isDefault: capabilities.has('default'),
      capabilities: Array.from(capabilities),
    };
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
      stream.getTracks().forEach((t) => t.stop());

      const audioInputs = devices
        .filter((device) => device.kind === 'audioinput')
        .map((device) => this.describeDevice(device));

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
          channelCount: 2,
        },
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.audioContext = new (
        window.AudioContext || (window as any).webkitAudioContext
      )({
        latencyHint: 'interactive',
        sampleRate: 48000,
      });

      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 2048;

      this.sourceNode = this.audioContext.createMediaStreamSource(
        this.mediaStream
      );
      this.sourceNode.connect(this.analyserNode);

      this.isInitialized.set(true);
      if (deviceId) this.selectedDeviceId.set(deviceId);
      this.logger.info(
        'MicrophoneService (High Quality) initialized:',
        deviceId || 'default'
      );
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
      this.recordingTime.update((t) => t + 0.1);
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

  private resolveDeviceType(label: string): AudioInputDevice['type'] {
    if (
      label.includes('speakerphone') ||
      label.includes('speaker phone') ||
      (label.includes('speaker') && label.includes('mic'))
    ) {
      return 'speakerphone';
    }

    if (
      label.includes('headset') ||
      label.includes('headphone mic') ||
      label.includes('airpods') ||
      label.includes('earpods')
    ) {
      return 'headset';
    }

    if (
      label.includes('interface') ||
      label.includes('focusrite') ||
      label.includes('universal audio') ||
      label.includes('behringer') ||
      label.includes('preamp')
    ) {
      return 'interface';
    }

    if (label.includes('midi')) {
      return 'midi';
    }

    if (
      label.includes('virtual') ||
      label.includes('cable') ||
      label.includes('blackhole')
    ) {
      return 'virtual';
    }

    return 'built-in';
  }
}
