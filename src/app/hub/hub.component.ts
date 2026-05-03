import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ViewChild,
  ElementRef,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { UIService } from '../services/ui.service';
import { DeckService } from '../services/deck.service';
import { UserProfileService } from '../services/user-profile.service';
import { AiService } from '../services/ai.service';
import { FileLoaderService } from '../services/file-loader.service';
import { ExportService } from '../services/export.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { NotificationService } from '../services/notification.service';
import { PlayerService } from '../services/player.service';
import {
  OnboardingService,
  OnboardingStep,
} from '../services/onboarding.service';
import { SecurityService } from '../services/security.service';
import { MainViewMode } from '../services/user-context.service';

interface LandingFeature {
  route: string;
  category: string;
  title: string;
  description: string;
  points: string[];
  icon: string;
}

interface WorkflowStage {
  route: string;
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

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
}

@Component({
  selector: 'app-hub',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hub.component.html',
  styleUrls: ['./hub.component.css'],
})
export class HubComponent implements OnInit, OnDestroy {
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

  @ViewChild('visualizerCanvas') set canvasRef(
    el: ElementRef<HTMLCanvasElement> | undefined
  ) {
    this._canvasRef = el;
    if (el) {
      // Canvas just appeared in the DOM (performance mode was disabled)
      if (this.initCanvas()) {
        this.startVisualizer();
      }
    } else {
      // Canvas was removed from the DOM (performance mode enabled)
      if (this.animFrame !== null) {
        cancelAnimationFrame(this.animFrame);
        this.animFrame = null;
      }
    }
  }
  private _canvasRef: ElementRef<HTMLCanvasElement> | undefined;
  private ctx!: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private mouseX = 0;
  private mouseY = 0;

  // Quick Start Form
  quickProfile = signal({
    artistName: '',
    primaryGenre: 'Hip Hop',
  });

  private pulseInterval: ReturnType<typeof setInterval> | null = null;

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

  onItemMouseMove(event: MouseEvent, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty('--mouse-x-local', `${x}%`);
    el.style.setProperty('--mouse-y-local', `${y}%`);
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    this.mouseX = event.clientX;
    this.mouseY = event.clientY;

    const xPct = (event.clientX / window.innerWidth) * 100;
    const yPct = (event.clientY / window.innerHeight) * 100;
    document.documentElement.style.setProperty('--mouse-x', `${xPct}%`);
    document.documentElement.style.setProperty('--mouse-y', `${yPct}%`);
  }

  @HostListener('window:resize')
  onResize() {
    this.resizeCanvas();
  }

  ngOnInit() {
    if (this.uiService.isCompactMobile()) {
      this.aiService.proactiveStrategicPulse();
    }
    this.pulseInterval = setInterval(() => {
      this.currentBeat.update((v) => v + 1);
    }, 3000);
  }

  private initCanvas(): boolean {
    if (!this._canvasRef) return false;

    const canvas = this._canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      canvas.style.display = 'none';
      return false;
    }

    this.ctx = ctx;
    canvas.style.display = '';
    this.resizeCanvas();
    this.initParticles();
    return true;
  }

  private resizeCanvas() {
    if (!this._canvasRef) return;
    this._canvasRef.nativeElement.width = window.innerWidth;
    this._canvasRef.nativeElement.height = window.innerHeight;
  }

  private initParticles() {
    this.particles = [];
    const count = this.isMobile() ? 40 : 120;
    for (let i = 0; i < count; i++) {
      this.particles.push(this.createParticle());
    }
  }

  private createParticle(): Particle {
    return {
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: Math.random() * 2 + 1,
      color: this.uiService.activeTheme().primary,
      alpha: Math.random() * 0.5 + 0.1,
      life: Math.random() * 100,
    };
  }

  private startVisualizer() {
    const update = () => {
      if (this.uiService.performanceMode()) {
        // Stop the loop; the @ViewChild setter will restart it
        // when the canvas is re-added (performance mode is turned off).
        this.animFrame = null;
        return;
      }

      const isPlaying = this.playerService.isPlaying();

      if (isPlaying) {
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
        const idle = this.visualizerData().map((v) => Math.max(20, v * 0.98));
        this.visualizerData.set(idle);
      }

      this.drawBackground(isPlaying);
      this.animFrame = requestAnimationFrame(update);
    };
    this.animFrame = requestAnimationFrame(update);
  }

  private drawBackground(isPlaying: boolean) {
    if (!this.ctx) return;

    this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    const intensity = isPlaying ? this.visualizerData()[0] / 100 : 0.2;
    const theme = this.uiService.activeTheme();

    this.particles.forEach((p) => {
      // Update
      p.x += p.vx * (1 + intensity * 2);
      p.y += p.vy * (1 + intensity * 2);

      // Wrap
      if (p.x < 0) p.x = window.innerWidth;
      if (p.x > window.innerWidth) p.x = 0;
      if (p.y < 0) p.y = window.innerHeight;
      if (p.y > window.innerHeight) p.y = 0;

      // Interaction
      const dx = p.x - this.mouseX;
      const dy = p.y - this.mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 200) {
        p.x += dx * 0.01;
        p.y += dy * 0.01;
      }

      // Draw
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size * (1 + intensity * 0.5), 0, Math.PI * 2);
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.alpha * (isPlaying ? 1.5 : 1);
      this.ctx.fill();
    });

    // Draw lines between close particles
    this.ctx.lineWidth = 0.5;
    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const p1 = this.particles[i];
        const p2 = this.particles[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 150) {
          this.ctx.beginPath();
          this.ctx.moveTo(p1.x, p1.y);
          this.ctx.lineTo(p2.x, p2.y);
          this.ctx.strokeStyle = theme.primary;
          this.ctx.globalAlpha = (1 - dist / 150) * 0.15 * (isPlaying ? 2 : 1);
          this.ctx.stroke();
        }
      }
    }
    this.ctx.globalAlpha = 1;
  }

  ngOnDestroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.pulseInterval) clearInterval(this.pulseInterval);
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
