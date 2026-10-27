import {
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

import { AudioSessionService } from "../audio-session.service";
import { MusicManagerService } from "../../services/music-manager.service";
import { HapticService } from "../../services/haptic.service";
import { SnackbarService } from "../../services/snackbar.service";
import { StudioBottomSheetComponent } from "../shared/studio-bottom-sheet/studio-bottom-sheet.component";

/** A scene column, projected from the pattern slots every channel owns. */
export interface SessionSceneView {
  id: string;
  index: number;
  name: string;
  color: string;
}

/** One channel × scene cell. A cell without a slot is a create target. */
export interface SessionClipView {
  id: string;
  trackId: string;
  sceneId: string;
  sceneIndex: number;
  name: string;
  isPlaying: boolean;
  color: string;
  hasContent: boolean;
  slotId: string | null;
}

interface SessionTrackView {
  id: string;
  name: string;
  muted: boolean;
  color: string;
}

const SCENE_COLORS = [
  "#0E7C7B",
  "#2BA09C",
  "#5DC4C2",
  "#8B5CF6",
  "#FF1A8C",
  "#FFB627",
  "#00A3FF",
  "#62D26F",
];

/**
 * Session View — the scene launcher.
 *
 * It used to run on a hardcoded clip list and a local scene list, so launching
 * a clip only flipped a flag in this component. Every cell here is now a real
 * channel/pattern pair: scenes are the pattern columns, launching a scene goes
 * through MusicManagerService (which switches the live patterns and makes
 * playback follow them), and follow actions are the manager's transport-driven
 * ones. There is deliberately no local autosave or duplicate session store —
 * project persistence belongs to ProjectWorkspaceService.
 */
@Component({
  selector: "app-session-view",
  standalone: true,
  imports: [CommonModule, FormsModule, StudioBottomSheetComponent],
  templateUrl: "./session-view.component.html",
  styleUrls: ["./session-view.component.css", "../shared/platform-ux.css"],
})
export class SessionViewComponent implements OnDestroy {
  private readonly audioSession = inject(AudioSessionService);
  private readonly musicManager = inject(MusicManagerService);
  private readonly haptic = inject(HapticService);
  private readonly snackbar = inject(SnackbarService);

  readonly transportPlaying = this.audioSession.isPlaying;
  readonly isRecording = this.audioSession.isRecording;
  readonly scenePlaybackActive = this.musicManager.scenePlaybackActive;
  readonly followEnabled = this.musicManager.sceneFollowEnabled;
  readonly followBars = this.musicManager.sceneFollowBars;
  readonly activeSceneColumn = this.musicManager.activeSceneColumn;

  // ── Launch quantization ─────────────────────────────────────────────
  launchQuantize = signal<"none" | "1bar" | "2bar" | "4bar">("none");
  quantizeOptions = ["none", "1bar", "2bar", "4bar"] as const;
  queuedSceneIndex = signal<number | null>(null);
  launchSettingsOpen = signal(false);

  private quantizeTimer: ReturnType<typeof setTimeout> | null = null;

  nextLaunchBoundaryLabel = computed(() => {
    const quantize = this.launchQuantize();
    if (!this.audioSession.isPlaying() || quantize === "none") {
      return "Immediate launch";
    }
    const bars = quantize === "1bar" ? 1 : quantize === "2bar" ? 2 : 4;
    const seconds = this.nextBarDelay(bars);
    return `Next ${bars === 1 ? "bar" : `${bars} bars`} · ${seconds.toFixed(1)}s`;
  });

  // ── Data: projected from the real channels ──────────────────────────
  readonly tracks = computed<SessionTrackView[]>(() =>
    this.musicManager
      .tracks()
      .filter((track) => track.type !== "audio")
      .map((track) => ({
        id: track.id,
        name: track.name,
        muted: !!track.muted,
        color: track.color || "#2BA09C",
      })),
  );

  readonly scenes = computed<SessionSceneView[]>(() => {
    const all = this.musicManager.tracks();
    const columns = this.musicManager.sceneColumnCount();
    return Array.from({ length: columns }, (_, index) => {
      const named = all
        .filter((track) => track.type !== "audio")
        .map((track) => track.patternSlots?.[index]?.name)
        .find((name): name is string => !!name && !!name.trim());
      return {
        id: `scene-${index}`,
        index,
        name: named ?? `Scene ${index + 1}`,
        color: SCENE_COLORS[index % SCENE_COLORS.length],
      };
    });
  });

  readonly clips = computed<SessionClipView[]>(() => {
    const active = this.activeSceneColumn();
    const playing = this.scenePlaybackActive();
    const cells: SessionClipView[] = [];
    for (const track of this.musicManager.tracks()) {
      if (track.type === "audio") continue;
      (track.patternSlots ?? []).forEach((slot, index) => {
        cells.push({
          id: `${track.id}@${slot.id}`,
          trackId: track.id,
          sceneId: `scene-${index}`,
          sceneIndex: index,
          name: slot.name,
          isPlaying: playing && active === index,
          color: SCENE_COLORS[index % SCENE_COLORS.length],
          hasContent: this.musicManager.patternSlotHasContent(track, slot),
          slotId: slot.id,
        });
      });
    }
    return cells;
  });

  getClipsForScene(sceneId: string): SessionClipView[] {
    return this.clips().filter((clip) => clip.sceneId === sceneId);
  }

  hasClipsForScene(sceneId: string): boolean {
    return this.getClipsForScene(sceneId).length > 0;
  }

  clipFor(trackId: string, sceneId: string): SessionClipView | undefined {
    return this.clips().find(
      (clip) => clip.trackId === trackId && clip.sceneId === sceneId,
    );
  }

  // ── Scene actions sheet ─────────────────────────────────────────────
  sceneActionSceneId = signal<string | null>(null);
  sceneNameInput = signal("");

  readonly actionScene = computed(() => {
    const id = this.sceneActionSceneId();
    return this.scenes().find((scene) => scene.id === id) ?? null;
  });

  openSceneActions(scene: SessionSceneView): void {
    this.sceneActionSceneId.set(scene.id);
    this.sceneNameInput.set(scene.name);
  }

  closeSceneActions(): void {
    this.sceneActionSceneId.set(null);
  }

  openLaunchSettings(): void {
    this.launchSettingsOpen.set(true);
  }

  closeLaunchSettings(): void {
    this.launchSettingsOpen.set(false);
  }

  setLaunchQuantize(value: string): void {
    if (
      this.quantizeOptions.includes(
        value as (typeof this.quantizeOptions)[number],
      )
    ) {
      this.launchQuantize.set(value as (typeof this.quantizeOptions)[number]);
    }
  }

  // ── Launch ──────────────────────────────────────────────────────────
  isSceneActive(scene: SessionSceneView): boolean {
    return (
      this.scenePlaybackActive() &&
      this.activeSceneColumn() === scene.index
    );
  }

  isSceneQueued(scene: SessionSceneView): boolean {
    return this.queuedSceneIndex() === scene.index;
  }

  sceneStateLabel(scene: SessionSceneView): string {
    if (this.isSceneQueued(scene)) return "Queued";
    if (this.isSceneActive(scene)) return "Playing";
    return "Ready";
  }

  sceneLaunchLabel(scene: SessionSceneView): string {
    if (this.isSceneQueued(scene)) return "Queued";
    if (this.isSceneActive(scene)) return "Stop";
    return "Launch";
  }

  launchScene(scene: SessionSceneView): void {
    this.haptic.medium();
    if (this.isSceneActive(scene)) {
      this.stopAll();
      return;
    }
    const delay = this.nextBarDelay(
      this.launchQuantize() === "1bar"
        ? 1
        : this.launchQuantize() === "2bar"
          ? 2
          : 4,
    );
    if (delay > 0) {
      this.queuedSceneIndex.set(scene.index);
      this.clearQuantizeTimer();
      this.quantizeTimer = setTimeout(() => {
        this.quantizeTimer = null;
        this.commitSceneLaunch(scene);
      }, delay * 1000);
      this.snackbar.info(
        `Scene “${scene.name}” queued — starts in ${delay.toFixed(1)}s`,
      );
      return;
    }
    this.commitSceneLaunch(scene);
  }

  private commitSceneLaunch(scene: SessionSceneView): void {
    this.queuedSceneIndex.set(null);
    const switched = this.musicManager.launchSceneColumn(scene.index);
    if (switched === 0) {
      this.snackbar.info(`Scene “${scene.name}” has no material yet`);
      return;
    }
    if (!this.audioSession.isPlaying()) this.audioSession.togglePlay();
    this.snackbar.info(`Scene “${scene.name}” launched`);
  }

  triggerLabelFor(trackId: string, sceneId: string): string {
    const clip = this.clipFor(trackId, sceneId);
    if (!clip) return "Empty clip";
    return `${clip.isPlaying ? "Stop" : "Launch"} ${clip.name}`;
  }

  /** Launch one cell: that channel switches, playback follows the scene. */
  triggerClip(clip: SessionClipView): void {
    this.haptic.light();
    if (!clip.slotId) {
      this.createClip(clip);
      return;
    }
    const switched = this.musicManager.launchClipPattern(
      clip.trackId,
      clip.slotId,
    );
    if (!switched) return;
    if (!this.audioSession.isPlaying()) this.audioSession.togglePlay();
    this.snackbar.info(`${clip.name} launched`);
  }

  /** Empty cell: add a pattern to this channel for the scene column. */
  createClip(clip: SessionClipView): void {
    const created = this.musicManager.createPatternSlot(
      clip.trackId,
      this.scenes()[clip.sceneIndex]?.name,
    );
    if (!created) {
      this.snackbar.error("Could not add a pattern to this channel");
      return;
    }
    this.haptic.medium();
  }

  // ── Follow actions (transport-driven, in the manager) ───────────────
  toggleFollow(): void {
    this.musicManager.sceneFollowEnabled.update((on) => !on);
    this.haptic.light();
  }

  setFollowBars(delta: number): void {
    const next = Math.min(32, Math.max(1, this.followBars() + delta));
    this.musicManager.sceneFollowBars.set(next);
    this.haptic.light();
  }

  stopAll(): void {
    this.haptic.medium();
    this.clearQuantizeTimer();
    this.queuedSceneIndex.set(null);
    this.musicManager.stopScenePlayback();
    if (this.audioSession.isPlaying()) this.audioSession.togglePlay();
    this.snackbar.info("Session stopped");
  }

  backToSong(): void {
    this.haptic.light();
    this.musicManager.backToArrangement();
    this.snackbar.info("Back to the arrangement");
  }

  toggleMute(track: SessionTrackView, event: Event): void {
    event.stopPropagation();
    this.musicManager.toggleMute(track.id);
    this.haptic.light();
  }

  // ── Scene CRUD against the pattern rack ─────────────────────────────
  renameSelectedScene(): void {
    const scene = this.actionScene();
    if (!scene) return;
    const name = this.sceneNameInput().trim();
    if (!name) {
      this.snackbar.warning("Scene name cannot be empty");
      return;
    }
    let renamed = 0;
    for (const track of this.musicManager.tracks()) {
      const slot = track.patternSlots?.[scene.index];
      if (!slot) continue;
      if (this.musicManager.renamePatternSlot(track.id, slot.id, name)) {
        renamed++;
      }
    }
    this.closeSceneActions();
    if (renamed === 0) {
      this.snackbar.error("No channel owns this scene");
      return;
    }
    this.snackbar.success(`Scene renamed to “${name}”`);
  }

  duplicateSelectedScene(): void {
    const scene = this.actionScene();
    if (!scene) return;
    let copies = 0;
    for (const track of this.musicManager.tracks()) {
      if (track.type === "audio") continue;
      const slot = track.patternSlots?.[scene.index];
      if (!slot) continue;
      const copy = this.musicManager.duplicatePatternSlot(track.id, slot.id);
      if (copy) copies++;
    }
    this.closeSceneActions();
    if (copies === 0) {
      this.snackbar.error("No pattern to duplicate");
      return;
    }
    this.snackbar.success(`Scene “${scene.name}” duplicated`);
  }

  deleteSelectedScene(): void {
    const scene = this.actionScene();
    if (!scene) return;
    let removed = 0;
    for (const track of this.musicManager.tracks()) {
      if (track.type === "audio") continue;
      const slot = track.patternSlots?.[scene.index];
      if (!slot) continue;
      const error = this.musicManager.deletePatternSlot(track.id, slot.id);
      // Refusing the last pattern on a channel is expected; keep going.
      if (!error) removed++;
    }
    this.closeSceneActions();
    if (removed === 0) {
      this.snackbar.error("Nothing could be deleted from this scene");
      return;
    }
    this.snackbar.success(`Scene “${scene.name}” deleted`);
  }

  launchSelectedScene(): void {
    const scene = this.actionScene();
    if (!scene) return;
    this.closeSceneActions();
    this.launchScene(scene);
  }

  /** Add a scene by adding a pattern to every pattern-bearing channel. */
  addScene(): void {
    const tracks = this.musicManager
      .tracks()
      .filter((track) => track.type !== "audio");
    if (tracks.length === 0) {
      this.snackbar.info("Add a channel before adding a scene");
      return;
    }
    const name = `Scene ${this.scenes().length + 1}`;
    let added = 0;
    for (const track of tracks) {
      if (this.musicManager.createPatternSlot(track.id, name)) added++;
    }
    this.haptic.medium();
    this.snackbar.success(`${name} added to ${added} channel${added === 1 ? "" : "s"}`);
  }

  // ── Helpers ─────────────────────────────────────────────────────────
  private nextBarDelay(bars: number): number {
    if (this.launchQuantize() === "none" || !this.audioSession.isPlaying()) {
      return 0;
    }
    const tempo = this.audioSession.engine.tempo() || 120;
    const secondsPerBar = (60 / tempo) * 4;
    const step = this.audioSession.engine.visualStep?.() ?? 0;
    const stepsPerBar = 16;
    const stepsIntoBar = step % stepsPerBar;
    const totalSteps = bars * stepsPerBar;
    const stepsToNext = (totalSteps - stepsIntoBar) % totalSteps || totalSteps;
    return Math.max(0.05, (stepsToNext / stepsPerBar) * secondsPerBar);
  }

  private clearQuantizeTimer(): void {
    if (this.quantizeTimer) clearTimeout(this.quantizeTimer);
    this.quantizeTimer = null;
  }

  ngOnDestroy(): void {
    this.clearQuantizeTimer();
  }

  trackByScene = (_index: number, scene: SessionSceneView) => scene.id;
  trackByTrackId = (_index: number, track: { id: string }) => track.id;
  trackByCell = (
    _index: number,
    cell: { trackId: string; sceneId: string },
  ) => `${cell.trackId}:${cell.sceneId}`;
}
