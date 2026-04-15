import { SecurityService } from '../services/security.service';
import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
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

  genres = ['Hip Hop', 'R&B', 'Pop', 'Electronic', 'Rock', 'Jazz', 'Classical'];
  labelStats = [
    {
      label: 'Roster Ready',
      value: '12',
      foot: 'Active talent under management',
    },
    { label: 'Pipeline', value: '5', foot: 'Releases in mastering' },
    { label: 'Momentum', value: '+18%', foot: 'Month over month growth' },
  ];
  broadcastDuration = 320;
  marketPulse = [
    'Streaming spike – West Coast',
    'Vinyl preorders up 12%',
    'Sync request: indie film',
  ];
  featureSpotlights: LandingFeature[] = [
    {
      route: 'studio',
      category: 'Production',
      title: 'Studio, DJ deck, and mix control',
      description:
        'Build records with the browser DAW, effects chain, mastering controls, and live playback routing.',
      points: ['Channel rack and sequencing', 'Mixer and mastering suite'],
      icon: 'tune',
    },
    {
      route: 'piano-roll',
      category: 'Composition',
      title: 'Piano roll and arrangement editing',
      description:
        'Compose melodies, edit timing, and shape arrangements with the dedicated note editor.',
      points: ['88-key note editing', 'Arrangement-aware workflow'],
      icon: 'piano',
    },
    {
      route: 'vocal-suite',
      category: 'Recording',
      title: 'Capture takes in the vocal suite',
      description:
        'Track microphone input, monitor vocal chains, and work with recording-focused tools in one place.',
      points: ['Microphone interface', 'Waveform-driven recording view'],
      icon: 'mic',
    },
    {
      route: 'image-video-lab',
      category: 'Visuals',
      title: 'Produce visuals with CinemaEngine',
      description:
        'Create cover art, visual concepts, and multi-track video timelines tuned for multiple delivery formats.',
      points: ['Image and video lab', 'Preset-based export workflows'],
      icon: 'movie',
    },
    {
      route: 'strategy',
      category: 'Strategy',
      title: 'Plan campaigns with the Intel Lab',
      description:
        'Review market signals, executive briefs, and career planning surfaces backed by the AI strategy layer.',
      points: ['Campaign and outreach tabs', 'Career and business planning'],
      icon: 'analytics',
    },
    {
      route: 'tha-spot',
      category: 'Community',
      title: 'Drop into Tha Spot',
      description:
        'Move from production into the social gaming floor for matchmaking, reputation, and community sessions.',
      points: ['Arcade discovery hub', 'Networked community energy'],
      icon: 'sports_esports',
    },
  ];
  workflowStages: WorkflowStage[] = [
    {
      route: 'profile',
      label: '01',
      title: 'Set the artist identity',
      description:
        'Start with the profile flow so the rest of the platform reflects the right genre, goals, and audience.',
    },
    {
      route: 'studio',
      label: '02',
      title: 'Produce the record',
      description:
        'Move into the studio, piano roll, and vocal suite to shape the release from rough idea to finished mix.',
    },
    {
      route: 'image-video-lab',
      label: '03',
      title: 'Build the campaign package',
      description:
        'Pair visuals, lyrics, strategy, and business planning around the same release before launch.',
    },
    {
      route: 'release-pipeline',
      label: '04',
      title: 'Launch and track momentum',
      description:
        'Use the release pipeline, analytics, and project views to manage rollout readiness and follow-through.',
    },
  ];
  homeBackdropMedia: HomeBackdropMedia[] = [
    {
      src: 'assets/hub/home-backdrop-studio.png',
      label: 'Production Suite',
      title: 'Studio performance view',
      layoutClass: 'panel-studio',
    },
    {
      src: 'assets/hub/home-backdrop-command.png',
      label: 'Executive Layout',
      title: 'Command surface overview',
      layoutClass: 'panel-command',
    },
    {
      src: 'assets/hub/home-backdrop-intel.png',
      label: 'Intel Brief',
      title: 'Strategy signal board',
      layoutClass: 'panel-intel',
    },
    {
      src: 'assets/hub/home-backdrop-cinema.png',
      label: 'Cinema Engine',
      title: 'Mobile visual direction',
      layoutClass: 'panel-cinema',
    },
  ];
  commandDeck = [
    {
      shortcut: 'Ctrl + K',
      title: 'Command Palette',
      description: 'Jump to major modules and quick actions from anywhere.',
    },
    {
      shortcut: '?',
      title: 'Interaction Guide',
      description: 'Open contextual tips for the current view and controls.',
    },
    {
      shortcut: 'Themes',
      title: 'Visual Modes',
      description:
        'Swap theme, scanlines, and performance settings from the shell.',
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
  visualizerData = signal<number[]>(new Array(24).fill(20));

  ngOnInit() {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      this.aiService.proactiveStrategicPulse();
    }
  }

  ngAfterViewInit() {
    this.startVisualizer();
  }

  private startVisualizer() {
    const analyser = this.audioEngine.getAnalyser();
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const update = () => {
      if (this.playerService.isPlaying()) {
        analyser.getByteFrequencyData(dataArray);

        // Map the frequency data to our 24 bars
        const newData = [];
        const step = Math.floor(bufferLength / 24);
        for (let i = 0; i < 24; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) {
            sum += dataArray[i * step + j];
          }
          const average = sum / step;
          // Normalize to 20-100 range for CSS height
          newData.push(Math.max(20, (average / 255) * 100));
        }
        this.visualizerData.set(newData);
      } else {
        // Idling animation if not playing
        const idle = this.visualizerData().map((v) => Math.max(20, v * 0.95));
        this.visualizerData.set(idle);
      }
      this.animFrame = requestAnimationFrame(update);
    };
    update();
  }

  ngOnDestroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }

  // Quick Start Actions
  onQuickStart() {
    if (!this.quickProfile().artistName) {
      this.notificationService.show(
        'Please enter your Artist Name to begin!',
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

  // Navigation Helpers
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
