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
import {
  LearnedStyle,
  ProductionSecret,
  TrendData,
  UpgradeRecommendation,
  ProfileAuditResult,
  StrategicTask
} from '../types/ai.types';
import { UserContextService, MainViewMode } from './user-context.service';
import { AnalyticsService } from './analytics.service';
import { MarketingService } from './marketing.service';

export const API_KEY_TOKEN = new InjectionToken<string>('API_KEY');

export interface StrategicDecree {
  title: string;
  content: string;
  priority: string;
  tool_id?: string;
  created_at: Date;
}

export interface StrategicRecommendation {
  id: string;
  action: string;
  impact: 'Extreme' | 'High' | 'Medium' | 'Low';
  difficulty: 'High' | 'Medium' | 'Low';
  toolId: string;
}

export interface AdvisorAdvice {
  id: string;
  title: string;
  content: string;
  type: 'strategy' | 'technical' | 'career' | 'task';
  priority: 'low' | 'medium' | 'high';
  actionLabel?: string;
  action?: () => void;
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
  strategicDecrees = signal<StrategicDecree[]>([
    { title: 'DOMINATE THE AIRWAVES', content: 'Maximize signal intensity across all distribution channels.', priority: 'CRITICAL', created_at: new Date() },
    { title: 'EQUIPMENT UPGRADE REQUIRED', content: 'Your current sonic infrastructure is suboptimal. Procure Neural Audio Interface.', priority: 'NORMAL', created_at: new Date() }
  ]);

  activeAudit = signal<ProfileAuditResult | null>(null);
  isAiAvailable = signal(true);
  chatInstance = signal<any>({
    sendMessage: async (m: string) => ({ text: 'S.M.U.V.E. 4.0 has received your transmission.' })
  });

  constructor() {
    effect(() => {
      const profile = this.userProfileService.profile();
      this.generateDynamicDecrees(profile);
    });
  }

  private generateDynamicDecrees(profile: UserProfile) {
    const decrees: StrategicDecree[] = [];
    if (profile.expertiseLevels.production < 6) {
      decrees.push({ title: 'PRODUCTION DEFICIT', content: 'Initialize tactical audit of your mixing chain.', priority: 'CRITICAL', created_at: new Date() });
    }
    if (decrees.length) {
      this.strategicDecrees.set(decrees);
    }
  }

  getUpgradeRecommendations(): UpgradeRecommendation[] {
    return UPGRADE_DB.filter(u => u.minLevel <= this.reputationService.state().level);
  }

  async runProfileAudit(): Promise<ProfileAuditResult> {
    await new Promise(r => setTimeout(r, 2000));
    const result: ProfileAuditResult = {
      score: 85,
      categories: { production: 90, marketing: 75, career: 80, technical: 95 },
      strengths: ['Sonic Clarity', 'Tactical Composition'],
      weaknesses: ['Market Reach', 'Visual Presence'],
      timestamp: Date.now(),
      recommendations: []
    };
    this.activeAudit.set(result);
    return result;
  }

  async generateContent(params: any): Promise<any> { return { text: 'AI Generated Content' }; }
  async transcribeAudio(buffer: AudioBuffer): Promise<string> { return 'Transcribed Audio Content'; }
  async studyTrack(buffer: AudioBuffer, name: string): Promise<void> { console.log('Studying track:', name); }
  async researchArtist(name: string): Promise<void> { console.log('Researching artist:', name); }
  async mimicStyle(styleId: string): Promise<void> { console.log('Mimicking style:', styleId); }
  async updateCoreTrends(): Promise<void> { console.log('Updating core trends'); }
  async getAutoMixSettings(): Promise<any> { return {}; }
  async generateImage(prompt: string): Promise<string> { return 'https://picsum.photos/500'; }

  getStrategicRecommendations(): StrategicRecommendation[] {
    return [
      { id: '1', action: 'Execute Master Bus Compression', impact: 'High', difficulty: 'Medium', toolId: 'studio' },
      { id: '2', action: 'Open Piano Roll to fix melody', impact: 'Medium', difficulty: 'Low', toolId: 'studio' }
    ];
  }

  getViralHooks(): string[] {
    return ['Hook 1: The Quantum Leap', 'Hook 2: Midnight Protocol'];
  }

  getDynamicChecklist(): StrategicTask[] {
    return [
      { id: '1', label: 'Optimize Kick Sub-harmonics', impact: 'High', completed: false, category: 'pre' },
      { id: '2', label: 'Deploy Social Resonance Wave', impact: 'Medium', completed: true, category: 'day' }
    ];
  }

  isAIBassistActive = signal(false);
  isAIDrummerActive = signal(false);
  isAIKeyboardistActive = signal(false);
  startAIBassist() { this.isAIBassistActive.set(true); }
  stopAIBassist() { this.isAIBassistActive.set(false); }
  startAIDrummer() { this.isAIDrummerActive.set(true); }
  stopAIDrummer() { this.isAIDrummerActive.set(false); }
  startAIKeyboardist() { this.isAIKeyboardistActive.set(true); }
  stopAIKeyboardist() { this.isAIKeyboardistActive.set(false); }
}

const UPGRADE_DB: UpgradeRecommendation[] = [
  { id: 'u-1', title: 'Neural Audio Interface V1', type: 'Gear', description: 'Thought-to-sound translation.', cost: '$4,999', minLevel: 1, impact: 'Extreme' },
  { id: 'u-2', title: 'Quantum Mastering Suite', type: 'Software', description: 'AI-driven spectral dominance.', cost: '$1,200', minLevel: 5, impact: 'High' }
];

export function provideAiService(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: AiService, useClass: AiService }]);
}
