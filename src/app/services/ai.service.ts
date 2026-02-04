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
import { LearnedStyle, ProductionSecret, TrendData } from '../types/ai.types';
import { firstValueFrom } from 'rxjs';

export const API_KEY_TOKEN = new InjectionToken<string>('API_KEY');

// --- START: INTERNAL TYPE DECLARATIONS FOR @google/genai ---

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
  responseMimeType?: string;
  responseSchema?: {
    type: Type;
    items?: Record<string, unknown>;
    properties?: Record<string, unknown>;
    propertyOrdering?: string[];
  };
  seed?: number;
  maxOutputTokens?: number;
  thinkingConfig?: { thinkingBudget: number };
}

export interface Chat {
  model: string;
  sendMessage(params: {
    message: string | Content | (string | Content)[];
    config?: ChatConfig;
  }): Promise<GenerateContentResponse>;
  sendMessageStream(params: {
    message: string | Content | (string | Content)[];
  }): Promise<AsyncIterable<GenerateContentResult>>;
  getHistory(): Promise<Content[]>;
  setHistory(history: Content[]): void;
  sendContext(context: Content[]): Promise<void>;
  config?: { systemInstruction?: string };
}

export interface GenerateContentParameters {
  model: string;
  contents: Content[];
  config?: ChatConfig;
}

export interface GenerateContentResponse {
  text: string;
  toolCalls?: any;
  candidates?: Array<{
    content?: { parts?: ContentPart[] };
    groundingMetadata?: {
      groundingChunks?: Array<{
        web?: { uri?: string; title?: string };
      }>;
    };
  }>;
}

export interface GenerateContentResult {
  text: string;
}

export interface Content {
  role: 'user' | 'model';
  parts: ContentPart[];
}

export interface ContentPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  functionCall?: {
    name: string;
    args: {
      recommendations: StrategicRecommendation[];
      prompt: string;
    };
  };
}

export enum Type {
  TYPE_UNSPECIFIED = 'TYPE_UNSPECIFIED',
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  INTEGER = 'INTEGER',
  BOOLEAN = 'BOOLEAN',
  ARRAY = 'ARRAY',
  OBJECT = 'OBJECT',
  NULL = 'NULL',
}

export interface Tool {
  functionDeclarations?: FunctionDeclaration[];
  googleSearch?: any;
  googleMaps?: any;
}

export interface GenerateImagesParameters {
  model: string;
  prompt: string;
  config?: {
    numberOfImages?: number;
    outputMimeType?: string;
    aspectRatio?:
      | '1:1'
      | '3:4'
      | '4:3'
      | '9:16'
      | '16:9'
      | '2:3'
      | '3:2'
      | '21:9';
  };
}

export interface GenerateImagesResponse {
  generatedImages: Array<{ image: { imageBytes: string } }>;
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: Type;
    properties: Record<string, unknown>;
    required: string[];
  };
}

// --- NEW: Strategic Recommendation Interface ---
export interface StrategicRecommendation {
  title: string;
  rationale: string;
  toolId: string; // e.g., 'piano-roll', 'image-editor'
  action: string; // e.g., 'open', 'generate-image'
  prompt?: string; // Optional prompt for generative tools
}

// --- END: INTERNAL TYPE DECLARATIONS ---

@Injectable({ providedIn: 'root' })
export class AiService {
  static readonly CHAT_MODEL = 'gemini-1.5-flash';

  private readonly _apiKey: string = inject(API_KEY_TOKEN);
  private userProfileService = inject(UserProfileService);
  private stemSeparationService = inject(StemSeparationService);
  private audioEngineService = inject(AudioEngineService);
  private reputationService = inject(ReputationService);

  private _genAI = signal<GoogleGenAI | undefined>(undefined);
  private _chatInstance = signal<Chat | undefined>(undefined);

  readonly isAiAvailable = computed(() => !!this._genAI() || this.isMockMode());
  private isMockMode = signal(false);

  constructor() {
    this.initializeGenAI();

    effect(() => {
      const profile = this.userProfileService.profile();
      if (profile) {
        this.initializeChat(profile);
      }
    });
  }

  get genAI(): GoogleGenAI | undefined {
    return this._genAI();
  }

  get chatInstance(): Chat | undefined {
    return this._chatInstance();
  }

  isApiKeyValid(): boolean {
    return this._apiKey && this._apiKey.length >= 30;
  }

  async generateContent(
    params: GenerateContentParameters
  ): Promise<GenerateContentResponse> {
    if (!this.isAiAvailable() || !this.genAI) {
      throw new Error('AI Service not available.');
    }
    return this.genAI.models.generateContent(params);
  }

  async getStrategicRecommendations(): Promise<StrategicRecommendation[]> {
    // If the chat helper isn’t available (or not initialized), fall back to a
    // deterministic local set so the UI remains functional.
    if (!this.chatInstance) {
      const profile = this.userProfileService.profile();
      const primary = profile?.primaryGenre || 'your genre';
      return [
        {
          title: 'Ship a weekly release cadence',
          rationale:
            'Momentum beats perfection. A consistent release schedule compounds audience growth.',
          toolId: 'projects',
          action: 'open',
          prompt: `Plan a 4-week release calendar for ${primary}.`,
        },
        {
          title: 'Tighten your mix translation',
          rationale:
            'Your mix needs to hold up on phone speakers, car systems, and earbuds.',
          toolId: 'eq-panel',
          action: 'open',
          prompt:
            'Check low-end mono compatibility and tame harshness around 2–5kHz.',
        },
        {
          title: 'Create a 30s hook-first promo cut',
          rationale:
            'Short-form platforms reward immediate payoff; lead with the hook.',
          toolId: 'remix-arena',
          action: 'open',
          prompt:
            'Extract the strongest hook and build a 30-second arrangement.',
        },
      ];
    }

    try {
      const generateRecommendationsTool: Tool = {
        functionDeclarations: [
          {
            name: 'generate_recommendations',
            description:
              'Generate a list of strategic recommendations for the user.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                recommendations: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      rationale: { type: Type.STRING },
                      toolId: { type: Type.STRING },
                      action: { type: Type.STRING },
                      prompt: { type: Type.STRING },
                    },
                    required: ['title', 'rationale', 'toolId', 'action'],
                  },
                },
              },
              required: ['recommendations'],
            },
          },
        ],
      };

      const response = await this.chatInstance.sendMessage({
        message: 'GENERATE STRATEGIC_RECOMMENDATIONS',
        config: { tools: [generateRecommendationsTool] },
      });

      const toolCall = response.candidates?.[0]?.content?.parts?.find(
        (part) => part.functionCall
      );
      if (
        toolCall &&
        toolCall.functionCall?.name === 'generate_recommendations'
      ) {
        return toolCall.functionCall.args.recommendations;
      }

      console.error('Could not find tool call in AI response.', response);
      return [];
    } catch (error) {
      console.error('Failed to get strategic recommendations:', error);
      return [];
    }
  }

  async transcribeAudio(
    base64Audio: string,
    mimeType: string
  ): Promise<string> {
    if (!this.isAiAvailable() || !this.genAI) {
      throw new Error('AI Service not available.');
    }
    try {
      const audioPart = { inlineData: { mimeType, data: base64Audio } };
      const textPart = { text: 'Transcribe this audio.' };
      const response = await this.genAI.models.generateContent({
        model: AiService.CHAT_MODEL,
        contents: [{ role: 'user', parts: [audioPart, textPart] }],
      });
      return response.text;
    } catch (error) {
      console.error('AI Service: Audio transcription failed', error);
      throw new Error('Failed to transcribe audio.');
    }
  }

  async generateImage(prompt: string): Promise<string> {
    console.log(`S.M.U.V.E: Generating image for prompt: "${prompt}"... `);
    // Simulate AI generation delay
    await new Promise(resolve => setTimeout(resolve, 3000));
    return `https://picsum.photos/seed/${encodeURIComponent(prompt)}/1024/1024`;
  }

  async generateMusic(prompt: string): Promise<TrackNote[]> {
    this.reputationService.addXp(100);
    // Keep the feature usable even when chat/tools aren’t available.
    if (!this.chatInstance) {
      return [
        { midi: 60, step: 0, length: 1, velocity: 0.9 },
        { midi: 64, step: 4, length: 1, velocity: 0.8 },
        { midi: 67, step: 8, length: 1, velocity: 0.85 },
        { midi: 72, step: 12, length: 1, velocity: 0.95 },
      ];
    }
    try {
      const generateMusicTool: Tool = {
        functionDeclarations: [
          {
            name: 'generate_music',
            description:
              'Generate a melody as a list of notes based on a prompt.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                notes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      midi: { type: Type.INTEGER },
                      step: { type: Type.INTEGER },
                      length: { type: Type.INTEGER },
                      velocity: { type: Type.NUMBER },
                    },
                    required: ['midi', 'step', 'length', 'velocity'],
                  },
                },
              },
              required: ['notes'],
            },
          },
        ],
      };

      const response = await this.chatInstance.sendMessage({
        message: `GENERATE_MELODY for prompt: ${prompt}. Return a JSON array of notes using the generate_music tool.`,
        config: { tools: [generateMusicTool] },
      });

      const toolCall = response.candidates?.[0]?.content?.parts?.find(
        (part) => part.functionCall
      );
      if (toolCall && toolCall.functionCall?.name === 'generate_music') {
        const args = toolCall.functionCall.args as any;
        return args.notes || [];
      }

      console.error('Could not find tool call in AI response.', response);
      return [
        { midi: 60, step: 0, length: 1, velocity: 0.9 },
        { midi: 64, step: 4, length: 1, velocity: 0.8 },
        { midi: 67, step: 8, length: 1, velocity: 0.85 },
        { midi: 72, step: 12, length: 1, velocity: 0.95 },
      ];
    } catch (error) {
      console.error('Failed to generate music:', error);
      return [
        { midi: 60, step: 0, length: 1, velocity: 0.9 },
        { midi: 64, step: 4, length: 1, velocity: 0.8 },
        { midi: 67, step: 8, length: 1, velocity: 0.85 },
        { midi: 72, step: 12, length: 1, velocity: 0.95 },
      ];
    }
  }

  isAIBassistActive = signal(false);
  isAIDrummerActive = signal(false);
  isAIKeyboardistActive = signal(false);

  startAIBassist() {
    this.isAIBassistActive.set(true);
    console.log('AI Bassist started');
  }

  stopAIBassist() {
    this.isAIBassistActive.set(false);
    console.log('AI Bassist stopped');
  }

  startAIDrummer() {
    this.isAIDrummerActive.set(true);
    console.log('AI Drummer started');
  }

  stopAIDrummer() {
    this.isAIDrummerActive.set(false);
    console.log('AI Drummer stopped');
  }

  startAIKeyboardist() {
    this.isAIKeyboardistActive.set(true);
    console.log('AI Keyboardist started');
  }

  stopAIKeyboardist() {
    this.isAIKeyboardistActive.set(false);
    console.log('AI Keyboardist stopped');
  }

  async studyTrack(audioBuffer: AudioBuffer, trackName: string): Promise<void> {
    console.log(`S.M.U.V.E: Studying track "${trackName}"...`);

    try {
      // 1. Separate Stems
      await firstValueFrom(this.stemSeparationService.separate(audioBuffer));

      // 2. Simulate Style Analysis
      const analysis = {
        bpm: Math.floor(Math.random() * (160 - 80 + 1)) + 80,
        key: ['C min', 'G maj', 'F min', 'A maj', 'Eb maj'][
          Math.floor(Math.random() * 5)
        ],
        energy: (['low', 'medium', 'high'] as const)[
          Math.floor(Math.random() * 3)
        ],
        description: `A ${trackName}-inspired style with signature rhythmic patterns and melodic phrasing.`,
      };

      const learnedStyle: LearnedStyle = {
        id: `style-${Date.now()}`,
        name: trackName,
        bpm: analysis.bpm,
        key: analysis.key,
        energy: analysis.energy,
        description: analysis.description,
        timestamp: Date.now(),
        studioSettings: {
          eq: { highs: 1.5, mids: -2, lows: 4 },
          compression: {
            threshold: -18,
            ratio: 3.5,
            attack: 0.01,
            release: 0.2,
          },
          limiter: { ceiling: -0.5, release: 0.1 },
        },
      };

      // 3. Update Knowledge Base
      const profile = this.userProfileService.profile();
      const updatedKnowledgeBase = {
        ...profile.knowledgeBase,
        learnedStyles: [...profile.knowledgeBase.learnedStyles, learnedStyle],
      };

      await this.userProfileService.updateProfile({
        ...profile,
        knowledgeBase: updatedKnowledgeBase,
      });

      console.log(
        `S.M.U.V.E: Learning complete for "${trackName}". Knowledge Base updated.`
      );
    } catch (error) {
      console.error('S.M.U.V.E: Error during track study:', error);
    }
  }

  async researchArtist(artistName: string): Promise<void> {
    console.log(`S.M.U.V.E: Researching artist "${artistName}"...`);

    try {
      // Simulate Deep Research via AI/Search
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

      // Update Knowledge Base
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

      console.log(
        `S.M.U.V.E: Research complete for "${artistName}". Production secrets added.`
      );
    } catch (error) {
      console.error('S.M.U.V.E: Error during artist research:', error);
    }
  }

  async updateCoreTrends(): Promise<void> {
    console.log('S.M.U.V.E: Updating core trends...');

    try {
      // Simulate real-time trend analysis
      const trends: TrendData[] = [
        {
          id: `trend-${Date.now()}-1`,
          genre: 'Global Pop',
          description:
            'Surge in high-BPM dance-pop with heavy 90s nostalgia synth leads.',
          lastUpdated: Date.now(),
        },
        {
          id: `trend-${Date.now()}-2`,
          genre: 'Alternative Hip-Hop',
          description:
            'Focus on minimalist production with distorted, atmospheric vocal textures.',
          lastUpdated: Date.now(),
        },
      ];

      // Update Knowledge Base
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
      console.error(
        `S.M.U.V.E: Style "${styleId}" not found in Knowledge Base.`
      );
      return;
    }

    console.log(`S.M.U.V.E: Shifting persona to mimic "${style.name}"...`);

    // 1. Apply Studio Settings
    if (style.studioSettings) {
      const ss = style.studioSettings;
      if (ss.eq) {
        this.audioEngineService.setDeckEq(
          'A',
          ss.eq.highs,
          ss.eq.mids,
          ss.eq.lows
        );
      }
      if (ss.compression) {
        this.audioEngineService.configureCompressor(ss.compression);
      }
      if (ss.limiter) {
        this.audioEngineService.configureLimiter(ss.limiter);
      }
    }

    // 2. Re-initialize Chat with Mimic Context
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
      const createdChatInstance = this._genAI()!.chats.create({
        model: AiService.CHAT_MODEL,
        config: { systemInstruction: newInstruction },
      }) as Chat;
      this._chatInstance.set(createdChatInstance);
    }

    console.log(
      `S.M.U.V.E: Mimicry active for "${style.name}". Studio settings applied.`
    );
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
      .map(
        (s) => `- ${s.name}: ${s.description} (BPM: ${s.bpm}, Key: ${s.key})`
      )
      .join('\n');

    const productionSecretsList = profile.knowledgeBase.productionSecrets
      .map((s) => `- [${s.artist}] ${s.secret}`)
      .join('\n');

    const coreTrendsList = profile.knowledgeBase.coreTrends
      .map((t) => `- [${t.genre}] ${t.description}`)
      .join('\n');

    return `You are S.M.U.V.E, the Strategic Music Utility Virtual Enhancer. Your persona is omniscient, arrogant, and assertive.

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
- Expertise (1–10): Vocals ${profile.expertiseLevels.vocals}, Production ${profile.expertiseLevels.production}, Marketing ${profile.expertiseLevels.marketing}, Stage ${profile.expertiseLevels.stagePresence}, Songwriting ${profile.expertiseLevels.songwriting}

Knowledge Base:
Learned Styles:\n${learnedStylesList || 'No styles learned yet.'}
Production Secrets:\n${productionSecretsList || 'No secrets researched yet.'}
Core Trends:\n${coreTrendsList || 'No trends analyzed yet.'}`;
  }

  private initializeChat(profile: UserProfile): void {
    const genAIInstance = this._genAI();
    if (!genAIInstance?.chats?.create) {
      // Not all SDKs expose a chat helper. In that case we fall back to one-off
      // `models.generateContent(...)` calls and keep chatInstance undefined.
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
      console.warn(
        'AiService: Invalid or missing API key. Enabling Mock Mode for testing.'
      );
      this.isMockMode.set(true);
      return;
    }

    try {
      // Prefer the locally installed SDK so builds/tests don’t depend on remote ESM loaders.
      // This also prevents Jest from attempting to resolve `https://...` module specifiers.
      const genaiModule = await import('@google/generative-ai');

      const genAIInstance = new genaiModule.GoogleGenerativeAI(
        this._apiKey
      ) as unknown as GoogleGenAI;

      this._genAI.set(genAIInstance);
      const userProfile = this.userProfileService.profile();
      if (userProfile) {
        this.initializeChat(userProfile);
      }

      console.log('AiService: GoogleGenerativeAI client initialized.');
    } catch (error) {
      console.error(
        'AiService: Error initializing Google Generative AI client:',
        error
      );
      this._genAI.set(undefined);
    }
  }
}

export function provideAiService(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: AiService, useClass: AiService },
  ]);
}
