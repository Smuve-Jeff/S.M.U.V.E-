import { SecurityService } from '../services/security.service';
import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  inject,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { UserProfileService } from '../services/user-profile.service';
import { DeckService } from '../services/deck.service';
import { UIService } from '../services/ui.service';
import { AiService } from '../services/ai.service';
import { FileLoaderService } from '../services/file-loader.service';
import { ExportService } from '../services/export.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { AfterViewInit } from '@angular/core';
import { NotificationService } from '../services/notification.service';
import { PlayerService } from '../services/player.service';
import { MainViewMode } from '../services/user-context.service';
import { OnboardingService } from '../services/onboarding.service';
import { OnboardingStep } from '../services/onboarding.service';

interface LandingFeature {
  route: MainViewMode;
  category: string;
  title: string;
  description: string;
  points: string[];
  icon: string;
}

interface WorkflowStage {
  route: MainViewMode;
  label: string;
  title: string;
  description: string;
}

interface HomeBackdropMedia {
  src: string;
  label: string;
  title: string;
  layoutClass: string;
}

@Component({
  selector: 'app-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './hub.component.html',
  styleUrls: ['./hub.component.css'],
})
export class HubComponent implements OnInit, OnDestroy, AfterViewInit {
  private router = inject(Router);
  public uiService = inject(UIService);
  public deckService = inject(DeckService);
  public profileService = inject(UserProfileService);
  public aiService = inject(AiService);
  private fileLoader = inject(FileLoaderService);
  private exportService = inject(ExportService);
  public audioEngine = inject(AudioEngineService);
  private notificationService = inject(NotificationService);
  public playerService = inject(PlayerService);
  public onboarding = inject(OnboardingService);
  public securityService = inject(SecurityService);

  // Quick Start Form
  quickProfile = signal({
    artistName: '',
    primaryGenre: 'Hip Hop',
  });

  private pulseInterval: ReturnType<typeof setInterval> | null = null;

  genres = ['Hip Hop', 'R&B', 'Pop', 'Electronic', 'Rock', 'Jazz', 'Classical'];
  broadcastDuration = 320;
  marketPulse = [
    'Streaming surge — East Side',
    'Club rotation up 24% this week',
    'Sync request: major placement',
  ];
  featureSpotlights: LandingFeature[] = [
    {
      route: 'produce',
      category: 'AI Produce',
      title: 'One-Tap Produce — idea → beat → master',
      description:
        'Type a vibe. The orchestrator pulls the AI Beat Generator, Songwriting Assistant, AI Mix Master, and release pipeline into a single run.',
      points: ['B3 · one-tap pipeline', 'Idea → beat → lyrics → master → release'],
      icon: 'auto_awesome',
    },
    {
      route: 'studio',
      category: 'Production',
      title: 'The Booth — full studio & deck control',
      description:
        'Produce records in the browser DAW with effects, mastering, and live routing. The booth is lit 24/7.',
      points: ['Channel rack & sequencing', 'Mixer & mastering suite'],
      icon: 'tune',
    },
    {
      route: 'piano-roll',
      category: 'Composition',
      title: 'Piano roll & precision arrangement',
      description:
        'Compose melodies with surgical precision. Edit timing, velocity, and shape arrangements note by note.',
      points: ['88-key note editor', 'Arrangement-aware workflow'],
      icon: 'piano',
    },
    {
      route: 'vocal-suite',
      category: 'Recording',
      title: 'Vocal suite — capture the moment',
      description:
        'Track live mic input with pro vocal chains. Multi-take comping, waveform editing, and monitoring in one place.',
      points: ['Live microphone interface', 'Multi-take recording & comping'],
      icon: 'mic',
    },
    {
      route: 'image-video-lab',
      category: 'Visuals',
      title: 'Visual Suite — cinema-grade press assets',
      description:
        'Create cover art, visualizers, and multi-track video timelines tuned for every platform and format.',
      points: ['Image & video production lab', 'Preset export workflows'],
      icon: 'movie',
    },
    {
      route: 'strategy',
      category: 'Strategy',
      title: 'Street Team — campaign & intel command',
      description:
        'Review market signals, executive briefs, and career planning backed by the AI strategy engine.',
      points: ['Campaign & outreach center', 'Career & business planning'],
      icon: 'analytics',
    },
    {
      route: 'tha-spot',
      category: 'Community',
      title: 'After Hours — the gaming floor',
      description:
        'Step off the stage and onto the floor. Matchmaking, arcade cabinets, and community sessions running all night.',
      points: ['450+ game arcade', 'Co-op matchmaking & lobbies'],
      icon: 'sports_esports',
    },
  ];
  workflowStages: WorkflowStage[] = [
    {
      route: 'profile',
      label: '01',
      title: 'Build the artist identity',
      description:
        'Lock in your sound, genre, and goals so every module reflects who you are and where you are headed.',
    },
    {
      route: 'studio',
      label: '02',
      title: 'Produce the record',
      description:
        'Move into the booth. Piano roll, vocal suite, and full studio — shape the release from idea to finished mix.',
    },
    {
      route: 'image-video-lab',
      label: '03',
      title: 'Build the campaign package',
      description:
        'Pair press visuals, strategy, and business planning around the release before it drops.',
    },
    {
      route: 'release-pipeline',
      label: '04',
      title: 'Launch & track the momentum',
      description:
        'Use the release pipeline, analytics, and project views to manage rollout and watch the numbers climb.',
    },
  ];
  homeBackdropMedia: HomeBackdropMedia[] = [
    {
      src: 'assets/hub/home-backdrop-studio.png',
      label: 'The Booth',
      title: 'Studio live view',
      layoutClass: 'panel-studio',
    },
    {
      src: 'assets/hub/home-backdrop-command.png',
      label: 'Label Desk',
      title: 'Executive command surface',
      layoutClass: 'panel-command',
    },
    {
      src: 'assets/hub/home-backdrop-intel.png',
      label: 'City Pulse',
      title: 'Strategy signal board',
      layoutClass: 'panel-intel',
    },
    {
      src: 'assets/hub/home-backdrop-cinema.png',
      label: 'Visual Suite',
      title: 'Cinema-grade press visuals',
      layoutClass: 'panel-cinema',
    },
  ];
  commandDeck = [
    {
      shortcut: 'Ctrl + K',
      title: 'Command Palette',
      description:
        'Jump to any module or quick action from anywhere in the label.',
    },
    {
      shortcut: '?',
      title: 'Quick Reference',
      description:
        'Contextual tips for the current view — shortcuts, gestures, controls.',
    },
    {
      shortcut: 'Themes',
      title: 'City Modes',
      description:
        'Switch visual themes, scanlines, and performance settings on the fly.',
    },
  ];

  getCareerFocusProgress(): number {
    return Math.min(
      100,
      this.profileService.profile().careerGoals.length * 20 || 20
    );
  }

  updateQuickProfile(field: string, value: string) {
    this.quickProfile.update((p) => ({ ...p, [field]: value }));
  }

  constructor() {}

  private animFrame: number | null = null;
  visualizerData = signal<number[]>(new Array(24).fill(15));
  currentBeat = this.audioEngine.currentBeat;
  globalStudioPulse = computed(() => {
    const pulse = [];
    if (this.aiService.isAIDrummerActive())
      pulse.push('NEURAL DRUMMER: SYNCED');
    if (this.aiService.isAIBassistActive()) pulse.push('AI BASSIST: TRACKING');
    if (this.aiService.isAIKeyboardistActive())
      pulse.push('KEYBOARDIST: IMPROVISING');
    if (this.audioEngine.isRecording()) pulse.push('UPLINK: CAPTURING');
    if (pulse.length === 0) pulse.push('SYSTEM READY: STANDBY');
    return pulse;
  });
  getDynamicChecklist() {
    return this.aiService.getDynamicChecklist();
  }
  isMobile() {
    return this.uiService.isCompactMobile();
  }

  ngOnInit() {
    if (this.uiService.isCompactMobile()) {
      this.aiService.proactiveSmuvePulse();
    }
    this.pulseInterval = setInterval(() => {
      this.currentBeat.update((v) => v + 1);
    }, 3000);
  }

  ngAfterViewInit() {
    this.startVisualizer();
  }

  private startVisualizer() {
    const update = () => {
      if (this.playerService.isPlaying()) {
        const analyser = this.audioEngine.getAnalyser();
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        const newData = [];
        const step = Math.floor(bufferLength / 24);
        for (let i = 0; i < 24; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) {
            sum += dataArray[i * step + j];
          }
          const average = sum / step;
          newData.push(Math.max(20, (average / 255) * 100));
        }
        this.visualizerData.set(newData);
      } else {
        const idle = this.visualizerData().map((v) => Math.max(20, v * 0.95));
        this.visualizerData.set(idle);
      }
      this.animFrame = requestAnimationFrame(update);
    };
    this.animFrame = requestAnimationFrame(update);
  }

  ngOnDestroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.pulseInterval) clearInterval(this.pulseInterval);
  }

  // Quick Start Actions
  onQuickStart() {
    if (!this.quickProfile().artistName) {
      this.notificationService.show(
        'INPUT REQUIRED your Artist Name to begin!',
        'warning'
      );
      return;
    }

    const current = this.profileService.profile();
    this.profileService.updateProfile({
      ...current,
      artistName: this.quickProfile().artistName,
      primaryGenre: this.quickProfile().primaryGenre,
    });

    this.notificationService.show('Profile Created Successfully!', 'success');
    this.router.navigate(['/profile']);
  }

  // AI Jam Actions
  toggleAIBassist() {
    if (this.aiService.isAIBassistActive()) {
      this.aiService.stopAIBassist();
    } else {
      this.aiService.startAIBassist();
    }
  }

  toggleAIDrummer() {
    if (this.aiService.isAIDrummerActive()) {
      this.aiService.stopAIDrummer();
    } else {
      this.aiService.startAIDrummer();
    }
  }

  toggleAIKeyboardist() {
    if (this.aiService.isAIKeyboardistActive()) {
      this.aiService.stopAIKeyboardist();
    } else {
      this.aiService.startAIKeyboardist();
    }
  }

  // Navigation INTELers
  goToStudio() {
    this.router.navigate(['/studio']);
  }

  goToThaSpot() {
    this.router.navigate(['/tha-spot']);
  }

  navigateToFeature(route: MainViewMode) {
    this.router.navigate(['/' + route]);
  }

  continueOnboarding() {
    const next = this.onboarding.nextStep();
    if (!next) {
      return;
    }

    this.router.navigate(['/' + next.route], {
      queryParams: next.queryParams,
    });
  }

  resumeWorkspace() {
    const recent = this.uiService.getRecentViewConfigs()[0];
    this.uiService.navigateToView(recent?.mode || 'studio');
  }

  openOnboardingStep(step: OnboardingStep) {
    this.router.navigate(['/' + step.route], {
      queryParams: step.queryParams,
    });
  }
}
