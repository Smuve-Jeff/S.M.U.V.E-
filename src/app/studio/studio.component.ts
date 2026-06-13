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
  ],
  templateUrl: './studio.component.html',
  styleUrls: ['./studio.component.css'],
})
export class StudioComponent implements OnInit, OnDestroy, AfterViewInit {
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
  private readonly sequencer = inject(SequencerService);
  private readonly dialog = inject(InteractionDialogService);

  private destroy$ = new Subject<void>();

  activeView = signal<StudioView>('arrangement');
  mobilePanel = signal<MobileStudioPanel | null>(null);
  showNeuralFoundry = signal(false);
  headerCollapsed = signal(false);

  studioQualityClass = computed(() => {
    return this.audioEngine.performanceTier() === 'ultra'
      ? 'studio-ultra'
      : 'studio-perf';
  });

  currentBar = computed(() => {
    const stepsPerBar = this.audioEngine.stepsPerBeat() * this.beatsPerBar;
    return Math.floor(this.musicManager.currentStep() / stepsPerBar) + 1;
  });

  constructor() {
    effect(() => {
      const params = this.route.snapshot.queryParamMap;
      const view = params.get('view');
      if (view && isStudioView(view)) {
        this.activeView.set(view);
      }
    });
  }

  ngOnInit() {
    this.audioEngine.resume();
  }

  ngAfterViewInit() {}

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setActiveView(view: StudioView) {
    this.activeView.set(view);
    this.mobilePanel.set(null);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view },
      queryParamsHandling: 'merge',
    });
  }

  toggleMobilePanel(panel: MobileStudioPanel) {
    this.mobilePanel.update((current) => (current === panel ? null : panel));
  }

  closeMobilePanel() {
    this.mobilePanel.set(null);
  }

  toggleHeader() {
    this.headerCollapsed.update((v) => !v);
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
      }
    }
  }

  handleImport(event: any) {
    const file = event.target.files?.[0];
    if (file) {
      this.musicManager.importProject(file);
    }
    event.target.value = '';
  }

  toggleNeuralFoundry() {
    this.showNeuralFoundry.update((v) => !v);
  }
}
