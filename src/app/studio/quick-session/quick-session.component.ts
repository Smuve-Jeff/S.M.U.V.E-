import {
  Component,
  HostListener,
  computed,
  inject,
  output,
  signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

import { AudioSessionService } from "../audio-session.service";
import { RecordingStatusService } from "../recording-status.service";
import {
  MusicManagerService,
  type PatternSlot,
  type TrackModel,
} from "../../services/music-manager.service";
import { AudioEngineService } from "../../services/audio-engine.service";
import { InstrumentsService } from "../../services/instruments.service";
import {
  IdeasGeneratorService,
  type IdeaRecipe,
} from "../../services/ideas-generator.service";
import { HapticService } from "../../services/haptic.service";
import { SnackbarService } from "../../services/snackbar.service";

/**
 * Quick Session — the one-screen workspace for "make something now".
 *
 * The full Studio is a DAW: a rail of sixteen surfaces, several toolbars per
 * surface and an inspector. That is the right shape once a song exists and the
 * wrong shape when the artist just wants to record a take or drop a beat on a
 * phone. This surface keeps the *core* loop — transport, tempo, channels,
 * record, one-tap starters — on the single screen, and moves everything
 * secondary (the rest of the instrument library, mixing, mastering, export,
 * the other editors) into two side panels that open over the workspace instead
 * of shrinking it.
 *
 * Nothing here is a second source of truth: every control writes through the
 * same services the full views use, so a channel renamed or armed here is the
 * same channel the Mixer and Arrangement see.
 */

export type QuickSessionPanel = "sounds" | "tools" | null;

/** Widest scene grid on the core screen before it stops being scannable. */
const MAX_SCENE_COLUMNS = 8;

interface QuickSceneCell {
  /** `${trackId}:${column}` — stable across pattern renames. */
  key: string;
  trackId: string;
  column: number;
  /** null = the column is empty for this channel (a one-tap "create"). */
  slotId: string | null;
  name: string;
  active: boolean;
  /** A launched scene only switches channels that actually have notes here. */
  hasContent: boolean;
  clipCount: number;
}

interface QuickSceneRow {
  track: TrackModel;
  cells: QuickSceneCell[];
}

interface QuickInstrument {
  id: string;
  name: string;
  category: string;
  type: "midi" | "drum";
}

/** The instruments worth one tap on the core screen (the rest live in Sounds). */
const CORE_INSTRUMENT_IDS = [
  "grand-piano",
  "analog-warmth",
  "sub-commander",
  "trap-808-elite",
  "modern-kit-elite",
  "cyber-stab",
];

/** Advanced destinations, ordered by how often a finishing pass goes there. */
const TOOL_LINKS: { view: string; label: string; icon: string; hint: string }[] =
  [
    {
      view: "arrangement",
      label: "Arrangement",
      icon: "view_timeline",
      hint: "Lay the song out over bars",
    },
    {
      view: "piano-roll",
      label: "Piano Roll",
      icon: "piano",
      hint: "Write and edit notes",
    },
    {
      view: "drum-machine",
      label: "Drums",
      icon: "grid_view",
      hint: "Step-program the kit",
    },
    {
      view: "mixer",
      label: "Mixer",
      icon: "tune",
      hint: "Levels, sends and buses",
    },
    {
      view: "effects-rack",
      label: "Effects",
      icon: "graphic_eq",
      hint: "Insert chain per channel",
    },
    {
      view: "mastering",
      label: "Mastering",
      icon: "waves",
      hint: "Loudness and delivery",
    },
    {
      view: "vocal-suite",
      label: "Vocals",
      icon: "mic",
      hint: "Pitch, comp and tune",
    },
    {
      view: "export",
      label: "Export",
      icon: "download",
      hint: "WAV, MP3, FLAC, MIDI",
    },
  ];

@Component({
  selector: "app-quick-session",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./quick-session.component.html",
  styleUrls: ["./quick-session.component.css", "../shared/platform-ux.css"],
})
export class QuickSessionComponent {
  private readonly audioSession = inject(AudioSessionService);
  private readonly audioEngine = inject(AudioEngineService);
  private readonly musicManager = inject(MusicManagerService);
  private readonly instruments = inject(InstrumentsService);
  private readonly ideas = inject(IdeasGeneratorService);
  private readonly recordingStatus = inject(RecordingStatusService);
  private readonly haptic = inject(HapticService);
  private readonly snackbar = inject(SnackbarService);

  /** Ask the shell to switch surfaces (advanced tools, editors, export). */
  readonly openView = output<string>();
  /**
   * Recipe starters go through the shell so it can snapshot a dirty sketch
   * before the canvas is replaced — this surface must never be the place an
   * idea disappears.
   */
  readonly useRecipe = output<string>();

  // ── Core state (mirrors the live services, never a copy) ────────────
  readonly isPlaying = this.audioSession.isPlaying;
  readonly isRecording = this.audioSession.isRecording;
  readonly tempo = this.audioEngine.tempo;
  readonly tracks = this.musicManager.tracks;
  readonly selectedTrackId = this.musicManager.selectedTrackId;
  readonly masterVolume = this.audioSession.masterVolume;
  readonly metronomeOn = this.audioEngine.metronomeEnabled;
  readonly loopOn = this.audioEngine.playbackLoopEnabled;
  readonly scenePlaybackActive = this.musicManager.scenePlaybackActive;
  readonly activeSceneColumn = this.musicManager.activeSceneColumn;
  readonly followEnabled = this.musicManager.sceneFollowEnabled;
  readonly followBars = this.musicManager.sceneFollowBars;

  readonly panel = signal<QuickSessionPanel>(null);

  readonly coreInstruments = computed<QuickInstrument[]>(() => {
    const presets = this.instruments.getPresets();
    const picked = CORE_INSTRUMENT_IDS.map((id) =>
      presets.find((preset) => preset.id === id),
    ).filter((preset): preset is NonNullable<typeof preset> => !!preset);
    const list = picked.length >= 4 ? picked : presets.slice(0, 6);
    return list.map((preset) => ({
      id: preset.id,
      name: preset.name,
      category: preset.category ?? "",
      type:
        preset.category === "drum" || preset.category === "perc"
          ? "drum"
          : "midi",
    }));
  });

  /** Full library, grouped for the Sounds panel. */
  readonly instrumentGroups = computed(() => {
    const groups = new Map<string, QuickInstrument[]>();
    for (const preset of this.instruments.getPresets()) {
      const key = preset.category || "more";
      const list = groups.get(key) ?? [];
      list.push({
        id: preset.id,
        name: preset.name,
        category: key,
        type:
          preset.category === "drum" || preset.category === "perc"
            ? "drum"
            : "midi",
      });
      groups.set(key, list);
    }
    return [...groups.entries()].map(([label, items]) => ({ label, items }));
  });

  /** Four starters: enough choice without becoming a browsing session. */
  readonly recipes = computed(() => this.ideas.recipes.slice(0, 4));

  readonly toolLinks = TOOL_LINKS;

  // ── Scene grid (patterns per channel, wired to the live tracks) ─────
  /**
   * Columns follow the channel with the most patterns, so the grid grows as
   * patterns are added — never as a fixed 8-slot template of empty cells.
   */
  /** Audio channels have no pattern grid; MIDI and drum channels do. */
  private readonly sceneTracks = computed(() =>
    this.tracks().filter((track) => track.type !== "audio"),
  );

  readonly sceneColumns = computed(() => {
    const widths = this.sceneTracks().map(
      (track) => (track.patternSlots ?? []).length,
    );
    const widest = widths.length ? Math.max(...widths) : 0;
    return Array.from(
      { length: Math.min(MAX_SCENE_COLUMNS, Math.max(2, widest)) },
      (_, index) => index,
    );
  });

  readonly sceneRows = computed<QuickSceneRow[]>(() =>
    this.sceneTracks().map((track) => ({
      track,
      cells: this.sceneColumns().map((column) =>
        this.sceneCell(track, column),
      ),
    })),
  );

  /** At least one channel on the grid, so the card can show a real empty state. */
  readonly hasSceneChannels = computed(() => this.sceneTracks().length > 0);

  readonly trackCount = computed(() => this.tracks().length);
  readonly armedCount = computed(
    () => this.recordingStatus.armedTrackIds().size,
  );

  // ── Transport ───────────────────────────────────────────────────────
  togglePlay(): void {
    this.haptic.light();
    this.audioSession.togglePlay();
  }

  async toggleRecord(): Promise<void> {
    this.haptic.medium();
    await this.audioSession.toggleRecord();
  }

  setTempo(delta: number): void {
    const next = Math.min(240, Math.max(40, Math.round(this.tempo() + delta)));
    if (next === this.tempo()) return;
    this.audioEngine.tempo.set(next);
    this.haptic.light();
  }

  onTempoInput(value: string | number): void {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    this.audioEngine.tempo.set(Math.min(240, Math.max(40, Math.round(parsed))));
  }

  // ── Starters ────────────────────────────────────────────────────────
  startRecipe(recipe: IdeaRecipe): void {
    this.haptic.medium();
    this.useRecipe.emit(recipe.id);
  }

  // ── Channels ────────────────────────────────────────────────────────
  selectTrack(track: TrackModel): void {
    this.musicManager.selectedTrackId.set(track.id);
  }

  isSelected(track: TrackModel): boolean {
    return this.selectedTrackId() === track.id;
  }

  toggleMute(track: TrackModel, event: Event): void {
    event.stopPropagation();
    this.musicManager.toggleMute(track.id);
    this.haptic.light();
  }

  toggleSolo(track: TrackModel, event: Event): void {
    event.stopPropagation();
    this.musicManager.toggleSolo(track.id);
    this.haptic.light();
  }

  /** Record-arm is a mixer-wide concept, so it lives in the shared service. */
  toggleArm(track: TrackModel, event: Event): void {
    event.stopPropagation();
    this.recordingStatus.toggleArmTrack(track.id);
    this.haptic.medium();
  }

  isArmed(track: TrackModel): boolean {
    return this.recordingStatus.isTrackArmed(track.id);
  }

  onVolume(track: TrackModel, value: string | number): void {
    const gain = Number(value) / 100;
    if (!Number.isFinite(gain)) return;
    this.musicManager.updateVolume(track.id, Math.min(1.5, Math.max(0, gain)));
  }

  volumePercent(track: TrackModel): number {
    return Math.round((track.gain ?? 0.8) * 100);
  }

  openEditor(track: TrackModel, view: "piano-roll" | "arrangement"): void {
    this.musicManager.selectedTrackId.set(track.id);
    this.openView.emit(view);
    this.closePanel();
  }

  /** Add a channel from the core grid or the Sounds panel. */
  addInstrument(instrument: QuickInstrument): void {
    const id = this.musicManager.addTrack(
      instrument.name,
      instrument.id,
      instrument.type,
    );
    if (id) {
      this.musicManager.selectedTrackId.set(id);
      this.haptic.medium();
      this.snackbar.success(`${instrument.name} added`);
    }
    this.closePanel();
  }

  /** Stable identities so meter polling and edits do not rebuild the list. */
  trackById(_index: number, track: TrackModel): string {
    return track.id;
  }

  byId(_index: number, item: { id: string }): string {
    return item.id;
  }

  byView(_index: number, link: { view: string }): string {
    return link.view;
  }

  // ── Scene grid ──────────────────────────────────────────────────────
  private sceneCell(track: TrackModel, column: number): QuickSceneCell {
    const slots = track.patternSlots ?? [];
    const slot: PatternSlot | undefined = slots[column];
    const slotId = slot?.id ?? null;
    return {
      key: `${track.id}:${column}`,
      trackId: track.id,
      column,
      slotId,
      name: slot?.name ?? `Scene ${column + 1}`,
      active: !!slotId && track.activePatternSlotId === slotId,
      hasContent: slot ? this.musicManager.patternSlotHasContent(track, slot) : false,
      clipCount: slotId
        ? track.clips.filter((clip) => clip.patternSlotId === slotId).length
        : 0,
    };
  }

  /** Tap a cell: edit that pattern (or create it), never start playback. */
  openSceneCell(row: QuickSceneRow, cell: QuickSceneCell): void {
    this.musicManager.selectedTrackId.set(cell.trackId);
    this.haptic.light();
    if (!cell.slotId) {
      const created = this.musicManager.createPatternSlot(
        cell.trackId,
        cell.name,
      );
      if (!created) {
        this.snackbar.error("Could not add a pattern to this channel");
        return;
      }
      this.snackbar.info(`${cell.name} · ${row.track.name}`);
      return;
    }
    if (!cell.active) {
      this.musicManager.setActivePatternSlot(cell.trackId, cell.slotId);
      this.snackbar.info(`Editing ${cell.name} · ${row.track.name}`);
    }
  }

  /** Add another pattern to one channel, past the last column. */
  addPattern(track: TrackModel): void {
    this.musicManager.selectedTrackId.set(track.id);
    const created = this.musicManager.createPatternSlot(track.id);
    if (!created) {
      this.snackbar.error("Could not add a pattern to this channel");
      return;
    }
    this.haptic.medium();
    this.snackbar.success(`New pattern on ${track.name}`);
  }

  /**
   * Launch a column: every channel with real material in that scene switches
   * to it, and the transport starts if it was stopped. Channels without that
   * scene are deliberately left alone — a scene launch must not silence a
   * channel that is already carrying the song.
   */
  /**
   * Launch a scene for real: the manager switches the channels that have
   * material and playback follows those live patterns, so what is launched is
   * what is heard (not just a highlighted cell).
   */
  launchScene(column: number): void {
    const switched = this.musicManager.launchSceneColumn(column);
    this.haptic.medium();
    if (switched === 0) {
      this.snackbar.info(`Scene ${column + 1} has nothing to launch`);
      return;
    }
    if (!this.isPlaying()) this.audioSession.togglePlay();
    this.snackbar.success(
      `Scene ${column + 1} launched · ${switched} channel${switched === 1 ? "" : "s"}`,
    );
  }

  /** Leave the live scene and play the arrangement again. */
  backToSong(): void {
    this.musicManager.backToArrangement();
    this.haptic.medium();
    this.snackbar.info("Back to the arrangement");
  }

  isSceneActive(column: number): boolean {
    return (
      this.scenePlaybackActive() &&
      this.musicManager.activeSceneColumn() === column
    );
  }

  toggleFollow(): void {
    this.musicManager.sceneFollowEnabled.update((on) => !on);
    this.haptic.light();
  }

  setFollowBars(delta: number): void {
    const next = Math.min(32, Math.max(1, this.followBars() + delta));
    this.musicManager.sceneFollowBars.set(next);
    this.haptic.light();
  }

  sceneRowId(_index: number, row: QuickSceneRow): string {
    return row.track.id;
  }

  cellId(_index: number, cell: QuickSceneCell): string {
    return cell.key;
  }

  columnId(_index: number, column: number): number {
    return column;
  }

  // ── Side panels ─────────────────────────────────────────────────────
  togglePanel(panel: Exclude<QuickSessionPanel, null>): void {
    this.panel.update((current) => (current === panel ? null : panel));
    this.haptic.light();
  }

  closePanel(): void {
    this.panel.set(null);
  }

  @HostListener("document:keydown.escape")
  onEscape(): void {
    if (this.panel()) this.closePanel();
  }

  goTo(view: string): void {
    this.openView.emit(view);
    this.closePanel();
  }

  // ── Advanced (still real controls, not links) ───────────────────────
  onMasterVolume(value: string | number): void {
    const level = Number(value);
    if (!Number.isFinite(level)) return;
    this.audioSession.updateMasterVolume(Math.min(100, Math.max(0, level)));
  }

  toggleMetronome(): void {
    this.audioEngine.toggleMetronome();
    this.haptic.light();
  }

  toggleLoop(): void {
    this.audioEngine.togglePlaybackLoop();
    this.haptic.light();
  }

  stopSession(): void {
    this.audioSession.stop();
    this.haptic.light();
    this.snackbar.info("Stopped — nothing is playing");
  }
}
