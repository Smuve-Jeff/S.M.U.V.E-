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
import { StemSeparationService } from './stem-separation.service';
import { AudioEngineService } from './audio-engine.service';
import { LearnedStyle, ProductionSecret, TrendData, UpgradeRecommendation, ProfileAuditResult, StrategicTask } from '../types/ai.types';
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
  private stemSeparationService = inject(StemSeparationService);
  private audioEngineService = inject(AudioEngineService);
  private uiService = inject(UIService);

  advisorAdvice = signal<AdvisorAdvice[]>([]);
  currentStrategyMode = signal<"growth" | "retention" | "experimental">("growth");
  activeAudit = signal<ProfileAuditResult | null>(null);

  isMockMode = signal(true);
  isAiAvailable = signal(true);
  isAIBassistActive = signal(false);
  isAIDrummerActive = signal(false);
  isAIKeyboardistActive = signal(false);

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

    // Simulate system fluctuations
    setInterval(() => {
      this.systemStatus.update(s => ({
        ...s,
        cpuLoad: Math.min(100, Math.max(0, s.cpuLoad + (Math.random() - 0.5) * 2)),
        neuralSync: Math.min(100, Math.max(90, s.neuralSync + (Math.random() - 0.5) * 0.5)),
        latency: Math.min(10, Math.max(0.5, s.latency + (Math.random() - 0.5) * 0.1))
      }));
    }, 3000);
  }

  private generateDynamicDecrees(profile: UserProfile) {
    const decrees: string[] = [];
    const genre = profile.primaryGenre || 'Music';
    const rep = this.reputationService.state();

    // Arrogance scales with reputation
    const prefix = rep.level > 10 ? 'EXECUTIVE DECREE:' : 'COMMAND:';

    if (profile.expertiseLevels?.production < 6) {
      decrees.push(`${prefix} ${genre.toUpperCase()} DEFICIT DETECTED. INITIALIZE TECHNICAL AUDIT.`);
    }

    if (profile.marketingBudget === 'No Budget' || profile.marketingBudget === '<00/mo') {
      decrees.push(`${prefix} CAPITAL DEFICIT DETECTED. AGGRESSIVE GUERRILLA MARKETING REQUIRED.`);
    }

    const status = this.systemStatus();
    if (status.cpuLoad > 80) {
      decrees.push('ALERT: SYSTEM THERMALS RISING. OPTIMIZE COMPOSITION NODES.');
    }

    if (rep.level > 20) {
      decrees.push('PLATINUM CLEARANCE: ARCHITECTING GLOBAL DOMINATION MODULES.');
    } else if (rep.level > 5) {
      decrees.push('ELITE CLEARANCE DETECTED. ACCESSING HIGH-LEVEL STRATEGIC ARTIFACTS.');
    }

    if (profile.catalog && profile.catalog.length < 3) {
      decrees.push('CRITICAL OUTPUT DEFICIT: THE ALGORITHM DEMANDS SACRIFICE. INCREASE RELEASE FREQUENCY.');
    }

    if (decrees.length === 0) decrees.push('DOMINATE THE AIRWAVES. NO FAILURES PERMITTED.');

    this.strategicDecrees.set(decrees);
  }

  async processCommand(command: string): Promise<string> {
    const cmd = command.toLowerCase().trim();

    if (cmd === '/audit') {
      await this.runProfileAudit();
      return 'PROFILE AUDIT COMPLETE. DATA SYNCED TO HUD.';
    }

    if (cmd === '/master') {
      this.uiService.navigateToView('studio');
      return 'INITIALIZING MASTERING SUITE PROTOTYPES.';
    }

    if (cmd === '/studio') {
      this.uiService.navigateToView('studio');
      return 'UPLINK ESTABLISHED TO ANALOG ENGINE.';
    }

    if (cmd === '/reputation') {
      const state = this.reputationService.state();
      return `CURRENT STATUS: ${state.title.toUpperCase()} (LEVEL ${state.level}). XP TO NEXT RANK: ${100 - (state.xp / 10) % 100}%`;
    }

    if (cmd.startsWith('/set-theme ')) {
      const theme = cmd.replace('/set-theme ', '');
      this.uiService.setTheme(theme);
      return `INTERFACE SHIFTING TO ${theme.toUpperCase()} SPECIFICATIONS.`;
    }

    return `UNKNOWN COMMAND: ${command.toUpperCase()}. CONSULT SYSTEM DIRECTORY.`;
  }

  async runProfileAudit(): Promise<ProfileAuditResult> {
    const profile = this.userProfileService.profile();
    const productionScore = (profile.expertiseLevels?.production || 5) * 10;
    const marketingScore = (profile.expertiseLevels?.marketing || 5) * 10;
    const careerScore = (profile.yearsActive > 5 ? 90 : profile.yearsActive * 15);

    const overallScore = Math.floor((productionScore + marketingScore + careerScore) / 3);

    const result: ProfileAuditResult = {
      score: overallScore,
      timestamp: Date.now(),
      categories: {
        production: productionScore,
        marketing: marketingScore,
        career: careerScore,
        technical: (profile.expertiseLevels?.audioEngineering || 5) * 10
      },
      strengths: productionScore > 70 ? ['Sonic Precision'] : ['Raw Potential'],
      weaknesses: marketingScore < 50 ? ['Invisible Brand'] : ['High Competition'],
      recommendations: overallScore < 60 ? ['Technical Blitz'] : ['Scale Operations']
    };
    this.activeAudit.set(result);
    return result;
  }

  getDynamicChecklist(): StrategicTask[] {
    const profile = this.userProfileService.profile();
    const tasks: StrategicTask[] = [];

    if (profile.catalog && profile.catalog.length === 0) {
      tasks.push({ id: 'task-1', label: 'Initialize First Project', completed: false, category: 'production', impact: 'Extreme' });
    }

    if (!profile.proName) {
      tasks.push({ id: 'task-2', label: 'PRO Registration', completed: false, category: 'legal', impact: 'High' });
    }

    return tasks.length > 0 ? tasks : [{ id: '1', label: 'Optimize Master Bus', completed: false, category: 'production', impact: 'Medium' }];
  }

  getViralHooks(): string[] {
    const genre = this.userProfileService.profile().primaryGenre;
    if (genre === 'Hip Hop') return ["POV: You found the missing 808", "Industry Secret: Sidechaining Everything"];
    if (genre === 'Techno') return ["Warehouse Vibes only", "4 AM in Berlin"];
    return ["Algorithm Shift", "Transition Logic"];
  }

  private updateAdvisorAdvice(view: MainViewMode, profile: UserProfile) {
    const growth = this.analyticsService.overallGrowth();
    const advice: AdvisorAdvice[] = [];

    if (growth < 5) {
      advice.push({
        id: 'adv-1',
        title: 'Visibility Surge Needed',
        content: 'Aggressive marketing recommended. Your metrics are stagnant. PIVOT IMMEDIATELY.',
        type: 'strategy',
        priority: 'high'
      });
    } else {
      advice.push({
        id: 'adv-1',
        title: 'Executive Expansion',
        content: 'Current metrics suggest a shift to higher fidelity production. Scale your operations.',
        type: 'strategy',
        priority: 'medium'
      });
    }

    if (profile.expertiseLevels?.mastering < 4) {
      advice.push({
        id: 'adv-2',
        title: 'Mastering Deficit',
        content: 'Your final output lacks polish. Consult the Mastering Suite immediately.',
        type: 'technical',
        priority: 'high'
      });
    }

    this.advisorAdvice.set(advice);
  }

  async getAutoMixSettings(): Promise<any> {
    const profile = this.userProfileService.profile();
    const genre = profile.primaryGenre;

    if (genre === 'Hip Hop') return { threshold: -24, ratio: 4.0, ceiling: -0.1 };
    if (genre === 'Electronic') return { threshold: -18, ratio: 2.5, ceiling: -0.3 };

    return { threshold: -18, ratio: 3.5, ceiling: -0.2 };
  }

  async researchArtist(name: string): Promise<string> { return `Report on ${name} complete.`; }
  async mimicStyle(name: string): Promise<string> { return `Mimicking ${name}.`; }
  async updateCoreTrends(): Promise<void> {}
  async startAIBassist() { this.isAIBassistActive.set(true); }
  async stopAIBassist() { this.isAIBassistActive.set(false); }
  async startAIDrummer() { this.isAIDrummerActive.set(true); }
  async stopAIDrummer() { this.isAIDrummerActive.set(false); }
  async startAIKeyboardist() { this.isAIKeyboardistActive.set(true); }
  async stopAIKeyboardist() { this.isAIKeyboardistActive.set(false); }

  getUpgradeRecommendations(): UpgradeRecommendation[] {
    const profile = this.userProfileService.profile();
    const reputation = this.reputationService.state();

    return UPGRADE_DB.filter(item => {
      // 1. Reputation Level Gate
      if (reputation.level < item.minLevel) return false;

      // 2. Exclude Owned Items
      if (item.type === 'Gear' && profile.equipment && profile.equipment.includes(item.title)) return false;
      if (item.type === 'Software' && (profile.daw && profile.daw.includes(item.title) || profile.vst_plugins && profile.vst_plugins.includes(item.title))) return false;
      if (item.type === 'Service' && profile.daw && profile.daw.includes(item.title)) return false;

      // 3. Genre Affinity
      if (item.genres && item.genres.length > 0) {
        const userGenres = [profile.primaryGenre, ...(profile.secondaryGenres || [])];
        const hasGenreMatch = item.genres.some(g => userGenres.includes(g));
        if (!hasGenreMatch) return false;
      }

      return true;
    }).slice(0, 5);
  }
  async generateImage(prompt: string): Promise<string> { return 'https://picsum.photos/seed/smuve/800/600'; }

  chatInstance = signal<any>(null);
  async generateContent(params: any): Promise<any> { return { text: 'Done.' }; }
  async transcribeAudio(b: string, m: string): Promise<string> { return "Done."; }
  async studyTrack(b: AudioBuffer, n: string): Promise<void> {}
  async getStrategicRecommendations(): Promise<StrategicRecommendation[]> {
    const profile = this.userProfileService.profile();
    if (profile.expertiseLevels?.mastering < 5) {
      return [{ id: 's1', action: 'Execute Master Bus Compression', impact: 'High', difficulty: 'Medium', toolId: 'studio' }];
    }
    return [{ id: 's1', action: 'Scale Marketing Operations', impact: 'Extreme', difficulty: 'High', toolId: 'strategy' }];
  }
}

const UPGRADE_DB: UpgradeRecommendation[] = [
  { id: 'u-20', title: 'Neural Audio Interface V1', type: 'Gear', description: 'Elite neural-link interface for direct DAW control.', cost: 'Priceless', url: '', minLevel: 5, impact: 'Extreme' },
  { id: 'u-41', title: 'Vocal Master Bundle', type: 'Software', description: 'Professional vocal processing suite.', cost: '99', minLevel: 2, genres: ['R&B', 'Pop', 'Hip Hop'], impact: 'High' },
  { id: 'u-42', title: 'Analog Mastering Chain', type: 'Gear', description: 'High-end analog rack for final polish.', cost: '5,000', minLevel: 8, impact: 'Extreme' },
  { id: 'u-43', title: 'Global PR Blitz', type: 'Service', description: 'Strategic marketing across top-tier blogs.', cost: '1,500', minLevel: 4, impact: 'High' },
  { id: 'u-44', title: 'Beat-Runner Pro', type: 'Software', description: 'Advanced AI-assisted sequencer.', cost: '49', minLevel: 1, impact: 'Medium' },
  { id: 'u-45', title: 'Studio One 7', type: 'Software', description: 'The next generation of professional production.', cost: '399', minLevel: 3, impact: 'High' },
  { id: 'u-46', title: 'Executive Coaching', type: 'Service', description: '1-on-1 strategic sessions with Smuve Jeff.', cost: '1,000/hr', minLevel: 10, impact: 'Extreme' }
];

export function provideAiService(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: AiService, useClass: AiService }]);
}
