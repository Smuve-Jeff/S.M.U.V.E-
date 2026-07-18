import { LoggingService } from './logging.service';
import { Injectable, signal, computed, inject, OnDestroy } from '@angular/core';

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
  /** Pre-analyser input gain so external mics / interfaces can be
   *  attenuated or boosted (0 = mute, 1 = unity, up to 2 = +6 dB). */
  private inputGainNode: GainNode | null = null;

  isInitialized = signal(false);
  isRecording = signal(false);
  isPaused = signal(false);
  recordingTime = signal(0);
  recordedBlob = signal<Blob | null>(null);

  availableDevices = signal<AudioInputDevice[]>([]);
  selectedDeviceId = signal<string | null>(null);

  /** Live input gain (0–2). Defaults to unity gain. */
  micInputGain = signal<number>(1);
  /** Friendly label for the active input source. */
  inputDeviceName = computed(() => {
    const id = this.selectedDeviceId();
    const m = this.availableDevices().find((d) => d.deviceId === id);
    return m?.label || 'Default microphone';
  });
  /** True when a non-default (interface / USB / headset) mic is selected. */
  externalInputActive = computed(() => {
    const id = this.selectedDeviceId();
    if (!id) return false;
    const m = this.availableDevices().find((d) => d.deviceId === id);
    return !!m && m.type !== 'built-in';
  });

  private timerInterval: any;

  constructor() {
    this.updateAvailableDevices();
  }

  describeDevice(
    device: Pick<MediaDeviceInfo, 'deviceId' | 'label'>
  ): AudioInputDevice {
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
      // Insert input gain so external microphones can be attenuated
      // or boosted without screaming into the analyser. Default value
      // mirrors the current micInputGain() signal (defaults to 1).
      this.inputGainNode = this.audioContext.createGain();
      this.inputGainNode.gain.value = this.micInputGain();
      this.sourceNode.connect(this.inputGainNode);
      this.inputGainNode.connect(this.analyserNode);

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
      try {
        this.sourceNode.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    if (this.inputGainNode) {
      try {
        this.inputGainNode.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.isInitialized.set(false);
    this.mediaStream = null;
    this.audioContext = null;
    this.analyserNode = null;
    this.sourceNode = null;
    this.inputGainNode = null;
  }

  /**
   * Adjust the microphone input gain. Pass 0 to mute, 1 for unity
   * gain (default), or up to 2 for +6 dB of clean boost. Updates
   * the live inputGainNode immediately so the user hears the change.
   */
  setMicGain(value: number): void {
    const clamped = Math.max(0, Math.min(2, value));
    this.micInputGain.set(clamped);
    if (this.inputGainNode && this.audioContext) {
      try {
        this.inputGainNode.gain.setTargetAtTime(
          clamped,
          this.audioContext.currentTime,
          0.02
        );
      } catch {
        // AudioContext might be closed — fall back to direct value
        try {
          this.inputGainNode.gain.value = clamped;
        } catch {
          /* node was disposed */
        }
      }
    }
  }

  /**
   * Switch to a different audio-input device by re-initializing the
   * MediaStream with the specified deviceId. Safe to call while
   * recording is paused. convenience helper for the Studio IO panel
   * and any auto-routing logic.
   */
  async setInputDevice(deviceId: string): Promise<void> {
    if (!deviceId) return;
    return this.initialize(deviceId);
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
