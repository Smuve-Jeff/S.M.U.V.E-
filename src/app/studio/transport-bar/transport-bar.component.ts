import {
  Component,
  inject,
  signal,
  computed,
  effect,
  untracked,
  HostListener,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { AudioSessionService } from "../audio-session.service";
import { AudioEngineService } from "../../services/audio-engine.service";
import { ExportService } from "../../services/export.service";
import { RecordingStatusService } from "../recording-status.service";
import {
  IdeasGeneratorService,
  IdeaRecipe,
} from "../../services/ideas-generator.service";
import { MusicManagerService } from "../../services/music-manager.service";
import { TakeManagerService } from "../../services/take-manager.service";
import { SnackbarService } from "../../services/snackbar.service";
import { ProjectService } from "../../services/project.service";
import { HapticService } from "../../services/haptic.service";
import { HistoryService } from "../../services/history.service";
import { STEPS_PER_BAR, TempoMapService } from "../tempo-map.service";
import { MidiClockSyncService } from "../midi-clock-sync.service";
import { GamepadService } from "../../services/gamepad.service";
import { HardwareConnectionsComponent } from "../hardware-connections/hardware-connections.component";
import { StudioMidiLearnService } from "../studio-midi-learn.service";
import { LiveEngineService } from "../../services/live-engine.service";

@Component({
  selector: "app-transport-bar",
  standalone: true,
  imports: [CommonModule, FormsModule, HardwareConnectionsComponent],
  templateUrl: "./transport-bar.component.html",
  styleUrls: ["./transport-bar.component.css", "../shared/platform-ux.css"],
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
  /** Real render progress for the current WAV/stem export, or null when idle. */
  exportProgress = signal<number | null>(null);
  /** True only while a cancellable WAV/stem export is running. */
  exportCanCancel = signal(false);
  /** Rough remaining render time once enough progress has arrived. */
  exportEta = signal<string | null>(null);
  private exportStartedAt = 0;
  private exportAbort: AbortController | null = null;
  /**
   * Delivery sample rate for WAV mixdowns and stems.
   *
   * 44.1 kHz matches music delivery; 48 kHz is what video editors, broadcast
   * and most Android audio stacks expect, so an export can meet either spec
   * without a second round trip through a converter.
   */
  exportSampleRate = signal<44100 | 48000>(44100);

  /** Ideas generator — one-tap 4-bar starter recipes. */
  public readonly ideas = inject(IdeasGeneratorService);
  /** Ideas modal open state. */
  ideasOpen = signal(false);

  isPlaying = this.audioSession.isPlaying;
  isRecording = this.audioSession.isRecording;
  isStopped = this.audioSession.isStopped;
  masterVolume = this.audioSession.masterVolume;
  metronomeEnabled = this.audioEngine.metronomeEnabled;
  loopEnabled = this.audioEngine.playbackLoopEnabled;
  /** A/B loop region (steps 0..loopLength) */
  loopStartStep = this.audioEngine.playbackLoopStart;
  loopEndStep = this.audioEngine.playbackLoopEnd;

  /** Real master level from RecordingStatusService (drives meter bars) */
  masterLevelVisual = this.recordingStatus.masterLevelLinear;
  /** Peak-hold level (lingering red line) */
  masterPeakHold = this.recordingStatus.masterPeakHoldLinear;
  /** Human-readable label of what's recording */
  recordingLabel = this.recordingStatus.recordingLabel;
  /** Exact target/input detail under the label, or every live capture. */
  recordingDetail = this.recordingStatus.recordingDetail;
  /** Number of live recorders (the chip flags more than one). */
  recordingCount = this.recordingStatus.recordingCount;
  /** Where the next pass lands (armed mixer tracks, else the selection). */
  recordTargetLabel = this.audioSession.recordTargetLabel;
  recordTargetDetail = this.audioSession.recordTargetDetail;
  /** The destination tracks themselves — drives punch-in + take stamping. */
  recordDestinations = this.audioSession.recordDestinations;

  /** Output level meter signals from AudioEngineService (post-master) */
  outputPeak = this.audioEngine.outputPeak;
  outputRms = this.audioEngine.outputRms;
  /** dB FS readout derived from outputPeak — safe for label rendering */
  outputDb = computed(() => this.audioEngine.outputLevelDb());
  /** Active EQ profile chip label (driven by engine outputProfileLabel) */
  outputProfileLabel = this.audioEngine.outputProfileLabel;

  /**
   * Stage 2.0 — live position readout (Bar : Beat : Subdivision).
   * The step grid is 16ths; the engine's meter decides how many steps a
   * beat and a bar hold, so 3/4 and 6/8 read correctly instead of being
   * forced through a 4/4 mapping.
   */
  positionReadout = computed(() => {
    const step = Math.max(0, Math.floor(this.audioEngine.visualStep()));
    const beatSteps = this.audioEngine.stepsPerNotatedBeat?.() ?? 4;
    const barSteps = this.audioEngine.stepsPerBar?.() ?? 16;
    const bar = Math.floor(step / barSteps) + 1;
    const beat = Math.floor((step % barSteps) / beatSteps) + 1;
    const sixteenth = (step % beatSteps) + 1;
    return { bar, beat, sixteenth };
  });

  /** Meter chip — the label and the accent grid share the engine's value. */
  get timeSignature(): string {
    const sig = this.audioEngine.timeSignature?.() ?? { beats: 4, unit: 4 };
    return `${sig.beats}/${sig.unit}`;
  }
  readonly timeSignatureOptions = ["2/4", "3/4", "4/4", "5/4", "6/8", "7/8", "12/8"];

  setTimeSignature(event: Event): void {
    const value = (event.target as HTMLSelectElement | null)?.value ?? "";
    const [beats, unit] = value.split("/").map((part) => Number(part));
    if (!Number.isFinite(beats) || !Number.isFinite(unit)) return;
    this.audioEngine.setTimeSignature?.(beats, unit);
    this.haptic.light();
    this.snack.info(`Time signature · ${this.timeSignature}`);
  }
  /** Active monitor blend readout */
  monitorBlendPct = computed(() =>
    Math.round(this.audioEngine.monitorBlend() * 100),
  );

  showBpmDropdown = signal(false);
  bpmPresets = [80, 90, 100, 110, 120, 124, 128, 130, 140, 150, 160];
  /** BPM readout without a pointless ".0" — but with the tenth when it matters. */
  tempoLabel = computed(() => {
    const bpm = this.audioEngine.tempo();
    return Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(1);
  });

  /** Song tempo map — multiple tempo changes instead of one global BPM. */
  readonly tempoMap = inject(TempoMapService);
  tempoMapOpen = signal(false);
  /** Undo history panel: the stack's last 40 steps, newest first. */
  historyOpen = signal(false);
  /** MIDI learn, audio inputs and gamepad status in one place. */
  hardwareOpen = signal(false);
  private readonly gamepad = inject(GamepadService);
  /**
   * Instantiated here (not only by the hardware panel) so learned CC/note
   * bindings are live from the moment the transport exists.
   */
  readonly midiLearn = inject(StudioMidiLearnService);
  /** Rising-edge state for gamepad buttons (a held button must fire once). */
  private lastPadButtons: boolean[] = [];

  /** External MIDI clock-in: a hardware sequencer can drive this transport. */
  readonly midiClock = inject(MidiClockSyncService);

  /**
   * Note repeat for the live keyboard. The performer arpeggiator already
   * retriggers held notes at a musical rate; the transport exposes it where
   * players look for it. Optional so the transport still renders in hosts
   * that never construct the live engine.
   */
  private readonly liveEngine = inject(LiveEngineService, { optional: true });
  readonly noteRepeatEnabled = computed(
    () => this.liveEngine?.arpeggiatorEnabled() ?? false,
  );
  readonly noteRepeatRate = computed(
    () => this.liveEngine?.arpeggiatorRate() ?? "8n",
  );
  readonly noteRepeatRateLabel = computed(
    () =>
      this.noteRepeatRates.find(
        (rate) => rate.value === this.noteRepeatRate(),
      )?.label ?? "1/8",
  );
  private static readonly REPEAT_RATES = [
    { value: "4n", label: "1/4" },
    { value: "8n", label: "1/8" },
    { value: "8t", label: "1/8T" },
    { value: "16n", label: "1/16" },
  ];
  readonly noteRepeatRates = TransportBarComponent.REPEAT_RATES;

  toggleNoteRepeat(): void {
    if (!this.liveEngine) {
      this.snack.info("Note repeat needs the live instrument engine");
      return;
    }
    this.liveEngine.arpeggiatorEnabled.update((enabled) => !enabled);
    this.haptic.light();
    this.snack.info(
      this.liveEngine.arpeggiatorEnabled()
        ? "Note repeat on — hold keys to retrigger"
        : "Note repeat off",
    );
  }

  cycleNoteRepeatRate(): void {
    if (!this.liveEngine) return;
    const index = this.noteRepeatRates.findIndex(
      (rate) => rate.value === this.liveEngine?.arpeggiatorRate(),
    );
    const next =
      this.noteRepeatRates[(index + 1) % this.noteRepeatRates.length];
    this.liveEngine.arpeggiatorRate.set(next.value);
    this.haptic.light();
  }

  toggleMonoMonitoring(): void {
    this.haptic.light();
    const mono = this.audioEngine.toggleMonoMonitoring();
    this.snack.info(
      mono
        ? "Mono-sum monitoring — checking L+R for phase cancellation"
        : "Stereo monitoring restored",
    );
  }

  async toggleMidiClock(): Promise<void> {
    this.haptic.light();
    if (this.midiClock.enabled()) {
      this.midiClock.disable();
      this.snack.info("External clock off — back to the studio's own tempo");
      return;
    }
    await this.midiClock.enable();
    if (this.midiClock.status() === "unsupported") {
      this.snack.info("This browser has no Web MIDI, so external clock is unavailable");
      return;
    }
    this.snack.info("Listening for external MIDI clock — start your hardware sequencer");
  }

  /** Pin a tempo change at the playhead's bar, using the tempo on the dial. */
  addTempoMarkerAtPlayhead(): void {
    const bar = this.positionReadout().bar;
    const marker = this.tempoMap.addMarker(
      (bar - 1) * STEPS_PER_BAR,
      this.audioEngine.tempo(),
    );
    if (!marker) {
      this.snack.info("Tempo must be between 20 and 300 BPM");
      return;
    }
    this.haptic.light();
    this.snack.info(`Tempo change at bar ${this.tempoMap.barOf(marker)}: ${marker.bpm} BPM`);
  }

  trackTempoMarker = (_index: number, marker: { id: string }) => marker.id;

  setMarkerBpm(id: string, value: number | string): void {
    this.tempoMap.updateMarker(id, { bpm: Number(value) });
  }

  removeTempoMarker(id: string): void {
    this.haptic.light();
    this.tempoMap.removeMarker(id);
  }

  toggleHistoryPanel(): void {
    this.historyOpen.update((open) => !open);
  }

  /**
   * Restore to the state *before* the clicked step. The list is newest-first,
   * so entry `index` sits `index` steps above the state we want to return to.
   */
  jumpToHistoryStep(index: number): void {
    const remaining = this.history.undoCount() - index - 1;
    const label = this.history.undoLabels()[index] ?? "that step";
    this.history.undoToDepth(remaining);
    this.snack.info(`History · restored to before “${label}”`);
  }

  clearTempoMap(): void {
    this.haptic.medium();
    this.tempoMap.clear();
    this.snack.info("Tempo map cleared — the song is back to one tempo");
  }


  // ── Pro: Output device dropdown (drive new pill in template) ─────
  /** Open/close the audio-output device picker. */
  showOutputDeviceDropdown = signal(false);
  /** Switched sink id, persisted via audioEngine.setOutputDevice. */
  async selectOutputDevice(deviceId: string): Promise<void> {
    const ok = await this.audioEngine.setOutputDevice(deviceId);
    this.showOutputDeviceDropdown.set(false);
    if (deviceId) {
      this.haptic.light();
      this.snack[ok ? "success" : "info"](
        ok
          ? "Audio routed to: " + this.audioEngine.outputDeviceName()
          : "Audio device saved (browser lacks setSinkId support)",
      );
    }
  }
  /** Friendly tooltip for the output pill. */
  outputDeviceTooltip = computed(() => {
    const name = this.audioEngine.outputDeviceName();
    return this.audioEngine.supportsSinkId()
      ? "Tap to change audio output — currently: " + name
      : "Audio output: " + name + " (browser cannot switch sinks)";
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
    this.wireGamepad();

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
        // Snapshot punch-in per destination at record start. The pass writes a
        // take for every destination track that had punch-in armed, not only
        // the selected one.
        this.punchArmedTargets = new Set(
          this.recordDestinations()
            .filter((destination) =>
              this.takeManager.isPunchIn(destination.trackId)(),
            )
            .map((destination) => destination.trackId),
        );
        this.lastLoopStep = step;
        this.loopStampCount = 0;
      }
      // Loop pass completed while recording: playhead wrapped backward.
      if (rec && this.punchArmedTargets.size && this.recordWasActive) {
        if (step < (this.lastLoopStep ?? step)) {
          if (this.loopStampCount < 32) {
            this.stampArmedPunches();
            this.loopStampCount++;
          }
        }
        this.lastLoopStep = step;
      }
      if (!rec && this.recordWasActive && this.punchArmedTargets.size) {
        this.stampArmedPunches();
      }
      if (!rec) this.punchArmedTargets = new Set();
      this.recordWasActive = rec;
    });
  }
  /** Sprint A3 — previous record-state edge tracker. */
  private recordWasActive = false;
  /**
   * Sprint A3 — destination tracks with punch-in armed when the pass began.
   * A Set (not a boolean) because a pass can stamp several armed tracks.
   */
  private punchArmedTargets = new Set<string>();
  /** Sprint A3 — last playhead step during loop-pass tracking. */
  private lastLoopStep: number | null = null;
  /** Sprint A3 — per-record-session loop-pass stamp count (safety cap). */
  private loopStampCount = 0;

  // ── Sprint A3 — Take lane (punch-in + take stamping) ────────────

  /**
   * Punch-in armed for every record destination?
   *
   * The transport records onto the armed mixer tracks, so the punch button
   * has to arm those same tracks — reading only the selected track let the REC
   * target and the punch target disagree.
   */
  punchInActive = computed(() => {
    const destinations = this.recordDestinations();
    return (
      destinations.length > 0 &&
      destinations.every((destination) =>
        this.takeManager.isPunchIn(destination.trackId)(),
      )
    );
  });

  /** Number of takes recorded for the currently selected track. */
  takeCount = computed(() => {
    const id = this.musicManager.selectedTrackId();
    return id ? this.takeManager.getTakes(id)().length : 0;
  });

  /** Label of the most recent take for the selected track (chip readout). */
  lastTakeLabel = computed(() => {
    const id = this.musicManager.selectedTrackId();
    if (!id) return "";
    const takes = this.takeManager.getTakes(id)();
    return takes.length ? takes[takes.length - 1].label : "";
  });

  /** Toggle punch-in recording on/off for every record destination. */
  togglePunchIn(): void {
    const destinations = this.recordDestinations();
    if (destinations.length === 0) {
      this.snack.info("Arm or select a track first — punch-in needs a target");
      return;
    }
    const next = !this.punchInActive();
    for (const destination of destinations) {
      this.takeManager.setPunchIn(destination.trackId, next);
    }
    this.haptic.light();
    const names = destinations.map((destination) => destination.trackName);
    const target = names.length === 1 ? names[0] : `${names.length} tracks`;
    this.snack[next ? "success" : "info"](
      next
        ? `Punch-in armed for ${target} — next record stop stamps a take`
        : "Punch-in off",
    );
  }

  /**
   * Stamp a take for the selected track, snapshotting the note region. Called
   * manually from the take cluster and automatically when a punch-in-armed
   * record pass ends.
   */
  stampTake(): void {
    // Stamp the pass destination, not merely whatever is selected: armed
    // tracks are the real capture target.
    const targetId =
      this.recordDestinations()[0]?.trackId ??
      this.musicManager.selectedTrackId();
    const track = targetId
      ? this.musicManager.tracks().find((candidate) => candidate.id === targetId)
      : this.musicManager.selectedTrack();
    if (!track) return; // silent: auto-stamp fires on every record stop
    const noteCount = track.notes?.length ?? 0;
    const take = this.stampTakeForTrack(track.id);
    if (!take) return;
    this.haptic.medium();
    this.snack.success(
      `Take ${this.takeManager.getTakes(track.id)().length} stamped on ${track.name} · ${noteCount} note${
        noteCount === 1 ? "" : "s"
      } · steps ${take.startStep}–${take.endStep}`,
    );
  }

  /**
   * Stamp one destination track's take. Auto-stamping walks every armed
   * punch-in destination, so this stays silent and returns the stamped region.
   */
  private stampTakeForTrack(
    trackId: string,
  ): { startStep?: number; endStep?: number } | null {
    const track = this.musicManager
      .tracks()
      .find((candidate) => candidate.id === trackId);
    if (!track) return null;
    const takes = this.takeManager.getTakes(trackId)();
    return this.takeManager.stampTake(
      trackId,
      `Take ${takes.length + 1}`,
      track.notes ?? [],
      this.audioEngine.visualStep(),
    );
  }

  /** Auto-stamp every destination track that had punch-in armed. */
  private stampArmedPunches(): void {
    const stamped: string[] = [];
    for (const trackId of this.punchArmedTargets) {
      if (this.stampTakeForTrack(trackId)) {
        const name =
          this.musicManager
            .tracks()
            .find((track) => track.id === trackId)?.name ?? trackId;
        stamped.push(name);
      }
    }
    if (stamped.length === 0) return;
    this.haptic.medium();
    this.snack.success(
      stamped.length === 1
        ? `Take stamped for ${stamped[0]}`
        : `Takes stamped for ${stamped.join(" + ")}`,
    );
  }

  /**
   * Game controller transport. Browsers only expose a pad after its first
   * button press, so the mapping lives here where the transport already is.
   * Button state is edge-detected: holding A plays once, not every frame.
   */
  private wireGamepad(): void {
    effect(() => {
      const state = this.gamepad.connectedGamepad();
      if (!state) {
        this.lastPadButtons = [];
        return;
      }
      const previous = this.lastPadButtons;
      state.buttons.forEach((pressed, index) => {
        if (pressed && !previous[index]) this.onGamepadButton(index);
      });
      this.lastPadButtons = [...state.buttons];
    });
  }

  private onGamepadButton(button: number): void {
    switch (button) {
      case 0: // A — play / stop
        this.togglePlay();
        break;
      case 1: // B — stop
        this.musicManager.stopScenePlayback();
        if (this.isPlaying()) this.audioSession.stop();
        this.snack.info("Controller · stopped");
        break;
      case 2: // X — record
        this.toggleRecord();
        break;
      case 3: // Y — back to the arrangement
        this.musicManager.backToArrangement();
        this.snack.info("Controller · back to song");
        break;
      case 4: {
        // LB — previous scene
        const previous = this.musicManager.previousSceneColumn();
        if (previous !== null) this.musicManager.launchSceneColumn(previous);
        break;
      }
      case 5: {
        // RB — next scene
        const next = this.musicManager.nextSceneColumn();
        if (next !== null) this.musicManager.launchSceneColumn(next);
        break;
      }
      case 9: // START — stop everything
        this.musicManager.stopScenePlayback();
        if (this.isPlaying()) this.audioSession.stop();
        break;
      default:
        break;
    }
  }

  toggleHardwarePanel(): void {
    this.hardwareOpen.update((open) => !open);
  }

  async togglePlay(): Promise<void> {
    // CRITICAL: Browser autoplay policy requires the AudioContext resume()
    // happen inside a user gesture. This Play button click IS a gesture,
    // so we explicitly resume() before delegating to audioSession.
    this.audioEngine.resume();

    if (!this.isPlaying() && this.countInBars() > 0) {
      // Use the engine's built-in count-in
      const countIn = this.audioEngine.startCountIn(this.countInBars());
      if (countIn) await countIn;
      if (!this.audioEngine.isPlaying()) {
        // Preparation failed or the transport was stopped: do not leave the
        // shell showing "playing" over a silent engine.
        this.audioSession.playbackState.set("stopped");
        return;
      }
      // Count-in sets the engine rolling immediately; mirror that state so
      // the transport cannot be pressed repeatedly during the count-in.
      this.audioSession.playbackState.set("playing");
      this.snack.info(
        `Count-in: ${this.countInBars()} bar${
          this.countInBars() > 1 ? "s" : ""
        } before play`,
      );
      this.haptic.medium();
      return;
    }
    this.audioSession.togglePlay();
  }
  toggleRecord(): void {
    // Priming capture is async; the session owns the in-flight guard. The
    // count-in picker applies to REC as well as Play.
    void this.audioSession.toggleRecord(this.countInBars());
  }
  stop(): void {
    this.audioSession.stop();
  }
  updateMasterVolume(event: Event): void {
    const v = (event.target as HTMLInputElement).valueAsNumber;
    this.audioSession.updateMasterVolume(v);
  }
  nudgeTempo(delta: number): void {
    this.audioEngine.setTempo(this.audioEngine.tempo() + delta);
  }
  setTempo(bpm: number): void {
    if (!Number.isFinite(bpm)) return;
    this.audioEngine.setTempo(bpm);
    this.showBpmDropdown.set(false);
  }
  toggleBpmDropdown(): void {
    this.showBpmDropdown.update((v) => !v);
  }
  /**
   * Typed tempo. Accepts tenths (124.5) instead of truncating to an integer,
   * clamps to 20–300 and echoes the committed value back into the field so an
   * out-of-range entry cannot leave the input disagreeing with the transport.
   */
  onTempoInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const val = parseFloat(input.value);
    if (!Number.isFinite(val)) {
      input.value = this.tempoLabel();
      return;
    }
    const committed = this.audioEngine.setTempo(val);
    input.value = Number.isInteger(committed)
      ? String(committed)
      : committed.toFixed(1);
  }

  toggleLoop(): void {
    // The engine owns the write so the toggle is also the stored one.
    this.audioEngine.togglePlaybackLoop();
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
    this.snack.show("✨ Generating · " + r.name);
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
  setLoopMarker(which: "start" | "end"): void {
    const step = this.audioEngine.visualStep();
    if (which === "start") {
      this.audioEngine.setPlaybackLoop(step, null);
    } else if (!this.audioEngine.setPlaybackLoop(this.loopStartStep() ?? 0, step)) {
      this.snack.info('Loop end must be after the start. Move the playhead forward first.');
      return;
    }
    this.haptic.medium();
  }
  clearLoopRegion(): void {
    this.audioEngine.setPlaybackLoop(null, null);
    this.haptic.light();
  }
  hasLoopRegion(): boolean {
    return this.loopStartStep() !== null && this.loopEndStep() !== null;
  }
  loopRegionLabel(): string {
    const s = this.loopStartStep();
    const e = this.loopEndStep();
    if (s === null || e === null) return "—";
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
    if (!isFinite(db)) return "−∞";
    if (db > 0) return "+" + db.toFixed(1);
    return db.toFixed(1);
  }

  // ── History: real Undo / Redo ──────────────────────────
  undo(): void {
    if (!this.canUndo()) return;
    this.history.undo();
    this.haptic.light();
    const last = this.lastActionName();
    this.snack.info(`Undo · ${last || "last action"}`);
  }

  redo(): void {
    if (!this.canRedo()) return;
    this.history.redo();
    this.haptic.light();
    this.snack.info(`Redo · ${this.lastActionName() || "next action"}`);
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
      osc.type = "sine";
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
      this.snack.success("Audio path armed ✓ — 0.6s probe sent");
      this.haptic.light();
      // Auto-clear the badge after 4s
      setTimeout(() => this.testSoundFired.set(false), 4000);
    } catch (err) {
      this.snack.error("Audio probe failed: " + (err as Error)?.message);
    }
  }

  secondsSinceTest(): number {
    const at = this.testSoundFiredAt();
    return at === 0 ? 0 : Math.floor((Date.now() - at) / 1000);
  }

  /** Human label for the chosen delivery rate (44100 → “44.1 kHz”). */
  exportRateLabel(): string {
    return this.exportSampleRate() === 48000 ? '48 kHz' : '44.1 kHz';
  }

  /** Export status text; a percentage only when the renderer has reported one. */
  exportProgressLabel(): string {
    if (this.exportAbort?.signal.aborted) return 'Finishing current render…';
    const percent = this.exportProgress();
    return percent === null ? 'Rendering…' : `Rendering… ${percent}%`;
  }

  /** Abort between render stages; Web Audio cannot interrupt startRendering. */
  cancelExport(): void {
    if (!this.exportCanCancel() || !this.exportAbort) return;
    this.exportAbort.abort();
    this.snack.info('Finishing current render…');
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
  }

  private beginExport(): void {
    this.exportStartedAt = Date.now();
    this.exportEta.set(null);
  }

  /** Progress plus a conservative ETA after a second of real samples. */
  private updateExportProgress(percent: number): void {
    this.exportProgress.set(percent);
    const elapsed = Date.now() - this.exportStartedAt;
    if (percent <= 3 || percent >= 100 || elapsed < 1200) {
      this.exportEta.set(null);
      return;
    }
    const remainingMs = (elapsed / percent) * (100 - percent);
    if (remainingMs < 5000) {
      this.exportEta.set('<5s');
      return;
    }
    const seconds = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(seconds / 60);
    this.exportEta.set(`${minutes}:${String(seconds % 60).padStart(2, '0')}`);
  }

  /** Flip the delivery rate between the two specs the exporter offers. */
  toggleExportSampleRate(): void {
    if (this.isExporting()) return;
    this.exportSampleRate.update((rate) => (rate === 44100 ? 48000 : 44100));
    this.haptic.light();
    this.snack.info(`Export rate → ${this.exportRateLabel()}`);
  }

  async exportWav() {
    if (this.isExporting()) return;
    this.isExporting.set(true);
    this.exportProgress.set(0);
    this.exportAbort = new AbortController();
    this.exportCanCancel.set(true);
    this.beginExport();
    try {
      await this.exportService.exportProjectWav(
        16,
        this.exportSampleRate(),
        (percent) => this.updateExportProgress(percent),
        this.exportAbort.signal,
      );
    } catch (error) {
      if (this.isAbortError(error)) this.snack.info('Export cancelled');
      else this.snack.error('WAV export failed · ' + (error instanceof Error ? error.message : 'unknown error'));
    } finally {
      this.isExporting.set(false);
      this.exportProgress.set(null);
      this.exportEta.set(null);
      this.exportCanCancel.set(false);
      this.exportAbort = null;
    }
  }

  /** 24-bit mixdown — the delivery format for mixing and mastering. */
  async exportWav24() {
    if (this.isExporting()) return;
    this.isExporting.set(true);
    this.exportProgress.set(0);
    this.exportAbort = new AbortController();
    this.exportCanCancel.set(true);
    this.beginExport();
    try {
      await this.exportService.exportProjectWav(
        24,
        this.exportSampleRate(),
        (percent) => this.updateExportProgress(percent),
        this.exportAbort.signal,
      );
    } catch (error) {
      if (this.isAbortError(error)) this.snack.info('Export cancelled');
      else this.snack.error('24-bit WAV export failed · ' + (error instanceof Error ? error.message : 'unknown error'));
    } finally {
      this.isExporting.set(false);
      this.exportProgress.set(null);
      this.exportEta.set(null);
      this.exportCanCancel.set(false);
      this.exportAbort = null;
    }
  }

  /** Export master + per-track stems as one ZIP for mixing/collaboration. */
  async exportStems() {
    if (this.isExporting()) return;
    this.isExporting.set(true);
    this.exportProgress.set(0);
    this.exportAbort = new AbortController();
    this.exportCanCancel.set(true);
    this.beginExport();
    try {
      await this.exportService.exportStems({
        bitDepth: 24,
        sampleRate: this.exportSampleRate(),
        signal: this.exportAbort.signal,
        onProgress: (completed, total) => {
          this.updateExportProgress(
            total > 0 ? Math.round((completed / total) * 100) : 0,
          );
        },
      });
      this.snack.success(
        `Stems exported · .zip (master + one 24-bit WAV per track at ${this.exportRateLabel()})`,
      );
      this.haptic.medium();
    } catch (error) {
      if (this.isAbortError(error)) this.snack.info('Export cancelled');
      else this.snack.error(
        'Stem export failed · ' + (error instanceof Error ? error.message : 'unknown error'),
      );
    } finally {
      this.isExporting.set(false);
      this.exportProgress.set(null);
      this.exportEta.set(null);
      this.exportCanCancel.set(false);
      this.exportAbort = null;
    }
  }

  /** Sprint A6 — one-tap Standard MIDI File export. */
  exportMidi(): void {
    const blob = this.exportService.exportProjectMidi();
    this.exportService.downloadBlob(
      blob,
      `${this.musicManager.projectName || "Elite_Session"}_${Date.now()}.mid`,
    );
    this.haptic.medium();
    this.snack.success("MIDI exported · .mid (Standard MIDI File)");
  }

  /** Sprint A6.5 — render offline (real synth voices) + open share sheet. */
  async shareExport(): Promise<void> {
    if (this.isExporting()) return;
    this.isExporting.set(true);
    this.exportProgress.set(null);
    try {
      const used = await this.exportService.exportAndShare("wav");
      this.haptic.medium();
      this.snack[used ? "success" : "info"](
        used
          ? "Share sheet opened · WAV attached"
          : "Downloaded WAV + share link copied",
      );
    } catch (err: any) {
      this.snack.error("Share failed · " + (err?.message ?? "unknown error"));
    } finally {
      this.isExporting.set(false);
    }
  }

  /** Share the arrangement as a Standard MIDI File via the native sheet. */
  async shareMidi(): Promise<void> {
    const used = await this.exportService.shareMidi();
    this.haptic.light();
    this.snack[used ? "success" : "info"](
      used
        ? "Share sheet opened · .mid attached"
        : "Downloaded .mid + share link copied",
    );
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
  @HostListener("document:keydown", ["$event"])
  onGlobalKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const tag = target.tagName;
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      target.isContentEditable
    ) {
      return;
    }
    if (event.repeat || event.isComposing || event.defaultPrevented || target.closest('[role="dialog"], app-interaction-dialog')) return;

    const mod = event.ctrlKey || event.metaKey;

    // ── Undo / Redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y) ──
    // The Studio shell's root (keydown) handler fires first in the bubble
    // phase and owns the same combos. If it already prevented the default,
    // skip here so a single press never double-fires history.undo()/redo().
    if (mod && (event.key === "z" || event.key === "Z")) {
      if (event.defaultPrevented) return;
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (mod && (event.key === "y" || event.key === "Y")) {
      if (event.defaultPrevented) return;
      event.preventDefault();
      this.redo();
      return;
    }

    // Transport shortcuts require no modifiers (never clobber Ctrl+ combos).
    if (mod || event.altKey) return;

    switch (event.key) {
      case " ":
        // Space natively activates a focused control — let that win so the
        // focused button (e.g. Play itself) isn't double-fired. Also yield
        // for role=button / [tabindex] elements (e.g. the comp-brand div,
        // which handles Space itself) — preventDefault does not stop
        // propagation, so without this both actions would run.
        if (
          tag === "BUTTON" ||
          tag === "A" ||
          tag === "SELECT" ||
          target.hasAttribute("tabindex") ||
          target.getAttribute("role") === "button"
        ) {
          return;
        }
        event.preventDefault();
        this.togglePlay();
        break;
      case "r":
      case "R":
        this.toggleRecord();
        break;
      case "m":
      case "M":
        this.toggleMetronome();
        break;
      default:
        break;
    }
  }
}
