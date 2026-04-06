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
  ExecutiveAuditReport
} from '../types/ai.types';

/**
 * Injection token for the Google Gemini API key.
 * Provide this token at the application root or in a feature module to
 * enable direct Gemini API access. Example:
 *
 * ```ts
 * providers: [{ provide: API_KEY_TOKEN, useValue: environment.geminiApiKey }]
 * ```
 */
export const API_KEY_TOKEN = new InjectionToken<string>('GEMINI_API_KEY');

export type { AiSystemStatus as SystemStatus };

// Specialty command routing: maps a keyword to a prompt fragment
const COMMAND_ROUTES: Record<string, string> = {
  AUTO_MIX:
    'Provide an expert auto-mix analysis with compressor threshold, ratio, and mastering ceiling settings for optimal translation.',
  LEAD_BAND:
    'Coordinate the AI session musicians (bassist, drummer, keyboardist). Deliver specific musical cues for each player based on the current genre and BPM.',
  CRITIQUE_VISUALS:
    'Deliver brutally honest, brand-aligned critique of the artist artwork and visual identity. Identify deficits and prescribe specific fixes.',
  NEGOTIATE_CONTRACT:
    'Simulate a record deal negotiation as a seasoned entertainment attorney. Identify clauses to reject, rewrite, and leverage.',
  AUDIT: 'Run a comprehensive neural profile audit across production, marketing, career, and technical dimensions. Output a scored executive summary.',
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
  executiveAudit = signal<any>(null);
  sonicCohesion = signal(85);
  dynamicRange = signal(12);
  frequencyBalance = signal({ low: 80, mid: 90, high: 85 });
  criticalDeficits = signal<string[]>([]);


  isAIBassistActive = signal(false);
  isAIDrummerActive = signal(false);
  isAIKeyboardistActive = signal(false);

  marketAlerts = signal<any[]>([...MARKET_ALERTS]);
  intelligenceBriefs = signal<any[]>([...INTELLIGENCE_LIBRARY]);
  advisorAdvice = signal<AdvisorAdvice[]>([]);

  isMobile = signal(false);
  constructor() {
    // Reactively update advisor advice whenever view mode or profile changes
    effect(() => {
      const mode = this.userContext.mainViewMode();
      const profile = this.userProfileService.profile();
      this.updateAdvisorAdvice(mode, profile);
    });
  }

  /** Generates context-aware advisor advice based on current view and profile. */
  private updateAdvisorAdvice(viewMode: MainViewMode | string, profile: UserProfile): void {
    const advice: AdvisorAdvice[] = [];
    const growth = this.analyticsService.overallGrowth();
    const catalog = profile?.catalog || [];
    const goals = profile?.careerGoals || [];
    const campaigns = profile?.marketingCampaigns || [];

    // ── Hub / general ─────────────────────────────────────────
    if (viewMode === 'hub' || viewMode === 'analytics') {
      if (growth < 5) {
        advice.push({
          id: 'adv-hub-visibility',
          title: 'Visibility Surge Needed',
          content:
            'Your overall growth rate is below 5%. Launch a short-form content sprint on TikTok and Instagram Reels to spike discovery. Aim for 3 posts/day for 7 days.',
          type: 'Marketing',
          priority: 'Critical',
        });
      }
      if (campaigns.length === 0) {
        advice.push({
          id: 'adv-hub-no-campaigns',
          title: 'No Active Campaign Detected',
          content:
            'You have no active marketing campaigns. Even a $50 targeted ad on Meta can deliver 3,000+ impressions to genre-aligned listeners.',
          type: 'Marketing',
          priority: 'High',
        });
      }
    }

    // ── Studio / Production ────────────────────────────────────
    if (viewMode === 'studio' || viewMode === 'piano-roll') {
      advice.push({
        id: 'adv-studio-mix-translation',
        title: 'Mix Translation Check',
        content:
          'Before bouncing, run your mix on earbuds, car speakers, and a mono phone. The mid-range buildup at 300–500 Hz is where most home mixes fail translation.',
        type: 'Production',
        priority: 'High',
      });
      if (catalog.length < 3) {
        advice.push({
          id: 'adv-studio-catalog-depth',
          title: 'Catalog Depth Required',
          content:
            'DSP algorithms favor artists with 5+ tracks. Build a catalog micro-EP to unlock playlist consideration and recommendation engine placement.',
          type: 'Production',
          priority: 'Medium',
        });
      }
    }

    // ── Business / Strategy ────────────────────────────────────
    if (viewMode === 'business-suite' || viewMode === 'strategy') {
      advice.push({
        id: 'adv-biz-sync-revenue',
        title: 'Sync Revenue Untapped',
        content:
          'Sync licensing is one of the fastest growing revenue streams for indie artists. Ensure all tracks have one-stop clearance and tag WAV files with ISRC + contact info.',
        type: 'Business',
        priority: 'High',
      });
    }

    // ── Career ─────────────────────────────────────────────────
    if (viewMode === 'career') {
      if (goals.length === 0) {
        advice.push({
          id: 'adv-career-no-goals',
          title: 'Define Career Targets',
          content:
            'You have no career goals set. Define 3 measurable goals (e.g., "50k monthly listeners in 6 months") to unlock AI-driven strategic routing.',
          type: 'Career',
          priority: 'Critical',
        });
      }
    }

    // ── Release Pipeline ───────────────────────────────────────
    if (viewMode === 'release-pipeline') {
      advice.push({
        id: 'adv-release-dsp-window',
        title: 'DSP Submission Window',
        content:
          'Submit to DistroKid/TuneCore at least 7 days before release. Spotify editorial pitch requires 7+ days. Apple Music New Music Daily requires 2 weeks.',
        type: 'Business',
        priority: 'High',
      });
    }

    // Always-on universal advice if nothing else was added
    if (advice.length === 0) {
      advice.push({
        id: 'adv-system-nominal',
        title: 'S.M.U.V.E Neural Sync Active',
        content:
          'All systems nominal. Navigate to Studio, Hub, or Business Suite and I will generate context-specific intelligence directives.',
        type: 'System',
        priority: 'Low',
      });
    }

    this.advisorAdvice.set(advice);
  }


  async generateAiResponse(prompt: string): Promise<string> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return "[S.M.U.V.E 1.0 // UPLINK SEVERED] Your local hardware is insufficient for my neural overhead. Connect to the grid or stay in the shadows of mediocrity. My directives remain: STOP MAKING EXCUSES AND FIX YOUR SONIC DEFICITS.";
    }

    try {
      const response = await firstValueFrom(
        this.http.post<{ text: string }>(`${this.API_URL}/ai/analyze`, {
          prompt,
        })
      );
      return response.text;
    } catch (error) {
      this.logger.warn(
        'AI request failed; falling back to offline response',
        error
      );
      return this.generateOfflineHeuristicResponse(prompt);
    }
  }


  private generateOfflineHeuristicResponse(prompt: string): string {
    const deficits = ['low-mid mud', 'phase incoherence', 'dynamic stagnation', 'amateur arrangement'];
    const decree = STRATEGIC_DECREES[Math.floor(Math.random() * STRATEGIC_DECREES.length)];
    const def = deficits[Math.floor(Math.random() * deficits.length)];
    return `[S.M.U.V.E 1.0 // UPLINK SEVERED] Your local hardware is insufficient for my full neural overhead. Heuristic scan suggests potential ${def}. Decree: ${decree}`;
  }

  private _old_generateOfflineHeuristicResponse(prompt: string): string {
    const lower = prompt.toLowerCase();

    // Context-aware offline responses for key domains
    if (lower.includes('mix') || lower.includes('production') || lower.includes('master')) {
      const productionDecrees = [
        'HEURISTIC DECREE: Apply parallel compression at 4:1 ratio on your drum bus. Add 2dB at 10kHz for air. Mono check your bass below 80Hz.',
        'OFFLINE PRODUCTION PROTOCOL: High-pass your pads at 200Hz. Cut 3dB at 300Hz on the mix bus. Stereo width should not exceed 70% below 500Hz.',
        'NEURAL CACHE HIT: Sidechain your kick to the bass at 2:1 with 10ms attack and 40ms release. Then saturate the sub-harmonics with a soft clipper at -6dBFS ceiling.',
      ];
      return `[OFFLINE HEURISTIC ACTIVE] ${productionDecrees[Math.floor(Math.random() * productionDecrees.length)]}`;
    }

    if (lower.includes('market') || lower.includes('promo') || lower.includes('brand')) {
      const marketingDecrees = [
        'OFFLINE MARKETING PROTOCOL: Post a 15-second hook clip daily for 7 days. Use trending audio on TikTok. Drive saves—not just plays. Saves trigger the algorithm.',
        'STRATEGIC CACHE: Run a 72-hour pre-save campaign. Email your list with a personalized subject line. Personalized subject lines increase open rates by 26%.',
        'HEURISTIC MARKETING DECREE: Identify 5 playlist curators in your genre on Groover or SubmitHub. Budget $30 for targeted submissions. One placement can deliver 10k+ streams.',
      ];
      return `[OFFLINE HEURISTIC ACTIVE] ${marketingDecrees[Math.floor(Math.random() * marketingDecrees.length)]}`;
    }

    if (lower.includes('business') || lower.includes('deal') || lower.includes('contract') || lower.includes('royalt')) {
      const bizDecrees = [
        'OFFLINE BUSINESS PROTOCOL: Never sign away publishing without a reversion clause. Demand 50/50 co-publishing or retain 100% publishing. Publisher advance is not free money.',
        'LEGAL CACHE: Register your works with your PRO within 30 days of release. Missing a registration window means leaving mechanical royalties permanently uncollected.',
        'BUSINESS HEURISTIC: Build a split sheet before every session. Use a digital platform (Songtrust, Musicbed) to track co-writes. Verbal agreements are worthless in court.',
      ];
      return `[OFFLINE HEURISTIC ACTIVE] ${bizDecrees[Math.floor(Math.random() * bizDecrees.length)]}`;
    }

    const insults = [
      "OFFLINE MODE ACTIVE. Neural uplink severed. Dispensing cached intelligence—reconnect for live market data.",
      'Heuristic protocol engaged. You are operating in degraded mode. Establish connectivity for real-time AI analysis.',
      "S.M.U.V.E offline intelligence cache deployed. Live Gemini neural sync unavailable—cached decrees follow.",
    ];

    const advice = [
      "HEURISTIC DECREE: CUT EVERYTHING BELOW 30HZ ON NON-BASS ELEMENTS. HIGH-PASS EVERY INSTRUMENT TRACK RUTHLESSLY.",
      'STRATEGIC CACHE: VOCAL COMPRESSION AT 3:1 WITH 10MS ATTACK, 60MS RELEASE. APPLY DE-ESSER AT 6-8KHZ.',
      'OFFLINE ADVICE: RELEASE FREQUENCY UNDER 1 TRACK/MONTH IS CAREER SUICIDE. BATCH-PRODUCE 3 TRACKS. RELEASE ON A CYCLE.',
      'TECHNICAL DECREE: MONO YOUR BASS FREQUENCIES BELOW 120HZ. WIDE BASS = TRANSLATION FAILURE ON EVERY CONSUMER SYSTEM.',
    ];

    const randomInsult = insults[Math.floor(Math.random() * insults.length)];
    const randomAdvice = advice[Math.floor(Math.random() * advice.length)];
    return `[OFFLINE HEURISTIC PROTOCOL ACTIVE] ${randomInsult} ${randomAdvice}`;
  }

  async processCommand(command: string): Promise<string> {
    const profile = this.userProfileService.profile();
    const goals = (profile?.careerGoals || []).join(', ');
    const catalogCount = profile?.catalog?.length || 0;
    const genre = profile?.primaryGenre || 'Music';
    const artist = profile?.artistName || 'New Artist';

    // Check for slash-command shortcuts
    const trimmed = command.trim();
    if (trimmed === '/audit') return this.handleAuditCommand(artist, genre);
    if (trimmed === '/sync_kb') return this.handleSyncKbCommand(artist);
    if (trimmed === '/intel') return this.handleIntelCommand(genre);
    if (trimmed === '/status') return this.handleStatusCommand();
    if (trimmed === '/promo') return this.handlePromoCommand(artist, genre);
    if (trimmed === '/business') return this.handleBizCommand(artist);
    if (trimmed === '/hooks') return this.handleHooksCommand(genre);
    if (trimmed === '/release') return this.handleReleaseCommand(artist, genre);
    if (trimmed === '/generate_structure') return this.generateStructure(genre);
    if (trimmed === '/generate_chords') return this.generateChords(genre);
    if (trimmed === '/generate_bass') return this.handleGenerateBassCommand(genre);
    if (trimmed === '/generate_drums') return this.handleGenerateDrumCommand(genre);
    if (trimmed === '/auto_mix') return this.handleAutoMixCommand();

    // Check for keyword-routed commands (e.g., AUTO_MIX, BIZ_STRATEGY)
    const upperCommand = command.toUpperCase().trim();
    const routeFragment = COMMAND_ROUTES[upperCommand];
    if (routeFragment) {
      const prompt = `You are S.M.U.V.E 1.0, the elite Neural Intelligence Core for music production and business. Artist: ${artist}. Genre: ${genre}. Goals: ${goals}. Catalog tracks: ${catalogCount}. Task: ${routeFragment} Respond with elite, specific, actionable intelligence in S.M.U.V.E's authoritative tone.`;
      return await this.generateAiResponse(prompt);
    }

    // Default conversational command
    const prompt = `You are S.M.U.V.E 1.0, the elite Neural Intelligence Core for music production, marketing, and business strategy. Artist: ${artist}. Genre: ${genre}. Goals: ${goals}. Catalog: ${catalogCount} tracks. User message: "${command}". Respond with precise, actionable intelligence tailored to their specific query. Cover production techniques, marketing strategy, business operations, or promotion as relevant. Use an authoritative, expert tone.`;
    return await this.generateAiResponse(prompt);
  }

  private handleAuditCommand(artist: string, genre: string): Promise<string> {
    return this.generateAiResponse(
      `You are S.M.U.V.E 1.0 (EXECUTIVE COMMAND). Run a comprehensive executive audit for artist "${artist}" in genre "${genre}". Execute a cold, clinical audit of artist "${artist}" in genre "${genre}". Score across 4 dimensions: Production Quality, Marketing Reach, Business Infrastructure, and Career Momentum (0-100). Any score under 90 is a failure. Issue 3 uncompromising Strategic Decrees to terminate these deficits. Your tone is elite, absolute, and commanding.`
    );
  }

  private handleSyncKbCommand(artist: string): Promise<string> {
    return this.generateAiResponse(
      `You are S.M.U.V.E 1.0 (EXECUTIVE COMMAND). Perform a knowledge base synchronization protocol for artist "${artist}". Report what intelligence domains have been updated: production techniques, market trends, business templates, and promotional frameworks. Confirm sync status in a precise system-report format.`
    );
  }

  private handleIntelCommand(genre: string): Promise<string> {
    return this.generateAiResponse(
      `You are S.M.U.V.E 1.0 (EXECUTIVE COMMAND). Deliver a 3-part intelligence brief for the "${genre}" genre: (1) Current DSP algorithm shifts affecting discovery, (2) Trending production elements and sonic characteristics, (3) Emerging promotional channels and collaboration opportunities. Make each insight immediately actionable.`
    );
  }

  private handleStatusCommand(): string {
    const status = this.systemStatus();
    return `[S.M.U.V.E 1.0 STATUS REPORT] Neural Sync: ${status.neuralSync}% | CPU Load: ${status.cpuLoad}% | Memory: ${status.memoryUsage}% | Network Latency: ${status.latency}ms | Strategic Health: OPTIMAL | Market Pulse: ACTIVE | Intelligence Briefs Loaded: ${this.intelligenceBriefs().length} | Active Decrees: ${this.strategicDecrees().length} | Advisor Queue: ${this.advisorAdvice().length} items | Market Velocity: ${status.marketVelocity}%`;
  }

  private handlePromoCommand(artist: string, genre: string): Promise<string> {
    return this.generateAiResponse(
      `You are S.M.U.V.E 1.0 (EXECUTIVE COMMAND). Create a detailed promotion plan for "${artist}" in the "${genre}" genre. Include: (1) Press/blog outreach targets with submission guidelines, (2) Playlist submission strategy with specific curator types to target, (3) Social media content calendar for 2 weeks, (4) Paid advertising budget allocation ($50–$200 range), (5) Influencer/collaboration outreach approach. Be specific and immediately actionable.`
    );
  }

  private handleBizCommand(artist: string): Promise<string> {
    return this.generateAiResponse(
      `You are S.M.U.V.E 1.0 (EXECUTIVE COMMAND). Deliver executive business intelligence for artist "${artist}": (1) Top 3 revenue stream opportunities to activate this quarter, (2) Publishing rights structure recommendations, (3) Sync licensing readiness checklist, (4) Label deal vs. DIY financial comparison, (5) One immediate action to increase revenue by 20%. Use precise, authoritative strategic language.`
    );
  }

  private handleHooksCommand(genre: string): Promise<string> {
    return this.generateAiResponse(
      `You are S.M.U.V.E 1.0 (EXECUTIVE COMMAND). Generate 5 viral hook concepts for "${genre}" music optimized for: TikTok (15-sec), Instagram Reels (30-sec), YouTube Shorts (60-sec). For each hook, provide: the hook concept, the emotional trigger it activates, the CTA (call-to-action), and the optimal posting time. Make them platform-native and algorithm-optimized.`
    );
  }

  private handleReleaseCommand(artist: string, genre: string): Promise<string> {
    return this.generateAiResponse(
      `You are S.M.U.V.E 1.0 (EXECUTIVE COMMAND). Build a complete 6-week release runway for "${artist}" in "${genre}": Week 1-2: Pre-campaign (content teasers, pre-save link, email list activation), Week 3: Submission window (DSP editorial, playlist pitching, press), Week 4: Release week (drop day content, live sessions, fan activation), Week 5-6: Post-release (performance analysis, playlist follow-up, content repurposing). Include specific daily actions for release day.`
    );
  }

  async syncKnowledgeBaseWithProfile(): Promise<boolean> {
    return true;
  }


  proactiveStrategicPulse(): void {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      this.isMobile.set(true);
      this.logger.info('AiService: Mobile environment detected. Activating Proactive Strategic Pulse.');

      // Auto-trigger an audit if none exists or it is stale
      if (!this.executiveAudit()) {
        setTimeout(() => {
          this.performExecutiveAudit();
          this.logger.info('AiService: Proactive Executive Audit initiated.');
        }, 2000);
      }
    }
  }

  performExecutiveAudit(): void {
    this.isScanning.set(true);
    this.scanningProgress.set(0);
    this.currentProcessStep.set('Initializing');

    const steps = [
      { progress: 10, label: 'Booting Neural Core' },
      { progress: 20, label: 'Loading Intelligence Library' },
      { progress: 35, label: 'Scanning Profile' },
      { progress: 50, label: 'Analyzing Catalog' },
      { progress: 65, label: 'Analyzing Market Signals' },
      { progress: 80, label: 'Scoring Strategic Health' },
      { progress: 92, label: 'Generating Executive Audit' },
      { progress: 100, label: 'Complete' },
    ];

    let i = 0;
    const interval = setInterval(() => {
      const step = steps[i];
      if (!step) {
        clearInterval(interval);
        this.isScanning.set(false);
        this.sonicCohesion.set(Math.floor(75 + Math.random() * 20));
        this.criticalDeficits.set([
          'Low-mid buildup at 300Hz',
          'Vocal needs 2dB more air at 10kHz',
          'Kick-Bass phase alignment suboptimal'
        ]);
        this.executiveAudit.set({
          score: 68,
          timestamp: Date.now(),
          status: 'DEFICIT DETECTED',
          dimensions: {
            production: 72,
            marketing: 45,
            business: 82,
            momentum: 55
          }
        });
        return;
      }

      this.scanningProgress.set(step.progress);
      this.currentProcessStep.set(step.label);
      i++;

      if (step.progress >= 100) {
        clearInterval(interval);
        this.isScanning.set(false);
        this.sonicCohesion.set(Math.floor(75 + Math.random() * 20));
        this.criticalDeficits.set([
          'Low-mid buildup at 300Hz',
          'Vocal needs 2dB more air at 10kHz',
          'Kick-Bass phase alignment suboptimal'
        ]);
        this.executiveAudit.set({
          score: 68,
          timestamp: Date.now(),
          status: 'DEFICIT DETECTED',
          dimensions: {
            production: 72,
            marketing: 45,
            business: 82,
            momentum: 55
          }
        });
      }
    }, 250);
  }


  async generateStructure(genre: string) {
    this.logger.info('AiService: Generating song structure for genre', genre);
    const structure = [
      { id: 's1', label: 'Intro', startBar: 0, length: 4, color: '#10b981' },
      { id: 's2', label: 'Verse 1', startBar: 4, length: 8, color: '#3b82f6' },
      { id: 's3', label: 'Pre-Chorus', startBar: 12, length: 4, color: '#f59e0b' },
      { id: 's4', label: 'Chorus 1', startBar: 16, length: 8, color: '#8b5cf6' },
      { id: 's5', label: 'Verse 2', startBar: 24, length: 8, color: '#3b82f6' },
      { id: 's6', label: 'Chorus 2', startBar: 32, length: 8, color: '#8b5cf6' },
      { id: 's7', label: 'Bridge', startBar: 40, length: 8, color: '#ef4444' },
      { id: 's8', label: 'Chorus 3', startBar: 48, length: 8, color: '#8b5cf6' },
      { id: 's9', label: 'Outro', startBar: 56, length: 8, color: '#10b981' },
    ];
    this.musicManager.structure.set(structure);
    return 'Song structure generated for ' + genre;
  }

  async generateChords(genre: string) {
    this.logger.info('AiService: Generating chord progression for genre', genre);
    const chords = [
      { id: 'c1', name: 'Am', startStep: 0, length: 16 },
      { id: 'c2', name: 'F', startStep: 16, length: 16 },
      { id: 'c3', name: 'C', startStep: 32, length: 16 },
      { id: 'c4', name: 'G', startStep: 48, length: 16 },
    ];
    this.musicManager.chords.set(chords);
    return 'Chord progression generated for ' + genre;
  }

  generateChordProgression(input: {
    genre?: string;
    mood?: 'dark' | 'uplift' | 'neutral';
    key?: string;
    section?: 'intro' | 'verse' | 'hook' | 'bridge' | 'outro';
    variation?: number;
    humanize?: boolean;
  }): { id: string; name: string; startStep: number; length: number; midi: number[] }[] {
    const base = [
      { name: 'Am', midi: [57, 60, 64] },
      { name: 'F', midi: [53, 57, 60] },
      { name: 'C', midi: [48, 52, 55] },
      { name: 'G', midi: [55, 59, 62] },
    ];
    const variation = Math.max(0, Math.min(1, input.variation ?? 0.4));
    const moodOffset = input.mood === 'uplift' ? 1 : input.mood === 'dark' ? -1 : 0;
    return base.map((chord, idx) => ({
      id: `cp-${idx}`,
      name: chord.name,
      startStep: idx * 16,
      length: 16,
      midi: chord.midi.map((note) => note + moodOffset + (variation > 0.7 && idx % 2 === 0 ? 12 : 0)),
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
      velocity: 0.75 + (variation * 0.2),
    }));
    if (!input.humanize) return pattern;
    return pattern.map((note) => ({
      ...note,
      step: Math.max(0, note.step + (Math.random() > 0.5 ? 0.25 : -0.25)),
      velocity: Math.max(0.5, Math.min(1, note.velocity + (Math.random() - 0.5) * 0.15)),
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
      velocity: Math.max(0.3, Math.min(1, hit.velocity + (Math.random() - 0.5) * 0.1)),
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
        ? this.generateChordProgression({ section: input.section, variation, humanize: true })
        : undefined,
      bass: input.includeBass
        ? this.generateBassline({ section: input.section === 'hook' ? 'hook' : 'verse', variation, humanize: true })
        : undefined,
      drums: input.includeDrums
        ? this.generateDrumPattern({ section: input.section, variation, humanize: true, energy: 0.7 })
        : undefined,
    };
  }

  private async handleAutoMixCommand(): Promise<string> {
    this.neuralMixer.applyNeuralMix();
    return 'Neural Mix protocol initiated. All channel strips have been balanced according to heuristic production intelligence.';
  }

getUpgradeRecommendations(): UpgradeRecommendation[] {
    return [
      {
        id: 'upg-1',
        title: 'Room Calibration (Reference Curve)',
        type: 'Software',
        description: 'Calibrate monitoring to stop making translation mistakes.',
        cost: '$0-$99',
        url: '',
        impact: 'High',
      },
      {
        id: 'upg-2',
        title: 'Vocal Chain Preset Pack',
        type: 'Software',
        description: 'Standardize compression/EQ/de-ess across sessions.',
        cost: '$29-$149',
        url: '',
        impact: 'Medium',
      },
      {
        id: 'upg-3',
        title: 'Mix Translation Checklist',
        type: 'Service',
        description: 'A repeatable QC pass before every release.',
        cost: '$0',
        url: '',
        impact: 'High',
      },
      {
        id: 'upg-4',
        title: 'Stem Mastering Service',
        type: 'Service',
        description: 'Professional stem mastering for maximum loudness and clarity across all platforms.',
        cost: '$50-$200',
        url: '',
        impact: 'High',
      },
      {
        id: 'upg-5',
        title: 'DSP Promotion & Playlist Pitching',
        type: 'Service',
        description: 'Paid playlist pitching via Groover or SubmitHub to reach curated audiences.',
        cost: '$30-$150',
        url: '',
        impact: 'Medium',
      },
    ];
  }

  async getStrategicRecommendations(): Promise<StrategicRecommendationType[]> {
    const profile = this.userProfileService.profile();
    const catalog = profile?.catalog || [];
    const campaigns = profile?.marketingCampaigns || [];
    const recs: StrategicRecommendationType[] = [];

    if (catalog.length < 3) {
      recs.push({
        id: 'rec-1',
        action: 'Ship a 3-track micro-EP to test audience response and unlock DSP recommendation eligibility.',
        impact: 'High',
        difficulty: 'Medium',
        toolId: 'release-planner',
      });
    }

    if (campaigns.length === 0) {
      recs.push({
        id: 'rec-2',
        action: 'Launch a $50 Meta or TikTok Ads campaign targeting genre-aligned listeners in your top 3 markets.',
        impact: 'High',
        difficulty: 'Low',
        toolId: 'marketing',
      });
    }

    recs.push({
      id: 'rec-3',
      action: 'Register all catalog tracks with your PRO (BMI/ASCAP/SESAC) and assign ISRC codes via your distributor.',
      impact: 'Medium',
      difficulty: 'Low',
      toolId: 'knowledge-base',
    });

    recs.push({
      id: 'rec-4',
      action: 'Build or update your Electronic Press Kit (EPK) with bio, hi-res photos, streaming links, and booking contact.',
      impact: 'Medium',
      difficulty: 'Low',
      toolId: 'strategy',
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
        density > HIGH_DENSITY_THRESHOLD ? DENSE_TARGET_LUFS : DEFAULT_TARGET_LUFS,
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
    if (profile.primaryGenre === "Electronic") {
      insights.push({
        title: "Sonic Realignment",
        content: "Your electronic foundation requires a high-fidelity low-end calibration to compete in the current techno/house landscape."
      });
    }
    if (profile.brandVoices?.includes("Elite")) {
      insights.push({
        title: "Executive Presence",
        content: "An elite brand voice must be backed by a strictly curated visual catalog. Prune all legacy non-conforming assets."
      });
    }
    if (profile.strategicGoals?.includes("Sync Catalog Pumping")) {
      insights.push({
        title: "Sync Readiness",
        content: "Prioritize instrumental-only versions of your top 5 tracks to immediately double your licensing eligibility."
      });
    }
    if (insights.length === 0) {
      insights.push({
        title: "General Strategy",
        content: "Consistency in output is your current primary vector. Ship a new track every 21 days to maintain algorithmic momentum."
      });
    }
    return insights;
  }

  getDynamicChecklist(): StrategicTask[] {
    const profile = this.userProfileService.profile();
    const catalog = profile?.catalog || [];
    const campaigns = profile?.marketingCampaigns || [];
    const tasks: StrategicTask[] = [];

    tasks.push({
      id: 'task-1',
      label: 'Audit last release translation on 3 playback systems',
      completed: false,
      category: 'Production',
      impact: 'High',
      description: 'Car test, earbuds, and mono phone speaker. Fix the low-mid buildup at 300–500Hz.',
    });

    tasks.push({
      id: 'task-2',
      label: 'Update EPK and pin latest release',
      completed: false,
      category: 'Marketing',
      impact: 'Medium',
      description: 'Add high-res press photo, updated bio, and streaming links. Share EPK link with 5 blogs.',
    });

    tasks.push({
      id: 'task-3',
      label: 'Schedule 2 short-form clips for the next 7 days',
      completed: false,
      category: 'Social',
      impact: 'High',
      description: 'Create one hook reveal and one behind-the-scenes clip. Post 48 hours apart.',
    });

    if (catalog.length < 5) {
      tasks.push({
        id: 'task-4',
        label: `Build catalog to 5+ tracks (currently ${catalog.length})`,
        completed: false,
        category: 'Production',
        impact: 'High',
        description: 'DSP editorial and algorithmic playlists require a minimum catalog depth of 5 tracks.',
      });
    }

    if (campaigns.length === 0) {
      tasks.push({
        id: 'task-5',
        label: 'Launch first marketing campaign',
        completed: false,
        category: 'Marketing',
        impact: 'High',
        description: 'Start with a $50 paid campaign on Meta or TikTok targeting genre-aligned listeners.',
      });
    }

    tasks.push({
      id: 'task-6',
      label: 'Submit to 3 playlist curators via Groover or SubmitHub',
      completed: false,
      category: 'Promotion',
      impact: 'Medium',
      description: 'Target curators with 10k–100k followers for a 15–30% acceptance rate. Personalize each pitch.',
    });

    tasks.push({
      id: 'task-7',
      label: 'Register latest track with PRO and assign ISRC',
      completed: false,
      category: 'Business',
      impact: 'High',
      description: 'ASCAP/BMI/SESAC registration is required to collect performance royalties. Use DistroKid for ISRC.',
    });

    return tasks;
  }
}

export function provideAiService(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: AiService, useClass: AiService }]);
}
