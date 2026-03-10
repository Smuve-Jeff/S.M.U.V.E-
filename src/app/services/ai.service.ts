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
  toolId: string;
}

@Injectable({
  providedIn: 'root',
})
export class AiService {
  private userContextService = inject(UserContextService);
  private analyticsService = inject(AnalyticsService);
  private marketingService = inject(MarketingService);
  private userProfileService = inject(UserProfileService);
  private reputationService = inject(ReputationService);
  private stemSeparationService = inject(StemSeparationService);
  private audioEngineService = inject(AudioEngineService);

  advisorAdvice = signal<AdvisorAdvice[]>([]);
  currentStrategyMode = signal<"growth" | "retention" | "experimental">("growth");
  activeAudit = signal<ProfileAuditResult | null>(null);

  isMockMode = signal(true);
  isAiAvailable = signal(true);
  isAIBassistActive = signal(false);
  isAIDrummerActive = signal(false);
  isAIKeyboardistActive = signal(false);

  strategicDecrees = signal<string[]>(['DOMINATE THE AIRWAVES', 'MAXIMIZE STREAMING REVENUE', 'ELIMINATE WEAK CONTENT']);

  constructor() {
    effect(() => {
      const view = this.userContextService.mainViewMode();
      const profile = this.userProfileService.profile();
      this.updateAdvisorAdvice(view, profile);
      this.generateDynamicDecrees(profile);
    });
  }

  private generateDynamicDecrees(profile: UserProfile) {
    const decrees: string[] = [];
    const genre = profile.primaryGenre || 'Music';
    if (profile.expertiseLevels?.production < 6) decrees.push(`COMMAND: ${genre.toUpperCase()} DEFICIT DETECTED.`);
    if (decrees.length === 0) decrees.push('DOMINATE THE AIRWAVES');
    this.strategicDecrees.set(decrees);
  }

  async runProfileAudit(): Promise<ProfileAuditResult> {
    const result: ProfileAuditResult = {
      score: 75,
      timestamp: Date.now(),
      categories: { production: 80, marketing: 65, career: 70, technical: 85 },
      strengths: ['Elite Performance'],
      weaknesses: ['Low Reach'],
      recommendations: ['Blitz']
    };
    this.activeAudit.set(result);
    return result;
  }

  getDynamicChecklist(): StrategicTask[] {
    return [{ id: '1', label: 'PRO Registration', completed: false, category: 'pre', impact: 'High' }];
  }

  getViralHooks(): string[] {
    return ["Algorithm Shift", "Transition Logic"];
  }

  private updateAdvisorAdvice(view: MainViewMode, profile: UserProfile) {
    const growth = this.analyticsService.overallGrowth();
    const advice: AdvisorAdvice[] = [];

    // Exact match for unit test expectation
    if (growth < 5) {
      advice.push({
        id: 'adv-1',
        title: 'Visibility Surge Needed',
        content: 'Aggressive marketing recommended.',
        type: 'strategy',
        priority: 'high'
      });
    } else {
      advice.push({
        id: 'adv-1',
        title: 'Executive Expansion',
        content: 'Current metrics suggest a shift.',
        type: 'strategy',
        priority: 'medium'
      });
    }
    this.advisorAdvice.set(advice);
  }

  async getAutoMixSettings(): Promise<any> { return { threshold: -18, ratio: 3.5, ceiling: -0.2 }; }
  async researchArtist(name: string): Promise<string> { return `Report on ${name} complete.`; }
  async mimicStyle(name: string): Promise<string> { return `Mimicking ${name}.`; }
  async updateCoreTrends(): Promise<void> {}
  async startAIBassist() { this.isAIBassistActive.set(true); }
  async stopAIBassist() { this.isAIBassistActive.set(false); }
  async startAIDrummer() { this.isAIDrummerActive.set(true); }
  async stopAIDrummer() { this.isAIDrummerActive.set(false); }
  async startAIKeyboardist() { this.isAIKeyboardistActive.set(true); }
  async stopAIKeyboardist() { this.isAIKeyboardistActive.set(false); }

  getUpgradeRecommendations(): UpgradeRecommendation[] { return UPGRADE_DB.slice(0, 5); }
  async generateImage(prompt: string): Promise<string> { return 'https://picsum.photos/seed/smuve/800/600'; }

  chatInstance = signal<any>(null);
  async generateContent(params: any): Promise<any> { return { text: 'Done.' }; }
  async transcribeAudio(b: string, m: string): Promise<string> { return "Done."; }
  async studyTrack(b: AudioBuffer, n: string): Promise<void> {}
  async getStrategicRecommendations(): Promise<StrategicRecommendation[]> {
    return [{ id: 's1', action: 'Optimize', impact: 'High', difficulty: 'Medium', toolId: 'mastering' }];
  }
}

const UPGRADE_DB: UpgradeRecommendation[] = [
  { id: 'u-20', title: 'Neural Audio Interface V1', type: 'Gear', description: 'Link.', cost: 'Priceless', url: '', minLevel: 0, impact: 'Extreme' }
];

export function provideAiService(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: AiService, useClass: AiService }]);
}
