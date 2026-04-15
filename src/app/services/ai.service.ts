import { AuthService } from './auth.service';
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

type RecommendationContext = {
  catalogDepth: number;
  releaseReadyCount: number;
  campaignCount: number;
  hasProRegistration: boolean;
  businessReadiness: number;
  preference?: RecommendationPreference;
};

type UpgradeBlueprint = Omit<
  UpgradeRecommendation,
  | 'state'
  | 'genres'
  | 'whyNow'
  | 'nextStep'
  | 'expectedBenefit'
  | 'evidence'
  | 'progressSignals'
  | 'historySummary'
> & {
  preferredViews?: MainViewMode[];
  rank: (input: {
    profile: UserProfile;
    viewMode: MainViewMode;
    growth: number;
    context: RecommendationContext;
  }) => number;
  buildDetails: (input: {
    profile: UserProfile;
    growth: number;
    context: RecommendationContext;
  }) => Pick<
    UpgradeRecommendation,
    'whyNow' | 'nextStep' | 'expectedBenefit' | 'evidence' | 'progressSignals'
  >;
};

const UPGRADE_BLUEPRINTS: UpgradeBlueprint[] = [
  {
    id: 'upg-room-calibration',
    title: 'Room Calibration',
    type: 'Software',
    description:
      'Dial in speaker translation before the next mix revision and lock in a repeatable reference chain.',
    cost: '$0-$99',
    url: '',
    impact: 'High',
    rationale:
      'Your monitoring chain is the fastest leverage point for cleaner decisions across studio and practice sessions.',
    targetArea: 'Production',
    priority: 'Critical',
    prerequisites: [
      'Reference your last bounce on at least two playback systems',
    ],
    actionLabel: 'Open Studio',
    toolId: 'studio',
    outcomeMetric: {
      label: 'Expected gain',
      value: 'Cleaner low-end translation',
    },
    preferredViews: ['studio', 'practice', 'piano-roll'],
    rank: ({ profile, viewMode, context }) => {
      const hasCalibration = (profile.daw || []).includes('Room Calibration');
      if (hasCalibration) {
        return 18;
      }
      const workspaceBoost = ['studio', 'practice', 'piano-roll'].includes(
        viewMode
      )
        ? 12
        : 0;
      return 74 + workspaceBoost + Math.max(0, 4 - context.releaseReadyCount);
    },
    buildDetails: ({ context }) => ({
      whyNow:
        context.releaseReadyCount > 0
          ? 'You already have release-ready material, so translation mistakes are now expensive.'
          : 'Your studio workflow is active enough that fixing translation upstream will remove avoidable second-guessing.',
      nextStep:
        'Compare one recent bounce on monitors, earbuds, and a phone speaker before changing any mix decisions.',
      expectedBenefit:
        'Make faster low-end and vocal balance decisions with fewer mix revisions.',
      evidence: [
        `Catalog depth: ${context.catalogDepth} tracked release${context.catalogDepth === 1 ? '' : 's'}`,
        `Release-ready songs: ${context.releaseReadyCount}`,
      ],
      progressSignals: [
        {
          label: 'Mix translation',
          before: 'Playback checks happen inconsistently',
          after: 'Reference chain is calibrated before every revision',
        },
      ],
    }),
  },
  {
    id: 'upg-vocal-chain',
    title: 'Vocal Chain Preset Pack',
    type: 'Software',
    description:
      'Standardize your vocal cleanup, compression, and polish so every take starts closer to release-ready.',
    cost: '$29-$149',
    url: '',
    impact: 'Medium',
    rationale:
      'A saved vocal chain reduces setup friction and keeps your voice sitting in front of dense arrangements.',
    targetArea: 'Practice',
    priority: 'High',
    prerequisites: [
      'Record one dry rehearsal pass to compare before and after',
    ],
    actionLabel: 'Open Practice Space',
    toolId: 'practice',
    outcomeMetric: {
      label: 'Expected gain',
      value: 'Faster rehearsal-to-demo workflow',
    },
    preferredViews: ['practice', 'vocal-suite'],
    rank: ({ profile, viewMode, context }) => {
      const hasPresetPack = (profile.daw || []).includes(
        'Vocal Chain Preset Pack'
      );
      if (hasPresetPack) {
        return 16;
      }
      const workspaceBoost = ['practice', 'vocal-suite'].includes(viewMode)
        ? 14
        : 0;
      return 62 + workspaceBoost + Math.max(0, 3 - context.catalogDepth) * 2;
    },
    buildDetails: ({ profile }) => ({
      whyNow:
        (profile.careerGoals || []).length > 0
          ? 'Your active goals suggest you need faster practice turnarounds, not more blank-session setup time.'
          : 'Practice speed is still a leverage point because your vocal workflow resets from scratch too often.',
      nextStep:
        'Track one clean rehearsal pass, then save your baseline EQ, compression, and de-essing into a reusable preset.',
      expectedBenefit:
        'Spend more time performing and less time rebuilding the same vocal chain.',
      evidence: [
        `Career goals on file: ${(profile.careerGoals || []).length}`,
        `Primary genre focus: ${profile.primaryGenre || 'Unknown'}`,
      ],
      progressSignals: [
        {
          label: 'Rehearsal speed',
          before: 'Every session starts with fresh vocal cleanup',
          after: 'Your best starting chain loads instantly',
        },
      ],
    }),
  },
  {
    id: 'upg-translation-checklist',
    title: 'Mix Translation Checklist',
    type: 'Service',
    description:
      'Run a fixed pre-release quality-control pass covering mono, earbuds, car, and phone playback.',
    cost: '$0',
    url: '',
    impact: 'High',
    rationale:
      'Structured translation checks catch avoidable release defects before mastering or distribution spend.',
    targetArea: 'Production',
    priority: 'High',
    prerequisites: ['Bounce the latest mix candidate'],
    actionLabel: 'Open Knowledge Base',
    toolId: 'knowledge-base',
    outcomeMetric: {
      label: 'Expected gain',
      value: 'Fewer revision cycles',
    },
    preferredViews: ['studio', 'release-pipeline', 'knowledge-base'],
    rank: ({ profile, viewMode, context }) => {
      const hasChecklist = (profile.services || []).includes(
        'Mix Translation Checklist'
      );
      if (hasChecklist) {
        return 14;
      }
      const baseScore = context.catalogDepth > 0 ? 78 : 54;
      const workspaceBoost = [
        'studio',
        'release-pipeline',
        'knowledge-base',
      ].includes(viewMode)
        ? 10
        : 0;
      return baseScore + workspaceBoost + context.releaseReadyCount * 3;
    },
    buildDetails: ({ context }) => ({
      whyNow:
        context.catalogDepth > 0
          ? 'You have enough active catalog to justify a repeatable release-quality gate.'
          : 'Adding a checklist now will keep your next release from shipping with preventable playback issues.',
      nextStep:
        'Use your latest bounce and score mono, earbuds, car, and phone playback before you master or distribute.',
      expectedBenefit:
        'Catch translation issues before they create more revisions or waste promotion spend.',
      evidence: [
        `Catalog depth: ${context.catalogDepth}`,
        `Release-ready songs: ${context.releaseReadyCount}`,
      ],
      progressSignals: [
        {
          label: 'Release readiness',
          before: 'QC depends on memory and taste',
          after: 'Every bounce clears the same translation checklist',
        },
      ],
    }),
  },
  {
    id: 'upg-stem-mastering',
    title: 'Stem Mastering Service',
    type: 'Service',
    description:
      'Use stem-based mastering when you need louder, cleaner delivery without sacrificing punch or vocal focus.',
    cost: '$50-$200',
    url: '',
    impact: 'High',
    rationale:
      'Stem mastering becomes valuable once you have active releases and need to protect clarity while chasing competitive loudness.',
    targetArea: 'Production',
    priority: 'High',
    prerequisites: ['Finish arrangement and mix notes first'],
    actionLabel: 'Open Release Pipeline',
    toolId: 'release-pipeline',
    outcomeMetric: {
      label: 'Expected gain',
      value: 'Stronger release readiness',
    },
    preferredViews: ['release-pipeline', 'studio'],
    rank: ({ profile, viewMode, context }) => {
      const hasService = (profile.services || []).includes(
        'Stem Mastering Service'
      );
      if (hasService) {
        return 20;
      }
      const baseScore = context.catalogDepth >= 3 ? 80 : 50;
      const workspaceBoost = ['release-pipeline', 'studio'].includes(viewMode)
        ? 12
        : 0;
      return baseScore + workspaceBoost + context.releaseReadyCount * 4;
    },
    buildDetails: ({ context }) => ({
      whyNow:
        context.releaseReadyCount >= 2
          ? 'Multiple near-finished tracks make mastering consistency more valuable than one-off loudness fixes.'
          : 'You are close enough to release mode that mastering clarity now affects the whole rollout.',
      nextStep:
        'Freeze your arrangement notes first, then send stems only after vocal, low-end, and transient priorities are written down.',
      expectedBenefit:
        'Increase release consistency without losing punch or lead-vocal focus.',
      evidence: [
        `Catalog depth: ${context.catalogDepth}`,
        `Release-ready songs: ${context.releaseReadyCount}`,
      ],
      progressSignals: [
        {
          label: 'Master delivery',
          before: 'Final loudness trades off against clarity',
          after: 'Mastering adjustments stay surgical across stems',
        },
      ],
    }),
  },
  {
    id: 'upg-dsp-promotion',
    title: 'DSP Promotion',
    type: 'Service',
    description:
      'Activate a lightweight campaign and playlist outreach loop once you have enough catalog depth to convert attention.',
    cost: '$30-$150',
    url: '',
    impact: 'Medium',
    rationale:
      'Promotion spend compounds once there is a real release runway instead of a single isolated track.',
    targetArea: 'Marketing',
    priority: 'Critical',
    prerequisites: ['Have at least one upcoming or recent release to push'],
    actionLabel: 'Open Strategy Hub',
    toolId: 'strategy',
    outcomeMetric: {
      label: 'Expected gain',
      value: 'Higher campaign reach',
    },
    preferredViews: ['strategy', 'hub', 'analytics'],
    rank: ({ profile, viewMode, growth, context }) => {
      const hasService = (profile.services || []).includes('DSP Promotion');
      if (hasService) {
        return 12;
      }
      const needsActivation = context.campaignCount === 0 ? 64 : 24;
      const catalogScore = context.catalogDepth < 3 ? 12 : 22;
      const growthPressure = growth < 5 ? 18 : 8;
      const workspaceBoost = ['strategy', 'hub', 'analytics'].includes(viewMode)
        ? 12
        : 0;
      return needsActivation + catalogScore + growthPressure + workspaceBoost;
    },
    buildDetails: ({ growth, context }) => ({
      whyNow:
        context.campaignCount === 0
          ? 'You have catalog to promote but no active campaign loop capturing that demand yet.'
          : 'Your current campaign footprint is still thin enough that a tighter DSP loop can raise reach quickly.',
      nextStep:
        'Pair one release with playlist outreach, pre-save messaging, and a small paid test instead of spreading effort across every track.',
      expectedBenefit:
        'Turn catalog depth into measurable reach instead of waiting for organic spikes.',
      evidence: [
        `Campaigns tracked: ${context.campaignCount}`,
        `Overall growth signal: ${growth.toFixed(1)}`,
      ],
      progressSignals: [
        {
          label: 'Campaign reach',
          before: 'Release activity is mostly organic',
          after: 'Promotion follows a repeatable DSP and outreach loop',
        },
      ],
    }),
  },
  {
    id: 'upg-pro-registration',
    title: 'PRO Registration Sprint',
    type: 'Service',
    description:
      'Formalize royalty collection by registering works, metadata, and rights admin before growth compounds.',
    cost: '$0-$99',
    url: '',
    impact: 'High',
    rationale:
      'Business infrastructure gaps delay royalty capture and weaken your release system when momentum arrives.',
    targetArea: 'Business',
    priority: 'High',
    prerequisites: ['Gather writer, producer, and split metadata'],
    actionLabel: 'Open Knowledge Base',
    toolId: 'knowledge-base',
    outcomeMetric: {
      label: 'Expected gain',
      value: 'Faster royalty readiness',
    },
    preferredViews: ['strategy', 'business-suite', 'knowledge-base'],
    rank: ({ profile, viewMode, context }) => {
      const hasService = (profile.services || []).includes(
        'PRO Registration Sprint'
      );
      if (hasService) {
        return 18;
      }
      if (context.hasProRegistration) {
        return 24;
      }
      const workspaceBoost = [
        'strategy',
        'business-suite',
        'knowledge-base',
      ].includes(viewMode)
        ? 12
        : 0;
      return (
        (context.catalogDepth > 0 ? 72 : 44) +
        workspaceBoost +
        Math.max(0, 4 - context.businessReadiness) * 5
      );
    },
    buildDetails: ({ context }) => ({
      whyNow: context.hasProRegistration
        ? 'Your royalty identity is partially set up, so the next gain comes from finishing the registration workflow.'
        : 'Your business infrastructure is lagging behind your release activity, which risks missed royalty collection.',
      nextStep:
        'Collect writer splits, IPI details, and release metadata in one session, then register every active song in the same sprint.',
      expectedBenefit:
        'Move from scattered metadata to a royalty-ready catalog that can scale with growth.',
      evidence: [
        `Business readiness score: ${context.businessReadiness}/5`,
        `PRO registered: ${context.hasProRegistration ? 'Yes' : 'No'}`,
      ],
      progressSignals: [
        {
          label: 'Royalty readiness',
          before: 'Rights data is fragmented or missing',
          after: 'Works, splits, and IPI details are registration-ready',
        },
      ],
    }),
  },
];

@Injectable({
  providedIn: 'root',
})

export class AiService {
  private authService = inject(AuthService);
  private http = inject(HttpClient);
  private userProfileService = inject(UserProfileService);
  private analyticsService = inject(AnalyticsService);
  private userContext = inject(UserContextService);
  private neuralMixer = inject(NeuralMixerService);
  private musicManager = inject(MusicManagerService);
  private artistIdentityService = inject(ArtistIdentityService);
  private logger = inject(LoggingService);

  private API_URL =
    'https://smuve-v4-backend-9951606049235487441.onrender.com/api';

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
      // Read the profile signal so this effect re-runs when artist context changes.
      this.userProfileService.profile();
      this.updateAdvisorAdvice(mode);
    });
  }

  private updateAdvisorAdvice(viewMode: MainViewMode | string): void {
    const advice: AdvisorAdvice[] = [];
    const growth = this.analyticsService.overallGrowth();
    const profile = this.userProfileService.profile();
    const catalog = profile?.catalog || [];
    const identity = this.artistIdentityService.buildIdentitySnapshot(profile);

    if (viewMode === 'hub' || viewMode === 'analytics') {
      if (growth < 5) {
        advice.push({
          id: 'adv-hub-visibility',
          title: 'Visibility Surge Needed',
          content: 'Your growth is stagnant. Post high-impact hook clips now.',
          type: 'Marketing',
          priority: 'URGENT',
          persona: 'PUBLICIST',
        });
      }

      if (identity.fingerprint.trustScore < 75) {
        advice.push({
          id: 'adv-hub-identity',
          title: 'Identity Trust Gap',
          content: `Fingerprint trust is ${identity.fingerprint.trustScore}%. Resolve connector review items before scaling spend.`,
          type: 'Identity',
          priority: 'HIGH',
          persona: 'SYNC',
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
        persona: 'AR',
      });
    }

    if (catalog.length < 3) {
      advice.push({
        id: 'adv-catalog-depth',
        title: 'Catalog Depth Constraint',
        content:
          'Release depth is still light. Expand the graph to at least 3 works before full-funnel campaigns.',
        type: 'Release',
        priority: 'MEDIUM',
        persona: 'EXECUTIVE',
      });
    }

    if (advice.length === 0) {
      advice.push({
        id: 'adv-nominal',
        title: 'Neural Sync Active',
        content: 'System at peak efficiency.',
        type: 'System',
        priority: 'LOW',
        persona: 'EXECUTIVE',
      });
    }

    this.advisorAdvice.set(advice);
  }

  async generateAiResponse(prompt: string): Promise<string> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return '[S.M.U.V.E 2.0 // UPLINK SEVERED] Connect to the grid. FIX YOUR SONIC DEFICITS.';
    }

    try {
      const response = await firstValueFrom(
        this.http.post<{ text: string }>(`${this.API_URL}/ai/analyze`, {
          prompt,
        })
      );
      return response.text;
    } catch (_error) {
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
        criticalDeficits: [
          'Low-end translation deficit',
          'Arrangement stagnation',
        ],
        technicalRecommendations: ['Fix low-mid mud'],
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
    const context = `BPM Variance: ${report.catalogAnalysis?.bpmVariance.toFixed(1)}, Key Consistency: ${report.catalogAnalysis?.keyConsistency.toFixed(1)}%.`;
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
      includeBass: true,
      includeDrums: true,
    });
    return `Song structure generated for ${genre}: ${sectionPlan.section} scaffold ready with harmonic, bass, and drum layers.`;
  }

  private async generateChords(genre: string): Promise<string> {
    const progression = this.generateChordProgression({
      genre,
      mood: 'neutral',
      section: 'verse',
      variation: 0.5,
      humanize: true,
    });
    return `Chord progression generated for ${genre} (${progression.length} blocks).`;
  }

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
        persona: 'AR',
      });
    }

    if (!profile.proName) {
      advice.push({
        id: 'pub-1',
        title: 'Transparency Gap',
        content:
          "No PRO registration found. You're invisible to legal revenue.",
        type: 'Branding',
        priority: 'HIGH',
        persona: 'PUBLICIST',
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

  generateChordProgression(input: {
    genre?: string;
    mood?: 'dark' | 'uplift' | 'neutral';
    key?: string;
    section?: 'intro' | 'verse' | 'hook' | 'bridge' | 'outro';
    variation?: number;
    humanize?: boolean;
  }): {
    id: string;
    name: string;
    startStep: number;
    length: number;
    midi: number[];
  }[] {
    const base = [
      { name: 'Am', midi: [57, 60, 64] },
      { name: 'F', midi: [53, 57, 60] },
      { name: 'C', midi: [48, 52, 55] },
      { name: 'G', midi: [55, 59, 62] },
    ];
    const variation = Math.max(0, Math.min(1, input.variation ?? 0.4));
    const moodOffset =
      input.mood === 'uplift' ? 1 : input.mood === 'dark' ? -1 : 0;
    return base.map((chord, idx) => ({
      id: `cp-${idx}`,
      name: chord.name,
      startStep: idx * 16,
      length: 16,
      midi: chord.midi.map(
        (note) =>
          note + moodOffset + (variation > 0.7 && idx % 2 === 0 ? 12 : 0)
      ),
    }));
  }

  generateBassline(input: {
    genre?: string;
    key?: string;
    section?: 'verse' | 'hook' | 'bridge';
    variation?: number;
    humanize?: boolean;
  }): Array<{ step: number; midi: number; length: number; velocity: number }> {
    const variation = Math.max(0, Math.min(1, input.variation ?? 0.35));
    const pattern = [0, 4, 8, 12, 16, 20, 24, 28].map((step) => ({
      step,
      midi: 36 + (step % 8 === 0 ? 0 : 3),
      length: 2,
      velocity: 0.75 + variation * 0.2,
    }));
    if (!input.humanize) return pattern;
    return pattern.map((note) => ({
      ...note,
      step: Math.max(0, note.step + (Math.random() > 0.5 ? 0.25 : -0.25)),
      velocity: Math.max(
        0.5,
        Math.min(1, note.velocity + (Math.random() - 0.5) * 0.15)
      ),
    }));
  }

  private async handleGenerateBassCommand(genre: string): Promise<string> {
    const pattern = this.generateBassline({
      genre,
      section: 'verse',
      variation: 0.45,
      humanize: true,
    });
    return `Bassline generated for ${genre} (${pattern.length} notes).`;
  }

  generateDrumPattern(input: {
    style?: string;
    energy?: number;
    section?: 'intro' | 'verse' | 'hook' | 'bridge' | 'outro';
    variation?: number;
    humanize?: boolean;
  }): Array<{ step: number; midi: number; velocity: number; length: number }> {
    const energy = Math.max(0.1, Math.min(1, input.energy ?? 0.6));
    const hats = Array.from({ length: 16 }, (_, i) => ({
      step: i * 2,
      midi: 42,
      velocity: 0.45 + energy * 0.25,
      length: 1,
    }));
    const core = [
      { step: 0, midi: 36, velocity: 0.95, length: 1 },
      { step: 8, midi: 36, velocity: 0.9, length: 1 },
      { step: 4, midi: 38, velocity: 0.85, length: 1 },
      { step: 12, midi: 38, velocity: 0.88, length: 1 },
    ];
    const groove = [...core, ...hats];
    if (!input.humanize) return groove;
    return groove.map((hit) => ({
      ...hit,
      step: Math.max(0, hit.step + (Math.random() > 0.7 ? 0.25 : 0)),
      velocity: Math.max(
        0.3,
        Math.min(1, hit.velocity + (Math.random() - 0.5) * 0.1)
      ),
    }));
  }

  private async handleGenerateDrumCommand(style: string): Promise<string> {
    const hits = this.generateDrumPattern({
      style,
      section: 'hook',
      variation: 0.5,
      humanize: true,
      energy: 0.7,
    });
    return `Drum pattern generated for ${style} (${hits.length} hits).`;
  }

  regenerateSection(input: {
    section: 'intro' | 'verse' | 'hook' | 'bridge' | 'outro';
    variation?: number;
    includeChords?: boolean;
    includeBass?: boolean;
    includeDrums?: boolean;
  }): {
    section: string;
    chords?: ReturnType<AiService['generateChordProgression']>;
    bass?: ReturnType<AiService['generateBassline']>;
    drums?: ReturnType<AiService['generateDrumPattern']>;
  } {
    const variation = input.variation ?? 0.45;
    return {
      section: input.section,
      chords: input.includeChords
        ? this.generateChordProgression({
            section: input.section,
            variation,
            humanize: true,
          })
        : undefined,
      bass: input.includeBass
        ? this.generateBassline({
            section: input.section === 'hook' ? 'hook' : 'verse',
            variation,
            humanize: true,
          })
        : undefined,
      drums: input.includeDrums
        ? this.generateDrumPattern({
            section: input.section,
            variation,
            humanize: true,
            energy: 0.7,
          })
        : undefined,
    };
  }

  private async handleAutoMixCommand(): Promise<string> {
    this.neuralMixer.applyNeuralMix();
    return 'Neural Mix protocol initiated. All channel strips have been balanced according to heuristic production intelligence.';
  }

  async runHardDataAudit(): Promise<ExecutiveAuditReport> {
    const profile = this.userProfileService.profile();
    const catalog = profile.catalog || [];
    let bpmVar = 0;
    let keyCons = 0;
    let genAlig = 0;
    if (catalog.length > 1) {
      const bpms = catalog.map((c) => c.bpm || 120);
      const avgBpm = bpms.reduce((a, b) => a + b, 0) / bpms.length;
      bpmVar = Math.sqrt(
        bpms.reduce((s, b) => s + Math.pow(b - avgBpm, 2), 0) / bpms.length
      );
      const keys = catalog.map((c) => c.key || 'C');
      keyCons = (1 - new Set(keys).size / catalog.length) * 100;
      genAlig =
        (catalog.filter(
          (c) => (c.genre || profile.primaryGenre) === profile.primaryGenre
        ).length /
          catalog.length) *
        100;
    }
    return {
      overallScore: Math.floor((genAlig + keyCons) / 2) || 50,
      sonicCohesion: Math.floor(100 - bpmVar),
      arrangementDepth: 75,
      marketViability: genAlig > 70 ? 85 : 40,
      criticalDeficits: [],
      technicalRecommendations: [],
      catalogAnalysis: {
        bpmVariance: bpmVar,
        keyConsistency: keyCons,
        genreAlignment: genAlig,
      },
    };
  }

  getUpgradeRecommendations(): UpgradeRecommendation[] {
    const profile = this.userProfileService.profile();
    const viewMode = this.userContext.mainViewMode();
    const growth = this.analyticsService.overallGrowth();
    const preferences = profile.recommendationPreferences || {};
    const context = this.buildRecommendationContext(profile);
    const recommendations = UPGRADE_BLUEPRINTS.map((blueprint) => {
      const preference = preferences[blueprint.id];
      const acquired = this.isUpgradeAcquired(profile, blueprint);
      const state =
        preference?.state === 'completed'
          ? 'completed'
          : acquired
            ? 'acquired'
            : preference?.state || this.getDefaultRecommendationState();

      const workspaceBoost = blueprint.preferredViews?.includes(viewMode)
        ? 4
        : 0;
      const details = blueprint.buildDetails({
        profile,
        growth,
        context: {
          ...context,
          preference,
        },
      });
      const rankScore =
        blueprint.rank({
          profile,
          viewMode,
          growth,
          context: {
            ...context,
            preference,
          },
        }) +
        workspaceBoost -
        this.getRecommendationDecay(preference);

      return {
        ...blueprint,
        ...details,
        state,
        genres: profile.primaryGenre ? [profile.primaryGenre] : [],
        historySummary: this.getRecommendationHistorySummary(preference),
        rankScore,
      };
    })
      .filter(
        (recommendation) =>
          !['dismissed', 'not-relevant'].includes(recommendation.state || '')
      )
      .sort((a, b) => {
        const stateWeight =
          this.getRecommendationStateWeight(a.state) -
          this.getRecommendationStateWeight(b.state);
        if (stateWeight !== 0) {
          return stateWeight;
        }
        return b.rankScore - a.rankScore;
      });

    return Array.from(
      new Map(
        recommendations.map((recommendation) => [
          recommendation.id,
          recommendation,
        ])
      ).values()
    ).map((recommendation) => {
      const {
        rankScore: _rankScore,
        preferredViews: _preferredViews,
        rank: _rank,
        ...cleanRecommendation
      } = recommendation;

      return cleanRecommendation;
    });
  }

  private isUpgradeAcquired(
    profile: UserProfile,
    recommendation: Pick<UpgradeRecommendation, 'title' | 'type'>
  ): boolean {
    if (recommendation.type === 'Gear') {
      return (profile.equipment || []).includes(recommendation.title);
    }
    if (recommendation.type === 'Software') {
      return (profile.daw || []).includes(recommendation.title);
    }
    return (profile.services || []).includes(recommendation.title);
  }

  private getDefaultRecommendationState(): NonNullable<
    UpgradeRecommendation['state']
  > {
    return 'suggested';
  }

  private buildRecommendationContext(
    profile: UserProfile
  ): Omit<RecommendationContext, 'preference'> {
    const catalog = profile.catalog || [];
    const campaignCount = profile.marketingCampaigns?.length || 0;
    const releaseReadyCount = catalog.filter((item) =>
      ['ready', 'scheduled', 'released'].includes(
        String(item.status || '').toLowerCase()
      )
    ).length;
    const businessReadinessSignals = [
      Boolean(profile.proName || profile.proIpi),
      (profile.services || []).length > 0,
      catalog.length > 0,
      campaignCount > 0,
      (profile.careerGoals || []).length > 0,
    ];

    return {
      catalogDepth: catalog.length,
      releaseReadyCount,
      campaignCount,
      hasProRegistration: Boolean(profile.proName || profile.proIpi),
      businessReadiness: businessReadinessSignals.filter(Boolean).length,
    };
  }

  private getRecommendationDecay(
    preference: RecommendationPreference | undefined
  ): number {
    if (!preference) {
      return 0;
    }

    switch (preference.state) {
      case 'saved':
        return 0;
      case 'acquired':
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
    const user = this.authService.currentUser();
    const catalog = profile?.catalog || [];
    const campaigns = profile?.marketingCampaigns || [];
    const identity = this.artistIdentityService.buildIdentitySnapshot(profile);

    const scores = {
      security: user?.emailVerified ? 100 : 20,
      production: catalog.length >= 5 ? 100 : catalog.length * 20,
      marketing: campaigns.length > 0 ? 100 : 10,
      brand: (profile?.artistName && profile?.primaryGenre) ? 100 : 30
    };

    const recs: StrategicRecommendationType[] = [];

    if (!user?.emailVerified) {
      recs.push({
        id: "sec-rec-1",
        action: "Establish Secure Channel: Verify your email to protect personal data.",
        impact: "Extreme",
        difficulty: "Low",
        toolId: "profile"
      });
    }

    if (scores.production < 80) {
      recs.push({
        id: "prod-rec-1",
        action: `Expand catalog depth (Current: ${catalog.length}/5). Ship more tracks.`,
        impact: "High",
        difficulty: "Medium",
        toolId: "release-planner"
      });
    }

    if (scores.marketing < 50) {
      recs.push({
        id: "mark-rec-1",
        action: "Initialize marketing protocols. Launch a test campaign.",
        impact: "High",
        difficulty: "Low",
        toolId: "marketing"
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
