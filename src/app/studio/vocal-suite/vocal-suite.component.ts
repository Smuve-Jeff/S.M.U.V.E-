import {
  Component,
  signal,
  inject,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { UIService } from '../../services/ui.service';
import { MicrophoneService } from '../../services/microphone.service';
import { StudioRecordingEngineService } from '../studio-recording-engine.service';
import { PitchCorrectionService } from '../pitch-correction.service';
import { VocalMasteringService } from '../../services/vocal-mastering.service';
import { VocalAiService } from '../../services/vocal-ai.service';
import { AiService } from '../../services/ai.service';
import { UplinkService } from '../../services/uplink.service';
import { UserProfileService } from '../../services/user-profile.service';
import { HardwareService } from '../../services/hardware.service';
import { HapticService } from '../../services/haptic.service';
import { UplinkConsoleComponent } from '../../components/uplink-console/uplink-console.component';
import { FormsModule } from '@angular/forms';
import { MicrophoneInterfaceComponent } from '../microphone-interface/microphone-interface.component';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioEngineLatencyService } from '../../services/audio-engine-latency.service';
import { LoggingService } from '../../services/logging.service';
import { SnackbarService } from '../../services/snackbar.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { WavEncoder } from '../wav-encoder.util';
import { peakNormalizeInPlace, trimSilenceEdges } from '../take-edit.util';

type ViewMode = 'pipeline' | 'console';
type PipelineStep = 'setup' | 'record' | 'edit' | 'master';

@Component({
  selector: 'app-vocal-suite',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MicrophoneInterfaceComponent,
    UplinkConsoleComponent,
  ],
  templateUrl: './vocal-suite.component.html',
  styleUrls: ['./vocal-suite.component.css', '../shared/platform-ux.css'],
})
export class VocalSuiteComponent implements AfterViewInit, OnDestroy {
  public readonly uiService = inject(UIService);
  public readonly micService = inject(MicrophoneService);
  public readonly recordingEngine = inject(StudioRecordingEngineService);
  public readonly pitchCorrection = inject(PitchCorrectionService);
  public readonly mastering = inject(VocalMasteringService);
  public readonly vocalAi = inject(VocalAiService);
  public readonly aiService = inject(AiService);
  private uplinkService = inject(UplinkService);
  private profileService = inject(UserProfileService);
  private musicManager = inject(MusicManagerService);
  private engineLatency = inject(AudioEngineLatencyService);
  private audioEngine = inject(AudioEngineService);
  private logger = inject(LoggingService);
  private snackbar = inject(SnackbarService);
  public readonly hardware = inject(HardwareService);
  private readonly haptic = inject(HapticService);
  showUplink = signal(false);

  // ── Take editing / routing ──────────────────────────────
  /** Number of takes already committed to the arrangement. */
  takeNumber = signal(0);
  /** Route every finished take into the arrangement automatically. */
  autoRouteTakes = signal(true);
  /** True while an offline take edit is running. */
  isProcessingTake = signal(false);
  /** Last take status message, shown in the Edit step. */
  takeStatus = signal<string | null>(null);
  /** Envelope of the loaded take, drawn by the Edit-step waveform. */
  takeEnvelope = signal<number[]>([]);
  /** Working (edited) take buffer; null until a take has been decoded. */
  private editedTake: AudioBuffer | null = null;

  @ViewChild('spectrograph') spectrographRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('waveformCanvas') waveformRef!: ElementRef<HTMLCanvasElement>;

  viewMode = signal<ViewMode>('pipeline');
  currentStep = signal<PipelineStep>('setup');

  isBypassed = signal(false);
  activeMasteringTab = signal<'eq' | 'comp' | 'exciter' | 'limiter'>('eq');

  // ── Monitor + De-Esser ──────────────────────────────────
  /**
   * Input monitoring state. The mastering chain is permanently wired to the
   * studio master bus, so this is a real mute of the monitoring path rather
   * than a cosmetic switch — the old "Monitor" button had no handler at all.
   */
  monitorEnabled = signal(true);

  /** De-Esser state, read straight off the live mastering parameters. */
  deEsserEnabled = computed(
    () => !this.mastering.params().deesser.bypass
  );

  toggleMonitor(): void {
    this.haptic.light();
    const next = !this.monitorEnabled();
    try {
      if (next) {
        this.mastering.getOutputNode().connect(this.audioEngine.masterGain);
      } else {
        this.mastering.getOutputNode().disconnect(this.audioEngine.masterGain);
      }
      this.monitorEnabled.set(next);
      this.snackbar.info(next ? 'Input monitoring ON' : 'Input monitoring muted');
    } catch (err) {
      // disconnect() throws when the node was not connected — keep the UI in
      // sync with the graph rather than leaving a lying toggle.
      this.monitorEnabled.set(!next);
      this.logger.warn('VocalSuite: monitor toggle failed', err);
    }
  }

  /** Bypass/enable the de-esser inside the live vocal mastering chain. */
  toggleDeEsser(): void {
    this.haptic.light();
    const current = this.mastering.params().deesser;
    this.mastering.updateParams({
      deesser: { ...current, bypass: !current.bypass },
    });
    this.snackbar.info(
      current.bypass ? 'Neural De-Esser engaged' : 'Neural De-Esser bypassed'
    );
  }



  private animationId?: number;
  private ctx2d?: CanvasRenderingContext2D;
  private waveformCtx?: CanvasRenderingContext2D;

  private waveformData: number[] = [];

  recordingTimeFormatted = computed(() => {
    const s = Math.floor(this.micService.recordingTime());
    const m = Math.floor(s / 60);
    const secs = s % 60;
    const ms = Math.floor((this.micService.recordingTime() % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
  });

  constructor() {
    effect(() => {
      this.mastering.updateNodes();
    });
  }

  ngAfterViewInit() {
    this.initCanvases();
    this.startVisualization();
  }

  ngOnDestroy() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
  }

  private initCanvases() {
    if (this.spectrographRef) {
      this.ctx2d = this.spectrographRef.nativeElement.getContext('2d')!;
    }
    if (this.waveformRef) {
      this.waveformCtx = this.waveformRef.nativeElement.getContext('2d')!;
    }
  }

  setStep(step: PipelineStep) {
    this.currentStep.set(step);
    if (step === 'record' && !this.micService.isInitialized()) {
      this.initializeMic();
    }
  }

  async initializeMic() {
    const deviceId = this.micService.selectedDeviceId();
    const ready = await this.micService.initialize(deviceId || undefined);
    if (!ready) return;
    const node = this.micService.getAnalyserNode();
    if (node) {
      // Route the mic through the real-time pitch-correction stage first; the
      // service falls back to a clean bypass when the worklet is unavailable.
      const corrected = await this.pitchCorrection.insertIntoChain(node);
      this.mastering.applyToSource(corrected ?? node);
      // Takes must capture the chain the artist hears (pitch correction +
      // mastering), not the dry microphone feed.
      this.micService.attachProcessedCapture(this.mastering.getOutputNode());
    }
  }

  async toggleRecording() {
    if (this.micService.isRecording()) {
      const blob = await this.micService.stopRecording();
      if (blob && this.autoRouteTakes()) {
        // A fresh take replaces any edits from the previous one.
        this.editedTake = null;
        this.takeEnvelope.set([]);
        this.takeStatus.set(null);
        await this.routeTakeToArrangement();
      }
      return;
    }
    if (!this.micService.isInitialized()) {
      // Prime the input + vocal chain on first record so a take is never
      // silently captured from a dead graph.
      await this.initializeMic();
      if (!this.micService.isInitialized()) return;
    }
    this.waveformData = [];
    this.micService.startRecording();
  }

  toggleAutoRoute(): void {
    this.autoRouteTakes.update((v) => !v);
  }

  // ── Take editing ─────────────────────────────────────────

  /** Decode the current take once; edits then work on the same buffer. */
  private async resolveTakeBuffer(): Promise<AudioBuffer | null> {
    if (this.editedTake) return this.editedTake;
    const blob = this.micService.recordedBlob();
    if (!blob) return null;
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = await this.audioEngine.ctx.decodeAudioData(arrayBuffer);
      this.editedTake = buffer;
      return buffer;
    } catch (error) {
      this.logger.error('VocalSuite: could not decode the take', error);
      this.snackbar.error('Could not read the take — try recording again');
      return null;
    }
  }

  /** Load the take, run one edit and report the outcome. */
  private async editTake(
    label: string,
    edit: (buffer: AudioBuffer) => string
  ): Promise<string | null> {
    if (this.isProcessingTake()) return null;
    this.isProcessingTake.set(true);
    this.takeStatus.set(label);
    try {
      const buffer = await this.resolveTakeBuffer();
      if (!buffer) {
        this.takeStatus.set('Record a take first');
        this.snackbar.error('Record a take first');
        return null;
      }
      const status = edit(buffer);
      this.takeStatus.set(status);
      this.takeEnvelope.set(this.computeEnvelope(buffer));
      this.snackbar.success(status);
      return status;
    } catch (error) {
      this.logger.error('VocalSuite: take edit failed', error);
      this.takeStatus.set('Take edit failed');
      this.snackbar.error('Could not process the take');
      return null;
    } finally {
      this.isProcessingTake.set(false);
    }
  }

  /** Peak-normalize the take to -1 dBFS. */
  async normalizeTake(): Promise<string | null> {
    return this.editTake('Normalizing take…', (buffer) => {
      const gain = peakNormalizeInPlace(buffer, -1);
      return gain === 1
        ? 'Take is silent — nothing to normalize'
        : `Normalized to -1 dBFS (×${gain.toFixed(2)})`;
    });
  }

  /** Trim silent head/tail from the take, keeping 20 ms of room tone. */
  async trimTakeSilence(): Promise<string | null> {
    return this.editTake('Trimming silence…', (buffer) => {
      const before = buffer.duration;
      const trimmed = trimSilenceEdges(
        buffer,
        this.audioEngine.ctx,
        -50,
        20
      );
      if (trimmed === buffer) return 'No silent edges to trim';
      this.editedTake = trimmed;
      return `Trimmed ${(before - trimmed.duration).toFixed(2)}s of silence`;
    });
  }

  // ── Take routing ─────────────────────────────────────────

  /** Commit the current take to the arrangement as its own audio track. */
  async routeTakeToArrangement(): Promise<void> {
    const buffer = await this.resolveTakeBuffer();
    if (!buffer) {
      this.snackbar.error('Record a take first');
      return;
    }

    const take = this.takeNumber() + 1;
    // Recorded audio is late by the output latency; trim it before it lands on
    // the timeline so the vocal lines up with the imported instrumental.
    const compensated = this.engineLatency.trimAudioBuffer(buffer);
    this.musicManager.addAudioTrack({
      id: `vocal_take_${Date.now()}`,
      name: `Vocal Take ${take}`,
      color: '#a855f7',
      buffer: compensated,
      offset: 0,
    });
    this.takeNumber.set(take);
    this.takeStatus.set(`Vocal Take ${take} added to the arrangement`);
    this.snackbar.success(`Vocal Take ${take} added to the arrangement`);
  }

  /** Absolute peak per bucket — the Edit-step waveform for the loaded take. */
  private computeEnvelope(buffer: AudioBuffer, buckets = 160): number[] {
    const data = buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / buckets));
    const envelope: number[] = [];
    for (let b = 0; b < buckets; b++) {
      let peak = 0;
      const start = b * step;
      const end = Math.min(start + step, data.length);
      for (let i = start; i < end; i++) {
        const abs = Math.abs(data[i]);
        if (abs > peak) peak = abs;
      }
      envelope.push(peak);
    }
    return envelope;
  }

  /** Encode the working take as a real 16-bit WAV. */
  private encodeTake(buffer: AudioBuffer): Blob {
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      channels.push(buffer.getChannelData(ch));
    }
    return WavEncoder.encodeMultiChannel(channels, 'wav-16', buffer.sampleRate);
  }

  private startVisualization() {
    const draw = () => {
      this.drawSpectrograph();
      this.drawWaveform();
      this.animationId = requestAnimationFrame(draw);
    };
    draw();
  }

  private drawSpectrograph() {
    const canvas = this.spectrographRef?.nativeElement;
    if (!canvas || !this.ctx2d || !this.micService.isInitialized()) return;

    const analyser = this.micService.getAnalyserNode();
    if (!analyser) return;

    const width = canvas.width;
    const height = canvas.height;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    this.ctx2d.clearRect(0, 0, width, height);

    const barWidth = (width / bufferLength) * 2.5;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * height;
      const gradient = this.ctx2d.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, '#07060d');
      gradient.addColorStop(0.25, '#ff007f');
      gradient.addColorStop(0.55, '#8b5cf6');
      gradient.addColorStop(1, '#00e5ff');

      this.ctx2d.fillStyle = gradient;
      this.ctx2d.fillRect(x, height - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }
  }

  private drawWaveform() {
    const canvas = this.waveformRef?.nativeElement;
    if (!canvas || !this.waveformCtx) return;

    // Once a take is loaded (and the mic is idle) the Edit-step waveform shows
    // the actual take, refreshed after every normalize/trim.
    const envelope = this.takeEnvelope();
    if (!this.micService.isRecording() && envelope.length > 0) {
      this.drawTakeEnvelope(canvas, envelope);
      return;
    }

    const analyser = this.micService.getAnalyserNode();
    if (this.micService.isRecording() && analyser) {
      const dataArray = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = dataArray[i] / 128.0 - 1;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      this.waveformData.push(rms);
      if (this.waveformData.length > 500) this.waveformData.shift();
    }

    const width = canvas.width;
    const height = canvas.height;
    this.waveformCtx.clearRect(0, 0, width, height);

    this.waveformCtx.beginPath();
    this.waveformCtx.strokeStyle = '#a855f7';
    this.waveformCtx.lineWidth = 2;

    const step = width / 500;
    for (let i = 0; i < this.waveformData.length; i++) {
      const x = i * step;
      const barH = this.waveformData[i] * height * 2;
      this.waveformCtx.fillStyle = '#a855f7';
      this.waveformCtx.fillRect(
        x,
        (height - barH) / 2,
        step - 1,
        Math.max(2, barH)
      );
    }
    this.waveformCtx.stroke();
  }

  /** Envelope view of the loaded take for the Edit step. */
  private drawTakeEnvelope(
    canvas: HTMLCanvasElement,
    envelope: number[]
  ): void {
    const ctx = this.waveformCtx;
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const mid = height / 2;
    const step = width / Math.max(1, envelope.length);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#a855f7';
    for (let i = 0; i < envelope.length; i++) {
      const barH = Math.max(2, envelope[i] * mid * 1.8);
      ctx.fillRect(i * step, mid - barH / 2, Math.max(1, step - 1), barH);
    }

    ctx.strokeStyle = 'rgba(168, 85, 247, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();
  }

  async downloadRecording() {
    // Export what the artist edited, encoded as real WAV — not the raw webm
    // capture with a .wav filename.
    const buffer = await this.resolveTakeBuffer();
    const blob = buffer
      ? this.encodeTake(buffer)
      : this.micService.recordedBlob();
    if (!blob) return;

    this.showUplink.set(true);
    const success = await this.uplinkService.initiateUplink(
      this.profileService.profile()
    );
    if (!success) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SMUVE_Vocal_${Date.now()}${buffer ? '.wav' : '.webm'}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
