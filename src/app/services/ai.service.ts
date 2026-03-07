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
import { TrackNote } from './music-manager.service';
import { LearnedStyle, ProductionSecret, TrendData, UpgradeRecommendation } from '../types/ai.types';
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
  impact: 'High' | 'Medium' | 'Low';
  difficulty: 'High' | 'Medium' | 'Low';
  toolId: string;
}

export interface Content {
  role: 'user' | 'model' | 'system';
  parts: Part[];
}

export interface Part {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export interface GenerateContentParameters {
  model: string;
  contents: Content[];
}

export interface GenerateContentResponse {
  text: string;
}

export interface GoogleGenAI {
  models: {
    generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse>;
  };
}

export interface Chat {
  sendMessage(message: string): Promise<GenerateContentResponse>;
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

  private static readonly CHAT_MODEL = 'gemini-1.5-pro-latest';
  private _apiKey = inject(API_KEY_TOKEN, { optional: true });
  private _genAI = signal<GoogleGenAI | undefined>(undefined);
  private _chatInstance = signal<Chat | undefined>(undefined);

  isMockMode = signal(false);
  isAiAvailable = computed(() => !!this._genAI() || this.isMockMode());

  isAIBassistActive = signal(false);
  isAIDrummerActive = signal(false);
  isAIKeyboardistActive = signal(false);

  strategicDecrees = signal<string[]>(['DOMINATE THE AIRWAVES', 'MAXIMIZE STREAMING REVENUE', 'ELIMINATE WEAK CONTENT']);

  constructor() {
    this.initializeGenAI();

    // Advisor & Adaptability Logic
    effect(() => {
      const view = this.userContextService.mainViewMode();
      const profile = this.userProfileService.profile();
      this.updateAdvisorAdvice(view, profile);
    });

    // Re-initialize chat when profile or reputation changes
    effect(() => {
      const profile = this.userProfileService.profile();
      const rep = this.reputationService.state();
      if (profile && rep) {
        this.initializeChat(profile);
      }
    });
  }

  private updateAdvisorAdvice(view: MainViewMode, profile: UserProfile) {
    const advice: AdvisorAdvice[] = [];
    const growth = this.analyticsService.overallGrowth();
    const engagement = this.analyticsService.engagement();

    if (growth < 5) {
      this.currentStrategyMode.set('growth');
    } else if (engagement.trend < 0) {
      this.currentStrategyMode.set('retention');
    } else {
      this.currentStrategyMode.set('experimental');
    }

    const mode = this.currentStrategyMode();

    if (mode === 'growth') {
      advice.push({
        id: 'adv-growth-1',
        title: 'Visibility Surge Needed',
        content: `Your overall growth is at ${growth.toFixed(1)}%. I recommend an aggressive TikTok campaign focused on your top track.`,
        type: 'strategy',
        priority: 'high',
        actionLabel: 'Setup Ad Campaign',
        action: () => this.userContextService.setMainViewMode('strategy')
      });
    } else if (mode === 'retention') {
       advice.push({
        id: 'adv-ret-1',
        title: 'Community Warning',
        content: 'Engagement is dipping. Shift your marketing focus to "Behind-the-Scenes" content for the next 7 days.',
        type: 'strategy',
        priority: 'high',
        actionLabel: 'Draft Social Schedule',
        action: () => this.draftSocialSchedule()
      });
    } else {
       advice.push({
        id: 'adv-exp-1',
        title: 'Experimental Expansion',
        content: 'Your metrics are stable. Optimal time for cross-genre collaborations.',
        type: 'career',
        priority: 'medium'
      });
    }

    if (view === 'studio') {
      advice.push({
        id: 'adv-studio-1',
        title: 'Adaptive Mixing',
        content: 'Current streaming algorithms favor high-clarity vocals. Try a 3kHz boost.',
        type: 'technical',
        priority: 'medium'
      });
    }

    const pendingDistro = profile.catalog?.filter(i => i.status === 'completed' && !i.metadata.isrc);
    if (pendingDistro?.length) {
       advice.push({
        id: 'adv-distro-1',
        title: 'Unreleased Revenue',
        content: `You have ${pendingDistro.length} masters ready. Shall I draft a distribution checklist?`,
        type: 'task',
        priority: 'high',
        actionLabel: 'Generate Checklist',
        action: () => this.autoGenerateChecklist()
      });
    }


    // Multi-Tiered Strategic Advice
    const totalStreams = this.analyticsService.streams().value;
    if (totalStreams > 100000 && mode === 'growth') {
       advice.push({
        id: 'adv-milestone-1',
        title: 'Elite Status Near',
        content: 'You are approaching 150k streams. Secure your master rights and consider a sync licensing agent now.',
        type: 'career',
        priority: 'high',
        actionLabel: 'Check Legal Docs',
        action: () => this.userContextService.setMainViewMode('profile')
      });
    }

    if (profile.skills.includes('DJ') && view === 'dj') {
       advice.push({
        id: 'adv-dj-1',
        title: 'Live Energy Strategy',
        content: 'Your current set has a slow energy ramp. Try moving your highest BPM track to the 15-minute mark.',
        type: 'technical',
        priority: 'medium'
      });
    }


    // Marketing Automation Suggestions
    if (growth > 10 && mode === 'growth') {
       advice.push({
        id: 'adv-promo-1',
        title: 'Promotion Surge Identified',
        content: 'I have identified a viral trend matching your style. Shall I draft a promotion schedule for your latest master?',
        type: 'task',
        priority: 'high',
        actionLabel: 'Draft Schedule',
        action: () => this.draftPromotionSchedule()
      });
    }

    this.advisorAdvice.set(advice);
  }

  async autoGenerateChecklist() {
    const profile = this.userProfileService.profile();
    const newTask: any = {
      id: `task-${Date.now()}`,
      title: 'Finalize Distribution Metadata',
      description: 'Generate ISRC, UPC, and confirm credits.',
      category: 'distribution',
      status: 'pending',
      priority: 'high',
      aiSuggested: true
    };
    await this.userProfileService.updateProfile({
      ...profile,
      tasks: [...(profile.tasks || []), newTask]
    });
    this.userContextService.setMainViewMode('profile');
  }


  async draftPromotionSchedule() {
    const profile = this.userProfileService.profile();
    const newTask: any = {
      id: `task-${Date.now()}`,
      title: 'Viral Trend Promotion Schedule',
      description: '7-day aggressive rollout strategy for social media based on current viral trends.',
      category: 'marketing',
      status: 'pending',
      priority: 'high',
      aiSuggested: true
    };
    await this.userProfileService.updateProfile({
      ...profile,
      tasks: [...(profile.tasks || []), newTask]
    });
    this.userContextService.setMainViewMode('profile');
  }


  async draftSocialSchedule() {
    const profile = this.userProfileService.profile();
    const newTask: any = {
      id: `task-${Date.now()}`,
      title: 'Retention-Focused Social Blast',
      description: 'Draft 3 "Authentic Connection" posts.',
      category: 'marketing',
      status: 'pending',
      priority: 'high',
      aiSuggested: true
    };
    await this.userProfileService.updateProfile({
      ...profile,
      tasks: [...(profile.tasks || []), newTask]
    });
    this.userContextService.setMainViewMode('profile');
  }

  private async initializeGenAI(): Promise<void> {
    if (!this._apiKey || this._apiKey.length < 30) {
      console.warn('AiService: Invalid or missing API key. Enabling Mock Mode for testing.');
      this.isMockMode.set(true);
      return;
    }
  }

  private async initializeChat(profile: UserProfile): Promise<void> {}

  get chatInstance() {
    return this._chatInstance.asReadonly();
  }

  async generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse> {
    if (this.isMockMode()) {
      return { text: `[MOCK RESPONSE]: Strategic analysis complete.` };
    }
    return { text: 'AI Response' };
  }

  async transcribeAudio(base64Audio: string, mimeType: string): Promise<string> {
    return "Mock Transcription";
  }


  getUpgradeRecommendations(): UpgradeRecommendation[] {
    const profile = this.userProfileService.profile();
    const level = this.reputationService.state().level;
    return UPGRADE_DB.filter(item => level >= item.minLevel).slice(0, 5);
  }


  async getStrategicRecommendations(): Promise<StrategicRecommendation[]> {
    return [];
  }

  async generateMusic(prompt: string): Promise<any[]> {
    return [{ note: 'C4', velocity: 0.8, time: 0, duration: '4n' }];
  }

  async startAIBassist() { this.audioEngineService.resume(); this.isAIBassistActive.set(true); }
  async stopAIBassist() { this.isAIBassistActive.set(false); }
  async startAIDrummer() { this.audioEngineService.resume(); this.isAIDrummerActive.set(true); }
  async stopAIDrummer() { this.isAIDrummerActive.set(false); }
  async startAIKeyboardist() { this.audioEngineService.resume(); this.isAIKeyboardistActive.set(true); }
  async stopAIKeyboardist() { this.isAIKeyboardistActive.set(false); }

  async generateImage(prompt: string): Promise<string> {
    return 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&q=80&w=1000';
  }

  async getAutoMixSettings(): Promise<{ threshold: number; ratio: number; ceiling: number }> {
    return { threshold: -18, ratio: 2, ceiling: -0.1 };
  }

  async studyTrack(audioBuffer: AudioBuffer, trackName: string): Promise<void> {}

  async researchArtist(artistName: string): Promise<string> {
    return `S.M.U.V.E: Intelligence report on ${artistName} complete. Tactical advantages identified.`;
  }

  async mimicStyle(artistName: string): Promise<string> {
    return `S.M.U.V.E: Sonic signature of ${artistName} analyzed. Mimicry protocols engaged.`;
  }

  async updateCoreTrends(): Promise<void> {
    console.log('S.M.U.V.E: Updating core market trends...');
  }

}


const UPGRADE_DB: UpgradeRecommendation[] = [
  { id: 'u-1', title: 'Neumann U87 Ai', type: 'Gear', description: 'Gold standard studio microphone.', cost: ',600', url: 'https://en-de.neumann.com', minLevel: 10, impact: 'High' },
  { id: 'u-31', title: 'Sub-Atomic Kick Pack', type: 'Software', description: 'Low-frequency dominance.', cost: '9', url: 'https://smuve.ai', minLevel: 5, impact: 'High', genres: ['Trap', 'Hip-Hop'] }
];

export function provideAiService(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: AiService, useClass: AiService }]);
}
