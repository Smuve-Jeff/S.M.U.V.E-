import { LoggingService } from './logging.service';
import { AudioEngineService } from './audio-engine.service';
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
  private readonly audioEngine = inject(AudioEngineService);
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  /** Pre-analyser input gain so external mics / interfaces can be
   *  attenuated or boosted (0 = mute, 1 = unity, up to 2 = +6 dB). */
  private inputGainNode: GainNode | null = null;

  /** MediaStreamAudioDestination fed by the finished vocal chain (if any). */
  private captureDestination: MediaStreamAudioDestinationNode | null = null;
  private captureContext: AudioContext | null = null;
  private captureSource: AudioNode | null = null;

  isInitialized = signal(false);
  isRecording = signal(false);
  isPaused = signal(false);
  recordingTime = signal(0);
  recordedBlob = signal<Blob | null>(null);
  inputLevel = signal(0);

  availableDevices = signal<AudioInputDevice[]>([]);
  selectedDeviceId = signal<string | null>(null);

  /**
   * True once a finished vocal chain (pitch correction → mastering) is wired
   * into the recorder, so takes capture the processed signal the artist
   * hears instead of the dry microphone feed.
   */
  usingProcessedCapture = signal(false);

  /** Last input error, surfaced to the UI instead of a silent no-op. */
  lastError = signal<string | null>(null);

  /** Microphone permission state, tracked to avoid surprise prompts. */
  permissionState = signal<'unknown' | 'granted' | 'denied'>('unknown');

  /** Human-readable name of the signal the recorder will capture. */
  capturePathLabel = computed(() =>
    this.usingProcessedCapture()
      ? 'Processed vocal chain'
      : 'Raw microphone input'
  );

  /** Inputs may only be swapped between takes — never mid-capture. */
  canSwitchDevice = computed(() => !this.isRecording());

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
  private levelInterval: any = null;
  private levelBuffer: Uint8Array<ArrayBuffer> | null = null;
  /** Resolver for the in-flight `stopRecording()` promise. */
  private stopResolver: ((blob: Blob | null) => void) | null = null;

  private readonly onDeviceChange = () => {
    void this.updateAvailableDevices();
  };

  constructor() {
    // Hot-plugged interfaces (USB mics, cables, virtual devices) must show up
    // without a page reload.
    navigator.mediaDevices?.addEventListener?.('devicechange', this.onDeviceChange);
    void this.updateAvailableDevices();
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
    navigator.mediaDevices?.removeEventListener?.(
      'devicechange',
      this.onDeviceChange
    );
    this.stop();
    this.stopTimer();
    this.stopLevelMonitoring();
  }

  /**
   * Re-enumerate audio inputs.
   *
   * Friendly labels ("Scarlett 2i2 USB") are only exposed once the page holds
   * microphone permission, so an anonymous list is expected before the user
   * primes the interface. Pass `requestLabels` from an explicit user action to
   * prompt for permission and upgrade the names — never on construction, which
   * would fire a permission dialog just for opening the Studio.
   */
  async updateAvailableDevices(requestLabels = false): Promise<void> {
    if (typeof window === 'undefined' || !navigator.mediaDevices) return;

    try {
      let devices = await navigator.mediaDevices.enumerateDevices();
      let audioInputs = devices.filter((d) => d.kind === 'audioinput');

      if (requestLabels && audioInputs.some((d) => !d.label)) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((t) => t.stop());
        this.permissionState.set('granted');
        devices = await navigator.mediaDevices.enumerateDevices();
        audioInputs = devices.filter((d) => d.kind === 'audioinput');
      }

      const described = audioInputs.map((device) =>
        this.describeDevice(device)
      );
      this.availableDevices.set(described);

      // Keep the current selection when the device is still present; only
      // fall back to the first input when it disappeared (unplugged interface).
      const current = this.selectedDeviceId();
      if (!current || !described.some((d) => d.deviceId === current)) {
        this.selectedDeviceId.set(described[0]?.deviceId ?? null);
      }
    } catch (error) {
      const name = (error as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        this.permissionState.set('denied');
      }
      this.lastError.set(
        name === 'NotAllowedError'
          ? 'Microphone permission is required to list inputs'
          : 'Could not list audio inputs'
      );
      this.logger.error('Error enumerating audio devices:', error);
    }
  }

  /** Explicit user-triggered rescan that also upgrades device labels. */
  async refreshDevices(): Promise<void> {
    return this.updateAvailableDevices(true);
  }

  async initialize(deviceId?: string): Promise<boolean> {
    if (typeof window === 'undefined' || !navigator.mediaDevices) {
      this.lastError.set('Audio input is unavailable in this environment');
      return false;
    }

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
      // Use the Studio's shared context so the vocal processing graph can
      // legally receive the microphone analyser node. Web Audio nodes from
      // different contexts cannot be connected to one another.
      this.audioContext = this.audioEngine.ctx;
      await this.audioContext.resume().catch(() => undefined);

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
      this.lastError.set(null);
      this.permissionState.set('granted');
      this.startLevelMonitoring();
      if (deviceId) this.selectedDeviceId.set(deviceId);
      this.logger.info(
        'MicrophoneService (High Quality) initialized:',
        deviceId || 'default'
      );
      // Permission is now granted, so anonymous device labels can be upgraded
      // to real names without asking the user twice.
      void this.updateAvailableDevices();
      return true;
    } catch (error) {
      const name = (error as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        this.permissionState.set('denied');
        this.lastError.set('Microphone permission denied');
      } else if (name === 'OverconstrainedError' || name === 'NotFoundError') {
        this.lastError.set(
          'Selected input is unavailable — pick another microphone'
        );
      } else {
        this.lastError.set('Could not open the selected microphone');
      }
      this.logger.error('Error initializing microphone service:', error);
      this.isInitialized.set(false);
      return false;
    }
  }

  // ── Live input metering ──────────────────────────────────

  /**
   * Drive `inputLevel` (0–100 %) from the analyser. Without this the meters in
   * the Mic Interface and Vocal Suite would always read zero.
   */
  private startLevelMonitoring(): void {
    this.stopLevelMonitoring();
    this.levelInterval = setInterval(() => this.sampleInputLevel(), 50);
  }

  private stopLevelMonitoring(): void {
    if (this.levelInterval) {
      clearInterval(this.levelInterval);
      this.levelInterval = null;
    }
    this.levelBuffer = null;
    this.inputLevel.set(0);
  }

  /** Window peak mapped from a -60 dBFS floor to a 0–100 % readout. */
  private sampleInputLevel(): void {
    const analyser = this.analyserNode;
    if (!analyser) return;
    if (
      !this.levelBuffer ||
      this.levelBuffer.length !== analyser.fftSize
    ) {
      this.levelBuffer = new Uint8Array(analyser.fftSize);
    }
    analyser.getByteTimeDomainData(this.levelBuffer);

    let peak = 0;
    for (let i = 0; i < this.levelBuffer.length; i++) {
      const amplitude = Math.abs(this.levelBuffer[i] - 128) / 128;
      if (amplitude > peak) peak = amplitude;
    }

    const db = peak > 0 ? 20 * Math.log10(peak) : -60;
    const percent = ((db + 60) / 60) * 100;
    this.inputLevel.set(Math.max(0, Math.min(100, Math.round(percent))));
  }

  /**
   * Prefer the processed vocal chain over the dry input when one is attached,
   * so takes capture the pitch-corrected, mastered signal the artist hears.
   */
  private activeRecordingStream(): MediaStream | null {
    return this.captureDestination?.stream ?? this.mediaStream;
  }

  /**
   * Route the finished vocal chain into the recorder's capture bus.   * Safe to call repeatedly with the same node — the previous feed is
   * replaced instead of summed, which would otherwise double the signal.
   */
  attachProcessedCapture(node?: AudioNode | null): boolean {
    const ctx = this.audioContext ?? this.audioEngine.ctx;
    if (!node || !ctx) {
      this.detachProcessedCapture();
      return false;
    }
    if (node.context && node.context !== ctx) {
      this.logger.warn(
        'MicrophoneService: processed chain belongs to another AudioContext'
      );
      return false;
    }

    try {
      if (!this.captureDestination || this.captureContext !== ctx) {
        this.captureDestination = ctx.createMediaStreamDestination();
        this.captureContext = ctx;
        this.captureSource = null;
      }
      if (this.captureSource && this.captureSource !== node) {
        try {
          this.captureSource.disconnect(this.captureDestination);
        } catch {
          /* already disconnected */
        }
      }
      if (this.captureSource !== node) {
        node.connect(this.captureDestination);
        this.captureSource = node;
      }
      this.usingProcessedCapture.set(true);
      return true;
    } catch (error) {
      this.logger.warn(
        'MicrophoneService: could not tap the processed vocal chain',
        error
      );
      this.detachProcessedCapture();
      return false;
    }
  }

  /** Stop feeding the processed chain into the recorder (raw input resumes). */
  detachProcessedCapture(): void {
    if (this.captureSource && this.captureDestination) {
      try {
        this.captureSource.disconnect(this.captureDestination);
      } catch {
        /* already disconnected */
      }
    }
    this.captureSource = null;
    this.usingProcessedCapture.set(false);
  }

  startRecording(): void {
    const stream = this.activeRecordingStream();
    if (!stream || !this.isInitialized()) return;

    // Each take must start from zero — otherwise the elapsed readout keeps
    // climbing across recordings.
    this.recordingTime.set(0);

    // Never leave a previous stop() promise hanging if a new take starts.
    const pendingStop = this.stopResolver;
    this.stopResolver = null;
    pendingStop?.(null);

    this.chunks = [];    const mimeCandidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ];
    const mimeType = mimeCandidates.find((type) =>
      typeof MediaRecorder.isTypeSupported !== 'function' ||
      MediaRecorder.isTypeSupported(type)
    );
    const options = mimeType ? { mimeType } : undefined;

    try {
      this.mediaRecorder = options
        ? new MediaRecorder(stream, options)
        : new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, {
          type: this.mediaRecorder?.mimeType || mimeType || 'audio/webm',
        });
        this.recordedBlob.set(blob);
        this.isRecording.set(false);
        this.isPaused.set(false);
        this.stopTimer();
        const resolve = this.stopResolver;
        this.stopResolver = null;
        resolve?.(blob);
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

  /**
   * Stop the take and resolve with the finalized blob once the recorder has
   * flushed its last chunk. Callers that only want the side effect can ignore
   * the promise. Resolves with the current blob (or null) when nothing is
   * running.
   */
  stopRecording(): Promise<Blob | null> {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      return Promise.resolve(this.recordedBlob());
    }

    const promise = new Promise<Blob | null>((resolve) => {
      this.stopResolver = resolve;
    });

    try {
      this.mediaRecorder.stop();
    } catch (error) {
      this.logger.warn('Failed to stop the recorder', error);
      this.stopResolver = null;
      this.isRecording.set(false);
      this.isPaused.set(false);
      this.stopTimer();
      return Promise.resolve(null);
    }

    return promise;
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
    this.stopLevelMonitoring();
    // Only the feed edge is dropped here: the capture destination is kept so an
    // in-flight MediaRecorder.stop() can still flush its final chunk.
    this.detachProcessedCapture();
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
    if (this.analyserNode) {
      try {
        this.analyserNode.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    // The shared Studio context belongs to AudioEngineService; close only the
    // input graph, never the global transport context.
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
   * MediaStream with the specified deviceId. Refused mid-take: tearing the
   * stream down while MediaRecorder is running would truncate the take, so the
   * caller is expected to stop recording first (see `canSwitchDevice`).
   */
  async setInputDevice(deviceId: string): Promise<boolean> {
    if (!deviceId) return false;
    if (this.isRecording()) {
      this.lastError.set('Stop the take before switching microphones');
      this.logger.warn(
        'MicrophoneService: input switch refused while recording'
      );
      return false;
    }
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
