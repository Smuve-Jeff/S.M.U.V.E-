import {
  Component,
  Input,
  ViewChild,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import { MicrophoneService } from '../../services/microphone.service';
import { VocalMasteringService } from '../../services/vocal-mastering.service';
import { StudioRecordingEngineService } from '../studio-recording-engine.service';

type VocalProfile = 'crystal' | 'broadcast' | 'warmth';

/** Log-spaced bars in the spectrum view. */
const SPECTRUM_BARS = 48;
/** Lowest / highest frequency the spectrum covers, in Hz. */
const SPECTRUM_MIN_HZ = 40;
const SPECTRUM_MAX_HZ = 16000;

@Component({
  selector: 'app-microphone-interface',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './microphone-interface.component.html',
  styleUrls: ['./microphone-interface.component.css'],
})
export class MicrophoneInterfaceComponent implements AfterViewInit, OnDestroy {
  private readonly audioSession = inject(AudioSessionService);
  public readonly micService = inject(MicrophoneService); // Legacy support if needed
  public readonly recordingEngine = inject(StudioRecordingEngineService);
  public readonly mastering = inject(VocalMasteringService);

  @Input() mode: 'compact' | 'full' = 'full';

  selectedChannelId = signal<string | null>(null);
  vocalProfile = signal<VocalProfile>('crystal');

  channels = this.audioSession.micChannels;
  devices = this.micService.availableDevices;
  params = this.mastering.params;

  // Mirror microphone service state
  inputLevel = this.micService.inputLevel;
  isRecording = this.micService.isRecording;
  isPaused = this.micService.isPaused;
  recordingTime = this.micService.recordingTime;
  lastError = this.micService.lastError;
  capturePathLabel = this.micService.capturePathLabel;
  canSwitchDevice = this.micService.canSwitchDevice;
  permissionState = this.micService.permissionState;
  isScanning = signal(false);

  // ── Spectrum analyzer ────────────────────────────────────
  @ViewChild('micSpectrum') spectrumRef?: ElementRef<HTMLCanvasElement>;
  private spectrumCtx: CanvasRenderingContext2D | null = null;
  private spectrumFrame: number | null = null;
  private spectrumBins: Uint8Array<ArrayBuffer> | null = null;
  private readonly spectrumLevels = new Float32Array(SPECTRUM_BARS);
  private readonly spectrumPeaks = new Float32Array(SPECTRUM_BARS);

  /** Actionable readout under the spectrum — never a dead graph. */
  spectrumHint = computed(() => {
    if (this.lastError()) return 'Input error — check the device above';
    if (!this.micService.isInitialized()) {
      return 'Press Connect chain to see the live spectrum';
    }
    return this.inputLevel() > 2
      ? 'Live signal — interface is feeding the Studio'
      : 'Waiting for signal — raise the gain or move closer';
  });

  currentChannel = computed(
    () =>
      this.channels().find(
        (channel) => channel.id === this.selectedChannelId()
      ) ??
      this.channels()[0] ??
      null
  );

  deviceSummary = computed(() => {
    const currentDeviceId =
      this.currentChannel()?.deviceId ?? this.micService.selectedDeviceId();
    return (
      this.devices().find((device) => device.deviceId === currentDeviceId) ??
      this.devices()[0] ??
      null
    );
  });

  signalReadiness = computed(() => {
    if (this.isRecording()) return 'recording';
    if (this.micService.isInitialized()) return 'ready';
    return 'offline';
  });

  clarityScore = computed(() => {
    const params = this.params();
    const airLift = Math.max(0, params.eq.high + 12) * 1.5;
    const presence = Math.max(0, params.eq.mid + 12);
    const exciter = params.exciter.amount * 100;
    const deesser = Math.max(0, (-params.deesser.threshold - 10) * 2);
    return Math.round(
      Math.min(100, 45 + airLift + presence + exciter + deesser)
    );
  });

  constructor() {
    effect(() => {
      if (this.selectedChannelId()) {
        return;
      }
      const preferredChannel =
        this.channels().find((channel) => channel.armed) ?? this.channels()[0];
      if (preferredChannel) {
        this.selectedChannelId.set(preferredChannel.id);
      }
    });
  }

  ngAfterViewInit(): void {
    this.startSpectrum();
  }

  ngOnDestroy(): void {
    if (this.spectrumFrame !== null) {
      cancelAnimationFrame(this.spectrumFrame);
      this.spectrumFrame = null;
    }
  }

  // ── Spectrum rendering ───────────────────────────────────

  private startSpectrum(): void {
    const canvas = this.spectrumRef?.nativeElement;
    if (!canvas) return;
    this.spectrumCtx = canvas.getContext('2d');
    if (!this.spectrumCtx) return;

    const draw = () => {
      this.spectrumFrame = requestAnimationFrame(draw);
      this.drawSpectrum();
    };
    this.spectrumFrame = requestAnimationFrame(draw);
  }

  private drawSpectrum(): void {
    const canvas = this.spectrumRef?.nativeElement;
    const ctx = this.spectrumCtx;
    if (!canvas || !ctx) return;

    const analyser = this.micService.getAnalyserNode();
    if (!analyser || typeof analyser.getByteFrequencyData !== 'function') {
      return;
    }

    // Track the laid-out size without thrashing the backing store each frame.
    const targetWidth = canvas.clientWidth || canvas.width;
    const targetHeight = canvas.clientHeight || canvas.height;
    if (targetWidth !== canvas.width) canvas.width = targetWidth;
    if (targetHeight !== canvas.height) canvas.height = targetHeight;

    if (
      !this.spectrumBins ||
      this.spectrumBins.length !== analyser.frequencyBinCount
    ) {
      this.spectrumBins = new Uint8Array(analyser.frequencyBinCount);
    }
    analyser.getByteFrequencyData(this.spectrumBins);

    const width = canvas.width;
    const height = canvas.height;
    if (width <= 0 || height <= 0) return;

    const sampleRate =
      (analyser as any).context?.sampleRate ?? 48000;
    const binHz = sampleRate / Math.max(1, analyser.fftSize);
    const lastBin = this.spectrumBins.length - 1;
    const fMax = Math.min(SPECTRUM_MAX_HZ, sampleRate / 2);
    const ratio = fMax / SPECTRUM_MIN_HZ;

    for (let bar = 0; bar < SPECTRUM_BARS; bar++) {
      const f0 = SPECTRUM_MIN_HZ * Math.pow(ratio, bar / SPECTRUM_BARS);
      const f1 = SPECTRUM_MIN_HZ * Math.pow(ratio, (bar + 1) / SPECTRUM_BARS);
      const b0 = Math.max(0, Math.min(lastBin, Math.floor(f0 / binHz)));
      const b1 = Math.max(
        b0 + 1,
        Math.min(this.spectrumBins.length, Math.floor(f1 / binHz))
      );

      let sum = 0;
      for (let i = b0; i < b1; i++) sum += this.spectrumBins[i];
      // Square the average so the display reads closer to perceived loudness.
      const level = Math.pow(sum / (b1 - b0) / 255, 2);

      this.spectrumLevels[bar] = level;
      this.spectrumPeaks[bar] = Math.max(level, this.spectrumPeaks[bar] * 0.94);
    }

    ctx.clearRect(0, 0, width, height);

    // dB gridlines give the trace a reference instead of floating bars.
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.lineWidth = 1;
    for (const line of [0.25, 0.5, 0.75]) {
      const y = height * line;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const barWidth = width / SPECTRUM_BARS;
    const gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, '#0e7490');
    gradient.addColorStop(0.55, '#22d3ee');
    gradient.addColorStop(1, '#c026d3');

    for (let bar = 0; bar < SPECTRUM_BARS; bar++) {
      const x = bar * barWidth;
      const w = Math.max(1, barWidth - 1);
      const h = Math.max(1, this.spectrumLevels[bar] * height);

      ctx.fillStyle = gradient;
      ctx.fillRect(x, height - h, w, h);

      // Peak-hold cap so transients stay readable.
      const peakY = height - this.spectrumPeaks[bar] * height;
      ctx.fillStyle = 'rgba(244, 114, 182, 0.9)';
      ctx.fillRect(x, Math.max(0, peakY - 1.5), w, 1.5);
    }

    // Frequency landmarks on the log scale.
    ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.font = '9px monospace';
    for (const hz of [100, 1000, 10000]) {
      const x = (Math.log(hz / SPECTRUM_MIN_HZ) / Math.log(ratio)) * width;
      if (x <= 0 || x >= width - 18) continue;
      const label = hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
      ctx.fillText(label, x + 2, height - 2);
    }
  }

  stopTrackSelection(event: Event): void {
    event.stopPropagation();
  }

  selectChannel(channelId: string): void {
    this.selectedChannelId.set(channelId);
  }

  async initializeInterface(deviceId?: string): Promise<void> {
    const activeChannel = this.currentChannel();
    const resolvedDeviceId =
      deviceId ??
      activeChannel?.deviceId ??
      this.micService.selectedDeviceId() ??
      this.devices()[0]?.deviceId;

    if (activeChannel && resolvedDeviceId) {
      this.audioSession.updateChannelDevice(activeChannel.id, resolvedDeviceId);
    }

    const ready = await this.micService.initialize(resolvedDeviceId);
    if (!ready) return;
    if (activeChannel && !activeChannel.armed) {
      this.audioSession.toggleChannelArm(activeChannel.id);
    }
    const analyserNode = this.micService.getAnalyserNode();
    if (analyserNode) {
      this.mastering.applyToSource(analyserNode);
      // Record the mastered signal, not the dry mic feed.
      this.micService.attachProcessedCapture(this.mastering.getOutputNode());
    }
  }

  async updateDevice(deviceId: string): Promise<void> {
    if (!deviceId) return;
    if (!this.canSwitchDevice()) {
      return;
    }
    await this.initializeInterface(deviceId);
  }

  /** Rescan for hot-plugged interfaces and upgrade anonymous device labels. */
  async rescanDevices(): Promise<void> {
    this.isScanning.set(true);
    try {
      await this.micService.refreshDevices();
    } finally {
      this.isScanning.set(false);
    }
  }

  async toggleRecording(): Promise<void> {
    if (!this.micService.isInitialized()) {
      await this.initializeInterface();
      if (!this.micService.isInitialized()) return;
    }

    if (this.isRecording()) {
      this.micService.stopRecording();
    } else {
      this.micService.startRecording();
    }
  }

  togglePause(): void {
    if (this.isPaused()) {
      this.micService.resumeRecording();
    } else {
      this.micService.pauseRecording();
    }
  }

  toggleMute(): void {
    const activeChannel = this.currentChannel();
    if (activeChannel) {
      this.audioSession.toggleChannelMute(activeChannel.id);
    }
  }

  toggleArm(): void {
    const activeChannel = this.currentChannel();
    if (activeChannel) {
      this.audioSession.toggleChannelArm(activeChannel.id);
    }
  }

  updatePan(value: number): void {
    const activeChannel = this.currentChannel();
    if (activeChannel) {
      this.audioSession.updateChannelPan(activeChannel.id, value);
    }
  }

  applyVocalProfile(profile: VocalProfile): void {
    this.vocalProfile.set(profile);

    if (profile === 'broadcast') {
      this.mastering.updateParams({
        deesser: { ...this.params().deesser, threshold: -20, frequency: 6200 },
        eq: { ...this.params().eq, low: -2, mid: 3, high: 4 },
        exciter: { ...this.params().exciter, amount: 0.18, frequency: 7600 },
        limiter: { ...this.params().limiter, ceiling: -1.2, release: 0.12 },
        multiband: {
          ...this.params().multiband,
          mid: { ...this.params().multiband.mid, threshold: -16, ratio: 3.1 },
        },
      });
      return;
    }

    if (profile === 'warmth') {
      this.mastering.updateParams({
        deesser: { ...this.params().deesser, threshold: -25, frequency: 5800 },
        eq: { ...this.params().eq, low: 2, mid: 1.5, high: 1.5 },
        exciter: { ...this.params().exciter, amount: 0.1, frequency: 6800 },
        limiter: { ...this.params().limiter, ceiling: -1.5, release: 0.16 },
        multiband: {
          ...this.params().multiband,
          mid: { ...this.params().multiband.mid, threshold: -18, ratio: 2.4 },
        },
      });
      return;
    }

    this.mastering.updateParams({
      deesser: { ...this.params().deesser, threshold: -22, frequency: 6500 },
      eq: { ...this.params().eq, low: 0, mid: 2.2, high: 5 },
      exciter: { ...this.params().exciter, amount: 0.16, frequency: 8200 },
      limiter: { ...this.params().limiter, ceiling: -1, release: 0.1 },
      multiband: {
        ...this.params().multiband,
        mid: { ...this.params().multiband.mid, threshold: -17, ratio: 2.8 },
      },
    });
  }

  updatePresence(value: number): void {
    this.mastering.updateParams({
      eq: { ...this.params().eq, mid: value },
    });
  }

  updateAir(value: number): void {
    this.mastering.updateParams({
      eq: { ...this.params().eq, high: value },
    });
  }

  updateDeesser(value: number): void {
    this.mastering.updateParams({
      deesser: { ...this.params().deesser, threshold: value },
    });
  }

  updateExciter(value: number): void {
    this.mastering.updateParams({
      exciter: { ...this.params().exciter, amount: value / 100 },
    });
  }

  capabilityLabel(value: string): string {
    return value.replace(/-/g, ' ');
  }
}
