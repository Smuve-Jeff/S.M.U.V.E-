import { CommonModule } from "@angular/common";
import {
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  inject,
  signal,
} from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

import { AudioSessionService } from "../audio-session.service";
import {
  LocalProjectSummary,
  ProjectVersionSummary,
  ProjectWorkspaceService,
} from "../project-workspace.service";
import { RecordingStatusService } from "../recording-status.service";
import { AudioEngineService } from "../../services/audio-engine.service";
import { AuthService } from "../../services/auth.service";
import { CollaborationService } from "../../services/collaboration.service";
import { HistoryService } from "../../services/history.service";
import { MusicManagerService } from "../../services/music-manager.service";
import { InteractionDialogService } from "../../services/interaction-dialog.service";
import { SnackbarService } from "../../services/snackbar.service";

import { AiProduceComponent } from "../../components/ai-produce/ai-produce.component";
import { ArrangementViewComponent } from "../arrangement-view/arrangement-view.component";
import { AudioRecorderViewComponent } from "../audio-recorder-view/audio-recorder-view.component";
import { BezierEditorComponent } from "../automation/bezier-editor.component";
import { EffectsRackUiComponent } from "../effects-rack-ui/effects-rack-ui.component";
import { InspectorComponent } from "../inspector/inspector.component";
import { MixerComponent } from "../mixer/mixer.component";
import { PianoRollComponent } from "../piano-roll/piano-roll.component";
import { PluginStoreComponent } from "../plugin-store/plugin-store.component";
import { SamplerComponent } from "../sampler/sampler.component";
import { AiAssistantComponent } from "../shared/ai-assistant/ai-assistant.component";
import { SnackbarComponent } from "../shared/snackbar/snackbar.component";
import { SoundBrowserComponent } from "../sound-browser/sound-browser.component";
import { SynthesizerComponent } from "../synthesizer/synthesizer.component";
import {
  StudioPageMode,
  studioAssistantContextForMode,
  studioModeForView,
} from "../studio-view-modes";
import {
  STUDIO_SURFACE_GROUPS,
  type StudioSurfaceId,
} from "../studio-surfaces";
import { StudioExportSurfaceComponent } from "./studio-export-surface.component";
import { ownsSpaceKey } from "./space-key-owner";

type StudioMode = StudioPageMode;
type TransportState = "stopped" | "playing" | "recording";
type SaveStatus = "saved" | "saving" | "error";
/** Where this page sends a surface it does not render itself. */
type SurfaceTarget =
  | { kind: "mode"; mode: StudioMode }
  | { kind: "tool"; tool: AdvancedTool }
  | { kind: "rack" }
  | { kind: "route" };

type AdvancedTool =
  | "synth"
  | "plugins"
  | "sampler"
  | "sound-browser"
  | "ai-produce";

interface ProjectPanelFeedback {
  tone: "ok" | "error";
  text: string;
}

@Component({
  selector: "app-studio-page",
  standalone: true,
  imports: [
    CommonModule,
    AiAssistantComponent,
    AiProduceComponent,
    ArrangementViewComponent,
    AudioRecorderViewComponent,
    BezierEditorComponent,
    EffectsRackUiComponent,
    InspectorComponent,
    MixerComponent,
    PianoRollComponent,
    PluginStoreComponent,
    SamplerComponent,
    SnackbarComponent,
    SoundBrowserComponent,
    StudioExportSurfaceComponent,
    SynthesizerComponent,
  ],
  templateUrl: "./studio-page.component.html",
  styleUrls: ["./studio-page.component.css"],
})
export class StudioPageComponent {
  readonly audioSession = inject(AudioSessionService);
  readonly audioEngine = inject(AudioEngineService);
  readonly projectWorkspace = inject(ProjectWorkspaceService);
  private readonly recordingStatus = inject(RecordingStatusService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly collaboration = inject(CollaborationService);
  private readonly auth = inject(AuthService);
  private readonly snackbar = inject(SnackbarService);
  private readonly dialog = inject(InteractionDialogService);
  /** The track graph for a fresh session; the workspace only owns metadata. */
  readonly musicManager = inject(MusicManagerService);
  /** Every edit surface (piano roll, arrangement, inspector) pushes here. */
  readonly history = inject(HistoryService);

  @ViewChild("importInput") importInput?: ElementRef<HTMLInputElement>;

  readonly activeMode = signal<StudioMode>("arrange");
  readonly inspectorOpen = signal(true);
  readonly inspectorCollapsed = signal(false);
  readonly advancedToolsOpen = signal(false);
  readonly projectPanelOpen = signal(false);
  readonly collaborationPanelOpen = signal(false);
  readonly exportPanelOpen = signal(false);
  readonly aiAssistantOpen = signal(false);
  /** The keyboard cheat sheet. Top of the dismissal stack (see below). */
  readonly shortcutsOpen = signal(false);

  /** Full-surface overlays launched from the inspector / advanced tools. */
  readonly fxRackOpen = signal(false);
  readonly activeTool = signal<AdvancedTool | null>(null);
  /** Automation lane the bezier editor is open on; empty = no lane picked. */
  readonly bezierLaneId = signal("");
  readonly bezierOpen = signal(false);

  readonly localProjects = signal<LocalProjectSummary[]>([]);
  readonly projectPanelBusy = signal(false);
  readonly projectFeedback = signal<ProjectPanelFeedback | null>(null);

  readonly versionsOpen = signal(false);
  readonly versions = signal<ProjectVersionSummary[]>([]);
  readonly versionsBusy = signal(false);
  readonly versionsFeedback = signal<ProjectPanelFeedback | null>(null);

  /**
   * Any docked slide-over. They share one dismissal affordance — a scrim over
   * the workspace between the bars, plus Escape — because on a phone the Close
   * button is a small target in the far corner of a sheet.
   */
  readonly panelsOpen = computed(
    () =>
      this.advancedToolsOpen() ||
      this.projectPanelOpen() ||
      this.collaborationPanelOpen() ||
      this.exportPanelOpen() ||
      this.aiAssistantOpen(),
  );

  /**
   * The Compose Assistant keys its quick actions by classic view id, not by page
   * mode, so it is handed the view each mode stands in for.
   */
  readonly assistantContext = computed(() =>
    studioAssistantContextForMode(this.activeMode()),
  );

  readonly joinCode = signal("");
  readonly collabBusy = signal(false);
  readonly collabFeedback = signal<ProjectPanelFeedback | null>(null);
  readonly enabledPermissions = computed(() =>
    Object.entries(this.collaboration.currentPermissions())
      .filter(([, enabled]) => enabled)
      .map(([permission]) => permission),
  );

  readonly modes: ReadonlyArray<{
    id: StudioMode;
    label: string;
    icon: string;
  }> = [
    { id: "create", label: "Create", icon: "auto_awesome" },
    { id: "arrange", label: "Arrange", icon: "view_quilt" },
    { id: "keys", label: "Keys", icon: "piano" },
    { id: "mix", label: "Mix", icon: "tune" },
    { id: "export", label: "Export", icon: "download" },
  ];

  /** Live transport state — owned by AudioSessionService, not this page. */
  readonly transportState = this.audioSession.playbackState;
  /** Tempo comes from the engine so a change here and in the studio stay in sync. */
  readonly tempo = this.audioEngine.tempo;
  readonly loopEnabled = this.audioEngine.playbackLoopEnabled;
  readonly metronomeEnabled = this.audioEngine.metronomeEnabled;

  readonly projectDirty = this.projectWorkspace.isDirty;
  readonly projectName = computed(
    () => this.projectWorkspace.metadata()?.name || "Current Project",
  );
  readonly metadata = this.projectWorkspace.metadata;

  readonly saveStatus = computed<SaveStatus>(() => {
    if (this.projectWorkspace.isSaving()) return "saving";
    if (this.projectWorkspace.persistenceError()) return "error";
    return "saved";
  });

  /**
   * The persistent failure the classic shell surfaces as a banner. On this page
   * the chip alone was the only trace of it — and a chip is not a warning: local
   * persistence fails on quota exhaustion and in private windows, where the only
   * copy of the project is the one in memory.
   */
  readonly saveError = this.projectWorkspace.persistenceError;

  /** Human readout for the save chip and the transport's live region. */
  readonly saveStateLabel = computed(() => {
    if (this.projectWorkspace.isSaving()) return "Saving…";
    if (this.projectWorkspace.persistenceError()) return "Save failed";
    if (this.projectWorkspace.isDirty()) return "Unsaved";
    return this.projectWorkspace.lastPersistedAt() > 0 ? "Saved" : "New";
  });

  /** 4/4 readout over the engine's 16-step bar, matching the studio transport. */
  readonly position = computed(() => {
    const step = this.audioEngine.visualStep();
    return {
      bar: Math.floor(step / 16) + 1,
      beat: Math.floor((step % 16) / 4) + 1,
    };
  });

  readonly masterLevel = computed(() =>
    Math.max(0, Math.min(1, this.recordingStatus.masterLevelLinear())),
  );

  constructor() {
    // `/studio?view=…` deep links from the hub, the AI surfaces and total
    // control land on the matching mode instead of always opening Arrange.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const mode = studioModeForView(params.get("view"));
      if (mode) this.setMode(mode);
    });
  }

  setMode(mode: StudioMode) {
    this.activeMode.set(mode);
    this.projectPanelOpen.set(false);
    this.collaborationPanelOpen.set(false);
    this.exportPanelOpen.set(false);
    this.advancedToolsOpen.set(false);
    this.fxRackOpen.set(false);
    this.activeTool.set(null);
    this.bezierOpen.set(false);
    this.versionsOpen.set(false);
    this.aiAssistantOpen.set(false);
  }

  async toggleTransport(state: TransportState) {
    if (state === "stopped") {
      this.audioSession.stop();
      return;
    }

    if (state === "recording") {
      await this.audioSession.toggleRecord();
      return;
    }

    if (this.audioSession.isPlaying()) return;

    // Autoplay policy: the AudioContext must resume inside the click gesture.
    await this.audioEngine.resume();
    this.audioSession.togglePlay();
  }

  toggleLoop() {
    this.loopEnabled.update((enabled) => !enabled);
  }

  toggleMetronome() {
    this.metronomeEnabled.update((enabled) => !enabled);
  }

  undo() {
    this.history.undo();
  }

  redo() {
    this.history.redo();
  }

  async save() {
    if (this.projectWorkspace.isSaving()) return;

    try {
      await this.projectWorkspace.manualSave();
    } catch {
      // ProjectWorkspaceService records the failure in persistenceError(),
      // which saveStatus() surfaces to the top bar and transport.
    }
  }

  /**
   * Retry from the save-failure banner. `manualSave()` clears
   * `persistenceError()` on success, so the banner goes away by itself; the
   * snackbar is the confirmation that the tap did something.
   */
  /**
   * A fresh session — the one destructive action on this surface, so it carries
   * two guards. First, consent: nothing is thrown away without an explicit
   * confirmation. Second, a copy: a dirty session is written to Local Sets before
   * it is replaced, the same rule the mobile quick-start lane follows, so "new
   * project" can never be the place where an idea disappears.
   *
   * Order matters. `startFreshProject()` captures a state signature from the
   * track graph, and `MusicManagerService.newProject()` runs through the command
   * stack, so the history has to be cleared *after* both or Undo would step back
   * into the project the user just left.
   */
  async newProject() {
    const dirty = this.projectWorkspace.isDirty();

    const confirmed = await this.dialog.confirm({
      title: "New project",
      message: dirty
        ? "Start a fresh session? Your current work is saved to Local Sets first, so you can reopen it from this panel."
        : "Start a fresh session with an empty piano and drum track?",
      confirmLabel: "Start fresh",
      cancelLabel: "Cancel",
      // Same affordance as the import flow: this discards the open session.
      tone: "danger",
    });
    if (!confirmed) return;

    if (dirty) {
      try {
        await this.projectWorkspace.autoSave();
        await this.refreshLocalProjects();
      } catch {
        // Best effort: the confirmation above is consent to replace the session
        // even if the copy could not be written.
      }
    }

    this.musicManager.newProject();
    this.projectWorkspace.startFreshProject({ bpm: this.audioEngine.tempo() });
    this.history.clear();
    // The fresh canvas is exactly where the nudge belongs again.
    this.sessionHintDismissed.set(false);
    this.closePanels();
    this.snackbar.success("New session created");
  }

  /**
   * A session with lanes but nothing on the timeline.
   *
   * The arrangement view has its own empty-state card, but it only renders for a
   * session with *zero tracks* — and a fresh project starts with Piano + Drums,
   * so "New project" lands on two empty lanes with no cue about what to do next.
   * This is the same moment, one track later.
   */
  readonly arrangementEmpty = computed(
    () =>
      this.musicManager.tracks().length > 0 &&
      this.musicManager.tracks().every(
        (track) => (track.clips?.length ?? 0) === 0,
      ),
  );

  /** Dismissible: a nudge, not a modal. It must never follow the user around. */
  private readonly sessionHintDismissed = signal(false);

  readonly showSessionHint = computed(
    () => this.arrangementEmpty() && !this.sessionHintDismissed(),
  );

  dismissSessionHint() {
    this.sessionHintDismissed.set(true);
  }

  /**
   * How this page reaches every surface in the shared catalogue.
   *
   * Some are hosted here (as a mode, an overlay tool, or the FX rack); the rest
   * are routed to the classic shell, which renders all of them. The `Record`
   * makes the mapping exhaustive at compile time and the catalogue test holds it
   * against the shell — a surface can no longer exist with no way in.
   */
  readonly surfaceTargets: Record<StudioSurfaceId, SurfaceTarget> = {
    // Rendered by this page as a workspace mode.
    arrangement: { kind: "mode", mode: "arrange" },
    "piano-roll": { kind: "mode", mode: "keys" },
    mixer: { kind: "mode", mode: "mix" },
    "audio-recorder": { kind: "mode", mode: "create" },
    // Rendered by this page as a full-surface tool.
    synthesizer: { kind: "tool", tool: "synth" },
    plugins: { kind: "tool", tool: "plugins" },
    sampler: { kind: "tool", tool: "sampler" },
    "sound-browser": { kind: "tool", tool: "sound-browser" },
    "ai-produce": { kind: "tool", tool: "ai-produce" },
    "effects-rack": { kind: "rack" },
    // Hosted by the classic shell; reached by route, never by a dead end.
    session: { kind: "route" },
    "drum-machine": { kind: "route" },
    "channel-rack": { kind: "route" },
    "vocal-suite": { kind: "route" },
    dj: { kind: "route" },
    performance: { kind: "route" },
    mastering: { kind: "route" },
    "sound-pad": { kind: "route" },
    "chord-editor": { kind: "route" },
    score: { kind: "route" },
    "sample-library": { kind: "route" },
    performer: { kind: "route" },
  };

  /** Every workflow stage, straight from the shared catalogue. */
  readonly surfaceGroups = STUDIO_SURFACE_GROUPS;

  /** Rows that leave the page say so, so the list is not a surprise. */
  surfaceLeavesPage(id: StudioSurfaceId): boolean {
    return this.surfaceTargets[id].kind === "route";
  }

  /** The current location, so the list can mark it (`aria-current`). */
  surfaceIsActive(id: StudioSurfaceId): boolean {
    const target = this.surfaceTargets[id];
    switch (target.kind) {
      case "mode":
        return this.activeMode() === target.mode;
      case "tool":
        return this.activeTool() === target.tool;
      case "rack":
        return this.fxRackOpen();
      default:
        return false;
    }
  }

  /** Single entry point for the navigation list; each kind owns its own path. */
  openSurface(id: StudioSurfaceId) {
    const target = this.surfaceTargets[id];
    switch (target.kind) {
      case "mode":
        this.setMode(target.mode);
        break;
      case "tool":
        this.openTool(target.tool);
        break;
      case "rack":
        this.openFxRack();
        break;
      case "route":
        this.closePanels();
        void this.router.navigate(["/studio-classic"], {
          queryParams: { view: id },
        });
        break;
    }
  }

  /** The Project panel's import button drives the hidden picker. */
  openImportPicker() {
    this.importInput?.nativeElement.click();
  }

  /**
   * The counterpart to "Export backup", and the only way a bundle exported from
   * this page — or from the classic shell — can be brought back. Mirrors the
   * classic shell's `loadProjectFile`: a size guard, a confirm before replacing
   * an unsaved session, then the service's validated import (which is what
   * refuses a bundle whose shape it does not recognise).
   */
  async importProjectFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset first: picking the same file twice must fire `change` again.
    input.value = "";
    if (!file) return;

    try {
      if (file.size > 64 * 1024 * 1024) {
        throw new Error("Project file exceeds the 64 MiB JSON import limit.");
      }

      if (this.projectWorkspace.isDirty()) {
        const replace = await this.dialog.confirm({
          title: "Replace current project?",
          message:
            "Importing this bundle replaces your unsaved session. Export a backup first if you need it.",
          confirmLabel: "Replace project",
          cancelLabel: "Keep session",
          tone: "danger",
        });
        if (!replace) return;
      }

      const bundle = JSON.parse(await file.text());
      const imported = await this.projectWorkspace.importProjectBundle(bundle);
      const message = imported
        ? `Imported ${this.projectName()}`
        : this.projectWorkspace.persistenceError() ||
          "That bundle could not be imported.";
      this.reportProject(imported ? "ok" : "error", message);
      if (imported) {
        this.snackbar.success(message);
      } else {
        this.snackbar.error(message);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "That file could not be read as a project bundle.";
      this.reportProject("error", message);
      this.snackbar.error(message);
    }
  }

  async retrySave() {
    await this.save();
    if (!this.projectWorkspace.persistenceError()) {
      this.snackbar.success(`Saved ${this.projectName()}`);
    }
  }

  /**
   * The escape hatch when local persistence is unavailable: the bundle is
   * written straight to a download, so the work is not stranded in a tab that
   * cannot save. Mirrors the classic shell's "Export backup".
   */
  exportBackup() {
    try {
      this.projectWorkspace.downloadProjectBundle();
      this.snackbar.success("Project exported as .smuve bundle");
    } catch {
      this.snackbar.error("The backup bundle could not be written.");
    }
  }

  toggleInspector() {
    this.inspectorOpen.update((open) => !open);
  }

  toggleInspectorCollapsed() {
    this.inspectorCollapsed.update((collapsed) => !collapsed);
  }

  toggleAdvancedTools() {
    this.advancedToolsOpen.update((open) => !open);
    if (this.advancedToolsOpen()) this.closeOtherPanels("advancedToolsOpen");
  }

  /** The inspector's rack button opens the real FX chain for the selected track. */
  openFxRack() {
    this.activeTool.set(null);
    this.advancedToolsOpen.set(false);
    this.fxRackOpen.set(true);
  }

  closeFxRack() {
    this.fxRackOpen.set(false);
  }

  openTool(tool: AdvancedTool) {
    this.fxRackOpen.set(false);
    this.bezierOpen.set(false);
    this.advancedToolsOpen.set(false);
    this.activeTool.set(tool);
  }

  /** The piano roll / arrangement curve editors ask for the full curve surface. */
  openBezierEditor(laneId: string) {
    this.fxRackOpen.set(false);
    this.activeTool.set(null);
    this.advancedToolsOpen.set(false);
    this.bezierLaneId.set(laneId);
    this.bezierOpen.set(true);
  }

  closeBezierEditor() {
    this.bezierOpen.set(false);
  }

  onBezierCurveChanged() {
    this.snackbar.info("Bezier curve applied to automation lane");
  }

  /**
   * A workspace asked to switch views. Views this page renders switch mode in
   * place; everything else goes to the classic shell that renders it.
   */
  onRequestView(view: string) {
    if (view === "ai-produce") {
      this.openTool("ai-produce");
      return;
    }

    const mode = studioModeForView(view);
    if (mode) {
      this.setMode(mode);
      return;
    }

    void this.router.navigate(["/studio-classic"], { queryParams: { view } });
  }

  closeTool() {
    this.activeTool.set(null);
  }

  /** Dismiss every docked panel at once (scrim tap, Escape). */
  closePanels() {
    this.advancedToolsOpen.set(false);
    this.projectPanelOpen.set(false);
    this.collaborationPanelOpen.set(false);
    this.exportPanelOpen.set(false);
    this.aiAssistantOpen.set(false);
  }

  /**
   * Escape is the desktop equivalent of tapping the scrim — and, like the
   * scrim, it only reaches what is on top.
   *
   * The full-surface editors (tools, FX rack, curve editor, versions) were the
   * one layer Escape could not touch: they cover the workspace, so the Close
   * button sits in the far corner of the viewport, which is the same small
   * target the scrim exists to spare you. Order is innermost first, matching
   * z-order: a workspace overlay, then the docked slide-overs.
   */
  dismissTopOverlay(): boolean {
    // The cheat sheet is a dialog over everything, so it is dismissed first.
    if (this.shortcutsOpen()) {
      this.shortcutsOpen.set(false);
      return true;
    }
    if (this.activeTool()) {
      this.closeTool();
      return true;
    }
    if (this.fxRackOpen()) {
      this.closeFxRack();
      return true;
    }
    if (this.bezierOpen()) {
      this.closeBezierEditor();
      return true;
    }
    if (this.versionsOpen()) {
      this.closeVersionHistory();
      return true;
    }
    if (this.panelsOpen()) {
      this.closePanels();
      return true;
    }
    return false;
  }

  @HostListener("document:keydown.escape")
  onEscape() {
    this.dismissTopOverlay();
  }

  /**
   * Everything this page answers to, as the cheat sheet renders it.
   *
   * Deliberately the whole list rather than the discoverable half: the classic
   * shell's popover advertised Space/R/M (the transport lives in its
   * `app-transport-bar`, which this page does not use) and this one must not
   * advertise a key that does nothing.
   */
  readonly shortcuts: ReadonlyArray<{
    keys: readonly string[];
    label: string;
  }> = [
    { keys: ["Space"], label: "Play / pause" },
    { keys: ["R"], label: "Record" },
    { keys: ["M"], label: "Metronome" },
    { keys: ["Ctrl", "S"], label: "Save" },
    { keys: ["Ctrl", "E"], label: "Export workspace" },
    { keys: ["Ctrl", "Z"], label: "Undo" },
    { keys: ["Ctrl", "Shift", "Z"], label: "Redo" },
    { keys: ["Ctrl", "I"], label: "Compose assistant" },
    { keys: ["Ctrl", "K"], label: "Command palette" },
    { keys: ["?"], label: "This list" },
    { keys: ["Esc"], label: "Dismiss the top layer" },
  ];

  toggleShortcuts() {
    this.shortcutsOpen.update((open) => !open);
  }

  /**
   * Studio keyboard shortcuts, the same vocabulary the classic shell answers to:
   * ⌘S save, ⌘E export, ⌘Z / ⇧⌘Z history, ⌘I assistant, plus the transport's
   * Space / R / M.
   *
   * The transport keys matter most here. The classic shell gets them from
   * `app-transport-bar`, but this page renders its own footer transport, so
   * nothing was listening and the same three keys that start a take next door
   * did nothing on `/studio`.
   *
   * Yields to native text editing so ⌘S in a project-name field never fires a
   * project save, and ignores Escape — the layered dismissal above owns it.
   */
  @HostListener("document:keydown", ["$event"])
  onDocumentKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing || event.repeat) return;
    if (event.key === "Escape") return;

    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        'input, textarea, select, [contenteditable="true"], [contenteditable=""]',
      )
    ) {
      return;
    }

    const mod = event.ctrlKey || event.metaKey;

    if (!mod) {
      // With the cheat sheet up, the only bare key it answers is its own
      // toggle: Space must not start playback behind an open dialog.
      if (this.shortcutsOpen()) {
        if (event.key === "?" && !event.altKey) {
          event.preventDefault();
          this.toggleShortcuts();
        }
        return;
      }

      // A modal owns the keyboard while it is up (the confirm dialog, the
      // sheet above). The sheet is handled first, so `[role="dialog"]` here
      // can only be somebody else's.
      if (target?.closest('[role="dialog"], app-interaction-dialog')) return;

      if (event.key === "?" && !event.altKey) {
        event.preventDefault();
        this.toggleShortcuts();
        return;
      }

      if (event.altKey) return;
      this.handleTransportKey(event, target);
      return;
    }

    switch (event.key.toLowerCase()) {
      case "s":
        event.preventDefault();
        // Save answers on its own: with the keyboard there is no button press
        // to confirm the shortcut landed.
        void this.retrySave();
        return;
      case "e":
        event.preventDefault();
        this.setMode("export");
        return;
      case "z":
        event.preventDefault();
        if (event.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
        return;
      case "i":
        event.preventDefault();
        this.toggleAiAssistant();
        return;
      default:
        return;
    }
  }

  /**
   * Space / R / M, the transport keys the classic shell's transport bar owns.
   *
   * Space is left to the browser when a control has focus: it natively clicks
   * the focused button, and `preventDefault()` does not stop propagation, so
   * claiming it there would fire Play twice. `ownsSpaceKey` draws the line at
   * the controls that consume it — not at focusable elements, or the key would
   * be dead on every canvas the user has clicked.
   */
  private handleTransportKey(
    event: KeyboardEvent,
    target: HTMLElement | null,
  ): void {
    switch (event.key) {
      case " ":
        if (ownsSpaceKey(target)) return;
        event.preventDefault();
        // Space stops a take in progress rather than layering playback on it.
        void this.toggleTransport(
          this.audioSession.isPlaying() || this.audioSession.isRecording()
            ? "stopped"
            : "playing",
        );
        return;
      case "r":
      case "R":
        event.preventDefault();
        void this.toggleTransport("recording");
        return;
      case "m":
      case "M":
        event.preventDefault();
        this.toggleMetronome();
        return;
    }
  }

  /**
   * One docked panel at a time: the scrim covers the workspace and the panels
   * are all right-edge slide-overs, so two open at once would simply stack.
   */
  private closeOtherPanels(keep: string) {
    if (keep !== "advancedToolsOpen") this.advancedToolsOpen.set(false);
    if (keep !== "projectPanelOpen") this.projectPanelOpen.set(false);
    if (keep !== "collaborationPanelOpen") this.collaborationPanelOpen.set(false);
    if (keep !== "exportPanelOpen") this.exportPanelOpen.set(false);
    if (keep !== "aiAssistantOpen") this.aiAssistantOpen.set(false);
  }

  toggleAiAssistant() {
    this.aiAssistantOpen.update((open) => !open);
    if (this.aiAssistantOpen()) this.closeOtherPanels("aiAssistantOpen");
  }

  toolLabel(tool: AdvancedTool): string {
    switch (tool) {
      case "synth":
        return "Synths";
      case "plugins":
        return "Plugins";
      case "sampler":
        return "Sampler";
      case "sound-browser":
        return "Sound Browser";
      default:
        return "AI Produce";
    }
  }

  toggleProjectPanel() {
    this.projectPanelOpen.update((open) => !open);
    if (this.projectPanelOpen()) {
      this.closeOtherPanels("projectPanelOpen");
      this.collaborationPanelOpen.set(false);
      this.exportPanelOpen.set(false);
      void this.refreshLocalProjects();
    }
  }

  toggleCollaborationPanel() {
    this.collaborationPanelOpen.update((open) => !open);
    if (this.collaborationPanelOpen()) {
      this.closeOtherPanels("collaborationPanelOpen");
      this.projectPanelOpen.set(false);
      this.exportPanelOpen.set(false);
    }
  }

  toggleExportPanel() {
    this.exportPanelOpen.update((open) => !open);
    if (this.exportPanelOpen()) {
      this.closeOtherPanels("exportPanelOpen");
      this.projectPanelOpen.set(false);
      this.collaborationPanelOpen.set(false);
    }
  }

  /** Advanced-tools entry points that live in the side panels. */
  openProjectBrowser() {
    this.advancedToolsOpen.set(false);
    this.aiAssistantOpen.set(false);
    this.projectPanelOpen.set(true);
    this.collaborationPanelOpen.set(false);
    this.exportPanelOpen.set(false);
    void this.refreshLocalProjects();
  }

  openCollaboration() {
    this.advancedToolsOpen.set(false);
    this.aiAssistantOpen.set(false);
    this.collaborationPanelOpen.set(true);
    this.projectPanelOpen.set(false);
    this.exportPanelOpen.set(false);
  }

  openSettings() {
    this.advancedToolsOpen.set(false);
    void this.router.navigate(["/settings"]);
  }

  openVersionHistory() {
    this.advancedToolsOpen.set(false);
    this.aiAssistantOpen.set(false);
    this.activeTool.set(null);
    this.versionsOpen.set(true);
    void this.refreshVersions();
  }

  closeVersionHistory() {
    this.versionsOpen.set(false);
  }

  async refreshVersions() {
    const projectId = this.metadata()?.id;
    if (!projectId) {
      this.versions.set([]);
      return;
    }

    this.versionsBusy.set(true);
    try {
      this.versions.set(
        await this.projectWorkspace.listProjectVersions(projectId),
      );
    } catch {
      this.versions.set([]);
      this.reportVersions("error", "Version history could not be read.");
    } finally {
      this.versionsBusy.set(false);
    }
  }

  async restoreVersion(recordId: string) {
    this.versionsBusy.set(true);
    try {
      const restored =
        await this.projectWorkspace.restoreProjectVersion(recordId);
      this.reportVersions(
        restored ? "ok" : "error",
        restored
          ? `Restored version · ${this.projectName()}`
          : "That version could not be restored.",
      );
      if (restored) {
        await this.refreshVersions();
        await this.refreshLocalProjects();
      }
    } catch {
      this.reportVersions("error", "That version could not be restored.");
    } finally {
      this.versionsBusy.set(false);
    }
  }

  async startCollabSession() {
    const user = this.auth.currentUser();
    if (!user) {
      this.reportCollab("error", "Sign in to start a collaboration session.");
      return;
    }

    this.collabBusy.set(true);
    try {
      await this.collaboration.startSession(user);
      this.reportCollab(
        "ok",
        `Session ${this.collaboration.sessionCode()} started.`,
      );
    } catch {
      this.reportCollab("error", "Could not start the session.");
    } finally {
      this.collabBusy.set(false);
    }
  }

  async joinCollabSession() {
    const code = this.joinCode().trim();
    if (!code) {
      this.reportCollab("error", "Enter a session code first.");
      return;
    }

    const user = this.auth.currentUser();
    if (!user) {
      this.reportCollab("error", "Sign in to join a session.");
      return;
    }

    this.collabBusy.set(true);
    try {
      await this.collaboration.joinSession(code, user);
      this.reportCollab("ok", `Joined session ${code.toUpperCase()}.`);
      this.joinCode.set("");
    } catch {
      this.reportCollab("error", "Could not join that session.");
    } finally {
      this.collabBusy.set(false);
    }
  }

  leaveCollabSession() {
    this.collaboration.leaveSession();
    this.reportCollab("ok", "Left the collaboration session.");
  }

  sendProjectUpdate() {
    this.collaboration.sendProjectUpdate();
    this.reportCollab("ok", "Project snapshot sent to peers.");
  }

  toggleAutoSync() {
    this.collaboration.toggleAutoSync();
  }

  resolveCollabConflict(
    trackId: string,
    fieldKey: string,
    resolution: "mine" | "theirs" | "discard",
  ) {
    this.collaboration.resolveConflict(trackId, fieldKey, resolution);
  }

  onJoinCodeInput(event: Event) {
    this.joinCode.set((event.target as HTMLInputElement).value);
  }

  async refreshLocalProjects() {
    this.projectPanelBusy.set(true);
    try {
      this.localProjects.set(await this.projectWorkspace.listLocalProjects());
    } catch {
      this.localProjects.set([]);
      this.reportProject("error", "Local sets could not be read.");
    } finally {
      this.projectPanelBusy.set(false);
    }
  }

  async openLocalProject(projectId: string) {
    this.projectPanelBusy.set(true);
    try {
      const bundle = await this.projectWorkspace.loadProject(projectId);
      this.reportProject(
        bundle ? "ok" : "error",
        bundle
          ? `Opened ${bundle.metadata.name}`
          : "That set could not be opened.",
      );
      await this.refreshLocalProjects();
    } catch {
      this.reportProject("error", "That set could not be opened.");
    } finally {
      this.projectPanelBusy.set(false);
    }
  }

  async saveNow() {
    this.projectPanelBusy.set(true);
    try {
      await this.projectWorkspace.manualSave();
      this.reportProject("ok", `Saved ${this.projectName()}`);
    } catch {
      this.reportProject("error", "Save failed. Check the project status.");
    } finally {
      this.projectPanelBusy.set(false);
    }
  }

  async restoreSnapshot() {
    this.projectPanelBusy.set(true);
    try {
      const restored = await this.projectWorkspace.restoreLatestProjectState();
      this.reportProject(
        restored ? "ok" : "error",
        restored ? "Latest snapshot restored." : "No snapshot to restore.",
      );
    } catch {
      this.reportProject("error", "The snapshot could not be restored.");
    } finally {
      this.projectPanelBusy.set(false);
    }
  }

  renameProject(event: Event) {
    const name = (event.target as HTMLInputElement).value.trim();
    if (!name) return;
    this.projectWorkspace.updateMetadata({ name });
  }

  private reportProject(tone: ProjectPanelFeedback["tone"], text: string) {
    this.projectFeedback.set({ tone, text });
  }

  private reportVersions(tone: ProjectPanelFeedback["tone"], text: string) {
    this.versionsFeedback.set({ tone, text });
  }

  private reportCollab(tone: ProjectPanelFeedback["tone"], text: string) {
    this.collabFeedback.set({ tone, text });
  }
}
