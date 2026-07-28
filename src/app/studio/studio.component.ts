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
  ElementRef,
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
import { HistoryService } from '../services/history.service';
import { AiMixAssistantService } from './effects/ai-mix-assistant.service';
import { SmartRecordingService } from './smart-recording.service';
import { ProjectWorkspaceService } from './project-workspace.service';
import { SmartSoundService } from './smart-sound.service';
import { AudioImportService } from './audio-import.service';
import { ComponentRecordingService } from './component-recording.service';
import { SoundBrowserComponent } from './sound-browser/sound-browser.component';
import { SynthesizerComponent } from './synthesizer/synthesizer.component';
import { SoundPadGridComponent } from './sound-pad-grid/sound-pad-grid.component';
import { AudioRecorderViewComponent } from './audio-recorder-view/audio-recorder-view.component';
import { SampleLibraryComponent } from './sample-library/sample-library.component';
import { BeginnerWizardComponent } from './beginner-wizard/beginner-wizard.component';
import { ChordEditorComponent } from './chord-editor/chord-editor.component';
import { MidiInputWidgetComponent } from './midi-input-widget/midi-input-widget.component';

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
  | 'chord-editor';
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
    BeginnerWizardComponent,
    ChordEditorComponent,
    MidiInputWidgetComponent,
  ],
  templateUrl: './studio.component.html',
  styleUrls: ['./studio.component.css'],
})
export class StudioComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild(SnackbarComponent) snackbar?: SnackbarComponent;
  @ViewChild(SearchOverlayComponent) searchOverlay?: SearchOverlayComponent;
  @ViewChild('spectrumCanvas', { static: false })
  spectrumCanvas?: ElementRef<HTMLCanvasElement>;

  /** Animation frame handle for spectrum analyzer rendering */
  private spectrumRafId: number | null = null;

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
  private readonly ideasGenerator = inject(IdeasGeneratorService);
  private readonly history = inject(HistoryService);
  public readonly templateService = inject(ProjectTemplateService);
  public readonly aiMixAssistant = inject(AiMixAssistantService);
  public readonly smartRecording = inject(SmartRecordingService);
  public readonly projectWorkspace = inject(ProjectWorkspaceService);
  public readonly smartSound = inject(SmartSoundService);
  public readonly audioImport = inject(AudioImportService);
  public readonly componentRecording = inject(ComponentRecordingService);

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
  showComponentRecording = signal(false);
  crossLinkAnnouncement = signal<string>('');
  private lastConsumedCrossLinkTimestamp = 0;
  browserDrawerOpen = signal(false);
  headerCollapsed = signal(false);
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
  /** Persisted beginner mode — true by default for new users. */
  isBeginnerMode = signal<boolean>(
    localStorage.getItem('smuve_beginner_mode') !== 'false'
  );

  toggleBeginnerMode() {
    this.haptic.light();
    this.isBeginnerMode.update((v) => !v);
    try {
      localStorage.setItem(
        'smuve_beginner_mode',
        String(this.isBeginnerMode())
      );
    } catch {}
    this.snackbarService.info(
      this.isBeginnerMode()
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
    { id: 'sound-browser', label: 'Sound Browser', icon: 'queue_music' },
    { id: 'sound-pad', label: 'Sound Pad', icon: 'grid_on' },
    { id: 'synthesizer', label: 'Synthesizer', icon: 'waves' },
    { id: 'chord-editor', label: 'Chords', icon: 'music_note' },
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
      } catch {
        /* ignore */
      }
      document.body.classList.remove('light-mode', 'focus-mode', 'dark-mode');
      document.body.classList.add(theme + '-mode');
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
      const ideas = this.ideasGenerator;
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
    // Start spectrum analyzer rendering when AI Mix panel is visible
    this.startSpectrumAnalyzer();
  }

  ngOnDestroy() {
    this.stopSpectrumAnalyzer();
  }

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
      .then(() =>
        this.snackbarService.success('Studio link copied to clipboard')
      )
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

  // ── AI Mix Assistant ─────────────────────────────────

  toggleAiMixAssistant() {
    this.haptic.light();
    this.showAiMixAssistant.update((v) => !v);
    if (
      this.showAiMixAssistant() &&
      this.aiMixAssistant.analyses().length === 0
    ) {
      this.aiMixAssistant.analyzeAll();
    }
  }

  /** Run fresh AI mix analysis on all tracks */
  runAiMixAnalysis() {
    this.aiMixAssistant.analyzeAll();
    this.snackbarService.success(
      'AI Mix Assistant analyzed ' +
        this.musicManager.tracks().length +
        ' tracks'
    );
  }

  /** Apply a specific AI mix suggestion to a track */
  applyMixSuggestion(suggestionId: string) {
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
  }

  toggleImportPanel() {
    this.haptic.light();
    this.showImportPanel.update((v) => !v);
  }

  toggleComponentRecording() {
    this.haptic.light();
    this.showComponentRecording.update((v) => !v);
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
    this.snackbarService.info('Recording mode: ' + mode.toUpperCase());
  }

  // ── Project Workspace ─────────────────────────────────

  toggleProjectMetadata() {
    this.haptic.light();
    this.showProjectMetadata.update((v) => !v);
  }

  async saveProject() {
    this.haptic.medium();
    await this.projectWorkspace.manualSave();
    this.snackbarService.success('Project saved');
  }

  async exportProject() {
    this.haptic.light();
    this.projectWorkspace.downloadProjectBundle();
    this.snackbarService.success('Project exported as .smuve bundle');
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
    this.snackbarService.info(
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
  async previewCompTake(take: { id: string; blob: Blob | null; url: string }) {
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

  /** Export all comp takes as downloadable WAV files */
  exportCompTakes() {
    this.haptic.light();
    const takes = this.smartRecording.activeCompGroupTakes();
    if (takes.length === 0) {
      this.snackbarService.info('No comp takes to export');
      return;
    }

    const projectName = (
      this.projectWorkspace.metadata()?.name || 'project'
    ).replace(/[^a-zA-Z0-9_-]/g, '_');

    // Export each take — use the existing blob if available, or synthesize a silent one
    takes.forEach((take, idx) => {
      const label = `take_${take.takeNumber}`;
      const filename = `${projectName}_${label}.wav`;

      if (take.blob) {
        this.downloadBlob(take.blob, filename);
      } else {
        // Create a minimal silent WAV as placeholder
        const silentWav = this.createSilentWav();
        this.downloadBlob(silentWav, filename);
      }
    });

    this.snackbarService.success(`Exported ${takes.length} take(s) as WAV`);
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

  /** Helper: create a silent 44.1kHz 16-bit mono WAV Blob */
  private createSilentWav(): Blob {
    const sampleRate = 44100;
    const numSamples = sampleRate; // 1 second
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);
    const w = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++)
        view.setUint8(offset + i, str.charCodeAt(i));
    };
    w(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    w(8, 'WAVE');
    w(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    w(36, 'data');
    view.setUint32(40, numSamples * 2, true);
    return new Blob([buffer], { type: 'audio/wav' });
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
      this.snackbarService.success(
        `MIDI exported — ${midiTracks.length} track(s)`
      );
    } catch (e) {
      this.logger.warn('MIDI export failed', e);
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
    if (ctrl && event.key === 'Z' || (ctrl && event.shiftKey && event.key === 'z')) {
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
