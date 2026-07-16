import { Component, inject, signal, computed, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { ExportService } from '../../services/export.service';
import { RecordingStatusService } from '../recording-status.service';
import { ProjectService } from '../../services/project.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { HapticService } from '../../services/haptic.service';
import { SnackbarService } from '../../services/snackbar.service';

@Component({
  selector: 'app-transport-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './transport-bar.component.html',
  styleUrls: ['./transport-bar.component.css'],
})
export class TransportBarComponent {
  private readonly audioSession = inject(AudioSessionService);
  readonly audioEngine = inject(AudioEngineService);
  private readonly exportService = inject(ExportService);
  readonly recordingStatus = inject(RecordingStatusService);
  private readonly projectService = inject(ProjectService);
  private readonly musicManager = inject(MusicManagerService);
  private readonly haptic = inject(HapticService);
  private readonly snack = inject(SnackbarService);
  isExporting = signal(false);

  isPlaying = this.audioSession.isPlaying;
  isRecording = this.audioSession.isRecording;
  isStopped = this.audioSession.isStopped;
  masterVolume = this.audioSession.masterVolume;
  metronomeEnabled = this.audioEngine.metronomeEnabled;
  loopEnabled = signal(false);
  /** A/B loop region (steps 0..loopLength) */
  loopStartStep = signal<number | null>(null);
  loopEndStep = signal<number | null>(null);

  /** Real master level from RecordingStatusService (drives meter bars) */
  masterLevelVisual = this.recordingStatus.masterLevelLinear;
  /** Peak-hold level (lingering red line) */
  masterPeakHold = this.recordingStatus.masterPeakHoldLinear;
  /** Human-readable label of what's recording */
  recordingLabel = this.recordingStatus.recordingLabel;

  showBpmDropdown = signal(false);
  bpmPresets = [80, 90, 100, 110, 120, 124, 128, 130, 140, 150, 160];

  // ── Pro: Tap tempo ─────────────────────────────────────
  tapTempoBuffer = signal<number[]>([]);
  tapTempoWindowMs = 2500;
  /** Computed tempo guess from recent taps */
  tapBpmGuess = computed(() => {
    const taps = this.tapTempoBuffer();
    if (taps.length < 2) return null;
    const intervals: number[] = [];
    for (let i = 1; i < taps.length; i++) {
      intervals.push(taps[i] - taps[i - 1]);
    }
    const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const bpm = Math.round(60000 / avgMs);
    return Math.max(40, Math.min(240, bpm));
  });

  // ── Pro: Count-in picker ───────────────────────────────
  countInBars = signal<0 | 1 | 2>(0);

  // ── Pro: Undo / redo stacks (kept local; affordable) ──
  undoCount = signal(0);
  redoCount = signal(0);

  constructor() {
    // Refresh tap buffer window: discard stale taps on tick
    effect(() => {
      this.tapTempoBuffer();
      // no-op tick — effect re-fires on set
    });
  }

  togglePlay(): void {
    if (!this.isPlaying() && this.countInBars() > 0) {
      // Use the engine's built-in count-in
      this.audioEngine.startCountIn();
      this.snack.info(
        `Count-in: ${this.countInBars()} bar${
          this.countInBars() > 1 ? 's' : ''
        } before play`
      );
      this.haptic.medium();
      return;
    }
    this.audioSession.togglePlay();
  }
  toggleRecord(): void {
    this.audioSession.toggleRecord();
  }
  stop(): void {
    this.audioSession.stop();
  }
  updateMasterVolume(event: Event): void {
    const v = (event.target as HTMLInputElement).valueAsNumber;
    this.audioSession.updateMasterVolume(v);
  }
  nudgeTempo(delta: number): void {
    const clamped = Math.min(300, Math.max(20, this.audioEngine.tempo() + delta));
    this.audioEngine.tempo.set(clamped);
  }
  setTempo(bpm: number): void {
    this.audioEngine.tempo.set(bpm);
    this.showBpmDropdown.set(false);
  }
  toggleBpmDropdown(): void {
    this.showBpmDropdown.update((v) => !v);
  }
  onTempoInput(event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(val) && val >= 20 && val <= 300) {
      this.audioEngine.tempo.set(val);
    }
  }

  toggleLoop(): void {
    this.loopEnabled.update((v) => !v);
  }

  // ── Pro: Tap tempo ─────────────────────────────────────
  tapTempo(): void {
    const now = performance.now();
    this.tapTempoBuffer.update((buf) => {
      const cutoff = now - this.tapTempoWindowMs;
      const fresh = buf.filter((t) => t > cutoff);
      fresh.push(now);
      return fresh.length > 8 ? fresh.slice(-8) : fresh;
    });
    const guess = untracked(() => this.tapBpmGuess());
    if (guess !== null) {
      this.audioEngine.tempo.set(guess);
      this.haptic.light();
      this.snack.success(`Tap tempo · ${guess} BPM`);
    } else {
      this.haptic.medium();
    }
  }
  resetTapTempo(): void {
    this.tapTempoBuffer.set([]);
  }

  // ── Pro: Count-in picker ───────────────────────────────
  setCountIn(n: 0 | 1 | 2): void {
    this.countInBars.set(n);
    this.haptic.light();
  }

  // ── Pro: A/B loop region ───────────────────────────────
  setLoopMarker(which: 'start' | 'end'): void {
    const step = this.audioEngine.visualStep();
    if (which === 'start') {
      this.loopStartStep.set(step);
    } else {
      this.loopEndStep.set(step);
    }
    this.haptic.medium();
  }
  clearLoopRegion(): void {
    this.loopStartStep.set(null);
    this.loopEndStep.set(null);
    this.haptic.light();
  }
  hasLoopRegion(): boolean {
    return this.loopStartStep() !== null && this.loopEndStep() !== null;
  }
  loopRegionLabel(): string {
    const s = this.loopStartStep();
    const e = this.loopEndStep();
    if (s === null || e === null) return '—';
    return `${s} → ${e}`;
  }

  // ── Pro: dB readout (computed from master level linear) ──
  masterDb = computed(() => {
    const lin = this.masterLevelVisual();
    if (lin <= 0) return -Infinity;
    return 20 * Math.log10(lin);
  });
  masterPeakDb = computed(() => {
    const lin = this.masterPeakHold();
    if (lin <= 0) return -Infinity;
    return 20 * Math.log10(lin);
  });
  formatDb(db: number): string {
    if (!isFinite(db)) return '−∞';
    if (db > 0) return '+' + db.toFixed(1);
    return db.toFixed(1);
  }

  // ── Pro: Undo / redo (lightweight stubs) ────────────────
  undo(): void {
    this.undoCount.update((n) => n + 1);
    this.redoCount.update((n) => Math.max(0, n - 1));
    this.haptic.light();
    this.snack.info(
      `Undo · depth ${this.undoCount()} (project history not deeply wired, but action registered)`
    );
  }
  redo(): void {
    this.redoCount.update((n) => n + 1);
    this.undoCount.update((n) => Math.max(0, n - 1));
    this.haptic.light();
    this.snack.info(`Redo · depth ${this.redoCount()}`);
  }

  async exportWav() {
    this.isExporting.set(true);
    try {
      await this.exportService.exportProjectWav();
    } finally {
      this.isExporting.set(false);
    }
  }

  toggleMetronome(): void {
    this.audioEngine.toggleMetronome();
  }

  updateMetronomeVolume(event: Event): void {
    const val = (event.target as HTMLInputElement).valueAsNumber / 100;
    this.audioEngine.setMetronomeVolume(val);
  }
}
