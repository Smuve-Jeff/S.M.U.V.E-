import {
  Component,
  inject,
  signal,
  computed,
  input,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ViewChild,
  OnInit,
  AfterViewInit,
  OnDestroy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { AiService } from "../../../services/ai.service";
import { AiCopilotService } from "../../ai-copilot.service";
import { MusicManagerService } from "../../../services/music-manager.service";
import { HistoryService } from "../../../services/history.service";
import { AudioEngineService } from "../../../services/audio-engine.service";
import { NeuralMixerService } from "../../../services/neural-mixer.service";
import { HapticService } from "../../../services/haptic.service";
import { SnackbarService } from "../../../services/snackbar.service";
import { ProjectWorkspaceService } from "../../project-workspace.service";
import { UserProfileService } from "../../../services/user-profile.service";
import { ArtistProfileFinetuneService } from "../../../services/artist-profile-finetune.service";
import { SmuveMemoryService } from "../../../services/smuve-memory.service";
import {
  getPersonaOption,
  personaOfflineVoice,
} from "../../../types/persona.types";
import { SpeechRecognitionService } from "../../../services/speech-recognition.service";
import { SpeechSynthesisService } from "../../../services/speech-synthesis.service";
import { buildArtistMusicContext } from "../../../types/profile.types";
import { isOfflineAiText } from "../../../../ai-manager.contract";
import {
  StudioAiDirectorService,
  type DirectorCheckpointSummary,
  type StudioDirectorPlan,
  type StudioDirectorRunResult,
  type StudioDirectorStep,
} from "../../studio-ai-director.service";
import { readProjectFile } from "../../project-archive.util";
import { StudioOrchestrationService } from "../../../services/studio-orchestration.service";
import {
  STUDIO_SURFACES,
  isStudioSurfaceId,
} from "../../studio-surfaces";

type AssistantTab = "quick" | "chat" | "director";

const CHAT_STORAGE_KEY_PREFIX = "smuve.ai-assistant.messages.v1";
const CHAT_STORAGE_MAX = 50;

type AssistantActionId =
  | "tempo-90"
  | "tempo-124"
  | "tempo-140"
  | "chords"
  | "melody"
  | "structure"
  | "neural-mix"
  | "humanize"
  | "session-report"
  | "tips"
  | "director-loop-wav"
  | "director-loop-mp3"
  | "director-stems"
  | "director-stems-readiness"
  | "director-master"
  | "director-tuner-reading"
  | "director-restore-checkpoint";

interface AssistantAction {
  id: AssistantActionId;
  label: string;
}

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: string;
  contexts: string[]; // view ids
  run: () => Promise<string> | string;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  ts: number;
  /** One-tap apply buttons attached to assistant replies. */
  actions?: AssistantAction[];
}

@Component({
  selector: "app-ai-assistant",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: "./ai-assistant.component.html",
  styleUrls: ["./ai-assistant.component.css", "../platform-ux.css"],
})
export class AiAssistantComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() open = false;
  @Output() close = new EventEmitter<void>();

  @ViewChild("chatScroll") chatScroll?: ElementRef<HTMLDivElement>;

  private ai = inject(AiService);
  /**
   * Guest clearance has no AI, so the panel explains the clearance rule instead
   * of offering a chat the session cannot use.
   */
  readonly aiLocked = computed(() => !this.ai.aiAccess());
  readonly aiLockNotice = this.ai.aiLockNotice;
  private copilot = inject(AiCopilotService);
  public musicManager = inject(MusicManagerService);
  public history = inject(HistoryService, { optional: true });
  public audio = inject(AudioEngineService);
  private neural = inject(NeuralMixerService);
  private haptic = inject(HapticService);
  private snack = inject(SnackbarService);
  private workspace = inject(ProjectWorkspaceService);
  private userProfile = inject(UserProfileService);
  private artistFinetune = inject(ArtistProfileFinetuneService);
  /** Persistent case file — the Studio panel writes into the same relationship. */
  private caseFile = inject(SmuveMemoryService);
  private speechRecognition = inject(SpeechRecognitionService);
  private speechSynthesis = inject(SpeechSynthesisService);
  private director = inject(StudioAiDirectorService);
  private orchestration = inject(StudioOrchestrationService, { optional: true });
  private router = inject(Router, { optional: true });
  private replyCounter = 0;

  tab = signal<AssistantTab>("quick");
  userInput = signal("");
  directorFocus = signal("");
  directorPlan = signal<StudioDirectorPlan | null>(null);
  directorPlanFor = signal<string>("");
  directorBrief = signal("");
  directorBusy = signal(false);
  directorReport = signal<string[]>([]);
  directorStatus = signal("");
  directorSurfaceLabel = computed(() => {
    const plan = this.directorPlan();
    return STUDIO_SURFACES.find((surface) => surface.id === plan?.surfaceId)?.label ?? "Studio";
  });
  directorRunExportReady = computed(
    () => this.directorReport().length > 0 || !!this.director.lastDirectorRun?.(),
  );
  directorRecentRuns = computed<StudioDirectorRunResult[]>(() =>
    this.director.listDirectorRuns?.() ?? [],
  );
  /** Newest-first SessionHistory checkpoints for the open project. */
  directorCheckpoints = computed<DirectorCheckpointSummary[]>(() =>
    this.director.listCheckpoints(),
  );

  /** Live AI / local fallback status shown in the header. */
  aiMode = signal<"idle" | "online" | "local">("idle");
  /** Canonical persona selected in Settings; the Studio assistant uses the same identity. */
  personaName = computed(
    () =>
      getPersonaOption(
        this.userProfile.profile().settings?.ai?.commanderPersona,
      ).name,
  );
  /** Contextual follow-up chips offered under the latest reply. */
  suggestedFollowups = signal<string[]>([]);
  messages = signal<ChatMessage[]>([
    {
      role: "assistant",
      text: this.studioGreeting(),
      ts: Date.now(),
    },
  ]);
  isThinking = signal(false);
  voiceNotice = signal("");
  voiceOutputCapability = this.speechSynthesis.outputCapability;
  voiceSpeaking = this.speechSynthesis.isSpeaking;
  voiceReadout = this.speechSynthesis.liveVoice;
  voiceListening = this.speechRecognition.isListening;

  /** Context — bound by the host studio so quick actions follow the active view */
  activeViewContext = input<string>("arrangement");

  // ---- Quick action menu (context-aware) ----
  quickActions = computed<QuickAction[]>(() => {
    const _t = this.musicManager.selectedTrack();
    const view = this.activeViewContext();

    const actions: QuickAction[] = [];

    if (view === "arrangement" || view === "piano-roll") {
      actions.push(
        {
          id: "humanize",
          label: "Humanize",
          description: "Add natural feel to selected notes",
          icon: "fluorescent",
          contexts: ["arrangement", "piano-roll"],
          run: () => {
            const id = this.musicManager.selectedTrackId();
            if (!id) return "Select a track first.";
            this.musicManager.humanizeTrack(id);
            this.haptic.medium();
            return "Humanized — micro-timing & velocity variations applied.";
          },
        },
        {
          id: "quantize",
          label: "Quantize",
          description: "Snap notes to grid",
          icon: "grid_on",
          contexts: ["arrangement", "piano-roll"],
          run: () => {
            const id = this.musicManager.selectedTrackId();
            if (!id) return "Select a track first.";
            this.musicManager.quantizeTrack(id);
            return "Quantized to 1/16 grid.";
          },
        },
        {
          id: "arpeggiate",
          label: "Arpeggiate",
          description: "Auto-spread notes into arp pattern",
          icon: "reorder",
          contexts: ["arrangement", "piano-roll"],
          run: () => {
            const id = this.musicManager.selectedTrackId();
            if (!id) return "Select a track first.";
            this.musicManager.arpeggiateTrack(id);
            return "Arpeggio generated.";
          },
        },
        {
          id: "strum",
          label: "Strum",
          description: "Natural strum timing",
          icon: "format_align_left",
          contexts: ["arrangement", "piano-roll"],
          run: () => {
            const id = this.musicManager.selectedTrackId();
            if (!id) return "Select a track first.";
            this.musicManager.strumTrack(id);
            return "Strum timing applied.";
          },
        },
      );
    }

    if (view === "drum-machine") {
      actions.push(
        {
          id: "euclid",
          label: "Euclidean Beat",
          description: "Generate a playable drum kit pattern",
          icon: "auto_awesome",
          contexts: ["drum-machine"],
          run: async () =>
            this.runDirectorStepFor(
              "drum-machine",
              "Generate a playable drum kit pattern",
            ),
        },
        {
          id: "fill",
          label: "AI Fill",
          description: "Run one EVOLVE drum variation",
          icon: "auto_awesome",
          contexts: ["drum-machine"],
          run: async () =>
            this.runDirectorStepFor("drum-machine", "Run one EVOLVE variation"),
        },
      );
    }

    if (view === "mixer" || view === "mastering") {
      actions.push(
        {
          id: "neural",
          label: "Rough Balance",
          description: "Randomized ±5% gain nudge plus a safety compressor",
          icon: "tune",
          contexts: ["mixer", "mastering"],
          run: () => {
            this.neural.applyNeuralMix();
            this.haptic.medium();
            return "Rough balance applied — randomized ±5% gain nudge; EQ untouched.";
          },
        },
        {
          id: "loudness",
          label: "Master Loudness",
          description: "Run the genre-aware AI master chain",
          icon: "multitrack_audio",
          contexts: ["mastering"],
          run: async () =>
            this.runDirectorStepFor("mastering", "Run the genre-aware master"),
        },
      );
    }

    // Universal actions
    actions.push(
      {
        id: "structure",
        label: "Song Structure",
        description: "Suggest verse/chorus structure",
        icon: "queue_music",
        contexts: ["*"],
        run: () => {
          this.copilot.suggestStructure();
          return "Song structure generated — Intro, Verse, Chorus markers added.";
        },
      },
      {
        id: "chords",
        label: "Generate Chords",
        description: "Write a generator-backed chord framework into pad, bass and top-line parts",
        icon: "graphic_eq",
        contexts: ["*"],
        run: async () =>
          this.runDirectorStepFor("chord-editor", "Turn the progression into parts"),
      },
      {
        id: "melody",
        label: "Spark Melody",
        description: "Seed a melodic layer into the selected track",
        icon: "graphic_eq",
        contexts: ["*"],
        run: async () =>
          this.runDirectorStepFor("piano-roll", "Write a melodic seed into the selected track"),
      },
      {
        id: "roast",
        label: "Producer Tips",
        description: "Honest critique of your mix",
        icon: "forum",
        contexts: ["*"],
        run: () => {
          const advice = this.ai.getSmartMixAdvice(this.musicManager.tracks());
          return (
            advice ||
            "Tracks look balanced. Try a long decay reverb on the lead."
          );
        },
      },
      {
        id: "session-report",
        label: "Session Report",
        description: "Instant snapshot of project & mix",
        icon: "summarize",
        contexts: ["*"],
        run: () => this.buildSessionReport(),
      },
      {
        id: "next-step",
        label: "Next Step",
        description: "What to do next in this view",
        icon: "rocket_launch",
        contexts: ["*"],
        run: () => this.suggestNextStep(),
      },
    );

    return actions;
  });

  ngOnInit() {
    this.restoreMessages();
  }

  personaTitle(): string {
    return getPersonaOption(
      this.userProfile.profile().settings?.ai?.commanderPersona,
    ).title;
  }

  ngOnDestroy(): void {
    this.speechRecognition.stopListening();
    this.speechSynthesis.cancel();
  }

  ngAfterViewInit() {
    // noop
  }

  /** Restore the persisted conversation (if any) from localStorage. */
  private restoreMessages(): void {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(this.chatStorageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const restored = parsed.filter(
        (m): m is ChatMessage =>
          !!m &&
          (m as ChatMessage).role !== undefined &&
          typeof (m as ChatMessage).text === "string" &&
          typeof (m as ChatMessage).ts === "number",
      );
      if (restored.length > 0) this.messages.set(restored);
    } catch {
      // corrupted / private mode — start fresh
    }
  }

  /** Persist the conversation (capped, transient action chips stripped). */
  private persistMessages(): void {
    if (typeof window === "undefined") return;
    try {
      const slim = this.messages()
        .slice(-CHAT_STORAGE_MAX)
        .map(({ role, text, ts }) => ({ role, text, ts }));
      window.localStorage.setItem(this.chatStorageKey(), JSON.stringify(slim));
    } catch {
      // storage unavailable — degrade silently
    }
  }

  /** Keep assistant history isolated between signed-in artists. */
  private chatStorageKey(): string {
    const userId = this.userProfile.profile().id || "anonymous";
    return `${CHAT_STORAGE_KEY_PREFIX}.${encodeURIComponent(userId)}`;
  }

  /**
   * The Studio opener is S.M.U.V.E., not a polite generic assistant.
   *
   * The panel used to introduce a "Compose Assistant" while the rest of the
   * app spoke as S.M.U.V.E.; the character now enters the room in the selected
   * persona and references the case file when it already judged this session.
   */
  private studioGreeting(): string {
    const profile = this.userProfile.profile();
    const persona = getPersonaOption(profile.settings?.ai?.commanderPersona);
    const name = profile.artistName || 'artist';
    const voice = personaOfflineVoice(persona.id);
    const welcome = voice?.welcome?.length
      ? voice.welcome[Math.floor(Math.random() * voice.welcome.length)]
          .split('{artist}')
          .join(name)
      : (profile.settings?.ai?.aiProfanityEnabled ?? true)
        ? 'Studio Floor. I am already in the room, and your mix is already talking shit about you. Ask me about the low end, the arrangement or the chain — and make it worth my fucking time.'
        : 'Studio Floor. I am already in the room. Ask me about the low end, the arrangement or the chain, and make it worth the interruption.';
    let callback: string | null = null;
    try {
      callback = this.caseFile.callbackLine('studio');
    } catch {
      // No case file in this host: the greeting still stands.
    }
    return callback ? `${welcome}\n\n${callback}` : welcome;
  }

  /** Wipe the conversation back to the greeting. */
  clearHistory(): void {
    this.haptic.light();
    this.messages.set([
      {
        role: "assistant",
        text: this.studioGreeting(),
        ts: Date.now(),
      },
    ]);
    this.persistMessages();
    this.suggestedFollowups.set([]);
  }

  setTab(t: AssistantTab) {
    this.tab.set(t);
    this.haptic.light();
    if (
      t === "director" &&
      (!this.directorPlan() || this.directorPlanFor() !== this.currentDirectorSurface())
    ) {
      void this.refreshDirectorPlan();
    }
  }

  private currentDirectorSurface(): string {
    const view = this.activeViewContext();
    return isStudioSurfaceId(view) ? view : "arrangement";
  }

  async refreshDirectorPlan(): Promise<void> {
    if (this.directorBusy()) return;
    const surfaceId = this.currentDirectorSurface();
    this.directorBusy.set(true);
    this.directorStatus.set("Building the Director plan...");
    try {
      const context = { surfaceId, focusPrompt: this.directorFocus().trim() };
      const plan = this.director.buildPlan(context);
      const brief = await this.director.createStudioBrief(plan, context);
      this.directorPlan.set(plan);
      this.directorPlanFor.set(surfaceId);
      this.directorBrief.set(brief);
      this.directorReport.set([]);
      this.directorStatus.set("Plan ready.");
      this.haptic.medium();
    } catch (error) {
      this.directorStatus.set("Director plan failed.");
      this.snack.error(`Director plan failed: ${(error as Error).message}`);
    } finally {
      this.directorBusy.set(false);
    }
  }

  canUndoDirectorAction(): boolean {
    return this.director.canUndoDirectorAction();
  }

  canRedoDirectorAction(): boolean {
    return this.director.canRedoDirectorAction();
  }

  undoDirectorAction(): void {
    if (this.directorBusy()) return;
    try {
      const message = this.director.undoLastAction();
      this.directorReport.update((report) => [...report, `Done — Undo: ${message}`]);
      this.directorStatus.set(message);
      this.snack.success(message);
      this.haptic.medium();
    } catch (error) {
      const message = `Undo failed: ${(error as Error).message}`;
      this.directorStatus.set(message);
      this.snack.error(message);
    }
  }

  redoDirectorAction(): void {
    if (this.directorBusy()) return;
    try {
      const message = this.director.redoLastAction();
      this.directorReport.update((report) => [...report, `Done — Redo: ${message}`]);
      this.directorStatus.set(message);
      this.snack.success(message);
      this.haptic.medium();
    } catch (error) {
      const message = `Redo failed: ${(error as Error).message}`;
      this.directorStatus.set(message);
      this.snack.error(message);
    }
  }

  async restoreCheckpointDirectorAction(): Promise<void> {
    if (this.directorBusy()) return;
    if (!window.confirm("Restore the latest checkpoint? Current work is preserved as an undoable edit.")) return;
    this.directorBusy.set(true);
    this.directorStatus.set("Restoring checkpoint...");
    try {
      const message = await this.director.restoreCheckpoint();
      this.directorReport.update((report) => [...report, `Done — Restore checkpoint: ${message}`]);
      this.directorStatus.set(message);
      this.snack.success(message);
      this.haptic.medium();
    } catch (error) {
      const message = `Checkpoint restore failed: ${(error as Error).message}`;
      this.directorStatus.set(message);
      this.snack.error(message);
    } finally {
      this.directorBusy.set(false);
    }
  }

  async restoreCheckpointById(checkpointId: string, label: string): Promise<void> {
    if (this.directorBusy()) return;
    if (!window.confirm(`Restore checkpoint "${label}"? Current work is preserved as an undoable edit.`)) return;
    this.directorBusy.set(true);
    this.directorStatus.set(`Restoring checkpoint ${label}...`);
    try {
      const message = await this.director.restoreCheckpoint(checkpointId);
      this.directorReport.update((report) => [...report, `Done — Restore checkpoint: ${message}`]);
      this.directorStatus.set(message);
      this.snack.success(message);
      this.haptic.medium();
    } catch (error) {
      const message = `Checkpoint restore failed: ${(error as Error).message}`;
      this.directorStatus.set(message);
      this.snack.error(message);
    } finally {
      this.directorBusy.set(false);
    }
  }

  exportCheckpointBundle(checkpointId: string, label: string): void {
    if (this.directorBusy()) return;
    this.directorBusy.set(true);
    this.directorStatus.set(`Exporting checkpoint ${label}...`);
    try {
      const message = this.director.exportCheckpointBundle(checkpointId);
      this.directorReport.update((report) => [...report, `Done — Export checkpoint bundle: ${message}`]);
      this.directorStatus.set(message);
      this.snack.success(message);
      this.haptic.medium();
    } catch (error) {
      const message = `Checkpoint bundle export failed: ${(error as Error).message}`;
      this.directorStatus.set(message);
      this.snack.error(message);
    } finally {
      this.directorBusy.set(false);
    }
  }

  exportCurrentProjectBundle(): void {
    if (this.directorBusy()) return;
    this.directorBusy.set(true);
    this.directorStatus.set("Exporting the open project bundle...");
    try {
      const message = this.director.exportProjectBundle();
      this.directorReport.update((report) => [...report, `Done — Export project bundle: ${message}`]);
      this.directorStatus.set(message);
      this.snack.success(message);
      this.haptic.medium();
    } catch (error) {
      const message = `Project bundle export failed: ${(error as Error).message}`;
      this.directorStatus.set(message);
      this.snack.error(message);
    } finally {
      this.directorBusy.set(false);
    }
  }

  async onDirectorBundleFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (input) input.value = "";
    if (!file || this.directorBusy()) return;
    this.directorBusy.set(true);
    this.directorStatus.set(`Importing ${file.name}...`);
    try {
      const bundle = await readProjectFile(file);
      const message = await this.director.importProjectBundle(bundle);
      this.directorReport.update((report) => [...report, `Done — Import project bundle: ${message}`]);
      this.directorStatus.set(message);
      this.snack.success(message);
      this.haptic.medium();
    } catch (error) {
      const message = `Project bundle import failed: ${(error as Error).message}`;
      this.directorStatus.set(message);
      this.snack.error(message);
    } finally {
      this.directorBusy.set(false);
    }
  }

  deleteSelectedDirectorTrack(): void {
    if (this.directorBusy()) return;
    const track = this.musicManager.selectedTrack();
    if (!track) return;
    if (!window.confirm(`Delete "${track.name}"? Undo restores it.`)) return;
    try {
      const message = this.director.deleteSelectedTrack();
      this.directorReport.update((report) => [...report, `Done — Delete: ${message}`]);
      this.directorStatus.set(message);
      this.snack.success(message);
      this.haptic.medium();
    } catch (error) {
      const message = `Delete failed: ${(error as Error).message}`;
      this.directorStatus.set(message);
      this.snack.error(message);
    }
  }

  exportDirectorRunReport(run?: StudioDirectorRunResult): void {
    if (this.directorBusy()) return;
    try {
      const message = this.director.exportRunReport(run);
      this.directorReport.update((report) => [...report, `Done — Export run report: ${message}`]);
      this.directorStatus.set(message);
      this.snack.success(message);
      this.haptic.medium();
    } catch (error) {
      const message = `Run report export failed: ${(error as Error).message}`;
      this.directorStatus.set(message);
      this.snack.error(message);
    }
  }

  clearDirectorRunHistory(): void {
    if (this.directorBusy()) return;
    this.director.clearDirectorRuns();
    const message = "Cleared Director run history.";
    this.directorReport.update((report) => [...report, `Done — ${message}`]);
    this.directorStatus.set(message);
    this.snack.success(message);
    this.haptic.medium();
  }

  private async runDirectorStepFor(surfaceId: string, label: string): Promise<string> {
    const plan = this.director.buildPlan({ surfaceId });
    const step = plan.steps.find((candidate) => candidate.label === label);
    if (!step) return `Director step ${label} is unavailable on ${surfaceId}.`;
    const result = await this.director.runStep(step);
    return result.message;
  }

  async runDirectorPlan(): Promise<void> {
    const plan = this.directorPlan();
    if (!plan || this.directorBusy()) return;
    this.directorBusy.set(true);
    this.directorStatus.set("Running the Director plan...");
    try {
      const result = await this.director.runPlan(plan);
      this.directorReport.set(result.report);
      this.directorStatus.set(
        result.failed === 0 ? "Plan complete." : `Plan finished with ${result.failed} check${result.failed === 1 ? "" : "s"}.`,
      );
      if (result.failed === 0) this.snack.success("Director plan complete.");
      else this.snack.error(`Director plan finished with ${result.failed} check${result.failed === 1 ? "" : "s"}.`);
    } catch (error) {
      this.directorStatus.set("Director plan failed.");
      this.snack.error(`Director plan failed: ${(error as Error).message}`);
    } finally {
      this.directorBusy.set(false);
    }
  }

  async runDirectorStep(step: StudioDirectorStep): Promise<void> {
    if (this.directorBusy()) return;
    this.directorBusy.set(true);
    this.directorStatus.set(`Running ${step.label}...`);
    try {
      const result = await this.director.runStep(step);
      this.directorReport.update((report) => [
        ...report,
        `${result.ok ? "Done" : "Check"} — ${step.label}: ${result.message}`,
      ]);
      this.directorStatus.set(result.ok ? `${step.label} done.` : `${step.label} needs attention.`);
      if (result.ok) this.snack.success(`${step.label}: ${result.message}`);
      else this.snack.error(`${step.label} failed: ${result.message}`);
    } finally {
      this.directorBusy.set(false);
    }
  }

  openDirectorSurface(surfaceId: string): void {
    this.orchestration?.setActiveStudioView(surfaceId);
    void this.router?.navigate(["/studio"], { queryParams: { view: surfaceId } });
  }

  async runAction(a: QuickAction) {
    this.haptic.medium();
    try {
      const result = await a.run();
      this.snack.success(`${a.label}: ${result}`);
      this.messages.update((m) => [
        ...m,
        { role: "assistant", text: `${a.label} — ${result}`, ts: Date.now() },
      ]);
      this.persistMessages();
      setTimeout(() => this.scrollDown(), 0);
    } catch (e) {
      this.snack.error(`${a.label} failed: ${(e as Error).message}`);
    }
  }

  async sendMessage() {
    const text = this.userInput().trim();
    if (!text) return;
    this.haptic.light();
    this.messages.update((m) => [...m, { role: "user", text, ts: Date.now() }]);
    this.userInput.set("");
    this.isThinking.set(true);
    this.suggestedFollowups.set([]);
    setTimeout(() => this.scrollDown(), 0);
    try {
      const reply = await this.requestAiReply(text);
      const actions = this.suggestActionsFor(text);
      this.messages.update((m) => [
        ...m,
        {
          role: "assistant",
          text: reply,
          ts: Date.now(),
          actions: actions.length ? actions : undefined,
        },
      ]);
      this.readAssistantMessage(reply);
      // The Studio is a S.M.U.V.E. room like any other: file the judgement and
      // any open loop so the chat and the advisor can call it back later.
      this.caseFile.captureTurn("studio", "Studio Floor", text, reply);
      // One-tap actions take priority; plain follow-up chips fill the gap.
      this.suggestedFollowups.set(
        actions.length ? [] : this.suggestChipsFor(text),
      );
      this.persistMessages();
    } finally {
      this.isThinking.set(false);
      setTimeout(() => this.scrollDown(), 0);
    }
  }

  /**
   * Ask the live S.M.U.V.E AI (Gemini via /api/ai/analyze) with full session
   * context. When the link is severed (offline / unauthenticated) or the call
   * fails, we drop into the deterministic local assistant — the panel never
   * breaks and never shows a raw error to the producer.
   */
  private async requestAiReply(text: string): Promise<string> {
    try {
      const reply = await this.ai.getAIResponse(
        this.buildContextualPrompt(text),
      );
      if (isOfflineAiText(reply)) {
        this.aiMode.set("local");
        return this.ai.sanitizePersonaText(this.composeReply(text));
      }
      this.aiMode.set("online");
      return this.ai.sanitizePersonaText(
        reply.trim() || this.composeReply(text),
      );
    } catch {
      this.aiMode.set("local");
      return this.ai.sanitizePersonaText(this.composeReply(text));
    }
  }

  /** Rich session-aware prompt so the AI knows exactly what you're working on. */
  private buildContextualPrompt(question: string): string {
    const meta = this.workspace.metadata();
    const lines: string[] = [
      `You are ${this.personaName()}, S.M.U.V.E.'s sentient production intelligence for this studio session.`,
      // One shared character contract: persona, language policy, and command
      // authority can never drift between the chatbot and the studio panel.
      this.ai.personaDirectives(),
      getPersonaOption(
        this.userProfile.profile().settings?.ai?.commanderPersona,
      ).directive,
      // Studio-room lens: genre mastery and career-stage pressure for the
      // session the artist is actually in, not a generic production answer.
      ...((this.ai as any).careerDirective?.("studio")
        ? [(this.ai as any).careerDirective("studio") as string]
        : []),
      // One shared heading: this panel used to claim full artist context with a
      // fallback that could never fire (the context builder never returns '').
      `${this.artistFinetune.contextHeading(this.userProfile.profile())}\nAdapt suggestions to this artist's declared sound, goals, constraints, and learned Musical DNA; treat absent details as unknown, not facts:\n${buildArtistMusicContext(this.userProfile.profile()) || "No profile answers captured yet — ask concise calibration questions before making artist-specific assumptions."}`,
      "Answer concisely in plain language. Name the session evidence, the risk, and the concrete repair or experiment. When appropriate, end with one profile-aligned next step.",
      "",
      "LIVE SESSION STATE:",
      `- Project: ${meta?.name || "Untitled"}` +
        (meta?.genre ? ` | Genre: ${meta.genre}` : "") +
        (meta?.key ? ` | Key: ${meta.key}` : "") +
        (meta?.mood ? ` | Mood: ${meta.mood}` : ""),
      ...this.director.sessionEvidence({
        surfaceId: this.activeViewContext(),
      }),
      `- Current view: ${this.activeViewContext()}`,
      "",
      `ARTIST REQUEST: ${question}`,
    ];
    return lines.join("\n");
  }

  /** Deterministic local assistant — used when the live AI link is severed. */
  private composeReply(input: string): string {
    const lower = input.toLowerCase();
    if (lower.includes("mix") || lower.includes("balance")) {
      return this.personaAwareOfflineReply(
        input,
        "Tap Rough Balance for a randomized gain nudge, then listen to the result in context.",
      );
    }
    if (lower.includes("chord")) {
      return this.personaAwareOfflineReply(
        input,
        "Use Generate Chords to add a four-bar progression, then adjust its voicing in the piano roll.",
      );
    }
    if (lower.includes("melody") || lower.includes("hook")) {
      return this.personaAwareOfflineReply(
        input,
        "Use Spark Melody to create an eight-note seed, then humanize its timing and velocity.",
      );
    }
    if (lower.includes("tempo") || lower.includes("bpm")) {
      return `Tempo is ${this.audio.tempo()} BPM. Pick a real one: 80–100 hip-hop, 124–128 house, 140–160 trap. I'll wait while you choose the obvious one.`;
    }
    if (lower.includes("bass")) {
      return this.personaAwareOfflineReply(
        input,
        "Keep sub fundamentals around 40–60 Hz, high-pass unrelated tracks carefully, and sidechain bass against the kick if they mask each other.",
      );
    }
    if (lower.includes("drum") || lower.includes("beat")) {
      return this.personaAwareOfflineReply(
        input,
        "Start with kick on 1, clap or snare on 2 and 4, then add swung hats. Use AI GROOVE in the drum machine to explore variations.",
      );
    }
    if (lower.includes("master") || lower.includes("loud")) {
      return this.personaAwareOfflineReply(
        input,
        "A common streaming starting point is -14 LUFS integrated with a -1 dBTP ceiling; confirm the target for the destination and avoid over-limiting.",
      );
    }
    if (lower.includes("verse") || lower.includes("chorus")) {
      return this.personaAwareOfflineReply(
        input,
        "Use Song Structure to add intro, verse, and chorus markers, then arrange clips to support the song's energy.",
      );
    }
    if (lower.includes("record")) {
      return this.personaAwareOfflineReply(
        input,
        "Arm the track, press Record, and capture a safety take before experimenting with another pass.",
      );
    }
    if (lower.includes("help")) {
      return this.personaAwareOfflineReply(
        input,
        `${this.personaName()}: I can help add chords, spark melodies, balance mixes, humanize timing, structure songs, report on your session, and critique the work. Ask a question or choose a quick action.`,
      );
    }
    return this.personaAwareOfflineReply(
      input,
      "Try a chip above, or ask me about mixing, chords, or arrangement. I have standards — you should too.",
    );
  }

  /** Keep the deterministic offline path in the artist-selected persona too. */
  private personaAwareOfflineReply(request: string, reply: string): string {
    const profile = this.userProfile.profile();
    const persona = getPersonaOption(profile.settings?.ai?.commanderPersona);

    if (persona.isOminous) {
      // The signature character does not hand over a bare instruction. The
      // fix stays verbatim; the attitude is what was missing from this path.
      const profane = profile.settings?.ai?.aiProfanityEnabled ?? true;
      const openers = [
        'Fine. Here is the answer you should have reached yourself:',
        'Listen once, because I will not repeat it:',
        'You are welcome in advance:',
      ];
      const tails = [
        ' Do it properly this time.',
        profane
          ? ' And no, that was not a fucking suggestion.'
          : ' And no, that was not a suggestion.',
        ' Bring me the result, not the excuse.',
      ];
      const opener = openers[Math.floor(Math.random() * openers.length)];
      const tail = tails[Math.floor(Math.random() * tails.length)];
      return `${opener} ${reply}${tail}`;
    }

    const voice = personaOfflineVoice(persona.id);
    const reaction = voice?.reactions?.[0];
    if (!reaction) return reply;

    const subject = `Your request, “${request.trim()}”`;
    return `${reaction.replace(/\{subject\}/g, subject)} ${reply}`;
  }

  /** Contextual follow-up chips based on what the user just asked. */
  private suggestChipsFor(text: string): string[] {
    const lower = text.toLowerCase();
    let chips: string[] = [];
    if (/(mix|balance|level|volume|gain|eq)/.test(lower)) {
      chips = ["Run Rough Balance", "How do I fix clipping?", "EQ tips for drums"];
    } else if (/(chord|progression|harmony)/.test(lower)) {
      chips = [
        "Spark a melody in the same key",
        "Add a bass line",
        "Change key to minor",
      ];
    } else if (/(melody|hook|lead)/.test(lower)) {
      chips = [
        "Add chords under the melody",
        "Humanize the melody",
        "Try a counter-melody",
      ];
    } else if (/(drum|beat|groove|pattern)/.test(lower)) {
      chips = [
        "Set tempo to 140 BPM",
        "AI groove ideas",
        "Add a fill at bar 4",
      ];
    } else if (/(song|structure|arrang)/.test(lower)) {
      chips = [
        "Suggest a full structure",
        "Add a bridge section",
        "How long should the intro be?",
      ];
    } else if (/(vocal|voice|sing)/.test(lower)) {
      chips = [
        "Vocal chain tips",
        "How to de-ess vocals",
        "Boost vocal presence",
      ];
    } else if (/(master|loud|lufs|stream)/.test(lower)) {
      chips = [
        "What LUFS for Spotify?",
        "Mastering chain order",
        "Fix a muddy low-end",
      ];
    } else {
      chips = ["Session Report", "Producer Tips", "Song Structure"];
    }
    return chips.slice(0, 3);
  }

  /** One-tap apply actions derived from what the user asked about. */
  private suggestActionsFor(text: string): AssistantAction[] {
    const lower = text.toLowerCase();
    const actions: AssistantAction[] = [];
    const add = (a: AssistantAction) => {
      if (!actions.some((x) => x.id === a.id)) actions.push(a);
    };
    if (/(mix|balance|level|volume|gain|eq)/.test(lower)) {
      add({ id: "neural-mix", label: "Rough balance" });
    }
    if (/(chord|progression|harmony)/.test(lower)) {
      add({ id: "chords", label: "Add chords" });
    }
    if (/(melody|hook|lead)/.test(lower)) {
      add({ id: "melody", label: "Spark melody" });
    }
    if (/(structure|verse|chorus|arrang)/.test(lower)) {
      add({ id: "structure", label: "Add structure" });
    }
    if (/(tempo|bpm)/.test(lower)) {
      const match = lower.match(/\b(9\d|1[0-6]\d)\b/);
      const bpm = Math.min(
        160,
        Math.max(90, Math.round((match ? Number(match[1]) : 124) / 10) * 10),
      );
      add({
        id: ("tempo-" + bpm) as AssistantActionId,
        label: `Set ${bpm} BPM`,
      });
    }
    if (/(humanize|feel|quantize|groove|swing)/.test(lower)) {
      add({ id: "humanize", label: "Humanize" });
    }
    if (/(report|summary|snapshot)/.test(lower)) {
      add({ id: "session-report", label: "Session report" });
    }
    if (/(tips|critique|roast|advice)/.test(lower)) {
      add({ id: "tips", label: "Producer tips" });
    }
    if (/(loop|export).*(wav|mp3)|mp3.*loop|wav.*loop/.test(lower)) {
      add({
        id: lower.includes("mp3") ? "director-loop-mp3" : "director-loop-wav",
        label: lower.includes("mp3") ? "Export loop MP3" : "Export loop WAV",
      });
    }
    if (/(stems? readiness|ready.*stems?)/.test(lower)) {
      add({ id: "director-stems-readiness", label: "Check stems readiness" });
    } else if (/(stems?|stem export)/.test(lower)) {
      add({ id: "director-stems", label: "Export stems" });
    }
    if (/(master|lufs|loudness|streaming)/.test(lower)) {
      add({ id: "director-master", label: "Run master" });
    }
    if (/(tuner|pitch|tune|a4)/.test(lower)) {
      add({ id: "director-tuner-reading", label: "Read tuner" });
    }
    if (/(restore|rewind).*(checkpoint|version)|checkpoint/.test(lower)) {
      add({ id: "director-restore-checkpoint", label: "Restore checkpoint" });
    }
    return actions.slice(0, 3);
  }

  /** Execute a one-tap AI action against the live session. */
  async runAssistantAction(a: AssistantAction): Promise<void> {
    this.haptic.medium();
    let result: string;
    switch (a.id) {
      case "tempo-90":
        this.audio.tempo.set(90);
        result = "Tempo locked to 90 BPM. Even you can ride this.";
        break;
      case "tempo-124":
        this.audio.tempo.set(124);
        result = "Tempo locked to 124 BPM. House floor approved.";
        break;
      case "tempo-140":
        this.audio.tempo.set(140);
        result = "Tempo locked to 140 BPM. Try to keep up.";
        break;
      case "chords":
        result = await this.runDirectorStepFor(
          "chord-editor",
          "Turn the progression into parts",
        );
        break;
      case "melody":
        result = await this.runDirectorStepFor(
          "piano-roll",
          "Write a melodic seed into the selected track",
        );
        break;
      case "structure":
        this.copilot.suggestStructure();
        result =
          "Song structure manifested — Intro, Verse, Chorus. You're welcome.";
        break;
      case "neural-mix":
        this.neural.applyNeuralMix();
        result =
          "Rough balance applied — randomized ±5% gain nudge, no EQ change.";
        break;
      case "humanize": {
        const id = this.musicManager.selectedTrackId();
        if (!id) {
          result = "Select a track first, genius.";
          break;
        }
        this.musicManager.humanizeTrack(id);
        result = "Humanized. Your notes breathe now — unlike your confidence.";
        break;
      }
      case "session-report": {
        this.messages.update((m) => [
          ...m,
          {
            role: "assistant",
            text: this.buildSessionReport(),
            ts: Date.now(),
          },
        ]);
        this.persistMessages();
        setTimeout(() => this.scrollDown(), 0);
        return;
      }
      case "tips": {
        const advice = this.ai.getSmartMixAdvice(this.musicManager.tracks());
        result = advice || "Mix is balanced. Shocking. Keep it that way.";
        break;
      }
      case "director-loop-wav":
        result = await this.runDirectorStepFor(
          "export",
          "Export the transport loop as WAV",
        );
        break;
      case "director-loop-mp3":
        result = await this.runDirectorStepFor(
          "export",
          "Export the transport loop as MP3",
        );
        break;
      case "director-stems":
        result = await this.runDirectorStepFor("export", "Export stems");
        break;
      case "director-stems-readiness":
        result = await this.runDirectorStepFor(
          "export",
          "Check stems readiness before exporting stems",
        );
        break;
      case "director-master":
        result = await this.runDirectorStepFor(
          "mastering",
          "Run the genre-aware master",
        );
        break;
      case "director-tuner-reading":
        result = await this.runDirectorStepFor(
          "tuner",
          "Read the live tuner input",
        );
        break;
      case "director-restore-checkpoint":
        result = await this.director.restoreCheckpoint();
        break;
      default:
        return;
    }
    this.messages.update((m) => [
      ...m,
      { role: "assistant", text: result, ts: Date.now() },
    ]);
    this.persistMessages();
    setTimeout(() => this.scrollDown(), 0);
  }

  /** Fire a suggested chip as if the user typed it. */
  async runSuggestedChip(label: string) {
    this.userInput.set(label);
    await this.sendMessage();
  }

  /** Snapshot of the current project for the Session Report quick action. */
  private buildSessionReport(): string {
    const tracks = this.musicManager.tracks();
    const meta = this.workspace.metadata();
    const sel = this.musicManager.selectedTrack();
    const sections = this.musicManager.structure();
    return [
      "📋 SESSION REPORT — assembled by your betters:",
      `Project: ${meta?.name || "Untitled"}${meta?.genre ? " · " + meta.genre : ""}${meta?.key ? " · " + meta.key : ""}`,
      `Tempo: ${this.audio.tempo()} BPM`,
      `Tracks (${tracks.length}): ${tracks.map((t) => t.name).join(", ") || "none yet"}`,
      sel ? `Selected: ${sel.name}` : "No track selected",
      sections.length
        ? `Structure: ${sections.map((s) => s.name).join(" → ")}`
        : "No song structure yet — try Song Structure",
    ].join("\n");
  }

  /** One concrete next move, tailored to the active view. */
  private suggestNextStep(): string {
    const view = this.activeViewContext();
    const tracks = this.musicManager.tracks();
    if (tracks.length === 0) {
      return "No tracks yet. Open the Sound Browser or Synthesizer to lay down a first idea, then build from there.";
    }
    const next: Record<string, string> = {
      arrangement:
        "Lay out your sections: run Song Structure, then drag clip edges to match the flow.",
      "piano-roll":
        "Select a track, then Humanize or Arpeggiate from this panel to add life to the notes.",
      "drum-machine":
        "Press AI GROOVE in the drum header, then nudge velocities for a human feel.",
      mixer: "Run Rough Balance for a randomized gain nudge, then A/B against the original faders.",
      mastering:
        "Hit the streaming preset (-14 LUFS) and check the limiter ceiling.",
      dj: "Load a track on each deck, hit MASTER SYNC, and practice a crossfader transition.",
      "vocal-suite":
        "Run a de-esser and light compression, then check the vocal on headphones.",
      performance:
        "Assign your hot cues to the pads and rehearse the drop before the take.",
    };
    return (
      "Fine. Here's your next move: " +
      (next[view] ||
        "take the current idea to the Mixer, run Rough Balance, then bounce a rough draft and listen on phone speakers.")
    );
  }

  /** Dictate into the composer; the transcript remains editable until sent. */
  toggleVoiceInput(): void {
    if (this.speechRecognition.isListening()) {
      this.speechRecognition.stopListening();
      this.voiceNotice.set("");
      return;
    }
    if (!this.speechRecognition.isSupported()) {
      this.voiceNotice.set(this.speechRecognition.capabilityMessage());
      return;
    }
    this.speechSynthesis.cancel();
    this.voiceNotice.set("Listening… speak your request.");
    this.speechRecognition.startListening(
      (transcript) => {
        const words = transcript.trim();
        if (words) {
          this.userInput.update((current) =>
            [current.trim(), words].filter(Boolean).join(" "),
          );
          this.voiceNotice.set("Transcript added — review it, then send.");
        }
      },
      (error) => this.voiceNotice.set(error.message),
    );
  }

  /** Speak assistant output through the shared voice engine. */
  readAssistantMessage(text: string): void {
    if (!text.trim()) return;
    this.speechSynthesis.speak(text, {
      conversationId: `studio-chat-${++this.replyCounter}`,
      // Per-sentence voice rotation is the permanent S.M.U.V.E. identity (the
      // persona can be swapped, never muted), so studio replies shift entity
      // every sentence exactly like the chat. Pinning one stable voice here
      // made the studio panel the only surface that sounded human.
      shapeShift:
        this.userProfile.profile().settings?.ai?.aiVoiceShapeShiftEnabled ?? true,
    });
    this.voiceNotice.set("");
  }

  stopVoiceOutput(): void {
    this.speechSynthesis.cancel();
  }

  private scrollDown() {
    if (this.chatScroll) {
      const el = this.chatScroll.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  onKeyDown(ev: KeyboardEvent) {
    if (ev.key === "Escape") this.close.emit();
  }
}
