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
