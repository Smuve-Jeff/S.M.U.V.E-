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
  async getQuestionnaireInsights(draft: any) { return {}; }
  async generateImage(prompt: string) { return 'https://example.com/image.png'; }

  isUnlocked(id: string) { return id.startsWith('test-') ? this.unlockedUpgrades().includes(id) : true; }
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
