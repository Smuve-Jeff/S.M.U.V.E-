import { Injectable, inject, signal, computed } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { MainViewMode } from './user-context.service';
import { MusicManagerService } from './music-manager.service';
import { STRATEGIC_DECREES } from './ai-knowledge.data';
import { NEURAL_UPGRADE_BLUEPRINTS } from './neural-upgrades.data';
import { NotificationService } from './notification.service';
import { MarketAlert } from '../types/ai.types';

export interface UpgradeRecommendation {
  id: string;
  title: string;
  type: string;
  description: string;
  cost: string;
  impact: 'Low' | 'Medium' | 'High' | 'Critical' | 'Extreme';
  prerequisites: string[];
  actionLabel: string;
  toolId: string;
  outcomeMetric: { label: string; value: string };
  preferredViews?: MainViewMode[];
  state?: 'locked' | 'unlocked' | 'acquired' | 'completed';
}

@Injectable({
  providedIn: 'root',
})
export class AiService {
  private userProfileService = inject(UserProfileService);
  private musicManager = inject(MusicManagerService);
  private notification = inject(NotificationService);

  strategicDecrees = signal<string[]>(STRATEGIC_DECREES);
  unlockedUpgrades = signal<string[]>([]);
  marketAlerts = signal<MarketAlert[]>([]);
  isProcessing = signal(false);
  isScanning = signal(false);
  isMobile = signal(false);
  executiveAudit = signal<any>(null);
  intelligenceBriefs = signal<any[]>([]);
  advisorAdvice = signal<any>(null);
  deepAuditResults = signal<any>(null);

  conversationalTier = computed(() => {
    const profile = this.userProfileService.profile();
    if (profile.profileSetupCompleted) {
      const tier = profile.settings?.ai?.aiConversationalTier;
      return tier === 'Standard' ? 'Elite' : tier || 'Elite';
    }
    return 'Standard';
  });

  availableUpgrades = computed(() => {
    return NEURAL_UPGRADE_BLUEPRINTS.map((u) => ({
      ...u,
      state: this.isUnlocked(u.id) ? 'unlocked' : 'locked',
    })) as UpgradeRecommendation[];
  });

  constructor() {}

  getUpgradeRecommendations() { return this.availableUpgrades(); }
  getStrategicRecommendations() { return this.availableUpgrades(); }
  async getAIResponse(prompt: string): Promise<string> { return `[SMUVE_RESPONSE] Simulated response`; }
  async generateAiResponse(prompt: string): Promise<string> { return this.getAIResponse(prompt); }
  async processCommand(text: string) { return 'Command processed'; }

  generateStrategicDecree() {
    const decrees = this.strategicDecrees();
    const decree = decrees[Math.floor(Math.random() * decrees.length)];
    this.notification.show(`STRATEGIC_DECREE: ${decree}`, 'info', 6000);
    return decree;
  }

  roastComponent(componentName: string) {
    const roasts = [
       `${componentName}? Amateur hour.`,
       `Your ${componentName} settings are offensive.`
    ];
    const roast = roasts[Math.floor(Math.random() * roasts.length)];
    this.notification.show(`S.M.U.V.E. ROAST: ${roast}`, 'warning', 4000);
  }

  getMasteringRoast(): string {
    return 'Elite Mastering Chain Engaged.';
  }

  private vulgarize(text: string): string {
    return text.replace(/ mediocre /g, ' f***ing mediocre ');
  }

  async syncKnowledgeBaseWithProfile() {}
  async getAutoMixSettings() { return { threshold: -14, ratio: 4, ceiling: -0.1, targetLufs: -14 }; }
  getProductionSmartAssist(context: any): any { return { advice: 'Add more saturation.', correctivePreset: {}, targetLufs: -14, arrangementSuggestion: '', eqMaskingHint: '' }; }

  async getQuestionnaireInsights(draft: any) {
    const journey = draft.musicalJourney || {};
    const insights = [];

    if (journey.primarySuccessMetric === 'Algorithmic Dominance') {
      insights.push({
        title: 'Algorithmic Warfare Strategy',
        content: 'Your focus on algorithmic dominance requires high release velocity. S.M.U.V.E will prioritize playlist-optimized arrangements (short intros, early hooks).',
        impact: 'Extreme'
      });
    }

    if (journey.productionPhilosophy === 'Lo-Fi Grit') {
      insights.push({
        title: 'Authenticity Calibration',
        content: 'Your Lo-Fi preference suggests a focus on texture over polish. S.M.U.V.E will adjust saturation and bit-crushing modules in the Vocal Suite.',
        impact: 'High'
      });
    }

    if (journey.releaseVelocity === 'Waterfall (Weekly)') {
      insights.push({
        title: 'Burnout Prevention Protocol',
        content: 'Weekly releases are high-stress. We are activating automated marketing asset generation to sustain your release trajectory.',
        impact: 'Critical'
      });
    }

    if (journey.collaborativeMode === 'Solo Specialist') {
      insights.push({
        title: 'S.M.U.V.E Virtual Bandmate',
        content: 'As a solo artist, S.M.U.V.E will fill the gaps. Activating AI Bassist and Drummer modules for all new sessions.',
        impact: 'Medium'
      });
    }

    if (journey.contentStrategy === 'Viral Hunt') {
      insights.push({
        title: 'Hook-Centric Production',
        content: 'Viral success depends on "The Moment". S.M.U.V.E will scan your tracks specifically for 15-second high-impact snippets suitable for social deployment.',
        impact: 'Extreme'
      });
    }

    if (insights.length === 0) {
      insights.push({
        title: 'Initial Trajectory Set',
        content: 'Musical journey captured. S.M.U.V.E is now fine-tuning your workspace for maximum artistic resonance.',
        impact: 'Low'
      });
    }

    return insights;
  }

  async generateImage(prompt: string) { return 'https://example.com/image.png'; }

  isUnlocked(id: string) { return true; }
  unlockUpgrade(id: string) { if (!this.unlockedUpgrades().includes(id)) this.unlockedUpgrades.update(u => [...u, id]); }

  isAIDrummerActive() { return true; }
  isAIBassistActive() { return false; }
  isAIKeyboardistActive() { return false; }
  startAIKeyboardist() {}
  stopAIKeyboardist() {}
  startAIBassist() {}
  stopAIBassist() {}
  startAIDrummer() {}
  stopAIDrummer() {}
  performExecutiveAudit() {}
  performDeepAudit() {}
  studyTrack(buf: any, name: string) {}
  getViralHooks() { return []; }
  getDynamicChecklist() { return []; }
  proactiveSmuvePulse() {}
}
