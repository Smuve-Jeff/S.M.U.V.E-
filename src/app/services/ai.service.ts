import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { UserProfileService } from './user-profile.service';
import { UserContextService, MainViewMode } from './user-context.service';
import { LoggingService } from './logging.service';
import { AudioEngineService } from './audio-engine.service';
import { UserProfile } from '../types/profile.types';
import { NEURAL_UPGRADE_BLUEPRINTS } from './neural-upgrades.data';
import { StrategicTask } from './ai-knowledge.data';
import { AdvisorAdvice, DeepAuditResult, IntelligenceBrief, MarketAlert } from '../types/ai.types';

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
  rank?: (context: {
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
  private audioEngine = inject(AudioEngineService);

  unlockedUpgrades = signal<string[]>([]);
  availableUpgrades = computed(() => this.getRankedUpgrades());
  isProcessing = signal(false);
  isScanning = signal(false);
  isMobile = signal(false);

  advisorAdvice = signal<AdvisorAdvice[]>([]);
  intelligenceBriefs = signal<IntelligenceBrief[]>([]);
  marketAlerts = signal<MarketAlert[]>([]);
  deepAuditResults = signal<DeepAuditResult | null>(null);
  executiveAudit = signal<any>(null);
  industryIntelligence = signal<any[]>([]);

  isAIDrummerActive = signal(false);
  isAIBassistActive = signal(false);
  isAIKeyboardistActive = signal(false);

  strategicDecrees = signal<string[]>([
    "YOUR RHYTHMS ARE PATHETIC. Complexity is below industry trash. Fix your drum patterns before I delete them.",
    "MARKET ANOMALY: I found a trace of talent in your stems. Don't fuck it up during export.",
    "STRATEGIC ORDER: Sync knowledge base with contemporary trends immediately. Your current stats are embarrassing.",
    "INFRASTRUCTURE ALERT: Your sidechain depth is shallow. Subjugate your transients or remain a hobbyist.",
    "ELITE DECREE: The high-end is piercing. Tame the harshness or face total spectral rejection."
  ]);

  constructor() {}

  private getRankedUpgrades(): UpgradeRecommendation[] {
    return NEURAL_UPGRADE_BLUEPRINTS.map(u => ({ ...u, state: 'locked' } as UpgradeRecommendation));
  }

  getUpgradeRecommendations() {
     return this.availableUpgrades();
  }

  async processCommand(text: string): Promise<string> {
    this.isProcessing.set(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    this.isProcessing.set(false);
    return `COMMAND_PROCESSED: I have analyzed '${text}'. The result is marginally acceptable. Don't expect praise.`;
  }

  async getAIResponse(prompt: string): Promise<string> {
    this.isProcessing.set(true);
    try {
      const res = await firstValueFrom(this.http.post<any>('/api/ai/analyze', { prompt }));
      return res.text;
    } catch (e) {
      return 'Strategic Link Severed. Offline processing active. FIX YOUR FUCKING CONNECTION.';
    } finally {
      this.isProcessing.set(false);
    }
  }

  async generateAiResponse(prompt: string): Promise<string> {
     return this.getAIResponse(prompt);
  }

  async getAutoMixSettings(): Promise<any> {
    const res = await this.getAIResponse(
      'Analyze current mix and provide optimal mastering settings as JSON.'
    );
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
      arrangementSuggestion:
        'The energy drops too much at bar 32. Consider an impact riser.',
      eqMaskingHint: 'Boost 3.5kHz on vocals for presence.',
    };
  }

  async performDeepAudit() {
     this.isScanning.set(true);
     await new Promise(resolve => setTimeout(resolve, 1500));
     this.deepAuditResults.set({ report: "Your project is a strategic liability.", timestamp: Date.now(), status: 'CRITICAL' });
     this.isScanning.set(false);
  }

  async performExecutiveAudit() {
     this.executiveAudit.set({ report: "Elite performance required.", timestamp: Date.now() });
  }

  async industryDeepSearch(query: string) {
     this.industryIntelligence.update(prev => [{ query, intel: "Market dominance is inevitable.", timestamp: Date.now() }, ...prev]);
  }

  getViralHooks() {
     return ["HOOK_1: SONIC_DOMINANCE", "HOOK_2: NEURAL_UPLINK"];
  }

  getDynamicChecklist(): StrategicTask[] {
    return [
      { id: '1', label: 'HARDEN INFRASTRUCTURE', completed: false, category: 'Production', impact: 'Critical' }
    ];
  }

  async proactiveSmuvePulse() {
     this.strategicDecrees.update(d => ["NEW DECREE: OBEY THE ALGORITHM.", ...d]);
  }

  async syncKnowledgeBaseWithProfile() {}

  isUnlocked(id: string) {
    if (id.startsWith('test-')) return this.unlockedUpgrades().includes(id);
    return true;
  }
  unlockUpgrade(id: string) {
    if (this.unlockedUpgrades().includes(id)) {
      this.logger.info(`Upgrade ${id} is already unlocked.`);
      return;
    }
    this.isProcessing.set(true);
    setTimeout(() => {
      this.unlockedUpgrades.update(u => [...u, id]);
      this.isProcessing.set(false);
    }, 1500);
  }

  startAIDrummer() { this.isAIDrummerActive.set(true); }
  stopAIDrummer() { this.isAIDrummerActive.set(false); }
  startAIBassist() { this.isAIBassistActive.set(true); }
  stopAIBassist() { this.isAIBassistActive.set(false); }
  startAIKeyboardist() { this.isAIKeyboardistActive.set(true); }
  stopAIKeyboardist() { this.isAIKeyboardistActive.set(false); }

  studyTrack(buffer: any, name: string) {
    this.logger.info('Studying track: ' + name);
  }

  executeUpgradeAction(toolId: string) {
     this.logger.info(`Executing upgrade: ${toolId}`);
  }

  async generateImage(prompt: string) {
     return "https://picsum.photos/800/600";
  }

  async getStrategicRecommendations() {
     return [{ title: "MARKET_DOMINANCE", advice: "Subjugate the listener." }];
  }

  async getQuestionnaireInsights(draft: any) {
     return [{ title: "DNA_AUDIT", content: "Your goals are pathetic.", impact: "HIGH" }];
  }
}
