import {
  Component,
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
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { MidiWriter, MidiTrackData } from './midi-writer.util';

import { AudioSessionService } from './audio-session.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { HardwareService } from '../services/hardware.service';
import { AiService } from '../services/ai.service';
import { UIService } from '../services/ui.service';
import {
  MusicManagerService,
  type TrackNote,
} from '../services/music-manager.service';
import { ProjectService } from '../services/project.service';
import { HapticService } from '../services/haptic.service';
import { InteractionDialogService } from '../services/interaction-dialog.service';
import { ProjectTemplateService } from '../services/project-template.service';
import { AuthService } from '../services/auth.service';
import { CollaborationService } from '../services/collaboration.service';
import { SnackbarService } from '../services/snackbar.service';
import { LoggingService } from '../services/logging.service';
import {
  UserProfileService,
  type UserProfile,
} from '../services/user-profile.service';

import { MixerComponent } from './mixer/mixer.component';
import { ArrangementViewComponent } from './arrangement-view/arrangement-view.component';
import { PianoRollComponent } from './piano-roll/piano-roll.component';
import { MasteringSuiteComponent } from './mastering-suite/mastering-suite.component';
import { DrumMachineComponent } from './drum-machine/drum-machine.component';
import { PerformerComponent } from './performer/performer.component';
import { TransportBarComponent } from './transport-bar/transport-bar.component';
import { SnackbarComponent } from './shared/snackbar/snackbar.component';
import { SearchOverlayComponent } from './shared/search-overlay/search-overlay.component';
import { AiAssistantComponent } from './shared/ai-assistant/ai-assistant.component';
import { AiProduceComponent } from '../components/ai-produce/ai-produce.component';
import { DjDeckComponent } from './dj-deck/dj-deck.component';
import { VocalSuiteComponent } from './vocal-suite/vocal-suite.component';
import { ChannelRackComponent } from './channel-rack/channel-rack.component';
import { EffectsRackUiComponent } from './effects-rack-ui/effects-rack-ui.component';
import { IdeasGeneratorService } from '../services/ideas-generator.service';
import { HistoryService } from '../services/history.service';
import { AiMixAssistantService } from './effects/ai-mix-assistant.service';
import {
  SmartRecordingService,
  type CompTake,
} from './smart-recording.service';
import { ProjectWorkspaceService } from './project-workspace.service';
import { SmartSoundService } from './smart-sound.service';
import { AudioImportService } from './audio-import.service';
import { SmartProductionFoundationsService } from './smart-production-foundations.service';
import { ComponentRecordingService } from './component-recording.service';
import { SoundBrowserComponent } from './sound-browser/sound-browser.component';
import { SynthesizerComponent } from './synthesizer/synthesizer.component';
import { SoundPadGridComponent } from './sound-pad-grid/sound-pad-grid.component';
import { AudioRecorderViewComponent } from './audio-recorder-view/audio-recorder-view.component';
import { SampleLibraryComponent } from './sample-library/sample-library.component';
import { BeginnerWizardComponent } from './beginner-wizard/beginner-wizard.component';
import { ChordEditorComponent } from './chord-editor/chord-editor.component';
import { MidiInputWidgetComponent } from './midi-input-widget/midi-input-widget.component';
import { SamplerComponent } from './sampler/sampler.component';
import {
  PerformanceModeComponent,
  PerformancePad,
} from './performance-mode/performance-mode.component';
import { VocalCompViewComponent } from './vocal-comp-view/vocal-comp-view.component';
import { BezierEditorComponent } from './automation/bezier-editor.component';
import { ScoreViewComponent } from './score-view/score-view.component';
import { PluginStoreComponent } from './plugin-store/plugin-store.component';
import { WaveformRendererComponent } from './waveform-renderer/waveform-renderer.component';
import {
  StudioCoachAction,
  StudioCoachActionId,
  StudioTelemetryService,
} from './studio-telemetry.service';
import { AudioEngineLatencyService } from '../services/audio-engine-latency.service';
import { StudioOrchestrationService } from '../services/studio-orchestration.service';
import { buildZip, type ZipEntry } from './zip.util';

type StudioView =
  | 'arrangement'
  | 'dj'
  | 'piano-roll'
  | 'mixer'
  | 'performance'
  | 'mastering'
  | 'drum-machine'
  | 'channel-rack'
  | 'vocal-suite'
  | 'effects-rack'
  | 'performer'
  | 'audio-recorder'
  | 'sample-library'
  | 'sound-browser'
  | 'sound-pad'
  | 'synthesizer'
  | 'chord-editor'
  | 'sampler'
  | 'score'
  | 'plugins'
  | 'ai-produce';
type MobileStudioPanel = 'browser' | 'inspector' | 'fx-rack' | 'templates';

const PATH_STUDIO_VIEWS = new Set<StudioView>([
  'arrangement',
  'dj',
  'piano-roll',
  'mixer',
  'performance',
  'mastering',
  'drum-machine',
  'channel-rack',
  'vocal-suite',
  'effects-rack',
  'performer',
  'audio-recorder',
  'sample-library',
  'sound-browser',
  'sound-pad',
  'synthesizer',
  'chord-editor',
  'sampler',
  'score',
  'plugins',
  'ai-produce',
]);
function isStudioView(value: string): value is StudioView {
  return (PATH_STUDIO_VIEWS as ReadonlySet<string>).has(value);
}

/** 3-way theme storage key. Persists across sessions. */
const THEME_STORAGE_KEY = 'smuve_studio_theme';
/** Stage FX ambience (aurora / marquee / sheens) storage key. */
const STAGE_FX_STORAGE_KEY = 'smuve_stage_fx';
type AppTheme = 'light' | 'focus' | 'dark';
const THEME_ORDER: AppTheme[] = ['light', 'focus', 'dark'];
const NEXT_THEME_ICON: Record<AppTheme, string> = {
  light: 'filter_drama',
  focus: 'dark_mode',
  dark: 'light_mode',
};
const THEME_LABEL: Record<AppTheme, string> = {
  light: 'LIGHT',
  focus: 'FOCUS',
  dark: 'DARK',
};

@Component({
  selector: 'app-studio',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MixerComponent,
    ArrangementViewComponent,
    PianoRollComponent,
    MasteringSuiteComponent,
    DrumMachineComponent,
    PerformerComponent,
    TransportBarComponent,
    SnackbarComponent,
    SearchOverlayComponent,
    AiAssistantComponent,
    AiProduceComponent,
    DjDeckComponent,
    VocalSuiteComponent,
    ChannelRackComponent,
    EffectsRackUiComponent,
    SoundBrowserComponent,
    SynthesizerComponent,
    SoundPadGridComponent,
    AudioRecorderViewComponent,
    SampleLibraryComponent,
    BeginnerWizardComponent,
    ChordEditorComponent,
    MidiInputWidgetComponent,
    SamplerComponent,
    PerformanceModeComponent,
    VocalCompViewComponent,
    BezierEditorComponent,
    ScoreViewComponent,
    PluginStoreComponent,
    WaveformRendererComponent,
  ],
  templateUrl: './studio.component.html',
  styleUrls: [
    './studio.component.css',
    './studio-shell-refinement.css',
    './stage-2.0-atmosphere.css',
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
          background: linear-gradient(135deg, rgba(251, 247, 236, 0.98), rgba(230, 245, 244, 0.92));
          box-shadow: 0 10px 24px rgba(61, 53, 42, 0.08);
          overflow: hidden;
        }
        .comp-mobile-start-copy {
          display: grid;
          gap: 4px;
        }
        .comp-mobile-start-kicker {
          color: var(--stage-teal, #0e7c7b);
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.14em;
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
        .comp-mobile-start-actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          position: relative;
          z-index: 1;
          gap: 8px;
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
          transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
        }
        .comp-mobile-start-action:active {
          transform: scale(0.98);
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
        .comp-mobile-start-primary {
          border-color: rgba(14, 124, 123, 0.32);
          background: linear-gradient(135deg, rgba(14, 124, 123, 0.14), rgba(255, 255, 255, 0.72));
        }
      }
      @media (max-width: 390px) {
        .comp-mobile-start {
          padding: 12px;
        }
        .comp-mobile-start-actions {
          gap: 6px;
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
  @ViewChild('fileInput', { static: false }) fileInput?: ElementRef<HTMLInputElement>;
  @ViewChild(SnackbarComponent) snackbar?: SnackbarComponent;
  @ViewChild(SearchOverlayComponent) searchOverlay?: SearchOverlayComponent;
  @ViewChild('spectrumCanvas', { static: false })
  spectrumCanvas?: ElementRef<HTMLCanvasElement>;

  /** Animation frame handle for spectrum analyzer rendering */
  private spectrumRafId: number | null = null;

  /** Used to create effects from lifecycle hooks (injection context). */
  private readonly injector = inject(Injector);

  // ---- Services (public for templates) ----
  public readonly audioSession = inject(AudioSessionService);
  public readonly audioEngine = inject(AudioEngineService);
  public hardware = inject(HardwareService);
  collaboration = inject(CollaborationService);
  public readonly uiService = inject(UIService);
  public readonly musicManager = inject(MusicManagerService);
  public readonly aiService = inject(AiService);
  private readonly authService = inject(AuthService);
  private readonly userProfile = inject(UserProfileService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private projectService = inject(ProjectService);
  private readonly haptic = inject(HapticService);
  private readonly dialog = inject(InteractionDialogService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly logger = inject(LoggingService);
  private readonly ideasGenerator = inject(IdeasGeneratorService);
  private readonly history = inject(HistoryService);
  public readonly templateService = inject(ProjectTemplateService);
  public readonly aiMixAssistant = inject(AiMixAssistantService);
  public readonly smartRecording = inject(SmartRecordingService);
  public readonly projectWorkspace = inject(ProjectWorkspaceService);
  public readonly smartSound = inject(SmartSoundService);
  public readonly audioImport = inject(AudioImportService);
  public readonly smartProduction = inject(SmartProductionFoundationsService);
  public readonly componentRecording = inject(ComponentRecordingService);
  public readonly studioTelemetry = inject(StudioTelemetryService);
  public readonly engineLatency = inject(AudioEngineLatencyService);
  public readonly orchestration = inject(StudioOrchestrationService);

  // ---- State ----
  activeView = signal<StudioView>('arrangement');
  mobilePanel = signal<MobileStudioPanel | null>(null);
  showAIAssistant = false; // legacy
  showAiAssistant = signal(false);
  showNeuralFoundry = signal(false);
  showAiMixAssistant = signal(false);
  showProjectMetadata = signal(false);
  showSmartRecordingPanel = signal(false);
  showImportPanel = signal(false);
  importSnapEnabled = signal(true);
  importWaveformZoom = signal(1);
  showComponentRecording = signal(false);
  showStudioInsights = signal(false);
  showProjectMenu = signal(false);
  toggleProjectMenu() { this.showProjectMenu.update(v => !v); }
  /** True while an Insights engine probe is in-flight. */
  insightsProbeRunning = signal(false);

  // ── Bezier editor state ──────────────────────────────────
  showBezierEditor = signal(false);
  bezierLaneId = signal<string>('');

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

  selectedImportWaveform(): Float32Array | null {
    const audio = this.audioImport.selectedAudio();
    if (!audio) return null;
    const source = audio.buffer.getChannelData(0);
    const zoom = Math.max(1, this.importWaveformZoom());
    if (zoom === 1) return source;
    const length = Math.max(256, Math.floor(source.length / zoom));
    return source.subarray(0, length);
  }

  onBezierCurveChanged(curve: any): void {
    this.snackbarService.info('Bezier curve applied to automation lane');
  }
  crossLinkAnnouncement = signal<string>('');

  // ── Performance Pads ────────────────────────────────────
  performancePads = signal<PerformancePad[]>([
    { id: 1, name: 'KICK', type: 'one-shot', isPlaying: false },
    { id: 2, name: 'SNARE', type: 'one-shot', isPlaying: false },
    { id: 3, name: 'HAT', type: 'one-shot', isPlaying: false },
    { id: 4, name: 'CLAP', type: 'one-shot', isPlaying: false },
    { id: 5, name: 'BASS', type: 'loop', isPlaying: false },
    { id: 6, name: 'CHORD', type: 'loop', isPlaying: false },
    { id: 7, name: 'LEAD', type: 'loop', isPlaying: false },
    { id: 8, name: 'FX', type: 'one-shot', isPlaying: false },
  ]);

  onPerformancePadClicked(pad: PerformancePad): void {
    this.haptic.medium();
    // Toggle playing state
    this.performancePads.update((pads) =>
      pads.map((p) => (p.id === pad.id ? { ...p, isPlaying: !p.isPlaying } : p))
    );
    // Trigger a note on the live engine
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
    const note = midiNotes[pad.name] || 48;
    if (!pad.isPlaying) {
      // Hit it — actually sound the pad through the live engine (one-shot).
      this.audioEngine.resume();
      try {
        const freq = 440 * Math.pow(2, (note - 69) / 12);
        const time = this.audioEngine.ctx?.currentTime ?? 0;
        this.audioEngine.playSynth?.(time, freq, 0.4, 0.9, 0, {
          type: 'sine',
        });
      } catch {
        // test mock / suspended context — the visual toggle still lands
      }
    }
    this.snackbarService.info(
      `Pad ${pad.isPlaying ? 'OFF' : 'HIT'}: ${pad.name}`
    );
  }
  private lastConsumedCrossLinkTimestamp = 0;
  browserDrawerOpen = signal(false);
  headerCollapsed = signal(false);
  studioWeeklyDashboard = computed(() =>
    this.studioTelemetry.weeklyDashboard()
  );
  /** True after the very first time this component has been constructed this browser. */
  firstNavigationSeen = signal(
    typeof localStorage !== 'undefined' &&
      localStorage.getItem('smuve_first_nav_seen') === 'true'
  );
  /**
   * Mark the first navigation as seen. Called once on construction so the
   * topbar staggered entrance animation only fires for the first load.
   */
  private markFirstNavigationSeen(): void {
    if (this.firstNavigationSeen()) return;
    this.firstNavigationSeen.set(true);
    try {
      localStorage.setItem('smuve_first_nav_seen', 'true');
    } catch {
      /* private mode / locked storage — degrade silently */
    }
  }
  footerCollapsed = signal(false);
  mobileDrawerOpen = signal(false);
  browserCollapsed = signal(false);
  inspectorCollapsed = signal(false);
  railCollapsed = signal(false);

  // ── Beginner Mode ─────────────────────────────────────
  /**
   * Cross-app beginner mode — the UIService owns the durable store
   * (profile settings + localStorage mirror) so the Hub's mobile
   * quick-start lanes and other views honor the same choice.
   */
  isBeginnerMode = this.uiService.beginnerMode;

  toggleBeginnerMode() {
    this.haptic.light();
    const next = !this.isBeginnerMode();
    this.uiService.setBeginnerMode(next);
    this.snackbarService.info(
      next
        ? 'Beginner Mode ON — simplified controls with tips'
        : 'Pro Mode ON — full studio controls'
    );
  }

  /** Navigate to a view from the beginner wizard */
  onWizardNavigate(view: string) {
    if (isStudioView(view)) {
      this.setActiveView(view);
    }
  }

  /** Navigate from wizard with a preset auto-load */
  onWizardLaunchWithPreset(payload: { view: string; preset: string }) {
    if (isStudioView(payload.view)) {
      this.setActiveView(payload.view);
    }
    // Auto-configure based on the preset type
    switch (payload.preset) {
      case 'house':
        // Auto-apply house drum style and set tempo
        this.audioEngine.tempo.set(124);
        this.snackbarService.info(
          'Beginner preset loaded: House beat at 124 BPM — tap Generate Style in the drum machine!'
        );
        break;
      case 'c-major-beginner':
        // Set a beginner-friendly tempo and notify
        this.audioEngine.tempo.set(100);
        this.snackbarService.info(
          'Beginner preset loaded: C Major scale locked at 100 BPM — try the white keys!'
        );
        break;
      case 'lofi-85':
        this.audioEngine.tempo.set(85);
        this.snackbarService.info(
          'Beginner preset loaded: Lo-Fi vibe at 85 BPM'
        );
        break;
      default:
        this.snackbarService.info('Preset loaded — explore and have fun!');
    }
  }

  /** Navigate back to the Hub home page */
  navigateHome() {
    this.haptic.light();
    this.router.navigate(['/hub']);
  }

  /**
   * 3-way theme model — replaces the old binary isDarkMode.
   * Persisted in localStorage; applied via <body> class.
   */
  themeMode = signal<AppTheme>('light');
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
  stageFxUserTouched =
    typeof localStorage !== 'undefined' &&
    localStorage.getItem(STAGE_FX_STORAGE_KEY) !== null;

  /** Compute the first-load Stage FX state (storage → motion pref → on). */
  private initialStageFxEnabled(): boolean {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(STAGE_FX_STORAGE_KEY);
        if (stored !== null) return stored !== 'off';
      }
      if (
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
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
    () => this.audioContextState() === 'suspended' && !this.userGestureSeen()
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
      typeof api.isPlaying === 'function' ? api.isPlaying() : false;
    return playing && !this.showArmAudioPip();
  });

  browserWidth = signal(260);
  inspectorWidth = signal(300);

  studioQualityClass = computed(() => {
    return this.audioEngine.performanceTier() === 'ultra'
      ? 'studio-ultra'
      : 'studio-perf';
  });

  currentBar = computed(
    () => Math.floor(this.audioEngine.visualStep() / 16) + 1
  );

  /**
   * Mobile bottom nav — capped at 4 main views + a "More" button.
   * "More" toggles the existing mobileDrawer which lists all 11 views.
   */
  bottomNavItems = computed(() => [
    { id: 'arrangement', label: 'Arrange', icon: 'view_quilt' },
    { id: 'piano-roll', label: 'Piano', icon: 'piano' },
    { id: 'drum-machine', label: 'Drums', icon: 'grid_view' },
    { id: 'mixer', label: 'Mix', icon: 'tune' },
  ]);

  /**
   * All 11 studio views — rendered in the mobile side drawer.
   * Desktop side rail uses the same list (scrollable on narrow screens).
   */
  allStudioViews = computed(() => [
    { id: 'arrangement', label: 'Arrange', icon: 'view_quilt' },
    { id: 'piano-roll', label: 'Piano Roll', icon: 'piano' },
    { id: 'drum-machine', label: 'Drum Machine', icon: 'grid_view' },
    { id: 'channel-rack', label: 'Channel Rack', icon: 'inventory_2' },
    { id: 'mixer', label: 'Mixer', icon: 'tune' },
    { id: 'effects-rack', label: 'Effects Rack', icon: 'magic_button' },
    { id: 'vocal-suite', label: 'Vocal Suite', icon: 'mic' },
    { id: 'dj', label: 'DJ Booth', icon: 'album' },
    { id: 'performance', label: 'Performance', icon: 'interpreter_mode' },
    { id: 'mastering', label: 'Mastering', icon: 'graphic_eq' },
    { id: 'ai-produce', label: 'AI Produce', icon: 'auto_awesome' },
    { id: 'sound-browser', label: 'Sound Browser', icon: 'queue_music' },
    { id: 'sound-pad', label: 'Sound Pad', icon: 'grid_on' },
    { id: 'synthesizer', label: 'Synthesizer', icon: 'waves' },
    { id: 'chord-editor', label: 'Chords', icon: 'music_note' },
    { id: 'sampler', label: 'Sampler', icon: 'library_music' },
    { id: 'score', label: 'Score', icon: 'music_note' },
    { id: 'sample-library', label: 'Sample Library', icon: 'library_music' },
    { id: 'plugins', label: 'Plugin Store', icon: 'extension' },
    { id: 'audio-recorder', label: 'Recorder', icon: 'mic_external_on' },
    {
      id: 'performer',
      label: 'Performer',
      icon: 'piano_off',
      hidden: !this.uiService.showMobileNav(),
    },
  ]);

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      const view = params.get('view');
      if (view && isStudioView(view)) this.activeView.set(view);
    });

    effect(() => {
      this.orchestration.setActiveStudioView(this.activeView());
    });

    // Restore 3-way theme preference from localStorage; fall back to the
    // cross-app profile theme (UIService) when no Studio-specific choice
    // was ever made, so Studio and Hub stay in agreement on first visit.
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) as AppTheme | null;
      if (stored && (THEME_ORDER as string[]).includes(stored)) {
        this.themeMode.set(stored);
        document.body.classList.add(stored + '-mode');
      } else {
        const profileTheme = this.uiService.activeTheme().name;
        const mapped: AppTheme = profileTheme === 'Light' ? 'light' : 'dark';
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
      document.body.classList.remove('light-mode', 'focus-mode', 'dark-mode');
      document.body.classList.add(theme + '-mode');
    });

    // ── Stage FX effect — sync body class so every view honors the toggle ──
    effect(() => {
      document.body.classList.toggle('stage-fx-off', !this.stageFxEnabled());
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
          typeof this.audioEngine.performanceTier === 'function'
            ? this.audioEngine.performanceTier()
            : 'ultra';
        if (
          tier === 'performance' &&
          !this.stageFxUserTouched &&
          this.stageFxEnabled()
        ) {
          this.stageFxEnabled.set(false);
          this.stageFxUserTouched = true;
          // Persist the adaptive choice so the live-sync effect (which reads
          // the profile) stays consistent instead of re-enabling ambience.
          this.persistStageFxState(false);
          this.snackbarService.info(
            'Stage FX OFF · adaptive low-power mode — tap FX to re-enable'
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
          typeof this.audioEngine.isPlaying === 'function'
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
          'selected track';
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
          `Opened Piano Roll for ${req.label || trackName}. The related notes are highlighted.`
        );
        setTimeout(() => this.crossLinkAnnouncement.set(''), 4500);
      });
    });
  }

  async ngOnInit() {
    this.studioTelemetry.beginSession({ entryView: this.activeView() });
    try {
      // Try to resume immediately (works on first server-side render or
      // if browser is already primed). Failure here is harmless —
      // the pointerdown listener installed in the constructor will
      // take over the moment the user interacts.
      this.audioEngine.resume();
    } catch (e) {
      // silent — fallback handled by armOnFirstUserGesture()
    }

    const restored = await this.projectWorkspace.restoreLatestProjectState();
    if (restored) {
      const source = this.projectWorkspace.lastRecoveredSource();
      this.snackbarService.info(
        `Restored ${this.formatPersistenceSource(source)} snapshot`
      );
      this.studioTelemetry.trackEvent(
        'project_recovered',
        { source: source ?? 'unknown' },
        true
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
          'starter_recipe_seeded',
          { source: 'ideas_generator' },
          true
        );
      } else {
        // Fallback — newProject auto-populates piano + drums.
        this.musicManager.newProject(false);
        this.studioTelemetry.trackEvent(
          'starter_recipe_seeded',
          { source: 'new_project_fallback' },
          true
        );
      }
    }

    this.route.queryParamMap.subscribe((params) => {
      const sessionId = params.get('sessionId');
      if (sessionId && !this.collaboration.currentSession()) {
        const user = this.authService.currentUser();
        if (user) {
          this.collaboration.joinSession(sessionId, user);
          this.studioTelemetry.trackEvent('collab_joined', { sessionId }, true);
          const projectHint = params.get('project');
          this.snackbarService.info(
            projectHint
              ? `JOINING SESSION: ${projectHint}`
              : 'JOINING COLLABORATION SESSION'
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
              `CONFLICT ON ${fresh.fieldKey.toUpperCase()} · ${source} edited the same field`
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
      (c) => c.surface === 'studio'
    )
  );

  /** A peer is "talking" when their voicePeers state is `connected` / `muted`
   *  OR (cheap proxy) when the local peerNet is mid-call with them. */
  isPeerTalking(userId: string): boolean {
    const peer = this.collaboration.voicePeers()[userId];
    if (!peer) return false;
    return peer.state === 'connected' || peer.state === 'muted';
  }

  /** Throttled-by-service mousemove handler — publishes normalized {x,y}. */
  @HostListener('mousemove', ['$event'])
  onStudioMouseMove(event: MouseEvent): void {
    const host = (event.currentTarget as HTMLElement) ?? null;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    this.collaboration.publishCursor('studio', x, y);
  }

  ngAfterViewInit() {
    this.activeView();
    // Start spectrum analyzer rendering when AI Mix panel is visible
    this.startSpectrumAnalyzer();
  }

  ngOnDestroy() {
    this.stopSpectrumAnalyzer();
    this.studioTelemetry.endSession('component_destroy');
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
      this.uiService.setTheme(next === 'dark' ? 'Dark' : 'Light');
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
        ? 'Stage FX ON — full ambient lighting'
        : 'Stage FX OFF — calm mode · saving battery & CPU'
    );
  }

  /**
   * Persist the FX state to both working stores: localStorage (the Studio
   * shell's immediate store) and the executive profile (Settings → Studio
   * Pro). The integration service applies it globally from the profile.
   */
  private persistStageFxState(enabled: boolean): void {
    try {
      localStorage.setItem(STAGE_FX_STORAGE_KEY, enabled ? 'on' : 'off');
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
  @HostListener('document:keydown', ['$event'])
  onStageFxShortcut(event: KeyboardEvent): void {
    if (event.key !== 'f' && event.key !== 'F') return;
    if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (event.repeat) return;
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
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
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return;
    }
    this.handleKeyboardShortcut(event);
  }

  setActiveView(view: StudioView) {
    if (this.mobileDrawerOpen()) {
      this.mobileDrawerOpen.set(false);
      this.syncPanelFocus('.comp-drawer', false);
    }
    this.activeView.set(view);
    this.mobilePanel.set(null);
    this.haptic.light();
    this.studioTelemetry.trackEvent('view_changed', { view }, true);
    if (view === 'plugins') {
      this.studioTelemetry.trackEvent('plugin_store_opened', { view }, true);
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view },
      queryParamsHandling: 'merge',
    });
  }

  onBottomNavClick(viewId: string) {
    if (isStudioView(viewId)) this.setActiveView(viewId);
  }

  copyShareLink() {
    if (!this.collaboration.can('share')) {
      this.snackbarService.error('Your session role does not allow sharing.');
      return;
    }
    const session = this.collaboration.currentSession();
    const sessionId = session?.sessionId;
    const project = this.projectService.currentProject();
    const baseUrl = window.location.origin + '/studio';

    const params = new URLSearchParams();
    if (sessionId) params.set('sessionId', sessionId);
    if (project?.name) params.set('project', project.name);

    const queryString = params.toString();
    const url = queryString ? `${baseUrl}?${queryString}` : baseUrl;

    navigator.clipboard
      .writeText(url)
      .then(() => {
        this.snackbarService.success('Studio link copied to clipboard');
        this.studioTelemetry.trackEvent(
          'share_link_copied',
          { hasSession: !!sessionId },
          true
        );
      })
      .catch(() => {
        this.snackbarService.error('Could not copy link');
        this.studioTelemetry.trackEvent(
          'share_link_copied',
          { hasSession: !!sessionId },
          false
        );
      });
  }

  async newProject() {
    const confirmed = await this.dialog.confirm({
      title: 'New Session',
      message: 'Start a fresh session? Unsaved changes will be lost.',
      confirmLabel: 'Create',
      cancelLabel: 'Cancel',
    });
    if (confirmed) {
      this.musicManager.newProject();
      this.projectWorkspace.startFreshProject({
        bpm: this.audioEngine.tempo(),
      });
      this.snackbarService.success('New session created');
      this.studioTelemetry.trackEvent('new_project_created', undefined, true);
    }
  }

  applyTemplate(id: string) {
    const template = this.templateService.templates.find(
      (item) => item.id === id
    );
    if (!template) return;
    this.templateService.applyTemplate(id);
    this.projectWorkspace.startFreshProject({
      name: template.name,
      bpm: template.bpm,
      genre: template.genre,
    });
    this.closeMobilePanel();
    this.snackbarService.success('Template applied');
    this.haptic.medium();
    this.studioTelemetry.trackEvent(
      'template_applied',
      { templateId: id },
      true
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
    this.syncPanelFocus('.comp-drawer', this.mobileDrawerOpen());
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
    if (typeof document === 'undefined') return;
    if (open) {
      const active = document.activeElement;
      if (active instanceof HTMLElement) this.panelTriggers.set(selector, active);
      setTimeout(() => {
        const panel = document.querySelector<HTMLElement>(selector);
        panel?.querySelector<HTMLElement>('button, input, select, textarea')?.focus();
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
      title: 'Adjust Tempo',
      message: 'Enter new BPM (20-300):',
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
      this.snackbarService.info('Left collaboration session');
      this.studioTelemetry.trackEvent('collab_left', undefined, true);
    } else {
      const user = this.authService.currentUser() || {
        id: 'anon',
        name: 'Anonymous',
      };
      this.collaboration.startSession(
        user as any,
        this.musicManager.snapshotProject()
      );
      this.snackbarService.success('Collaboration session started');
      this.studioTelemetry.trackEvent(
        'collab_started',
        { userId: user.id },
        true
      );
    }
  }

  toggleNeuralFoundry() {
    this.haptic.light();
    this.showNeuralFoundry.update((v) => !v);
  }

  // ── AI Mix Assistant ─────────────────────────────────

  toggleAiMixAssistant() {
    this.haptic.light();
    this.showAiMixAssistant.update((v) => !v);
    this.syncPanelFocus('.comp-aimix-panel', this.showAiMixAssistant());
    if (this.showAiMixAssistant()) {
      this.studioTelemetry.trackEvent('ai_mix_panel_opened', undefined, true);
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
    this.showStudioInsights.update((v) => !v);
    this.syncPanelFocus('.comp-insights-panel', this.showStudioInsights());
    if (this.showStudioInsights()) {
      this.studioTelemetry.trackEvent('insights_panel_opened', undefined, true);
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
          snap.contextState === 'running'
        );
      } catch {
        /* engine may be suspended / unavailable */
      }
    }
  }

  /** Humanize camelCase gap categories for the insights panel. */
  formatInsightCategory(category: string): string {
    return category
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (c) => c.toUpperCase())
      .trim();
  }

  /** Format 0..1 rates as whole percentages. */
  formatInsightPct(rate: number): string {
    return `${Math.round((rate || 0) * 100)}%`;
  }

  formatPersistenceSource(source: string | null): string {
    switch (source) {
      case 'autosave':
        return 'auto-save';
      case 'recovery':
        return 'background recovery';
      case 'import':
        return 'imported';
      case 'manual':
        return 'saved';
      default:
        return 'local';
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
        true
      );
      this.snackbarService.success(
        `Engine probe · ${Math.round(snap.totalLatencyMs)} ms · ×${bench.speedRatio.toFixed(2)} render`
      );
    } catch (e) {
      this.studioTelemetry.trackEvent(
        'studio_error',
        {
          action: 'latency_probe',
          error: e instanceof Error ? e.message : 'unknown',
        },
        false
      );
      this.snackbarService.error('Engine probe failed');
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
        case 'probe_latency':
          await this.runInsightsLatencyProbe();
          break;
        case 'seed_starter': {
          const recipe = this.ideasGenerator.recipes?.[0];
          if (recipe) {
            this.musicManager.applyGeneratedRecipe(recipe);
            this.studioTelemetry.trackEvent(
              'starter_recipe_seeded',
              { source: 'coach', recipeId: recipe.id },
              true
            );
            this.snackbarService.success(`Starter seeded · ${recipe.name}`);
          } else if (this.templateService.templates?.[0]) {
            this.applyTemplate(this.templateService.templates[0].id);
          }
          if (action.targetView && isStudioView(action.targetView)) {
            this.setActiveView(action.targetView);
          }
          break;
        }
        case 'start_collab':
          if (!this.collaboration.currentSession()) {
            this.toggleCollaboration();
          } else {
            this.snackbarService.info('Collab session already active');
          }
          break;
        case 'export_project':
          await this.exportProject();
          break;
        case 'open_ai_mix':
          if (!this.showAiMixAssistant()) {
            this.toggleAiMixAssistant();
          }
          break;
        case 'open_plugins':
          this.setActiveView('plugins');
          break;
        case 'share_link':
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
        'studio_error',
        {
          action: 'coach_action',
          coachId: id,
          error: e instanceof Error ? e.message : 'unknown',
        },
        false
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
    this.aiMixAssistant.analyzeAll();
    this.studioTelemetry.trackEvent(
      'ai_mix_analysis_run',
      { trackCount: this.musicManager.tracks().length },
      true
    );
    this.snackbarService.success(
      'AI Mix Assistant analyzed ' +
        this.musicManager.tracks().length +
        ' tracks'
    );
  }

  /** Apply a specific AI mix suggestion to a track */
  applyMixSuggestion(suggestionId: string) {
    if (!this.collaboration.can('edit')) {
      this.snackbarService.error(
        'Your session role is view-only for mix edits.'
      );
      return;
    }
    const suggestion = this.aiMixAssistant
      .suggestions()
      .find((s) => s.id === suggestionId);
    if (!suggestion) return;

    suggestion.action();
    this.snackbarService.info('Applied: ' + suggestion.label);
    this.haptic.light();
  }

  // ── Smart Recording ───────────────────────────────────

  toggleSmartRecordingPanel() {
    this.haptic.light();
    this.showSmartRecordingPanel.update((v) => !v);
    this.syncPanelFocus('.comp-rec-panel', this.showSmartRecordingPanel());
  }

  toggleImportPanel() {
    this.haptic.light();
    this.showImportPanel.update((v) => !v);
    this.syncPanelFocus('.comp-import-panel', this.showImportPanel());
  }

  toggleComponentRecording() {
    this.haptic.light();
    this.showComponentRecording.update((v) => !v);
    this.syncPanelFocus('.comp-rec-src-panel', this.showComponentRecording());
  }

  selectComponentRecording(component: any) {
    this.componentRecording.setActiveSource(component);
    this.snackbarService.info(
      'Recording source: ' +
        (this.componentRecording.getConfig(component)?.label || component)
    );
  }

  setRecordingMode(mode: 'normal' | 'punch' | 'comp') {
    this.smartRecording.setRecordingMode(mode);
    this.studioTelemetry.trackEvent('recording_mode_changed', { mode }, true);
    this.snackbarService.info('Recording mode: ' + mode.toUpperCase());
  }

  // ── Project Workspace ─────────────────────────────────

  toggleProjectMetadata() {
    this.haptic.light();
    this.showProjectMetadata.update((v) => !v);
    this.syncPanelFocus('.comp-meta-panel', this.showProjectMetadata());
  }

  async saveProject() {
    this.haptic.medium();
    try {
      await this.projectWorkspace.manualSave();
      this.snackbarService.success('Project saved');
      this.studioTelemetry.trackEvent('project_saved', undefined, true);
    } catch (e) {
      this.studioTelemetry.trackEvent(
        'studio_error',
        {
          action: 'project_save',
          error: e instanceof Error ? e.message : 'unknown',
        },
        false
      );
      throw e;
    }
  }

  triggerLoadProject() {
    const fileInput = this.fileInput?.nativeElement;
    if (fileInput) fileInput.click();
  }

  async loadProjectFile(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    
    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      const success = await this.projectWorkspace.importProjectBundle(bundle);
      if (success) {
        this.snackbarService.success('Project loaded successfully');
        this.studioTelemetry.trackEvent('project_imported', { format: 'smuve' }, true);
        
      } else {
        this.snackbarService.error('Failed to load project bundle');
      }
    } catch (e) {
      this.snackbarService.error('Invalid project file format');
    }
  }

  async exportProject() {
    this.haptic.light();
    try {
      this.projectWorkspace.downloadProjectBundle();
      this.snackbarService.success('Project exported as .smuve bundle');
      this.studioTelemetry.trackEvent(
        'project_exported',
        { format: 'smuve' },
        true
      );
    } catch (e) {
      this.studioTelemetry.trackEvent(
        'project_exported',
        { format: 'smuve', error: e instanceof Error ? e.message : 'unknown' },
        false
      );
      this.studioTelemetry.trackEvent(
        'studio_error',
        {
          action: 'project_export',
          error: e instanceof Error ? e.message : 'unknown',
        },
        false
      );
      throw e;
    }
  }

  setProjectGenre(genre: string) {
    this.projectWorkspace.setGenre(genre);
    this.snackbarService.info('Genre: ' + genre);
  }

  setProjectMood(mood: string) {
    this.projectWorkspace.updateMetadata({ mood });
    this.snackbarService.info('Mood: ' + mood);
  }

  setProjectKey(key: string) {
    this.projectWorkspace.updateMetadata({ key });
    this.snackbarService.info('Key: ' + key);
  }

  // ── AI Chord Suggestions ─────────────────────────────

  /** Selected genre for chord progression suggestions */
  chordGenre = signal<string>('pop');

  /** Available chord progression genres */
  chordGenres = [
    'neo-soul',
    'trap',
    'lo-fi',
    'house',
    'drill',
    'pop',
    'rnb',
    'deep-house',
    'dubstep',
    'ambient',
    'jazz',
    'funk',
    'reggaeton',
    'techno',
    'phonk',
    'garage',
  ];

  /** Computed chord progression based on selected genre */
  chordProgression = computed(() =>
    this.aiMixAssistant.suggestChordProgression(this.chordGenre())
  );

  /** Chord voicing type */
  chordVoicing = signal<'close' | 'open' | 'wide'>('close');

  /** Computed MIDI notes for the current voicing */
  voicingNotes = computed(() => {
    const progression = this.chordProgression();
    if (progression.length === 0) return [];
    const firstChord = progression[0];
    const notes = this.chordToNotes(firstChord, 0);
    if (notes.length === 0) return [];

    const baseNotes = notes.map((n) => n.note);
    const voicing = this.chordVoicing();

    if (voicing === 'close') return baseNotes;

    if (voicing === 'open') {
      // Open voicing: spread middle notes up an octave
      return [
        baseNotes[0], // root stays
        ...baseNotes.slice(1, -1).map((n) => n + 12), // middle up octave
        baseNotes[baseNotes.length - 1], // top stays
      ];
    }

    if (voicing === 'wide') {
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
        .find((t) => t.type === 'midi');
      trackId =
        midiTrack?.id ?? this.musicManager.addTrack('Chords', 'grand-piano');
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
    this.musicManager.replaceTrackNotes(trackId, [
      ...(existing?.notes ?? []),
      ...stamped,
    ]);
    this.musicManager.selectedTrackId.set(trackId);
    this.snackbarService.success(
      `Applied ${chord} — ${notes.length} notes at bar ${index + 1}`
    );
  }

  /** Convert a chord symbol (e.g. 'Imaj7') to MIDI notes */
  private chordToNotes(
    chord: string,
    position: number
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
      '7': [0, 4, 7, 10],
      m7: [0, 3, 7, 10],
      maj9: [0, 4, 7, 11, 14],
      m9: [0, 3, 7, 10, 14],
      m11: [0, 3, 7, 10, 14, 17],
      '7sus4': [0, 5, 7, 10],
      '7alt': [0, 4, 7, 10, 14],
      '13': [0, 4, 7, 10, 14, 17],
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

  /** Current audio buffer source for take preview */
  private previewSource: AudioBufferSourceNode | null = null;

  /** Preview a comp take through the audio engine */
  async previewCompTake(take: CompTake) {
    this.haptic.light();

    // Stop if already previewing this take
    if (this.previewingTakeId() === take.id) {
      this.stopCompTakePreview();
      return;
    }

    // Stop any current preview
    this.stopCompTakePreview();

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

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      // Route through master bus chain for consistent monitoring
      source.connect(this.audioEngine.masterGain);
      source.start(0);
      source.onended = () => {
        this.previewingTakeId.set(null);
        this.previewSource = null;
      };

      this.previewSource = source;
      this.previewingTakeId.set(take.id);
    } catch (e) {
      this.logger.warn('Failed to preview comp take', e);
      this.snackbarService.error('Could not preview take');
    }
  }

  /** Stop current comp take preview */
  stopCompTakePreview() {
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
   * Export all comp takes as a single .zip download. Bundling into one file
   * avoids the browser's automatic-multi-download block that silently dropped
   * every take after the first in the old per-take loop.
   */
  async exportCompTakes(): Promise<void> {
    this.haptic.light();
    const groupId = this.smartRecording.activeCompGroupId();
    const takes = this.smartRecording.activeCompGroupTakes();
    if (!groupId || takes.length === 0) {
      this.snackbarService.info('No comp takes to export');
      return;
    }
    try {
      const entries: ZipEntry[] = [];
      for (const take of takes) {
        const bytes = await this.compTakeBytes(take);
        if (!bytes) continue;
        const safeLabel = (take.label || `Take ${take.takeNumber}`).replace(
          /[^\w\d-]+/g,
          '_'
        );
        entries.push({ name: `${safeLabel}.wav`, data: bytes });
      }
      if (entries.length === 0) {
        this.snackbarService.info('No take audio available');
        return;
      }
      const blob = buildZip(entries);
      const projectName = (
        this.projectWorkspace.metadata()?.name || 'smuve_takes'
      ).replace(/[^a-zA-Z0-9_-]+/g, '_');
      this.downloadBlob(blob, `${projectName}_comp_takes.zip`);
      this.snackbarService.success(
        `Exported ${entries.length} take${entries.length === 1 ? '' : 's'} · ZIP`
      );
      this.studioTelemetry.trackEvent(
        'comp_takes_exported',
        { count: entries.length, groupId, format: 'zip' },
        true
      );
    } catch (e) {
      this.studioTelemetry.trackEvent(
        'studio_error',
        {
          action: 'comp_takes_export',
          error: e instanceof Error ? e.message : 'unknown',
        },
        false
      );
      this.snackbarService.error('Take export failed');
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
    const a = document.createElement('a');
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
        this.projectWorkspace.metadata()?.name || 'S_M_U_V_E_Project'
      ).replace(/[^a-zA-Z0-9_-]/g, '_');

      // Convert music manager tracks to MidiTrackData
      const midiTracks: MidiTrackData[] = [];
      const tracks = this.musicManager.tracks();

      tracks.forEach((track) => {
        if (track.type === 'audio' || track.type === 'bus') return; // Skip audio/bus
        if (track.notes.length === 0) {
          // Still include an empty track so arrangement is preserved
          midiTracks.push({
            name: track.name || 'Untitled',
            notes: [],
            program: undefined,
          });
          return;
        }

        const midiNotes = track.notes.map((n) => {
          const ticksPerBeat = 480;
          const ticksPerStep = ticksPerBeat / 4; // 16th note = 120 ticks
          return {
            note: n.midi,
            velocity: Math.max(
              1,
              Math.min(127, Math.round((n.velocity ?? 0.8) * 127))
            ),
            startTick: Math.round(
              n.step * ticksPerStep + (n.microOffset ?? 0) * ticksPerStep
            ),
            durationTicks: Math.max(
              1,
              Math.round((n.length ?? 1) * ticksPerStep)
            ),
            channel: 0,
          };
        });

        midiTracks.push({
          name: track.name || 'Untitled',
          notes: midiNotes,
          program: undefined,
        });
      });

      // Generate the .mid file
      const arrayBuffer = MidiWriter.toArrayBuffer(
        midiTracks,
        bpm,
        projectName
      );
      const blob = new Blob([arrayBuffer], { type: 'audio/midi' });
      this.downloadBlob(blob, `${projectName}.mid`);
      this.studioTelemetry.trackEvent(
        'midi_exported',
        { trackCount: midiTracks.length },
        true
      );
      this.snackbarService.success(
        `MIDI exported — ${midiTracks.length} track(s)`
      );
    } catch (e) {
      this.logger.warn('MIDI export failed', e);
      this.studioTelemetry.trackEvent(
        'midi_exported',
        { error: e instanceof Error ? e.message : 'unknown' },
        false
      );
      this.studioTelemetry.trackEvent(
        'studio_error',
        {
          action: 'midi_export',
          error: e instanceof Error ? e.message : 'unknown',
        },
        false
      );
      this.snackbarService.error(
        'MIDI export failed. Check browser console for details.'
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
      const canvas = this.spectrumCanvas?.nativeElement;
      if (!canvas) {
        this.spectrumRafId = requestAnimationFrame(render);
        return;
      }
      analyser.getByteFrequencyData(dataArray);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const barCount = bufferLength;
      const barW = Math.max(2, Math.floor((w - barCount) / barCount));
      const gap = Math.max(
        0,
        Math.floor((w - barCount * barW) / (barCount + 1))
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
    if (ctrl && event.key === 's') {
      event.preventDefault();
      this.saveProject();
      return true;
    }

    // Export
    if (ctrl && event.key === 'e') {
      event.preventDefault();
      this.exportProject();
      return true;
    }

    // Undo
    if (ctrl && event.key === 'z' && !event.shiftKey) {
      event.preventDefault();
      this.history.undo();
      return true;
    }

    // Redo
    if (
      (ctrl && event.key === 'Z') ||
      (ctrl && event.shiftKey && event.key === 'z')
    ) {
      event.preventDefault();
      this.history.redo();
      return true;
    }

    // AI Assistant
    if (ctrl && event.key === 'i') {
      event.preventDefault();
      this.toggleAiMixAssistant();
      return true;
    }

    return false;
  }
}
