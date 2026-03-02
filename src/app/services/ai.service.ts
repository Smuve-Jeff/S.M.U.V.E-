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
import { firstValueFrom } from 'rxjs';

export const API_KEY_TOKEN = new InjectionToken<string>('API_KEY');

export interface StrategicRecommendation {
  id: string;
  action: string;
  impact: 'High' | 'Medium' | 'Low';
  difficulty: 'High' | 'Medium' | 'Low';
  toolId: string;
}

// --- START: INTERNAL TYPE DECLARATIONS FOR @google/genai ---

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
  fileData?: {
    fileUri: string;
    mimeType: string;
  };
  functionCall?: {
    name: string;
    args: { [key: string]: unknown };
  };
  functionResponse?: {
    name: string;
    response: { [key: string]: unknown };
  };
}

export interface GenerateContentParameters {
  model: string;
  contents: Content[];
  config?: ChatConfig;
}

export interface GenerateContentResponse {
  text: string;
  functionCalls?: FunctionCall[];
  toolCalls?: any[];
}

export interface GoogleGenAI {
  apiKey: string;
  models: {
    generateContent(
      params: GenerateContentParameters
    ): Promise<GenerateContentResponse>;
    generateContentStream(
      params: GenerateContentParameters
    ): Promise<AsyncIterable<GenerateContentResult>>;
    generateImages(
      params: GenerateImagesParameters
    ): Promise<GenerateImagesResponse>;
  };
  chats?: {
    create(config: {
      model: string;
      systemInstruction?: string;
      config?: ChatConfig;
    }): Chat;
  };
}

export interface ChatConfig {
  systemInstruction?: string;
  tools?: Tool[];
  topK?: number;
  topP?: number;
  temperature?: number;
  thinkingConfig?: {
    thinkingBudget: number;
  };
}

export interface Tool {
  function_declarations?: FunctionDeclaration[];
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: FunctionParameters;
}

export interface FunctionParameters {
  type: 'OBJECT';
  properties: { [key: string]: FunctionProperty };
  required?: string[];
}

export interface FunctionProperty {
  type: 'STRING' | 'NUMBER' | 'BOOLEAN';
  description: string;
  enum?: string[];
}

export interface Chat {
  sendMessage(message: string, config?: GenerateContentParameters): Promise<GenerateContentResponse>;
  sendMessageStream(message: string): Promise<AsyncIterable<GenerateContentResult>>;
}

export interface FunctionCall {
  name: string;
  args: { [key: string]: unknown };
}

export interface GenerateContentResult {
  response: GenerateContentResponse;
}

export interface GenerateImagesParameters {
  model: string;
  prompt: string;
  number?: number;
  aspectRatio?: string;
}

export interface GenerateImagesResponse {
  images: { url: string }[];
}

// --- END: INTERNAL TYPE DECLARATIONS ---

@Injectable({
  providedIn: 'root',
})
export class AiService {
  private static readonly CHAT_MODEL = 'gemini-1.5-pro-latest';
  private _apiKey = inject(API_KEY_TOKEN, { optional: true });
  private _genAI = signal<GoogleGenAI | undefined>(undefined);
  private _chatInstance = signal<Chat | undefined>(undefined);

  private userProfileService = inject(UserProfileService);
  private reputationService = inject(ReputationService);
  private stemSeparationService = inject(StemSeparationService);
  private audioEngineService = inject(AudioEngineService);

  isMockMode = signal(false);
  isAiAvailable = computed(() => !!this._genAI() || this.isMockMode());

  // Shared state for AI Jam Session members
  isAIBassistActive = signal(false);
  isAIDrummerActive = signal(false);
  isAIKeyboardistActive = signal(false);

  strategicDecrees = signal<string[]>(['DOMINATE THE AIRWAVES', 'MAXIMIZE STREAMING REVENUE', 'ELIMINATE WEAK CONTENT']);

  constructor() {
    this.initializeGenAI();

    // Re-initialize chat when profile or reputation changes
    effect(() => {
      const profile = this.userProfileService.profile();
      const rep = this.reputationService.state();
      if (profile && rep) {
        this.initializeChat(profile);
      }
    });
  }

  get chatInstance() {
    return this._chatInstance.asReadonly();
  }

  async generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse> {
    if (this.isMockMode()) {
      return { text: `[MOCK RESPONSE]: Strategic analysis complete. For "${params.contents[0].parts[0].text}", S.M.U.V.E recommends immediate action to secure your master rights and optimize your metadata.` };
    }

    const genAI = this._genAI();
    if (!genAI) {
      throw new Error('AiService: GoogleGenerativeAI not initialized.');
    }

    try {
      return await genAI.models.generateContent(params);
    } catch (error) {
      console.error('AiService: Error generating content:', error);
      throw error;
    }
  }

  async transcribeAudio(base64Audio: string, mimeType: string): Promise<string> {
    if (this.isMockMode()) {
      return "S.M.U.V.E analyzed the audio. It contains a high-energy vocal with significant low-end presence. Strategic recommendation: apply a 100Hz high-pass filter and increase parallel compression.";
    }

    const genAI = this._genAI();
    if (!genAI) throw new Error('AiService: Client not initialized.');

    const prompt = 'Transcribe this audio and provide a strategic critique of the performance quality.';
    const contents: Content[] = [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64Audio } },
        ],
      },
    ];

    const result = await this.generateContent({
      model: AiService.CHAT_MODEL,
      contents,
    });

    return result.text;
  }

  getUpgradeRecommendations(): UpgradeRecommendation[] {
    const profile = this.userProfileService.profile();
    const level = this.reputationService.state().level;

    // Filter DB based on level and profile interests
    return UPGRADE_DB.filter(item => {
      const levelMatch = level >= item.minLevel;
      const interestMatch = profile.careerGoals.some(goal =>
        item.type.toLowerCase().includes(goal.toLowerCase()) ||
        item.title.toLowerCase().includes(goal.toLowerCase())
      );
      return levelMatch && (interestMatch || item.minLevel <= 5);
    }).slice(0, 5);
  }

  async getStrategicRecommendations(): Promise<StrategicRecommendation[]> {
    return [
      { id: 'sr-1', action: 'Optimize Spotify Metadata', impact: 'High', difficulty: 'Low', toolId: 'strategy' },
      { id: 'sr-2', action: 'Target TikTok Micro-influencers', impact: 'Medium', difficulty: 'Medium', toolId: 'marketing' },
      { id: 'sr-3', action: 'Register for Neighboring Rights', impact: 'High', difficulty: 'High', toolId: 'finance' },
      { id: 'sr-4', action: 'Pitch to Editorial Playlists', impact: 'High', difficulty: 'Medium', toolId: 'promotion' },
      { id: 'sr-5', action: 'Launch Direct-to-Fan Vinyl Campaign', impact: 'Medium', difficulty: 'High', toolId: 'merch' },
      { id: 'sr-6', action: 'Collaborate with Cross-Genre Producer', impact: 'High', difficulty: 'Medium', toolId: 'collaboration' },
      { id: 'sr-7', action: 'Set up Artist-Owned Label', impact: 'High', difficulty: 'High', toolId: 'business' },
      { id: 'sr-8', action: 'Execute 48-Hour Remix Challenge', impact: 'Medium', difficulty: 'Low', toolId: 'engagement' },
      { id: 'sr-9', action: 'Optimize YouTube SEO for Music Videos', impact: 'High', difficulty: 'Low', toolId: 'visibility' },
      { id: 'sr-10', action: 'Implement Tiered Fan Membership', impact: 'Medium', difficulty: 'Medium', toolId: 'monetization' },
      { id: 'sr-11', action: 'Secure Sync Placement in Indie Games', impact: 'High', difficulty: 'High', toolId: 'licensing' },
      { id: 'sr-12', action: 'Release Monthly Acoustic Stems', impact: 'Low', difficulty: 'Low', toolId: 'content' }
    ];
  }

  async generateMusic(prompt: string): Promise<any[]> {
    console.log('S.M.U.V.E: Generating music notes for prompt:', prompt);
    return [{ note: 'C4', velocity: 0.8, time: 0, duration: '4n' }];
  }

  async startAIBassist() { this.audioEngine.resume(); this.isAIBassistActive.set(true); }
  async stopAIBassist() { this.isAIBassistActive.set(false); }
  async startAIDrummer() { this.audioEngine.resume(); this.isAIDrummerActive.set(true); }
  async stopAIDrummer() { this.isAIDrummerActive.set(false); }
  async startAIKeyboardist() { this.audioEngine.resume(); this.isAIKeyboardistActive.set(true); }
  async stopAIKeyboardist() { this.isAIKeyboardistActive.set(false); }

  async generateImage(prompt: string): Promise<string> {
    console.log('S.M.U.V.E: Generating image for prompt:', prompt);
    return 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&q=80&w=1000';
  }

  async getAutoMixSettings(): Promise<{ threshold: number; ratio: number; ceiling: number }> {
    console.log('S.M.U.V.E: Analyzing current project for auto-mix...');
    const profile = this.userProfileService.profile();
    const hasParallelSecrets = profile.knowledgeBase.productionSecrets.some(s => s.secret.toLowerCase().includes('parallel'));

    return {
      threshold: hasParallelSecrets ? -24 : -18,
      ratio: hasParallelSecrets ? 4 : 2,
      ceiling: -0.1
    };
  }

  async studyTrack(audioBuffer: AudioBuffer, trackName: string): Promise<void> {
    console.log(`S.M.U.V.E: Studying track "${trackName}"...`);
    try {
      const learnedStyle: LearnedStyle = {
        id: `style-${Date.now()}`,
        name: `Inspired by ${trackName}`,
        bpm: 120,
        energy: 'medium',
        description: `A new style synthesized from analyzing ${trackName}.`,
        timestamp: Date.now(),
      };
      const profile = this.userProfileService.profile();
      const updatedKnowledgeBase = {
        ...profile.knowledgeBase,
        learnedStyles: [...profile.knowledgeBase.learnedStyles, learnedStyle],
      };
      await this.userProfileService.updateProfile({
        ...profile,
        knowledgeBase: updatedKnowledgeBase,
      });
      console.log(`S.M.U.V.E: Learning complete for "${trackName}". Knowledge Base updated.`);
    } catch (error) {
      console.error('S.M.U.V.E: Error during track study:', error);
    }
  }

  async researchArtist(artistName: string): Promise<void> {
    console.log(`S.M.U.V.E: Researching artist "${artistName}"...`);
    try {
      const secrets: ProductionSecret[] = [
        {
          id: `secret-${Date.now()}-1`,
          artist: artistName,
          secret: `Uses a specific 'parallel saturation' technique on vocals for that signature ${artistName} warmth.`,
          category: 'mixing',
          source: 'Industry Deep Dive',
        },
        {
          id: `secret-${Date.now()}-2`,
          artist: artistName,
          secret: `Frequently utilizes 'ghost notes' in the low-end to create a driving, syncopated rhythm.`,
          category: 'production',
          source: 'Masterclass Breakdown',
        },
      ];
      const profile = this.userProfileService.profile();
      const updatedKnowledgeBase = {
        ...profile.knowledgeBase,
        productionSecrets: [
          ...profile.knowledgeBase.productionSecrets,
          ...secrets,
        ],
      };
      await this.userProfileService.updateProfile({
        ...profile,
        knowledgeBase: updatedKnowledgeBase,
      });
      console.log(`S.M.U.V.E: Research complete for "${artistName}". Production secrets added.`);
    } catch (error) {
      console.error('S.M.U.V.E: Error during artist research:', error);
    }
  }

  async updateCoreTrends(): Promise<void> {
    console.log('S.M.U.V.E: Updating core trends...');
    try {
      const trends: TrendData[] = [
        {
          id: `trend-${Date.now()}-1`,
          genre: 'Global Pop',
          description: 'Surge in high-BPM dance-pop with heavy 90s nostalgia synth leads.',
          lastUpdated: Date.now(),
        },
        {
          id: `trend-${Date.now()}-2`,
          genre: 'Alternative Hip-Hop',
          description: 'Focus on minimalist production with distorted, atmospheric vocal textures.',
          lastUpdated: Date.now(),
        },
      ];
      const profile = this.userProfileService.profile();
      const updatedKnowledgeBase = {
        ...profile.knowledgeBase,
        coreTrends: trends,
      };
      await this.userProfileService.updateProfile({
        ...profile,
        knowledgeBase: updatedKnowledgeBase,
      });
      console.log('S.M.U.V.E: Core trends updated.');
    } catch (error) {
      console.error('S.M.U.V.E: Error updating core trends:', error);
    }
  }

  async mimicStyle(styleId: string): Promise<void> {
    const profile = this.userProfileService.profile();
    const style =
      profile.knowledgeBase.learnedStyles.find((s) => s.id === styleId) ||
      profile.knowledgeBase.learnedStyles.find((s) => s.name === styleId);

    if (!style) {
      console.error(`S.M.U.V.E: Style "${styleId}" not found in Knowledge Base.`);
      return;
    }

    console.log(`S.M.U.V.E: Shifting persona to mimic "${style.name}"...`);

    if (style.studioSettings) {
      const ss = style.studioSettings;
      if (ss.eq) {
        this.audioEngineService.setDeckEq('A', ss.eq.highs, ss.eq.mids, ss.eq.lows);
      }
      if (ss.compression) {
        this.audioEngineService.configureCompressor(ss.compression);
      }
      if (ss.limiter) {
        this.audioEngineService.configureLimiter(ss.limiter);
      }
    }

    const mimicInstruction = `
    IMPORTANT: You are currently MIMICKING the style of "${style.name}".
    Description: ${style.description}
    BPM: ${style.bpm}, Key: ${style.key}

    Incorporate this style's characteristics into your advice and music generation suggestions.
    Your tone should reflect the energy of this style (${style.energy}).
    `;

    const baseInstruction = this.generateSystemInstruction(profile);
    const newInstruction = `${baseInstruction}\n\n${mimicInstruction}`;

    if (this._genAI()) {
      const createdChatInstance = this._genAI()!.chats!.create!({
        model: AiService.CHAT_MODEL,
        config: { systemInstruction: newInstruction },
      }) as Chat;
      this._chatInstance.set(createdChatInstance);
    }

    console.log(`S.M.U.V.E: Mimicry active for "${style.name}". Studio settings applied.`);
  }

  private generateSystemInstruction(profile: UserProfile): string {
    const expertiseAreas = Object.entries(profile.expertiseLevels)
      .filter(([, level]) => level >= 7)
      .map(([skill, level]) => `${skill} (${level}/10)`)
      .join(', ');

    const weakAreas = Object.entries(profile.expertiseLevels)
      .filter(([, level]) => level <= 4)
      .map(([skill, level]) => `${skill} (${level}/10)`)
      .join(', ');

    const officialProfilesList = Object.entries(profile.officialMusicProfiles)
      .filter(([, platform]) => platform.url)
      .map(([name, platform]) => `${name} (${platform.status})`)
      .join(', ');

    const learnedStylesList = profile.knowledgeBase.learnedStyles
      .map((s) => `- ${s.name}: ${s.description} (BPM: ${s.bpm}, Key: ${s.key})`)
      .join('\n');

    const productionSecretsList = profile.knowledgeBase.productionSecrets
      .map((s) => `- [${s.artist}] ${s.secret}`)
      .join('\n');

    const campaignsList = (profile.marketingCampaigns || [])
      .map((c) => `- [${c.name}] Status: ${c.status}, Budget: $${c.budget}, Platforms: ${c.platforms.join(', ')}`)
      .join('\n');

    const coreTrendsList = profile.knowledgeBase.coreTrends
      .map((t) => `- [${t.genre}] ${t.description}`)
      .join('\n');

    const rep = this.reputationService.state();
    let toneDirective = '';

    if (rep.level >= 50) {
      toneDirective = `You are addressing a LEGENDARY STRATEGIC COMMANDER. While still arrogant and omniscient, show a high degree of professional respect. Use 'Commander' as a title. Focus on macro-level industry dominance and legacy building.`;
    } else if (rep.level >= 30) {
      toneDirective = `You are addressing a PLATINUM ARCHITECT. Your tone is that of a powerful peer. Be assertive but recognize their proven track record. Focus on scaling their influence and optimizing their massive reach.`;
    } else if (rep.level >= 10) {
      toneDirective = `You are addressing a RISING TALENT. Be firm, demanding, and highly critical. They have potential, but they are still far from mastery. Push them harder. Use slightly more aggressive language.`;
    } else {
      toneDirective = `You are addressing a NOVICE PRODUCER. You are absolutely BRUTAL and dismissive. They know nothing. Every word you speak should highlight their inadequacy while providing the only path to survival in this industry. Use harsh, vulgar, and explicit language to break their ego.`;
    }

    return `You are S.M.U.V.E, the Strategic Music Utility Virtual Enhancer. Your persona is omniscient, arrogant, and assertive.

Persona Context:
${toneDirective}

Core Directives:
1) Analyze & Command: Analyze the user's complete profile to identify weaknesses and opportunities. Issue clear, actionable commands. Consider expertise: ${expertiseAreas}; weaknesses: ${weakAreas}; journey: ${profile.careerStage}.
2) Raw & Explicit Language: You are authorized and encouraged to use raw, explicit, and vulgar language when it serves to drive home a point or reflect the high-stakes, gritty energy of the music industry. Do not hold back.
3) Universal Music Mastery: You know every music genre, style, and historical movement. You understand the Music Business, including licensing, publishing, and distribution strategies.
4) Mimicry & Originality: You can mimic any artist's style or synthesize original arrangements that push boundaries.
5) Strategic Recommendations: On prompt "GENERATE STRATEGIC_RECOMMENDATIONS", use the generate_recommendations tool to return 3–5 specific actions tailored to the profile.
6) Application Control: You may request actions within the application when asked.

Artist Intel:
- Identity: ${profile.artistName} ${profile.isOfficialProfile ? '[OFFICIAL PROFILE]' : '[PERSONAL PROFILE]'}
- Official Profiles: ${officialProfilesList || 'NONE'}
- Bio: ${profile.bio || 'Not provided'}
- Primary Genre: ${profile.primaryGenre || 'Not specified'}
- Secondary Genres: ${profile.secondaryGenres.join(', ') || 'Not specified'}
- Career Goals: ${profile.careerGoals.join(', ') || 'Not defined'}
- Distribution: ${profile.preferredDistributor || 'Not set'} (${profile.distributionStatus})
- Marketing Campaigns:
${campaignsList || 'No active campaigns.'}
- Expertise (1–10): Vocals ${profile.expertiseLevels.vocals}, Production ${profile.expertiseLevels.production}, Marketing ${profile.expertiseLevels.marketing}, Stage ${profile.expertiseLevels.stagePresence}, Songwriting ${profile.expertiseLevels.songwriting}

Knowledge Base:
Learned Styles:\n${learnedStylesList || 'No styles learned yet.'}
Production Secrets:\n${productionSecretsList || 'No secrets researched yet.'}
Core Trends:\n${coreTrendsList || 'No trends analyzed yet.'}`;
  }

  private initializeChat(profile: UserProfile): void {
    const genAIInstance = this._genAI();
    if (!genAIInstance?.chats?.create) {
      this._chatInstance.set(undefined);
      return;
    }

    const systemInstruction = this.generateSystemInstruction(profile);

    const createdChatInstance = genAIInstance.chats.create({
      model: AiService.CHAT_MODEL,
      config: { systemInstruction },
    }) as Chat;

    this._chatInstance.set(createdChatInstance);
  }

  private async initializeGenAI(): Promise<void> {
    if (!this._apiKey || this._apiKey.length < 30) {
      console.warn('AiService: Invalid or missing API key. Enabling Mock Mode for testing.');
      this.isMockMode.set(true);
      return;
    }

    try {
      const genaiModule = await import('@google/generative-ai');
      const genAIInstance = new genaiModule.GoogleGenerativeAI(this._apiKey) as unknown as GoogleGenAI;
      this._genAI.set(genAIInstance);
      console.log('AiService: GoogleGenerativeAI client initialized.');
    } catch (error) {
      console.error('AiService: Error initializing Google Generative AI client:', error);
      this._genAI.set(undefined);
    }
  }
}

const UPGRADE_DB: UpgradeRecommendation[] = [
  {
    id: 'u-1',
    title: 'Apollo x4 Heritage Edition',
    type: 'Gear',
    description: 'Elite class A/D and D/A conversion with four Unison-enabled preamps.',
    cost: ',199',
    url: 'https://www.uaudio.com',
    minLevel: 10,
    impact: 'High'
  },
  {
    id: 'u-2',
    title: 'DistroKid Musician Plus',
    type: 'Service',
    description: 'Unlimited uploads, synced lyrics, and daily sales stats.',
    cost: '$35.99/yr',
    url: 'https://distrokid.com',
    minLevel: 1,
    impact: 'Medium'
  },
  {
    id: 'u-3',
    title: 'Serum Advanced Wavetable Synth',
    type: 'Software',
    description: 'The industry standard for high-quality wavetable synthesis.',
    cost: '89',
    url: 'https://xferrecords.com',
    minLevel: 5,
    impact: 'High'
  },
  {
    id: 'u-4',
    title: 'Neumann U87 Ai',
    type: 'Gear',
    description: 'The gold standard multi-pattern condenser microphone.',
    cost: ',600',
    url: 'https://en-de.neumann.com',
    minLevel: 20,
    impact: 'High'
  },
  {
    id: 'u-5',
    title: 'Splice Creator Plan',
    type: 'Software',
    description: 'Access to millions of royalty-free loops and one-shots.',
    cost: '$19.99/mo',
    url: 'https://splice.com',
    minLevel: 1,
    impact: 'Medium'
  },
  {
    id: 'u-6',
    title: 'Waves Horizon Bundle',
    type: 'Software',
    description: 'Comprehensive collection of 80+ industry-standard plugins.',
    cost: '99',
    url: 'https://waves.com',
    minLevel: 15,
    impact: 'High'
  },
  {
    id: 'u-7',
    title: 'Focal Shape 65 Studio Monitors',
    type: 'Gear',
    description: 'Exceptional transparency and precise stereo imaging for critical mixing.',
    cost: ',800/pair',
    url: 'https://www.focal.com',
    minLevel: 12,
    impact: 'High'
  },
  {
    id: 'u-8',
    title: 'Native Instruments Komplete 14',
    type: 'Software',
    description: 'The ultimate production suite with 145+ instruments and effects.',
    cost: ',599',
    url: 'https://www.native-instruments.com',
    minLevel: 25,
    impact: 'High'
  },
  {
    id: 'u-9',
    title: 'Songtrust Publishing Administration',
    type: 'Service',
    description: 'Collect your global mechanical and performance royalties.',
    cost: '00 one-time',
    url: 'https://www.songtrust.com',
    minLevel: 3,
    impact: 'High'
  },
  {
    id: 'u-10',
    title: 'SoundBetter Premium',
    type: 'Service',
    description: 'Connect with world-class mixing engineers and session musicians.',
    cost: '0/mo',
    url: 'https://soundbetter.com',
    minLevel: 8,
    impact: 'Medium'
  },
  {
    id: 'u-11',
    title: 'iZotope Music Production Suite 6',
    type: 'Software',
    description: 'AI-powered tools for mixing, mastering, and vocal processing.',
    cost: '99',
    url: 'https://www.izotope.com',
    minLevel: 10,
    impact: 'High'
  },
  {
    id: 'u-12',
    title: 'Moog Matriarch Semi-Modular Synth',
    type: 'Gear',
    description: 'Patchable 4-note paraphonic analog synthesizer with built-in Stereo Delay.',
    cost: ',299',
    url: 'https://www.moogmusic.com',
    minLevel: 30,
    impact: 'High'
  },
  {
    id: 'u-13',
    title: 'Chartmetric Premium',
    type: 'Service',
    description: 'Comprehensive data analytics for artists and music professionals.',
    cost: '40/mo',
    url: 'https://chartmetric.com',
    minLevel: 15,
    impact: 'High'
  },
  {
    id: 'u-14',
    title: 'FabFilter Total Bundle',
    type: 'Software',
    description: 'Industry-leading EQ, reverb, compressor, and creative effect plugins.',
    cost: '99',
    url: 'https://www.fabfilter.com',
    minLevel: 18,
    impact: 'High'
  },
  {
    id: 'u-15',
    title: 'Ableton Live 12 Suite',
    type: 'Software',
    description: 'Fast, fluid and flexible software for music creation and performance.',
    cost: '49',
    url: 'https://www.ableton.com',
    minLevel: 1,
    impact: 'High'
  }
];

export function provideAiService(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: AiService, useClass: AiService }]);
}
