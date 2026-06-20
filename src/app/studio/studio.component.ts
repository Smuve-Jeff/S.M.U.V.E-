import { UserProfileService } from '../services/user-profile.service';
import {
  Component,
  inject,
  signal,
  effect,
  computed,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { UniversalMasterComponent } from './master-controls/universal-master/universal-master.component';
import { MixerComponent } from './mixer/mixer.component';
import { DjDeckComponent } from './dj-deck/dj-deck.component';
import { ArrangementViewComponent } from './arrangement-view/arrangement-view.component';
import { PianoRollComponent } from './piano-roll/piano-roll.component';
import { MasteringSuiteComponent } from './mastering-suite/mastering-suite.component';
import { AudioSessionService } from './audio-session.service';
import { MusicManagerService } from '../services/music-manager.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { ChannelRackComponent } from './channel-rack/channel-rack.component';
import { AiService } from '../services/ai.service';
import { UIService } from '../services/ui.service';
import { ProjectTemplateService } from '../services/project-template.service';
import { NotificationService } from '../services/notification.service';
import { DrumMachineComponent } from './drum-machine/drum-machine.component';
import { AiCopilotService } from './ai-copilot.service';
import { HapticService } from '../services/haptic.service';
import { TouchGestureService } from '../services/touch-gesture.service';
import { PerformerComponent } from './performer/performer.component';
import { SoundBrowserComponent } from './sound-browser/sound-browser.component';
import { TrackInspectorComponent } from './track-inspector/track-inspector.component';
import { SequencerService } from './sequencer.service';
import { InteractionDialogService } from '../services/interaction-dialog.service';
import { BottomNavComponent, BottomNavItem } from './shared/bottom-nav/bottom-nav.component';
import { FabComponent } from './shared/fab/fab.component';
import { SnackbarComponent } from './shared/snackbar/snackbar.component';
import { SearchOverlayComponent } from './shared/search-overlay/search-overlay.component';
import { OfflineIndicatorComponent } from './shared/offline-indicator/offline-indicator.component';
import { SnackbarService } from '../services/snackbar.service';
import { EnhancedTouchGestureService } from '../services/enhanced-touch-gesture.service';

type StudioView =
  | 'arrangement'
  | 'dj'
  | 'piano-roll'
  | 'mixer'
  | 'performance'
  | 'mastering'
  | 'drum-machine'
  | 'performer';

type MobileStudioPanel = 'browser' | 'inspector';

const PATH_STUDIO_VIEWS = new Set<StudioView>([
  'arrangement',
  'dj',
  'piano-roll',
  'mixer',
  'performance',
  'mastering',
  'drum-machine',
  'performer',
]);

function isStudioView(value: string): value is StudioView {
  return (PATH_STUDIO_VIEWS as ReadonlySet<string>).has(value);
}

@Component({
  selector: 'app-studio',
  standalone: true,
  imports: [
    CommonModule,
    UniversalMasterComponent,
    MixerComponent,
    DjDeckComponent,
    ArrangementViewComponent,
    PianoRollComponent,
    MasteringSuiteComponent,
    ChannelRackComponent,
    DrumMachineComponent,
    PerformerComponent,
    SoundBrowserComponent,
    TrackInspectorComponent,
    BottomNavComponent,
    FabComponent,
    SnackbarComponent,
    SearchOverlayComponent,
    OfflineIndicatorComponent,
  ],
  templateUrl: './studio.component.html',
  styleUrls: ['./studio.component.css'],
})
export class StudioComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild(SnackbarComponent) snackbar?: SnackbarComponent;
  @ViewChild(SearchOverlayComponent) searchOverlay?: SearchOverlayComponent;
  
  private readonly beatsPerBar = 4;
  public readonly audioSession = inject(AudioSessionService);
  public readonly audioEngine = inject(AudioEngineService);
  public readonly neuralOrchestrator = inject(AiService);
  public readonly uiService = inject(UIService);
  private readonly notificationService = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  public readonly musicManager = inject(MusicManagerService);
  public readonly profileService = inject(UserProfileService);
  private readonly aiCopilot = inject(AiCopilotService);
  private readonly haptic = inject(HapticService);
  public readonly touchGestures = inject(TouchGestureService);
  private readonly enhancedGestures = inject(EnhancedTouchGestureService);
  private readonly sequencer = inject(SequencerService);
  private readonly dialog = inject(InteractionDialogService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly templateService = inject(ProjectTemplateService);

  private destroy$ = new Subject<void>();

  activeView = signal<StudioView>('arrangement');
  mobilePanel = signal<MobileStudioPanel | null>(null);
  showNeuralFoundry = signal(false);
  headerCollapsed = signal(false);
  mobileDrawerOpen = signal(false);
  browserCollapsed = signal(false);
  inspectorCollapsed = signal(false);

  studioQualityClass = computed(() => {
    return this.audioEngine.performanceTier() === 'ultra'
      ? 'studio-ultra'
      : 'studio-perf';
  });

  currentBar = computed(() => {
    const stepsPerBar = this.audioEngine.stepsPerBeat() * this.beatsPerBar;
    return Math.floor(this.musicManager.currentStep() / stepsPerBar) + 1;
  });

  // Bottom Nav Items
  bottomNavItems = computed<BottomNavItem[]>(() => [
    { id: 'arrangement', label: 'Arrange', icon: 'view_quilt' },
    { id: 'piano-roll', label: 'Piano', icon: 'piano' },
    { id: 'drum-machine', label: 'Drums', icon: 'grid_view' },
    { id: 'mixer', label: 'Mix', icon: 'tune' },
    { id: 'performance', label: 'Perform', icon: 'interpreter_mode' },
  ]);

  // FAB visibility based on view
  showFab = computed(() => {
    const view = this.activeView();
    return ['arrangement', 'piano-roll', 'drum-machine'].includes(view);
  });

  fabIcon = computed(() => {
    const view = this.activeView();
    if (view === 'arrangement') return 'add';
    if (view === 'piano-roll') return 'edit_note';
    if (view === 'drum-machine') return 'album';
    return 'add';
  });

    constructor() {
    // Listen to query param changes reactively
    this.route.queryParamMap.subscribe(params => {
      const view = params.get('view');
      if (view && isStudioView(view)) {
        this.activeView.set(view);
      }
    });
  }

  ngOnInit() {
    // Initial view resolution from route
    const initialView = this.route.snapshot.queryParamMap.get('view');
    if (initialView && isStudioView(initialView)) {
      this.activeView.set(initialView);
    }

    this.audioEngine.resume();
  }

  ngAfterViewInit() {}

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();

    // Clean up resize listeners to prevent memory leaks
    if (this.onPointerMove) {
      window.removeEventListener('pointermove', this.onPointerMove);
      this.onPointerMove = null;
    }
    if (this.onPointerUp) {
      window.removeEventListener('pointerup', this.onPointerUp);
      this.onPointerUp = null;
    }
    this.resizingPanel = null;
    document.body.style.cursor = 'default';
  }

  setActiveView(view: StudioView) {
    this.mobileDrawerOpen.set(false);
    this.activeView.set(view);
    this.mobilePanel.set(null);
    
    // Haptic feedback on view change
    this.haptic.light();
    
    // Show snackbar notification
    const viewNames: Record<StudioView, string> = {
      'arrangement': 'Arrangement View',
      'piano-roll': 'Piano Roll',
      'drum-machine': 'Drum Machine',
      'mixer': 'Mixer',
      'performance': 'Performance Mode',
      'mastering': 'Mastering Suite',
      'dj': 'DJ Deck',
      'performer': 'Performer'
    };
    
    this.snackbarService.info(`Switched to ${viewNames[view]}`);
    
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view },
      queryParamsHandling: 'merge',
    });
  }

  onBottomNavClick(viewId: string) {
    if (isStudioView(viewId)) {
      this.setActiveView(viewId);
    }
  }

  onFabClick() {
    const view = this.activeView();
    this.haptic.medium();
    
    if (view === 'arrangement') {
      this.addTrack();
    } else if (view === 'piano-roll') {
      this.snackbarService.info('Draw mode activated', 'OK');
    } else if (view === 'drum-machine') {
      this.snackbarService.info('New pattern created', 'UNDO');
    }
  }

  async newProject() {
    this.musicManager.newProject();
    const template = this.templateService.templates[0];
    if (template) {
      this.templateService.applyTemplate(template.id);
      this.snackbarService.success('New project initialized: ' + template.name);
    }
  }

  addTrack() {
    this.snackbarService.success('Track added successfully', 'UNDO');
  }

  private toggleSignal(s: ReturnType<typeof signal<boolean>>) {
    this.haptic.light();
    s.update(v => !v);
  }

  toggleMobilePanel(panel: MobileStudioPanel) {
    this.haptic.light();
    this.mobilePanel.update((current) => (current === panel ? null : panel));
  }

  closeMobilePanel() {
    this.mobilePanel.set(null);
  }

  toggleHeader() { this.toggleSignal(this.headerCollapsed); }
  toggleMobileDrawer() { this.toggleSignal(this.mobileDrawerOpen); }

  openSearch() {
    this.haptic.light();
    this.searchOverlay?.show();
  }

  async adjustBpm() {
    const result = await this.dialog.prompt({
      title: 'Adjust Tempo',
      message: 'Enter new BPM (20-300):',
      initialValue: this.audioEngine.tempo().toString(),
      placeholder: '124'
    });

    if (result) {
      const val = parseInt(result, 10);
      if (!isNaN(val) && val >= 20 && val <= 300) {
        this.audioEngine.tempo.set(val);
        this.haptic.medium();
        this.snackbarService.success(`Tempo set to ${val} BPM`);
      } else {
        this.snackbarService.error('Invalid BPM value');
      }
    }
  }

  handleImport(event: any) {
    const file = event.target.files?.[0];
    if (file) {
      this.musicManager.importProject(file);
      this.snackbarService.success('Project imported successfully');
      this.haptic.medium();
    }
    event.target.value = '';
  }

  browserWidth = signal(260);
  inspectorWidth = signal(300);

  private resizingPanel: 'browser' | 'inspector' | null = null;
  private onPointerMove: ((event: PointerEvent) => void) | null = null;
  private onPointerUp: (() => void) | null = null;

  startResizing(event: PointerEvent, panel: 'browser' | 'inspector') {
    event.preventDefault();
    this.resizingPanel = panel;
    this.haptic.light();

    this.onPointerMove = (moveEvent: PointerEvent) => {
    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!this.resizingPanel) return;

      if (this.resizingPanel === 'browser') {
        const newWidth = Math.max(120, Math.min(600, moveEvent.clientX));
        this.browserWidth.set(newWidth);
        if (newWidth < 160) this.browserCollapsed.set(true);
        else if (this.browserCollapsed()) this.browserCollapsed.set(false);
      } else {
        const newWidth = Math.max(120, Math.min(600, window.innerWidth - moveEvent.clientX));
        this.inspectorWidth.set(newWidth);
        if (newWidth < 160) this.inspectorCollapsed.set(true);
        else if (this.inspectorCollapsed()) this.inspectorCollapsed.set(false);
      }
    };

    this.onPointerUp = () => {
      this.resizingPanel = null;
      if (this.onPointerMove) {
        window.removeEventListener('pointermove', this.onPointerMove);
        this.onPointerMove = null;
      }
      if (this.onPointerUp) {
        window.removeEventListener('pointerup', this.onPointerUp);
        this.onPointerUp = null;
      }
      document.body.style.cursor = 'default';
    };

    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    const onPointerUp = () => {
      this.resizingPanel = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      document.body.style.cursor = 'default';
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    document.body.style.cursor = 'col-resize';
  }

  toggleBrowser() { this.toggleSignal(this.browserCollapsed); }
  toggleInspector() { this.toggleSignal(this.inspectorCollapsed); }
  toggleNeuralFoundry() { this.toggleSignal(this.showNeuralFoundry); }
}

}
