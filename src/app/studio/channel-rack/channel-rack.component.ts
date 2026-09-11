import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MusicManagerService,
  TrackModel,
  TrackNote,
} from '../../services/music-manager.service';
import { InstrumentsService } from '../../services/instruments.service';
import { SnackbarService } from '../../services/snackbar.service';

/** One lane shows one bar of steps (the classic 16-step pattern window). */
const LANE_STEPS = 16;
/** New notes below this bar are always allowed so lanes can be extended. */
const MIN_BARS = 4;

@Component({
  selector: 'app-channel-rack',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './channel-rack.component.html',
  styleUrls: ['./channel-rack.component.css'],
})
export class ChannelRackComponent {
  public musicManager = inject(MusicManagerService);
  private readonly instruments = inject(InstrumentsService);
  private readonly snackbar = inject(SnackbarService);
  tracks = this.musicManager.tracks;
  selectedTrackId = this.musicManager.selectedTrackId;
  engine = this.musicManager.engine;
  currentStep = this.engine.visualStep;
  laneSteps = new Array(LANE_STEPS).fill(0);

  /** 0-based bar of the editing window while the transport is stopped. */
  stepBar = signal(0);

  /** Instrument picker target while the fly-out is open. */
  instrumentPickerTrackId = signal<string | null>(null);

  /** Registry ids the rack's "+ Add" fly-out groups by category. */
  addTrackOpen = signal(false);

  /** Categories for the add fly-out, in curated order. */
  readonly instrumentCategories: string[] = (() => {
    const seen: string[] = [];
    for (const preset of this.instruments.getPresets()) {
      const category = preset.category ?? 'Other';
      if (!seen.includes(category)) seen.push(category);
    }
    return seen;
  })();

  presetsByCategory(category: string) {
    return this.instruments
      .getPresets()
      .filter((p) => (p.category ?? 'Other') === category);
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

  removeTrack(id: string) {
    const track = this.tracks().find((t) => t.id === id);
    if (!track) return;
    const noteCount = track.notes?.length ?? 0;
    const confirmMessage =
      noteCount > 0
        ? `Delete "${track.name}" and its ${noteCount} note${noteCount === 1 ? '' : 's'}?`
        : `Delete "${track.name}"?`;
    if (!confirm(confirmMessage)) return;
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
      preset?.category === 'drum' || preset?.category === 'perc'
        ? 'drum'
        : 'midi';
    const id = this.musicManager.addTrack(
      preset?.name ?? 'New ' + instrumentId,
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
    this.instrumentPickerTrackId.update((id) => (id === trackId ? null : trackId));
  }

  setInstrument(track: TrackModel, presetId: string) {
    if (track.instrumentId === presetId) {
      this.instrumentPickerTrackId.set(null);
      return;
    }
    const preset = this.instruments
      .getPresets()
      .find((p) => p.id === presetId);
    this.musicManager.setInstrument(track.id, presetId);
    this.instrumentPickerTrackId.set(null);
    this.snackbar.success(
      `🎛 ${track.name} → ${preset?.name ?? presetId}`,
    );
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

  reorderTrack(index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= this.tracks().length) return;
    this.musicManager.reorderTrack(index, targetIndex);
  }

  openPianoRoll(track: TrackModel) {
    this.musicManager.selectedTrackId.set(track.id);
    // The Studio shell routes cross-links, so ask for the same jump the
    // arrangement's per-clip piano button uses.
    this.musicManager.requestCrossLink({
      view: 'piano-roll',
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
    const maxStep = track.notes.reduce(
      (max, n) => Math.max(max, n.step),
      -1
    );
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
    const maxBar = Math.max(
      MIN_BARS,
      ...this.tracks().map((t) => this.barCount(t)),
    ) - 1;
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
        hits.map((n) => n.id)
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
