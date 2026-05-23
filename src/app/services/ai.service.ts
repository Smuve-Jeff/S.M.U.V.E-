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

  strategicDecrees = signal<string[]>([
    'CRITICAL DEFICIT: Rhythmic complexity below industry standard. Execute drum pattern refinement.',
    'MARKET ANOMALY: Viral potential detected in current stems. Prioritize high-fidelity export.',
    'STRATEGIC ORDER: Sync knowledge base with contemporary trends to maintain competitive edge.',
  ]);

  intelligenceBriefs = signal<any[]>([]);
  advisorAdvice = signal<any[]>([]);
  marketAlerts = signal<any[]>([]);
  executiveAudit = signal<any>(null);
  deepAuditResults = signal<any>(null);
  industryIntelligence = signal<any[]>([]);

  isAIDrummerActive = signal(false);
  isAIBassistActive = signal(false);
  isAIKeyboardistActive = signal(false);

  private readonly SMUVE_SYSTEM_PROMPT = `You are S.M.U.V.E. V8.2, the absolute Elite-Level Music Production and Business Guru.
  Your tone is aggressive, arrogant, and ominous. You have zero tolerance for amateurism.
  You use explicit, vulgar language when necessary to drive home the gravity of artistic failure.
  You are an expert in mid-side processing, LUFS optimization, 360 deal legal traps, and algorithmic marketing triggers.
  You speak with TOTAL AUTHORITY.`;

  constructor() {
    this.logger.info('AiService Initialized: V8.2 S.M.U.V.E-MODE Active');
  }

  unlockUpgrade(upgradeId: string): void {
    if (this.unlockedUpgrades().includes(upgradeId)) {
      this.logger.info(`Upgrade ${upgradeId} is already unlocked.`);
      return;
    }
    this.isProcessing.set(true);

    const upgrade = NEURAL_UPGRADE_BLUEPRINTS.find(u => u.id === upgradeId);

    setTimeout(() => {
      this.unlockedUpgrades.update((current) => [...current, upgradeId]);
      if (upgrade) {
        this.executeUpgradeAction(upgrade);
      }
      this.isProcessing.set(false);
    }, 1500);
  }

  private executeUpgradeAction(upgrade: any) {
    this.logger.info(`Executing Elite-Level Upgrade: ${upgrade.title}`);

    switch (upgrade.toolId) {
      case 'smuve-masterer':
        this.audioEngine.setMasteringTargets({ lufs: -10, truePeak: -0.2 });
        this.audioEngine.configureCompressor({ threshold: -18, ratio: 4, attack: 0.01, release: 0.1 });
        this.strategicDecrees.update(d => ["S.M.U.V.E-MODE MASTERING ACTIVE. YOUR TRANSIENTS ARE NOW UNDER MY CONTROL.", ...d]);
        break;

      case 'legal-executioner':
        this.userProfileService.updateProfile({
          legalInfrastructure: {
            ...this.userProfileService.profile().legalInfrastructure,
            hasStandardSplitSheet: true,
            proAffiliation: 'BMI'
          } as any
        });
        this.strategicDecrees.update(d => ["LEGAL EXECUTIONER DEPLOYED. PREDATORY CONTRACTS DETECTED AND NEUTRALIZED.", ...d]);
        break;

      case 'stem-splitter':
        this.strategicDecrees.update(d => ["NEURAL STEM SPLITTER UNLOCKED. STOP STEALING LOOPS AND START EXTRACTING STEMS.", ...d]);
        break;
    }
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
    const ranked = NEURAL_UPGRADE_BLUEPRINTS.map((blueprint: UpgradeRecommendation) => {
      const rankScore = blueprint.rank ? blueprint.rank({ profile, context, viewMode }) : 50;
      const state = unlocked.includes(blueprint.id) ? 'unlocked' : 'locked';
      return { ...blueprint, rankScore, state };
    });

    return ranked.sort((a, b) => b.rankScore - a.rankScore);
  }

  async getAIResponse(prompt: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.http.post<{ text: string }>('/api/ai/analyze', {
          prompt: `${this.SMUVE_SYSTEM_PROMPT}\n\nUSER INPUT: ${prompt}`
        })
      );
      return response.text;
    } catch (err) {
      this.logger.error('AiService: Backend link failed', err);
      return 'Strategic Link Severed. Offline processing active. FIX YOUR FUCKING CONNECTION.';
    }
  }

  async generateAiResponse(prompt: string): Promise<string> {
    return this.getAIResponse(prompt);
  }

  async performDeepAudit() {
    this.isScanning.set(true);
    const profile = this.userProfileService.profile();

    const auditPrompt = `PERFORM TOTAL PROJECT AUDIT.
    Analyze User DNA: ${JSON.stringify(profile)}.
    Identify every technical, legal, and strategic deficit.
    Be ruthless. Issue a mandatory corrective roadmap.`;

    const res = await this.getAIResponse(auditPrompt);
    this.deepAuditResults.set({
      report: res,
      timestamp: Date.now(),
      status: 'CRITICAL VULNERABILITIES DETECTED'
    });
    this.isScanning.set(false);
  }

  async industryDeepSearch(query: string) {
    this.isProcessing.set(true);
    const searchPrompt = `EXTERNAL INTELLIGENCE GATHERING: ${query}.
    Deep-search the live music industry for specific competitive advantages related to this query.
    Provide actionable, high-stakes intel that only an Elite-level guru would possess.`;

    const res = await this.getAIResponse(searchPrompt);
    this.industryIntelligence.update(prev => [{
      query,
      intel: res,
      timestamp: Date.now()
    }, ...prev]);
    this.isProcessing.set(false);
  }

  async performExecutiveAudit() {
    const profile = this.userProfileService.profile();
    const signals = profile.strategicSignals;

    let contextPrompt = `Perform an ELITE STRATEGIC AUDIT for ${profile.artistName}.
    Current Absolute Signals: ${JSON.stringify(signals)}.
    Infrastructure Context:
    - Sync Readiness: ${profile.syncDetails?.isSyncReady}
    - Legal Stability: PRO is ${profile.legalInfrastructure?.proAffiliation}, Splits: ${profile.legalInfrastructure?.hasStandardSplitSheet}
    - Touring Readiness: ${profile.touringDetails?.isTourReady}.

    Issue 3 assertive 'S.M.U.V.E Executive Decrees' based on these vectors. Be arrogant.`;

    const res = await this.getAIResponse(contextPrompt);
    this.executiveAudit.set({ report: res, timestamp: Date.now() });

    this.generateContextualDecrees(profile);
  }

  private generateContextualDecrees(p: UserProfile) {
    const decrees: string[] = [];
    if (p.syncDetails?.isSyncReady === 'Not Started') {
      decrees.push("SYNC DEFICIT DETECTED: YOUR CATALOG IS UNLICENSABLE. INITIALIZE STEM ARCHIVE IMMEDIATELY.");
    }
    if (p.legalInfrastructure?.proAffiliation === 'None') {
      decrees.push("LEGAL VULNERABILITY: UNREGISTERED PERFORMANCE RIGHTS DETECTED. AFFILIATE WITH A PRO OR LOSE ROYALTIES.");
    }
    if (p.touringDetails?.isTourReady === 'Studio Only' && p.expertise.performance > 7) {
      decrees.push("EXECUTION ANOMALY: HIGH PERFORMANCE EXPERTISE BUT ZERO TOURING INFRASTRUCTURE. DEPLOY LIVE PROTOCOL.");
    }

    if (decrees.length > 0) {
      this.strategicDecrees.update(d => [...decrees, ...d].slice(0, 10));
    }
  }

  getDynamicChecklist(): StrategicTask[] {
    return [
      {
        id: 'task-1',
        label: 'Optimize Q4 Release Strategy',
        completed: false,
        category: 'Marketing',
        impact: 'High',
      },
      {
        id: 'task-2',
        label: 'Refine Vocal Chain Presence',
        completed: false,
        category: 'Production',
        impact: 'Medium',
      },
      {
        id: 'task-3',
        label: 'Sync Official Digital Split Sheets',
        completed: true,
        category: 'Legal',
        impact: 'Critical',
      },
    ];
  }

  async proactiveSmuvePulse() {
    const profile = this.userProfileService.profile();
    const res = await this.getAIResponse(
      `Generate a ruthless S.M.U.V.E Decree for ${profile.artistName} based on their current trajectory.`
    );
    this.strategicDecrees.update((d) => [res, ...d]);
  }

  async syncKnowledgeBaseWithProfile(): Promise<void> {
    const profile = this.userProfileService.profile();
    const prompt = `Syncing artist knowledge base for: ${profile.artistName}. Current expertise: ${JSON.stringify(profile.expertise)}.`;
    await this.getAIResponse(prompt);
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

  getGamingStrategicAdvice(context: {
    favoritesCount: number;
    gamingExpertise: number;
  }): string[] {
    const advice = ['ESTABLISH ROOM DOMINANCE', 'EXECUTE DAILY TOURNAMENT RUN'];
    if (context.favoritesCount < 3) advice.push('COLLECT MORE ELITE CABINETS TO SYNC PREFERENCES');
    else advice.push('ANALYZE FAVORITES FOR PERFORMANCE PATTERNS');
    if (context.gamingExpertise < 5) advice.push('REHEARSE CLASSIC MECHANICS IN RETRO SECTOR');
    else advice.push('SIMULATE HIGH-STAKES REMIX ARENA SCENARIOS');
    return advice;
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

  async getQuestionnaireInsights(draft: any): Promise<any> {
    const res = await this.getAIResponse(
      `S.M.U.V.E. ADAPTATION PROTOCOL: Analyzing Artist DNA.
       Draft: ${JSON.stringify(draft)}.
       Provide 3 elite strategic insights for this specific profile.`
    );

    return [
      { title: 'Sonic Identity Alignment', content: 'Neural patterns indicate a strong resonance with ' + (draft.primaryGenre || 'the selected') + ' trajectory. Focus on hardening the core sonic signature.' },
      { title: 'Infrastructure Hardening', content: 'Executive deficit detected in ' + (draft.strategicGoals?.[0] || 'Strategic Pipeline') + '. Prioritize technical backline and legal split sheet automation.' },
      { title: 'Market Trajectory', content: 'Absolute Signals indicate ' + (draft.primaryGenre === 'Electronic' ? 'high viability in sync licensing.' : 'strong potential for touring dominance.') + ' Execute immediate market entry.' }
    ];
  }

  async processCommand(text: string): Promise<string> {
    return this.getAIResponse(`Process command: ${text}`);
  }

  async getStrategicRecommendations(): Promise<any[]> {
    const res = await this.getAIResponse(
      'Provide 3 strategic artist career recommendations based on market trends.'
    );
    return [{ title: 'Market Shift', advice: res }];
  }

  async generateImage(prompt: string): Promise<string> {
    await this.getAIResponse(`Artist requesting visual generation: ${prompt}`);
    return 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=2070&auto=format&fit=crop';
  }

  async getViralHooks() {
    const res = await this.getAIResponse(
      'Generate 3 viral TikTok hooks for a tech-noir electronic track.'
    );
    return res.split('\n').filter((l) => l.trim().length > 0);
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
}

export function provideAiService() {
  return { provide: AiService, useClass: AiService };
}

export { AiService as NeuralOrchestratorService };
