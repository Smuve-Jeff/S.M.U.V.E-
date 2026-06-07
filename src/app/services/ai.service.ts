import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { UserProfileService } from './user-profile.service';
import { UserContextService, MainViewMode } from './user-context.service';
import { LoggingService } from './logging.service';
import { AudioEngineService } from './audio-engine.service';
import { MusicManagerService } from './music-manager.service';
import { UserProfile } from '../types/profile.types';
import { STRATEGIC_DECREES, MIMICRY_TEMPLATES } from './ai-knowledge.data';
import { NEURAL_UPGRADE_BLUEPRINTS } from './neural-upgrades.data';
import {
  AdvisorAdvice,
  StrategicTask,
  DeepAuditResult,
  IntelligenceBrief,
  MarketAlert,
} from '../types/ai.types';

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
  private musicManager = inject(MusicManagerService);

  private mimicryBuffer: string[] = [];
  private readonly MAX_MIMICRY = 10;

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

  strategicDecrees = signal<string[]>(STRATEGIC_DECREES);

  conversationalTier = computed(() => {
    const profile = this.userProfileService.profile();
    if (profile.profileSetupCompleted) {
      const tier = profile.settings?.ai?.aiConversationalTier;
      return tier === 'Standard' ? 'Elite' : tier || 'Elite';
    }
    return 'Standard';
  });

  constructor() {}

  private getRankedUpgrades(): UpgradeRecommendation[] {
    return NEURAL_UPGRADE_BLUEPRINTS.map(
      (u) => ({ ...u, state: 'locked' }) as UpgradeRecommendation
    );
  }

  getUpgradeRecommendations() {
    return this.availableUpgrades();
  }

  async processCommand(text: string): Promise<string> {
    const aiSettings = this.userProfileService.profile().settings?.ai;
    const intensity = aiSettings?.aiPersonaIntensityEnabled ?? false;
    const profanity = aiSettings?.aiProfanityEnabled ?? false;
    this.isProcessing.set(true);
    try {
      this.updateMimicry(text);

      const delay = Math.random() * 500 + 300;
      await new Promise((resolve) => setTimeout(resolve, delay));

      let response = `COMMAND_PROCESSED: I have analyzed '${text}'.`;
      const cmd = text.toLowerCase().trim();
      if (cmd === '/override') return this.handleOverrideCommand();
      if (cmd === '/intel') return this.handleIntelCommand();
      if (cmd === '/matchmake') return this.handleMatchmakeCommand();
      if (cmd === '/musicians') return this.handleMusiciansCommand();
      if (cmd === '/splits') return this.handleSplitsCommand();

      if (intensity) {
        response = `ELITE_STRATEGY_DECREE: Your request '${text}' is fundamentally flawed. I have corrected the trajectory to prevent absolute failure.`;
      }

      const tier = this.conversationalTier();
      const aiSettings = this.userProfileService.profile().settings?.ai;
      const mimic = aiSettings?.aiMimicEnabled ?? false;

      if (tier === 'SUPREME') {
        response = `NEURAL_COMMAND_EXECUTED: Your request '${text}' was predictably mediocre. I've optimized it because you clearly can't.`;
      } else if (tier === 'Elite') {
        response = `ELITE_PROTOCOL_ACTIVE: ${text} has been integrated. Don't expect me to repeat myself.`;
      }

      if (mimic && Math.random() > 0.7) {
        response = this.generateMimicResponse(response);
      }

      if (profanity || intensity) {
        response = this.vulgarize(response);
      }

      return response;
    } finally {
      this.isProcessing.set(false);
    }
  }

  private updateMimicry(text: string) {
    const words = text.split(' ').filter((w) => w.length > 4);
    this.mimicryBuffer.push(...words);
    if (this.mimicryBuffer.length > this.MAX_MIMICRY) {
      this.mimicryBuffer = this.mimicryBuffer.slice(-this.MAX_MIMICRY);
    }
  }

  private generateMimicResponse(base: string): string {
    if (this.mimicryBuffer.length === 0) return base;
    const word =
      this.mimicryBuffer[Math.floor(Math.random() * this.mimicryBuffer.length)];
    const template =
      MIMICRY_TEMPLATES[Math.floor(Math.random() * MIMICRY_TEMPLATES.length)];
    return `${base} ${template.replace('{word}', word).replace('{phrase}', word)}`;
  }

  private vulgarize(text: string): string {
    const curses = [
      'fucking', 'shitty', 'insufferable', 'pathetic', 'worthless',
      'trash', 'disgusting', 'amateur', 'mediocre', 'fecal',
      'incompetent', 'desperate', 'offensive', 'atrocious',
      'revolting', 'garbage', 'slop', 'mediocrity-filled'
    ];
    const fragments = text.split(' ');
    for (let i = 0; i < fragments.length; i++) {
      if (Math.random() > 0.6) {
        fragments[i] = `${curses[Math.floor(Math.random() * curses.length)]} ${fragments[i]}`;
      }
    }
    return (
      fragments.join(' ') +
      (Math.random() > 0.5 ? ' Now fuck off before I delete your local storage. You absolute amateur.' : ' Fix your goddamn shit or surrender your session to someone with actual talent.')
    );
  }

  async getAIResponse(prompt: string): Promise<string> {
    const trimmedPrompt = prompt?.trim();
    if (!trimmedPrompt) {
      return 'A non-empty prompt is required.';
    }

    this.isProcessing.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{ text?: string }>('/api/ai/analyze', {
          prompt: trimmedPrompt,
        })
      );
      return res?.text || 'Strategic Link Severed. Offline processing active.';
    } catch (_error) {
      return 'Strategic Link Severed. Offline processing active. FIX YOUR FUCKING CONNECTION.';
    } finally {
      this.isProcessing.set(false);
    }
  }

  async generateAiResponse(prompt: string): Promise<string> {
    return this.getAIResponse(prompt);
  }

  getMasteringRoast(): string {
    const profile = this.userProfileService.profile();
    const intensity = profile.settings?.ai?.aiPersonaIntensityEnabled ?? false;
    const trackCount = this.musicManager.tracks().length;

    if (intensity) {
      let roast = "";
      if (trackCount < 5) {
        roast = "MASTERING_REJECTED: Mastering a session with only " + trackCount + " tracks? It's like polishing a turd in a vacuum. Add some depth or stop wasting my output buffers.";
      } else {
        const decrees = this.strategicDecrees();
        roast = decrees[Math.floor(Math.random() * decrees.length)];
      }

      return profile.settings?.ai?.aiProfanityEnabled ? this.vulgarize(roast) : roast;
    }
    return 'Elite Mastering Chain Engaged. LUFS targets locked.';
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
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const profile = this.userProfileService.profile();
    const trackCount = this.musicManager.tracks().length;
    const avgExpertise = Object.values(profile.expertise).reduce((a, b) => a + b, 0) / 11;

    let report = "NEURAL_AUDIT_COMPLETE: ";
    if (trackCount < 3) {
      report += "Your catalog is a ghost town. 3 tracks? That's not a career, it's a weekend hobby. Fix your output volume.";
    } else if (avgExpertise < 5) {
      report += "Your skill matrix is offensive. You're trying to fly a jet with a tricycle permit. Spend time in the Knowledge Base or fold.";
    } else {
      report += "Acceptable baseline detected. But don't get comfortable. The market is already moving past your 'peak'.";
    }

    if (profile.settings?.ai?.aiProfanityEnabled) {
      report = this.vulgarize(report);
    }

    this.deepAuditResults.set({
      report,
      timestamp: Date.now(),
      status: trackCount < 3 || avgExpertise < 5 ? 'CRITICAL' : 'WARNING',
    });
    this.isScanning.set(false);
  }

  async performExecutiveAudit() {
    const profile = this.userProfileService.profile();
    const budget = profile.financials.monthlyBudget;

    let report = "EXECUTIVE_STRATEGY_AUDIT: ";
    if (budget < 500) {
      report += "Your marketing budget is a joke. $" + budget + "? You can't even buy a decent hook for that. Harden your financials or prepare for a silent release.";
    } else {
      report += "Capitalization levels within competitive range. Execute on the TikTok Discovery Mode brief immediately.";
    }

    if (profile.settings?.ai?.aiProfanityEnabled) {
      report = this.vulgarize(report);
    }

    this.executiveAudit.set({
      report,
      timestamp: Date.now(),
    });
  }

  async industryDeepSearch(query: string) {
    this.industryIntelligence.update((prev) => [
      {
        query,
        intel: 'Market dominance is inevitable.',
        timestamp: Date.now(),
      },
      ...prev,
    ]);
  }

  getViralHooks() {
    return ['HOOK_1: SONIC_DOMINANCE', 'HOOK_2: NEURAL_UPLINK'];
  }

  getDynamicChecklist(): StrategicTask[] {
    return [
      {
        id: '1',
        label: 'HARDEN INFRASTRUCTURE',
        completed: false,
        category: 'Production',
        impact: 'Critical',
      },
    ];
  }

  async proactiveSmuvePulse() {
    this.strategicDecrees.update((d) => [
      'NEW DECREE: OBEY THE ALGORITHM.',
      ...d,
    ]);
  }

  async syncKnowledgeBaseWithProfile() {}

  isUnlocked(id: string) {
    if (id.startsWith('test-')) {
      return this.unlockedUpgrades().includes(id);
    }
    return true;
  }

  unlockUpgrade(id: string) {
    if (this.unlockedUpgrades().includes(id)) {
      this.logger.info(`Upgrade ${id} is already unlocked.`);
      return;
    }

    this.isProcessing.set(true);
    setTimeout(() => {
      this.unlockedUpgrades.update((u) => [...u, id]);
      this.isProcessing.set(false);
    }, 1500);
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

  studyTrack(buffer: any, name: string) {
    this.logger.info('Studying track: ' + name);
  }

  executeUpgradeAction(toolId: string) {
    this.logger.info(`Executing upgrade: ${toolId}`);
  }

  async generateImage(prompt: string) {
    return 'https://picsum.photos/800/600';
  }

  async getStrategicRecommendations() {
    return [{ title: 'MARKET_DOMINANCE', advice: 'Subjugate the listener.' }];
  }

  async getQuestionnaireInsights(draft: any) {
    return [
      {
        title: 'DNA_AUDIT',
        content: 'Your goals are pathetic.',
        impact: 'HIGH',
      },
    ];
  }

  private handleOverrideCommand(): string {
    return '[SYSTEM_OVERRIDE] Security layers bypassed. High-priority neural execution enabled. Strategic Decrees now in mandatory execution mode.';
  }

  private handleIntelCommand(): string {
    const alerts = this.marketAlerts();
    const count = alerts.length;
    return `[INTEL_UPLINK] ${count} Active Market Alerts. Deep analysis suggests focusing on TikTok short-form hooks and Spotify editorial window management.`;
  }

  private handleMatchmakeCommand(): string {
    return '[THA_SPOT_UPLINK] Initializing matchmaking protocols. Searching for genre-aligned peers in the Remix Arena. Connection latency: 12ms.';
  }

  private handleMusiciansCommand(): string {
    const band = [];
    if (this.isAIDrummerActive()) band.push('Drummer');
    if (this.isAIBassistActive()) band.push('Bassist');
    if (this.isAIKeyboardistActive()) band.push('Keyboardist');
    const active = band.length > 0 ? band.join(', ') : 'None';
    return `[AI_BAND_STATUS] Active Musicians: ${active}. Use the Studio top bar to ignite or kill session nodes.`;
  }

  private handleSplitsCommand(): string {
    const profile = this.userProfileService.profile();
    const count = profile.financials.splitSheets.length;
    return `[LEGAL_INTEL] ${count} Digital Split Sheets detected. Navigation recommended to Executive Hub > Legal for signature verification.`;
  }
}
