import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, of } from 'rxjs';
import { UserProfileService, UserProfile } from './user-profile.service';
import { UserContextService, MainViewMode } from './user-context.service';
import { AnalyticsService } from './analytics.service';
import { LoggingService } from './logging.service';
import { NEURAL_UPGRADE_BLUEPRINTS } from './neural-upgrades.data';

export interface UpgradeRecommendation {
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
  state: 'locked' | 'unlocked' | 'suggested' | 'ignored';
  rankScore: number;
}

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
  private analyticsService = inject(AnalyticsService);
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
    this.logger.info('AiService Initialized: V7.2');
  }

  unlockUpgrade(upgradeId: string): void {
    if (this.unlockedUpgrades().includes(upgradeId)) return;
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
    return this.getRankedUpgrades();
  }

  private getRankedUpgrades(): UpgradeRecommendation[] {
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

    const ranked = NEURAL_UPGRADE_BLUEPRINTS.map((blueprint) => {
      const rankScore = blueprint.rank({ profile, context, viewMode });
      const state: 'locked' | 'unlocked' | 'suggested' | 'ignored' =
        this.isUnlocked(blueprint.id) ? 'unlocked' : 'locked';
      return { ...blueprint, rankScore, state };
    });

    return ranked.sort((a, b) => b.rankScore - a.rankScore);
  }

  async getAIResponse(prompt: string): Promise<string> {
    return 'Simulated AI Response';
  }

  async generateAiResponse(prompt: string): Promise<string> {
    return this.getAIResponse(prompt);
  }

  async syncKnowledgeBaseWithProfile(): Promise<void> {
    return;
  }

  async getAutoMixSettings(): Promise<any> {
    return { threshold: -12, ratio: 4 };
  }

  getProductionSmartAssist(context: any): any {
    return {
      suggestion: 'Add more sub-bass',
      correctivePreset: {
        compressorThreshold: -14,
        compressorRatio: 4,
        limiterCeiling: -0.1,
        targetLufs: -14,
      },
      arrangementSuggestion: 'Try a shorter bridge',
      eqMaskingHint: 'Check 200Hz',
    };
  }

  async getQuestionnaireInsights(draft: any): Promise<any> {
    return { insights: 'Looks good' };
  }

  async processCommand(text: string): Promise<string> {
    return 'Command processed: ' + text;
  }

  async getStrategicRecommendations(): Promise<any[]> {
    return [];
  }

  async generateImage(prompt: string): Promise<string> {
    return 'https://example.com/image.png';
  }

  getViralHooks() {
    return [];
  }
  startAIDrummer() {
    this.isAIDrummerActive.set(true);
  }
  stopAIDrummer() {
    this.isAIDrummerActive.set(false);
  }
  startAIBassist() {
    this.isAIBassistActive.set(true);
  }
  stopAIBassist() {
    this.isAIBassistActive.set(false);
  }
  startAIKeyboardist() {
    this.isAIKeyboardistActive.set(true);
  }
  stopAIKeyboardist() {
    this.isAIKeyboardistActive.set(false);
  }
  performExecutiveAudit() {
    this.logger.info('Executive Audit Performed');
  }
  studyTrack(buffer: any, name: string) {
    this.logger.info('Studying track: ' + name);
  }
  getDynamicChecklist() {
    return [];
  }
  proactiveStrategicPulse() {}
}

export function provideAiService() {
  return { provide: AiService, useClass: AiService };
}

export { AiService as NeuralOrchestratorService };
