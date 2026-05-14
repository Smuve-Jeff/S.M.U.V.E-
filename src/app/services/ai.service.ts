import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { UserProfileService, UserProfile } from './user-profile.service';
import { UserContextService, MainViewMode } from './user-context.service';
import { LoggingService } from './logging.service';
import { NEURAL_UPGRADE_BLUEPRINTS } from './neural-upgrades.data';
import { StrategicTask, UpgradeRecommendation } from '../types/ai.types';

export type { StrategicTask, UpgradeRecommendation };

export interface UpgradeBlueprint {
  id: string;
  title: string;
  type: 'Software' | 'Cloud Service' | 'Hardware';
  description: string;
  cost: string;
  impact: 'High' | 'Medium' | 'Low' | 'Transformative' | 'Critical';
  rationale: string;
  targetArea:
    | 'Production'
    | 'Mixing'
    | 'Mastering'
    | 'Rhythm'
    | 'Sampling & Remixing'
    | 'Arrangement'
    | 'Vocals';
  priority: 'High' | 'Medium' | 'Critical';
  prerequisites: string[];
  actionLabel: string;
  toolId: string;
  outcomeMetric: { label: string; value: string };
  preferredViews?: MainViewMode[];
  rank: (context: {
    profile: UserProfile;
    context: any;
    viewMode: MainViewMode;
  }) => number;
}

@Injectable({
  providedIn: 'root',
})
export class AiService {
  private http = inject(HttpClient);
  private userProfileService = inject(UserProfileService);
  private userContext = inject(UserContextService);
  private logger = inject(LoggingService);

  unlockedUpgrades = signal<string[]>([]);
  availableUpgrades = computed(() => this.getRankedUpgrades());
  isProcessing = signal(false);
  isScanning = signal(false);
  isMobile = signal(false);
  strategicDecrees = signal<string[]>([]);
  intelligenceBriefs = signal<any[]>([]);
  advisorAdvice = signal<any[]>([]);
  marketAlerts = signal<any[]>([]);
  executiveAudit = signal<any>(null);

  isAIDrummerActive = signal(false);
  isAIBassistActive = signal(false);
  isAIKeyboardistActive = signal(false);

  constructor() {
    this.logger.info('AiService Initialized: V8.2 Enhanced');
  }

  unlockUpgrade(upgradeId: string): void {
    if (this.unlockedUpgrades().includes(upgradeId)) {
      this.logger.info(`Upgrade ${upgradeId} is already unlocked.`);
      return;
    }
    this.isProcessing.set(true);
    setTimeout(() => {
      this.unlockedUpgrades.update((current) => [...current, upgradeId]);
      this.isProcessing.set(false);
    }, 1500);
  }

  isUnlocked(upgradeId: string): boolean {
    return this.unlockedUpgrades().includes(upgradeId);
  }

  getUpgradeRecommendations(): UpgradeRecommendation[] {
    return this.getRankedUpgrades() as any;
  }

  private getRankedUpgrades(): any[] {
    const profile = this.userProfileService.profile();
    const viewMode = this.userContext.mainViewMode();
    const context = {
      trackCount: profile.catalog?.length || 0,
      releaseReadyCount:
        profile.catalog?.filter((t) => (t as any).status === 'ready').length ||
        0,
      hasMicrophone: profile.equipment?.includes('Microphone') || false,
      activeLoopBars: 0,
    };

    const unlocked = this.unlockedUpgrades();
    const ranked = NEURAL_UPGRADE_BLUEPRINTS.map((blueprint) => {
      const rankScore = blueprint.rank({ profile, context, viewMode });
      const state = unlocked.includes(blueprint.id) ? 'unlocked' : 'locked';
      return { ...blueprint, rankScore, state };
    });

    return ranked.sort((a, b) => b.rankScore - a.rankScore);
  }

  async getAIResponse(prompt: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.http.post<{ text: string }>('/api/ai/analyze', { prompt })
      );
      return response.text;
    } catch (err) {
      this.logger.error('AiService: Backend link failed', err);
      return 'Strategic Link Severed. Offline processing active.';
    }
  }

  async generateAiResponse(prompt: string): Promise<string> {
    return this.getAIResponse(prompt);
  }

  async syncKnowledgeBaseWithProfile(): Promise<void> {
    const profile = this.userProfileService.profile();
    const prompt = `Syncing artist knowledge base for: ${profile.artistName}. Current expertise: ${JSON.stringify(profile.expertise)}.`;
    await this.getAIResponse(prompt);
  }

  async getAutoMixSettings(): Promise<any> {
    const res = await this.getAIResponse('Analyze current mix and provide optimal mastering settings as JSON.');
    try {
       return JSON.parse(res);
    } catch {
       return { threshold: -14, ratio: 4, ceiling: -0.1 };
    }
  }

  getProductionSmartAssist(context: any): any {
    return {
      suggestion: 'Analyze frequency masking between kick and bass.',
      correctivePreset: {
        compressorThreshold: -16,
        compressorRatio: 3.5,
        limiterCeiling: -0.2,
        targetLufs: -14,
      },
      arrangementSuggestion: 'The energy drops too much at bar 32. Consider an impact riser.',
      eqMaskingHint: 'Boost 3.5kHz on vocals for presence.',
    };
  }

  async getQuestionnaireInsights(draft: any): Promise<any> {
    const res = await this.getAIResponse(`Review this release draft: ${JSON.stringify(draft)}. Provide strategic insights.`);
    return { insights: res };
  }

  async processCommand(text: string): Promise<string> {
    return this.getAIResponse(`Process command: ${text}`);
  }

  async getStrategicRecommendations(): Promise<any[]> {
    const res = await this.getAIResponse('Provide 3 strategic artist career recommendations based on market trends.');
    return [{ title: 'Market Shift', advice: res }];
  }

  async generateImage(prompt: string): Promise<string> {
    await this.getAIResponse(`Artist requesting visual generation: ${prompt}`);
    return 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=2070&auto=format&fit=crop';
  }

  async getViralHooks() {
    const res = await this.getAIResponse('Generate 3 viral TikTok hooks for a tech-noir electronic track.');
    return res.split('\n').filter(l => l.trim().length > 0);
  }

  startAIDrummer() { this.isAIDrummerActive.set(true); }
  stopAIDrummer() { this.isAIDrummerActive.set(false); }
  startAIBassist() { this.isAIBassistActive.set(true); }
  stopAIBassist() { this.isAIBassistActive.set(false); }
  startAIKeyboardist() { this.isAIKeyboardistActive.set(true); }
  stopAIKeyboardist() { this.isAIKeyboardistActive.set(false); }

  async performExecutiveAudit() {
    const profile = this.userProfileService.profile();
    const res = await this.getAIResponse(`Perform a full strategic career audit for ${profile.artistName}. Data: ${JSON.stringify(profile)}`);
    this.executiveAudit.set({ report: res, timestamp: Date.now() });
  }

  studyTrack(buffer: any, name: string) {
    this.logger.info('Studying track: ' + name);
  }

  getDynamicChecklist(): StrategicTask[] {
    return [
      { id: 'task-1', label: 'Optimize Q4 Release Strategy', completed: false, category: 'Marketing', impact: 'High' },
      { id: 'task-2', label: 'Refine Vocal Chain Presence', completed: false, category: 'Production', impact: 'Medium' },
      { id: 'task-3', label: 'Sync Official Digital Split Sheets', completed: true, category: 'Legal', impact: 'Critical' }
    ];
  }

  async proactiveStrategicPulse() {
    const profile = this.userProfileService.profile();
    const res = await this.getAIResponse(`Generate a Strategic Decree for ${profile.artistName} based on their current trajectory.`);
    this.strategicDecrees.update(d => [res, ...d]);
  }
}

export function provideAiService() {
  return { provide: AiService, useClass: AiService };
}

export { AiService as NeuralOrchestratorService };
