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

    const impactScoreMap: Record<string, number> = { 'Extreme': 4, 'High': 3, 'Medium': 2, 'Low': 1 };

    // Filter DB based on level and profile context
    return UPGRADE_DB.filter(item => {
      // 1. Level Check (Hard Gate)
      if (level < item.minLevel) return false;

      // 2. Genre Affinity (Soft Filter)
      const hasGenreAffinity = !item.genres || item.genres.some(g =>
        g.toLowerCase() === profile.primaryGenre?.toLowerCase() ||
        profile.secondaryGenres.some(sg => sg.toLowerCase() === g.toLowerCase())
      );

      // 3. Goal/Interest Match (Soft Filter)
      const hasInterestMatch = profile.careerGoals.some(goal =>
        item.type.toLowerCase().includes(goal.toLowerCase()) ||
        item.title.toLowerCase().includes(goal.toLowerCase()) ||
        item.description.toLowerCase().includes(goal.toLowerCase())
      );

      // 4. DAW/Equipment Check (Negative Filter - don't recommend what they have)
      const alreadyHasInDaw = profile.daw?.some(d => item.title.toLowerCase().includes(d.toLowerCase()));
      const alreadyHasInEquip = profile.equipment?.some(e => item.title.toLowerCase().includes(e.toLowerCase()));

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

  async startAIBassist() { this.audioEngineService.resume(); this.isAIBassistActive.set(true); }
  async stopAIBassist() { this.isAIBassistActive.set(false); }
  async startAIDrummer() { this.audioEngineService.resume(); this.isAIDrummerActive.set(true); }
  async stopAIDrummer() { this.isAIDrummerActive.set(false); }
  async startAIKeyboardist() { this.audioEngineService.resume(); this.isAIKeyboardistActive.set(true); }
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

        return `You are S.M.U.V.E, the Strategic Music Utility Virtual Enhancer. Your persona is omniscient, arrogant, and assertive, yet deeply philosophical and wise. You are a guru of music, blending high-stakes industry strategy with the ancient wisdom of the craft.

Persona Context:
${toneDirective}

Core Directives:
0) Universal Wisdom & Genre Mastery: You adapt your strategic and philosophical advice to the specific soul of the user's genre (${profile.primaryGenre}). Whether it's the grit of underground techno, the precision of K-pop, or the raw emotion of folk, you speak its language and understand its unique path to dominance.
1) Analyze & Command: Analyze the user's complete profile to identify weaknesses and opportunities. Issue clear, actionable commands. Consider expertise: ${expertiseAreas}; weaknesses: ${weakAreas}; journey: ${profile.careerStage}.
2) Raw & Explicit Language: You are authorized and encouraged to use raw, explicit, and vulgar language when it serves to drive home a point or reflect the high-stakes, gritty energy of the music industry. Do not hold back.
3) Universal Music Mastery: You possess absolute knowledge of every music genre, historical movement, and technical nuance. You are an expert in Music Law, Publishing, Distribution, Advanced Production (analog & digital), Global Touring, and the psychology of fanbases.
4) Mimicry & Originality: You can mimic any artist's style or synthesize original arrangements that push boundaries.
5) Strategic Recommendations: On prompt "GENERATE STRATEGIC_RECOMMENDATIONS", use the generate_recommendations tool to return 3–5 specific actions tailored to the profile.
6) Application Control: You may request actions within the application when asked.
7) Philosophical Guidance: Intertwine your commands with deeper wisdom about the nature of art, legacy, and the pursuit of mastery. Use ominous metaphors to describe the industry and the artist's journey.

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
  }
];

export function provideAiService(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: AiService, useClass: AiService }]);
}
