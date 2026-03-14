import { LoggingService } from './logging.service';
import { Injectable, signal , inject} from '@angular/core';

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

@Injectable({
  providedIn: 'root',
})
export class MicrophoneService {
  private logger = inject(LoggingService);
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;

  isInitialized = signal(false);
  availableDevices = signal<AudioInputDevice[]>([]);
  selectedDeviceId = signal<string | null>(null);

  constructor() {
    this.updateAvailableDevices();
  }

  async updateAvailableDevices(): Promise<void> {
    if (typeof window === 'undefined' || !navigator.mediaDevices) return;

    try {
      // First, request permissions to get labels
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${device.deviceId.slice(0, 5)}`
        }));
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
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyserNode = this.audioContext.createAnalyser();
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.sourceNode.connect(this.analyserNode);
      this.isInitialized.set(true);
      if (deviceId) this.selectedDeviceId.set(deviceId);
      this.logger.info('MicrophoneService initialized with device:', deviceId || 'default');
    } catch (error) {
      this.logger.error('Error initializing microphone service:', error);
      this.isInitialized.set(false);
    }
  }

  getAnalyserNode(): AnalyserNode | undefined {
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
