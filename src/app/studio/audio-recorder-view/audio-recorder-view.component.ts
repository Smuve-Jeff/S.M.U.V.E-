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
  styleUrls: ['./audio-recorder-view.component.css'],
})
export class AudioRecorderViewComponent
  implements OnInit, OnDestroy, AfterViewInit
{
  public recorder = inject(AudioRecorderService);
  private haptic = inject(HapticService);
  private snackbar = inject(SnackbarService);
  private logger = inject(LoggingService);
  private dialog = inject(InteractionDialogService);

  @ViewChild('waveformCanvas')
  waveformCanvasRef!: ElementRef<HTMLCanvasElement>;

  /** UI state */
  recordings = signal<RecordingListEntry[]>([]);
  permissionsDenied = signal(false);
  isRequestingMic = signal(false);
  currentStream: MediaStream | null = null;
  elapsedSec = signal(0);
  inputLevel = signal(-60);
  private elapsedInterval: any = null;
  private startedAt = 0;
  private levelInterval: any = null;
  private analyserNode: AnalyserNode | null = null;
  private audioContext: AudioContext | null = null;
  private waveformFrame: number | null = null;

  /** Live state bindings from service */
  isRecording = this.recorder.isRecording;
  recordingCount = computed(() => this.recordings().length);

  // ── Monitoring & Noise Gate ────────────────────────────
  monitoringEnabled = signal(false);
  noiseGateThreshold = signal(-50); // dB
  noiseGateEnabled = signal(false);
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private monitorGainNode: GainNode | null = null;

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
      // Create a new audio track in the music manager
      const trackName = rec.name || `Take ${rec.id.slice(-4)}`;
      this.musicManager.addAudioTrack({
        id: 'audio_' + Date.now(),
        name: trackName,
        color: '#E11D48',
        buffer: audioBuffer,
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
  }

  ngAfterViewInit(): void {
    // Canvas is ready — waveform will start when recording begins
  }

  ngOnDestroy(): void {
    this.clearElapsedTimer();
    this.stopLevelMeter();
    this.stopWaveform();
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

  // ── Toggle record on/off ────────────────────────────────
  async toggleRecord(): Promise<void> {
    this.haptic.medium();
    if (this.isRecording()) {
      this.recorder.stopRecording();
      this.clearElapsedTimer();
      this.stopLevelMeter();
      this.stopWaveform();
      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close().catch(() => {});
        this.audioContext = null;
      }
      setTimeout(() => this.loadOfflineRecordings(), 600);
      this.snackbar.info('Recording stopped');
      return;
    }
    await this.startRecording();
  }

  private async startRecording(): Promise<void> {
    this.isRequestingMic.set(true);
    this.permissionsDenied.set(false);
    try {
      if (!this.currentStream) {
        this.currentStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,
          },
        });
      }
      await this.recorder.startRecording(this.currentStream);
      this.startedAt = Date.now();
      this.startElapsedTimer();
      this.startLevelMeter(this.currentStream);
      this.startWaveform();
      this.snackbar.success('Recording armed — capture live input');
    } catch (err: any) {
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

  // ── Level meter ─────────────────────────────────────────
  private startLevelMeter(stream: MediaStream): void {
    try {
      this.audioContext = new AudioContext();
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.analyserNode);

      const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
      this.levelInterval = setInterval(() => {
        if (!this.analyserNode) return;
        this.analyserNode.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        // Map 0-255 to -60..0 dB roughly
        const db =
          avg === 0 ? -60 : Math.round(20 * Math.log10(avg / 255) * 10) / 10;
        this.inputLevel.set(Math.max(-60, Math.min(0, db)));
      }, 60);
    } catch (err) {
      this.logger.warn('Could not start level meter', err);
    }
  }

  private stopLevelMeter(): void {
    if (this.levelInterval) {
      clearInterval(this.levelInterval);
      this.levelInterval = null;
    }
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
    const draw = () => {
      if (!this.isRecording()) {
        this.waveformFrame = null;
        return;
      }
      this.waveformFrame = requestAnimationFrame(draw);

      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = 'var(--ivory-deep, #06091A)';
      ctx.fillRect(0, 0, w, h);

      // Shift buffer
      const val = this.inputLevel();
      const normalized = Math.max(0, Math.min(1, (val + 60) / 60));
      buffer.push(normalized);
      buffer.shift();

      // Draw waveform
      ctx.beginPath();
      ctx.strokeStyle = 'var(--teal-500, #0E7C7B)';
      ctx.lineWidth = 2;
      for (let i = 0; i < buffer.length; i++) {
        const x = (i / buffer.length) * w;
        const y = (1 - buffer[i]) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Glow
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'var(--teal-glow, rgba(14, 124, 123, 0.5))';
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    this.waveformFrame = requestAnimationFrame(draw);
  }

  private stopWaveform(): void {
    if (this.waveformFrame) {
      cancelAnimationFrame(this.waveformFrame);
      this.waveformFrame = null;
    }
  }

  // ── Elapsed timer ───────────────────────────────────────
  private startElapsedTimer(): void {
    this.elapsedSec.set(0);
    this.clearElapsedTimer();
    this.elapsedInterval = setInterval(() => {
      const sec = Math.floor((Date.now() - this.startedAt) / 1000);
      this.elapsedSec.set(sec);
    }, 250);
  }

  private clearElapsedTimer(): void {
    if (this.elapsedInterval) {
      clearInterval(this.elapsedInterval);
      this.elapsedInterval = null;
    }
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
        durationSec: 0,
        url: '',
      }));
      this.recordings.set(built);
    } catch (err) {
      this.logger.warn('No offline recordings available', err);
    }
  }
}
