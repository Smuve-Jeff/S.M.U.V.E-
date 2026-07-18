import { Component, inject, signal, computed, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { ExportService } from '../../services/export.service';
import { RecordingStatusService } from '../recording-status.service';
import { IdeasGeneratorService, IdeaRecipe } from '../../services/ideas-generator.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { SnackbarService } from '../../services/snackbar.service';
import { ProjectService } from '../../services/project.service';
import { HapticService } from '../../services/haptic.service';
import { HistoryService } from '../../services/history.service';

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
  /** Real history stack — bound so Undo/Redo buttons actually reverse mutations. */
  readonly history = inject(HistoryService);
  isExporting = signal(false);

  /** Ideas generator — one-tap 4-bar starter recipes. */
  public readonly ideas = inject(IdeasGeneratorService);
  /** Ideas modal open state. */
  ideasOpen = signal(false);

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

  // ── Pro: History — undo/redo (backed by HistoryService) ──
  /** Convenience flags so templates can wire disabled state */
  canUndo = this.history.canUndo;
  canRedo = this.history.canRedo;
  /** Live counters that drive the badges inside undo/redo buttons */
  undoCount = this.history.undoCount;
  redoCount = this.history.redoCount;
  /** Most recent reversible action name (snackbar label) */
  lastActionName = this.history.lastActionName;

  constructor() {
    // Refresh tap buffer window: discard stale taps on tick
    effect(() => {
      this.tapTempoBuffer();
      // no-op tick — effect re-fires on set
    });
  }

  togglePlay(): void {
    // CRITICAL: Browser autoplay policy requires the AudioContext resume()
    // happen inside a user gesture. This Play button click IS a gesture,
    // so we explicitly resume() before delegating to audioSession.
    this.audioEngine.resume();

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

  // ── Ideas Generator ───────────────────────────────────────────────

  openIdeas(): void {
    this.ideasOpen.set(true);
  }

  closeIdeas(): void {
    this.ideasOpen.set(false);
  }

  /** Trigger generation of a curated 4-bar starter. */
  useRecipe(r: IdeaRecipe): void {
    this.audioEngine.resume();
    this.snack.show('✨ Generating · ' + r.name);
    this.musicManager.applyGeneratedRecipe(r);
    this.ideasOpen.set(false);
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

  // ── History: real Undo / Redo ──────────────────────────
  undo(): void {
    if (!this.canUndo()) return;
    this.history.undo();
    this.haptic.light();
    const last = this.lastActionName();
    this.snack.info(`Undo · ${last || 'last action'}`);
  }

  redo(): void {
    if (!this.canRedo()) return;
    this.history.redo();
    this.haptic.light();
    this.snack.info(`Redo · ${this.lastActionName() || 'next action'}`);
  }

  /**
   * One-shot audible probe — confirms the audio path is live end-to-end.
   * Plays a 0.6s sine sweep even if NO tracks are loaded, so users can
   * immediately verify that speakers are working.
   */
  testSoundFired = signal(false);
  testSoundFiredAt = signal(0);
  private testSoundOsc: OscillatorNode | null = null;

  playTestSound(): void {
    try {
      const ctx = this.audioEngine.getContext();
      this.audioEngine.resume();
      if (this.testSoundOsc) {
        try {
          this.testSoundOsc.stop();
        } catch {}
      }
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.linearRampToValueAtTime(
        783.99,
        ctx.currentTime + 0.35
      ); // sweep up to G5
      env.gain.setValueAtTime(0, ctx.currentTime);
      env.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.04);
      env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.connect(env);
      env.connect(this.audioEngine.masterGain);
      osc.start();
      osc.stop(ctx.currentTime + 0.65);
      this.testSoundOsc = osc;
      this.testSoundFiredAt.set(Date.now());
      this.testSoundFired.set(true);
      this.snack.success('Audio path armed ✓ — 0.6s probe sent');
      this.haptic.light();
      // Auto-clear the badge after 4s
      setTimeout(() => this.testSoundFired.set(false), 4000);
    } catch (err) {
      this.snack.error('Audio probe failed: ' + (err as Error)?.message);
    }
  }

  secondsSinceTest(): number {
    const at = this.testSoundFiredAt();
    return at === 0 ? 0 : Math.floor((Date.now() - at) / 1000);
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
    // Always arm the AudioContext in user-gesture context
    this.audioEngine.resume();
    this.audioEngine.toggleMetronome();
  }

  updateMetronomeVolume(event: Event): void {
    const val = (event.target as HTMLInputElement).valueAsNumber / 100;
    this.audioEngine.setMetronomeVolume(val);
  }
}
