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

type StudioView =
  | 'arrangement'
  | 'dj'
  | 'piano-roll'
  | 'mixer'
  | 'performance'
  | 'mastering'
  | 'drum-machine'
  | 'channel-rack'
  | 'performer';
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
  'performer',
]);
function isStudioView(value: string): value is StudioView {
  return (PATH_STUDIO_VIEWS as ReadonlySet<string>).has(value);
}

const DARK_MODE_STORAGE_KEY = 'smuve_dark_mode';

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
  public readonly templateService = inject(ProjectTemplateService);

  // ---- State ----
  activeView = signal<StudioView>('arrangement');
  mobilePanel = signal<MobileStudioPanel | null>(null);
  showAIAssistant = false; // legacy
  showAiAssistant = signal(false);
  showNeuralFoundry = signal(false);
  crossLinkAnnouncement = signal<string>('');
  private lastConsumedCrossLinkTimestamp = 0;
  browserDrawerOpen = signal(false);
  headerCollapsed = signal(false);
  mobileDrawerOpen = signal(false);
  browserCollapsed = signal(false);
  inspectorCollapsed = signal(false);
  railCollapsed = signal(false);

  /** Dark mode toggle — persisted in localStorage, applied to <body> */
  isDarkMode = signal(false);

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

  bottomNavItems = computed(() => [
    { id: 'arrangement', label: 'Arrange', icon: 'view_quilt' },
    { id: 'piano-roll', label: 'Piano', icon: 'piano' },
    { id: 'drum-machine', label: 'Drums', icon: 'grid_view' },
    { id: 'mixer', label: 'Mix', icon: 'tune' },
    { id: 'performance', label: 'Perform', icon: 'interpreter_mode' },
  ]);

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      const view = params.get('view');
      if (view && isStudioView(view)) this.activeView.set(view);
    });

    // Restore dark mode preference from localStorage
    try {
      const stored = localStorage.getItem(DARK_MODE_STORAGE_KEY);
      if (stored === 'true') {
        this.isDarkMode.set(true);
        document.body.classList.add('dark-mode');
      }
    } catch {
      // localStorage unavailable — ignore
    }

    // ── Dark mode effect — sync body class ──
    effect(() => {
      const dark = this.isDarkMode();
      try {
        localStorage.setItem(DARK_MODE_STORAGE_KEY, String(dark));
      } catch { /* ignore */ }
      if (dark) {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }
    });

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
      this.audioEngine.resume();
    } catch (e) {
      if (this.snackbarService) {
        // do not toast for engine resume issues
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

  // ── Dark mode toggle ─────────────────────────────────────────
  toggleDarkMode() {
    this.haptic.light();
    this.isDarkMode.update((v) => !v);
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
