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
import { TransportBarComponent } from './transport-bar/transport-bar.component';
import { MixerComponent } from './mixer/mixer.component';
import { DjDeckComponent } from './dj-deck/dj-deck.component';
import { ArrangementViewComponent } from './arrangement-view/arrangement-view.component';
import { PianoRollComponent } from './piano-roll/piano-roll.component';
import { MasteringSuiteComponent } from './mastering-suite/mastering-suite.component';
import { AudioSessionService } from './audio-session.service';
import { MusicManagerService } from '../services/music-manager.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { AiService as NeuralOrchestratorService } from '../services/ai.service';
import { UIService } from '../services/ui.service';
import { NotificationService } from '../services/notification.service';
import { VocalSuiteComponent } from './vocal-suite/vocal-suite.component';
import { DrumMachineComponent } from './drum-machine/drum-machine.component';
import { NeuralFoundryComponent } from '../neural-foundry/neural-foundry.component';
import { AiCopilotService } from './ai-copilot.service';

type StudioView =
  | 'dj'
  | 'piano-roll'
  | 'mixer'
  | 'performance'
  | 'mastering'
  | 'vocal-suite'
  | 'drum-machine';

const PATH_STUDIO_VIEWS = new Set<StudioView>([
  'dj',
  'piano-roll',
  'mixer',
  'performance',
  'mastering',
  'vocal-suite',
  'drum-machine',
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
    VocalSuiteComponent,
    DrumMachineComponent,
    NeuralFoundryComponent,
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

  activeView = signal<StudioView>('dj');
  showMixer = signal(true);
  showRack = signal(true);
  showPianoRoll = signal(false);
  activeEditor = signal<'piano-roll' | 'drum-machine'>('piano-roll');
  focusLocked = signal(false);
  showNeuralFoundry = signal(false);

  hasArrangementCoPilot = computed(() =>
    this.neuralOrchestrator.isUnlocked('upg-arranger-ai-co-pilot')
  );
  hasHoloMixer = computed(() =>
    this.neuralOrchestrator.isUnlocked('upg-holographic-mixer')
  );

  studioQualityClass = computed(() =>
    this.uiService.performanceMode()
      ? 'studio-quality-performance'
      : 'studio-quality-ultra'
  );

  isRecording = this.audioSession.isRecording;
  currentBeat = this.audioEngine.currentBeat;

  private animationId: number | null = null;

  ngOnInit() {
    this.route.url.subscribe((url) => {
      const path = url[0]?.path;
      if (path && isStudioView(path)) {
        this.activeView.set(path);
      }
    });

    this.route.queryParamMap.subscribe((params) => {
      const view = params.get('view');
      if (view && isStudioView(view)) {
        this.setActiveView(view, false);
      }
    });
  }

  ngAfterViewInit() {}

  resolveWithNeuralMix() {
    this.musicManager.tracks.update((ts) =>
      ts.map((t) => {
        return { ...t, gain: t.gain * 0.9 };
      })
    );
    this.notificationService.show('Neural Mix: Signals Optimized', 'success');
  }

  ngOnDestroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }

  constructor() {
    effect(() => {
      const selectedId = this.musicManager.selectedTrackId();
      if (selectedId) {
        const track = this.musicManager
          .tracks()
          .find((t) => t.id === selectedId);
        const isDrumTrack =
          track?.instrumentId.toLowerCase().includes('kit') ||
          track?.name.toLowerCase().includes('drum');
        const targetEditor: 'piano-roll' | 'drum-machine' = isDrumTrack
          ? 'drum-machine'
          : 'piano-roll';

        if (!this.focusLocked()) {
          this.activeEditor.set(targetEditor);
        }

        // Auto-focus on editors regardless of view
        if (
          this.uiService.autoPianoRoll() ||
          this.uiService.isCompactMobile()
        ) {
          this.showPianoRoll.set(true);
        } else if (!this.showPianoRoll()) {
          this.notificationService.show(
            `Track selected. ${isDrumTrack ? 'Drum Machine' : 'Piano Roll'} is ready.`,
            'info',
            3000
          );
        }
      }
    });
  }

  setActiveView(view: StudioView, syncRoute = true) {
    this.activeView.set(view);
    if (!syncRoute) return;

    const targetRoute =
      view === 'dj'
        ? ['/studio']
        : view === 'vocal-suite'
          ? ['/vocal-suite']
          : view === 'piano-roll'
            ? ['/piano-roll']
            : ['/studio'];
    const queryParams =
      view === 'dj' || view === 'vocal-suite' || view === 'piano-roll'
        ? undefined
        : { view };

    this.router.navigate(targetRoute, {
      queryParams,
      replaceUrl: true,
    });
  }

  toggleNeuralFoundry() {
    this.showNeuralFoundry.update((v) => !v);
  }

  updateMetronomeVolume(event: Event) {
    const vol = (event.target as HTMLInputElement).valueAsNumber;
    this.audioEngine.setMetronomeVolume(vol);
  }

  toggleFocusLock() {
    this.focusLocked.update((v) => !v);
  }

  invokeArrangementCoPilot() {
    this.aiCopilot.applySuggestions();
  }

  activateHolographicConsole() {
    this.uiService.toggleHolographicMode();
    this.notificationService.show('Holographic Console Activated', 'success');
  }
}
