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
import {
  AudioRecorderService,
  RecordingItem,
} from '../audio-recorder.service';
import { HapticService } from '../../services/haptic.service';
import { SnackbarService } from '../../services/snackbar.service';
import { LoggingService } from '../../services/logging.service';

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
export class AudioRecorderViewComponent implements OnInit, OnDestroy, AfterViewInit {
  public recorder = inject(AudioRecorderService);
  private haptic = inject(HapticService);
  private snackbar = inject(SnackbarService);
  private logger = inject(LoggingService);

  @ViewChild('waveformCanvas') waveformCanvasRef!: ElementRef<HTMLCanvasElement>;

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
        const db = avg === 0 ? -60 : Math.round((20 * Math.log10(avg / 255)) * 10) / 10;
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
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
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
      const items = (await this.recorder.getOfflineRecordings()) as RecordingItem[];
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
