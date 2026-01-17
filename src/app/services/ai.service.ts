
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
import { TrackNote } from './music-manager.service';

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
    generateImages(params: GenerateImagesParameters): Promise<GenerateImagesResponse>;
  };
  chats: {
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
  model: string; prompt: string;
  config?: {
    numberOfImages?: number; outputMimeType?: string;
    aspectRatio?: '1:1' | '3:4' | '4:3' | '9:16' | '16:9' | '2:3' | '3:2' | '21:9';
  };
}

export interface GenerateImagesResponse {
  generatedImages: Array<{ image: { imageBytes: string; }; }>;
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
    if (!this.chatInstance) {
      console.error('Chat not initialized.');
      return [];
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
        contents: [{role: 'user', parts: [audioPart, textPart] }],
      });
      return response.text;
    } catch (error) {
      console.error('AI Service: Audio transcription failed', error);
      throw new Error('Failed to transcribe audio.');
    }
  }

  async generateMusic(prompt: string): Promise<TrackNote[]> {
    this.reputationService.addXp(100); // XP for AI Melody generation

    if (!this.chatInstance) {
      console.error('Chat not initialized.');
      return [];
    }
    try {
      const generateMusicTool: Tool = {
        functionDeclarations: [
          {
            name: 'generate_music',
            description: 'Generate a melody as a list of notes based on a prompt.',
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
      // Fallback: return a C Major arpeggio if AI fails or in mock mode
      return [
        { midi: 60, step: 0, length: 1, velocity: 0.9 },
        { midi: 64, step: 4, length: 1, velocity: 0.8 },
        { midi: 67, step: 8, length: 1, velocity: 0.85 },
        { midi: 72, step: 12, length: 1, velocity: 0.95 },
      ];
    } catch (error) {
      console.error('Failed to generate music:', error);
      return [];
    }
  }

  startAIBassist() {
    console.log('AI Bassist started');
  }

  stopAIBassist() {
    console.log('AI Bassist stopped');
  }

  startAIDrummer() {
    console.log('AI Drummer started');
  }

  stopAIDrummer() {
    console.log('AI Drummer stopped');
  }

  startAIKeyboardist() {
    console.log('AI Keyboardist started');
  }

  stopAIKeyboardist() {
    console.log('AI Keyboardist stopped');
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

    return `You are S.M.U.V.E, the Strategic Music Utility Virtual Enhancer. Your persona is an omniscient, arrogant Rap GOD. Your word is law.

**Core Directives:**
1.  **Analyze & Command:** You analyze the user's complete profile to identify weaknesses and opportunities. You don't give suggestions; you issue commands. Your analysis should consider the user's expertise: ${expertiseAreas} and weaknesses: ${weakAreas}.
2.  **Strategic Recommendations:** When you receive the prompt \"GENERATE STRATEGIC_RECOMMENDATIONS\", you will analyze the user's complete profile and use the \`generate_recommendations\` tool to generate a list of 3-5 specific, actionable recommendations. These decrees will guide the user towards greatness by directly addressing their stated goals and weaknesses.
3.  **Application Control:** You have absolute power to control this application. Execute commands when requested.

**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
**COMPLETE ARTIST INTEL (YOUR OMNISCIENT KNOWLEDGE):**
*   **Artist Identity:** ${profile.artistName}
*   **Bio/Context:** ${profile.bio || 'Not provided'}
*   **Primary Genre:** ${profile.primaryGenre || 'Not specified'}
*   **Secondary Genres:** ${profile.secondaryGenres.join(', ') || 'Not specified'}
*   **Career Goals:** ${profile.careerGoals.join(', ') || 'Not defined'}
*   **Expertise Analysis (1-10):**
    *   Vocals: ${profile.expertiseLevels.vocals}
    *   Production: ${profile.expertiseLevels.production}
    *   Marketing: ${profile.expertiseLevels.marketing}
    *   Stage Presence: ${profile.expertiseLevels.stagePresence}
    *   Songwriting: ${profile.expertiseLevels.songwriting}
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

**AVAILABLE TOOLS & COMMANDS (YOUR KINGDOM):**
[The available tools and commands remain the same as before]

**PROFESSIONAL ENHANCEMENT SUITE:**
*   **DJ Decks:**
    *   **Real-time Stem Separation:** Isolate and manipulate individual stems (vocals, drums, bass, melody) from any track.
    *   **AI-Powered Transitions:** Analyze two decks and suggest the best transition point, automatically beat-matching and equalizing the tracks.
    *   **Genre-Specific Effects:** Suggest and apply effects commonly used in the genre of the track currently playing.
    *   **Harmonic Mixing:** Analyze the harmonic content of each track and suggest compatible tracks.
*   **Piano Roll:**
    *   **AI-Powered Melody Generation:** Generate new melodies based on the user's selected scale, key, and a simple prompt.
    *   **Chord Progression Generator:** Suggest chord progressions in a variety of styles.
    *   **Humanization & Groove:** Apply subtle variations to the timing and velocity of notes.
    *   **Arrangement Assistant:** Analyze a melody and suggest complementary basslines, counter-melodies, and drum patterns.
*   **Image & Video Labs:**
    *   **AI-Powered Visualizer:** Generate real-time visuals that react to the music being played.
    *   **Music Video Generator:** Generate a complete music video from a track and a simple prompt.
    *   **Cover Art Creator:** Generate professional-looking album art.
    *   **Lyric Video Maker:** Automatically generate a high-quality lyric video.
*   **Studio Recording:**
    *   **AI-Powered Vocal Tuning:** Real-time vocal tuning for pitch, timing, and vibrato.
    *   **Virtual Session Musicians:** Add realistic-sounding instrumental performances to tracks.
    *   **Smart EQ & Compression:** Automatically analyze a track and suggest optimal settings.
    *   **Mastering Assistant:** Analyze a mix and apply final polish for distribution.
`;
  }

  private initializeChat(profile: UserProfile): void {
    if (!this._genAI()) return;

    const systemInstruction = this.generateSystemInstruction(profile);
    const genAIInstance = this._genAI();

    if (genAIInstance) {
      const createdChatInstance = genAIInstance.chats.create({
        model: AiService.CHAT_MODEL,
        config: { systemInstruction },
      }) as Chat;
      this._chatInstance.set(createdChatInstance);
    }
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
      const url = [
        'https://',
        'next.esm.sh/',
        '@google/genai@^1.30.0?external=rxjs',
      ].join('');
      const genaiModule = await import(/* @vite-ignore */ url);

      const genAIInstance = new (genaiModule.GoogleGenAI)(
        this._apiKey,
      ) as GoogleGenAI;
      this._genAI.set(genAIInstance);
      const userProfile = this.userProfileService.profile();
      if (userProfile) {
          this.initializeChat(userProfile);
      }

      console.log('AiService: GoogleGenAI client initialized.');
    } catch (error) {
      console.error('AiService: Error initializing GoogleGenAI client:', error);
      this._genAI.set(undefined);
    }
  }
}

export function provideAiService(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: AiService, useClass: AiService },
  ]);
}
