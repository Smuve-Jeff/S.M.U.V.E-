import {
  Component,
  computed,
  inject,
  signal,
  OnInit,
  OnDestroy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import {
  MusicManagerService,
  TrackModel,
  TrackNote,
} from "../../services/music-manager.service";
import { LfoState } from "../../services/audio-engine.service";
import { InstrumentsService } from "../../services/instruments.service";
import { SnackbarService } from "../../services/snackbar.service";
import { InteractionDialogService } from "../../services/interaction-dialog.service";

/** LFO target options for the channel rack. */
export enum LfoTarget {
  Cutoff = "cutoff",
  Pitch = "pitch",
  Volume = "volume",
}

/** One lane shows one bar of steps (the classic 16-step pattern window). */
const LANE_STEPS = 16;
/** New notes below this bar are always allowed so lanes can be extended. */
const MIN_BARS = 4;

@Component({
  selector: "app-channel-rack",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./channel-rack.component.html",
  styleUrls: ["./channel-rack.component.css", "../shared/platform-ux.css"],
})
export class ChannelRackComponent implements OnInit, OnDestroy {
  public musicManager = inject(MusicManagerService);
  private readonly instruments = inject(InstrumentsService);
  private readonly snackbar = inject(SnackbarService);
  private readonly dialog = inject(InteractionDialogService);
  tracks = this.musicManager.tracks;
  selectedTrackId = this.musicManager.selectedTrackId;
  engine = this.musicManager.engine;
  currentStep = this.engine.visualStep;
  laneSteps = new Array(LANE_STEPS).fill(0);

  /** Post-fader peak per track, polled for the rack's level meters. */
  trackLevels = signal<Record<string, number>>({});
  private meterTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    if (typeof window === "undefined") return;
    this.meterTimer = setInterval(() => this.pollLevels(), 90);
  }

  ngOnDestroy(): void {
    if (this.meterTimer) clearInterval(this.meterTimer);
    this.meterTimer = null;
  }

  /**
   * The rack showed no level at all: a card could be silent or clipping and
   * look identical. Peaks come from the engine's per-track tap; a stopped
   * transport decays to silence instead of freezing a stale peak.
   */
  private pollLevels(): void {
    const tracks = this.tracks();
    if (!tracks.length) return;
    const playing = this.engine.isPlaying();
    const previous = this.trackLevels();
    // Transport stopped and every meter already fell: stay idle instead of
    // waking the rack eleven times a second.
    if (!playing && Object.values(previous).every((value) => value === 0)) {
      return;
    }
    const next: Record<string, number> = {};
    for (const track of tracks) {
      const live = playing ? this.engine.getTrackLevel(track.id) : 0;
      const decayed = (previous[track.id] ?? 0) * 0.65;
      next[track.id] = Math.max(live, decayed < 0.01 ? 0 : decayed);
    }
    this.trackLevels.set(next);
  }

  /** 0-100 reading for the card's meter. */
  levelPercent(id: string): number {
    return Math.round((this.trackLevels()[id] ?? 0) * 100);
  }

  /**
   * Freeze renders the track offline and swaps its pattern for that render;
   * tapping again restores the pattern from the backup. Both directions are a
   * single undoable history step.
   */
  async toggleFreeze(track: TrackModel, event: Event): Promise<void> {
    event.stopPropagation();
    if (track.frozenBackup) {
      const thawed = this.musicManager.unfreezeTrack(track.id);
      this.snackbar.info(
        thawed
          ? `"${track.name}" thawed — pattern restored`
          : "Nothing to thaw on this track",
      );
      return;
    }
    this.snackbar.info(`Freezing "${track.name}"…`);
    const frozen = await this.musicManager.freezeTrack(track.id);
    this.snackbar.info(
      frozen
        ? `"${track.name}" frozen — it plays one rendered clip now`
        : "Freeze needs an unmuted MIDI or drum track",
    );
  }

  /** 0-based bar of the editing window while the transport is stopped. */
  stepBar = signal(0);

  /** Instrument picker target while the fly-out is open. */
  instrumentPickerTrackId = signal<string | null>(null);

  /** Registry ids the rack's "+ Add" fly-out groups by category. */
  addTrackOpen = signal(false);

  readonly LfoTarget = LfoTarget;
  readonly lfoTargets = [LfoTarget.Cutoff, LfoTarget.Pitch, LfoTarget.Volume];
  readonly lfoWaves = [
    { value: "sine", label: "Smooth", icon: "∿" },
    { value: "triangle", label: "Ramp", icon: "△" },
    { value: "square", label: "Chop", icon: "⊓" },
    { value: "sawtooth", label: "Buzz", icon: "⋋" },
  ];

  isBeginner = signal<boolean>(false);
  activeTooltip = signal<string | null>(null);

  /** LFO target for the selected track, persisted on the track's patch. */
  lfoTarget = signal<LfoTarget>(LfoTarget.Cutoff);

  /** Step drag-paint gesture state (`add`, `remove`, or `null` when idle). */
  private stepPaintMode: "add" | "remove" | null = null;
  private stepPaintTrackId: string | null = null;
  private lastPaintedStep: number | null = null;

  /** Update one LFO parameter for a track (or the selected track). */
  updateLfoParam(
    param: keyof LfoState,
    value: any,
    trackId = this.musicManager.selectedTrackId(),
  ): void {
    if (!trackId) return;
    const track = this.musicManager.tracks().find((t) => t.id === trackId);
    if (!track || !track.synthParams) return;
    if (param === "target" && Object.values(LfoTarget).includes(value)) {
      this.lfoTarget.set(value as LfoTarget);
    }
    const nextLfo: Partial<LfoState> = {
      wave: "sine",
      rate: 5,
      depth: 0,
      target: this.lfoTarget(),
      ...(track.synthParams.lfo || {}),
      [param]:
        param === "rate" || param === "depth" ? Number(value) : value,
    };
    if (typeof this.musicManager.updateSynthParams === "function") {
      this.musicManager.updateSynthParams(trackId, { lfo: nextLfo });
    } else {
      track.synthParams.lfo = nextLfo;
      this.musicManager.tracks.update((ts) =>
        ts.map((t) =>
          t.id === trackId
            ? { ...t, synthParams: { ...t.synthParams, lfo: nextLfo } }
            : t,
        ),
      );
    }
  }

  /** Categories for the add fly-out, in curated order. */
  readonly instrumentCategories: string[] = (() => {
    const seen: string[] = [];
    for (const preset of this.instruments.getPresets()) {
      const category = preset.category ?? "Other";
      if (!seen.includes(category)) seen.push(category);
    }
    return seen;
  })();

  presetsByCategory(category: string) {
    return this.instruments
      .getPresets()
      .filter((p) => (p.category ?? "Other") === category);
  }

  /** Preset display name for the lane subtitle (registry id → label). */
  instrumentName(instrumentId: string): string {
    return (
      this.instruments.getPresets().find((p) => p.id === instrumentId)?.name ??
      instrumentId
    );
  }

  /**
   * Start of the visible 16-step window. While the transport plays the
   * window rides the playhead; while stopped it follows the paged `stepBar`.
   */
  windowStart = computed(() => {
    const playing = this.engine.isPlaying();
    if (playing) {
      return Math.floor(this.engine.visualStep() / LANE_STEPS) * LANE_STEPS;
    }
    return this.stepBar() * LANE_STEPS;
  });

  selectTrack(track: TrackModel) {
    this.musicManager.selectedTrackId.set(track.id);
  }

  async removeTrack(id: string) {
    const track = this.tracks().find((t) => t.id === id);
    if (!track) return;
    const noteCount = track.notes?.length ?? 0;
    // In-app dialog instead of `window.confirm`: the native modal freezes the
    // whole WebView on Android and returns false wherever the host does not
    // implement it, so deleting a channel used to look broken on a phone.
    const approved = await this.dialog.confirm({
      title: "Delete channel",
      message:
        noteCount > 0
          ? `Delete "${track.name}" and its ${noteCount} note${noteCount === 1 ? "" : "s"}?`
          : `Delete "${track.name}"?`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!approved) return;
    if (this.instrumentPickerTrackId() === id) {
      this.instrumentPickerTrackId.set(null);
    }
    this.musicManager.removeTrack(id);
  }

  addTrack(instrumentId: string) {
    const preset = this.instruments
      .getPresets()
      .find((p) => p.id === instrumentId);
    // Only the kit categories get a real drum-type track (drum-machine
    // ownership, swing); melodic presets stay melodic.
    const type =
      preset?.category === "drum" || preset?.category === "perc"
        ? "drum"
        : "midi";
    const id = this.musicManager.addTrack(
      preset?.name ?? "New " + instrumentId,
      instrumentId,
      type,
    );
    this.addTrackOpen.set(false);
    this.snackbar.success(
      `➕ ${preset?.name ?? instrumentId} added to the rack`,
    );
    return id;
  }

  toggleInstrumentPicker(trackId: string) {
    this.instrumentPickerTrackId.update((id) =>
      id === trackId ? null : trackId,
    );
  }

  setInstrument(track: TrackModel, presetId: string) {
    if (track.instrumentId === presetId) {
      this.instrumentPickerTrackId.set(null);
      return;
    }
    const preset = this.instruments.getPresets().find((p) => p.id === presetId);
    this.musicManager.setInstrument(track.id, presetId);
    this.instrumentPickerTrackId.set(null);
    this.snackbar.success(`🎛 ${track.name} → ${preset?.name ?? presetId}`);
  }

  toggleMute(track: TrackModel) {
    this.musicManager.toggleMute(track.id);
  }

  toggleSolo(track: TrackModel) {
    this.musicManager.toggleSolo(track.id);
  }

  updateVolume(track: TrackModel, val: number) {
    this.musicManager.updateVolume(track.id, val);
  }

  updatePan(track: TrackModel, val: number) {
    this.musicManager.updateTrackPan(track.id, val * 100);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  /** Deep clone: notes, steps, pattern slots and clips all come along. */
  cloneTrack(track: TrackModel) {
    const id = this.musicManager.cloneTrack(track.id);
    if (id) {
      this.snackbar.success(`📄 "${track.name}" cloned with its pattern`);
    }
  }

  reorderTrack(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= this.tracks().length) return;
    this.musicManager.reorderTrack(index, targetIndex);
  }

  openPianoRoll(track: TrackModel) {
    this.musicManager.selectedTrackId.set(track.id);
    // The Studio shell routes cross-links, so ask for the same jump the
    // arrangement's per-clip piano button uses.
    this.musicManager.requestCrossLink({
      view: "piano-roll",
      trackId: track.id,
      label: track.name,
    });
  }

  // ── Note-accurate step lane ──────────────────────────────────────────
  // The lane reads the AUDIBLE model (track.notes) instead of the legacy
  // boolean `steps` array that nothing plays back — clicks now light the
  // cells that will actually sound, and edits undo through HistoryService
  // just like piano-roll edits.

  /** Absolute step a given lane cell targets inside the current window. */
  cellStep(track: TrackModel, cell: number): number {
    return this.windowStart() + cell;
  }

  /** True when any audible note starts on this cell's step. */
  cellLit(track: TrackModel, cell: number): boolean {
    const target = this.cellStep(track, cell);
    return track.notes.some((n) => Math.floor(n.step) === target);
  }

  /** Playhead highlight: is the transport on this cell right now? */
  cellNow(cell: number): boolean {
    const step = this.engine.visualStep();
    const start = this.windowStart();
    return step >= start && step < start + LANE_STEPS && step - start === cell;
  }

  /** Number of full 16-step bars this track reaches (min 4 to extend). */
  barCount(track: TrackModel): number {
    const maxStep = track.notes.reduce((max, n) => Math.max(max, n.step), -1);
    const needed = Math.floor(maxStep / LANE_STEPS) + 1;
    return Math.max(MIN_BARS, needed);
  }

  barLabels(track: TrackModel): number[] {
    return Array.from({ length: this.barCount(track) }, (_, i) => i);
  }

  setBar(track: TrackModel, bar: number) {
    // Clamping keeps the window on a real bar even if the transport moved
    // while the click was in flight (the unclamped pager used to page into
    // empty space past the pattern and look dead).
    const clamped = Math.max(0, Math.min(this.barCount(track) - 1, bar));
    this.stepBar.set(clamped);
  }

  stepWindowBar(): number {
    return Math.floor(this.windowStart() / LANE_STEPS);
  }

  nudgeBar(direction: 1 | -1) {
    // The rack lane is a shared window, so keep it inside every track's
    // bar range instead of paging into infinity.
    const maxBar =
      Math.max(MIN_BARS, ...this.tracks().map((t) => this.barCount(t))) - 1;
    this.stepBar.update((bar) =>
      Math.max(0, Math.min(maxBar, bar + direction)),
    );
  }

  /**
   * Toggle the audible note at a lane cell. Clicking a lit cell removes the
   * note(s) on that step; clicking an empty cell adds one at the track's
   * most common pitch so new steps sit in the instrument's register.
   */
  toggleStepCell(track: TrackModel, cell: number) {
    const target = this.cellStep(track, cell);
    const hits = track.notes.filter((n) => Math.floor(n.step) === target);
    if (hits.length > 0) {
      this.musicManager.removeNotes(
        track.id,
        hits.map((n) => n.id),
      );
      return;
    }
    this.musicManager.addNoteToTrack(track.id, {
      id: `step_${Date.now()}_${cell}`,
      midi: this.pitchForNewNote(track),
      step: target,
      length: 1,
      velocity: 0.8,
    } as TrackNote);
  }

  /**
   * Start drag-painting steps across a channel row (FL Studio Mobile style):
   * starting on an empty cell paints new steps as the pointer slides across;
   * starting on a lit cell erases steps across the row.
   */
  startStepPaint(track: TrackModel, cell: number, event?: PointerEvent) {
    if (event && event.pointerType === "mouse" && event.button !== 0) return;
    const isLit = this.cellLit(track, cell);
    this.stepPaintMode = isLit ? "remove" : "add";
    this.stepPaintTrackId = track.id;
    this.lastPaintedStep = this.cellStep(track, cell);
    this.toggleStepCell(track, cell);
  }

  continueStepPaint(track: TrackModel, cell: number) {
    if (!this.stepPaintMode || this.stepPaintTrackId !== track.id) return;
    const target = this.cellStep(track, cell);
    if (this.lastPaintedStep === target) return;
    this.lastPaintedStep = target;
    const isLit = this.cellLit(track, cell);
    if (this.stepPaintMode === "add" && !isLit) {
      this.toggleStepCell(track, cell);
    } else if (this.stepPaintMode === "remove" && isLit) {
      this.toggleStepCell(track, cell);
    }
  }

  endStepPaint() {
    this.stepPaintMode = null;
    this.stepPaintTrackId = null;
    this.lastPaintedStep = null;
  }

  /**
   * Slide continuation driven by pointer coordinates rather than by the event
   * target. Touch pointers get implicit capture on the cell that received
   * `pointerdown`, so every later `pointermove` is retargeted to that one cell
   * and sibling cells never fire `pointerenter` — the per-cell handler alone
   * could only ever paint the first step of a swipe. Mouse drags resolve to the
   * same cell through both paths, and `continueStepPaint` de-duplicates by step,
   * so the two routes cannot double-toggle one cell.
   */
  onStepPaintMove(track: TrackModel, event: PointerEvent) {
    if (!this.stepPaintMode || this.stepPaintTrackId !== track.id) return;
    const cell = this.stepCellUnderPointer(event, track.id);
    if (cell === null) return;
    this.continueStepPaint(track, cell);
  }

  /**
   * Step index under a pointer event, or null when the pointer is off this
   * lane. The grid carries its track id so a finger sliding across a different
   * channel's lane can never paint the track the gesture started on.
   */
  private stepCellUnderPointer(
    event: PointerEvent,
    trackId: string,
  ): number | null {
    if (typeof document === 'undefined') return null;
    const hit = document.elementFromPoint?.(
      Number(event?.clientX ?? 0),
      Number(event?.clientY ?? 0),
    );
    const source =
      hit instanceof Element
        ? hit
        : event?.target instanceof Element
          ? event.target
          : null;
    const cell = source?.closest('[data-step-index]');
    if (!cell) return null;
    if (cell.closest('[data-track-id]')?.getAttribute('data-track-id') !== trackId) {
      return null;
    }
    const index = Number(cell.getAttribute('data-step-index'));
    return Number.isInteger(index) ? index : null;
  }

  /** Most frequent midi in the track — keeps lane entries in register. */
  pitchForNewNote(track: TrackModel): number {
    if (track.notes.length === 0) return 60;
    const counts = new Map<number, number>();
    for (const note of track.notes) {
      counts.set(note.midi, (counts.get(note.midi) ?? 0) + 1);
    }
    let best = 60;
    let bestCount = -1;
    for (const [midi, count] of counts) {
      if (count > bestCount) {
        bestCount = count;
        best = midi;
      }
    }
    return best;
  }
}
