import { LoggingService } from './logging.service';
import {
  Injectable,
  signal,
  computed,
  EnvironmentProviders,
  makeEnvironmentProviders,
  InjectionToken,
  inject,
  effect,
} from '@angular/core';
import { UserProfileService, UserProfile } from './user-profile.service';
import { ReputationService } from './reputation.service';
import { LearnedStyle, ProductionSecret, TrendData, UpgradeRecommendation, ProfileAuditResult, StrategicTask, ExecutiveAuditReport } from '../types/ai.types';
import { UserContextService, MainViewMode } from './user-context.service';
import { AnalyticsService } from './analytics.service';
import { MarketingService } from './marketing.service';
import { UIService } from './ui.service';

export const API_KEY_TOKEN = new InjectionToken<string>('API_KEY');

export interface AdvisorAdvice {
  id: string;
  title: string;
  content: string;
  type: 'strategy' | 'technical' | 'career' | 'task';
  priority: 'low' | 'medium' | 'high';
  actionLabel?: string;
  action?: () => void;
}

export interface StrategicRecommendation {
  id: string;
  action: string;
  impact: 'Extreme' | 'High' | 'Medium' | 'Low';
  difficulty: 'High' | 'Medium' | 'Low';
  toolId: MainViewMode;
}

export interface SystemStatus {
  cpuLoad: number;
  neuralSync: number;
  memoryUsage: number;
  latency: number;
  marketVelocity: number;
  activeProcesses: number;
}

@Injectable({
  providedIn: 'root',
})
export class AiService {
  private logger = inject(LoggingService);
  private userContextService = inject(UserContextService);
  private analyticsService = inject(AnalyticsService);
  private marketingService = inject(MarketingService);
  private userProfileService = inject(UserProfileService);
  private reputationService = inject(ReputationService);
  private uiService = inject(UIService);

  advisorAdvice = signal<AdvisorAdvice[]>([]);
  activeAudit = signal<ProfileAuditResult | null>(null);

  // v4 Extreme Signals
  isScanning = signal(false);
  scanningProgress = signal(0);
  currentProcessStep = signal("");
  executiveAudit = signal<ExecutiveAuditReport | null>(null);

  isAIBassistActive = signal(false);
  isAIDrummerActive = signal(false);
  isAIKeyboardistActive = signal(false);
  chatInstance = signal<any>(null);

  strategicDecrees = signal<string[]>(['PIVOT FOCUS TO NEURAL NODE 07. MARKET RESONANCE PEAKING.', 'MAXIMIZE STREAMING REVENUE', 'ELIMINATE WEAK CONTENT']);

  systemStatus = signal<SystemStatus>({
    cpuLoad: 12.4,
    neuralSync: 98.2,
    memoryUsage: 45.1,
    latency: 1.2,
    marketVelocity: 88.5,
    activeProcesses: 42
  });

  constructor() {
    effect(() => {
      const view = this.userContextService.mainViewMode();
      const profile = this.userProfileService.profile();
      this.updateAdvisorAdvice(view, profile);
      this.generateDynamicDecrees(profile);
    });

    setInterval(() => {
      this.systemStatus.update(s => ({
        ...s,
        cpuLoad: Math.min(100, Math.max(0, s.cpuLoad + (Math.random() - 0.5) * 2)),
        neuralSync: Math.min(100, Math.max(90, s.neuralSync + (Math.random() - 0.5) * 0.5)),
        latency: Math.min(10, Math.max(0.5, s.latency + (Math.random() - 0.5) * 0.1)),
        marketVelocity: s.marketVelocity
      }));
    }, 3000);
  }

  performExecutiveAudit() {
    this.isScanning.set(true);
    this.executiveAudit.set(null);
    this.scanningProgress.set(0);

    const steps = [
      { progress: 10, label: 'INITIALIZING NEURAL LINK...' },
      { progress: 25, label: 'SCANNING FREQUENCY CORRIDORS...' },
      { progress: 45, label: 'ANALYZING SONIC COHESION...' },
      { progress: 65, label: 'AUDITING ARRANGEMENT DEPTH...' },
      { progress: 85, label: 'CALCULATING MARKET VIABILITY...' },
      { progress: 100, label: 'AUDIT COMPLETE.' }
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep < steps.length) {
        this.scanningProgress.set(steps[currentStep].progress);
        this.currentProcessStep.set(steps[currentStep].label);
        currentStep++;
      } else {
        clearInterval(interval);
        this.isScanning.set(false);
        this.executiveAudit.set({
          overallScore: 92,
          sonicCohesion: 88,
          arrangementDepth: 94,
          marketViability: 91,
          criticalDeficits: [
            'Sub-bass saturation peaking in corridor 4',
            'Vocal transient mismatch in pre-chorus'
          ],
          technicalRecommendations: [
            'Apply surgical multi-band to corridor 4',
            'Sync neural pitch engine to vocal chain'
          ]
        });
      }
    }, 600);
  }

  private generateDynamicDecrees(profile: UserProfile) {
    const decrees: string[] = [];
    const genre = profile.primaryGenre || 'Music';
    const rep = this.reputationService.state();
    const prefix = rep.level > 10 ? 'EXECUTIVE DECREE:' : 'COMMAND:';

    if (profile.expertiseLevels?.production < 6) {
      decrees.push(`${prefix} ${genre.toUpperCase()} DEFICIT DETECTED. INITIALIZE TECHNICAL AUDIT.`);
    }

    if (profile.marketingBudget === 'No Budget' || (profile.marketingBudget as string) === '<00/mo') {
      decrees.push(`${prefix} CAPITAL DEFICIT DETECTED. AGGRESSIVE GUERRILLA MARKETING REQUIRED.`);
    }

    const status = this.systemStatus();
    if (status.cpuLoad > 80) {
      decrees.push('ALERT: SYSTEM THERMALS RISING. OPTIMIZE COMPOSITION NODES.');
    }

    if (rep.level > 20) {
      decrees.push('PLATINUM CLEARANCE: ARCHITECTING GLOBAL DOMINATION MODULES.');
    }

    if (decrees.length === 0) decrees.push('DOMINATE THE AIRWAVES. NO FAILURES PERMITTED.');
    this.strategicDecrees.set(decrees);
  }

  async processCommand(command: string): Promise<string> {
    const cmd = command.toLowerCase().trim();
    if (cmd === '/audit') {
      this.performExecutiveAudit();
      return 'INITIALIZING EXECUTIVE STUDIO AUDIT.';
    }
    return `UNKNOWN COMMAND: ${command.toUpperCase()}. CONSULT SYSTEM DIRECTORY.`;
  }

  private updateAdvisorAdvice(view: MainViewMode, profile: UserProfile) {
    const growth = this.analyticsService.overallGrowth();
    const advice: AdvisorAdvice[] = [];
    if (growth < 5) {
      advice.push({ id: 'adv-1', title: 'Visibility Surge Needed', content: 'Aggressive marketing recommended.', type: 'strategy', priority: 'high' });
    }
    this.advisorAdvice.set(advice);
  }

  getUpgradeRecommendations(): UpgradeRecommendation[] {
    const profile = this.userProfileService.profile();
    const reputation = this.reputationService.state();

    return UPGRADE_DB.filter(item => {
      const levelMatch = reputation.level >= item.minLevel;
      const genreMatch = !item.genres || item.genres.includes(profile.primaryGenre);
      const notOwned = !profile.equipment?.includes(item.title) && !profile.daw?.includes(item.title);
      return levelMatch && genreMatch && notOwned;
    }).slice(0, 5);
  }

  async getStrategicRecommendations(): Promise<StrategicRecommendation[]> {
    return [{ id: 's1', action: 'Scale Marketing Operations', impact: 'Extreme', difficulty: 'High', toolId: 'strategy' }];
  }

  async studyTrack(b: AudioBuffer, n: string): Promise<void> {}
  async getAutoMixSettings(): Promise<any> { return { threshold: -18, ratio: 3.5, ceiling: -0.2 }; }
  getViralHooks(): string[] { return ["Algorithm Shift", "Transition Logic"]; }

  async startAIBassist() { this.isAIBassistActive.set(true); }
  async stopAIBassist() { this.isAIBassistActive.set(false); }
  async startAIDrummer() { this.isAIDrummerActive.set(true); }
  async stopAIDrummer() { this.isAIDrummerActive.set(false); }
  async startAIKeyboardist() { this.isAIKeyboardistActive.set(true); }
  async stopAIKeyboardist() { this.isAIKeyboardistActive.set(false); }

  getDynamicChecklist(): StrategicTask[] {
    return [{ id: '1', label: 'Optimize Master Bus', completed: false, category: 'production', impact: 'Medium' }];
  }

  async generateImage(prompt: string): Promise<string> { return 'https://picsum.photos/seed/smuve/800/600'; }
  async generateContent(params: any): Promise<any> { return { text: 'Strategic response synchronized.' }; }
  async mimicStyle(name: string): Promise<string> { return `Mimicking ${name} specifications.`; }
  async updateCoreTrends(): Promise<void> {}
  async researchArtist(name: string): Promise<string> { return `Intel on ${name} compiled.`; }
  async transcribeAudio(b: string, m: string): Promise<string> { return "Transcription complete."; }
}

const UPGRADE_DB: UpgradeRecommendation[] = [
  { id: 'u-20', title: 'Neural Audio Interface V1', type: 'Gear', description: 'Elite neural-link interface.', cost: 'Priceless', url: '', minLevel: 5, impact: 'Extreme', genres: ['Techno', 'Electronic', 'Hip Hop'] },
  { id: 'u-42', title: 'Analog Mastering Chain', type: 'Gear', description: 'High-end analog rack.', cost: '5,000', url: '', minLevel: 8, impact: 'Extreme' },
  { id: 'u-101', title: 'Auteur Mastering Chain', type: 'Gear', description: 'Professional grade mastering processors.', cost: '12,000', url: '', minLevel: 15, impact: 'Extreme' }
];

export function provideAiService(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: AiService, useClass: AiService }]);
}
