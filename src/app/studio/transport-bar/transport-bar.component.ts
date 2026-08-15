import {
  Component,
  inject,
  signal,
  computed,
  effect,
  untracked,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { ExportService } from '../../services/export.service';
import { RecordingStatusService } from '../recording-status.service';
import {
  IdeasGeneratorService,
  IdeaRecipe,
} from '../../services/ideas-generator.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { TakeManagerService } from '../../services/take-manager.service';
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
  readonly musicManager = inject(MusicManagerService);
  /** Sprint A3 — take lane: per-track takes + punch-in state. */
  readonly takeManager = inject(TakeManagerService);
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

  /** Output level meter signals from AudioEngineService (post-master) */
  outputPeak = this.audioEngine.outputPeak;
  outputRms = this.audioEngine.outputRms;
  /** dB FS readout derived from outputPeak — safe for label rendering */
  outputDb = computed(() => this.audioEngine.outputLevelDb());
  /** Active EQ profile chip label (driven by engine outputProfileLabel) */
  outputProfileLabel = this.audioEngine.outputProfileLabel;

  /**
   * Stage 2.0 — live position readout (Bar : Beat : Sixteenth).
   * 4/4 mapping over the engine's 16-step bar so producers get a
   * DAW-grade position display without new engine state.
   */
  positionReadout = computed(() => {
    const step = Math.max(0, Math.floor(this.audioEngine.visualStep()));
    const bar = Math.floor(step / 16) + 1;
    const beat = Math.floor((step % 16) / 4) + 1;
    const sixteenth = (step % 4) + 1;
    return { bar, beat, sixteenth };
  });

  /** Stage 2.0 — time signature chip (editable future, display now). */
  timeSignature = '4/4';
  /** Active monitor blend readout */
  monitorBlendPct = computed(() =>
    Math.round(this.audioEngine.monitorBlend() * 100)
  );

  showBpmDropdown = signal(false);
  bpmPresets = [80, 90, 100, 110, 120, 124, 128, 130, 140, 150, 160];

  // ── Pro: Output device dropdown (drive new pill in template) ─────
  /** Open/close the audio-output device picker. */
  showOutputDeviceDropdown = signal(false);
  /** Switched sink id, persisted via audioEngine.setOutputDevice. */
  async selectOutputDevice(deviceId: string): Promise<void> {
    const ok = await this.audioEngine.setOutputDevice(deviceId);
    this.showOutputDeviceDropdown.set(false);
    if (deviceId) {
      this.haptic.light();
      this.snack[ok ? 'success' : 'info'](
        ok
          ? 'Audio routed to: ' + this.audioEngine.outputDeviceName()
          : 'Audio device saved (browser lacks setSinkId support)'
      );
    }
  }
  /** Friendly tooltip for the output pill. */
  outputDeviceTooltip = computed(() => {
    const name = this.audioEngine.outputDeviceName();
    return this.audioEngine.supportsSinkId()
      ? 'Tap to change audio output — currently: ' + name
      : 'Audio output: ' + name + ' (browser cannot switch sinks)';
  });

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

    // Sprint A3 — auto-stamp takes around recording while punch-in is armed
    // for the selected track. Snapshots the punch-in state at record START so
    // arming mid-pass still counts for that pass. While recording, each loop
    // wrap of the playhead stamps a take (loop-recording takes); stopping
    // stamps the final (partial) pass.
    effect(() => {
      const rec = this.isRecording();
      const step = this.audioEngine.visualStep();
      if (rec && !this.recordWasActive) {
        const id = this.musicManager.selectedTrackId();
        this.punchArmedAtRecordStart = id
          ? this.takeManager.isPunchIn(id)()
          : false;
        this.lastLoopStep = step;
        this.loopStampCount = 0;
      }
      // Loop pass completed while recording: playhead wrapped backward.
      if (rec && this.punchArmedAtRecordStart && this.recordWasActive) {
        if (step < (this.lastLoopStep ?? step)) {
          if (this.loopStampCount < 32) {
            this.stampTake();
            this.loopStampCount++;
          }
        }
        this.lastLoopStep = step;
      }
      if (!rec && this.recordWasActive && this.punchArmedAtRecordStart) {
        this.stampTake();
      }
      this.recordWasActive = rec;
    });
  }
  /** Sprint A3 — previous record-state edge tracker. */
  private recordWasActive = false;
  /** Sprint A3 — punch-in snapshot taken when the record pass began. */
  private punchArmedAtRecordStart = false;
  /** Sprint A3 — last playhead step during loop-pass tracking. */
  private lastLoopStep: number | null = null;
  /** Sprint A3 — per-record-session loop-pass stamp count (safety cap). */
  private loopStampCount = 0;

  // ── Sprint A3 — Take lane (punch-in + take stamping) ────────────

  /** Punch-in armed for the currently selected track? */
  punchInActive = computed(() => {
    const id = this.musicManager.selectedTrackId();
    return id ? this.takeManager.isPunchIn(id)() : false;
  });

  /** Number of takes recorded for the currently selected track. */
  takeCount = computed(() => {
    const id = this.musicManager.selectedTrackId();
    return id ? this.takeManager.getTakes(id)().length : 0;
  });

  /** Label of the most recent take for the selected track (chip readout). */
  lastTakeLabel = computed(() => {
    const id = this.musicManager.selectedTrackId();
    if (!id) return '';
    const takes = this.takeManager.getTakes(id)();
    return takes.length ? takes[takes.length - 1].label : '';
  });

  /** Toggle punch-in recording on/off for the selected track. */
  togglePunchIn(): void {
    const id = this.musicManager.selectedTrackId();
    if (!id) {
      this.snack.info('Select a track first — punch-in arms the selected track');
      return;
    }
    const next = !this.takeManager.isPunchIn(id)();
    this.takeManager.setPunchIn(id, next);
    this.haptic.light();
    this.snack[next ? 'success' : 'info'](
      next
        ? 'Punch-in armed — next record stop stamps a take'
        : 'Punch-in off'
    );
  }

  /**
   * Stamp a take for the selected track, snapshotting the note region. Called
   * manually from the take cluster and automatically when a punch-in-armed
   * record pass ends.
   */
  stampTake(): void {
    const track = this.musicManager.selectedTrack();
    if (!track) return; // silent: auto-stamp fires on every record stop
    const notes = track.notes ?? [];
    const count = this.takeCount() + 1;
    const take = this.takeManager.stampTake(
      track.id,
      `Take ${count}`,
      notes,
      this.audioEngine.visualStep()
    );
    this.haptic.medium();
    this.snack.success(
      `Take ${count} stamped · ${notes.length} note${
        notes.length === 1 ? '' : 's'
      } · steps ${take.startStep}–${take.endStep}`
    );
  }

  togglePlay(): void {
    // CRITICAL: Browser autoplay policy requires the AudioContext resume()
    // happen inside a user gesture. This Play button click IS a gesture,
    // so we explicitly resume() before delegating to audioSession.
    this.audioEngine.resume();

    if (!this.isPlaying() && this.countInBars() > 0) {
      // Use the engine's built-in count-in
      this.audioEngine.startCountIn(this.countInBars());
      // Count-in sets the engine rolling immediately; mirror that state so
      // the transport cannot be pressed repeatedly during the count-in.
      this.audioSession.playbackState.set('playing');
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
    const clamped = Math.min(
      300,
      Math.max(20, this.audioEngine.tempo() + delta)
    );
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

  // ── Pro: Swipe gestures for undo/redo on mobile ────
  private swipeStartX = 0;
  private swipeStartY = 0;
  private swipeStartTime = 0;

  onTouchStart(event: TouchEvent) {
    if (event.touches.length === 1) {
      this.swipeStartX = event.touches[0].clientX;
      this.swipeStartY = event.touches[0].clientY;
      this.swipeStartTime = Date.now();
    }
  }

  onTouchEnd(event: TouchEvent) {
    if (event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - this.swipeStartX;
    const dy = touch.clientY - this.swipeStartY;
    const dt = Date.now() - this.swipeStartTime;

    // Horizontal swipe, fast enough, long enough
    if (
      Math.abs(dx) > 60 &&
      Math.abs(dx) > Math.abs(dy) * 1.5 &&
      dt < 400 &&
      dt > 50
    ) {
      if (dx < 0) {
        // Swipe left = undo
        this.undo();
      } else {
        // Swipe right = redo
        this.redo();
      }
    }
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
      osc.frequency.linearRampToValueAtTime(783.99, ctx.currentTime + 0.35); // sweep up to G5
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

  /** Sprint A6 — one-tap Standard MIDI File export. */
  exportMidi(): void {
    const blob = this.exportService.exportProjectMidi();
    this.exportService.downloadBlob(
      blob,
      `${this.musicManager.projectName || 'Elite_Session'}_${Date.now()}.mid`
    );
    this.haptic.medium();
    this.snack.success('MIDI exported · .mid (Standard MIDI File)' );
  }

  /** Sprint A6.5 — render offline (real synth voices) + open share sheet. */
  async shareExport(): Promise<void> {
    this.isExporting.set(true);
    try {
      const used = await this.exportService.exportAndShare('wav');
      this.haptic.medium();
      this.snack[
        used ? 'success' : 'info'
      ](used ? 'Share sheet opened · WAV attached' : 'Downloaded WAV + share link copied');
    } catch (err: any) {
      this.snack.error('Share failed · ' + (err?.message ?? 'unknown error'));
    } finally {
      this.isExporting.set(false);
    }
  }

  /** Share the arrangement as a Standard MIDI File via the native sheet. */
  async shareMidi(): Promise<void> {
    const used = await this.exportService.shareMidi();
    this.haptic.light();
    this.snack[
      used ? 'success' : 'info'
    ](used ? 'Share sheet opened · .mid attached' : 'Downloaded .mid + share link copied');
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

  // ── Global transport keyboard shortcuts ───────────────────────────
  /**
   * Makes the (Space) / (R) / Ctrl+Z hints advertised on the transport
   * buttons REAL — professional DAW behavior from anywhere in the Studio:
   *
   *  Space            Play / Pause
   *  R                Record
   *  M                Metronome
   *  Ctrl/Cmd+Z       Undo
   *  Ctrl/Cmd+Shift+Z Redo (also Ctrl/Cmd+Y)
   *
   * Safety rules:
   *  - never fires while typing in an input/textarea/select/contenteditable;
   *  - auto-repeat is ignored (no accidental multi-undo / transport spam);
   *  - Space yields to native button activation when a control is focused
   *    so the focused button isn't double-triggered;
   *  - all other combos need no modifiers, so Ctrl+I/S/E and the shell's
   *    keydown handler stay untouched (piano roll's d/s/e/c edit modes are
   *    also unaffected).
   */
  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const tag = target.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      target.isContentEditable
    ) {
      return;
    }
    if (event.repeat) return;

    const mod = event.ctrlKey || event.metaKey;

    // ── Undo / Redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y) ──
    // The Studio shell's root (keydown) handler fires first in the bubble
    // phase and owns the same combos. If it already prevented the default,
    // skip here so a single press never double-fires history.undo()/redo().
    if (mod && (event.key === 'z' || event.key === 'Z')) {
      if (event.defaultPrevented) return;
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (mod && (event.key === 'y' || event.key === 'Y')) {
      if (event.defaultPrevented) return;
      event.preventDefault();
      this.redo();
      return;
    }

    // Transport shortcuts require no modifiers (never clobber Ctrl+ combos).
    if (mod || event.altKey) return;

    switch (event.key) {
      case ' ':
        // Space natively activates a focused control — let that win so the
        // focused button (e.g. Play itself) isn't double-fired. Also yield
        // for role=button / [tabindex] elements (e.g. the comp-brand div,
        // which handles Space itself) — preventDefault does not stop
        // propagation, so without this both actions would run.
        if (
          tag === 'BUTTON' ||
          tag === 'A' ||
          tag === 'SELECT' ||
          target.hasAttribute('tabindex') ||
          target.getAttribute('role') === 'button'
        ) {
          return;
        }
        event.preventDefault();
        this.togglePlay();
        break;
      case 'r':
      case 'R':
        this.toggleRecord();
        break;
      case 'm':
      case 'M':
        this.toggleMetronome();
        break;
      default:
        break;
    }
  }
}
