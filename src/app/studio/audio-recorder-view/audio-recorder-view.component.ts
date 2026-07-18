import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
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
export class AudioRecorderViewComponent implements OnInit, OnDestroy {
  public recorder = inject(AudioRecorderService);
  private haptic = inject(HapticService);
  private snackbar = inject(SnackbarService);
  private logger = inject(LoggingService);

  /** UI state */
  recordings = signal<RecordingListEntry[]>([]);
  permissionsDenied = signal(false);
  isRequestingMic = signal(false);
  currentStream: MediaStream | null = null;
  elapsedSec = signal(0);
  private elapsedInterval: any = null;
  private startedAt = 0;

  /** Live state bindings from service */
  isRecording = this.recorder.isRecording;
  recordingCount = computed(() => this.recordings().length);

  ngOnInit(): void {
    this.loadOfflineRecordings();
  }

  ngOnDestroy(): void {
    this.clearElapsedTimer();
    if (this.currentStream) {
      this.currentStream.getTracks().forEach((t) => t.stop());
      this.currentStream = null;
    }
  }

  // ── Toggle record on/off ────────────────────────────────
  async toggleRecord(): Promise<void> {
    this.haptic.medium();
    if (this.isRecording()) {
      this.recorder.stopRecording();
      this.clearElapsedTimer();
      // Reload after a beat so the new file lands in localStorage.
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
      // LocalStorage blobs can't survive a session restart reliably, so we
      // expose whatever BUT we primarily use the live recordings list.
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
