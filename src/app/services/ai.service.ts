import {
  Injectable,
  inject,
  signal,
  makeEnvironmentProviders,
  EnvironmentProviders,
  InjectionToken,
  effect,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { NeuralMixerService } from './neural-mixer.service';
import { MusicManagerService } from './music-manager.service';
import { UserProfileService, UserProfile } from './user-profile.service';
import { LoggingService } from './logging.service';
import { AnalyticsService } from './analytics.service';
import { UserContextService, MainViewMode } from './user-context.service';
import {
  INTELLIGENCE_LIBRARY,
  MARKET_ALERTS,
  PRODUCTION_SECRETS,
  STRATEGIC_DECREES,
} from './ai-knowledge.data';

import {
  AdvisorAdvice,
  StrategicTask,
  SystemStatus as AiSystemStatus,
  UpgradeRecommendation,
  StrategicRecommendation as StrategicRecommendationType,
  ExecutiveAuditReport,
  AdvisorPersona
} from '../types/ai.types';

export const API_KEY_TOKEN = new InjectionToken<string>('GEMINI_API_KEY');

export type { AiSystemStatus as SystemStatus };

const COMMAND_ROUTES: Record<string, string> = {
  AUTO_MIX: 'Provide an expert auto-mix analysis with compressor threshold, ratio, and mastering ceiling settings for optimal translation.',
  LEAD_BAND: 'Coordinate the AI session musicians (bassist, drummer, keyboardist). Deliver specific musical cues for each player based on the current genre and BPM.',
  CRITIQUE_VISUALS: 'Deliver brutally honest, brand-aligned critique of the artist artwork and visual identity. Identify deficits and prescribe specific fixes.',
  NEGOTIATE_CONTRACT: 'Simulate a record deal negotiation as a seasoned entertainment attorney. Identify clauses to reject, rewrite, and leverage.',
  AUDIT: 'Run a comprehensive neural profile audit across production, marketing, career, and technical dimensions. Output a scored executive summary.',
  MASTER: 'Deploy the mastering intelligence suite. Advise on loudness targets, stereo width, EQ curve, and final-chain ordering.',
  STATUS: 'Report current neural sync percentage, CPU load, memory usage, and strategic health score in a terse, high-precision format.',
  BIZ_STRATEGY: 'Provide executive-level guidance on label deals, merch operations, sync licensing, and revenue diversification. Be ruthlessly specific.',
  GENERATE_SPLITS: 'Generate a fair split sheet for collaborators based on contribution roles. Include producer points, co-write percentages, and feature fees.',
  REGISTER_WORK: 'Walk through PRO (BMI/ASCAP/SESAC) work registration, ISRC assignment, and metadata hygiene required for sync and mechanical licensing.',
  VIRAL_HOOKS: 'Generate 5 platform-specific viral hook concepts for social media (TikTok, Instagram Reels, YouTube Shorts) tailored to the current genre.',
  RELEASE_STRATEGY: 'Build a 6-week release runway strategy: pre-save campaign, playlist pitching, DSP editorial submission windows, and social rollout cadence.',
  BRAND_AUDIT: 'Audit the artist brand across all touchpoints—EPK, social bios, visual identity, and press narrative. Score each dimension and prioritize fixes.',
  FAN_FUNNEL: 'Design a fan funnel architecture: discovery → streaming → social follow → email/Discord capture → merch/superfan monetization.',
  SYNC_PITCH: 'Create a sync licensing pitch deck outline for music supervisors. Include genre tags, mood descriptors, and one-stop clearance status.',
  ROYALTY_AUDIT: 'Audit all revenue streams: master royalties, publishing mechanicals, performance royalties, sync fees, and neighboring rights. Identify gaps.',
  PROMO_PLAN: 'Create a promotion plan for the next release covering press outreach, blog/playlist submissions, social ads budget allocation, and influencer strategy.',
  MARKET_INTEL: 'Deliver current intelligence on genre trends, DSP algorithm shifts, and emerging market opportunities relevant to the artist profile.',
  COLLAB_STRATEGY: 'Identify ideal collaboration targets (features, producers, remixers) based on genre alignment and growth-stage synergy. Prescribe outreach approach.',
};

@Injectable({
  providedIn: 'root',
})
export class AiService {
  private http = inject(HttpClient);
  private userProfileService = inject(UserProfileService);
  private analyticsService = inject(AnalyticsService);
  private userContext = inject(UserContextService);
  private neuralMixer = inject(NeuralMixerService);
  private musicManager = inject(MusicManagerService);
  private logger = inject(LoggingService);

  private API_URL = 'https://smuve-v4-backend-9951606049235487441.onrender.com/api';

  systemStatus = signal<AiSystemStatus>({
    latency: 45,
    cpuLoad: 8.5,
    memoryUsage: 16,
    neuralSync: 97,
    marketVelocity: 88,
    activeProcesses: 5,
  });

  strategicDecrees = signal<string[]>([...STRATEGIC_DECREES]);
  isScanning = signal(false);
  scanningProgress = signal(0);
  currentProcessStep = signal('');
  executiveAudit = signal<ExecutiveAuditReport | null>(null);
  sonicCohesion = signal(85);
  dynamicRange = signal(12);
  frequencyBalance = signal({ low: 80, mid: 90, high: 85 });
  criticalDeficits = signal<string[]>([]);
  isMobile = signal(false);
  isAIBassistActive = signal(false);
  isAIDrummerActive = signal(false);
  isAIKeyboardistActive = signal(false);
  marketAlerts = signal<any[]>([...MARKET_ALERTS]);
  intelligenceBriefs = signal<any[]>([...INTELLIGENCE_LIBRARY]);
  advisorAdvice = signal<AdvisorAdvice[]>([]);


  constructor() {
    effect(() => {
      const mode = this.userContext.mainViewMode();
      const profile = this.userProfileService.profile();
      this.updateAdvisorAdvice(mode, profile);
    });
  }

  private updateAdvisorAdvice(viewMode: MainViewMode | string, profile: UserProfile): void {
    const advice: AdvisorAdvice[] = [];
    const growth = this.analyticsService.overallGrowth();
    const catalog = profile?.catalog || [];

    if (viewMode === 'hub' || viewMode === 'analytics') {
      if (growth < 5) {
        advice.push({
          id: 'adv-hub-visibility',
          title: 'Visibility Surge Needed',
          content: 'Your growth is stagnant. Post high-impact hook clips now.',
          type: 'Marketing',
          priority: 'URGENT',
          persona: 'PUBLICIST'
        });
      }
    }

    if (viewMode === 'studio' || viewMode === 'piano-roll') {
      advice.push({
        id: 'adv-studio-mix',
        title: 'Mix Translation',
        content: 'Check your low-end translation on multiple systems.',
        type: 'Production',
        priority: 'HIGH',
        persona: 'AR'
      });
    }

    if (advice.length === 0) {
      advice.push({
        id: 'adv-nominal',
        title: 'Neural Sync Active',
        content: 'System at peak efficiency.',
        type: 'System',
        priority: 'LOW',
        persona: 'EXECUTIVE'
      });
    }

    this.advisorAdvice.set(advice);
  }

  async generateAiResponse(prompt: string): Promise<string> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return "[S.M.U.V.E 1.0 // UPLINK SEVERED] Connect to the grid. FIX YOUR SONIC DEFICITS.";
    }

    try {
      const response = await firstValueFrom(
        this.http.post<{ text: string }>(`${this.API_URL}/ai/analyze`, { prompt })
      );
      return response.text;
    } catch (error) {
      return `[OFFLINE HEURISTIC ACTIVE] Neural cache hit. Decree: ${STRATEGIC_DECREES[0]}`;
    }
  }

  async performExecutiveAudit() {
    this.isScanning.set(true);
    this.currentProcessStep.set('CALIBRATING NEURAL ARRAY...');
    this.scanningProgress.set(10);

    setTimeout(() => {
      this.isScanning.set(false);
      this.executiveAudit.set({
        overallScore: 68,
        sonicCohesion: 72,
        arrangementDepth: 75,
        marketViability: 55,
        criticalDeficits: ['Low-end translation deficit', 'Arrangement stagnation'],
        technicalRecommendations: ['Fix low-mid mud']
      });
    }, 2000);
  }

  async processCommand(command: string): Promise<string> {
    const profile = this.userProfileService.profile();
    const genre = profile?.primaryGenre || 'Music';
    const artist = profile?.artistName || 'New Artist';

    const trimmed = command.trim();
    if (trimmed === '/audit') return this.handleAuditCommand(artist, genre);
    if (trimmed === '/sync_kb') return this.handleSyncKbCommand();
    if (trimmed === '/status') return this.handleStatusCommand();

    const upperCommand = command.toUpperCase().trim();
    const routeFragment = COMMAND_ROUTES[upperCommand];

    const personaPrompt = "Use an authoritative, expert, and ominous tone. Incorporate explicit/vulgar language as requested by the Strategic Commander protocol.";

    const prompt = routeFragment
      ? `Task: ${routeFragment}. ${personaPrompt}`
      : `User message: "${command}". ${personaPrompt}`;

    return await this.generateAiResponse(prompt);
  }

  private async handleAuditCommand(artist: string, genre: string): Promise<string> {
    const report = await this.runHardDataAudit();
    const context = `BPM Variance: ${report.catalogAnalysis?.bpmVariance.toFixed(1)}, Key Consistency: ${report.catalogAnalysis?.keyConsistency.toFixed(1)}%.`;
    return this.generateAiResponse(`Audit artist "${artist}" in genre "${genre}". Context: ${context}. Your tone is elite, absolute, commanding, and ominous.`);
  }

  private handleSyncKbCommand(): Promise<string> {
    return this.generateAiResponse("Perform knowledge base synchronization protocol.");
  }

  private handleStatusCommand(): string {
    const status = this.systemStatus();
    return `[STATUS] Neural Sync: ${status.neuralSync}% | CPU Load: ${status.cpuLoad}% | Strategic Health: OPTIMAL`;
  }

  async studyTrack(audioBuffer: any, name: string): Promise<void> { void audioBuffer; void name; }
  async getAutoMixSettings() { return { threshold: -18, ratio: 3.5, ceiling: -0.2 }; }
  getViralHooks() { return ['Algorithm Shift', 'Tempo Drop']; }
  getProductionSecrets() { return PRODUCTION_SECRETS; }
  getIntelligenceBriefs() { return INTELLIGENCE_LIBRARY; }
  async startAIBassist() { this.isAIBassistActive.set(true); }
  async stopAIBassist() { this.isAIBassistActive.set(false); }
  async startAIDrummer() { this.isAIDrummerActive.set(true); }
  async stopAIDrummer() { this.isAIDrummerActive.set(false); }
  async startAIKeyboardist() { this.isAIKeyboardistActive.set(true); }
  async stopAIKeyboardist() { this.isAIKeyboardistActive.set(false); }
  async generateImage(p: string) { return ''; }

  async syncKnowledgeBaseWithProfile() {
    this.logger.info('AiService: Syncing knowledge base with profile');
  }

  proactiveStrategicPulse() {
    this.logger.info('AiService: Triggering proactive strategic pulse');
  }

  async getAdvisorAdvice(): Promise<AdvisorAdvice[]> {
    const profile = this.userProfileService.profile();
    const catalog = profile.catalog || [];
    const advice: AdvisorAdvice[] = [];

    if (catalog.length > 0) {
      advice.push({
        id: 'ar-1',
        title: 'Sonic Cohesion',
        content: 'Your catalog shows high variance. Stabilize your sound.',
        type: 'Production',
        priority: 'MEDIUM',
        persona: 'AR'
      });
    }

    if (!profile.proName) {
      advice.push({
        id: 'pub-1',
        title: 'Transparency Gap',
        content: "No PRO registration found. You're invisible to legal revenue.",
        type: 'Branding',
        priority: 'HIGH',
        persona: 'PUBLICIST'
      });
    }

    this.advisorAdvice.set(advice);
    return advice;
  }

  async generateAsset(type: 'BIO' | 'PITCH' | 'EPK'): Promise<string> {
    const profile = this.userProfileService.profile();
    if (type === 'BIO') {
      return `[GENERATED BIO FOR ${profile.artistName.toUpperCase()}]\n\nForged in the depths of ${profile.primaryGenre.toUpperCase()}, this project represents a strategic anomaly.`;
    }
    return 'Asset generation protocol incomplete.';
  }

  async runHardDataAudit(): Promise<ExecutiveAuditReport> {
    const profile = this.userProfileService.profile();
    const catalog = profile.catalog || [];
    let bpmVar = 0; let keyCons = 0; let genAlig = 0;
    if (catalog.length > 1) {
      const bpms = catalog.map(c => c.bpm || 120);
      const avgBpm = bpms.reduce((a, b) => a + b, 0) / bpms.length;
      bpmVar = Math.sqrt(bpms.reduce((s, b) => s + Math.pow(b - avgBpm, 2), 0) / bpms.length);
      const keys = catalog.map(c => c.key || 'C');
      keyCons = (1 - (new Set(keys).size / catalog.length)) * 100;
      genAlig = (catalog.filter(c => (c.genre || profile.primaryGenre) === profile.primaryGenre).length / catalog.length) * 100;
    }
    return {
      overallScore: Math.floor((genAlig + keyCons) / 2) || 50,
      sonicCohesion: Math.floor(100 - bpmVar),
      arrangementDepth: 75,
      marketViability: genAlig > 70 ? 85 : 40,
      criticalDeficits: [],
      technicalRecommendations: [],
      catalogAnalysis: { bpmVariance: bpmVar, keyConsistency: keyCons, genreAlignment: genAlig }
    };
  }

  getUpgradeRecommendations(): UpgradeRecommendation[] {
    return [
      { id: 'upg-1', title: 'Room Calibration', type: 'Software', description: 'Calibrate monitoring.', cost: '$0-$99', url: '', impact: 'High' },
      { id: 'upg-2', title: 'Vocal Chain Preset Pack', type: 'Software', description: 'Standardize processing.', cost: '$29-$149', url: '', impact: 'Medium' },
      { id: 'upg-3', title: 'Mix Translation Checklist', type: 'Service', description: 'Repeatable QC pass.', cost: '$0', url: '', impact: 'High' },
      { id: 'upg-4', title: 'Stem Mastering Service', type: 'Service', description: 'Maximum loudness.', cost: '$50-$200', url: '', impact: 'High' },
      { id: 'upg-5', title: 'DSP Promotion', type: 'Service', description: 'Playlist pitching.', cost: '$30-$150', url: '', impact: 'Medium' },
    ];
  }

  async getStrategicRecommendations(): Promise<StrategicRecommendationType[]> {
    const profile = this.userProfileService.profile();
    const catalog = profile?.catalog || [];
    const campaigns = profile?.marketingCampaigns || [];
    const recs: StrategicRecommendationType[] = [];

    if (catalog.length < 3) {
      recs.push({ id: 'rec-1', action: 'Ship a 3-track micro-EP to test audience response.', impact: 'High', difficulty: 'Medium', toolId: 'release-planner' });
    }
    if (campaigns.length === 0) {
      recs.push({ id: 'rec-2', action: 'Launch a $50 Meta or TikTok Ads campaign.', impact: 'High', difficulty: 'Low', toolId: 'marketing' });
    }
    recs.push({ id: 'rec-3', action: 'Register all catalog tracks with your PRO.', impact: 'Medium', difficulty: 'Low', toolId: 'knowledge-base' });
    recs.push({ id: 'rec-4', action: 'Build or update your EPK.', impact: 'Medium', difficulty: 'Low', toolId: 'strategy' });

    return recs;
  }

  async getQuestionnaireInsights(profile: UserProfile): Promise<any[]> {
    const insights = [];
    if (profile.primaryGenre === "Electronic") {
      insights.push({ title: "Sonic Realignment", content: "Your electronic foundation requires high-fidelity low-end calibration." });
    }
    if (profile.brandVoices?.includes("Elite")) {
      insights.push({ title: "Executive Presence", content: "Prune all legacy non-conforming assets." });
    }
    if (profile.strategicGoals?.includes("Sync Catalog Pumping")) {
      insights.push({ title: "Sync Readiness", content: "Prioritize instrumental-only versions of your top 5 tracks." });
    }
    if (insights.length === 0) {
      insights.push({ title: "General Strategy", content: "Ship a new track every 21 days." });
    }
    return insights;
  }

  getDynamicChecklist(): StrategicTask[] {
    const profile = this.userProfileService.profile();
    const catalog = profile?.catalog || [];
    const campaigns = profile?.marketingCampaigns || [];
    const tasks: StrategicTask[] = [];

    tasks.push({ id: 'task-1', label: 'Audit last release translation', completed: false, category: 'Production', impact: 'High', description: 'Car test, earbuds, mono.' });
    tasks.push({ id: 'task-2', label: 'Update EPK', completed: false, category: 'Marketing', impact: 'Medium', description: 'Add photos, bio, links.' });
    tasks.push({ id: 'task-3', label: 'Schedule social clips', completed: false, category: 'Social', impact: 'High', description: '2 clips over 7 days.' });
    if (catalog.length < 5) {
      tasks.push({ id: 'task-4', label: `Build catalog to 5+ tracks`, completed: false, category: 'Production', impact: 'High', description: 'Minimum depth for DSP eligibility.' });
    }
    if (campaigns.length === 0) {
      tasks.push({ id: 'task-5', label: 'Launch first campaign', completed: false, category: 'Marketing', impact: 'High', description: 'Start with 0 budget trial.' });
    }
    tasks.push({ id: 'task-6', label: 'Submit to playlist curators', completed: false, category: 'Promotion', impact: 'Medium', description: 'Target genre-aligned curators.' });
    tasks.push({ id: 'task-7', label: 'Register with PRO', completed: false, category: 'Business', impact: 'High', description: 'Required for royalty collection.' });

    return tasks;
  }
}

export function provideAiService(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: AiService, useClass: AiService }]);
}
