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
import { Subject, takeUntil } from 'rxjs';
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
import { VocalSuiteComponent } from './vocal-suite/vocal-suite.component';
import { DrumMachineComponent } from './drum-machine/drum-machine.component';
import { NeuralFoundryComponent } from '../neural-foundry/neural-foundry.component';
import { AiCopilotService } from './ai-copilot.service';
import { HapticService } from '../services/haptic.service';
import { TouchGestureService } from '../services/touch-gesture.service';
import { PerformerComponent } from './performer/performer.component';
import { PerformanceGridComponent } from './performance-grid/performance-grid.component';

type StudioView =
  | 'dj'
  | 'piano-roll'
  | 'mixer'
  | 'performance'
  | 'mastering'
  | 'vocal-suite'
  | 'drum-machine'
  | 'performer' | 'performance-grid';

const PATH_STUDIO_VIEWS = new Set<StudioView>([
  'dj',
  'piano-roll',
  'mixer',
  'performance',
  'mastering',
  'vocal-suite',
  'drum-machine',
  'performer',
  'performance-grid',
  'performance-grid',
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
    ChannelRackComponent,
    DrumMachineComponent,
    NeuralFoundryComponent,
    PerformerComponent,
    PerformanceGridComponent,
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
  showMixer = signal(true);
  showRack = signal(true);
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
  private isInitialLoad = true;

  ngOnInit() {
    this.route.url.pipe(takeUntil(this.destroy$)).subscribe((url) => {
      const path = url[0]?.path;
      if (path && isStudioView(path)) {
        this.setActiveView(path, false);
      }
    });

    this.route.queryParamMap
      .pipe(takeUntil(this.destroy$))
      .subscribe((params) => {
        const view = params.get('view');
        if (view && isStudioView(view)) {
          this.setActiveView(view, false);
        }
      });

    // Mark as initialized after a short delay to allow URL-driven views to settle
    setTimeout(() => {
      this.isInitialLoad = false;
    }, 500);
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
    this.destroy$.next();
    this.destroy$.complete();
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }

  constructor() {
    let lastSelectedId: number | null = null;

    effect(
      () => {
        const selectedId = this.musicManager.selectedTrackId();
        if (selectedId && selectedId !== lastSelectedId) {
          const track = this.musicManager
            .tracks()
            .find((t) => t.id === selectedId);

          const isDrumTrack =
            track?.instrumentId.toLowerCase().includes('kit') ||
            track?.name.toLowerCase().includes('drum');

          const targetView: StudioView = isDrumTrack
            ? 'drum-machine'
            : 'piano-roll';

          if (!this.focusLocked() && !this.isInitialLoad) {
            // Auto-switch view if in an editor-context
            const current = this.activeView();
            if (current === 'piano-roll' || current === 'drum-machine') {
              if (current !== targetView) {
                this.activeView.set(targetView);
              }
            }
          }

          if (
            !['piano-roll', 'drum-machine', 'performer'].includes(
              this.activeView()
            ) &&
            !this.isInitialLoad
          ) {
            this.notificationService.show(
              `Track selected. ${isDrumTrack ? 'Drum Machine' : 'Piano Roll'} is ready.`,
              'info',
              2000
            );
          }

          lastSelectedId = selectedId;
        }
      },
      { allowSignalWrites: true }
    );
  }

  setActiveView(view: StudioView, syncRoute = true) {
    this.haptic.light();
    this.activeView.set(view);
    if (!syncRoute) return;

    const targetRoute = ['/studio'];
    const queryParams = { view };

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
