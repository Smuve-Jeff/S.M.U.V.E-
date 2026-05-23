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
import { TransportBarComponent } from './transport-bar/transport-bar.component';
import { MixerComponent } from './mixer/mixer.component';
import { DjDeckComponent } from './dj-deck/dj-deck.component';
import { ArrangementViewComponent } from './arrangement-view/arrangement-view.component';
import { PianoRollComponent } from './piano-roll/piano-roll.component';
import { MasteringSuiteComponent } from './mastering-suite/mastering-suite.component';
import { AudioSessionService } from './audio-session.service';
import { MusicManagerService } from '../services/music-manager.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { ChannelRackComponent } from './channel-rack/channel-rack.component';
import { AiService as NeuralOrchestratorService } from '../services/ai.service';
import { UIService } from '../services/ui.service';
import { NotificationService } from '../services/notification.service';
import { DrumMachineComponent } from './drum-machine/drum-machine.component';
import { AiCopilotService } from './ai-copilot.service';
import { HapticService } from '../services/haptic.service';
import { TouchGestureService } from '../services/touch-gesture.service';
import { PerformerComponent } from './performer/performer.component';
import { SoundBrowserComponent } from './sound-browser/sound-browser.component';
import { TrackInspectorComponent } from './track-inspector/track-inspector.component';

type StudioView =
  | 'dj'
  | 'piano-roll'
  | 'mixer'
  | 'performance'
  | 'mastering'
  | 'drum-machine'
  | 'performer';

const PATH_STUDIO_VIEWS = new Set<StudioView>([
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
    TransportBarComponent,
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
  public readonly audioSession = inject(AudioSessionService);
  public readonly audioEngine = inject(AudioEngineService);
  public readonly neuralOrchestrator = inject(NeuralOrchestratorService);
  public readonly uiService = inject(UIService);
  private readonly notificationService = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  public readonly musicManager = inject(MusicManagerService);
  public readonly profileService = inject(UserProfileService);
  private readonly aiCopilot = inject(AiCopilotService);
  private readonly haptic = inject(HapticService);
  public readonly touchGestures = inject(TouchGestureService);

  private destroy$ = new Subject<void>();

  activeView = signal<StudioView>('dj');
  showNeuralFoundry = signal(false);

  studioQualityClass = computed(() => {
    return this.audioEngine.performanceTier() === 'ultra' ? 'studio-ultra' : 'studio-perf';
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
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view },
      queryParamsHandling: 'merge',
    });
  }

  toggleNeuralFoundry() {
    this.showNeuralFoundry.update((v) => !v);
  }
}
