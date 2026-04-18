import { APP_SECURITY_CONFIG } from '../app.security';
import { AuthService } from './auth.service';
import { Injector } from '@angular/core';

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
import {
  RecommendationPreference,
  UserProfileService,
  UserProfile,
} from './user-profile.service';
import { LoggingService } from './logging.service';
import { AnalyticsService } from './analytics.service';
import { UserContextService, MainViewMode } from './user-context.service';
import { AiAuditService } from './ai-audit.service';
import { ArtistIdentityService } from './artist-identity.service';
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
  RecommendationHistoryEntry,
} from '../types/ai.types';

export const API_KEY_TOKEN = new InjectionToken<string>('GEMINI_API_KEY');

export type { AiSystemStatus as SystemStatus };

const COMMAND_ROUTES: Record<string, string> = {
  AUTO_MIX:
    'Provide an expert auto-mix analysis with compressor threshold, ratio, and mastering ceiling settings for optimal translation.',
  LEAD_BAND:
    'Coordinate the AI session musicians (bassist, drummer, keyboardist). Deliver specific musical cues for each player based on the current genre and BPM.',
  CRITIQUE_VISUALS:
    'Deliver brutally honest, brand-aligned critique of the artist artwork and visual identity. Identify deficits and prescribe specific fixes.',
  NEGOTIATE_CONTRACT:
    'Simulate a record deal negotiation as a seasoned entertainment attorney. Identify clauses to reject, rewrite, and leverage.',
  AUDIT:
    'Run a comprehensive neural profile audit across production, marketing, career, and technical dimensions. Output a scored executive summary.',
  MASTER:
    'Deploy the mastering intelligence suite. Advise on loudness targets, stereo width, EQ curve, and final-chain ordering.',
  STATUS:
    'Report current neural sync percentage, CPU load, memory usage, and strategic health score in a terse, high-precision format.',
  BIZ_STRATEGY:
    'Provide executive-level guidance on label deals, merch operations, sync licensing, and revenue diversification. Be ruthlessly specific.',
  AUDIT_TRACK:
    'Analyze the selected track data. Provide specific feedback on arrangement density, frequency masking, and rhythmic cohesion.',
  SUGGEST_COLLAB:
    'Based on the artist profile and genre, suggest three high-value collaboration types (e.g., specific instrumentals, vocalists, or remixers) to expand the brand influence.',
  GENERATE_SPLITS:
    'Generate a fair split sheet for collaborators based on contribution roles. Include producer points, co-write percentages, and feature fees.',
  REGISTER_WORK:
    'Walk through PRO (BMI/ASCAP/SESAC) work registration, ISRC assignment, and metadata hygiene required for sync and mechanical licensing.',
  VIRAL_HOOKS:
    'Generate 5 platform-specific viral hook concepts for social media (TikTok, Instagram Reels, YouTube Shorts) tailored to the current genre.',
  RELEASE_STRATEGY:
    'Build a 6-week release runway strategy: pre-save campaign, playlist pitching, DSP editorial submission windows, and social rollout cadence.',
  BRAND_AUDIT:
    'Audit the artist brand across all touchpoints—EPK, social bios, visual identity, and press narrative. Score each dimension and prioritize fixes.',
  FAN_FUNNEL:
    'Design a fan funnel architecture: discovery → streaming → social follow → email/Discord capture → merch/superfan monetization.',
  SYNC_PITCH:
    'Create a sync licensing pitch deck outline for music supervisors. Include genre tags, mood descriptors, and one-stop clearance status.',
  ROYALTY_AUDIT:
    'Audit all revenue streams: master royalties, publishing mechanicals, performance royalties, sync fees, and neighboring rights. Identify gaps.',
  PROMO_PLAN:
    'Create a promotion plan for the next release covering press outreach, blog/playlist submissions, social ads budget allocation, and influencer strategy.',
  MARKET_INTEL:
    'Deliver current intelligence on genre trends, DSP algorithm shifts, and emerging market opportunities relevant to the artist profile.',
  COLLAB_STRATEGY:
    'Identify ideal collaboration targets (features, producers, remixers) based on genre alignment and growth-stage synergy. Prescribe outreach approach.',
};

const HIGH_DENSITY_THRESHOLD = 0.72;
const HIGH_MASKING_THRESHOLD = 0.65;
const HIGH_TRANSIENT_THRESHOLD = 0.7;
const AGGRESSIVE_COMP_THRESHOLD = -20;
const SAFE_COMP_THRESHOLD = -16;
const AGGRESSIVE_COMP_RATIO = 4.2;
const SAFE_COMP_RATIO = 3.1;
const DENSE_TARGET_LUFS = -13.5;
const DEFAULT_TARGET_LUFS = -14;
const SAFE_LIMITER_CEILING = -0.1;

@Injectable({
  providedIn: 'root',
})
export class AiService {
  private http = inject(HttpClient);
  private neuralMixer = inject(NeuralMixerService);
  private musicManager = inject(MusicManagerService);
  private userProfileService = inject(UserProfileService);
  private logger = inject(LoggingService);
  private analytics = inject(AnalyticsService);
  private userContext = inject(UserContextService);
  private aiAuditService = inject(AiAuditService);
  private artistIdentityService = inject(ArtistIdentityService);
  private injector = inject(Injector);

  private apiKey = inject(API_KEY_TOKEN, { optional: true });

  isScanning = signal(false);
  scanningProgress = signal(0);
  currentProcessStep = signal('INITIALIZING...');
  sonicCohesion = signal(0);
  frequencyBalance = signal({ low: 0, mid: 0, high: 0 });
  criticalDeficits = signal<string[]>([]);
  strategicDecrees = signal<string[]>(STRATEGIC_DECREES);
  intelligenceBriefs = signal<any[]>(INTELLIGENCE_LIBRARY);
  isAIBassistActive = signal(false);
  isAIDrummerActive = signal(false);
  isAIKeyboardistActive = signal(false);

  systemStatus = signal({
    neuralSync: 98.4,
    cpuLoad: 12.2,
    memoryUsage: 45.1,
  });

  marketAlerts = signal<any[]>(MARKET_ALERTS);
  executiveAudit = signal<ExecutiveAuditReport | null>(null);
  advisorAdvice = signal<AdvisorAdvice[]>([]);

  constructor() {
    effect(() => {
      const mode = this.userContext.mainViewMode();
      this.currentProcessStep.set(`CONTEXT: ${mode.toUpperCase()}`);
    });
  }

  isMobile() {
    return typeof window !== 'undefined' && window.innerWidth <= 768;
  }

  async runStrategicAudit() {
    this.isScanning.set(true);
    this.scanningProgress.set(0);

    const steps = [
      'ANALYZING SESSION DATA',
      'CALIBRATING FREQUENCY RESPONSE',
      'CORRELATING PHASE RELATIONSHIPS',
      'ESTABLISHING STRATEGIC DEFICITS',
    ];

    for (let i = 0; i < steps.length; i++) {
      this.currentProcessStep.set(steps[i]);
      for (let p = 0; p <= 25; p += 5) {
        this.scanningProgress.update((v) => v + 1);
        await new Promise((r) => setTimeout(r, 40));
      }
    }

    this.sonicCohesion.set(Math.floor(Math.random() * 20) + 75);
    this.frequencyBalance.set({
      low: Math.floor(Math.random() * 30) + 60,
      mid: Math.floor(Math.random() * 30) + 60,
      high: Math.floor(Math.random() * 30) + 60,
    });

    const possibleDeficits = [
      'Low-end phase incoherence detected in Sub-80Hz band.',
      'Sibilance peaks exceeding -3dB threshold on lead vocal chain.',
      'Arrangement congestion between 400Hz-800Hz in Bridge section.',
      'Marketing throughput below executive KPIs for current cycle.',
    ];
    this.criticalDeficits.set(
      possibleDeficits.sort(() => 0.5 - Math.random()).slice(0, 2)
    );

    this.isScanning.set(false);
  }

  async getExecutiveAdvice(): Promise<AdvisorAdvice[]> {
    const profile = this.userProfileService.profile();
    const mode = this.userContext.mainViewMode();

    const advice: AdvisorAdvice[] = [];

    if (mode === 'studio') {
      advice.push({
        id: 'adv-1',
        title: 'Sonic Collision Detected',
        content:
          'Kick drum and Bass synth are competing for the 60Hz pocket. Apply sidechain ducking or high-pass the bass.',
        type: 'Production',
        priority: 'HIGH',
        persona: 'EXECUTIVE'
      });
    }

    if (profile.catalog.length < 3) {
      advice.push({
        id: 'adv-2',
        title: 'Inventory Deficit',
        content:
          'Catalog depth is insufficient for DSP algorithmic triggers. Aim for 2 more completed masters this month.',
        type: 'Strategic',
        priority: 'MEDIUM',
        persona: 'EXECUTIVE'
      });
    }

    this.advisorAdvice.set(advice);
    return advice;
  }

  proactiveStrategicPulse() {
    this.logger.info('Executing Proactive Strategic Pulse...');
    this.runStrategicAudit();
  }

  async runHardDataAudit(): Promise<ExecutiveAuditReport> {
    const profile = this.userProfileService.profile();
    const audit = this.aiAuditService.calculateStrategicHealth(profile) as any;
    this.executiveAudit.set(audit);
    return audit;
  }

  async performExecutiveAudit() {
     return this.runHardDataAudit();
  }

  async syncKnowledgeBaseWithProfile() {
      // Mock logic
      return Promise.resolve();
  }

  async processCommand(command: string): Promise<string> {
    const profile = this.userProfileService.profile();
    const genre = profile?.primaryGenre || 'Music';
    const artist = profile?.artistName || 'New Artist';

    const trimmed = command.trim();
    if (trimmed === '/audit') return this.handleAuditCommand(artist, genre);
    if (trimmed === '/sync_kb') return this.handleSyncKbCommand();
    if (trimmed === '/status') return this.handleStatusCommand();

    if (trimmed === '/promo') return this.handlePromoCommand(artist, genre);
    if (trimmed === '/business') return this.handleBizCommand(artist);
    if (trimmed === '/hooks') return this.handleHooksCommand(genre);
    if (trimmed === '/release') return this.handleReleaseCommand(artist, genre);
    if (trimmed === '/generate_structure') return this.generateStructure(genre);
    if (trimmed === '/generate_chords') return this.generateChords(genre);
    if (trimmed === '/generate_bass')
      return this.handleGenerateBassCommand(genre);
    if (trimmed === '/generate_drums')
      return this.handleGenerateDrumCommand(genre);
    if (trimmed === '/auto_mix') return this.handleAutoMixCommand();

    if (trimmed === '/audit_track') return this.generateAiResponse(COMMAND_ROUTES['AUDIT_TRACK']);
    if (trimmed === '/suggest_collab') return this.generateAiResponse(COMMAND_ROUTES['SUGGEST_COLLAB']);

    // Check for keyword-routed commands (e.g., AUTO_MIX, BIZ_STRATEGY)
    const upperCommand = command.toUpperCase().trim();
    const routeFragment = COMMAND_ROUTES[upperCommand];

    const personaPrompt =
      'Use an authoritative, expert, and ominous tone. Incorporate explicit/vulgar language as requested by the Strategic Commander protocol.';

    const prompt = routeFragment
      ? `Task: ${routeFragment}. ${personaPrompt}`
      : `User message: "${command}". ${personaPrompt}`;

    return await this.generateAiResponse(prompt);
  }

  private async handleAuditCommand(
    artist: string,
    genre: string
  ): Promise<string> {
    const report = await this.runHardDataAudit();
    const context = `Overall Score: ${report.overallScore}%. Critical Deficits: ${report.criticalDeficits.length}`;
    return this.generateAiResponse(
      `Audit artist "${artist}" in genre "${genre}". Context: ${context}. Your tone is elite, absolute, commanding, and ominous.`
    );
  }

  private handleSyncKbCommand(): Promise<string> {
    return this.generateAiResponse(
      'Perform knowledge base synchronization protocol.'
    );
  }

  private handleStatusCommand(): string {
    const status = this.systemStatus();
    return `[STATUS] Neural Sync: ${status.neuralSync}% | CPU Load: ${status.cpuLoad}% | Strategic Health: OPTIMAL`;
  }

  private handlePromoCommand(artist: string, genre: string): Promise<string> {
    return this.generateAiResponse(
      `Create a release promotion plan for "${artist}" in "${genre}" with tactical weekly actions and channel priorities.`
    );
  }

  private handleBizCommand(artist: string): Promise<string> {
    return this.generateAiResponse(
      `Provide business strategy for "${artist}" covering revenue streams, rights management, and next-quarter priorities.`
    );
  }

  private handleHooksCommand(genre: string): Promise<string> {
    return this.generateAiResponse(
      `Generate viral hook concepts for ${genre} with platform-specific execution notes.`
    );
  }

  private handleReleaseCommand(artist: string, genre: string): Promise<string> {
    return this.generateAiResponse(
      `Build a 6-week release strategy for "${artist}" in "${genre}" with pre-save, content cadence, and post-release optimization.`
    );
  }

  private async generateStructure(genre: string): Promise<string> {
    const sectionPlan = this.regenerateSection({
      section: 'verse',
      variation: 0.4,
      includeChords: true,
      complexity: 0.6,
    });
    return this.generateAiResponse(
      `Generate arrangement structure for ${genre}. Plan: ${JSON.stringify(sectionPlan)}`
    );
  }

  private async generateChords(genre: string): Promise<string> {
    return this.generateAiResponse(`Generate chord progression for ${genre}.`);
  }

  private async handleGenerateBassCommand(genre: string): Promise<string> {
    return this.generateAiResponse(`Generate bass line for ${genre}.`);
  }

  private async handleGenerateDrumCommand(genre: string): Promise<string> {
    return this.generateAiResponse(`Generate drum pattern for ${genre}.`);
  }

  private async handleAutoMixCommand(): Promise<string> {
    const settings = await this.getAutoMixSettings();
    return this.generateAiResponse(
      `Provide auto-mix settings. Context: ${JSON.stringify(settings)}`
    );
  }

  public async generateAiResponse(prompt: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.http.post<{ response: string }>('/api/ai/chat', { prompt })
      );
      return response.response;
    } catch (e) {
      this.logger.error('AI Generation Error', e);
      return 'SYSTEM OFFLINE: Local heuristics suggest you focus on rhythmic consistency until uplink is restored.';
    }
  }

  private regenerateSection(config: any): any {
    void config;
    return {
      name: 'Verse',
      bars: 16,
      energy: 0.6,
    };
  }

  async getRecommendationHistory(
    recommendationId: string
  ): Promise<RecommendationHistoryEntry[]> {
    const profile = this.userProfileService.profile();
    return (profile.recommendationHistory || []).filter(
      (h) => h.recommendationId === recommendationId
    );
  }

  async updateRecommendationState(
    recommendationId: string,
    state: RecommendationPreference['state']
  ) {
    const profile = this.userProfileService.profile();
    const prefs = { ...(profile.recommendationPreferences || {}) };
    const current = prefs[recommendationId] || { actionCount: 0 };

    prefs[recommendationId] = {
      state,
      updatedAt: Date.now(),
      actionCount: (current.actionCount || 0) + 1,
    };

    await this.userProfileService.updateProfile({
      recommendationPreferences: prefs,
    } as any);
  }

  getStrategicContextScore(preference: RecommendationPreference | undefined) {
    if (!preference) {
      return 0;
    }

    switch (preference.state) {
      case 'acquired':
        return 20;
      case 'completed':
        return 18;
      default:
        return Math.min((preference.actionCount || 0) * 4, 12);
    }
  }

  private getRecommendationHistorySummary(
    preference: RecommendationPreference | undefined
  ): string | undefined {
    if (!preference) {
      return undefined;
    }

    const stateLabel = preference.state.replaceAll('-', ' ');
    return `Last action: ${stateLabel} • ${new Date(
      preference.updatedAt
    ).toLocaleDateString()}`;
  }

  private getRecommendationStateWeight(
    state: UpgradeRecommendation['state']
  ): number {
    switch (state) {
      case 'saved':
        return 0;
      case 'suggested':
        return 1;
      case 'completed':
        return 2;
      case 'acquired':
        return 3;
      default:
        return 4;
    }
  }

  async getStrategicRecommendations(): Promise<StrategicRecommendationType[]> {
    const profile = this.userProfileService.profile();
    const user = this.injector.get(AuthService).currentUser();
    const catalog = profile?.catalog || [];
    const campaigns = profile?.marketingCampaigns || [];
    const identity = this.artistIdentityService.buildIdentitySnapshot(profile);

    const scores = {
      security: user?.emailVerified ? 100 : 20,
      production: catalog.length >= 5 ? 100 : catalog.length * 20,
      marketing: campaigns.length > 0 ? 100 : 10,
      brand: profile?.artistName && profile?.primaryGenre ? 100 : 30,
    };

    const recs: StrategicRecommendationType[] = [];

    if (!user?.emailVerified) {
      recs.push({
        id: 'sec-rec-1',
        action:
          'Establish Secure Channel: Verify your email to protect personal data.',
        impact: 'Extreme',
        difficulty: 'Low',
        toolId: 'profile',
      });
    }

    if (scores.production < 80) {
      recs.push({
        id: 'prod-rec-1',
        action: `Expand catalog depth (Current: ${catalog.length}/5). Ship more tracks.`,
        impact: 'High',
        difficulty: 'Medium',
        toolId: 'release-planner',
      });
    }

    if (scores.marketing < 50) {
      recs.push({
        id: 'mark-rec-1',
        action: 'Initialize marketing protocols. Launch a test campaign.',
        impact: 'High',
        difficulty: 'Low',
        toolId: 'marketing',
      });
    }

    identity.recommendations.slice(0, 3).forEach((recommendation, index) => {
      recs.push({
        id: `identity-rec-${index + 1}`,
        action: recommendation.title,
        impact:
          recommendation.impactScore >= 90
            ? 'Extreme'
            : recommendation.impactScore >= 80
              ? 'High'
              : 'Medium',
        difficulty:
          recommendation.confidenceScore >= 85
            ? 'Low'
            : recommendation.confidenceScore >= 75
              ? 'Medium'
              : 'High',
        toolId:
          recommendation.category === 'sync'
            ? 'profile'
            : recommendation.category === 'growth'
              ? 'marketing'
              : 'strategy',
      });
    });

    return recs;
  }

  async getUpgradeRecommendations(): Promise<StrategicRecommendationType[]> {
      return this.getStrategicRecommendations();
  }

  async studyTrack(audioBuffer: any, name: string): Promise<void> {
    void audioBuffer;
    void name;
  }

  async getAutoMixSettings(): Promise<{
    threshold: number;
    ratio: number;
    ceiling: number;
    targetLufs: number;
    eqTilt: number;
  }> {
    return {
      threshold: -18,
      ratio: 3.5,
      ceiling: -0.2,
      targetLufs: -14,
      eqTilt: 0.15,
    };
  }

  getProductionSmartAssist(input: {
    arrangementDensity?: number;
    lowBandEnergy?: number;
    midMaskingRisk?: number;
    transientSharpness?: number;
  }): {
    arrangementSuggestion: string;
    eqMaskingHint: string;
    correctivePreset: {
      compressorThreshold: number;
      compressorRatio: number;
      limiterCeiling: number;
      targetLufs: number;
    };
  } {
    const density = input.arrangementDensity ?? 0.5;
    const masking = input.midMaskingRisk ?? 0.4;
    const transient = input.transientSharpness ?? 0.6;

    const arrangementSuggestion =
      density > HIGH_DENSITY_THRESHOLD
        ? 'Arrangement density is high; mute one harmonic layer every 8 bars to improve vocal slot clarity.'
        : 'Arrangement density is moderate; introduce a controlled counter-layer in the final chorus for lift.';
    const eqMaskingHint =
      masking > HIGH_MASKING_THRESHOLD
        ? 'High mid masking risk at 1.5–3kHz; carve 1.5dB from supporting synths and prioritize lead presence.'
        : 'Masking is acceptable; preserve 2kHz pocket while widening upper harmonics above 8kHz.';

    const correctivePreset = {
      compressorThreshold:
        transient > HIGH_TRANSIENT_THRESHOLD
          ? AGGRESSIVE_COMP_THRESHOLD
          : SAFE_COMP_THRESHOLD,
      compressorRatio:
        transient > HIGH_TRANSIENT_THRESHOLD
          ? AGGRESSIVE_COMP_RATIO
          : SAFE_COMP_RATIO,
      limiterCeiling: SAFE_LIMITER_CEILING,
      targetLufs:
        density > HIGH_DENSITY_THRESHOLD
          ? DENSE_TARGET_LUFS
          : DEFAULT_TARGET_LUFS,
    };

    return { arrangementSuggestion, eqMaskingHint, correctivePreset };
  }

  getViralHooks(): string[] {
    return [
      'Algorithm Shift',
      'Transition Logic',
      'Behind the Beat (studio footage)',
      'Before/After Mix Reveal',
      'Tempo-Matched Beat Drop',
      'Lyrics Highlighted Over Instrumental',
      'Fan Reaction Duet',
      'A-Capella to Full Beat Build-Up',
    ];
  }

  getProductionSecrets(): typeof PRODUCTION_SECRETS {
    return PRODUCTION_SECRETS;
  }

  getIntelligenceBriefs(): typeof INTELLIGENCE_LIBRARY {
    return INTELLIGENCE_LIBRARY;
  }

  async startAIBassist(): Promise<void> {
    this.isAIBassistActive.set(true);
  }

  async stopAIBassist(): Promise<void> {
    this.isAIBassistActive.set(false);
  }

  async startAIDrummer(): Promise<void> {
    this.isAIDrummerActive.set(true);
  }

  async stopAIDrummer(): Promise<void> {
    this.isAIDrummerActive.set(false);
  }

  async startAIKeyboardist(): Promise<void> {
    this.isAIKeyboardistActive.set(true);
  }

  async stopAIKeyboardist(): Promise<void> {
    this.isAIKeyboardistActive.set(false);
  }

  async generateImage(prompt: string): Promise<string> {
    void prompt;
    return '';
  }

  async getQuestionnaireInsights(profile: UserProfile): Promise<any[]> {
    const insights = [];
    if (profile.primaryGenre === 'Electronic') {
      insights.push({
        title: 'Sonic Realignment',
        content:
          'Your electronic foundation requires high-fidelity low-end calibration.',
      });
    }
    if (profile.brandVoices?.includes('Elite')) {
      insights.push({
        title: 'Executive Presence',
        content: 'Prune all legacy non-conforming assets.',
      });
    }
    if (profile.strategicGoals?.includes('Sync Catalog Pumping')) {
      insights.push({
        title: 'Sync Readiness',
        content: 'Prioritize instrumental-only versions of your top 5 tracks.',
      });
    }
    if (insights.length === 0) {
      insights.push({
        title: 'General Strategy',
        content: 'Ship a new track every 21 days.',
      });
    }
    return insights;
  }

  getDynamicChecklist(): StrategicTask[] {
    const profile = this.userProfileService.profile();
    const catalog = profile?.catalog || [];
    const campaigns = profile?.marketingCampaigns || [];
    const identity = this.artistIdentityService.buildIdentitySnapshot(profile);
    const tasks: StrategicTask[] = [];

    tasks.push({
      id: 'task-1',
      label: 'Audit last release translation',
      completed: false,
      category: 'Production',
      impact: 'High',
      description: 'Car test, earbuds, mono.',
    });
    tasks.push({
      id: 'task-2',
      label: 'Update EPK',
      completed: false,
      category: 'Marketing',
      impact: 'Medium',
      description: 'Add photos, bio, links.',
    });
    tasks.push({
      id: 'task-3',
      label: 'Schedule social clips',
      completed: false,
      category: 'Social',
      impact: 'High',
      description: '2 clips over 7 days.',
    });
    if (catalog.length < 5) {
      tasks.push({
        id: 'task-4',
        label: `Build catalog to 5+ tracks`,
        completed: false,
        category: 'Production',
        impact: 'High',
        description: 'Minimum depth for DSP eligibility.',
      });
    }
    if (campaigns.length === 0) {
      tasks.push({
        id: 'task-5',
        label: 'Launch first campaign',
        completed: false,
        category: 'Marketing',
        impact: 'High',
        description: 'Start with 0 budget trial.',
      });
    }
    tasks.push({
      id: 'task-6',
      label: 'Submit to playlist curators',
      completed: false,
      category: 'Promotion',
      impact: 'Medium',
      description: 'Target genre-aligned curators.',
    });
    tasks.push({
      id: 'task-7',
      label: 'Register with PRO',
      completed: false,
      category: 'Business',
      impact: 'High',
      description: 'Required for royalty collection.',
    });

    if (
      identity.sync.queueDepth > 0 ||
      identity.resolution.manualReviewRequired
    ) {
      tasks.push({
        id: 'task-identity-review',
        label: 'Review connector trust queue',
        completed: false,
        category: 'Identity',
        impact: 'High',
        description: `${identity.sync.queueDepth} queued sync jobs · trust score ${identity.fingerprint.trustScore}%.`,
      });
    }

    if (identity.fingerprint.riskFlags.length > 0) {
      tasks.push({
        id: 'task-identity-risk',
        label: 'Resolve fingerprint risk flags',
        completed: false,
        category: 'Risk',
        impact: 'High',
        description: identity.fingerprint.riskFlags[0],
      });
    }

    return tasks;
  }
}

export function provideAiService(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: AiService, useClass: AiService },
  ]);
}
