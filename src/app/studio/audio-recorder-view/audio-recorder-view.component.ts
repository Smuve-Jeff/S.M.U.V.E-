import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ViewChild,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioRecorderService, RecordingItem } from '../audio-recorder.service';
import { HapticService } from '../../services/haptic.service';
import { SnackbarService } from '../../services/snackbar.service';
import { LoggingService } from '../../services/logging.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { InteractionDialogService } from '../../services/interaction-dialog.service';
import { AudioEngineLatencyService } from '../../services/audio-engine-latency.service';
import { StudioVisualSchedulerService } from '../shared/studio-visual-scheduler.service';
import { Subscription } from 'rxjs';

interface RecordingListEntry {
  id: string;
  name: string;
  timestamp: number;
  durationSec: number;
  url: string;
}

@Component({
  selector: 'app-audio-recorder-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './audio-recorder-view.component.html',
  styleUrls: ['./audio-recorder-view.component.css', '../shared/platform-ux.css'],
})
export class AudioRecorderViewComponent
  implements OnInit, OnDestroy, AfterViewInit
{
  public recorder = inject(AudioRecorderService);
  private haptic = inject(HapticService);
  private snackbar = inject(SnackbarService);
  private logger = inject(LoggingService);
  private dialog = inject(InteractionDialogService);
  private engineLatency = inject(AudioEngineLatencyService);
  private readonly visualScheduler = inject(StudioVisualSchedulerService);

  @ViewChild('waveformCanvas')
  waveformCanvasRef!: ElementRef<HTMLCanvasElement>;

  /** UI state */
  recordings = signal<RecordingListEntry[]>([]);
  permissionsDenied = signal(false);
  isRequestingMic = signal(false);
  currentStream: MediaStream | null = null;
  elapsedSec = signal(0);
  inputLevel = signal(-60);
  private elapsedTaskCleanup: (() => void) | null = null;
  private startedAt = 0;
  private levelTaskCleanup: (() => void) | null = null;
  private analyserNode: AnalyserNode | null = null;
  private meterSourceNode: MediaStreamAudioSourceNode | null = null;
  private audioContext: AudioContext | null = null;
  private waveformTaskCleanup: (() => void) | null = null;
  private recordingFinishedSubscription: Subscription | null = null;
  private stopFallbackTimer: ReturnType<typeof setTimeout> | null = null;

  /** Live state bindings from service */
  isRecording = this.recorder.isRecording;
  recordingCount = computed(() => this.recordings().length);
  captureState = signal<'idle' | 'requesting' | 'recording' | 'stopping' | 'error'>('idle');
  captureError = signal<string | null>(null);
  inputDevices = signal<Array<{ deviceId: string; label: string }>>([]);
  selectedInputId = signal<string | null>(null);
  inputDeviceName = computed(() =>
    this.inputDevices().find((device) => device.deviceId === this.selectedInputId())?.label ||
    'Default microphone'
  );
  deviceSwitchLocked = computed(
    () => this.captureState() === 'recording' || this.isRecording()
  );
  capturePathLabel = signal('Raw microphone input');
  latestRecording = computed(() => this.recordings()[0] ?? null);
  captureStatusLabel = computed(() => {
    switch (this.captureState()) {
      case 'requesting':
        return 'Requesting microphone';
      case 'recording':
        return 'Recording raw input';
      case 'stopping':
        return 'Finalizing take';
      case 'error':
        return 'Capture error';
      default:
        return 'Ready to record';
    }
  });

  // ── Monitoring & Noise Gate ────────────────────────────
  monitoringEnabled = signal(false);
  noiseGateThreshold = signal(-50); // dB
  noiseGateEnabled = signal(false);
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private monitorGainNode: GainNode | null = null;
  /** Gate insert between the mic and the recorder. */
  private gateNode: GainNode | null = null;
  /** MediaStream fed to the recorder — the gated signal when wired. */
  private captureDestination: MediaStreamAudioDestinationNode | null = null;

  toggleMonitoring(): void {
    this.haptic.light();
    this.monitoringEnabled.update((v) => !v);
    if (this.monitoringEnabled() && this.currentStream && this.audioContext) {
      try {
        this.micSourceNode = this.audioContext.createMediaStreamSource(
          this.currentStream
        );
        this.monitorGainNode = this.audioContext.createGain();
        this.monitorGainNode.gain.value = 1.0;
        this.micSourceNode.connect(this.monitorGainNode);
        this.monitorGainNode.connect(this.audioContext.destination);
      } catch (err) {
        this.logger.warn('Could not enable monitoring', err);
        this.monitoringEnabled.set(false);
      }
    } else if (this.micSourceNode && this.monitorGainNode) {
      try {
        this.micSourceNode.disconnect(this.monitorGainNode);
        this.monitorGainNode.disconnect();
      } catch {
        /* already disconnected */
      }
      this.micSourceNode = null;
      this.monitorGainNode = null;
    }
    this.snackbar.info(
      this.monitoringEnabled()
        ? 'Monitoring ON — hear yourself live'
        : 'Monitoring OFF'
    );
  }

  toggleNoiseGate(): void {
    this.haptic.light();
    this.noiseGateEnabled.update((v) => !v);
    // Apply immediately so the toggle is truthful: switching off reopens the
    // gate even before the next level-meter frame.
    if (this.gateNode && this.audioContext) {
      try {
        // Arming closes the gate until the loop hears signal above threshold;
        // disarming reopens it right away.
        this.gateNode.gain.setTargetAtTime(
          this.noiseGateEnabled() ? 0 : 1,
          this.audioContext.currentTime,
          0.01
        );
      } catch {
        /* context closed */
      }
    }
    this.snackbar.info(
      this.noiseGateEnabled()
        ? `Noise gate ON (threshold: ${this.noiseGateThreshold()} dB)`
        : 'Noise gate OFF'
    );
  }

  setNoiseGateThreshold(value: number): void {
    this.noiseGateThreshold.set(Math.max(-80, Math.min(-20, value)));
  }

  // ── Export to Arrangement ───────────────────────────────
  /** Add a recorded take as an audio track in the mixer/arrangement */
  async exportToArrangement(rec: RecordingListEntry): Promise<void> {
    this.haptic.medium();
    try {
      // Fetch the recording blob and decode it
      if (!rec.url) {
        this.snackbar.error('Recording has no audio data to export');
        return;
      }
      const response = await fetch(rec.url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer =
        await this.audioEngine.ctx.decodeAudioData(arrayBuffer);
      const compensatedBuffer =
        this.engineLatency.trimAudioBuffer(audioBuffer);
      // Create a new audio track in the music manager
      const trackName = rec.name || `Take ${rec.id.slice(-4)}`;
      this.musicManager.addAudioTrack({
        id: 'audio_' + Date.now(),
        name: trackName,
        color: '#E11D48',
        buffer: compensatedBuffer,
        offset: 0,
      });
      this.snackbar.success(`"${trackName}" added to arrangement`);
    } catch (err) {
      this.logger.error('Failed to export recording to arrangement', err);
      this.snackbar.error('Could not export — try re-recording');
    }
  }

  // ── Take Naming ─────────────────────────────────────────
  renamingId = signal<string | null>(null);
  renameValue = signal('');

  startRename(rec: RecordingListEntry): void {
    this.renamingId.set(rec.id);
    this.renameValue.set(rec.name);
  }

  confirmRename(): void {
    const id = this.renamingId();
    if (!id) return;
    this.recordings.update((list) =>
      list.map((r) =>
        r.id === id ? { ...r, name: this.renameValue() || r.name } : r
      )
    );
    this.renamingId.set(null);
    this.haptic.light();
  }

  cancelRename(): void {
    this.renamingId.set(null);
  }

  private audioEngine = inject(AudioEngineService);
  private musicManager = inject(MusicManagerService);

  ngOnInit(): void {
    this.loadOfflineRecordings();
    const finished$ = (this.recorder as any).recordingFinished$;
    if (finished$?.subscribe) {
      this.recordingFinishedSubscription = finished$.subscribe((event: any) =>
        this.handleRecordingFinished(event)
      );
    }
    void this.refreshInputDevices();
  }

  ngAfterViewInit(): void {
    // Canvas is ready — waveform will start when recording begins
  }

  ngOnDestroy(): void {
    this.clearElapsedTimer();
    this.stopLevelMeter();
    this.stopWaveform();
    this.recordingFinishedSubscription?.unsubscribe();
    this.recordingFinishedSubscription = null;
    if (this.stopFallbackTimer) clearTimeout(this.stopFallbackTimer);
    this.stopFallbackTimer = null;
    this.closeAudioGraph();
    if (this.currentStream) {
      this.currentStream.getTracks().forEach((t) => t.stop());
      this.currentStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  /** Convert dBFS (-60..0) to 0-100 percentage */
  levelToPct(db: number): number {
    if (!isFinite(db) || db <= -60) return 0;
    if (db >= 0) return 100;
    return Math.round(((db + 60) / 60) * 100);
  }

  // ── Pro: Take Manager — multi-take comping ────────────────────────
  /** List of takes for the current arming session. */
  takes = signal<
    {
      id: string;
      name: string;
      createdAt: number;
      isActive: boolean;
      durationSec: number;
    }[]
  >([]);
  /** Muting state per take (false = audible). */
  takeMuted = signal<Record<string, boolean>>({});

  /** Promote this recording into a new take slot. */
  promoteToTake(): void {
    this.haptic.heavy();
    const takeId =
      'take-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const lastRecording = this.recordings()[this.recordings().length - 1];
    if (!lastRecording) {
      this.snackbar.error('Record something first to promote a take');
      return;
    }
    const num = this.takes().length + 1;
    this.takes.update((list) =>
      list
        .map((t) => ({ ...t, isActive: false }))
        .concat([
          {
            id: takeId,
            name: `Take ${num}`,
            createdAt: Date.now(),
            isActive: true,
            durationSec: lastRecording.durationSec || 0,
          },
        ])
    );
    // Unmute prior takes by default (comping)
    this.snackbar.success(
      `Take ${num} armed · ${this.takes().length} takes available`
    );
  }

  selectTake(takeId: string): void {
    this.haptic.light();
    this.takes.update((list) =>
      list.map((t) => ({ ...t, isActive: t.id === takeId }))
    );
  }

  toggleTakeMute(takeId: string): void {
    this.takeMuted.update((m) => ({ ...m, [takeId]: !m[takeId] }));
    this.haptic.light();
  }

  removeTake(takeId: string): void {
    this.takes.update((list) => list.filter((t) => t.id !== takeId));
    this.takeMuted.update((m) => {
      const n = { ...m };
      delete n[takeId];
      return n;
    });
    this.haptic.medium();
  }

  /** Clear every take behind a real confirmation — never a silent wipe. */
  async clearAllTakes(): Promise<void> {
    if (this.takes().length === 0) return;
    const confirmed = await this.dialog.confirm({
      title: 'Clear All Takes',
      message: `Delete all ${this.takes().length} takes? This cannot be undone.`,
      confirmLabel: 'Clear',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (!confirmed) return;
    this.takes.set([]);
    this.takeMuted.set({});
    this.haptic.heavy();
    this.snackbar.info('All takes cleared');
  }

  formatTakeAge(created: number): string {
    const ageMs = Date.now() - created;
    const sec = Math.floor(ageMs / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    return `${min}m ago`;
  }

  private handleRecordingFinished(event: { id: string; blob: Blob; url: string }): void {
    if (this.recordings().some((recording) => recording.id === event.id)) return;
    const name = `Take ${String(this.recordings().length + 1).padStart(2, '0')}`;
    const entry: RecordingListEntry = {
      id: event.id,
      name,
      timestamp: Date.now(),
      durationSec: Math.max(0, this.elapsedSec()),
      url: event.url,
    };
    this.recordings.update((list) => [entry, ...list]);
    this.captureState.set('idle');
    this.captureError.set(null);
    this.clearElapsedTimer();
    this.stopLevelMeter();
    this.stopWaveform();
    this.closeAudioGraph();
    this.snackbar.success(`${name} captured — ready to keep or add`);
  }

  private closeAudioGraph(): void {
    try {
      this.micSourceNode?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.micSourceNode = null;
    try {
      this.monitorGainNode?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.monitorGainNode = null;
    this.monitoringEnabled.set(false);
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;
  }

  async refreshInputDevices(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices())
        .filter((device) => device.kind === 'audioinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${index + 1}`,
        }));
      this.inputDevices.set(devices);
      if (!this.selectedInputId() && devices[0]) {
        this.selectedInputId.set(devices[0].deviceId);
      }
    } catch (error) {
      this.logger.warn('Could not enumerate recorder inputs', error);
    }
  }

  async setInputDevice(deviceId: string): Promise<void> {
    if (this.deviceSwitchLocked()) {
      this.snackbar.warning('Stop recording before switching input');
      return;
    }
    this.selectedInputId.set(deviceId);
    this.currentStream?.getTracks().forEach((track) => track.stop());
    this.currentStream = null;
    this.closeAudioGraph();
    await this.refreshInputDevices();
  }

  keepLatestTake(): void {
    const take = this.latestRecording();
    if (!take) return;
    this.snackbar.success(`${take.name} kept in the recording bank`);
  }

  retryLatestTake(): void {
    if (this.deviceSwitchLocked()) return;
    void this.toggleRecord();
  }

  async addLatestToArrangement(): Promise<void> {
    const take = this.latestRecording();
    if (take) await this.exportToArrangement(take);
  }

  // ── Toggle record on/off ────────────────────────────────
  async toggleRecord(): Promise<void> {
    this.haptic.medium();
    if (this.isRecording() || this.captureState() === 'recording') {
      this.captureState.set('stopping');
      this.recorder.stopRecording();
      this.clearElapsedTimer();
      this.stopLevelMeter();
      this.stopWaveform();
      this.stopFallbackTimer = setTimeout(() => {
        this.captureState.set('idle');
        this.closeAudioGraph();
        this.loadOfflineRecordings();
      }, 1000);
      this.snackbar.info('Recording stopped');
      return;
    }
    await this.startRecording();
  }

  private async startRecording(): Promise<void> {
    this.isRequestingMic.set(true);
    this.captureState.set('requesting');
    this.captureError.set(null);
    this.permissionsDenied.set(false);
    try {
      if (!this.currentStream) {
        // Browser DSP is left OFF: it is tuned for calls, not music. The
        // Studio supplies its own monitoring and noise gate instead.
        this.currentStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: this.selectedInputId()
              ? { exact: this.selectedInputId()! }
              : undefined,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      }
      // Wire the capture graph BEFORE arming the recorder, so even the first
      // take carries the gated signal.
      this.startLevelMeter(this.currentStream);
      const captureStream =
        this.captureDestination?.stream ?? this.currentStream;
      await this.recorder.startRecording(captureStream);
      this.startedAt = Date.now();
      this.captureState.set('recording');
      this.startElapsedTimer();
      this.startWaveform();
      this.snackbar.success('Recording armed — capture live input');
    } catch (err: any) {
      this.captureState.set('error');
      this.captureError.set(
        err?.name === 'NotAllowedError'
          ? 'Microphone permission denied'
          : 'Could not access microphone'
      );
      this.permissionsDenied.set(true);
      this.logger.error('Mic permission denied or unavailable', err);
      this.snackbar.error(
        err?.name === 'NotAllowedError'
          ? 'Microphone permission denied'
          : 'Could not access microphone'
      );
    } finally {
      this.isRequestingMic.set(false);
    }
  }

  // ── Level meter + gate ──────────────────────────────────
  private startLevelMeter(stream: MediaStream): void {
    try {
      this.audioContext = new AudioContext();
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      const source = this.audioContext.createMediaStreamSource(stream);
      this.meterSourceNode = source;

      // Mic → gate → {analyser, recorder}. The gate stays fully open until
      // the user arms it, so ungated takes are bit-identical to the input.
      this.gateNode = this.audioContext.createGain();
      this.gateNode.gain.value = this.noiseGateEnabled() ? 0 : 1;
      this.captureDestination =
        this.audioContext.createMediaStreamDestination();
      source.connect(this.gateNode);
      this.gateNode.connect(this.analyserNode);
      this.gateNode.connect(this.captureDestination);

      const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
      this.levelTaskCleanup?.();
      this.levelTaskCleanup = this.visualScheduler.register(() => {
        if (!this.analyserNode) return;
        this.analyserNode.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        // Map 0-255 to -60..0 dB roughly
        const db =
          avg === 0 ? -60 : Math.round(20 * Math.log10(avg / 255) * 10) / 10;
        this.inputLevel.set(Math.max(-60, Math.min(0, db)));
        this.applyNoiseGate(db);
      }, { fps: 24 });
    } catch (err) {
      this.logger.warn('Could not start level meter', err);
    }
  }

  /** Fast attack / slower release gate driven by the live level reading. */
  private applyNoiseGate(db: number): void {
    if (!this.gateNode || !this.audioContext) return;
    const open = !this.noiseGateEnabled() || db > this.noiseGateThreshold();
    try {
      this.gateNode.gain.setTargetAtTime(
        open ? 1 : 0,
        this.audioContext.currentTime,
        open ? 0.005 : 0.08
      );
    } catch {
      /* context closed mid-take */
    }
  }

  private stopLevelMeter(): void {
    this.levelTaskCleanup?.();
    this.levelTaskCleanup = null;
    if (this.meterSourceNode) {
      try {
        this.meterSourceNode.disconnect();
      } catch {
        /* already disconnected */
      }
      this.meterSourceNode = null;
    }
    if (this.gateNode) {
      try {
        this.gateNode.disconnect();
      } catch {
        /* already disconnected */
      }
      this.gateNode = null;
    }
    this.captureDestination = null;
    this.analyserNode = null;
    this.inputLevel.set(-60);
  }

  // ── Waveform visualizer ─────────────────────────────────
  private startWaveform(): void {
    if (!this.waveformCanvasRef) return;
    const canvas = this.waveformCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const buffer: number[] = new Array(200).fill(0);
    this.waveformTaskCleanup?.();
    this.waveformTaskCleanup = this.visualScheduler.register(() => {
      if (this.captureState() !== 'recording') return;
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(2, globalThis.devicePixelRatio || 1);
      const width = Math.max(1, Math.round((rect.width || canvas.width) * pixelRatio));
      const height = Math.max(1, Math.round((rect.height || canvas.height) * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = '#06091a';
      ctx.fillRect(0, 0, w, h);

      const val = this.inputLevel();
      const normalized = Math.max(0, Math.min(1, (val + 60) / 60));
      buffer.push(normalized);
      buffer.shift();

      ctx.beginPath();
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = Math.max(1, pixelRatio);
      for (let i = 0; i < buffer.length; i++) {
        const x = (i / buffer.length) * w;
        const y = (1 - buffer[i]) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }, { fps: 30 });
  }

  private stopWaveform(): void {
    this.waveformTaskCleanup?.();
    this.waveformTaskCleanup = null;
  }

  // ── Elapsed timer ───────────────────────────────────────
  private startElapsedTimer(): void {
    this.elapsedSec.set(0);
    this.clearElapsedTimer();
    this.elapsedTaskCleanup = this.visualScheduler.register(() => {
      const sec = Math.floor((Date.now() - this.startedAt) / 1000);
      this.elapsedSec.set(sec);
    }, { fps: 4 });
  }

  private clearElapsedTimer(): void {
    this.elapsedTaskCleanup?.();
    this.elapsedTaskCleanup = null;
  }

  // ── Recording bank ──────────────────────────────────────
  formatTime(sec: number): string {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = Math.floor(sec % 60)
      .toString()
      .padStart(2, '0');
    return `${m}:${s}`;
  }

  formatRecordedAt(ts: number): string {
    return new Date(ts).toLocaleString();
  }

  deleteRecording(id: string): void {
    this.haptic.medium();
    const entry = this.recordings().find((r) => r.id === id);
    if (entry?.url) this.recorder.revokeRecordingUrl(entry.url);
    const remove = (this.recorder as any).deleteOfflineRecording;
    if (remove) void remove.call(this.recorder, id);
    this.recordings.update((list) => list.filter((r) => r.id !== id));
    this.snackbar.info('Recording removed from list');
  }

  private async loadOfflineRecordings(): Promise<void> {
    try {
      const items =
        (await this.recorder.getOfflineRecordings()) as RecordingItem[];
      const built: RecordingListEntry[] = (items || []).map((it) => ({
        id: it.id,
        name: it.name || `Recording`,
        timestamp: it.timestamp || Date.now(),
        durationSec: Number(it.settings?.durationSec ?? 0) || 0,
        url:
          it.blob && typeof (this.recorder as any).createRecordingUrl === 'function'
            ? (this.recorder as any).createRecordingUrl(it.blob)
            : '',
      }));
      this.recordings.set(built);
    } catch (err) {
      this.logger.warn('No offline recordings available', err);
    }
  }
}
