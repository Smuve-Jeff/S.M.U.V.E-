import { SecurityService } from '../services/security.service';
import {
  AfterViewInit,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { UserProfileService } from '../services/user-profile.service';
import { DeckService } from '../services/deck.service';
import { UIService } from '../services/ui.service';
import { AiService } from '../services/ai.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { NotificationService } from '../services/notification.service';
import { MainViewMode } from '../services/user-context.service';
import { OnboardingService, OnboardingStep } from '../services/onboarding.service';
import { CloudSyncService } from '../services/cloud-sync.service';
import { OfflineSyncService } from '../services/offline-sync.service';
import { SessionHistoryService } from '../services/session-history.service';
import { ProjectService } from '../services/project.service';
import { Project } from '../types';

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
  private notificationService = inject(NotificationService);
  private projectSubscription: Subscription | null = null;
  private pulseInterval: ReturnType<typeof setInterval> | null = null;
  private animFrame: number | null = null;

  public uiService = inject(UIService);
  public deckService = inject(DeckService);
  public profileService = inject(UserProfileService);
  public aiService = inject(AiService);
  public audioEngine = inject(AudioEngineService);
  public onboarding = inject(OnboardingService);
  public securityService = inject(SecurityService);
  public cloudSyncService = inject(CloudSyncService);
  public offlineSync = inject(OfflineSyncService);
  public sessionHistoryService = inject(SessionHistoryService);
  public projectService = inject(ProjectService);

  quickProfile = signal({ artistName: '', primaryGenre: 'Hip Hop' });
  projectList = signal<Project[]>([]);
  visualizerData = signal<number[]>(new Array(24).fill(15));
  currentBeat = this.audioEngine.currentBeat;

  genres = ['Hip Hop', 'R&B', 'Pop', 'Electronic', 'Rock', 'Jazz', 'Classical'];
  broadcastDuration = 320;
  marketPulse = [
    'Streaming surge — East Side',
    'Club rotation up 24% this week',
    'Sync request: major placement',
  ];

  /** Kept as a stable public surface for existing Hub specs and consumers. */
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
    {
      route: 'products',
      category: 'Commerce',
      title: 'The Vault — product & service catalog',
      description:
        'Browse and manage the catalog served by the S.M.U.V.E. API. Seal new products and track stock from one command surface.',
      points: ['API-backed catalog', 'Create & manage listings'],
      icon: 'inventory_2',
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

  /** Preserved as a visual asset rail and used by the existing Hub spec. */
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

  activeBackdropIndex = signal(0);
  activeBackdrop = computed(() => this.homeBackdropMedia[this.activeBackdropIndex()] ?? this.homeBackdropMedia[0]);

  commandDeck = [
    {
      shortcut: 'Ctrl + K',
      title: 'Command Palette',
      description: 'Jump to any module or quick action from anywhere in the label.',
    },
    {
      shortcut: '?',
      title: 'Quick Reference',
      description: 'Contextual tips for the current view — shortcuts, gestures, controls.',
    },
    {
      shortcut: 'Themes',
      title: 'City Modes',
      description: 'Switch visual themes, scanlines, and performance settings on the fly.',
    },
  ];

  recentProjects = computed(() =>
    [...this.projectList()]
      .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
      .slice(0, 3)
  );

  activeProject = computed(() =>
    this.projectService.currentProject() ?? this.recentProjects()[0] ?? null
  );

  activeProjectName = computed(() => this.activeProject()?.name || 'No project selected');

  sessionCheckpointCount = computed(() =>
    Object.values(this.sessionHistoryService.checkpointsByBranch()).reduce(
      (total, checkpoints) => total + checkpoints.length,
      0
    )
  );

  trackedProjectsCount = computed(
    () => Object.keys(this.sessionHistoryService.branchesByProject()).length
  );

  activeBranchLabel = computed(() => {
    const project = this.activeProject();
    if (!project) return 'main';
    const branchId = this.sessionHistoryService.activeBranch(project.id);
    return (
      this.sessionHistoryService
        .branches(project.id)
        .find((branch) => branch.id === branchId)?.name ?? 'main'
    );
  });

  cloudStatusLabel = computed(() => {
    if (this.cloudSyncService.conflictCount() > 0) return 'Needs attention';
    if (this.cloudSyncService.isCloudReachable()) return 'Cloud synced';
    return 'Offline queue';
  });

  readinessScore = computed(() => {
    const profile = this.profileService.profile();
    const identity = profile.artistName !== 'New Artist' ? 25 : 0;
    const catalog = profile.catalog.length > 0 ? 25 : 0;
    const strategy = profile.careerGoals.length > 0 ? 25 : 0;
    const creation = this.trackedProjectsCount() > 0 ? 25 : 0;
    return identity + catalog + strategy + creation;
  });

  globalStudioPulse = computed(() => {
    const pulse: string[] = [];
    if (this.aiService.isAIDrummerActive()) pulse.push('NEURAL DRUMMER: SYNCED');
    if (this.aiService.isAIBassistActive()) pulse.push('AI BASSIST: TRACKING');
    if (this.aiService.isAIKeyboardistActive()) pulse.push('KEYBOARDIST: IMPROVISING');
    if (this.audioEngine.isRecording()) pulse.push('UPLINK: CAPTURING');
    if (this.sessionCheckpointCount() > 0) pulse.push('SESSION GRAPH: RECORDING');
    if (pulse.length === 0) pulse.push('SYSTEM READY: STANDBY');
    return pulse;
  });

  selectBackdrop(index: number): void {
    if (index < 0 || index >= this.homeBackdropMedia.length) return;
    this.activeBackdropIndex.set(index);
    this.resetCinematicPointer();
  }

  cycleBackdrop(direction: 1 | -1 = 1): void {
    const count = this.homeBackdropMedia.length;
    if (!count) return;
    this.selectBackdrop((this.activeBackdropIndex() + direction + count) % count);
  }

  onCinematicPointerMove(event: PointerEvent): void {
    if (this.uiService.performanceMode() || this.prefersReducedMotion()) return;
    const stage = event.currentTarget as HTMLElement | null;
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    stage.style.setProperty('--pointer-x', `${(x * 10).toFixed(2)}px`);
    stage.style.setProperty('--pointer-y', `${(y * 7).toFixed(2)}px`);
    stage.style.setProperty('--pointer-glow-x', `${50 + x * 18}%`);
    stage.style.setProperty('--pointer-glow-y', `${46 + y * 18}%`);
  }

  resetCinematicPointer(): void {
    const stage = document.querySelector<HTMLElement>('.cinematic-stage');
    stage?.style.setProperty('--pointer-x', '0px');
    stage?.style.setProperty('--pointer-y', '0px');
    stage?.style.setProperty('--pointer-glow-x', '50%');
    stage?.style.setProperty('--pointer-glow-y', '46%');
  }

  private prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  get sessionProjectCount(): number {
    return this.trackedProjectsCount();
  }

  getDynamicChecklist() {
    return this.aiService.getDynamicChecklist();
  }

  getCareerFocusProgress(): number {
    const profile = this.profileService.profile();
    return Math.min(100, profile.careerGoals.length * 20 || (profile.catalog.length ? 35 : 12));
  }

  isMobile() {
    return this.uiService.isCompactMobile();
  }

  constructor() {}

  ngOnInit() {
    this.projectSubscription = this.projectService.list$.subscribe((projects) => {
      this.projectList.set(projects);
    });

    if (this.uiService.isCompactMobile()) {
      this.aiService.proactiveSmuvePulse();
    }

    this.pulseInterval = setInterval(() => {
      this.currentBeat.update((value) => value + 1);
    }, 3000);
  }

  ngAfterViewInit() {
    this.startVisualizer();
  }

  private startVisualizer() {
    const update = () => {
      const analyser = this.audioEngine.getAnalyser();
      if (analyser) {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);
        let peak = 0;
        for (let index = 0; index < dataArray.length; index += 8) {
          peak = Math.max(peak, dataArray[index] ?? 0);
        }
        if (peak > 0) {
          const step = Math.max(1, Math.floor(bufferLength / 24));
          const next: number[] = [];
          for (let index = 0; index < 24; index++) {
            let sum = 0;
            for (let offset = 0; offset < step; offset++) {
              sum += dataArray[index * step + offset] ?? 0;
            }
            next.push(Math.max(20, (sum / step / 255) * 100));
          }
          this.visualizerData.set(next);
        } else {
          this.visualizerData.update((values) =>
            values.map((value) => Math.max(20, value * 0.95))
          );
        }
      } else {
        this.visualizerData.update((values) =>
          values.map((value) => Math.max(20, value * 0.95))
        );
      }
      this.animFrame = requestAnimationFrame(update);
    };
    this.animFrame = requestAnimationFrame(update);
  }

  ngOnDestroy() {
    if (this.animFrame !== null) cancelAnimationFrame(this.animFrame);
    if (this.pulseInterval) clearInterval(this.pulseInterval);
    this.projectSubscription?.unsubscribe();
  }

  updateQuickProfile(field: string, value: string) {
    this.quickProfile.update((profile) => ({ ...profile, [field]: value }));
  }

  onQuickStart() {
    if (!this.quickProfile().artistName) {
      this.notificationService.show('INPUT REQUIRED: your Artist Name to begin!', 'warning');
      return;
    }
    const current = this.profileService.profile();
    this.profileService.updateProfile({
      ...current,
      artistName: this.quickProfile().artistName,
      primaryGenre: this.quickProfile().primaryGenre,
    });
    this.notificationService.show('Profile Created Successfully!', 'success');
    void this.router.navigate(['/profile']);
  }

  toggleAIBassist() {
    this.aiService.isAIBassistActive()
      ? this.aiService.stopAIBassist()
      : this.aiService.startAIBassist();
  }

  toggleAIDrummer() {
    this.aiService.isAIDrummerActive()
      ? this.aiService.stopAIDrummer()
      : this.aiService.startAIDrummer();
  }

  toggleAIKeyboardist() {
    this.aiService.isAIKeyboardistActive()
      ? this.aiService.stopAIKeyboardist()
      : this.aiService.startAIKeyboardist();
  }

  goToStudio() {
    void this.router.navigate(['/studio']);
  }

  goToThaSpot() {
    void this.router.navigate(['/tha-spot']);
  }

  browseThaSpot() {
    void this.router.navigate(['/tha-spot/browse']);
  }

  goToCloudVault(): void {
    void this.router.navigate(['/cloud']);
  }

  goToTimeline(): void {
    void this.router.navigate(['/timeline']);
  }

  goToStore() {
    void this.router.navigate(['/store']);
  }

  navigateToFeature(route: MainViewMode) {
    void this.router.navigate(['/' + route]);
  }

  continueOnboarding() {
    const next = this.onboarding.nextStep();
    if (!next) return;
    void this.router.navigate(['/' + next.route], { queryParams: next.queryParams });
  }

  resumeWorkspace() {
    const recent = this.uiService.getRecentViewConfigs()[0];
    this.uiService.navigateToView(recent?.mode || 'studio');
  }

  openOnboardingStep(step: OnboardingStep) {
    void this.router.navigate(['/' + step.route], { queryParams: step.queryParams });
  }

  startFirstBeatTour() {
    this.onboarding.startTour();
    void this.router.navigate(['/onboarding/tour']);
  }

  openProject(project: Project) {
    this.projectService.select(project.id);
    this.uiService.navigateToView('studio');
  }

}
