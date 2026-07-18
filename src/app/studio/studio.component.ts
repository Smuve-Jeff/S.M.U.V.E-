import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  inject,
  signal,
  computed,
  effect,
  untracked,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AudioSessionService } from './audio-session.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { HardwareService } from '../services/hardware.service';
import { AiService } from '../services/ai.service';
import { UIService } from '../services/ui.service';
import { MusicManagerService } from '../services/music-manager.service';
import { ProjectService } from '../services/project.service';
import { HapticService } from '../services/haptic.service';
import { InteractionDialogService } from '../services/interaction-dialog.service';
import { ProjectTemplateService } from '../services/project-template.service';
import { AuthService } from '../services/auth.service';
import { CollaborationService } from '../services/collaboration.service';
import { SnackbarService } from '../services/snackbar.service';
import { LoggingService } from '../services/logging.service';

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
import { DjDeckComponent } from './dj-deck/dj-deck.component';
import { VocalSuiteComponent } from './vocal-suite/vocal-suite.component';
import { ChannelRackComponent } from './channel-rack/channel-rack.component';
import { EffectsRackUiComponent } from './effects-rack-ui/effects-rack-ui.component';
import { IdeasGeneratorService } from '../services/ideas-generator.service';
import { SoundBrowserComponent } from './sound-browser/sound-browser.component';
import { SynthesizerComponent } from './synthesizer/synthesizer.component';
import { SoundPadGridComponent } from './sound-pad-grid/sound-pad-grid.component';
import { AudioRecorderViewComponent } from './audio-recorder-view/audio-recorder-view.component';
import { SampleLibraryComponent } from './sample-library/sample-library.component';

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
  | 'synthesizer';
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
]);
function isStudioView(value: string): value is StudioView {
  return (PATH_STUDIO_VIEWS as ReadonlySet<string>).has(value);
}

/** 3-way theme storage key. Persists across sessions. */
const THEME_STORAGE_KEY = 'smuve_studio_theme';
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
    DjDeckComponent,
    VocalSuiteComponent,
    ChannelRackComponent,
    EffectsRackUiComponent,
    SoundBrowserComponent,
    SynthesizerComponent,
    SoundPadGridComponent,
    AudioRecorderViewComponent,
    SampleLibraryComponent,
  ],
  templateUrl: './studio.component.html',
  styleUrls: ['./studio.component.css'],
})
export class StudioComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild(SnackbarComponent) snackbar?: SnackbarComponent;
  @ViewChild(SearchOverlayComponent) searchOverlay?: SearchOverlayComponent;

  // ---- Services (public for templates) ----
  public readonly audioSession = inject(AudioSessionService);
  public readonly audioEngine = inject(AudioEngineService);
  public hardware = inject(HardwareService);
  collaboration = inject(CollaborationService);
  public readonly uiService = inject(UIService);
  public readonly musicManager = inject(MusicManagerService);
  public readonly aiService = inject(AiService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private projectService = inject(ProjectService);
  private readonly haptic = inject(HapticService);
  private readonly dialog = inject(InteractionDialogService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly logger = inject(LoggingService);
  public readonly templateService = inject(ProjectTemplateService);    // ---- State ----
  activeView = signal<StudioView>('arrangement');
  mobilePanel = signal<MobileStudioPanel | null>(null);
  showAIAssistant = false; // legacy
  showAiAssistant = signal(false);
  showNeuralFoundry = signal(false);
  crossLinkAnnouncement = signal<string>('');
  private lastConsumedCrossLinkTimestamp = 0;
  browserDrawerOpen = signal(false);
  headerCollapsed = signal(false);
  footerCollapsed = signal(false);
  mobileDrawerOpen = signal(false);
  browserCollapsed = signal(false);
  inspectorCollapsed = signal(false);
  railCollapsed = signal(false);

  /**
   * 3-way theme model — replaces the old binary isDarkMode.
   * Persisted in localStorage; applied via <body> class.
   */
  themeMode = signal<AppTheme>('light');
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
    { id: 'sound-browser', label: 'Sound Browser', icon: 'queue_music' },
    { id: 'sound-pad', label: 'Sound Pad', icon: 'grid_on' },
    { id: 'synthesizer', label: 'Synthesizer', icon: 'waves' },
    { id: 'sample-library', label: 'Sample Library', icon: 'library_music' },
    { id: 'audio-recorder', label: 'Recorder', icon: 'mic_external_on' },
    {
      id: 'performer',
      label: 'Performer',
      icon: 'piano_off',
      hidden: !this.uiService.isCompactMobile(),
    },
  ]);

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      const view = params.get('view');
      if (view && isStudioView(view)) this.activeView.set(view);
    });

    // Restore 3-way theme preference from localStorage
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) as AppTheme | null;
      if (stored && (THEME_ORDER as string[]).includes(stored)) {
        this.themeMode.set(stored);
        document.body.classList.add(stored + '-mode');
      }
    } catch {
      // localStorage unavailable — ignore
    }

    // ── Theme effect — sync body class for all 3 modes ──
    effect(() => {
      const theme = this.themeMode();
      try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch { /* ignore */ }
      document.body.classList.remove('light-mode', 'focus-mode', 'dark-mode');
      document.body.classList.add(theme + '-mode');
    });

    // ── Audio arming: install one-time pointerdown/keydown listener ──
    // Runs at studio start. On the user's first gesture anywhere, the
    // AudioContext is resumed. Idempotent — safe to call repeatedly.
    this.audioEngine.armOnFirstUserGesture();

    // ── Cross-link router ──
    effect(() => {
      const req = this.musicManager.crossLinkRequest();
      if (!req || req.timestamp <= this.lastConsumedCrossLinkTimestamp) return;
      this.lastConsumedCrossLinkTimestamp = req.timestamp;
      untracked(() => {
        const trackName =
          this.musicManager
            .tracks()
            .find((t) => t.id === req.trackId)?.name || 'selected track';
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

  ngOnInit() {
    try {
      // Try to resume immediately (works on first server-side render or
      // if browser is already primed). Failure here is harmless —
      // the pointerdown listener installed in the constructor will
      // take over the moment the user interacts.
      this.audioEngine.resume();
    } catch (e) {
      // silent — fallback handled by armOnFirstUserGesture()
    }

    // ── Seed an empty studio with a starter recipe ──
    // If the user opens Studio fresh and tracks() is empty, we apply
    // a curated 4-bar starter so the FIRST Play click produces audio.
    if (this.musicManager.tracks().length === 0) {
      const ideas = inject(IdeasGeneratorService);
      const first = ideas.recipes?.[0];
      if (first) {
        this.musicManager.applyGeneratedRecipe(first);
      } else {
        // Fallback — newProject auto-populates piano + drums.
        this.musicManager.newProject(false);
      }
    }

    this.route.queryParamMap.subscribe((params) => {
      const sessionId = params.get('sessionId');
      if (sessionId && !this.collaboration.currentSession()) {
        const user = this.authService.currentUser();
        if (user) {
          this.collaboration.joinSession(sessionId, user);
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
  }

  ngAfterViewInit() {
    this.activeView();
  }

  ngOnDestroy() {}

  // ── Theme cycle: Light → Focus → Dark → Light ─────────────────
  cycleTheme() {
    this.haptic.light();
    this.themeMode.update((current) => {
      const idx = THEME_ORDER.indexOf(current);
      const nextIdx = (idx + 1) % THEME_ORDER.length;
      const next = THEME_ORDER[nextIdx];
      this.snackbarService.info(`Theme · ${THEME_LABEL[next]} mode`);
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

  setActiveView(view: StudioView) {
    this.mobileDrawerOpen.set(false);
    this.activeView.set(view);
    this.mobilePanel.set(null);
    this.haptic.light();
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
      .then(() => this.snackbarService.success('Studio link copied to clipboard'))
      .catch(() => this.snackbarService.error('Could not copy link'));
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
      this.snackbarService.success('New session created');
    }
  }

  applyTemplate(id: string) {
    this.templateService.applyTemplate(id);
    this.closeMobilePanel();
    this.snackbarService.success('Template applied');
    this.haptic.medium();
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
    }
  }

  toggleNeuralFoundry() {
    this.haptic.light();
    this.showNeuralFoundry.update((v) => !v);
  }
}
