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
import { AiService } from '../services/ai.service';
import { UIService } from '../services/ui.service';
import { NotificationService } from '../services/notification.service';
import { VocalSuiteComponent } from './vocal-suite/vocal-suite.component';
import { DrumMachineComponent } from './drum-machine/drum-machine.component';

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
  ],
  templateUrl: './studio.component.html',
  styleUrls: ['./studio.component.css'],
})
export class StudioComponent implements OnInit, OnDestroy, AfterViewInit {
  public readonly audioSession = inject(AudioSessionService);
  public readonly audioEngine = inject(AudioEngineService);
  public readonly aiService = inject(AiService);
  public readonly uiService = inject(UIService);
  private readonly notificationService = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  public readonly musicManager = inject(MusicManagerService);
  public readonly profileService = inject(UserProfileService);

  activeView = signal<
    | 'dj'
    | 'piano-roll'
    | 'mixer'
    | 'performance'
    | 'mastering'
    | 'vocal-suite'
    | 'drum-machine'
  >('dj');
  showMixer = signal(true);
  showRack = signal(true);
  showPianoRoll = signal(false);
  activeEditor = signal<'piano-roll' | 'drum-machine'>('piano-roll');
  focusLocked = signal(false);

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
      if (
        path === 'dj' ||
        path === 'mixer' ||
        path === 'piano-roll' ||
        path === 'vocal-suite' ||
        path === 'drum-machine'
      ) {
        this.activeView.set(path as any);
      }
    });

    this.route.queryParamMap.subscribe((params) => {
      const view = params.get('view');
      if (
        view === 'dj' ||
        view === 'mixer' ||
        view === 'piano-roll' ||
        view === 'vocal-suite' ||
        view === 'drum-machine' ||
        view === 'performance' ||
        view === 'mastering'
      ) {
        this.setActiveView(view, false);
      }
    });
  }

  ngAfterViewInit() {}

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

  setActiveView(
    view:
      | 'dj'
      | 'piano-roll'
      | 'mixer'
      | 'performance'
      | 'mastering'
      | 'vocal-suite'
      | 'drum-machine',
    syncRoute = true
  ) {
    this.activeView.set(view);
    if (!syncRoute) return;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
  updateMetronomeVolume(event: Event) {
    const vol = (event.target as HTMLInputElement).valueAsNumber;
    this.audioEngine.setMetronomeVolume(vol);
  }

  toggleFocusLock() {
    this.focusLocked.update((v) => !v);
  }
}
