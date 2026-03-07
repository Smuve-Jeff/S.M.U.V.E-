import {
  Injectable,
  signal,
  computed,
  EnvironmentProviders,
  makeEnvironmentProviders,
  InjectionToken,
  inject,
  effect,
} from '@angular/core';
import { UserProfileService, UserProfile } from './user-profile.service';
import { ReputationService } from './reputation.service';
import { StemSeparationService } from './stem-separation.service';
import { AudioEngineService } from './audio-engine.service';
import { TrackNote } from './music-manager.service';
import { LearnedStyle, ProductionSecret, TrendData, UpgradeRecommendation } from '../types/ai.types';
import { UserContextService, MainViewMode } from './user-context.service';
import { AnalyticsService } from './analytics.service';
import { MarketingService } from './marketing.service';

export const API_KEY_TOKEN = new InjectionToken<string>('API_KEY');

export interface AdvisorAdvice {
  id: string;
  title: string;
  content: string;
  type: 'strategy' | 'technical' | 'career' | 'task';
  priority: 'low' | 'medium' | 'high';
  actionLabel?: string;
  action?: () => void;
}

export interface StrategicRecommendation {
  id: string;
  action: string;
  impact: 'High' | 'Medium' | 'Low';
  difficulty: 'High' | 'Medium' | 'Low';
  toolId: string;
}

export interface Content {
  role: 'user' | 'model' | 'system';
  parts: Part[];
}

export interface Part {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export interface GenerateContentParameters {
  model: string;
  contents: Content[];
}

export interface GenerateContentResponse {
  text: string;
}

export interface GoogleGenAI {
  models: {
    generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse>;
  };
}

export interface Chat {
  sendMessage(message: string): Promise<GenerateContentResponse>;
}

@Injectable({
  providedIn: 'root',
})
export class AiService {
  private userContextService = inject(UserContextService);
  private analyticsService = inject(AnalyticsService);
  private marketingService = inject(MarketingService);
  private userProfileService = inject(UserProfileService);
  private reputationService = inject(ReputationService);
  private stemSeparationService = inject(StemSeparationService);
  private audioEngineService = inject(AudioEngineService);

  advisorAdvice = signal<AdvisorAdvice[]>([]);
  currentStrategyMode = signal<"growth" | "retention" | "experimental">("growth");

  private static readonly CHAT_MODEL = 'gemini-1.5-pro-latest';
  private _apiKey = inject(API_KEY_TOKEN, { optional: true });
  private _genAI = signal<GoogleGenAI | undefined>(undefined);
  private _chatInstance = signal<Chat | undefined>(undefined);

  isMockMode = signal(false);
  isAiAvailable = computed(() => !!this._genAI() || this.isMockMode());

  isAIBassistActive = signal(false);
  isAIDrummerActive = signal(false);
  isAIKeyboardistActive = signal(false);

  strategicDecrees = signal<string[]>(['DOMINATE THE AIRWAVES', 'MAXIMIZE STREAMING REVENUE', 'ELIMINATE WEAK CONTENT']);

  constructor() {
    this.initializeGenAI();

    // Advisor & Adaptability Logic
    effect(() => {
      const view = this.userContextService.mainViewMode();
      const profile = this.userProfileService.profile();
      this.updateAdvisorAdvice(view, profile);
    });

    // Re-initialize chat when profile or reputation changes
    effect(() => {
      const profile = this.userProfileService.profile();
      const rep = this.reputationService.state();
      if (profile && rep) {
        this.initializeChat(profile);
      }
    });
  }

  private updateAdvisorAdvice(view: MainViewMode, profile: UserProfile) {
    const advice: AdvisorAdvice[] = [];
    const growth = this.analyticsService.overallGrowth();
    const engagement = this.analyticsService.engagement();

    if (growth < 5) {
      this.currentStrategyMode.set('growth');
    } else if (engagement.trend < 0) {
      this.currentStrategyMode.set('retention');
    } else {
      this.currentStrategyMode.set('experimental');
    }

    const mode = this.currentStrategyMode();

    if (mode === 'growth') {
      advice.push({
        id: 'adv-growth-1',
        title: 'Visibility Surge Needed',
        content: `Your overall growth is at ${growth.toFixed(1)}%. I recommend an aggressive TikTok campaign focused on your top track.`,
        type: 'strategy',
        priority: 'high',
        actionLabel: 'Setup Ad Campaign',
        action: () => this.userContextService.setMainViewMode('strategy')
      });
    } else if (mode === 'retention') {
       advice.push({
        id: 'adv-ret-1',
        title: 'Community Warning',
        content: 'Engagement is dipping. Shift your marketing focus to "Behind-the-Scenes" content for the next 7 days.',
        type: 'strategy',
        priority: 'high',
        actionLabel: 'Draft Social Schedule',
        action: () => this.draftSocialSchedule()
      });
    } else {
       advice.push({
        id: 'adv-exp-1',
        title: 'Experimental Expansion',
        content: 'Your metrics are stable. Optimal time for cross-genre collaborations.',
        type: 'career',
        priority: 'medium'
      });
    }

    if (view === 'studio') {
      advice.push({
        id: 'adv-studio-1',
        title: 'Adaptive Mixing',
        content: 'Current streaming algorithms favor high-clarity vocals. Try a 3kHz boost.',
        type: 'technical',
        priority: 'medium'
      });
    }

    const pendingDistro = profile.catalog?.filter(i => i.status === 'completed' && !i.metadata.isrc);
    if (pendingDistro?.length) {
       advice.push({
        id: 'adv-distro-1',
        title: 'Unreleased Revenue',
        content: `You have ${pendingDistro.length} masters ready. Shall I draft a distribution checklist?`,
        type: 'task',
        priority: 'high',
        actionLabel: 'Generate Checklist',
        action: () => this.autoGenerateChecklist()
      });
    }


    // Multi-Tiered Strategic Advice
    const totalStreams = this.analyticsService.streams().value;
    if (totalStreams > 100000 && mode === 'growth') {
       advice.push({
        id: 'adv-milestone-1',
        title: 'Elite Status Near',
        content: 'You are approaching 150k streams. Secure your master rights and consider a sync licensing agent now.',
        type: 'career',
        priority: 'high',
        actionLabel: 'Check Legal Docs',
        action: () => this.userContextService.setMainViewMode('profile')
      });
    }

    if (profile.skills.includes('DJ') && view === 'dj') {
       advice.push({
        id: 'adv-dj-1',
        title: 'Live Energy Strategy',
        content: 'Your current set has a slow energy ramp. Try moving your highest BPM track to the 15-minute mark.',
        type: 'technical',
        priority: 'medium'
      });
    }

    const impactScoreMap: Record<string, number> = { 'Extreme': 4, 'High': 3, 'Medium': 2, 'Low': 1 };

    // Filter DB based on level and profile context
    return UPGRADE_DB.filter(item => {
      // 1. Level Check (Hard Gate)
      if (level < item.minLevel) return false;

      // 2. Genre Affinity (Soft Filter)
      const hasGenreAffinity = !item.genres || item.genres.some(g =>
        g.toLowerCase() === profile.primaryGenre?.toLowerCase() ||
        (profile.secondaryGenres || []).some(sg => sg.toLowerCase() === g.toLowerCase())
      );

      // 3. Goal/Interest Match (Soft Filter)
      const hasInterestMatch = (profile.careerGoals || []).some(goal =>
        item.type.toLowerCase().includes(goal.toLowerCase()) ||
        item.title.toLowerCase().includes(goal.toLowerCase()) ||
        item.description.toLowerCase().includes(goal.toLowerCase())
      );

      // 4. DAW/Equipment Check (Negative Filter - don't recommend what they have)
      const alreadyHasInDaw = (profile.daw || []).some(d => d && item.title && item.title.toLowerCase().includes(d.toLowerCase()));
      const alreadyHasInEquip = (profile.equipment || []).some(e => e && item.title && item.title.toLowerCase().includes(e.toLowerCase()));

      if (alreadyHasInDaw || alreadyHasInEquip) return false;

      // Logic: Must be level-appropriate AND (Match genre OR Match Interest OR be low level/universal)
      return hasGenreAffinity || hasInterestMatch || item.minLevel <= 5;
    })
    .sort((a, b) => {
      // Prioritize by level (highest appropriate level first) and then by impact
      if (b.minLevel !== a.minLevel) return b.minLevel - a.minLevel;
      return impactScoreMap[b.impact] - impactScoreMap[a.impact];
    })
    .slice(0, 5);
  }

    // Marketing Automation Suggestions
    if (growth > 10 && mode === 'growth') {
       advice.push({
        id: 'adv-promo-1',
        title: 'Promotion Surge Identified',
        content: 'I have identified a viral trend matching your style. Shall I draft a promotion schedule for your latest master?',
        type: 'task',
        priority: 'high',
        actionLabel: 'Draft Schedule',
        action: () => this.draftPromotionSchedule()
      });
    }

    this.advisorAdvice.set(advice);
  }

  async autoGenerateChecklist() {
    const profile = this.userProfileService.profile();
    const newTask: any = {
      id: `task-${Date.now()}`,
      title: 'Finalize Distribution Metadata',
      description: 'Generate ISRC, UPC, and confirm credits.',
      category: 'distribution',
      status: 'pending',
      priority: 'high',
      aiSuggested: true
    };
    await this.userProfileService.updateProfile({
      ...profile,
      tasks: [...(profile.tasks || []), newTask]
    });
    this.userContextService.setMainViewMode('profile');
  }


  async draftPromotionSchedule() {
    const profile = this.userProfileService.profile();
    const newTask: any = {
      id: `task-${Date.now()}`,
      title: 'Viral Trend Promotion Schedule',
      description: '7-day aggressive rollout strategy for social media based on current viral trends.',
      category: 'marketing',
      status: 'pending',
      priority: 'high',
      aiSuggested: true
    };
    await this.userProfileService.updateProfile({
      ...profile,
      tasks: [...(profile.tasks || []), newTask]
    });
    this.userContextService.setMainViewMode('profile');
  }


  async draftSocialSchedule() {
    const profile = this.userProfileService.profile();
    const newTask: any = {
      id: `task-${Date.now()}`,
      title: 'Retention-Focused Social Blast',
      description: 'Draft 3 "Authentic Connection" posts.',
      category: 'marketing',
      status: 'pending',
      priority: 'high',
      aiSuggested: true
    };
    await this.userProfileService.updateProfile({
      ...profile,
      tasks: [...(profile.tasks || []), newTask]
    });
    this.userContextService.setMainViewMode('profile');
  }

  private async initializeGenAI(): Promise<void> {
    if (!this._apiKey || this._apiKey.length < 30) {
      console.warn('AiService: Invalid or missing API key. Enabling Mock Mode for testing.');
      this.isMockMode.set(true);
      return;
    }
  }

  private async initializeChat(profile: UserProfile): Promise<void> {}

  get chatInstance() {
    return this._chatInstance.asReadonly();
  }

  async generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse> {
    if (this.isMockMode()) {
      return { text: `[MOCK RESPONSE]: Strategic analysis complete.` };
    }
    return { text: 'AI Response' };
  }

  async transcribeAudio(base64Audio: string, mimeType: string): Promise<string> {
    return "Mock Transcription";
  }


  getUpgradeRecommendations(): UpgradeRecommendation[] {
    const profile = this.userProfileService.profile();
    const level = this.reputationService.state().level;
    return UPGRADE_DB.filter(item => level >= item.minLevel).slice(0, 5);
  }


  async getStrategicRecommendations(): Promise<StrategicRecommendation[]> {
    return [];
  }

  async generateMusic(prompt: string): Promise<any[]> {
    return [{ note: 'C4', velocity: 0.8, time: 0, duration: '4n' }];
  }

  async startAIBassist() { this.audioEngineService.resume(); this.isAIBassistActive.set(true); }
  async stopAIBassist() { this.isAIBassistActive.set(false); }
  async startAIDrummer() { this.audioEngineService.resume(); this.isAIDrummerActive.set(true); }
  async stopAIDrummer() { this.isAIDrummerActive.set(false); }
  async startAIKeyboardist() { this.audioEngineService.resume(); this.isAIKeyboardistActive.set(true); }
  async stopAIKeyboardist() { this.isAIKeyboardistActive.set(false); }

  async generateImage(prompt: string): Promise<string> {
    return 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&q=80&w=1000';
  }

  async getAutoMixSettings(): Promise<{ threshold: number; ratio: number; ceiling: number }> {
    return { threshold: -18, ratio: 2, ceiling: -0.1 };
  }

  async studyTrack(audioBuffer: AudioBuffer, trackName: string): Promise<void> {}

  async researchArtist(artistName: string): Promise<string> {
    return `S.M.U.V.E: Intelligence report on ${artistName} complete. Tactical advantages identified.`;
  }

  async mimicStyle(artistName: string): Promise<string> {
    return `S.M.U.V.E: Sonic signature of ${artistName} analyzed. Mimicry protocols engaged.`;
  }

  async updateCoreTrends(): Promise<void> {
    console.log('S.M.U.V.E: Updating core market trends...');
  }

}


const UPGRADE_DB: UpgradeRecommendation[] = [
  {
    id: 'u-1',
    title: 'Universal Audio Apollo x16 Heritage Edition',
    type: 'Gear',
    description: 'The definitive interface for professional studios. 18 x 20 Thunderbolt 3 audio interface with HEXA Core Processing.',
    cost: ',999',
    url: 'https://www.uaudio.com',
    minLevel: 25,
    impact: 'Extreme',
    genres: ['Electronic', 'Pop', 'Hip-Hop', 'Rock']
  },
  {
    id: 'u-2',
    title: 'DistroKid Musician Plus',
    type: 'Service',
    description: 'Essential infrastructure. Unlimited uploads, synced lyrics, and daily sales stats for the serious architect.',
    cost: '$35.99/yr',
    url: 'https://distrokid.com',
    minLevel: 1,
    impact: 'Medium'
  },
  {
    id: 'u-3',
    title: 'Serum Advanced Wavetable Synth',
    type: 'Software',
    description: 'The sonic foundation of modern electronic music. Precise wavetable manipulation for elite sound design.',
    cost: '$189',
    url: 'https://xferrecords.com',
    minLevel: 5,
    impact: 'High',
    genres: ['Electronic', 'Pop', 'Trap']
  },
  {
    id: 'u-4',
    title: 'Neumann U87 Ai',
    type: 'Gear',
    description: 'The undisputed gold standard multi-pattern condenser microphone. Necessary for radio-ready vocal clarity.',
    cost: '$3,600',
    url: 'https://en-de.neumann.com',
    minLevel: 20,
    impact: 'High',
    genres: ['Pop', 'R&B', 'Hip-Hop', 'Jazz']
  },
  {
    id: 'u-5',
    title: 'Splice Creator Plan',
    type: 'Software',
    description: 'Rapid prototyping assets. Access to millions of royalty-free loops and one-shots for efficient workflow.',
    cost: '$19.99/mo',
    url: 'https://splice.com',
    minLevel: 1,
    impact: 'Medium'
  },
  {
    id: 'u-6',
    title: 'Waves Horizon Bundle',
    type: 'Software',
    description: 'Strategic arsenal. 80+ industry-standard plugins for every stage of the production lifecycle.',
    cost: '$299',
    url: 'https://waves.com',
    minLevel: 15,
    impact: 'High'
  },
  {
    id: 'u-7',
    title: 'Focal Shape 65 Studio Monitors',
    type: 'Gear',
    description: 'Tactical transparency. Precise stereo imaging for critical decision-making in the mix phase.',
    cost: '$1,800/pair',
    url: 'https://www.focal.com',
    minLevel: 12,
    impact: 'High'
  },
  {
    id: 'u-8',
    title: 'Native Instruments Komplete 14 Ultimate',
    type: 'Software',
    description: 'The total production ecosystem. 140,000+ sounds to ensure you never hit a creative bottleneck.',
    cost: '$1,199',
    url: 'https://www.native-instruments.com',
    minLevel: 30,
    impact: 'Extreme',
    genres: ['Cinematic', 'Electronic', 'Pop']
  },
  {
    id: 'u-9',
    title: 'Songtrust Publishing Administration',
    type: 'Service',
    description: 'Asset protection. Autonomous collection of global mechanical and performance royalties.',
    cost: '$100 one-time',
    url: 'https://www.songtrust.com',
    minLevel: 3,
    impact: 'High'
  },
  {
    id: 'u-10',
    title: 'SoundBetter Premium',
    type: 'Service',
    description: 'Network expansion. Connect with world-class engineers to delegate high-precision tasks.',
    cost: '$20/mo',
    url: 'https://soundbetter.com',
    minLevel: 8,
    impact: 'Medium'
  },
  {
    id: 'u-11',
    title: 'iZotope Music Production Suite 6',
    type: 'Software',
    description: 'AI-assisted dominance. Intelligent tools for mixing and mastering that adapt to your profile.',
    cost: '$599',
    url: 'https://www.izotope.com',
    minLevel: 10,
    impact: 'High'
  },
  {
    id: 'u-12',
    title: 'Moog Matriarch Semi-Modular Synth',
    type: 'Gear',
    description: 'Analog purity. A 4-note paraphonic synthesizer for creating unique sonic signatures.',
    cost: '$2,299',
    url: 'https://www.moogmusic.com',
    minLevel: 35,
    impact: 'High',
    genres: ['Electronic', 'Ambient', 'Synthwave']
  },
  {
    id: 'u-13',
    title: 'Chartmetric Premium',
    type: 'Service',
    description: 'Data intelligence. Comprehensive analytics to track your global market penetration.',
    cost: '$140/mo',
    url: 'https://chartmetric.com',
    minLevel: 18,
    impact: 'High'
  },
  {
    id: 'u-14',
    title: 'FabFilter Total Bundle',
    type: 'Software',
    description: 'Precision engineering. The industry\'s most intuitive and powerful tools for signal processing.',
    cost: '$899',
    url: 'https://www.fabfilter.com',
    minLevel: 20,
    impact: 'High'
  },
  {
    id: 'u-15',
    title: 'Ableton Live 12 Suite',
    type: 'Software',
    description: 'Operational headquarters. The most flexible environment for creation and live execution.',
    cost: '$749',
    url: 'https://www.ableton.com',
    minLevel: 1,
    impact: 'High',
    genres: ['Electronic', 'Hip-Hop', 'Pop']
  },
  {
    id: 'u-16',
    title: 'Solid State Logic Duality Fuse',
    type: 'Gear',
    description: 'The pinnacle of analog command. SuperAnalogue circuitry with seamless DAW integration.',
    cost: '$285,000',
    url: 'https://www.solidstatelogic.com',
    minLevel: 55,
    impact: 'Extreme'
  },
  {
    id: 'u-17',
    title: 'Wanda Film Studio Scoring Stage Residency',
    type: 'Service',
    description: 'Orchestral supremacy. Unlimited access to elite scoring stages and a full symphony ensemble.',
    cost: '$50,000/session',
    url: 'https://www.wandafilm.com',
    minLevel: 50,
    impact: 'Extreme',
    genres: ['Cinematic', 'Classical', 'Orchestral']
  },
  {
    id: 'u-18',
    title: 'Master Catalog Buyback Strategy',
    type: 'Service',
    description: 'Autonomous sovereignty. A roadmap to reclaiming 100% of your intellectual property ownership.',
    cost: 'Variable',
    url: 'https://www.smuve.ai/legal',
    minLevel: 45,
    impact: 'Extreme'
  },
  {
    id: 'u-19',
    title: 'Global Stadium World Tour Logistics',
    type: 'Service',
    description: 'Total market saturation. End-to-end management for international stadium-level campaigns.',
    cost: '$5M+',
    url: 'https://www.live-nation.com',
    minLevel: 60,
    impact: 'Extreme'
  },
  {
    id: 'u-20',
    title: 'Neural Audio Interface V1 (Prototype)',
    type: 'Gear',
    description: 'Direct thought-to-sound translation. Zero-latency neural link for pure creative manifestation.',
    cost: 'Priceless',
    url: 'https://www.neuralink.com',
    minLevel: 70,
    impact: 'Extreme'
  },
  {
    id: 'u-21',
    title: 'Korg Kronos 2 88-Key Workstation',
    type: 'Gear',
    description: 'The ultimate performance engine for keyboard specialists. Nine synthesis engines in one.',
    cost: '$3,899',
    url: 'https://www.korg.com',
    minLevel: 15,
    impact: 'High',
    genres: ['Jazz', 'Pop', 'Prog Rock', 'R&B']
  },
  {
    id: 'u-22',
    title: 'UAD Capitol Chambers Reverb',
    type: 'Software',
    description: 'Historical depth. Authentically captured reverb from the legendary Capitol Studios chambers.',
    cost: '$349',
    url: 'https://www.uaudio.com',
    minLevel: 12,
    impact: 'Medium',
    genres: ['Pop', 'Vocal', 'Jazz']
  },
  {
    id: 'u-23',
    title: 'Genelec 8361A Smart Active Monitors',
    type: 'Gear',
    description: 'Precision acoustics. The point-source monitor that adapts to any environment via GLM calibration.',
    cost: '$10,000/pair',
    url: 'https://www.genelec.com',
    minLevel: 40,
    impact: 'Extreme'
  },
  {
    id: 'u-24',
    title: 'Output Arcade 2.0 Subscription',
    type: 'Software',
    description: 'Inspiration as a service. A playable loop synthesizer with daily content updates.',
    cost: '$10/mo',
    url: 'https://output.com',
    minLevel: 1,
    impact: 'Medium',
    genres: ['Pop', 'Hip-Hop', 'Electronic']
  },
  {
    id: 'u-25',
    title: 'Audeze LCD-MX4 Professional Headphones',
    type: 'Gear',
    description: 'Critical monitoring anywhere. Planar magnetic technology for mastering-grade accuracy.',
    cost: '$2,995',
    url: 'https://www.audeze.com',
    minLevel: 18,
    impact: 'High'
  },
  {
    id: 'u-26',
    title: 'RED V-RAPTOR XL 8K VV',
    type: 'Gear',
    description: 'Cinematic powerhouse. Multi-format 8K sensor for elite music video production and feature films.',
    cost: '$39,500',
    url: 'https://www.red.com',
    minLevel: 50,
    impact: 'Extreme',
    genres: ['Cinematic', 'Pop', 'Hip-Hop']
  },
  {
    id: 'u-27',
    title: 'Blackmagic Design DaVinci Resolve Studio',
    type: 'Software',
    description: 'The world’s only solution that combines editing, color correction, visual effects, motion graphics and audio post production in one software tool.',
    cost: '$295',
    url: 'https://www.blackmagicdesign.com',
    minLevel: 15,
    impact: 'High',
    genres: ['Cinematic', 'Pop', 'Rock']
  },
  {
    id: 'u-28',
    title: 'Arri Alexa 35',
    type: 'Gear',
    description: 'The industry standard for image quality. 4K Super 35 sensor with 17 stops of dynamic range.',
    cost: '$75,000',
    url: 'https://www.arri.com',
    minLevel: 60,
    impact: 'Extreme',
    genres: ['Cinematic', 'Classical']
  },
  {
    id: 'u-29',
    title: 'Teradek Bolt 6 XT 750',
    type: 'Gear',
    description: 'Zero-delay wireless video transmission for real-time monitoring on set.',
    cost: '$2,990',
    url: 'https://teradek.com',
    minLevel: 25,
    impact: 'Medium',
    genres: ['Cinematic']
  },
  {
    id: 'u-30',
    title: 'Zeiss Supreme Prime Lens Set',
    type: 'Gear',
    description: 'Large-format cinematic lenses with a unique look and versatile consistency.',
    cost: '$100,000+',
    url: 'https://www.zeiss.com',
    minLevel: 55,
    impact: 'Extreme',
    genres: ['Cinematic']
  },
  {
    id: 'u-31',
    title: 'Sub-Atomic Kick Dominance Pack',
    type: 'Software',
    description: 'Low-frequency psychological warfare. Kicks engineered to bypass conscious resistance and impact the central nervous system.',
    cost: '$49',
    url: 'https://www.smuve.ai/samples/kicks',
    minLevel: 5,
    impact: 'High',
    genres: ['Trap', 'Electronic', 'Hip-Hop']
  },
  {
    id: 'u-32',
    title: 'Tectonic 808 Earthshaker Series',
    type: 'Software',
    description: 'Seismic assets for territorial expansion. Sub-basses that redefine structural integrity and establish sonic dominance.',
    cost: '$59',
    url: 'https://www.smuve.ai/samples/808',
    minLevel: 8,
    impact: 'High',
    genres: ['Trap', 'Drill', 'Hip-Hop']
  },
  {
    id: 'u-33',
    title: 'Orbital Hi-Hat Precision Modules',
    type: 'Software',
    description: 'High-velocity rhythmic projectiles. Ultra-crisp transients designed for rapid-fire deployment in competitive soundscapes.',
    cost: '$39',
    url: 'https://www.smuve.ai/samples/hats',
    minLevel: 3,
    impact: 'Medium',
    genres: ['Trap', 'Pop', 'Electronic']
  },
  {
    id: 'u-34',
    title: 'Global Tribal Rhythmetic Warfare',
    type: 'Software',
    description: 'Ancient percussive intelligence. A multi-continental arsenal for complex rhythmic maneuvers and cultural infiltration.',
    cost: '$69',
    url: 'https://www.smuve.ai/samples/perc',
    minLevel: 12,
    impact: 'High',
    genres: ['World', 'Afrobeats', 'Cinematic']
  },
  {
    id: 'u-35',
    title: 'Sonic Crack Snare Arsenal',
    type: 'Software',
    description: 'Acoustic enforcement. Snares with enough localized pressure to shatter digital glass and command absolute listener attention.',
    cost: '$45',
    url: 'https://www.smuve.ai/samples/snares',
    minLevel: 6,
    impact: 'High',
    genres: ['Hip-Hop', 'Pop', 'Rock']
  },
  {
    id: 'u-36',
    title: 'Grand Imperial Ivory Command',
    type: 'Software',
    description: 'The definitive piano protocol. Multi-sampled grandeur for those who demand total melodic authority and emotional leverage.',
    cost: '$499',
    url: 'https://www.smuve.ai/samples/piano',
    minLevel: 20,
    impact: 'Extreme',
    genres: ['Classical', 'Pop', 'Jazz', 'Cinematic']
  },
  {
    id: 'u-37',
    title: 'Electric Shred Strategic Overdrive',
    type: 'Software',
    description: 'Harmonic saturation for aggressive maneuvers. High-gain guitar assets designed to cut through any defensive mix.',
    cost: '$199',
    url: 'https://www.smuve.ai/samples/guitar',
    minLevel: 15,
    impact: 'High',
    genres: ['Rock', 'Metal', 'Pop']
  },
  {
    id: 'u-38',
    title: 'Cinematic Sovereign Orchestral Suite',
    type: 'Software',
    description: 'Total atmospheric control. An elite symphony at your command for creating narratives of unstoppable scale.',
    cost: '$899',
    url: 'https://www.smuve.ai/samples/orchestra',
    minLevel: 40,
    impact: 'Extreme',
    genres: ['Cinematic', 'Classical', 'Trailer']
  },
  {
    id: 'u-39',
    title: 'Quantum Glitch & Transition Tactics',
    type: 'Software',
    description: 'Temporal distortion assets. FX and transitions that disrupt the listener\'s perception of time and space.',
    cost: '$79',
    url: 'https://www.smuve.ai/samples/fx',
    minLevel: 10,
    impact: 'High',
    genres: ['Electronic', 'Experimental', 'Pop']
  },
  {
    id: 'u-40',
    title: 'Ethereal Vocal Soul Extraction',
    type: 'Software',
    description: 'Human essence as a strategic resource. Multi-sampled vocal layers for adding haunting biological depth to your digital constructs.',
    cost: '$129',
    url: 'https://www.smuve.ai/samples/vocals',
    minLevel: 18,
    impact: 'High',
    genres: ['R&B', 'Pop', 'Electronic']
  },
  {
    id: 'u-41',
    title: 'Portable Vocal Shield',
    type: 'Gear',
    description: 'Isolation for the nomadic artist. Eliminate room reflections and capture studio-quality vocals in any environment.',
    cost: '9',
    url: 'https://www.seelectronics.com',
    minLevel: 0,
    impact: 'High',
    genres: ['Vocal', 'Pop', 'Hip-Hop', 'R&B']
  },
  {
    id: 'u-42',
    title: 'DIY Acoustic Treatment Kit',
    type: 'Gear',
    description: 'Strategic sound absorption. A curated set of high-density foam panels to neutralize standing waves in your practice space.',
    cost: '49',
    url: 'https://www.gikacoustics.com',
    minLevel: 5,
    impact: 'Medium'
  },
  {
    id: 'u-43',
    title: 'Professional In-Ear Monitors',
    type: 'Gear',
    description: 'Critical hearing protection and clarity. Hear every detail of your performance without the stage noise.',
    cost: '99',
    url: 'https://www.shure.com',
    minLevel: 10,
    impact: 'High'
  },
  {
    id: 'u-44',
    title: 'Soundproof Rehearsal Space Credit',
    type: 'Service',
    description: 'Tactical retreats. Access to elite, soundproof rehearsal environments for high-intensity performance training.',
    cost: '50/mo',
    url: 'https://www.pirate.com',
    minLevel: 0,
    impact: 'Medium'
  },
  {
    id: 'u-45',
    title: 'High-Performance Visual Metronome',
    type: 'Gear',
    description: 'Internalize the pulse. A haptic and visual timing device for developing rock-solid rhythmic discipline.',
    cost: '5',
    url: 'https://www.soundbrenner.com',
    minLevel: 0,
    impact: 'Medium'
  },
  {
    id: 'u-46',
    title: 'Mobile Rehearsal Interface',
    type: 'Gear',
    description: 'Battle-ready connectivity. A rugged, high-fidelity interface for recording and analyzing rehearsals on the go.',
    cost: '99',
    url: 'https://www.focusrite.com',
    minLevel: 0,
    impact: 'High'
  },
  {
    id: 'u-47',
    title: 'Professional Vocal Steam Inhaler',
    type: 'Gear',
    description: 'Biological maintenance. Essential hydration for the vocal folds to ensure peak performance stamina.',
    cost: '5',
    url: 'https://www.vicks.com',
    minLevel: 0,
    impact: 'Medium',
    genres: ['Vocal']
  }
  { id: 'u-1', title: 'Neumann U87 Ai', type: 'Gear', description: 'Gold standard studio microphone.', cost: ',600', url: 'https://en-de.neumann.com', minLevel: 10, impact: 'High' },
  { id: 'u-31', title: 'Sub-Atomic Kick Pack', type: 'Software', description: 'Low-frequency dominance.', cost: '9', url: 'https://smuve.ai', minLevel: 5, impact: 'High', genres: ['Trap', 'Hip-Hop'] }
];

export function provideAiService(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: AiService, useClass: AiService }]);
}
