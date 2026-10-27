import { CommonModule } from "@angular/common";
import { Component, computed, inject, signal } from "@angular/core";
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
import { SnackbarComponent } from "../shared/snackbar/snackbar.component";
import { SoundBrowserComponent } from "../sound-browser/sound-browser.component";
import { SynthesizerComponent } from "../synthesizer/synthesizer.component";
import { StudioPageMode, studioModeForView } from "../studio-view-modes";
import { StudioExportSurfaceComponent } from "./studio-export-surface.component";

type StudioMode = StudioPageMode;
type TransportState = "stopped" | "playing" | "recording";
type SaveStatus = "saved" | "saving" | "error";
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
  /** Every edit surface (piano roll, arrangement, inspector) pushes here. */
  readonly history = inject(HistoryService);

  readonly activeMode = signal<StudioMode>("arrange");
  readonly inspectorOpen = signal(true);
  readonly inspectorCollapsed = signal(false);
  readonly advancedToolsOpen = signal(false);
  readonly projectPanelOpen = signal(false);
  readonly collaborationPanelOpen = signal(false);
  readonly exportPanelOpen = signal(false);

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

  toggleInspector() {
    this.inspectorOpen.update((open) => !open);
  }

  toggleInspectorCollapsed() {
    this.inspectorCollapsed.update((collapsed) => !collapsed);
  }

  toggleAdvancedTools() {
    this.advancedToolsOpen.update((open) => !open);
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
      this.collaborationPanelOpen.set(false);
      this.exportPanelOpen.set(false);
      void this.refreshLocalProjects();
    }
  }

  toggleCollaborationPanel() {
    this.collaborationPanelOpen.update((open) => !open);
    if (this.collaborationPanelOpen()) {
      this.projectPanelOpen.set(false);
      this.exportPanelOpen.set(false);
    }
  }

  toggleExportPanel() {
    this.exportPanelOpen.update((open) => !open);
    if (this.exportPanelOpen()) {
      this.projectPanelOpen.set(false);
      this.collaborationPanelOpen.set(false);
    }
  }

  /** Advanced-tools entry points that live in the side panels. */
  openProjectBrowser() {
    this.advancedToolsOpen.set(false);
    this.projectPanelOpen.set(true);
    this.collaborationPanelOpen.set(false);
    this.exportPanelOpen.set(false);
    void this.refreshLocalProjects();
  }

  openCollaboration() {
    this.advancedToolsOpen.set(false);
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
