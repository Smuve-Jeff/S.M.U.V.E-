import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  inject,
  signal,
  computed,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { AudioSessionService } from './audio-session.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { AiService } from '../services/ai.service';
import { UIService } from '../services/ui.service';
import { NotificationService } from '../services/notification.service';
import { MusicManagerService } from '../services/music-manager.service';
import { UserProfileService } from '../services/user-profile.service';
import { AiCopilotService } from './ai-copilot.service';
import { HapticService } from '../services/haptic.service';
import { TouchGestureService } from '../services/touch-gesture.service';
import { SequencerService } from './sequencer.service';
import { InteractionDialogService } from '../services/interaction-dialog.service';
import { ProjectTemplateService } from '../services/project-template.service';

import { UniversalMasterComponent } from './master-controls/universal-master/universal-master.component';
import { MixerComponent } from './mixer/mixer.component';
import { DjDeckComponent } from './dj-deck/dj-deck.component';
import { ArrangementViewComponent } from './arrangement-view/arrangement-view.component';
import { PianoRollComponent } from './piano-roll/piano-roll.component';
import { MasteringSuiteComponent } from './mastering-suite/mastering-suite.component';
import { ChannelRackComponent } from './channel-rack/channel-rack.component';
import { DrumMachineComponent } from './drum-machine/drum-machine.component';
import { PerformerComponent } from './performer/performer.component';
import { SoundBrowserComponent } from './sound-browser/sound-browser.component';
import { TrackInspectorComponent } from './track-inspector/track-inspector.component';
import { EffectsRackUiComponent } from './effects-rack-ui/effects-rack-ui.component';
import { BottomNavComponent } from './shared/bottom-nav/bottom-nav.component';
import { FabComponent } from './shared/fab/fab.component';
import { SnackbarComponent } from './shared/snackbar/snackbar.component';
import { SearchOverlayComponent } from './shared/search-overlay/search-overlay.component';
import { OfflineIndicatorComponent } from './shared/offline-indicator/offline-indicator.component';
import { SnackbarService } from '../services/snackbar.service';
import { EnhancedTouchGestureService } from '../services/enhanced-touch-gesture.service';

type StudioView = 'arrangement' | 'dj' | 'piano-roll' | 'mixer' | 'performance' | 'mastering' | 'drum-machine' | 'channel-rack' | 'performer';
type MobileStudioPanel = 'browser' | 'inspector' | 'fx-rack' | 'templates';

const PATH_STUDIO_VIEWS = new Set<StudioView>(['arrangement','dj','piano-roll','mixer','performance','mastering','drum-machine','channel-rack','performer']);
function isStudioView(value: string): value is StudioView { return (PATH_STUDIO_VIEWS as ReadonlySet<string>).has(value); }

@Component({
  selector: 'app-studio',
  standalone: true,
  imports: [
    CommonModule, FormsModule, UniversalMasterComponent, MixerComponent, DjDeckComponent,
    ArrangementViewComponent, PianoRollComponent, MasteringSuiteComponent, ChannelRackComponent,
    DrumMachineComponent, PerformerComponent, SoundBrowserComponent, TrackInspectorComponent,
    EffectsRackUiComponent, BottomNavComponent, FabComponent, SnackbarComponent,
    SearchOverlayComponent, OfflineIndicatorComponent,
  ],
  templateUrl: './studio.component.html',
  styleUrls: ['./studio.component.css'],
})
export class StudioComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild(SnackbarComponent) snackbar?: SnackbarComponent;
  @ViewChild(SearchOverlayComponent) searchOverlay?: SearchOverlayComponent;
  
  public readonly audioSession = inject(AudioSessionService);
  public readonly audioEngine = inject(AudioEngineService);
  public readonly uiService = inject(UIService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  public readonly musicManager = inject(MusicManagerService);
  public readonly haptic = inject(HapticService);
  private readonly dialog = inject(InteractionDialogService);
  private readonly snackbarService = inject(SnackbarService);
  public readonly templateService = inject(ProjectTemplateService);

  activeView = signal<StudioView>('arrangement');
  mobilePanel = signal<MobileStudioPanel | null>(null);
  showNeuralFoundry = signal(false);
  browserDrawerOpen = signal(false);
  headerCollapsed = signal(false);
  mobileDrawerOpen = signal(false);
  browserCollapsed = signal(false);
  inspectorCollapsed = signal(false);

  studioQualityClass = computed(() => {
    return this.audioEngine.performanceTier() === 'ultra' ? 'studio-ultra' : 'studio-perf';
  });

  currentBar = computed(() => Math.floor(this.audioEngine.visualStep() / 16) + 1);

  bottomNavItems = computed(() => [
    { id: 'arrangement', label: 'Arrange', icon: 'view_quilt' },
    { id: 'piano-roll', label: 'Piano', icon: 'piano' },
    { id: 'drum-machine', label: 'Drums', icon: 'grid_view' },
    { id: 'mixer', label: 'Mix', icon: 'tune' },
    { id: 'performance', label: 'Perform', icon: 'interpreter_mode' },
  ]);

  constructor() {
    this.route.queryParamMap.subscribe(params => {
      const view = params.get('view');
      if (view && isStudioView(view)) this.activeView.set(view);
    });
  }

  ngOnInit() {
    this.audioEngine.resume();
  }

  ngAfterViewInit() {}
  ngOnDestroy() {}

  setActiveView(view: StudioView) {
    this.mobileDrawerOpen.set(false);
    this.activeView.set(view);
    this.mobilePanel.set(null);
    this.haptic.light();
    this.router.navigate([], { relativeTo: this.route, queryParams: { view }, queryParamsHandling: 'merge' });
  }

  onBottomNavClick(viewId: string) { if (isStudioView(viewId)) this.setActiveView(viewId); }

  async newProject() {
    const confirmed = await this.dialog.confirm({
       title: 'New Professional Session',
       message: 'Are you sure? Unsaved changes will be lost.',
       confirmLabel: 'CREATE',
       cancelLabel: 'CANCEL'
    });
    if (confirmed) {
       this.toggleMobilePanel('templates');
    }
  }

  applyTemplate(id: string) {
    this.templateService.applyTemplate(id);
    this.closeMobilePanel();
    this.snackbarService.success('Elite session initialized from template');
    this.haptic.medium();
  }

  toggleMobilePanel(panel: MobileStudioPanel) {
    this.haptic.light();
    this.mobilePanel.update((current) => (current === panel ? null : panel));
  }

  closeMobilePanel() { this.mobilePanel.set(null); }
  toggleMobileDrawer() { this.haptic.light(); this.mobileDrawerOpen.update(v => !v); }

  async adjustBpm() {
    const result = await this.dialog.prompt({
      title: 'Adjust Tempo',
      message: 'Enter new BPM (20-300):',
      initialValue: this.audioEngine.tempo().toString()
    });
    if (result) {
      const val = parseInt(result, 10);
      if (!isNaN(val) && val >= 20 && val <= 300) {
        this.audioEngine.tempo.set(val);
        this.snackbarService.success(`Tempo set to ${val} BPM`);
      }
    }
  }

  browserWidth = signal(260);
  inspectorWidth = signal(300);
  toggleBrowser() { this.haptic.light(); this.browserCollapsed.update(v => !v); }
  toggleInspector() { this.haptic.light(); this.inspectorCollapsed.update(v => !v); }
  toggleNeuralFoundry() { this.haptic.light(); this.showNeuralFoundry.update(v => !v); }
}
