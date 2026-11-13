import {
  Component,
  DestroyRef,
  OnInit,
  OnDestroy,
  AfterViewInit,
  inject,
  Injector,
  signal,
  computed,
  effect,
  untracked,
  runInInjectionContext,
  ViewChild,
  ElementRef,
  HostListener,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";

import { MidiWriter, MidiTrackData } from "./midi-writer.util";
import { MidiImportService } from "./midi-import.service";

import { AudioSessionService } from "./audio-session.service";
import { AudioRecorderService } from "./audio-recorder.service";
import { AtmosphericLightService } from "./atmospheric-light.service";
import { AudioEngineService } from "../services/audio-engine.service";
import { ExportService } from "../services/export.service";
import { CloudSyncService } from "../services/cloud-sync.service";
import { FileLoaderService } from "../services/file-loader.service";
import type { RemoteSnapshot } from "../types/cloud-sync.types";
import { HardwareService } from "../services/hardware.service";
import { AiService } from "../services/ai.service";
import { UIService } from "../services/ui.service";
import {
  MusicManagerService,
  type LaunchQuantize,
  type TrackNote,
} from "../services/music-manager.service";
import { ProjectService } from "../services/project.service";
import { HapticService } from "../services/haptic.service";
import { InteractionDialogService } from "../services/interaction-dialog.service";
import { ProjectTemplateService } from "../services/project-template.service";
import { AuthService } from "../services/auth.service";
import { CollaborationService } from "../services/collaboration.service";
import { SnackbarService, type ActionLogEntry } from "../services/snackbar.service";
import { LoggingService } from "../services/logging.service";
import {
  UserProfileService,
  type UserProfile,
} from "../services/user-profile.service";

import { MixerComponent } from "./mixer/mixer.component";
import { ArrangementViewComponent } from "./arrangement-view/arrangement-view.component";
import { InspectorComponent } from "./inspector/inspector.component";
import { PianoRollComponent } from "./piano-roll/piano-roll.component";
import { MasteringSuiteComponent } from "./mastering-suite/mastering-suite.component";
import { StudioExportSurfaceComponent } from "./export-surface/studio-export-surface.component";
import { DrumMachineComponent } from "./drum-machine/drum-machine.component";
import { PerformerComponent } from "./performer/performer.component";
import { SnackbarComponent } from "./shared/snackbar/snackbar.component";
import { ArchitectureMapComponent } from "./shared/architecture-map/architecture-map.component";
import {
  StudioGuideComponent,
  type GuideStateChange,
  type GuideTab,
} from "./studio-guide/studio-guide.component";
import { masterclassTargetForStudioSurface } from "./studio-guide/masterclass-route-guide";
import {
  StudioGuideAutoCheckService,
  type GuideLessonCompletion,
} from "./studio-guide/studio-guide.auto-check.service";
import { StudioGuideCompletionComponent } from "./studio-guide/studio-guide-completion.component";
import {
  guideDeepLinkParams,
  guideLessonById,
  parseGuideDeepLink,
} from "./studio-guide/studio-guide-deep-link";
import type { GuideTrackId } from "./studio-guide/studio-guide.data";
import { SearchOverlayComponent } from "./shared/search-overlay/search-overlay.component";
import { AiAssistantComponent } from "./shared/ai-assistant/ai-assistant.component";
import { AiProduceComponent } from "../components/ai-produce/ai-produce.component";
import { DjDeckComponent } from "./dj-deck/dj-deck.component";
import { VocalSuiteComponent } from "./vocal-suite/vocal-suite.component";
import { TunerComponent } from "./tuner/tuner.component";
import { ChannelRackComponent } from "./channel-rack/channel-rack.component";
import { EffectsRackUiComponent } from "./effects-rack-ui/effects-rack-ui.component";
import { AiBandComponent } from "./ai-band/ai-band.component";
import { IdeasGeneratorService, type IdeaRecipe } from "../services/ideas-generator.service";
import { HistoryService } from "../services/history.service";
import { AiMixAssistantService } from "./effects/ai-mix-assistant.service";
import {
  SmartRecordingService,
  type CompTake,
} from "./smart-recording.service";
import {
  ProjectWorkspaceService,
  type LocalProjectSummary,
  type LocalProjectVersion,
  type ProjectBundle,
} from "./project-workspace.service";
import {
  isProjectArchive,
  readProjectFile,
} from "./project-archive.util";
import { SmartSoundService } from "./smart-sound.service";
import { AudioRepairComponent } from "./audio-repair/audio-repair.component";
import { AudioImportService } from "./audio-import.service";
import { SmartProductionFoundationsService } from "./smart-production-foundations.service";
import type { SmartProductionCapability } from "./smart-production-foundations.service";
import { ComponentRecordingService } from "./component-recording.service";
import type { DeliveryTargetRequest } from "./shared/delivery-targets";
import { ExportReviewService } from "./export-surface/export-review.service";
import { SoundBrowserComponent } from "./sound-browser/sound-browser.component";
import { SynthesizerComponent } from "./synthesizer/synthesizer.component";
import { SoundPadGridComponent } from "./sound-pad-grid/sound-pad-grid.component";
import { AudioRecorderViewComponent } from "./audio-recorder-view/audio-recorder-view.component";
import { SampleLibraryComponent } from "./sample-library/sample-library.component";
import { BeginnerWizardComponent } from "./beginner-wizard/beginner-wizard.component";
import { BeginnerStepHintComponent } from "./beginner-wizard/beginner-step-hint.component";
import { WorkProtectionService } from "./work-protection.service";
import { ChordEditorComponent } from "./chord-editor/chord-editor.component";
import { MidiInputWidgetComponent } from "./midi-input-widget/midi-input-widget.component";
import { SamplerComponent } from "./sampler/sampler.component";
import {
  PerformanceModeComponent,
  PerformancePad,
} from "./performance-mode/performance-mode.component";
import { VocalCompViewComponent } from "./vocal-comp-view/vocal-comp-view.component";
import { BezierEditorComponent } from "./automation/bezier-editor.component";
import { ScoreViewComponent } from "./score-view/score-view.component";
import { PluginStoreComponent } from "./plugin-store/plugin-store.component";
import { WaveformRendererComponent } from "./waveform-renderer/waveform-renderer.component";
import { StudioTransportShellComponent } from "./shared/studio-transport-shell/studio-transport-shell.component";
import { SessionViewComponent } from "./session-view/session-view.component";
import { QuickSessionComponent } from "./quick-session/quick-session.component";
import { SmartCreationSheetComponent } from "./shared/smart-creation-sheet/smart-creation-sheet.component";
import {
  StudioCoachAction,
  StudioCoachActionId,
  StudioTelemetryService,
} from "./studio-telemetry.service";
import { AudioEngineLatencyService } from "../services/audio-engine-latency.service";
import { StudioDeviceProfileService } from "../services/studio-device-profile.service";
import { StudioOrchestrationService } from "../services/studio-orchestration.service";
import { buildZip, type ZipEntry } from "./zip.util";
import {
  STUDIO_SURFACE_GROUPS,
  STUDIO_SURFACES,
  isStudioSurfaceId,
  type StudioSurfaceId,
} from "./studio-surfaces";

/**
 * The classic shell renders the same surface ids the shared catalogue declares,
 * so a view cannot exist in one shell and not the other.
 */
type StudioView = StudioSurfaceId;
type MobileStudioPanel = "browser" | "inspector" | "fx-rack" | "templates";

function isStudioView(value: string): value is StudioView {
  return isStudioSurfaceId(value);
}

/**
 * `?view=` names the composed `/studio` page used for the same destinations.
 * They still arrive from bookmarks and deep links; map them onto the surface
 * that does the same job here instead of silently opening Arrange.
 */
const STUDIO_VIEW_ALIASES: Readonly<Record<string, StudioView>> = {
  create: "audio-recorder",
  recording: "audio-recorder",
  keys: "piano-roll",
  mix: "mixer",
};

/** The surface a `?view=` value names, following the page's old aliases. */
function studioViewForParam(value: string): StudioView | null {
  if (isStudioView(value)) return value;
  return STUDIO_VIEW_ALIASES[value.toLowerCase()] ?? null;
}

/**
 * Where `/studio` opens when the URL does not name a surface. A fresh session
 * starts on Quick Session — the first thing a new project needs is a take or a
 * beat, not a sixteen-surface DAW. Restored work returns to the arrangement
 * instead, and an explicit `?view=` beats both (hence null).
 */
export function landingStudioView(options: {
  hasExplicitView: boolean;
  restored: boolean;
}): StudioView | null {
  if (options.hasExplicitView) return null;
  return options.restored ? "arrangement" : "quick-session";
}

/** First-visit Music Map marker: the auto-open is offered once, ever. */
const MUSIC_MAP_SEEN_STORAGE_KEY = "smuve_music_map_seen";

function readMusicMapSeen(): boolean {
  if (typeof window === "undefined") return true; // SSR: never auto-open
  try {
    return window.localStorage.getItem(MUSIC_MAP_SEEN_STORAGE_KEY) === "1";
  } catch {
    return true; // storage refused: fail closed, no auto-open
  }
}

function markMusicMapSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUSIC_MAP_SEEN_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * Should this visit greet the artist with the Music Map? Exactly three
 * stars must align, once ever: a FRESH session (nothing restored, so an
 * empty `tracks()` demo state is what they'll meet), no explicit `?view=`
 * deep link (they know where they're going), and no guided `?tour=1`
 * session (the First Beat tour already walks the same path — the map would
 * double-cover it). A seen marker from any earlier visit vetoes the rest.
 */
export function shouldAutoOpenMusicMap(options: {
  restored: boolean;
  hasExplicitView: boolean;
  guidedTour: boolean;
  seenBefore: boolean;
}): boolean {
  return (
    !options.restored &&
    !options.hasExplicitView &&
    !options.guidedTour &&
    !options.seenBefore
  );
}

/** 3-way theme storage key. Persists across sessions. */
const THEME_STORAGE_KEY = "smuve_studio_theme";
/** Stage FX ambience (aurora / marquee / sheens) storage key. */
const MOBILE_START_STORAGE_KEY = "smuve_mobile_start_lane";
const STAGE_FX_STORAGE_KEY = "smuve_stage_fx";
type AppTheme = "light" | "focus" | "dark";
const THEME_ORDER: AppTheme[] = ["light", "focus", "dark"];
const NEXT_THEME_ICON: Record<AppTheme, string> = {
  light: "filter_drama",
  focus: "dark_mode",
  dark: "light_mode",
};
const THEME_LABEL: Record<AppTheme, string> = {
  light: "LIGHT",
  focus: "FOCUS",
  dark: "DARK",
};

import { StudioFocusService } from "./shared/studio-focus.service";
import {
  IndexedDbStemCacheStore,
  StemCacheService,
  StemCacheStore,
} from "./stem-cache.service";
/**
 * Views that render their own screen. Everything else falls through the
 * `*ngSwitchDefault` body of the view switch, which is the arrangement — so the
 * arrangement is on screen for those views too. This list mirrors the template;
 * update it when a `*ngSwitchCase` is added.
 */
const SELF_HOSTING_VIEWS = new Set<string>([
  'ai-produce',
  'audio-recorder',
  'channel-rack',
  'chord-editor',
  'dj',
  'drum-machine',
  'effects-rack',
  'export',
  'mastering',
  'mixer',
  'performance',
  'performer',
  'piano-roll',
  'plugins',
  'quick-session',
  'sample-library',
  'sampler',
  'score',
  'session',
  'sound-browser',
  'sound-pad',
  'synthesizer',
  'tuner',
  'vocal-suite',
]);

@Component({
  selector: "app-studio",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MixerComponent,
    ArrangementViewComponent,
    InspectorComponent,
    PianoRollComponent,
    MasteringSuiteComponent,
    StudioExportSurfaceComponent,
    DrumMachineComponent,
    PerformerComponent,
    SnackbarComponent,
    SearchOverlayComponent,
    AiAssistantComponent,
    AiProduceComponent,
    DjDeckComponent,
    VocalSuiteComponent,
    ChannelRackComponent,
    EffectsRackUiComponent,
    AiBandComponent,
    SoundBrowserComponent,
    SynthesizerComponent,
    SoundPadGridComponent,
    AudioRecorderViewComponent,
    SampleLibraryComponent,
    BeginnerWizardComponent,
    BeginnerStepHintComponent,
    ChordEditorComponent,
    MidiInputWidgetComponent,
    SamplerComponent,
    PerformanceModeComponent,
    VocalCompViewComponent,
    BezierEditorComponent,
    ScoreViewComponent,
    PluginStoreComponent,
    WaveformRendererComponent,
    StudioTransportShellComponent,
    SessionViewComponent,
    QuickSessionComponent,
    TunerComponent,
    SmartCreationSheetComponent,
    AudioRepairComponent,
    ArchitectureMapComponent,
    StudioGuideComponent,
    StudioGuideCompletionComponent,
  ],
  providers: [
    StemCacheService,
    { provide: StemCacheStore, useClass: IndexedDbStemCacheStore },
  ],
  templateUrl: "./studio.component.html",
  styleUrls: [
    "./studio.component.css",
    "./studio-shell-refinement.css",
    "./stage-2.0-atmosphere.css",
    "./studio-redesign.css",
    /* Platform UX layer — Android touch + Chrome desktop ergonomics.
       Also registered in each interactive instrument's styleUrls
       (encapsulation keeps shell styles out of child templates). */
    "./shared/platform-ux.css",
  ],
  /* Studio-wide deep responsive refinement (additive layer, see
     DEEP RESPONSIVE REFINEMENT blocks in the subview stylesheets). */
  styles: [
    `
      /* DEEP RESPONSIVE REFINEMENT — Studio-wide */
      .comp-view-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        height: 100%;
        min-height: 220px;
        color: var(--espresso-muted, #6b6255);
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.04em;
      }
      .comp-view-loading .material-symbols-outlined {
        font-size: 22px;
        color: var(--teal-500, #0e7c7b);
      }
      @media (max-width: 768px) {
        .comp-tab,
        .comp-icon-btn,
        .comp-drawer-item {
          min-height: 44px;
        }
        .comp-canvas {
          scrollbar-width: thin;
          scrollbar-color: var(--teal-500, #0e7c7b) transparent;
        }
        .comp-view {
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
      }
      @media (max-width: 932px) and (orientation: landscape) {
        .comp-view {
          padding-bottom: 0;
        }
        .comp-topbar-tools {
          gap: 6px;
        }
        .comp-canvas {
          scrollbar-width: thin;
        }
      }
      .comp-shell :focus-visible {
        outline: 2px solid var(--teal-400, #2ba09c);
        outline-offset: 2px;
        border-radius: 4px;
      }

      /* Mobile quick-start lane — a calm, thumb-first entry point for new
         sessions. The full Studio remains one tap away through the dock. */
      .comp-mobile-start {
        display: none;
        grid-column: 1 / -1;
      }
      @media (max-width: 768px) {
        .comp-main {
          flex-direction: column;
        }
        .comp-mobile-start {
          display: grid;
          flex: 0 0 auto;
          gap: 12px;
          position: relative;
          isolation: isolate;
          padding: 14px;
          border: 1px solid rgba(14, 124, 123, 0.18);
          border-radius: 18px;
          background: linear-gradient(
            135deg,
            rgba(251, 247, 236, 0.98),
            rgba(230, 245, 244, 0.92)
          );
          box-shadow: 0 10px 24px rgba(61, 53, 42, 0.08);
          /* The lane is a fixed-height flex sibling of the canvas, so on a short
             phone (or with Android Chrome's 200% text scaling) an uncapped card
             would push the arrangement out of the 100dvh shell entirely. Cap it
             and let the card scroll instead of starving the workspace. */
          max-height: min(48vh, 268px);
          overflow-x: hidden;
          overflow-y: auto;
          overscroll-behavior: contain;
        }
        .comp-mobile-start-copy {
          display: grid;
          gap: 4px;
        }
        .comp-mobile-start-kicker-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .comp-mobile-start-kicker {
          color: var(--stage-teal, #0e7c7b);
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.14em;
        }
        .comp-mobile-start-badge {
          display: inline-flex;
          align-items: center;
          padding: 2px 7px;
          border-radius: 9999px;
          background: linear-gradient(
            135deg,
            rgba(14, 124, 123, 0.2),
            rgba(20, 184, 166, 0.3)
          );
          border: 1px solid rgba(14, 124, 123, 0.35);
          color: #0e7c7b;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .comp-mobile-start h2 {
          margin: 0;
          color: var(--stage-ink, #1f1a12);
          font-size: clamp(18px, 5vw, 23px);
          line-height: 1.05;
          letter-spacing: -0.03em;
        }
        .comp-mobile-start p {
          max-width: 38rem;
          margin: 0;
          color: var(--stage-muted, #7e7259);
          font-size: 11px;
          line-height: 1.4;
        }
        .comp-mobile-start-action {
          display: flex;
          min-width: 0;
          min-height: 62px;
          align-items: center;
          gap: 9px;
          padding: 10px;
          border: 1px solid rgba(61, 53, 42, 0.12);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.68);
          color: var(--stage-ink, #1f1a12);
          text-align: left;
          cursor: pointer;
          transition:
            transform 160ms ease,
            box-shadow 160ms ease,
            border-color 160ms ease;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }
        .comp-mobile-start-action:active {
          transform: scale(0.97);
        }
        .comp-mobile-start-action:hover,
        .comp-mobile-start-action:focus-visible {
          border-color: rgba(14, 124, 123, 0.45);
          box-shadow: 0 6px 14px rgba(14, 124, 123, 0.12);
        }
        .comp-mobile-start-action .material-symbols-outlined {
          display: grid;
          width: 34px;
          height: 34px;
          flex: 0 0 34px;
          place-items: center;
          border-radius: 10px;
          background: rgba(14, 124, 123, 0.1);
          color: var(--stage-teal, #0e7c7b);
          font-size: 20px;
        }
        .comp-mobile-start-action span:last-child {
          display: grid;
          min-width: 0;
          gap: 2px;
        }
        .comp-mobile-start-action strong,
        .comp-mobile-start-action small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .comp-mobile-start-action strong {
          font-size: 11px;
          line-height: 1.1;
        }
        .comp-mobile-start-action small {
          color: var(--stage-muted, #7e7259);
          font-size: 9px;
        }
        .comp-mobile-start-hero {
          background: linear-gradient(
            135deg,
            rgba(20, 184, 166, 0.22),
            rgba(14, 124, 123, 0.12),
            rgba(255, 255, 255, 0.9)
          );
          border: 1.5px solid rgba(20, 184, 166, 0.55);
          box-shadow: 0 4px 14px rgba(20, 184, 166, 0.18);
        }
        .comp-mobile-start-hero .material-symbols-outlined {
          background: linear-gradient(135deg, #14b8a6, #0e7c7b);
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(20, 184, 166, 0.35);
        }
        .comp-mobile-start-hero strong {
          color: #0d6e6d;
          font-weight: 800;
        }
      }
      /* Landscape phones: the shell spends ~44px on the topbar, ~48px on the
         tool row and ~52px on the dock, leaving little over 250px for the
         canvas. The stacked quick-start lane costs ~240px, which would leave
         the arrangement view with almost nothing, so drop the pitch copy and
         keep the one-tap starter as a single compact strip. */
      @media (max-width: 768px) and (orientation: landscape) {
        .comp-mobile-start {
          padding: 10px;
          gap: 8px;
        }
        .comp-mobile-start-copy {
          display: none;
        }
        .comp-mobile-start-action {
          min-height: 52px;
          gap: 7px;
          padding: 8px;
        }
        .comp-mobile-start-action strong {
          font-size: 10px;
        }
        .comp-mobile-start-action small {
          display: none;
        }
        .comp-mobile-start-action .material-symbols-outlined {
          width: 28px;
          height: 28px;
          flex-basis: 28px;
          font-size: 17px;
        }
      }
      @media (max-width: 390px) {
        .comp-mobile-start {
          padding: 12px;
        }
        .comp-mobile-start-action {
          min-height: 58px;
          gap: 6px;
          padding: 8px;
        }
        .comp-mobile-start-action .material-symbols-outlined {
          width: 30px;
          height: 30px;
          flex-basis: 30px;
          font-size: 18px;
        }
      }
    `,
  ],
})
export class StudioComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild("fileInput", { static: false })
  fileInput?: ElementRef<HTMLInputElement>;
  @ViewChild(SnackbarComponent) snackbar?: SnackbarComponent;
  @ViewChild(SearchOverlayComponent) searchOverlay?: SearchOverlayComponent;  @ViewChild("spectrumCanvas", { static: false})
  spectrumCanvas?: ElementRef<HTMLCanvasElement>;
  /** Shell root — carries the --atmo-* custom properties the aurora reads. */
  @ViewChild("shellRoot", { static: false})
  shellRoot?: ElementRef<HTMLElement>;

  /** Animation frame handle for spectrum analyzer rendering */
  private spectrumRafId: number | null = null;

  /** Used to create effects from lifecycle hooks (injection context). */
  private readonly injector = inject(Injector);

  // ---- Services (public for templates) ----
  public readonly audioSession = inject(AudioSessionService);
  /** The Audio Recorder view's own MediaRecorder — capture that is not the transport. */
  private readonly audioRecorder = inject(AudioRecorderService);
  public readonly audioEngine = inject(AudioEngineService);
  private readonly atmosphere = inject(AtmosphericLightService);
  public hardware = inject(HardwareService);
  collaboration = inject(CollaborationService);
  public readonly uiService = inject(UIService);
  public readonly musicManager = inject(MusicManagerService);
  private readonly exportService = inject(ExportService);
  public readonly aiService = inject(AiService);
  private readonly authService = inject(AuthService);
  private readonly userProfile = inject(UserProfileService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private projectService = inject(ProjectService);
  private readonly haptic = inject(HapticService);
  private readonly dialog = inject(InteractionDialogService);
  private readonly workProtection = inject(WorkProtectionService);
  private readonly snackbarService = inject(SnackbarService);
  /** Quiet action log surfaced only when the artist opens the Activity panel. */
  public readonly actionLog = this.snackbarService.actionLog;
  private readonly logger = inject(LoggingService);
  private readonly ideasGenerator = inject(IdeasGeneratorService);
  private readonly history = inject(HistoryService);
  public readonly templateService = inject(ProjectTemplateService);
  public readonly aiMixAssistant = inject(AiMixAssistantService);
  public readonly smartRecording = inject(SmartRecordingService);
  public readonly projectWorkspace = inject(ProjectWorkspaceService);
  public readonly smartSound = inject(SmartSoundService);
  public readonly audioImport = inject(AudioImportService);
  public readonly midiImport = inject(MidiImportService);
  private readonly fileLoader = inject(FileLoaderService);
  public readonly smartProduction = inject(SmartProductionFoundationsService);
  public readonly componentRecording = inject(ComponentRecordingService);
  public readonly studioTelemetry = inject(StudioTelemetryService);
  public readonly engineLatency = inject(AudioEngineLatencyService);
  /** Capability-detected device class + audio budget (see Engine Metrics). */
  public readonly deviceProfile = inject(StudioDeviceProfileService);

  // ── Back navigation (see the BACK NAVIGATION section below) ──
  /** Synthetic history entries currently pushed for open overlays. */
  private backTrapDepth = 0;
  private pendingOverlayHistoryPops = 0;
  /** Set while navigateHome() unwinds its synthetic overlay entries. */
  private leavingStudioForHome = false;
  /** Fallback so a dropped history traversal cannot strand the user in Studio. */
  private homeExitTimer: ReturnType<typeof setTimeout> | null = null;
  /** Timestamp of the first back press that armed the "press again" exit. */
  private exitArmedAt = 0;
  /** Native backButton listener handle (device only). */
  private backButtonHandle: { remove: () => void } | null = null;
  public readonly orchestration = inject(StudioOrchestrationService);

  // ---- State ----
  /**
   * A fresh session lands on Quick Session: the first thing a new project needs
   * is a take or a beat, not a sixteen-surface DAW. A restored project (or an
   * explicit `?view=`) overrides this in ngOnInit.
   */
  activeView = signal<StudioView>("quick-session");

  /** Target carried from the export review into Mastering. */
  readonly masteringTargetRequest = signal<DeliveryTargetRequest | null>(null);
  /** One-shot slot/plugin focus for the Effects Rack. */
  readonly effectsRackFocus = signal<{ slot?: number; pluginId?: string } | null>(null);
  private readonly studioFocus = inject(StudioFocusService);
  private readonly exportReview = inject(ExportReviewService);
  showSmartCreationSheet = signal(false);
  /** One-tap "how does this machine make music?" sheet, opened from the rail. */
  showArchitectureMap = signal(false);
  /** Full-screen Masterclass: guided paths plus the every-surface atlas. */
  showStudioGuide = signal(false);
  /** Shell-owned deep-link landing request; the guide mirrors user changes. */
  readonly guideTabRequest = signal<GuideTab | null>(null);
  readonly guideTrackRequest = signal<GuideTrackId | null>(null);
  readonly guideLessonRequest = signal<string | null>(null);
  readonly guideAutoCheck = inject(StudioGuideAutoCheckService);
  mobilePanel = signal<MobileStudioPanel | null>(null);
  showAiAssistant = signal(false);
  showAiMixAssistant = signal(false);
  showProjectMetadata = signal(false);
  showSmartRecordingPanel = signal(false);
  showImportPanel = signal(false);
  importSnapEnabled = signal(true);
  importWaveformZoom = signal(1);
  /** Tempo the selected import was recorded at (for Match BPM). */
  importSourceBpm = signal(120);
  /** Tempo estimated when this file was imported, when the estimate was usable. */
  importDetectedBpm = computed<number | null>(
    () => this.audioImport.selectedAudio()?.detectedBpm ?? null,
  );

  /** Text for a Smart Production badge; BPM shows the value measured on import. */
  smartProductionDetail(cap: SmartProductionCapability): string {
    if (cap.feature === "bpmDetection") {
      const detected = this.importDetectedBpm();
      if (detected) return `~${Math.round(detected)} BPM`;
    }
    return "Ready";
  }
  showComponentRecording = signal(false);
  showStudioInsights = signal(false);
  /** Closed by default: routine actions are not painted live over the Studio. */
  showActivityLog = signal(false);
  showProjectMenu = signal(false);
  toggleProjectMenu() {
    this.showProjectMenu.update((v) => !v);
  }
  /** True while an Insights engine probe is in-flight. */
  insightsProbeRunning = signal(false);

  // ── Bezier editor state ──────────────────────────────────
  showBezierEditor = signal(false);
  bezierLaneId = signal<string>("");

  // ── Cloud version history ────────────────────────────────
  showVersionHistory = signal(false);
  versionHistory = signal<RemoteSnapshot[]>([]);
  versionHistoryBusy = signal(false);
  /** True while the panel is showing device-kept versions, not cloud ones. */
  versionHistoryOffline = signal(false);

  // ── Sets browser (local project workspaces) ──────────────
  /** Right-slide list of every set saved on this device. */
  showSetsBrowser = signal(false);
  /** Bottom-sheet repair flow for clips whose take is missing. */
  showAudioRepair = signal(false);
  localSets = signal<LocalProjectSummary[]>([]);
  setsBusy = signal(false);
  setsError = signal('');
  /** Set whose device-kept versions are expanded in the Sets browser. */
  setsVersionsFor = signal('');
  setsVersions = signal<LocalProjectVersion[]>([]);

  /**
   * Saved mix state shown in Project Details. Each of these is a real field on
   * the persisted project, not a mirror: mono is mixState.monitorMono,
   * solo-safe lives on the track, and a launch boundary lives on the pattern
   * slot. Opening Project Details is therefore enough to explain why a
   * reopened set is monitoring in mono.
   */
  readonly monitorMono =
    this.musicManager.engine?.monoMonitoring ?? signal(false);
  /** Follow actions travel in the same saved session state as the grid. */
  readonly sceneFollowEnabled =
    this.musicManager.sceneFollowEnabled ?? signal(false);
  readonly sceneFollowBars = this.musicManager.sceneFollowBars ?? signal(4);
  /**
   * Scenes that override the global follow setting, resolved through the scene
   * columns so the list stays in scene order even though the saved rules are
   * keyed by scene identity.
   */
  readonly sceneFollowRuleRows = computed(() => {
    const columns = this.musicManager.sceneColumnCount?.() ?? 0;
    const tracks = this.musicManager.tracks();
    const rows: Array<{ column: number; label: string; value: string }> = [];
    for (let column = 0; column < columns; column++) {
      const rule = this.musicManager.sceneFollowRule?.(column);
      if (!rule) continue;
      const sceneName =
        tracks
          .filter((track) => track.type !== "audio")
          .map((track) => track.patternSlots?.[column]?.name)
          .find((name): name is string => !!name && !!name.trim()) ??
        `Scene ${column + 1}`;
      rows.push({
        column,
        label: sceneName,
        value:
          rule.mode === "loop"
            ? "LOOP"
            : `${rule.bars ?? this.sceneFollowBars()} BARS`,
      });
    }
    return rows;
  });
  readonly soloSafeChannels = computed(() =>
    this.musicManager.tracks().filter((track) => !!track.soloSafe),
  );
  readonly cellLaunchBoundaries = computed(() => {
    const rows: Array<{
      trackId: string;
      trackName: string;
      slotId: string;
      slotName: string;
      quantize: LaunchQuantize;
    }> = [];
    for (const track of this.musicManager.tracks()) {
      for (const slot of track.patternSlots ?? []) {
        if (!slot.launchQuantize) continue;
        rows.push({
          trackId: track.id,
          trackName: track.name,
          slotId: slot.id,
          slotName: slot.name,
          quantize: slot.launchQuantize,
        });
      }
    }
    return rows;
  });

  /** Labels for the mobile one-tap instrumental chips. */
  private static readonly QUICK_START_LABELS: Record<string, string> = {
    trap: 'Trap',
    lofi: 'Lo-Fi',
    house: 'House',
    'neo-soul': 'Neo-Soul',
    drill: 'Drill',
    afrobeats: 'Afrobeats',
  };

  /**
   * Six curated one-tap instrumentals for the mobile quick-start lane. Each
   * chip loads a complete drums + bass + chords + melody arrangement, so a
   * phone artist hears a finished-sounding loop in a single tap.
   */
  mobileQuickRecipes = computed(() => {
    const recipes = this.ideasGenerator.recipes ?? [];
    return Object.keys(StudioComponent.QUICK_START_LABELS)
      .map((id) => recipes.find((recipe) => recipe.id === id))
      .filter((recipe): recipe is IdeaRecipe => !!recipe)
      .map((recipe) => ({
        id: recipe.id,
        label: StudioComponent.QUICK_START_LABELS[recipe.id] ?? recipe.name,
        glyph: recipe.glyph,
        bpm: recipe.bpm,
        vibe: recipe.vibe,
      }));
  });
  /** Lazy so specs that never touch version history don't build the cloud. */
  private get cloudSync(): CloudSyncService {
    return this.injector.get(CloudSyncService);
  }

  toggleBezierEditor(laneId?: string): void {
    this.haptic.light();
    if (laneId) this.bezierLaneId.set(laneId);
    this.showBezierEditor.update((v) => !v);
  }

  // ── Vocal comp view ─────────────────────────────────────
  showVocalComp = signal(false);

  toggleVocalComp(): void {
    this.haptic.light();
    this.showVocalComp.update((v) => !v);
  }

  toggleImportSnap(): void {
    this.importSnapEnabled.update((v) => !v);
    this.haptic.light();
  }

  setImportSourceBpm(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value)) {
      this.importSourceBpm.set(Math.max(20, Math.min(300, Math.round(value))));
    }
  }

  /** Stretch the selected import so it plays at the project tempo. */
  matchImportTempo(): void {
    const ratio = this.audioImport.matchSelectedToProjectTempo(
      this.importSourceBpm(),
    );
    if (ratio === null) {
      this.snackbarService.warning("Import an audio file first");
      return;
    }
    this.haptic.light();
    this.snackbarService.info(
      `Stretch set to ${ratio.toFixed(2)}× to match ${this.audioEngine.tempo()} BPM`,
    );
  }

  /** Correct a half/double reading before adopting the detected tempo. */
  adjustDetectedTempo(factor: number): void {
    const detected = this.importDetectedBpm();
    if (!detected) return;
    const adjusted = Math.max(20, Math.min(300, Math.round(detected * factor)));
    this.importSourceBpm.set(adjusted);
    this.matchImportTempo();
  }

  /** Adopt the tempo detected at import, then stretch to the project tempo. */
  useDetectedTempo(): void {
    const detected = this.importDetectedBpm();
    if (!detected) {
      this.snackbarService.info("No tempo was detected in this file");
      return;
    }
    this.importSourceBpm.set(Math.max(20, Math.min(300, Math.round(detected))));
    this.matchImportTempo();
  }

  /** The buffer the import preview draws, enhanced render included. */
  private selectedImportBuffer(): AudioBuffer | null {
    const audio = this.audioImport.selectedAudio();
    if (!audio) return null;
    // Show the enhanced render once the user applies it, so the waveform and
    // the audio preview always agree.
    return (
      audio.enhancedBuffer ??
      audio.buffer ??
      audio.sampleStreamer?.getResidentBuffer() ??
      null
    );
  }

  selectedImportWaveform(): Float32Array | null {
    const buffer = this.selectedImportBuffer();
    if (!buffer) return null;
    const source = buffer.getChannelData(0);
    const zoom = Math.max(1, this.importWaveformZoom());
    if (zoom === 1) return source;
    const length = Math.max(256, Math.floor(source.length / zoom));
    return source.subarray(0, length);
  }

  /** Every channel of that buffer, so a one-sided stereo file still draws. */
  selectedImportChannels(): Float32Array[] | null {
    const buffer = this.selectedImportBuffer();
    if (!buffer) return null;
    const zoom = Math.max(1, this.importWaveformZoom());
    return Array.from({ length: buffer.numberOfChannels }, (_, index) => {
      const source = buffer.getChannelData(index);
      if (zoom === 1) return source;
      const length = Math.max(256, Math.floor(source.length / zoom));
      return source.subarray(0, length);
    });
  }

  onBezierCurveChanged(_curve: unknown): void {
    this.snackbarService.info("Bezier curve applied to automation lane");
  }
  crossLinkAnnouncement = signal<string>("");

  // ── Performance Pads ────────────────────────────────────
  performancePads = signal<PerformancePad[]>([
    { id: 1, name: "KICK", type: "one-shot", isPlaying: false },
    { id: 2, name: "SNARE", type: "one-shot", isPlaying: false },
    { id: 3, name: "HAT", type: "one-shot", isPlaying: false },
    { id: 4, name: "CLAP", type: "one-shot", isPlaying: false },
    { id: 5, name: "BASS", type: "loop", isPlaying: false },
    { id: 6, name: "CHORD", type: "loop", isPlaying: false },
    { id: 7, name: "LEAD", type: "loop", isPlaying: false },
    { id: 8, name: "FX", type: "one-shot", isPlaying: false },
  ]);

  onPerformancePadClicked(pad: PerformancePad): void {
    this.haptic.medium();
    // Toggle playing state
    this.performancePads.update((pads) =>
      pads.map((p) =>
        p.id === pad.id ? { ...p, isPlaying: !p.isPlaying } : p,
      ),
    );
    // Hit it — actually sound the pad through the live engine (one-shot).
    // Loops only re-trigger while the pad state shows OFF→ON, so a tap
    // always produces one hit and loops keep sounding via the engine's own
    // pattern transport (see the drum machine / sequencer wiring).
    if (!pad.isPlaying) {
      this.audioEngine.resume();
      this.triggerPerformancePad(pad.name);
    }
    this.snackbarService.info(
      `Pad ${pad.isPlaying ? "OFF" : "HIT"}: ${pad.name}`,
    );
  }

  /**
   * Per-pad synthesis recipes — the benchmark mobile DAWs (FL Studio Mobile,
   * BandLab) never fire a plain sine for a drum pad, so each pad family gets
   * an engine recipe tuned to its character:
   *   kick → pitch-swept sine (150→40 Hz) for the body "thump"
   *   snare/clap → bright triangle body with a fast decay
   *   hat → short high sine tick with a snap envelope
   *   tonal loops (bass/chord/lead) → their tuned pitch with a musical decay
   * Falls back to a safe sine when the engine lacks playSynth (test mocks).
   */
  private triggerPerformancePad(padName: string): void {
    const midiNotes: Record<string, number> = {
      KICK: 36,
      SNARE: 38,
      HAT: 42,
      CLAP: 39,
      BASS: 45,
      CHORD: 48,
      LEAD: 60,
      FX: 72,
    };
    const note = midiNotes[padName] || 48;
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const time = this.audioEngine.ctx?.currentTime ?? 0;
    try {
      if (padName === "KICK") {
        // Pitch-swept body: start well above the fundamental so the strike
        // has an audible transient, then glide into the 40 Hz sub tail.
        this.audioEngine.playSynth?.(time, 150, 0.32, 1.0, 0, {
          type: "sine",
          glideTo: 42,
          attack: 0.002,
          release: 0.08,
        });
      } else if (padName === "SNARE") {
        // Triangle body carries the tone; the engine's saturation adds the
        // grit that reads as "snare wires" at mobile-speaker volume.
        this.audioEngine.playSynth?.(time, 190, 0.18, 0.9, 0, {
          type: "triangle",
          attack: 0.001,
          release: 0.05,
        });
        this.audioEngine.playSynth?.(time, 2400, 0.1, 0.35, 0, {
          type: "square",
          attack: 0.001,
          release: 0.03,
        });
      } else if (padName === "HAT") {
        // Short bright tick — closed-hat register with a snappy envelope.
        this.audioEngine.playSynth?.(time, 7000, 0.06, 0.5, 0, {
          type: "square",
          attack: 0.001,
          release: 0.02,
        });
      } else if (padName === "CLAP") {
        // Three micro-bursts emulate the multi-tail clap reflect chain.
        for (const offset of [0, 0.012, 0.026]) {
          this.audioEngine.playSynth?.(time + offset, 1100, 0.05, 0.7, 0, {
            type: "triangle",
            attack: 0.001,
            release: 0.02,
          });
        }
      } else {
        // Tonal pads (BASS / CHORD / LEAD / FX) keep their tuned pitch.
        this.audioEngine.playSynth?.(time, freq, 0.4, 0.9, 0, {
          type: "sine",
        });
      }
    } catch {
      // test mock / suspended context — the visual toggle still lands
    }
  }
  private lastConsumedCrossLinkTimestamp = 0;
  browserDrawerOpen = signal(false);
  headerCollapsed = signal(false);
  studioWeeklyDashboard = computed(() =>
    this.studioTelemetry.weeklyDashboard(),
  );
  /** True after the very first time this component has been constructed this browser. */
  firstNavigationSeen = signal(
    this.hasLocalStorageKey("smuve_first_nav_seen", "true"),
  );
  /**
   * Mark the first navigation as seen. Called once on construction so the
   * topbar staggered entrance animation only fires for the first load.
   */
  private markFirstNavigationSeen(): void {
    if (this.firstNavigationSeen()) return;
    this.firstNavigationSeen.set(true);
    try {
      localStorage.setItem("smuve_first_nav_seen", "true");
    } catch {
      /* private mode / locked storage — degrade silently */
    }
  }
  footerCollapsed = signal(false);
  mobileDrawerOpen = signal(false);

  /**
   * Phone-first progressive disclosure: the drawer opens on the six surfaces a
   * session actually starts in, and the remaining tools stay one tap away.
   * The desktop rail still shows every workflow stage.
   */
  readonly primarySurfaces = computed(() =>
    STUDIO_SURFACES.filter((surface) => surface.primary),
  );
  showAllDrawerTools = signal(false);

  /** Choose a surface from the phone drawer and collapse the full map again. */
  readonly selectDrawerSurface = (id: StudioView): void => {
    this.showAllDrawerTools.set(false);
    this.setActiveView(id);
  };
  /**
   * Compact-mobile tools sheet. The topbar's MORE button opens every
   * secondary command (create, mix, record, save/export, appearance, share,
   * collab) in one bottom sheet, so a phone no longer stacks nine tool
   * buttons above the canvas. Desktop hides the trigger entirely.
   */
  showMobileToolsSheet = signal(false);

  /**
   * The phone quick-start lane is a launch strip, not a landing page: it opens
   * collapsed so the arrangement canvas stays above the fold, and the vibe rail
   * plus the next-step row only render once the artist asks for them. The
   * artist's choice is remembered per device, so someone who works from the
   * vibe rail does not re-open it on every visit.
   */
  mobileStartExpanded = signal(this.initialMobileStartExpanded());
  browserCollapsed = signal(false);
  inspectorCollapsed = signal(false);
  railCollapsed = signal(false);

  // ── View choreography ─────────────────────────────────
  /**
   * Direction of the last main-view change, consumed by CSS as
   * `data-view-dir`. A forward move slides the incoming view in from the right,
   * a backward move from the left, so the chrome never "pops" between tools.
   */
  viewDirection = signal<'forward' | 'backward'>('forward');

  /**
   * The order swipe navigation walks. The first four entries are the bottom
   * dock's own tabs — swipe must agree with the visible tab order or the
   * gesture feels arbitrary — followed by the two "finish the record" stages a
   * producer moves to next. Views outside the rail (session, plugins, …) are
   * entered by their own control and leave the rail at its first entry.
   */
  private readonly viewRail: readonly StudioView[] = [
    'arrangement',
    'drum-machine',
    'piano-roll',
    'vocal-suite',
    'mixer',
    'mastering',
  ];

  /** True while the contextual inspector is available (not a phone). */
  showInspector = computed(() => !this.uiService.isCompactMobile());

  /** Gesture state for canvas swipe navigation — cleared on every touchstart. */
  private swipeOrigin: { x: number; y: number; at: number } | null = null;

  // ── Beginner Mode ─────────────────────────────────────
  /**
   * Cross-app beginner mode — the UIService owns the durable store
   * (profile settings + localStorage mirror) so the Hub's mobile
   * quick-start lanes and other views honor the same choice.
   */
  isBeginnerMode = this.uiService.beginnerMode;

  /**
   * Arrangement's own gate. Beginner mode owns the arrangement slot, so
   * anything that genuinely needs the timeline — a takes & comp step, or the
   * wizard's escape hatch — opens it here for this view only. Flipping the
   * global beginner mode off just to draw a timeline stripped the guided
   * hints from the recorder, drum machine and piano roll at the same time.
   */
  arrangementGateOpen = signal(false);

  /** The real arrangement canvas is shown in Pro mode, or past the gate. */
  showArrangementStage = computed(
    () => !this.isBeginnerMode() || this.arrangementGateOpen(),
  );

  /**
   * The current first-song step stays visible in every tool. The arrangement
   * slot is excluded because the wizard already shows the whole step there.
   */
  showBeginnerStepHint = computed(
    () => this.isBeginnerMode() && this.activeView() !== "arrangement",
  );

  openArrangementGate() {
    this.haptic.light();
    if (!this.arrangementGateOpen()) {
      this.arrangementGateOpen.set(true);
      this.snackbarService.info(
        "FULL ARRANGEMENT OPEN — guided mode is still on in every other view",
      );
    }
  }

  closeArrangementGate() {
    this.haptic.light();
    this.arrangementGateOpen.set(false);
  }

  returnToBeginnerWizard() {
    this.arrangementGateOpen.set(false);
    this.setActiveView("arrangement");
  }

  toggleBeginnerMode() {
    this.haptic.light();
    const next = !this.isBeginnerMode();
    this.uiService.setBeginnerMode(next);
    this.snackbarService.info(
      next
        ? "Beginner Mode ON — simplified controls with tips"
        : "Pro Mode ON — full studio controls",
    );
  }

  /** Navigate to a view from the beginner wizard */
  onWizardNavigate(
    view: string,
    options: { clearGuideQuery?: boolean } = {},
  ) {
    if (!isStudioView(view)) return;
    // The wizard owns the arrangement slot in Beginner Mode, so steps that
    // genuinely need the arrangement canvas (takes & comp, export/share)
    // would loop straight back to the wizard. Hand those off into Pro mode
    // so the real tool renders — LEARN in the topbar returns anytime, and
    // the wizard keeps its progress marks either way.
    if (view === "arrangement" && this.isBeginnerMode()) {
      this.arrangementGateOpen.set(true);
      this.snackbarService.info(
        "FULL ARRANGEMENT OPEN — tap GUIDED START to come back to the steps",
      );
    }
    this.setActiveView(view, options);
  }

  /**
   * Start a beginner sketch from the wizard: either a blank piano-and-drums
   * session or one of the complete idea recipes. Replacing the canvas is
   * guarded by the same snapshot as every other starter, so a previous idea is
   * never silently discarded.
   */
  async onWizardLaunchWithPreset(payload: {
    view: string;
    preset: string;
  }): Promise<void> {
    this.haptic.medium();
    const recipe: IdeaRecipe | undefined =
      payload.preset === "blank"
        ? undefined
        : this.ideasGenerator.recipes.find(
            (entry) => entry.id === payload.preset,
          );
    if (payload.preset !== "blank" && !recipe) return;
    if (!(await this.preserveOpenSketch("beginner_starter"))) return;

    this.audioEngine.resume();
    if (recipe) {
      this.musicManager.applyGeneratedRecipe(recipe);
      this.audioEngine.tempo.set(recipe.bpm);
      this.projectWorkspace.startFreshProject({
        name: recipe.name,
        bpm: recipe.bpm,
        genre: recipe.id,
      });
    } else {
      this.musicManager.newProject();
      this.audioEngine.tempo.set(120);
      this.projectWorkspace.startFreshProject({
        name: "My First Song",
        bpm: 120,
        genre: "pop",
      });
    }

    const view = isStudioView(payload.view) ? payload.view : "drum-machine";
    this.setActiveView(view);
    if (recipe) this.guideAutoCheck.noteAction("starter-loaded");
    this.snackbarService.success(
      recipe
        ? `${recipe.name} · ${recipe.bpm} BPM — every part is yours to change.`
        : "Blank canvas ready — piano and drums, nothing written.",
    );
    this.studioTelemetry.trackEvent(
      "beginner_starter_loaded",
      { preset: payload.preset, view },
      true,
    );
  }

  /**
   * Navigate back to the Hub home page.
   *
   * Every open overlay pushed a synthetic history entry at the Studio URL (see
   * syncBackHistoryTrap). Leaving with those still stacked meant the Hub's own
   * back stack sat on top of `/studio` entries: tapping Home worked, then the
   * first back press on the Hub silently re-entered the Studio. So the entries
   * are unwound first, and the route change runs once that traversal lands.
   * With nothing to unwind (direct link, fresh session) it navigates at once.
   */
  async navigateHome(): Promise<void> {
    this.haptic.light();
    try {
      await this.stopStudioSession();
    } catch {
      // A failed take-save must not trap the artist in a broken view; the
      // engine already owns persistence retries and the pagehide flush.
    }
    this.leaveStudioForHomeNow();
  }

  /**
   * Leaving the Studio ends its audio session: a running transport would
   * otherwise keep playing over the Hub with no transport in sight, and a live
   * take would be cut off without its WAV reaching storage. `stop()` starts the
   * flush, `whenTakeSaved()` resolves once the take is durable — so the route
   * change waits for the audio, not the other way round.
   */
  private async stopStudioSession(): Promise<void> {
    const transportLive = this.audioSession.hasLiveSession();
    const micLive = this.audioRecorder.isRecording();
    if (!transportLive && !micLive) return;
    if (this.audioSession.isRecording() || micLive) {
      this.snackbarService.info("Saving the take before leaving the Studio…");
    }

    const saves: Promise<unknown>[] = [];
    if (transportLive) {
      this.audioSession.stop();
      saves.push(this.audioSession.whenTakeSaved());
    }
    if (micLive) {
      // The Audio Recorder view owns a MediaRecorder outside the transport.
      // Its stop handler encodes and persists the take, then emits.
      saves.push(this.waitForRecorderTake());
      this.audioRecorder.stopRecording();
    }
    if (!saves.length) return;

    // Never hang the route change on a wedged write. Persistence is owned by
    // root services, so a save that outlives the wait still completes — the
    // artist just learns it is continuing in the background.
    const timedOut = await this.awaitWithDeadline(
      Promise.all(saves),
      this.SAVE_WAIT_MS,
    );
    if (timedOut) {
      this.snackbarService.info(
        "The take is still saving — it finishes in the background.",
      );
    }
  }

  /** How long the Studio holds the exit for a take before giving up on it. */
  private readonly SAVE_WAIT_MS = 6000;

  /** True when the deadline won. The timer is always cleared, won or lost. */
  private async awaitWithDeadline(
    promise: Promise<unknown>,
    ms: number,
  ): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promise.then(() => false),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(true), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Resolves when the mic recorder's take has been persisted (or failed). */
  private waitForRecorderTake(): Promise<unknown> {
    const finished = this.audioRecorder.recordingFinished$;
    if (!finished || typeof finished.subscribe !== "function") {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const sub = finished.subscribe({
        next: () => {
          sub.unsubscribe();
          resolve(null);
        },
        error: () => resolve(null),
      });
    });
  }

  /** Unwind overlay history, then leave. Never blocks on audio. */
  private leaveStudioForHomeNow(): void {
    const depth = this.backTrapDepth;
    const hasSyntheticEntries =
      typeof window !== "undefined" &&
      !!window.history &&
      depth > 0 &&
      !!window.history.state?.smuveStudioOverlay;

    if (!hasSyntheticEntries) {
      this.leaveStudioForHome();
      return;
    }

    this.leavingStudioForHome = true;
    // This traversal is our own cleanup, not a user back press.
    this.pendingOverlayHistoryPops++;
    window.history.go(-depth);
    // A WebView that reports no traversal (entries dropped after a restore)
    // would otherwise swallow the tap entirely — leave anyway.
    this.homeExitTimer = setTimeout(() => {
      if (!this.leavingStudioForHome) return;
      this.leavingStudioForHome = false;
      this.pendingOverlayHistoryPops = 0;
      this.leaveStudioForHome();
    }, 200);
  }

  /** The part of leaving the Studio that must happen exactly once. */
  private leaveStudioForHome(): void {
    this.backTrapDepth = 0;
    void this.router.navigate(["/hub"]);
  }

  /**
   * 3-way theme model — replaces the old binary isDarkMode.
   * Persisted in localStorage; applied via <body> class.
   */
  themeMode = signal<AppTheme>("light");
  readonly themeModes = ["light", "focus", "dark"] as const;
  /**
   * Stage FX ambience — aurora field, marquee, sheens & pulse animations.
   * Defaults ON. Persisted in localStorage; OFF adds `stage-fx-off` to
   * <body> so every Studio view (including child components) can drop
   * decorative motion on low-end Android devices / battery saver.
   *
   * Adaptive defaults:
   *  - an explicit stored choice always wins;
   *  - otherwise users who prefer reduced motion start with FX OFF;
   *  - the low-end engine tier ('performance') auto-disables ambience
   *    until the user makes an explicit choice (never auto-enables).
   */
  stageFxEnabled = signal<boolean>(this.initialStageFxEnabled());
  /** True once a stored choice or the user has made FX explicit. */
  stageFxUserTouched = this.hasLocalStorageKey(STAGE_FX_STORAGE_KEY);

  /** Read browser storage without making Studio construction fail in SSR/WebViews. */
  private hasLocalStorageKey(key: string, expectedValue?: string): boolean {
    try {
      if (typeof localStorage === "undefined") return false;
      const value = localStorage.getItem(key);
      return (
        value !== null &&
        (expectedValue === undefined || value === expectedValue)
      );
    } catch {
      return false;
    }
  }

  /** Compute the first-load Stage FX state (storage → motion pref → on). */
  private initialStageFxEnabled(): boolean {
    try {
      if (typeof localStorage !== "undefined") {
        const stored = localStorage.getItem(STAGE_FX_STORAGE_KEY);
        if (stored !== null) return stored !== "off";
      }
      if (
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        return false;
      }
    } catch {
      /* storage / matchMedia unavailable — fall through to enabled */
    }
    return true;
  }
  /** Next theme icon shown on the cycle button (affordance). */
  nextThemeIcon = computed(() => NEXT_THEME_ICON[this.themeMode()]);
  /** Current theme label — exposed for the tobtap chip. */
  currentThemeLabel = computed(() => THEME_LABEL[this.themeMode()]);

  /** Live AudioContext state — drives the 'ARM AUDIO' pip. */
  audioContextState = this.audioEngine.contextState;
  /** Defaults to false until the user has interacted. */
  userGestureSeen = this.audioEngine.userGestureSeen;
  /** True when the tobtap should show the ARM AUDIO pip. */
  showArmAudioPip = computed(
    () => this.audioContextState() === "suspended" && !this.userGestureSeen(),
  );
  /**
   * True when the user has armed audio AND the transport is rolling.
   * Drives the green NOW PLAYING pip that replaces the ARM pip while
   * the engine is actually producing sound. Uses Option C: the ARM pip
   * Hides only when a) AudioContext is running, b) a user gesture has
   * been registered, and c) the transport is actively playing.
   */
  isLivePerforming = computed(() => {
    const api = this.audioEngine;
    const playing =
      typeof api.isPlaying === "function" ? api.isPlaying() : false;
    return playing && !this.showArmAudioPip();
  });

  browserWidth = signal(260);
  inspectorWidth = signal(300);

  studioQualityClass = computed(() => {
    return this.audioEngine.performanceTier() === "ultra"
      ? "studio-ultra"
      : "studio-perf";
  });

  currentBar = computed(
    () => Math.floor(this.audioEngine.visualStep() / 16) + 1,
  );

  /**
   * Mobile bottom nav — 4 workflow anchors + central CREATE pill + More.
   * Benchmarked against BandLab / FL Studio Mobile: a crowded 8-slot bar
   * turns into mis-taps on a 360px phone, so Mixer lives in the MORE
   * drawer (Mix & Polish grid) instead of a primary anchor.
   */
  /**
   * FL Studio Mobile panel bar — the four musical panels a mobile producer
   * moves between, named the way FL names them (Playlist / steps / Piano
   * Roll / vocal page). CREATE and MORE stay on either side of the dock;
   * the full 22-stage list lives in the rail (desktop) and drawer (touch).
   */
  bottomNavItems = computed(() => [
    { id: "arrangement", label: "Song", icon: "view_quilt" },
    { id: "drum-machine", label: "Steps", icon: "grid_on" },
    { id: "piano-roll", label: "Keys", icon: "piano" },
    { id: "vocal-suite", label: "Vocals", icon: "mic" },
  ] as const);

  /**
   * Logical workflow domains for Google Play inspired DAW layout.
   * Replaces the flat 22-item list with 4 clear stages.
   */
  studioWorkflowCategories = computed(() =>
    STUDIO_SURFACE_GROUPS.filter((group) => group.id !== "more"),
  );

  /** Active category derived from the active view */
  activeCategory = computed(() => {
    const view = this.activeView();
    for (const cat of this.studioWorkflowCategories()) {
      if (cat.views.some((v) => v.id === view)) return cat.id;
    }
    return "arrange";
  });

  /** Open or toggle the Smart Creation assistant */
  toggleSmartCreation(open?: boolean): void {
    this.haptic.light();
    this.showSmartCreationSheet.update((curr) =>
      open !== undefined ? open : !curr,
    );
    if (this.showSmartCreationSheet()) {
      this.studioTelemetry.trackEvent("smart_creation_opened", {}, true);
    }
  }

  /** Music Map — the rail's one-tap mental-model sheet. */
  openArchitectureMap(options: { auto?: boolean; hapticOnOpen?: boolean } = {}) {
    if (this.showArchitectureMap()) return;
    this.showArchitectureMap.set(true);
    if (options.hapticOnOpen !== false) this.haptic.light();
    this.studioTelemetry.trackEvent("music_map_opened", { auto: !!options.auto }, true);
  }

  closeArchitectureMap() {
    if (!this.showArchitectureMap()) return;
    this.showArchitectureMap.set(false);
    // Any dismiss ends the story: the seen marker was already written when
    // the auto-open fired, so a closed map never auto-opens again.
  }

  /** The map's CTA: hop onto the direct beat path and keep the telemetry trail. */
  musicMapQuickSession() {
    this.showArchitectureMap.set(false);
    this.studioTelemetry.trackEvent("music_map_quick_session", {}, true);
    this.setActiveView("quick-session");
  }

  /** Open the Masterclass on the lesson for the surface in front of the artist. */
  teachCurrentStudioScreen(): void {
    const target = masterclassTargetForStudioSurface(this.activeView());
    if (target) {
      this.openStudioGuide({ track: target.track, lessonId: target.lessonId });
      return;
    }
    this.openStudioGuide();
  }

  /** Studio Masterclass — the complete guided path plus surface atlas. */
  openStudioGuide(
    options: {
      tab?: GuideTab;
      track?: GuideTrackId;
      lessonId?: string | null;
    } = {},
  ): void {
    this.guideAutoCheck.dismissCelebration();
    const requestedLesson = guideLessonById(options.lessonId ?? null);
    const track =
      requestedLesson?.track ??
      options.track ??
      this.guideTrackRequest() ??
      "first-loop";
    this.guideTabRequest.set(options.tab ?? "learn");
    this.guideTrackRequest.set(track);
    this.guideLessonRequest.set(requestedLesson?.id ?? null);

    if (!this.showStudioGuide()) {
      this.showStudioGuide.set(true);
      this.haptic.light();
      this.studioTelemetry.trackEvent("studio_guide_opened", {}, true);
    }
    this.guideAutoCheck.noteActiveView(this.activeView());
    this.writeGuideQueryParams();
  }

  closeStudioGuide(): void {
    if (!this.showStudioGuide()) return;
    this.showStudioGuide.set(false);
    this.guideTabRequest.set(null);
    this.guideTrackRequest.set(null);
    this.guideLessonRequest.set(null);
    this.writeGuideQueryParams();
  }

  /** The Beginner Wizard's direct line into the full Masterclass. */
  openGuideFromWizard(): void {
    this.openStudioGuide({ track: "first-loop" });
  }

  /** The Music Map's hand-off: close the map, open the deeper tutorial. */
  openGuideFromMusicMap(): void {
    this.showArchitectureMap.set(false);
    this.studioTelemetry.trackEvent("music_map_guide", {}, true);
    this.openStudioGuide();
  }

  /** Keep the URL shareable while the artist moves inside the Masterclass. */
  onGuideStateChange(state: GuideStateChange): void {
    this.guideTabRequest.set(state.tab);
    this.guideTrackRequest.set(state.track);
    this.guideLessonRequest.set(state.lessonId);
    this.writeGuideQueryParams();
  }

  /** Hand the current lesson to the standalone Masterclass workspace. */
  openStandaloneGuide(state: GuideStateChange): void {
    this.dismissGuideForNavigation();
    void this.router.navigate(["/masterclass"], {
      queryParams: guideDeepLinkParams(state.tab, state.track, state.lessonId),
    });
  }

  /** A whole-application lesson leaves the Studio for its real workspace. */
  onGuideOpenWorkspace(path: string): void {
    this.dismissGuideForNavigation();
    void this.router.navigate([path]);
  }

  /** An Academy program pick leaves the Studio for that Academy program. */
  onGuideOpenAcademyProgram(programId: string): void {
    this.dismissGuideForNavigation();
    void this.router.navigate(['/academy'], {
      queryParams: { program: programId },
    });
  }

  /**
   * Hide the overlay without writing a competing /studio URL. The navigation
   * that follows is the destination; the guide's query has no meaning there.
   */
  private dismissGuideForNavigation(): void {
    this.showStudioGuide.set(false);
    this.guideTabRequest.set(null);
    this.guideTrackRequest.set(null);
    this.guideLessonRequest.set(null);
  }

  /** The guide's "open the real tool" hand-off; the shell owns navigation. */
  onGuideOpenSurface(view: StudioSurfaceId): void {
    this.closeStudioGuide();
    this.onWizardNavigate(view, { clearGuideQuery: true });
  }

  /** The guide's starter-groove hand-off; the shell owns the snapshot guard. */
  onGuideStartRecipe(recipeId: string): void {
    this.closeStudioGuide();
    void this.quickStartRecipe(recipeId, { clearGuideQuery: true });
  }

  /** The celebration's next-lesson hand-off. */
  openGuideFromCompletion(completion: GuideLessonCompletion): void {
    this.guideAutoCheck.dismissCelebration();
    this.openStudioGuide({
      track: completion.trackId,
      lessonId: completion.nextLessonId ?? completion.lessonId,
    });
  }

  /** Export surface reports a real file delivery; only audio ticks the lesson. */
  onExportDelivered(kind: string): void {
    if (kind === "mixdown" || kind === "share" || kind === "stems") {
      this.guideAutoCheck.noteAction("audio-exported");
    }
  }

  /**
   * Mirror the open guide into the URL with replaceUrl: moving between
   * lessons should update a shareable link, not bury the back button.
   */
  private writeGuideQueryParams(): void {
    const open = this.showStudioGuide();
    const params = open
      ? guideDeepLinkParams(
          this.guideTabRequest() ?? "learn",
          this.guideTrackRequest() ?? "first-loop",
          this.guideLessonRequest(),
        )
      : { guide: null, lesson: null };
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }

  /**
   * Apply ?guide= and ?lesson=. A missing guide param never opens the overlay;
   * an explicit but invalid one closes it rather than showing stale content.
   */
  private applyGuideQuery(
    guide: string | null,
    lesson: string | null,
  ): void {
    const state = parseGuideDeepLink(guide, lesson);
    if (!state) {
      if (guide) {
        this.showStudioGuide.set(false);
        this.guideTabRequest.set(null);
        this.guideTrackRequest.set(null);
        this.guideLessonRequest.set(null);
      }
      return;
    }

    this.guideTabRequest.set(state.tab);
    this.guideTrackRequest.set(state.track);
    this.guideLessonRequest.set(state.lessonId);
    if (!this.showStudioGuide()) {
      this.showStudioGuide.set(true);
      this.guideAutoCheck.dismissCelebration();
      this.studioTelemetry.trackEvent(
        "studio_guide_opened",
        { source: "link" },
        true,
      );
    }
    this.guideAutoCheck.noteActiveView(this.activeView());
  }

  /** Restore the quick-start lane choice (stored → collapsed). */
  private initialMobileStartExpanded(): boolean {
    return this.hasLocalStorageKey(MOBILE_START_STORAGE_KEY, "open");
  }

  /** Open or close the quick-start lane's secondary content (vibe rail, next). */
  toggleMobileStart(): void {
    this.haptic.light();
    this.mobileStartExpanded.update((open) => !open);
    this.persistMobileStart();
  }

  /** Mirror the lane choice to storage; a blocked store keeps the in-memory value. */
  private persistMobileStart(): void {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(
        MOBILE_START_STORAGE_KEY,
        this.mobileStartExpanded() ? "open" : "closed",
      );
    } catch {
      /* private mode / WebView — the choice still applies for this session */
    }
  }

  /** Quick helper to jump straight into vocal booth via smart sheet */
  setCreationTabVocals(): void {
    this.toggleSmartCreation(true);
  }

  /**
   * Every studio view — rendered in the mobile side drawer.
   * Desktop side rail uses the same list (scrollable on narrow screens);
   * entries flagged `hidden` (e.g. performer on desktop) are dropped from
   * the rail but stay reachable via the URL (?view=...) and mobile shell.
   */
  allStudioViews = computed(() =>
    STUDIO_SURFACES.map((surface) => ({
      ...surface,
      // The Performer is URL-reaching and lives in the mobile shell only.
      hidden:
        surface.id === "performer" ? !this.uiService.showMobileNav() : false,
    })),
  );

  /**
   * Desktop rail grouped by workflow stage (Create → Build → Mix → Sounds).
   * The previous flat 22-item list overflowed a non-scrolling rail, so on a
   * 900px display everything below the fold was clipped and unreachable.
   * Grouping + a scroll area keeps every view reachable and mirrors the
   * mobile drawer's four-stage mental model.
   */
  railGroups = computed(
    (): {
      id: string;
      label: string;
      icon: string;
      views: { id: StudioView; label: string; icon: string }[];
    }[] => {
      const groups = this.studioWorkflowCategories().map((category) => ({
        id: category.id,
        label: category.label,
        icon: category.icon,
        views: category.views.map((view) => ({
          id: view.id,
          label: view.label,
          icon: view.icon,
        })),
      }));
      const grouped = new Set<string>(
        groups.flatMap((group) => group.views.map((view) => view.id)),
      );
      const remaining = this.allStudioViews()
        .filter((view) => !grouped.has(view.id) && !view.hidden)
        .map((view) => ({
          id: view.id as StudioView,
          label: view.label,
          icon: view.icon,
        }));
      if (remaining.length) {
        groups.push({
          id: 'more',
          label: 'More Tools',
          icon: 'widgets',
          views: remaining,
        });
      }
      return groups.filter((group) => group.views.length > 0);
    },
  );

  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // Routine action feedback is buffered in the Activity panel, not painted
    // over the workspace. Errors and warnings still toast (SnackbarService).
    this.snackbarService.setStudioQuiet(true);
    this.destroyRef.onDestroy(() => this.snackbarService.setStudioQuiet(false));

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const view = params.get("view");
      const surface = view ? studioViewForParam(view) : null;
      if (surface) this.activeView.set(surface);
      this.applyGuideQuery(params.get("guide"), params.get("lesson"));
    });

    effect(() => {
      this.orchestration.setActiveStudioView(this.activeView());
    });

    // ── Back-navigation trap ──
    // Reads every dismissible surface so the history depth always matches the
    // number of open overlays (see syncBackHistoryTrap). History-only side
    // effect — no signal writes, so no effect-loop hazard.
    effect(() => {
      const openCount = [
        this.showStudioGuide(),
        this.showSmartCreationSheet(),
        this.showShortcuts(),
        this.showProjectMenu(),
        this.showAiAssistant(),
        this.showAiMixAssistant(),
        this.showSmartRecordingPanel(),
        this.showProjectMetadata(),
        this.showStudioInsights(),
        this.showActivityLog(),
        this.showSetsBrowser(),
        this.showComponentRecording(),
        this.showImportPanel(),
        this.showVocalComp(),
        this.showBezierEditor(),
        this.mobileDrawerOpen(),
        this.showMobileToolsSheet(),
      ].filter(Boolean).length;
      untracked(() => this.syncBackHistoryTrap(openCount));
    });

    // Restore 3-way theme preference from localStorage; fall back to the
    // cross-app profile theme (UIService) when no Studio-specific choice
    // was ever made, so Studio and Hub stay in agreement on first visit.
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) as AppTheme | null;
      if (stored && (THEME_ORDER as string[]).includes(stored)) {
        this.themeMode.set(stored);
        document.body.classList.add(stored + "-mode");
      } else {
        const profileTheme = this.uiService.activeTheme().name;
        const mapped: AppTheme = profileTheme === "Light" ? "light" : "dark";
        this.themeMode.set(mapped);
      }
    } catch {
      // localStorage / profile unavailable — keep default
    }

    // ── Theme effect — sync body class for all 3 modes ──
    effect(() => {
      const theme = this.themeMode();
      try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch {
        /* ignore */
      }
      document.body.classList.remove("light-mode", "focus-mode", "dark-mode");
      document.body.classList.add(theme + "-mode");
    });

    // ── Stage FX effect — sync body class so every view honors the toggle ──
    effect(() => {
      document.body.classList.toggle("stage-fx-off", !this.stageFxEnabled());
    });

    // ── Dynamic atmospheric lighting — the aurora field follows the audio.
    // The service taps the engine's master analyser (one smoothed 0..1 frame
    // per ~33 ms) and publishes it as --atmo-* on the shell, so the visual
    // never touches per-element styles and never runs unless the transport is
    // actually rolling. Every access is guarded: `performance`-tier devices
    // keep Stage FX off, reduced-motion users settle to the authored look, and
    // unit-test engine doubles that lack `masterAnalyser` degrade silently. ──
    effect(() => {
      const wanted = this.isLivePerforming() && this.stageFxEnabled();
      try {
        this.atmosphere.setStyleTarget(this.shellRoot?.nativeElement ?? null);
        this.atmosphere.bind(
          (this.audioEngine as { masterAnalyser?: AnalyserNode | null })
            ?.masterAnalyser ?? null,
        );
        this.atmosphere.setActive(wanted);
      } catch {
        // guard against test environment mocks
      }
    });

    // ── Stage FX live-sync — the executive preference is the single source
    // of truth. When it changes anywhere (Settings → Studio Pro, the tier
    // guard, a cloud sync / profile restore) while the Studio stays mounted,
    // the topbar FX button follows immediately instead of going stale.
    // Writes only on divergence, so there is no feedback loop with
    // toggleStageFx (which writes back the same value). ──
    effect(() => {
      try {
        const pref =
          this.userProfile.profile()?.settings?.studio?.stageFxEnabled;
        if (pref !== undefined && pref !== this.stageFxEnabled()) {
          this.stageFxEnabled.set(pref);
        }
      } catch {
        // guard against test environment mocks
      }
    });

    // ── Stage FX tier guard — the 'performance' (low-end) engine tier
    // disables ambience until the user makes an explicit choice. Never
    // auto-enables; manual toggles always win. API access is guarded so
    // test mocks that lack `performanceTier` degrade silently (same
    // convention as the punch-recording effect below). The snackbar
    // explains WHY the ambience vanished — the service creates its own
    // component on demand, so this is safe from a constructor effect. ──
    effect(() => {
      try {
        const tier =
          typeof this.audioEngine.performanceTier === "function"
            ? this.audioEngine.performanceTier()
            : "ultra";
        if (
          tier === "performance" &&
          !this.stageFxUserTouched &&
          this.stageFxEnabled()
        ) {
          this.stageFxEnabled.set(false);
          this.stageFxUserTouched = true;
          // Persist the adaptive choice so the live-sync effect (which reads
          // the profile) stays consistent instead of re-enabling ambience.
          this.persistStageFxState(false);
          this.snackbarService.info(
            "Stage FX OFF · adaptive low-power mode — tap FX to re-enable",
          );
        }
      } catch {
        // guard against test environment mocks
      }
    });

    // ── Audio arming: install one-time pointerdown/keydown listener ──
    // Runs at studio start. On the user's first gesture anywhere, the
    // AudioContext is resumed. Idempotent — safe to call repeatedly.
    this.audioEngine.armOnFirstUserGesture();

    // ── Punch recording bar tracking ──
    effect(() => {
      const bar = this.currentBar();
      try {
        const playing =
          typeof this.audioEngine.isPlaying === "function"
            ? this.audioEngine.isPlaying()
            : false;
        if (playing) {
          this.smartRecording.onBarTick(bar);
        }
      } catch {
        // guard against test environment mocks
      }
    });

    // ── Cross-link router ──
    effect(() => {
      const req = this.musicManager.crossLinkRequest();
      if (!req || req.timestamp <= this.lastConsumedCrossLinkTimestamp) return;
      this.lastConsumedCrossLinkTimestamp = req.timestamp;
      untracked(() => {
        const trackName =
          this.musicManager.tracks().find((t) => t.id === req.trackId)?.name ||
          "selected track";
        if (this.activeView() !== req.view) {
          this.setActiveView(req.view);
        }
        if (
          this.musicManager.selectedTrackId() !== req.trackId &&
          req.trackId
        ) {
          this.musicManager.selectedTrackId.set(req.trackId);
        }
        this.crossLinkAnnouncement.set(
          `Opened Piano Roll for ${req.label || trackName}. The related notes are highlighted.`,
        );
        setTimeout(() => this.crossLinkAnnouncement.set(""), 4500);
      });
    });
  }

  async ngOnInit() {
    this.studioTelemetry.beginSession({ entryView: this.activeView() });
    // Back navigation: the browser/WebView history handler is always live
    // (desktop back button, Alt+Left, and Android WebView history-back); the
    // native Android back gesture is bridged separately when on device.
    window.addEventListener("popstate", this.onStudioPopState);
    void this.registerNativeBackButton();
    try {
      // Try to resume immediately (works on first server-side render or
      // if browser is already primed). Failure here is harmless —
      // the pointerdown listener installed in the constructor will
      // take over the moment the user interacts.
      this.audioEngine.resume();
    } catch {
      // silent — fallback handled by armOnFirstUserGesture()
    }

    const restored = await this.projectWorkspace.restoreLatestProjectState();
    // Existing work opens where it was finished: the arrangement. Only a fresh,
    // empty session keeps the Quick Session landing.
    const landing = landingStudioView({
      hasExplicitView: !!this.route.snapshot.queryParamMap.get("view"),
      restored,
    });
    if (landing) this.activeView.set(landing);

    // One-shot Music Map: greet a brand-new artist's first visit with the
    // mental model before the rail can feel like confusion. The marker is
    // written when the auto-open fires, so even an instant dismiss caps it.
    const tourParam = this.route.snapshot.queryParamMap.get("tour");
    if (
      shouldAutoOpenMusicMap({
        restored,
        hasExplicitView: !!this.route.snapshot.queryParamMap.get("view"),
        guidedTour: tourParam === "1" || tourParam === "true",
        seenBefore: readMusicMapSeen(),
      })
    ) {
      markMusicMapSeen();
      this.openArchitectureMap({ auto: true, hapticOnOpen: false });
    }
    if (restored) {
      const source = this.projectWorkspace.lastRecoveredSource();
      this.snackbarService.info(
        `Restored ${this.formatPersistenceSource(source)} snapshot` +
          this.restoredMonitorSuffix(),
      );
      this.studioTelemetry.trackEvent(
        "project_recovered",
        { source: source ?? "unknown" },
        true,
      );
    }

    // ── Seed an empty studio with a starter recipe ──
    // If the user opens Studio fresh and tracks() is empty, we apply
    // a curated 4-bar starter so the FIRST Play click produces audio.
    if (!restored && this.musicManager.tracks().length === 0) {
      const ideas = this.ideasGenerator;
      const first = ideas.recipes?.[0];
      if (first) {
        this.musicManager.applyGeneratedRecipe(first);
        this.studioTelemetry.trackEvent(
          "starter_recipe_seeded",
          { source: "ideas_generator" },
          true,
        );
      } else {
        // Fallback — newProject auto-populates piano + drums.
        this.musicManager.newProject(false);
        this.studioTelemetry.trackEvent(
          "starter_recipe_seeded",
          { source: "new_project_fallback" },
          true,
        );
      }
    }

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const sessionId = params.get("sessionId");
      if (sessionId && !this.collaboration.currentSession()) {
        const user = this.authService.currentUser();
        if (user) {
          this.collaboration.joinSession(sessionId, user);
          this.studioTelemetry.trackEvent("collab_joined", { sessionId }, true);
          const projectHint = params.get("project");
          this.snackbarService.info(
            projectHint
              ? `JOINING SESSION: ${projectHint}`
              : "JOINING COLLABORATION SESSION",
          );
        }
      }
    });
    void this.logger;

    // ── Sprint B2 Phase 2 — surface collaboration conflicts as a snackbar ──
    // Track each new conflict and pass it to the global snackbar so the
    // user knows to keep-mine / use-theirs / discard. Uses `untracked`
    // because we only want to react on length changes.
    let lastConflictCount = this.collaboration.pendingConflicts().length;
    // effect() must be created in an injection context; ngOnInit is not
    // guaranteed one (NG0203 in tests), so create it inside the injector.
    runInInjectionContext(this.injector, () => {
      effect(() => {
        const conflicts = this.collaboration.pendingConflicts();
        if (conflicts.length > lastConflictCount) {
          const fresh = conflicts[conflicts.length - 1];
          untracked(() => {
            const source = fresh.remoteUserName ?? fresh.remoteUserId.slice(-4);
            this.snackbarService.info(
              `CONFLICT ON ${fresh.fieldKey.toUpperCase()} · ${source} edited the same field`,
            );
          });
        }
        lastConflictCount = conflicts.length;
      });
    });
  }

  // ── Sprint B2 Phase 2 — presence + peer cursor surface ─────────────────
  /** Flatten the peer-cursors map for the @for template. */
  peerCursorList = computed(() =>
    Object.values(this.collaboration.peerCursors()).filter(
      (c) => c.surface === "studio",
    ),
  );

  /** A peer is "talking" when their voicePeers state is `connected` / `muted`
   *  OR (cheap proxy) when the local peerNet is mid-call with them. */
  isPeerTalking(userId: string): boolean {
    const peer = this.collaboration.voicePeers()[userId];
    if (!peer) return false;
    return peer.state === "connected" || peer.state === "muted";
  }

  /** Throttled-by-service mousemove handler — publishes normalized {x,y}. */
  @HostListener("mousemove", ["$event"])
  onStudioMouseMove(event: MouseEvent): void {
    const host = (event.currentTarget as HTMLElement) ?? null;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    this.collaboration.publishCursor("studio", x, y);
  }

  ngAfterViewInit() {
    this.activeView();
    // The shell root is only resolvable once the view exists, and the
    // atmosphere effect can legitimately run before that.
    try {
      this.atmosphere.setStyleTarget(this.shellRoot?.nativeElement ?? null);
    } catch {
      // guard against test environment mocks
    }
  }

  ngOnDestroy() {
    this.atmosphere.stop();
    this.atmosphere.setStyleTarget(null);
    this.stopSpectrumAnalyzer();
    this.stopCompTakePreview();
    window.removeEventListener("popstate", this.onStudioPopState);
    this.backButtonHandle?.remove();
    this.backButtonHandle = null;
    if (this.homeExitTimer) {
      clearTimeout(this.homeExitTimer);
      this.homeExitTimer = null;
    }
    this.leavingStudioForHome = false;
    this.backTrapDepth = 0;
    // Any other way out of the Studio (a rail cross-link, a child view's
    // "open in …") must not leave the transport playing behind the next route.
    if (this.audioSession.hasLiveSession()) this.audioSession.stop();
    // A standalone mic pass survives transport changes; stop it here too or
    // the microphone stays hot behind the Hub.
    if (this.audioRecorder.isRecording()) this.audioRecorder.stopRecording();
    this.studioTelemetry.endSession("component_destroy");
  }

  // ═══════════════════════════════════════════════════════════
  // BACK NAVIGATION (Android system back / browser back)
  //
  // Professional mobile apps treat back as "dismiss what is on top",
  // never "quit with unsaved work on screen". Android's default for a
  // WebView activity with no back listener is to finish() immediately, so
  // an open drawer, panel or assistant would take the whole session down.
  //
  // Two layers cooperate here:
  //   1. A synthetic history entry per open overlay, so the WebView's own
  //      history-back (and desktop browser back) unwinds surfaces one press
  //      at a time.
  //   2. The native `backButton` event (Capacitor App plugin), which mirrors
  //      `dismissTopOverlay()` and only leaves the app on a confirmed
  //      double-press.
  // ═══════════════════════════════════════════════════════════

  /** True when any dismissible surface is open. Mirrors dismissTopOverlay(). */
  hasOpenOverlay(): boolean {
    return !!(
      this.showStudioGuide() ||
      this.showSmartCreationSheet() ||
      this.showShortcuts() ||
      this.showProjectMenu() ||
      this.showAiAssistant() ||
      this.showAiMixAssistant() ||
      this.showSmartRecordingPanel() ||
      this.showProjectMetadata() ||
      this.showStudioInsights() ||
      this.showComponentRecording() ||
      this.showImportPanel() ||
      this.showVocalComp() ||
      this.showBezierEditor() ||
      this.mobileDrawerOpen() ||
      this.showMobileToolsSheet()
    );
  }

  /**
   * Keep the synthetic history depth in step with the open-overlay count so
   * the system back gesture unwinds exactly one surface per press. Runs from
   * an effect, so it is a pure history side effect (no signal writes).
   */
  private syncBackHistoryTrap(openCount: number): void {
    // `window.history` deliberately qualified: the class field `this.history`
    // is the project undo/redo service, and the similar names invite mistakes.
    if (typeof window === "undefined" || !window.history) return;
    const native = window.history;
    if (openCount > this.backTrapDepth) {
      const add = openCount - this.backTrapDepth;
      for (let i = 0; i < add; i++) {
        native.pushState(
          { ...(native.state ?? {}), smuveStudioOverlay: true },
          "",
        );
      }
      this.backTrapDepth = openCount;
    } else if (openCount < this.backTrapDepth) {
      // A surface was closed by its own control (the X button, a menu pick).
      // Pop our synthetic entries so the user's next back press is not eaten
      // by an entry that no longer represents anything on screen.
      const drop = this.backTrapDepth - openCount;
      this.backTrapDepth = openCount;
      if (native.state && native.state.smuveStudioOverlay) {
        // One traversal removes the closed entries. Its asynchronous popstate
        // is cleanup, not a user Back press against a newly opened panel.
        this.pendingOverlayHistoryPops++;
        native.go(-drop);
      }
    }
  }

  /** Browser/WebView history back: unwind one surface, else let the router act. */
  private readonly onStudioPopState = () => {
    if (this.leavingStudioForHome) {
      this.leavingStudioForHome = false;
      this.pendingOverlayHistoryPops = 0;
      if (this.homeExitTimer) clearTimeout(this.homeExitTimer);
      this.homeExitTimer = null;
      this.leaveStudioForHome();
      return;
    }
    if (this.pendingOverlayHistoryPops > 0) {
      this.pendingOverlayHistoryPops--;
      return;
    }
    if (this.backTrapDepth > 0) this.backTrapDepth--;
    if (!this.hasOpenOverlay()) {
      // Nothing of ours to close — the browser/router owns this press.
      this.backTrapDepth = 0;
      return;
    }
    this.dismissTopOverlay();
    // Re-arm for the surfaces that are still open (dismissed state lands in
    // the next tick via signals, so read the *remaining* count defensively).
    this.backTrapDepth = Math.max(0, this.backTrapDepth);
  };

  /**
   * Native Android back gesture/button. Registered only on device (the web
   * build relies on history + the router) from ngOnInit.
   */
  private async registerNativeBackButton(): Promise<void> {
    if (this.backButtonHandle) return;
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      const { App } = await import("@capacitor/app");
      this.backButtonHandle = await App.addListener(
        "backButton",
        async ({ canGoBack }) => {
          if (this.dismissTopOverlay()) {
            this.exitArmedAt = 0;
            return;
          }
          if (canGoBack) {
            window.history.back();
            return;
          }
          // Second act confirms the exit — the pattern Android users expect
          // from a production app, instead of dropping a live session on one
          // stray swipe.
          const now = Date.now();
          if (now - this.exitArmedAt < 2500) {
            // Unsaved-work guard: a dirty project must never vanish on a
            // confirmed exit without one explicit confirmation — the same
            // protection FL Studio Mobile and BandLab give a live session.
            if (await this.confirmDirtyExit()) void App.exitApp();
            return;
          }
          this.exitArmedAt = now;
          this.snackbarService.info(
            this.projectWorkspace.isDirty()
              ? "Unsaved changes · press back again to leave the Studio"
              : "Press back again to leave the Studio",
          );
        },
      );
    } catch (e) {
      // Web build, plugin absent, or a native bridge error — the history
      // trap and the Escape key still cover dismissal.
      this.logger.warn("[Studio] native back listener unavailable", e);
    }
  }

  /**
   * Unsaved-work guard for the confirmed Android exit: when the project has
   * unsaved changes, ask once whether to save before leaving. Returns after
   * any prompt resolution so the caller can proceed to App.exitApp().
   */
  private async confirmDirtyExit(): Promise<boolean> {
    if (!this.projectWorkspace.isDirty()) return true;
    const save = await this.dialog.confirm({
      title: "Unsaved changes",
      message:
        "This session has unsaved changes. Save before leaving the Studio?",
      confirmLabel: "Save & Exit",
      cancelLabel: "Discard",
    });
    this.exitArmedAt = 0;
    if (!save) return true;
    // Save & Exit must never discard work when local persistence failed.
    return (await this.saveProject()) && !this.projectWorkspace.isDirty();
  }

  // ── Theme cycle: Light → Focus → Dark → Light ─────────────────
  cycleTheme() {
    this.haptic.light();
    this.themeMode.update((current) => {
      const idx = THEME_ORDER.indexOf(current);
      const nextIdx = (idx + 1) % THEME_ORDER.length;
      const next = THEME_ORDER[nextIdx];
      this.snackbarService.info(`Theme · ${THEME_LABEL[next]} mode`);
      // Keep the app-wide theme in sync so the Hub shell follows the
      // Studio: light/focus → Light, dark → Dark (profile-backed).
      this.uiService.setTheme(next === "dark" ? "Dark" : "Light");
      return next;
    });
  }

  /**
   * Backwards-compat alias so existing template bindings still work.
   * @deprecated use cycleTheme() instead
   */
  toggleDarkMode() {
    this.cycleTheme();
  }

  // ── Stage FX ambience toggle ────────────────────────────────
  /** Flip the Stage FX ambience (aurora / marquee / sheens / pulses). */
  toggleStageFx() {
    this.haptic.light();
    // A manual tap ends adaptive behavior — the user's choice wins.
    this.stageFxUserTouched = true;
    const next = !this.stageFxEnabled();
    this.stageFxEnabled.set(next);
    this.persistStageFxState(next);
    this.snackbarService.info(
      next
        ? "Stage FX ON — full ambient lighting"
        : "Stage FX OFF — calm mode · saving battery & CPU",
    );
  }

  /**
   * Persist the FX state to both working stores: localStorage (the Studio
   * shell's immediate store) and the executive profile (Settings → Studio
   * Pro). The integration service applies it globally from the profile.
   */
  private persistStageFxState(enabled: boolean): void {
    try {
      localStorage.setItem(STAGE_FX_STORAGE_KEY, enabled ? "on" : "off");
    } catch {
      /* private mode / locked storage — degrade silently */
    }
    this.syncStageFxToProfile(enabled);
  }

  /** Persist the current FX choice into profile.settings.studio.stageFxEnabled. */
  private syncStageFxToProfile(enabled: boolean): void {
    try {
      const profile = this.userProfile.profile();
      const settings = profile?.settings as
        | { studio?: { stageFxEnabled?: boolean } }
        | undefined;
      if (!settings) return;
      // updateProfile sets the profile signal synchronously (live-sync
      // observes it immediately) and swallows DB errors internally —
      // intentional fire-and-forget.
      void this.userProfile.updateProfile({
        settings: {
          ...settings,
          studio: { ...(settings.studio ?? {}), stageFxEnabled: enabled },
        },
      } as Partial<UserProfile>);
    } catch {
      /* profile not ready / test mock — degrade silently */
    }
  }

  // ── Keyboard shortcuts help ────────────────────────────────
  /** Shortcuts help popover open state. */
  showShortcuts = signal(false);

  /** Toggle the keyboard-shortcuts help popover. */
  toggleShortcuts(): void {
    this.haptic.light();
    this.showShortcuts.update((v) => !v);
  }

  /**
   * Shift+F — Stage FX ambience toggle from anywhere in the Studio.
   * Kept as its own document listener (separate from the shell keydown
   * handler that owns the Ctrl+ combos) so neither interferes with the
   * other. Never fires while typing.
   */
  @HostListener("document:keydown", ["$event"])
  onStageFxShortcut(event: KeyboardEvent): void {
    if (event.key !== "f" && event.key !== "F") return;
    if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (event.repeat) return;
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      target?.isContentEditable
    ) {
      return;
    }
    event.preventDefault();
    this.toggleStageFx();
  }

  /**
   * Shell keydown entry point. Yields to native text editing so Ctrl+Z/S/E/I
   * inside an input or contenteditable never hijacks project history, save,
   * export, or the AI Mix panel, then delegates to the Ctrl+ shortcut handler.
   */
  onShellKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing || event.repeat) return;
    // Escape closes the nearest open surface, one layer per press — desktop
    // Chrome and tablet keyboards both route it here. Runs before the text
    // target bail-out so Escape also works while a panel input has focus
    // (guarded against IME composition, which owns Escape while active).
    if (
      event.key === "Escape" &&
      !event.isComposing &&
      this.dismissTopOverlay()
    ) {
      event.preventDefault();
      return;
    }
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable)
    ) {
      return;
    }
    this.handleKeyboardShortcut(event);
  }

  /**
   * Shell contextmenu entry point. The workspace is an instrument, not a
   * document: the native menu (and the Android long-press callout) must
   * never cover pads, steps, keys, knobs or faders mid-performance. Yields
   * to editable fields and links so copy/paste and link actions survive.
   * Component-level handlers (pads, clip slots) run first via bubbling and
   * may open their own menus on top of this suppression.
   */
  onShellContextMenu(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        'input, textarea, select, [contenteditable="true"], [contenteditable=""], a[href]',
      )
    ) {
      return;
    }
    event.preventDefault();
  }

  /**
   * Close the topmost open overlay, if any. Returns true when a surface was
   * dismissed so the caller can stop the event. Order matches z-order:
   * popovers/menus first, then right-slide panels, then the mobile drawer.
   */
  dismissTopOverlay(): boolean {
    if (this.showStudioGuide()) {
      this.closeStudioGuide();
      return true;
    }
    if (this.showSmartCreationSheet()) {
      this.showSmartCreationSheet.set(false);
      return true;
    }
    if (this.showShortcuts()) {
      this.showShortcuts.set(false);
      return true;
    }
    if (this.showProjectMenu()) {
      this.showProjectMenu.set(false);
      return true;
    }
    if (this.showAiAssistant()) {
      this.showAiAssistant.set(false);
      return true;
    }
    if (this.showAiMixAssistant()) {
      this.toggleAiMixAssistant();
      return true;
    }
    if (this.showSmartRecordingPanel()) {
      this.toggleSmartRecordingPanel();
      return true;
    }
    if (this.showProjectMetadata()) {
      this.toggleProjectMetadata();
      return true;
    }
    if (this.showStudioInsights()) {
      this.toggleStudioInsights();
      return true;
    }
    if (this.showActivityLog()) {
      this.toggleActivityLog();
      return true;
    }
    if (this.showSetsBrowser()) {
      this.toggleSetsBrowser();
      return true;
    }
    if (this.showComponentRecording()) {
      this.showComponentRecording.set(false);
      return true;
    }
    if (this.showImportPanel()) {
      this.toggleImportPanel();
      return true;
    }
    if (this.showVocalComp()) {
      this.toggleVocalComp();
      return true;
    }
    if (this.showBezierEditor()) {
      this.toggleBezierEditor();
      return true;
    }
    if (this.showMobileToolsSheet()) {
      this.toggleMobileToolsSheet(false);
      return true;
    }
    if (this.mobileDrawerOpen()) {
      this.mobileDrawerOpen.set(false);
      this.syncPanelFocus(".comp-drawer", false);
      return true;
    }
    return false;
  }

  /**
   * Open Mastering and conform it to the target the artist just judged the
   * export against, so the two surfaces cannot describe different masters.
   */
  openMasteringWithTarget(targetId: string): void {
    this.masteringTargetRequest.set({ targetId, at: Date.now() });
    this.setActiveView("mastering");
  }

  setActiveView(
    view: StudioView,
    options: { clearGuideQuery?: boolean } = {},
  ) {
    // Publish the editor surface that is actually on screen, not the raw view
    // name. The arrangement is the *ngSwitchDefault body, so it stays visible
    // for every view that does not render its own screen; a view that hosts
    // neither editor publishes itself, which makes both editors stand down
    // rather than act on material the artist cannot see.
    if (view === "arrangement" || !SELF_HOSTING_VIEWS.has(view)) {
      this.studioFocus.noteActivity("arrangement");
    } else {
      this.studioFocus.noteActivity(view);
    }
    if (this.mobileDrawerOpen()) {
      this.mobileDrawerOpen.set(false);
      this.syncPanelFocus(".comp-drawer", false);
    }
    // Record travel direction before swapping the view so the transition CSS
    // knows which edge the incoming panel should enter from. Only a real change
    // counts — re-selecting the current tab must not replay the animation.
    const previous = this.activeView();
    // A reviewed render is only kept for the Mastering round trip: visiting
    // anywhere else ends that review, so a large buffer cannot sit in memory
    // for the rest of the session.
    if (previous === "export" && view !== "export") {
      if (view === "mastering") {
        this.exportReview.markNeedsRefresh();
      } else {
        this.exportReview.clear();
      }
    }

    if (previous !== view) {
      this.viewDirection.set(
        this.viewRailIndex(view) >= this.viewRailIndex(previous)
          ? "forward"
          : "backward",
      );
    }
    this.activeView.set(view);
    // Auto-check compares the lesson's target with the surface on screen.
    this.guideAutoCheck.noteActiveView(view);
    this.mobilePanel.set(null);
    this.haptic.light();
    this.studioTelemetry.trackEvent("view_changed", { view }, true);
    if (view === "plugins") {
      this.studioTelemetry.trackEvent("plugin_store_opened", { view }, true);
    }
    this.router.navigate([], {
      relativeTo: this.route,
      // Closing the guide and opening its target are two navigations in the
      // same turn. The second one must carry the cleared params too, or it
      // merges against the old URL and re-opens the overlay from the query.
      queryParams: options.clearGuideQuery
        ? { view, guide: null, lesson: null }
        : { view },
      queryParamsHandling: "merge",
    });
  }

  onBottomNavClick(viewId: string) {
    if (isStudioView(viewId)) this.setActiveView(viewId);
  }

  // ═══════════════════════════════════════════════════════════
  // VIEW NAVIGATION — direction, swipe rail, inspector handoff
  // ═══════════════════════════════════════════════════════════

  /** Position in the swipe rail; anything off the rail sorts to the start. */
  private viewRailIndex(view: StudioView): number {
    const index = this.viewRail.indexOf(view);
    return index === -1 ? 0 : index;
  }

  /**
   * Move one step along the rail. Clamped at both ends: a DAW that wraps from
   * Mastering back to the Arrangement on an accidental swipe loses work.
   */
  stepView(delta: number) {
    const next = this.viewRailIndex(this.activeView()) + delta;
    if (next < 0 || next >= this.viewRail.length) return false;
    const target = this.viewRail[next];
    if (target === this.activeView()) return false;
    this.setActiveView(target);
    this.haptic.light();
    return true;
  }

  /** Mixer/Inspector → Effects Rack handoff, optionally focusing one insert. */
  openEffectsRack(
    target: string | { trackId: string; slot?: number; pluginId?: string },
  ) {
    const trackId = typeof target === "string" ? target : target.trackId;
    const focus = typeof target === "string" ? null : target;
    this.effectsRackFocus.set(
      focus && (focus.slot !== undefined || focus.pluginId)
        ? { slot: focus.slot, pluginId: focus.pluginId }
        : null,
    );
    if (trackId) this.musicManager.selectedTrackId.set(trackId);
    this.setActiveView("effects-rack");
  }

  /** Phone-only gesture; stands down while anything is stacked over the canvas. */
  private swipeNavigationEnabled(): boolean {
    if (!this.uiService.isCompactMobile()) return false;
    if (
      this.mobileDrawerOpen() ||
      this.mobilePanel() ||
      this.showMobileToolsSheet()
    ) {
      return false;
    }
    if (this.showShortcuts()) return false;
    return !this.showSmartCreationSheet();
  }

  /** True when the touch began on a surface that owns its own horizontal drag. */
  private touchOwnedByCanvas(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element || typeof element.closest !== "function") return true;
    const owned =
      "canvas, input, textarea, select, [role='slider'], [data-swipe-ignore]," +
      " .fader-rail, .fader-cap, .crossfader, .jog-wheel, .knob, .mix-strip," +
      " .comp-drawer, .comp-panel, .comp-context-toolbar";
    return !!element.closest(owned);
  }

  onCanvasTouchStart(event: TouchEvent) {
    this.swipeOrigin = null;
    if (!this.swipeNavigationEnabled()) return;
    // A pinch is a zoom, never a view change.
    if (event.touches.length !== 1) return;
    if (this.touchOwnedByCanvas(event.target)) return;
    const touch = event.touches[0];
    this.swipeOrigin = { x: touch.clientX, y: touch.clientY, at: Date.now() };
  }

  onCanvasTouchEnd(event: TouchEvent) {
    const origin = this.swipeOrigin;
    this.swipeOrigin = null;
    if (!origin || !this.swipeNavigationEnabled()) return;
    const touch = event.changedTouches[0];
    if (!touch) return;

    const dx = touch.clientX - origin.x;
    const dy = touch.clientY - origin.y;
    // Horizontal intent, and decisively so: a scroll flick has more vertical
    // travel and must never change view.
    if (Math.abs(dx) < 64) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.6) return;
    // A long press is not a swipe (Android has raised a callout by now).
    if (Date.now() - origin.at > 700) return;

    this.stepView(dx < 0 ? 1 : -1);
  }

  copyShareLink() {
    if (!this.collaboration.can("share")) {
      this.snackbarService.error("Your session role does not allow sharing.");
      return;
    }
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      this.snackbarService.error("Sharing is unavailable in this environment");
      return;
    }
    const session = this.collaboration.currentSession();
    const sessionId = session?.sessionId;
    const project = this.projectService.currentProject();
    const baseUrl = window.location.origin + "/studio";

    const params = new URLSearchParams();
    if (sessionId) params.set("sessionId", sessionId);
    if (project?.name) params.set("project", project.name);

    const queryString = params.toString();
    const url = queryString ? `${baseUrl}?${queryString}` : baseUrl;

    if (!navigator.clipboard?.writeText) {
      this.snackbarService.error("Clipboard access is unavailable");
      this.studioTelemetry.trackEvent(
        "share_link_copied",
        { hasSession: !!sessionId },
        false,
      );
      return;
    }

    navigator.clipboard
      .writeText(url)
      .then(() => {
        this.snackbarService.success("Studio link copied to clipboard");
        this.studioTelemetry.trackEvent(
          "share_link_copied",
          { hasSession: !!sessionId },
          true,
        );
      })
      .catch(() => {
        this.snackbarService.error("Could not copy link");
        this.studioTelemetry.trackEvent(
          "share_link_copied",
          { hasSession: !!sessionId },
          false,
        );
      });
  }

  async newProject() {
    const confirmed = await this.dialog.confirm({
      title: "New Session",
      message: "Start a fresh session? Unsaved changes will be lost.",
      confirmLabel: "Create",
      cancelLabel: "Cancel",
    });
    if (confirmed) {
      // The confirm dialog covers the intent, but "unsaved changes will be
      // lost" should not be true when a snapshot is possible: try to keep the
      // sketch in local Sets, and say so honestly when that fails.
      if (this.projectWorkspace.isDirty()) {
        const preserved = await this.projectWorkspace.autoSave();
        if (!preserved) {
          this.snackbarService.error(
            "Your previous sketch could not be saved — starting a new session without it.",
          );
        }
      }
      this.musicManager.newProject();
      this.projectWorkspace.startFreshProject({
        bpm: this.audioEngine.tempo(),
      });
      this.setActiveView("quick-session");
      this.snackbarService.success("New session created");
      this.studioTelemetry.trackEvent("new_project_created", undefined, true);
    }
  }

  async applyTemplate(id: string): Promise<void> {
    const template = this.templateService.templates.find(
      (item) => item.id === id,
    );
    if (!template) return;
    if (!(await this.preserveOpenSketch("template"))) return;
    this.templateService.applyTemplate(id);
    this.projectWorkspace.startFreshProject({
      name: template.name,
      bpm: template.bpm,
      genre: template.genre,
    });
    this.closeMobilePanel();
    this.snackbarService.success("Template applied");
    this.haptic.medium();
    this.studioTelemetry.trackEvent(
      "template_applied",
      { templateId: id },
      true,
    );
  }

  /**
   * Snapshot the open sketch before a one-tap path replaces the canvas.
   *
   * Resolves true when there is nothing to lose or the snapshot is durable.
   * A recipe or template is a convenience; the artist's current idea is not
   * replaceable, so when the save fails the caller stops instead of handing
   * them a fresh project with the old one gone — and the artist is told why.
   */
  private async preserveOpenSketch(
    action: string,
    alreadyConfirmed = false,
  ): Promise<boolean> {
    return this.workProtection.preserveBeforeReplace(action, alreadyConfirmed);
  }

  /**
   * One-tap instrumental for the mobile quick-start lane: load a curated
   * recipe (drums + bass + chords + melody), set its tempo, snapshot the
   * previous sketch to local Sets so nothing is lost, and land on the
   * arrangement ready to play.
   */
  async quickStartRecipe(
    recipeId: string,
    options: { clearGuideQuery?: boolean } = {},
  ): Promise<void> {
    const recipe = this.ideasGenerator.recipes.find((r) => r.id === recipeId);
    if (!recipe) return;
    this.haptic.medium();
    // Never let a failed snapshot become a replaced canvas.
    if (!(await this.preserveOpenSketch("quick_start"))) return;
    this.audioEngine.resume();
    this.musicManager.applyGeneratedRecipe(recipe);
    this.audioEngine.tempo.set(recipe.bpm);
    this.projectWorkspace.startFreshProject({
      name: recipe.name,
      bpm: recipe.bpm,
      genre: recipe.id,
    });
    try {
      this.audioEngine.start();
    } catch {
      // The AudioContext arms on the next user gesture.
    }
    this.setActiveView("arrangement", options);
    this.guideAutoCheck.noteAction("starter-loaded");
    this.snackbarService.success(
      `${recipe.name} · ${recipe.bpm} BPM — loaded. Add your own layers.`,
    );
    this.studioTelemetry.trackEvent(
      "mobile_quick_start",
      { recipeId: recipe.id, bpm: recipe.bpm },
      true,
    );
  }

  toggleMobilePanel(panel: MobileStudioPanel) {
    this.haptic.light();
    this.mobilePanel.update((current) => (current === panel ? null : panel));
  }

  closeMobilePanel() {
    this.mobilePanel.set(null);
  }

  toggleMobileDrawer() {
    this.haptic.light();
    this.mobileDrawerOpen.update((v) => !v);
    this.syncPanelFocus(".comp-drawer", this.mobileDrawerOpen());
  }

  /** Open or close the compact-mobile tools sheet (topbar MORE button). */
  toggleMobileToolsSheet(open?: boolean) {
    this.haptic.light();
    this.showMobileToolsSheet.update((curr) =>
      open !== undefined ? open : !curr,
    );
    this.syncPanelFocus(".comp-tools-sheet", this.showMobileToolsSheet());
    if (this.showMobileToolsSheet()) {
      this.studioTelemetry.trackEvent("mobile_tools_opened", {}, true);
    }
  }

  toggleRail() {
    this.railCollapsed.update((v) => !v);
  }

  toggleHeader() {
    this.haptic.light();
    this.headerCollapsed.update((v) => !v);
  }

  toggleFooter() {
    this.haptic.light();
    this.footerCollapsed.update((v) => !v);
  }

  private panelTriggers = new Map<string, HTMLElement>();

  /** Move focus into an opened slide-out surface and return it to the
   * originating control when the surface closes. */
  private syncPanelFocus(selector: string, open: boolean): void {
    if (typeof document === "undefined") return;
    if (open) {
      const active = document.activeElement;
      if (active instanceof HTMLElement)
        this.panelTriggers.set(selector, active);
      setTimeout(() => {
        const panel = document.querySelector<HTMLElement>(selector);
        panel
          ?.querySelector<HTMLElement>("button, input, select, textarea")
          ?.focus();
      }, 0);
      return;
    }
    const trigger = this.panelTriggers.get(selector);
    this.panelTriggers.delete(selector);
    trigger?.focus();
  }

  toggleAiAssistant() {
    this.haptic.light();
    this.showAiAssistant.update((v) => !v);
  }

  async adjustBpm() {
    const result = await this.dialog.prompt({
      title: "Adjust Tempo",
      message: "Enter new BPM (20-300):",
      initialValue: this.audioEngine.tempo().toString(),
    });
    if (result) {
      const val = parseInt(result, 10);
      if (!isNaN(val) && val >= 20 && val <= 300) {
        this.audioEngine.tempo.set(val);
        this.projectWorkspace.updateMetadata({ bpm: val });
        this.snackbarService.success(`Tempo set to ${val} BPM`);
      }
    }
  }

  toggleBrowser() {
    this.haptic.light();
    this.browserCollapsed.update((v) => !v);
  }
  toggleInspector() {
    this.haptic.light();
    this.inspectorCollapsed.update((v) => !v);
  }

  toggleCollaboration() {
    if (this.collaboration.currentSession()) {
      this.collaboration.leaveSession();
      this.snackbarService.info("Left collaboration session");
      this.studioTelemetry.trackEvent("collab_left", undefined, true);
    } else {
      const user = this.authService.currentUser() || {
        id: "anon",
        name: "Anonymous",
      };
      this.collaboration.startSession(
        user as any,
        this.musicManager.snapshotProject(),
      );
      this.snackbarService.success("Collaboration session started");
      this.studioTelemetry.trackEvent(
        "collab_started",
        { userId: user.id },
        true,
      );
    }
  }

  // ── AI Mix Assistant ─────────────────────────────────

  toggleAiMixAssistant() {
    this.haptic.light();
    this.showAiMixAssistant.update((v) => !v);
    if (this.showAiMixAssistant()) this.startSpectrumAnalyzer();
    else this.stopSpectrumAnalyzer();
    this.syncPanelFocus(".comp-aimix-panel", this.showAiMixAssistant());
    if (this.showAiMixAssistant()) {
      this.studioTelemetry.trackEvent("ai_mix_panel_opened", undefined, true);
    }
    if (
      this.showAiMixAssistant() &&
      this.aiMixAssistant.analyses().length === 0
    ) {
      this.aiMixAssistant.analyzeAll();
    }
  }

  // ── Studio Insights (product telemetry dashboard) ─────

  toggleStudioInsights() {
    this.haptic.light();
    if (!this.showStudioInsights() && this.showActivityLog()) {
      this.showActivityLog.set(false);
      this.syncPanelFocus(".comp-activity-panel", false);
    }
    this.showStudioInsights.update((v) => !v);
    this.syncPanelFocus(".comp-insights-panel", this.showStudioInsights());
    if (this.showStudioInsights()) {
      this.studioTelemetry.trackEvent("insights_panel_opened", undefined, true);
      // Cheap live snapshot so the coach has a latency sample without a full
      // offline benchmark every open.
      try {
        const snap = this.engineLatency.readSnapshot();
        this.studioTelemetry.recordLatencyProbe(
          {
            totalLatencyMs: snap.totalLatencyMs,
            masterWorkletActive: snap.masterWorkletActive,
            sampleRateHz: snap.sampleRateHz,
          },
          snap.contextState === "running",
        );
      } catch {
        /* engine may be suspended / unavailable */
      }
    }
  }

  // ── Quiet Studio activity log ─────────────────────────

  toggleActivityLog() {
    this.haptic.light();
    if (!this.showActivityLog() && this.showStudioInsights()) {
      this.showStudioInsights.set(false);
      this.syncPanelFocus(".comp-insights-panel", false);
    }
    this.showActivityLog.update((v) => !v);
    this.syncPanelFocus(".comp-activity-panel", this.showActivityLog());
  }

  clearActivityLog() {
    this.snackbarService.clearActionLog();
  }

  activityIcon(type: ActionLogEntry["type"]): string {
    switch (type) {
      case "error":
        return "error";
      case "warning":
        return "warning";
      case "success":
        return "check_circle";
      default:
        return "info";
    }
  }

  trackActivity(_index: number, entry: ActionLogEntry): number {
    return entry.id;
  }

  /** Humanize camelCase gap categories for the insights panel. */
  formatInsightCategory(category: string): string {
    return category
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (c) => c.toUpperCase())
      .trim();
  }

  /** Format 0..1 rates as whole percentages. */
  formatInsightPct(rate: number): string {
    return `${Math.round((rate || 0) * 100)}%`;
  }

  formatPersistenceSource(source: string | null): string {
    switch (source) {
      case "autosave":
        return "auto-save";
      case "recovery":
        return "background recovery";
      case "import":
        return "imported";
      case "manual":
        return "saved";
      default:
        return "local";
    }
  }

  /** Stable event-volume entries sorted by count descending. */
  insightEventVolumeEntries(): Array<{ name: string; count: number }> {
    const volume = this.studioWeeklyDashboard().eventVolume || {};
    return Object.entries(volume)
      .map(([name, count]) => ({ name, count: Number(count) || 0 }))
      .sort((a, b) => b.count - a.count);
  }

  /** Coach CTAs ranked by live weighted gap. */
  insightCoachActions(): StudioCoachAction[] {
    return this.studioWeeklyDashboard().coachActions || [];
  }

  /**
   * Full offline + live latency probe from Insights / coach CTA.
   * Updates telemetry so live parity scores recompute immediately.
   */
  async runInsightsLatencyProbe(): Promise<void> {
    if (this.insightsProbeRunning()) return;
    this.insightsProbeRunning.set(true);
    this.haptic.light();
    try {
      const snap = this.engineLatency.readSnapshot();
      const bench = await this.engineLatency.runOfflineBenchmark(1);
      this.studioTelemetry.recordLatencyProbe(
        {
          totalLatencyMs: snap.totalLatencyMs,
          speedRatio: bench.speedRatio,
          masterWorkletActive: snap.masterWorkletActive,
          sampleRateHz: snap.sampleRateHz,
        },
        true,
      );
      this.snackbarService.success(
        `Engine probe · ${Math.round(snap.totalLatencyMs)} ms · ×${bench.speedRatio.toFixed(2)} render`,
      );
    } catch (e) {
      this.studioTelemetry.trackEvent(
        "studio_error",
        {
          action: "latency_probe",
          error: e instanceof Error ? e.message : "unknown",
        },
        false,
      );
      this.snackbarService.error("Engine probe failed");
    } finally {
      this.insightsProbeRunning.set(false);
    }
  }

  /** Execute a coach CTA and mark it complete in telemetry. */
  async runCoachAction(action: StudioCoachAction): Promise<void> {
    this.haptic.medium();
    const id = action.id as StudioCoachActionId;
    try {
      switch (id) {
        case "probe_latency":
          await this.runInsightsLatencyProbe();
          break;
        case "seed_starter": {
          if (!(await this.preserveOpenSketch("coach_starter"))) break;
          const recipe = this.ideasGenerator.recipes?.[0];
          if (recipe) {
            this.musicManager.applyGeneratedRecipe(recipe);
            this.studioTelemetry.trackEvent(
              "starter_recipe_seeded",
              { source: "coach", recipeId: recipe.id },
              true,
            );
            this.snackbarService.success(`Starter seeded · ${recipe.name}`);
          } else if (this.templateService.templates?.[0]) {
            void this.applyTemplate(this.templateService.templates[0].id);
          }
          if (action.targetView && isStudioView(action.targetView)) {
            this.setActiveView(action.targetView);
          }
          break;
        }
        case "start_collab":
          if (!this.collaboration.currentSession()) {
            this.toggleCollaboration();
          } else {
            this.snackbarService.info("Collab session already active");
          }
          break;
        case "export_project":
          await this.exportProject();
          break;
        case "open_ai_mix":
          if (!this.showAiMixAssistant()) {
            this.toggleAiMixAssistant();
          }
          break;
        case "open_plugins":
          this.setActiveView("plugins");
          break;
        case "share_link":
          this.copyShareLink();
          break;
        default:
          break;
      }
      this.studioTelemetry.completeCoachAction(id, {
        category: action.category,
      });
    } catch (e) {
      this.studioTelemetry.trackEvent(
        "studio_error",
        {
          action: "coach_action",
          coachId: id,
          error: e instanceof Error ? e.message : "unknown",
        },
        false,
      );
    }
  }

  dismissCoachAction(action: StudioCoachAction, event?: Event): void {
    event?.stopPropagation();
    this.haptic.light();
    this.studioTelemetry.dismissCoachAction(action.id);
  }

  /** Run fresh AI mix analysis on all tracks */
  runAiMixAnalysis() {
    const trackCount = this.musicManager.tracks().length;
    // analyzeAll() has nothing to read on an empty project; reporting a
    // successful analysis of zero tracks would be a claim with no work behind it.
    if (trackCount === 0) {
      this.snackbarService.info(
        "Add a track first — there is nothing to analyze yet.",
      );
      return;
    }
    this.aiMixAssistant.analyzeAll();
    this.studioTelemetry.trackEvent(
      "ai_mix_analysis_run",
      { trackCount },
      true,
    );
    this.snackbarService.success(
      "AI Mix Assistant analyzed " +
        trackCount +
        (trackCount === 1 ? " track" : " tracks"),
    );
  }

  /** Apply a specific AI mix suggestion to a track */
  applyMixSuggestion(suggestionId: string) {
    if (!this.collaboration.can("edit")) {
      this.snackbarService.error(
        "Your session role is view-only for mix edits.",
      );
      return;
    }
    const suggestion = this.aiMixAssistant
      .suggestions()
      .find((s) => s.id === suggestionId);
    if (!suggestion) return;

    suggestion.action();
    this.snackbarService.info("Applied: " + suggestion.label);
    this.haptic.light();
  }

  // ── Smart Recording ───────────────────────────────────

  toggleSmartRecordingPanel() {
    this.haptic.light();
    this.showSmartRecordingPanel.update((v) => !v);
    this.syncPanelFocus(".comp-rec-panel", this.showSmartRecordingPanel());
  }

  /**
   * Open the import editor and ask for files in one step.
   *
   * The panel only ever had a close button, so importing from the toolbar left
   * the artist with a file in the library and no way to open its editor.
   */
  openImportPicker(): void {
    this.showImportPanel.set(true);
    void this.audioImport.importFiles();
  }

  toggleImportPanel() {
    this.haptic.light();
    this.showImportPanel.update((v) => !v);
    this.syncPanelFocus(".comp-import-panel", this.showImportPanel());
  }

  /**
   * Open the recording-source panel.
   *
   * `toggleComponentRecording` was only ever called from its own panel, so the
   * source picker had no way in at any width.
   */
  openComponentRecording(): void {
    this.haptic.light();
    this.showComponentRecording.set(true);
    this.syncPanelFocus(".comp-rec-src-panel", true);
  }

  toggleComponentRecording() {
    this.haptic.light();
    this.showComponentRecording.update((v) => !v);
    this.syncPanelFocus(".comp-rec-src-panel", this.showComponentRecording());
  }

  selectComponentRecording(component: any) {
    this.componentRecording.setActiveSource(component);
    this.snackbarService.info(
      "Recording source: " +
        (this.componentRecording.getConfig(component)?.label || component),
    );
  }

  setRecordingMode(mode: "normal" | "punch" | "comp") {
    this.smartRecording.setRecordingMode(mode);
    this.studioTelemetry.trackEvent("recording_mode_changed", { mode }, true);
    this.snackbarService.info("Recording mode: " + mode.toUpperCase());
  }

  // ── Project Workspace ─────────────────────────────────

  toggleProjectMetadata() {
    this.haptic.light();
    this.showProjectMetadata.update((v) => !v);
    this.syncPanelFocus(".comp-meta-panel", this.showProjectMetadata());
  }

  /**
   * Monitor A/B from Project Details, so an engineer can see and change a
   * saved mono choice without hunting for Transport → More.
   */
  toggleProjectMonitor(): void {
    const engine = this.musicManager.engine;
    if (typeof engine?.toggleMonoMonitoring !== "function") return;
    const mono = engine.toggleMonoMonitoring();
    this.haptic.light();
    this.snackbarService.info(
      mono
        ? "Mono-sum monitoring on — save the set to keep this as its default"
        : "Stereo monitoring restored — save the set to keep this as its default",
    );
  }

  /**
   * Follow actions are saved session state, so Project Details shows the
   * interval (not just on/off) and can arm them without entering Session View.
   */
  sceneFollowLabel(): string {
    return this.sceneFollowEnabled()
      ? `ON · ${this.sceneFollowBars()}B`
      : `OFF · ${this.sceneFollowBars()}B`;
  }

  toggleProjectFollow(): void {
    const enabled = !this.musicManager.sceneFollowEnabled();
    this.musicManager.setSceneFollowEnabled(enabled);
    this.haptic.light();
    this.snackbarService.info(
      enabled
        ? `Follow actions on — next scene every ${this.sceneFollowBars()} bar${
            this.sceneFollowBars() === 1 ? "" : "s"
          }; save the set to keep this default`
        : "Follow actions off — scenes stay where you launch them",
    );
  }

  /** Label for the grid-wide default, where `none` means immediate. */
  gridLaunchLabel(): string {
    const value = this.musicManager.launchQuantize?.() ?? "none";
    return value === "none" ? "IMMEDIATE" : this.launchBoundaryLabel(value);
  }

  launchBoundaryLabel(value: LaunchQuantize): string {
    switch (value) {
      case "none":
        return "OFF";
      case "1bar":
        return "1 BAR";
      case "2bar":
        return "2 BARS";
      case "4bar":
        return "4 BARS";
    }
  }

  /** Appended to restore messages so a mono reopen is never a surprise. */
  private restoredMonitorSuffix(): string {
    return this.musicManager.engine?.monoMonitoring?.()
      ? " · mono monitoring on"
      : "";
  }

  async saveProject(): Promise<boolean> {
    if (this.projectWorkspace.isSaving()) return false;
    this.haptic.medium();
    try {
      const bundle = await this.projectWorkspace.manualSave();
      // Every manual save becomes a restorable cloud version.
      void this.pushVersionSnapshot(bundle, true);
      this.snackbarService.success("Project saved");
      this.studioTelemetry.trackEvent("project_saved", undefined, true);
      if (this.showSetsBrowser()) void this.refreshLocalSets();
      return true;
    } catch (error) {
      this.studioTelemetry.trackEvent(
        "studio_error",
        {
          action: "project_save",
          error: error instanceof Error ? error.message : "unknown",
        },
        false,
      );
      if (this.projectWorkspace.canRepairAudio()) {
        this.showAudioRepair.set(true);
      }
      // An explanation the artist can act on must reach them verbatim: a
      // guest refusal is not the same failure as a generic write error.
      const actionable =
        error instanceof Error &&
        (error.message.includes("no matching take") ||
          error.message.includes("Guest sessions are not saved"));
      const message = actionable
        ? (error as Error).message
        : "Could not save project";
      this.snackbarService.error(message);
      return false;
    }
  }

  triggerLoadProject() {
    const fileInput = this.fileInput?.nativeElement;
    if (fileInput) fileInput.click();
  }

  async loadProjectFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    let archived = false;

    try {
      // A ZIP archive stores audio as raw Float32, so the old 64 MiB text cap
      // would reject a normal multi-track song. Legacy JSON imports still work
      // but are recognised separately for telemetry and the size message.
      const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      archived = isProjectArchive(head);
      const limit = 512 * 1024 * 1024;
      if (file.size > limit) {
        throw new Error('Project file exceeds the 512 MiB import limit.');
      }
      const format = archived ? 'smuve-zip' : 'smuve-json';
      // Importing replaces the canvas. Snapshot the open sketch first and stop
      // when it cannot be stored; choosing the file is the confirmation, so a
      // guest is not asked a second time.
      if (!(await this.preserveOpenSketch("import", true))) return;
      const bundle = await readProjectFile(file);
      const success = await this.projectWorkspace.importProjectBundle(bundle);
      if (success) {
        this.history.clear();
        if (this.showSetsBrowser()) void this.refreshLocalSets();
        this.snackbarService.success(
          "Project loaded successfully" + this.restoredMonitorSuffix(),
        );
        this.studioTelemetry.trackEvent(
          "project_imported",
          { format },
          true,
        );
      } else {
        this.studioTelemetry.trackEvent(
          "project_imported",
          { format, reason: "rejected" },
          false,
        );
        this.snackbarService.error(
          this.projectWorkspace.persistenceError() ||
            "Failed to load project bundle",
        );
      }
    } catch (error) {
      this.studioTelemetry.trackEvent(
        "project_imported",
        {
          format: archived ? 'smuve-zip' : 'smuve-json',
          error: error instanceof Error ? error.message : "invalid_project_file",
        },
        false,
      );
      this.snackbarService.error("Invalid project file format");
    } finally {
      // Reset the input so selecting the same file again emits a change event.
      input.value = "";
    }
  }

  // ── MIDI import (.mid / .midi) ─────────────────────────

  async importMidi(): Promise<void> {
    this.haptic.light();
    try {
      const files = await this.fileLoader.pickLocalFiles(".mid,.midi");
      if (files.length === 0) return;

      let trackCount = 0;
      let noteCount = 0;
      let tempoBpm: number | undefined;
      let failed = 0;
      for (const file of files) {
        try {
          const parsed = await this.midiImport.parseFile(file);
          const summary = this.midiImport.importParsed(parsed);
          trackCount += summary.trackCount;
          noteCount += summary.noteCount;
          tempoBpm ??= summary.tempoBpm;
        } catch (error) {
          failed++;
          this.logger.warn(`MIDI import failed for ${file.name}`, error);
        }
      }

      if (trackCount > 0) {
        this.history.clear();
        this.snackbarService.success(
          `Imported ${trackCount} MIDI track(s) · ${noteCount} note(s)` +
            (tempoBpm ? ` · ${tempoBpm} BPM` : ""),
        );
        this.studioTelemetry.trackEvent(
          "midi_imported",
          { trackCount, noteCount, tempoBpm: tempoBpm ?? 0 },
          true,
        );
      }
      if (failed > 0) {
        this.snackbarService.warning(
          `Skipped ${failed} MIDI file(s) that could not be parsed`,
        );
      }
    } catch (error) {
      this.logger.error("MIDI import failed", error);
      this.snackbarService.error("MIDI import failed");
    }
  }

  // ── Cloud version history ───────────────────────────────

  toggleVersionHistory(): void {
    this.haptic.light();
    const next = !this.showVersionHistory();
    this.showVersionHistory.set(next);
    if (next) void this.refreshVersionHistory();
    this.syncPanelFocus(".comp-versions-panel", next);
  }

  async refreshVersionHistory(): Promise<void> {
    const projectId = this.projectWorkspace.metadata()?.id;
    if (!projectId) {
      this.versionHistory.set([]);
      this.versionHistoryOffline.set(false);
      return;
    }
    this.versionHistoryBusy.set(true);
    try {
      await this.cloudSync.refresh();
      const cloud = this.cloudSync.listSnapshots(projectId);
      if (cloud.length) {
        this.versionHistory.set(cloud);
        this.versionHistoryOffline.set(false);
      } else {
        // A signed-out session or a project the cloud has never seen: show
        // what this device kept instead of an empty panel.
        const local = await this.localVersionSnapshots(projectId);
        this.versionHistory.set(local);
        this.versionHistoryOffline.set(local.length > 0);
      }
    } catch (error) {
      this.logger.warn("Could not read cloud version history", error);
      const local = await this.localVersionSnapshots(projectId);
      this.versionHistory.set(local);
      this.versionHistoryOffline.set(true);
    } finally {
      this.versionHistoryBusy.set(false);
    }
  }

  /**
   * Device-kept versions shaped like cloud snapshots, so the panel and the
   * restore path do not care which side answered.
   */
  private async localVersionSnapshots(
    projectId: string,
    bundle?: ProjectBundle,
  ): Promise<RemoteSnapshot[]> {
    if (bundle) await this.projectWorkspace.saveLocalVersion(bundle);
    const records = await this.projectWorkspace.listLocalVersions(projectId);
    return records.map((record) => ({
      projectId,
      deviceId: "local",
      deviceName: "This device",
      version: record.version,
      title: record.title,
      timestamp: record.savedAt,
      byteSize: 0,
      data: record.payload,
    }));
  }

  /**
   * Store the current project state as a cloud version. Called after every
   * manual save (quiet) and by the history panel's explicit button.
   */
  async pushVersionSnapshot(
    bundle?: ProjectBundle,
    quiet = false,
  ): Promise<void> {
    const snapshot =
      bundle ??
      (typeof this.projectWorkspace.createSnapshot === "function"
        ? this.projectWorkspace.createSnapshot()
        : undefined);
    const projectId = snapshot?.metadata?.id;
    if (!snapshot || !projectId) return;
    bundle = snapshot;
    try {
      await this.cloudSync.push(
        projectId,
        bundle.metadata.name || "Untitled Set",
        bundle,
      );
      const cloud = this.cloudSync.listSnapshots(projectId);
      if (cloud.length) {
        this.versionHistory.set(cloud);
        this.versionHistoryOffline.set(false);
        if (!quiet) {
          this.snackbarService.success("Version saved to cloud history");
        }
      } else if (!quiet) {
        // The push resolved but the cloud holds nothing for this set (an
        // unreachable or stubbed endpoint). Keep the version on this device
        // rather than reporting a save that left no trace. A quiet push came
        // from a save, which already kept its own copy.
        const local = await this.localVersionSnapshots(projectId, bundle);
        this.versionHistory.set(local);
        this.versionHistoryOffline.set(true);
        this.snackbarService.info(
          "Cloud is unreachable — this version is saved on this device.",
        );
      }
    } catch (error) {
      this.logger.warn("Cloud version push failed", error);
      // The cloud copy is optional; the version itself is not. A save already
      // kept this state on the device, so only an explicit push needs to.
      if (quiet) return;
      const local = await this.localVersionSnapshots(projectId, bundle);
      this.versionHistory.set(local);
      this.versionHistoryOffline.set(true);
      this.snackbarService.info(
        "Cloud is unreachable — this version is saved on this device.",
      );
    }
  }

  async restoreVersion(snapshot: RemoteSnapshot): Promise<void> {
    const projectId = this.projectWorkspace.metadata()?.id;
    const data = snapshot.data as ProjectBundle | undefined;
    if (!projectId || !data?.metadata?.id) {
      this.snackbarService.error("That version has no restorable project data.");
      return;
    }
    const confirmed = await this.dialog.confirm({
      // Device-kept versions reach this dialog too, so it does not claim a
      // cloud copy the artist may never have uploaded.
      title: "Restore version?",
      message:
        `Replace the current session with v${snapshot.version} from ` +
        `${this.versionDeviceLabel(snapshot)}? This is also saved as a new version, so nothing is lost.`,
      confirmLabel: "Restore version",
      cancelLabel: "Keep current",
      tone: "danger",
    });
    if (!confirmed) return;
    // The confirm covers consent, not recoverability: keep the open take that
    // the restore is about to replace.
    if (!(await this.preserveOpenSketch("cloud_version", true))) return;

    this.versionHistoryBusy.set(true);
    try {
      // Device-kept versions never reached the cloud, so there is nothing to
      // restore there; importing the payload is the whole restore.
      if (snapshot.deviceId !== "local") {
        await this.cloudSync.restoreFromBackup(projectId, snapshot);
      }
      const restored = await this.projectWorkspace.importProjectBundle(data);
      if (!restored) {
        this.snackbarService.error("The version could not be restored.");
        return;
      }
      this.history.clear();
      await this.refreshVersionHistory();
      this.snackbarService.success(
        `Restored version v${snapshot.version}` +
          this.restoredMonitorSuffix(),
      );
      this.studioTelemetry.trackEvent(
        "cloud_version_restored",
        { version: snapshot.version },
        true,
      );
    } catch (error) {
      this.logger.warn("Cloud version restore failed", error);
      this.snackbarService.error("That version could not be restored.");
    } finally {
      this.versionHistoryBusy.set(false);
    }
  }

  versionDeviceLabel(snapshot: RemoteSnapshot): string {
    return snapshot.deviceName?.trim() || snapshot.deviceId;
  }

  versionTrack = (_: number, snapshot: RemoteSnapshot): string =>
    `${snapshot.deviceId}:${snapshot.version}:${snapshot.timestamp}`;

  railGroupTrack = (_: number, group: { id: string }): string => group.id;

  setTrack = (_: number, set: LocalProjectSummary): string => set.projectId;

  setVersionTrack = (_: number, version: LocalProjectVersion): string =>
    version.id;

  // ── Sets browser (local project workspaces) ────────────

  toggleSetsBrowser(): void {
    this.haptic.light();
    const next = !this.showSetsBrowser();
    this.showSetsBrowser.set(next);
    if (next) {
      // Opening the browser always re-reads storage — a stale shelf is worse
      // than an empty one. The recovery prune runs alongside that read rather
      // than in front of it, so the shelf never waits on maintenance; it only
      // re-reads if the prune actually removed rows.
      void this.refreshLocalSets();
      void this.pruneSupersededRecoveryRows();
      this.studioTelemetry.trackEvent("sets_browser_opened", undefined, true);
    }
    this.syncPanelFocus(".comp-sets-panel", next);
  }

  /**
   * Clear superseded recovery rows when the Sets browser opens, so a set saved
   * under the old every-tab-hide behaviour loses its duplicate versions without
   * waiting for its own next save. Pruning is idempotent and reports 0 instead
   * of throwing when storage refuses the delete, so a failed prune leaves the
   * shelf exactly as the read above found it.
   */
  private async pruneSupersededRecoveryRows(): Promise<void> {
    const removed =
      await this.projectWorkspace.pruneRedundantRecoveryRecords();
    if (removed > 0) await this.refreshLocalSets();
  }

  async refreshLocalSets(): Promise<void> {
    this.setsBusy.set(true);
    this.setsError.set('');
    try {
      const sets = await this.projectWorkspace.listLocalProjects();
      this.localSets.set(sets);
    } catch (error) {
      this.logger.warn("Studio: Could not read local sets", error);
      this.setsError.set('Could not read this device\u2019s sets.');
      this.localSets.set([]);
    } finally {
      this.setsBusy.set(false);
    }
  }

  isCurrentSet(set: LocalProjectSummary): boolean {
    return this.projectWorkspace.metadata()?.id === set.projectId;
  }

  /** Compact "saved 5 min ago" label for a set row. */
  formatSetSavedAt(savedAt: number): string {
    if (!savedAt) return "not saved yet";
    const elapsed = Date.now() - savedAt;
    if (elapsed < 60_000) return "just now";
    if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`;
    if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} h ago`;
    if (elapsed < 7 * 86_400_000)
      return `${Math.floor(elapsed / 86_400_000)} d ago`;
    return new Date(savedAt).toLocaleDateString();
  }

  /** Meter shown in the Sets row; legacy test fixtures may omit it. */
  setMeterLabel(set: LocalProjectSummary): string {
    const [beats, unit] = set.timeSignature ?? [4, 4];
    return `${beats}/${unit}`;
  }

  setSourceLabel(set: LocalProjectSummary): string {
    switch (set.source) {
      case 'manual':
        return 'saved';
      case 'autosave':
        return 'autosaved';
      case 'recovery':
        return 'recovered';
      default:
        return 'imported';
    }
  }

  /** Open a set from the browser, guarding an unsaved session. */
  /**
   * Expand the versions this device kept for one set, right in the browser —
   * an artist can roll back without opening the set first.
   */
  async toggleSetVersions(set: LocalProjectSummary): Promise<void> {
    if (this.setsVersionsFor() === set.projectId) {
      this.setsVersionsFor.set('');
      this.setsVersions.set([]);
      return;
    }
    this.haptic.light();
    this.setsVersionsFor.set(set.projectId);
    this.setsVersions.set(
      await this.projectWorkspace.listLocalVersions(set.projectId),
    );
  }

  async restoreStoredVersion(version: LocalProjectVersion): Promise<void> {
    if (this.setsBusy()) return;
    const confirmed = await this.dialog.confirm({
      title: `Restore version v${version.version}?`,
      message:
        `Replace the open session with “${version.title}” from ` +
        `${this.formatSetSavedAt(version.savedAt)}? The current state stays ` +
        `in the set\u2019s autosave.`,
      confirmLabel: 'Restore version',
      cancelLabel: 'Keep current',
      tone: 'danger',
    });
    if (!confirmed) return;
    // Restoring replaces the open sketch just as opening another set does.
    if (!(await this.preserveOpenSketch('set_version', true))) return;
    this.setsBusy.set(true);
    this.setsError.set('');
    try {
      if (!this.projectWorkspace.restoreLocalVersion(version)) {
        this.setsError.set('That version could not be restored.');
        return;
      }
      this.projectWorkspace.autoSaveEnabled.set(true);
      this.history.clear();
      this.showSetsBrowser.set(false);
      this.setsVersionsFor.set('');
      this.setsVersions.set([]);
      this.setActiveView('arrangement');
      this.snackbarService.success(
        `Restored “${version.title}” v${version.version}` +
          this.restoredMonitorSuffix(),
      );
      await this.refreshLocalSets();
    } finally {
      this.setsBusy.set(false);
    }
  }

  async openStoredSet(set: LocalProjectSummary): Promise<void> {
    if (this.isCurrentSet(set)) {
      this.snackbarService.info("That set is already open");
      return;
    }
    // Opening another set replaces the open sketch. Tapping the set is the
    // intent, so preserve the sketch and stop only if it cannot be stored.
    if (!(await this.preserveOpenSketch("stored_set", true))) return;
    this.setsBusy.set(true);
    this.setsError.set('');
    try {
      const opened = await this.projectWorkspace.loadProject(set.projectId);
      if (!opened) {
        this.setsError.set('That set could not be opened.');
        return;
      }
      // Opening is an explicit intent to keep working in this set.
      this.projectWorkspace.autoSaveEnabled.set(true);
      this.history.clear();
      this.showSetsBrowser.set(false);
      this.setActiveView("arrangement");
      this.snackbarService.success(
        `Opened \u201c${opened.metadata.name}\u201d` +
          this.restoredMonitorSuffix(),
      );
      this.studioTelemetry.trackEvent(
        "set_opened",
        { source: set.source, trackCount: set.trackCount },
        true,
      );
      await this.refreshLocalSets();
    } finally {
      this.setsBusy.set(false);
    }
  }

  /** Delete a set and every local version of it. */
  async deleteStoredSet(set: LocalProjectSummary): Promise<void> {
    const deletingCurrent = this.isCurrentSet(set);
    const confirmed = await this.dialog.confirm({
      title: 'Delete this set?',
      message: deletingCurrent
        ? `Delete \u201c${set.name}\u201d and its local autosave versions? This is the open set \u2014 a new unsaved set will start. This cannot be undone.`
        : `Delete \u201c${set.name}\u201d and its local autosave versions? Cloud versions are not deleted.`,
      confirmLabel: 'Delete set',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (!confirmed) return;
    this.setsBusy.set(true);
    this.setsError.set('');
    try {
      const removed = await this.projectWorkspace.deleteLocalProject(set.projectId);
      if (!removed) {
        this.setsError.set('That set was already gone.');
      } else {
        // Deleting the open set detaches autosave; keep it armed for the
        // fresh session that replaces it.
        if (deletingCurrent) this.projectWorkspace.autoSaveEnabled.set(true);
        this.snackbarService.success(`Deleted \u201c${set.name}\u201d`);
        this.studioTelemetry.trackEvent("set_deleted", undefined, true);
      }
      await this.refreshLocalSets();
    } finally {
      this.setsBusy.set(false);
    }
  }

  /** Start a new set from the browser and keep the shelf current. */
  async newSetFromBrowser(): Promise<void> {
    await this.newProject();
    await this.refreshLocalSets();
  }

  /** Import a .smuve bundle from the browser. */
  importSetFromBrowser(): void {
    this.triggerLoadProject();
  }

  /** Open the missing-take repair sheet for the current project. */
  openAudioRepair(): void {
    const report = this.projectWorkspace.inspectCurrentAudioIntegrity();
    if (report.ok) {
      this.snackbarService.success("All audio clips are linked");
      return;
    }
    if (!this.projectWorkspace.canRepairAudio()) {
      this.snackbarService.error(
        "Those takes belong to a project that is not open.",
      );
      return;
    }
    this.showAudioRepair.set(true);
  }

  async exportProject() {
    this.haptic.light();
    try {
      this.projectWorkspace.downloadProjectBundle();
      this.snackbarService.success("Project exported as .smuve bundle");
      this.studioTelemetry.trackEvent(
        "project_exported",
        { format: "smuve" },
        true,
      );
    } catch (e) {
      if (this.projectWorkspace.canRepairAudio()) {
        this.showAudioRepair.set(true);
      }
      this.studioTelemetry.trackEvent(
        "project_exported",
        { format: "smuve", error: e instanceof Error ? e.message : "unknown" },
        false,
      );
      this.studioTelemetry.trackEvent(
        "studio_error",
        {
          action: "project_export",
          error: e instanceof Error ? e.message : "unknown",
        },
        false,
      );
      this.snackbarService.error(
        e instanceof Error && e.message
          ? e.message
          : "Project export failed. Please try again.",
      );
    }
  }

  setProjectGenre(genre: string) {
    this.projectWorkspace.setGenre(genre);
    this.snackbarService.info("Genre: " + genre);
  }

  setProjectMood(mood: string) {
    this.projectWorkspace.updateMetadata({ mood });
    this.snackbarService.info("Mood: " + mood);
  }

  setProjectKey(key: string) {
    this.projectWorkspace.updateMetadata({ key });
    this.snackbarService.info("Key: " + key);
  }

  // ── AI Chord Suggestions ─────────────────────────────

  /** Selected genre for chord progression suggestions */
  chordGenre = signal<string>("pop");

  /** Available chord progression genres */
  chordGenres = [
    "neo-soul",
    "trap",
    "lo-fi",
    "house",
    "drill",
    "pop",
    "rnb",
    "deep-house",
    "dubstep",
    "ambient",
    "jazz",
    "funk",
    "reggaeton",
    "techno",
    "phonk",
    "garage",
  ];

  /** Computed chord progression based on selected genre */
  chordProgression = computed(() =>
    this.aiMixAssistant.suggestChordProgression(this.chordGenre()),
  );

  /** Chord voicing type */
  chordVoicing = signal<"close" | "open" | "wide">("close");

  /** Computed MIDI notes for the current voicing */
  voicingNotes = computed(() => {
    const progression = this.chordProgression();
    if (progression.length === 0) return [];
    const firstChord = progression[0];
    const notes = this.chordToNotes(firstChord, 0);
    if (notes.length === 0) return [];

    const baseNotes = notes.map((n) => n.note);
    const voicing = this.chordVoicing();

    if (voicing === "close") return baseNotes;

    if (voicing === "open") {
      // Open voicing: spread middle notes up an octave
      return [
        baseNotes[0], // root stays
        ...baseNotes.slice(1, -1).map((n) => n + 12), // middle up octave
        baseNotes[baseNotes.length - 1], // top stays
      ];
    }

    if (voicing === "wide") {
      // Wide voicing: root + fifth below, upper structure above
      const root = baseNotes[0];
      const fifth = baseNotes[2];
      const upper = baseNotes.slice(1).filter((_, i) => i !== 1); // remove fifth from middle
      return [root, root - 12, fifth - 12, ...upper.map((n) => n + 12)];
    }

    return baseNotes;
  });

  /** Check if a note is the third of the current chord */
  isThird(note: number, allNotes: number[]): boolean {
    if (allNotes.length < 3) return false;
    return note === allNotes[1];
  }

  /** Check if a note is the fifth of the current chord */
  isFifth(note: number, allNotes: number[]): boolean {
    if (allNotes.length < 3) return false;
    return note === allNotes[2] || note === allNotes[2] - 12;
  }

  /** Apply a chord to the piano roll via musicManager */
  applyChordToPianoRoll(chord: string, index: number) {
    this.haptic.light();
    const notes = this.chordToNotes(chord, index);
    if (notes.length === 0) {
      this.snackbarService.error(`Could not parse chord: ${chord}`);
      return;
    }

    // Stamp the chord onto the selected track, otherwise the first MIDI
    // track, otherwise a fresh keys track — so the chord actually appears
    // in the piano roll instead of only showing a toast.
    let trackId = this.musicManager.selectedTrackId();
    if (!trackId) {
      const midiTrack = this.musicManager
        .tracks()
        .find((t) => t.type === "midi");
      trackId =
        midiTrack?.id ?? this.musicManager.addTrack("Chords", "grand-piano");
    }
    if (!trackId) return;

    const stamped: TrackNote[] = notes.map((n, i) => ({
      id: `chord_${Date.now()}_${index}_${i}`,
      midi: n.note,
      step: n.startStep,
      length: n.durationSteps,
      velocity: n.velocity,
    }));
    const existing = this.musicManager.tracks().find((t) => t.id === trackId);
    this.musicManager.replaceTrackNotes(
      trackId,
      [...(existing?.notes ?? []), ...stamped],
      `Stamp Chord · ${chord}`,
    );
    this.musicManager.selectedTrackId.set(trackId);
    this.snackbarService.success(
      `Applied ${chord} — ${notes.length} notes at bar ${index + 1}`,
    );
  }

  /** Convert a chord symbol (e.g. 'Imaj7') to MIDI notes */
  private chordToNotes(
    chord: string,
    position: number,
  ): Array<{
    note: number;
    velocity: number;
    startStep: number;
    durationSteps: number;
  }> {
    const ROOTS: Record<string, number> = {
      I: 0,
      i: 0,
      II: 2,
      ii: 2,
      III: 4,
      iii: 4,
      IV: 5,
      iv: 5,
      V: 7,
      v: 7,
      VI: 9,
      vi: 9,
      VII: 11,
      vii: 11,
    };
    const INTERVALS: Record<string, number[]> = {
      maj7: [0, 4, 7, 11],
      "7": [0, 4, 7, 10],
      m7: [0, 3, 7, 10],
      maj9: [0, 4, 7, 11, 14],
      m9: [0, 3, 7, 10, 14],
      m11: [0, 3, 7, 10, 14, 17],
      "7sus4": [0, 5, 7, 10],
      "7alt": [0, 4, 7, 10, 14],
      "13": [0, 4, 7, 10, 14, 17],
      sus2: [0, 2, 7],
      sus4: [0, 5, 7],
    };

    const match = chord.match(/^([IViv]+)(.*)$/);
    if (!match) return [];
    const rootName = match[1];
    const qualifier = match[2];
    const root = ROOTS[rootName];
    if (root === undefined) return [];

    const intervals = INTERVALS[qualifier] || [0, 4, 7]; // default triad
    const baseNote = 48 + root; // C3 base
    const stepStart = position * 16;

    return intervals.map((interval, i) => ({
      note: baseNote + interval,
      velocity: 80 + (i === 0 ? 20 : 0), // root note slightly louder
      startStep: stepStart,
      durationSteps: i === intervals.length - 1 ? 16 : 14, // let ring
    }));
  }

  // ── Comp Take Preview & Export ─────────────────────────

  /** ID of the currently previewing take (for play/stop toggle) */
  previewingTakeId = signal<string | null>(null);

  /** Current audio buffer source for the decode fallback. */
  private previewSource: AudioBufferSourceNode | null = null;
  /** Streaming preview element: comp takes are already compressed blobs. */
  private previewElement: HTMLAudioElement | null = null;
  private previewMediaSource: MediaElementAudioSourceNode | null = null;
  private previewObjectUrl: string | null = null;
  private previewRequest = 0;

  /**
   * Preview a comp take through the audio engine.
   *
   * MediaRecorder gives us an encoded take, so decoding it to an AudioBuffer
   * just to audition it duplicates the whole performance in the JS heap. Keep
   * the compressed blob moving through a media element and route it into the
   * master bus instead; only fall back to decode if the host cannot do that.
   */
  async previewCompTake(take: CompTake) {
    this.haptic.light();

    // Stop if already previewing this take
    if (this.previewingTakeId() === take.id) {
      this.stopCompTakePreview();
      return;
    }

    // Stop any current preview
    this.stopCompTakePreview();
    const request = ++this.previewRequest;

    const canStream =
      typeof Audio !== "undefined" &&
      typeof this.audioEngine.ctx.createMediaElementSource === "function";
    if (canStream) {
      const url = take.blob ? URL.createObjectURL(take.blob) : take.url;
      this.previewObjectUrl = take.blob ? url : null;
      if (url) {
        try {
          const element = new Audio(url);
          element.preload = "auto";
          const mediaSource = this.audioEngine.ctx.createMediaElementSource(element);
          mediaSource.connect(this.audioEngine.masterGain);

          this.previewElement = element;
          this.previewMediaSource = mediaSource;
          element.onended = () => {
            if (this.previewElement === element) this.stopCompTakePreview();
          };
          element.onerror = () => {
            if (this.previewElement !== element) return;
            this.stopCompTakePreview();
            this.snackbarService.error("Could not preview take");
          };

          await element.play();
          if (
            request === this.previewRequest &&
            this.previewElement === element
          ) {
            this.previewingTakeId.set(take.id);
          }
          return;
        } catch (e) {
          if (request !== this.previewRequest) return;
          this.logger.warn(
            "Streaming comp-take preview failed; falling back to decode",
            e,
          );
          this.stopCompTakePreview();
        }
      }
    }

    await this.previewCompTakeDecoded(take);
  }

  /** Fallback for hosts without MediaElementAudioSourceNode support. */
  private async previewCompTakeDecoded(take: CompTake): Promise<void> {
    const request = this.previewRequest;
    try {
      const ctx = this.audioEngine.ctx;
      let audioBuffer: AudioBuffer;

      if (take.blob) {
        const arrayBuffer = await take.blob.arrayBuffer();
        audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      } else if (take.url) {
        const response = await fetch(take.url);
        const arrayBuffer = await response.arrayBuffer();
        audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      } else {
        return;
      }
      if (request !== this.previewRequest) return;

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      // Route through master bus chain for consistent monitoring
      source.connect(this.audioEngine.masterGain);
      source.start(0);
      source.onended = () => {
        if (this.previewSource !== source) return;
        this.previewingTakeId.set(null);
        this.previewSource = null;
      };

      this.previewSource = source;
      this.previewingTakeId.set(take.id);
    } catch (e) {
      if (request !== this.previewRequest) return;
      this.logger.warn("Failed to preview comp take", e);
      this.snackbarService.error("Could not preview take");
    }
  }

  /** Stop current comp take preview and release its stream URL. */
  stopCompTakePreview() {
    this.previewRequest++;

    if (this.previewElement) {
      const element = this.previewElement;
      element.onended = null;
      element.onerror = null;
      try {
        element.pause();
        element.removeAttribute("src");
        element.load();
      } catch {
        /* element already torn down */
      }
      this.previewElement = null;
    }
    if (this.previewMediaSource) {
      this.previewMediaSource.disconnect();
      this.previewMediaSource = null;
    }
    if (this.previewObjectUrl) {
      URL.revokeObjectURL(this.previewObjectUrl);
      this.previewObjectUrl = null;
    }
    if (this.previewSource) {
      try {
        this.previewSource.stop();
      } catch {
        /* already stopped */
      }
      this.previewSource.disconnect();
      this.previewSource = null;
    }
    this.previewingTakeId.set(null);
  }

  /**
   * Bounce the active comp section into one WAV.
   *
   * "Export All Takes" hands back the raw passes; this is the finished comp —
   * every assigned segment from the take that plays it, with crossfaded joins.
   */
  async exportCompAssembly(): Promise<void> {
    this.haptic.light();
    const groupId = this.smartRecording.activeCompGroupId();
    if (!groupId || this.smartRecording.activeCompGroupTakes().length === 0) {
      this.snackbarService.info("No comp takes to bounce");
      return;
    }
    try {
      const blob = await this.smartRecording.renderCompAssembly(groupId);
      if (!blob) {
        this.snackbarService.info("No comp takes to bounce");
        return;
      }
      const section =
        this.smartRecording.activeCompGroup()?.sectionLabel ?? "comp";
      const projectName = (
        this.projectWorkspace.metadata()?.name || "smuve"
      ).replace(/[^a-zA-Z0-9_-]+/g, "_");
      const safeSection = section.replace(/[^a-zA-Z0-9_-]+/g, "_");
      this.downloadBlob(blob, `${projectName}_${safeSection}_comp.wav`);
      this.snackbarService.success(`Comp "${section}" bounced · WAV`);
      this.studioTelemetry.trackEvent(
        "comp_assembly_exported",
        {
          groupId,
          format: "wav",
          segments: this.smartRecording.compSegmentsForGroup(groupId).length,
        },
        true,
      );
    } catch (e) {
      this.studioTelemetry.trackEvent(
        "studio_error",
        {
          action: "comp_assembly_export",
          error: e instanceof Error ? e.message : "unknown",
        },
        false,
      );
      this.snackbarService.error("Comp export failed");
    }
  }

  /**
   * Export all comp takes as a single .zip download. Bundling into one file
   * avoids the browser's automatic-multi-download block that silently dropped
   * every take after the first in the old per-take loop.
   */
  async exportCompTakes(): Promise<void> {
    this.haptic.light();
    const groupId = this.smartRecording.activeCompGroupId();
    const takes = this.smartRecording.activeCompGroupTakes();
    if (!groupId || takes.length === 0) {
      this.snackbarService.info("No comp takes to export");
      return;
    }
    try {
      const entries: ZipEntry[] = [];
      for (const take of takes) {
        const bytes = await this.compTakeBytes(take);
        if (!bytes) continue;
        const safeLabel = (take.label || `Take ${take.takeNumber}`).replace(
          /[^\w\d-]+/g,
          "_",
        );
        entries.push({ name: `${safeLabel}.wav`, data: bytes });
      }
      if (entries.length === 0) {
        this.snackbarService.info("No take audio available");
        return;
      }
      const blob = buildZip(entries);
      const projectName = (
        this.projectWorkspace.metadata()?.name || "smuve_takes"
      ).replace(/[^a-zA-Z0-9_-]+/g, "_");
      this.downloadBlob(blob, `${projectName}_comp_takes.zip`);
      this.snackbarService.success(
        `Exported ${entries.length} take${entries.length === 1 ? "" : "s"} · ZIP`,
      );
      this.studioTelemetry.trackEvent(
        "comp_takes_exported",
        { count: entries.length, groupId, format: "zip" },
        true,
      );
    } catch (e) {
      this.studioTelemetry.trackEvent(
        "studio_error",
        {
          action: "comp_takes_export",
          error: e instanceof Error ? e.message : "unknown",
        },
        false,
      );
      this.snackbarService.error("Take export failed");
    }
  }

  /** Resolve a comp take to raw bytes (stored blob first, URL fetch fallback). */
  private async compTakeBytes(take: CompTake): Promise<Uint8Array | null> {
    if (take.blob) {
      return new Uint8Array(await take.blob.arrayBuffer());
    }
    if (take.url) {
      const response = await fetch(take.url);
      if (!response.ok) return null;
      return new Uint8Array(await response.arrayBuffer());
    }
    return null;
  }

  /** Helper: trigger a file download from a Blob */
  private downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ── Smart Sound ───────────────────────────────────────

  toggleSoundFavorites() {
    this.haptic.light();
    this.smartSound.showFavoritesOnly.update((v) => !v);
  }

  // ── MIDI Export (.mid) ───────────────────────────────────────

  /** Export all MIDI tracks as a Standard MIDI File (.mid) download */
  exportMidi() {
    this.haptic.light();
    try {
      const bpm = this.audioEngine.tempo();
      const projectName = (
        this.projectWorkspace.metadata()?.name || "S_M_U_V_E_Project"
      ).replace(/[^a-zA-Z0-9_-]/g, "_");

      // Convert music manager tracks to MidiTrackData
      const midiTracks: MidiTrackData[] = [];
      const tracks = this.musicManager.tracks();
      const endStep = this.exportService.interchangeEndStep();

      tracks.forEach((track) => {
        if (track.type === "audio" || track.type === "bus") return; // Skip audio/bus
        const notes = track.type === "drum"
          ? this.exportService.interchangeDrumNotes(track, endStep) : track.notes;
        if (notes.length === 0) {
          // Still include an empty track so arrangement is preserved
          midiTracks.push({
            name: track.name || "Untitled",
            notes: [],
            program: undefined,
          });
          return;
        }

        const midiNotes = notes.map((n) => {
          const ticksPerBeat = 480;
          const ticksPerStep = ticksPerBeat / 4; // 16th note = 120 ticks
          return {
            note: n.midi,
            velocity: Math.max(
              1,
              Math.min(127, Math.round((n.velocity ?? 0.8) * 127)),
            ),
            startTick: Math.max(0, Math.round(
              (n.step + (track.type === "drum" ? 0 : (n.microOffset ?? 0))) * ticksPerStep,
            )),
            durationTicks: Math.max(
              1,
              Math.round((n.length ?? 1) * ticksPerStep),
            ),
            channel: 0,
          };
        });

        midiTracks.push({
          name: track.name || "Untitled",
          notes: midiNotes,
          program: undefined,
        });
      });

      // Generate the .mid file
      const arrayBuffer = MidiWriter.toArrayBuffer(
        midiTracks,
        bpm,
        projectName,
      );
      const blob = new Blob([arrayBuffer], { type: "audio/midi" });
      this.downloadBlob(blob, `${projectName}.mid`);
      this.studioTelemetry.trackEvent(
        "midi_exported",
        { trackCount: midiTracks.length },
        true,
      );
      this.snackbarService.success(
        `MIDI exported — ${midiTracks.length} track(s)`,
      );
    } catch (e) {
      this.logger.warn("MIDI export failed", e);
      this.studioTelemetry.trackEvent(
        "midi_exported",
        { error: e instanceof Error ? e.message : "unknown" },
        false,
      );
      this.studioTelemetry.trackEvent(
        "studio_error",
        {
          action: "midi_export",
          error: e instanceof Error ? e.message : "unknown",
        },
        false,
      );
      this.snackbarService.error(
        "MIDI export failed. Check browser console for details.",
      );
    }
  }

  // ── Spectrum Analyzer ──────────────────────────────────────

  /** Start real-time frequency spectrum rendering from master analyser */
  startSpectrumAnalyzer() {
    this.stopSpectrumAnalyzer(); // avoid double-starts
    const analyser = this.audioEngine.masterAnalyser;
    if (!analyser) return;
    analyser.fftSize = 128;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      if (!this.showAiMixAssistant()) { this.spectrumRafId = null; return; }
      const canvas = this.spectrumCanvas?.nativeElement;
      if (!canvas) {
        this.spectrumRafId = requestAnimationFrame(render);
        return;
      }
      analyser.getByteFrequencyData(dataArray);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const barCount = bufferLength;
      const barW = Math.max(2, Math.floor((w - barCount) / barCount));
      const gap = Math.max(
        0,
        Math.floor((w - barCount * barW) / (barCount + 1)),
      );

      for (let i = 0; i < barCount; i++) {
        const val = dataArray[i] / 255;
        const barH = val * h;
        const x = gap + i * (barW + gap);
        const y = h - barH;

        // Gradient from teal-400 → teal-500 → orange at peaks
        const hue = 175 - val * 40; // 175=teal, 135=orange-ish
        ctx.fillStyle = `hsl(${hue}, 70%, ${45 + val * 25}%)`;
        ctx.fillRect(x, y, barW, barH);
      }

      this.spectrumRafId = requestAnimationFrame(render);
    };

    this.spectrumRafId = requestAnimationFrame(render);
  }

  /** Stop spectrum analyzer render loop */
  stopSpectrumAnalyzer() {
    if (this.spectrumRafId !== null) {
      cancelAnimationFrame(this.spectrumRafId);
      this.spectrumRafId = null;
    }
  }

  /**
   * Keyboard shortcut handler for the Studio module.
   * Returns true if handled, false to pass through.
   */
  handleKeyboardShortcut(event: KeyboardEvent): boolean {
    const ctrl = event.ctrlKey || event.metaKey;

    // Save
    if (ctrl && event.key === "s") {
      event.preventDefault();
      this.saveProject();
      return true;
    }

    // Export
    if (ctrl && event.key === "e") {
      event.preventDefault();
      this.exportProject();
      return true;
    }

    // Undo
    if (ctrl && event.key === "z" && !event.shiftKey) {
      event.preventDefault();
      this.history.undo();
      return true;
    }

    // Redo
    if (
      (ctrl && event.key === "Z") ||
      (ctrl && event.shiftKey && event.key === "z")
    ) {
      event.preventDefault();
      this.history.redo();
      return true;
    }

    // AI Assistant
    if (ctrl && event.key === "i") {
      event.preventDefault();
      this.toggleAiMixAssistant();
      return true;
    }

    return false;
  }
}
