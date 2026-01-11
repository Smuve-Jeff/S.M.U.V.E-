import { Injectable, signal, computed, EnvironmentProviders, makeEnvironmentProviders, InjectionToken, inject, effect } from '@angular/core';
import { UserProfileService, UserProfile } from './user-profile.service';

export const API_KEY_TOKEN = new InjectionToken<string>('API_KEY');

// --- START: INTERNAL TYPE DECLARations FOR @google/genai ---

export interface GoogleGenAI {
  apiKey: string;
  models: {
    generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse>;
    generateContentStream(params: GenerateContentParameters): Promise<AsyncIterable<GenerateContentResult>>;
    generateImages(params: GenerateImagesParameters): Promise<GenerateImagesResponse>;
    generateVideos(params: GenerateVideosParameters): Promise<GenerateVideosOperation>;
  };
  chats: {
    create(config: { model: string; systemInstruction?: string; config?: any; }): Chat;
  };
  operations: {
    getVideosOperation(params: { operation: GenerateVideosOperation }): Promise<GenerateVideosOperation>;
  };
}

export interface Chat {
  model: string;
  sendMessage(params: { message: string | Content | (string | Content)[] }): Promise<GenerateContentResponse>;
  sendMessageStream(params: { message: string | Content | (string | Content)[] }): Promise<AsyncIterable<GenerateContentResult>>;
  getHistory(): Promise<Content[]>;
  setHistory(history: Content[]): void;
  sendContext(context: Content[]): Promise<void>;
  config?: { systemInstruction?: string; };
}

export interface GenerateContentParameters {
  model:string;
  contents: string | { parts: Content[] } | Content[];
  config?: {
    systemInstruction?: string;
    tools?: Tool[];
    topK?: number;
    topP?: number;
    temperature?: number;
    responseMimeType?: string;
    responseSchema?: { type: Type; items?: any; properties?: any; propertyOrdering?: string[]; };
    seed?: number;
    maxOutputTokens?: number;
    thinkingConfig?: { thinkingBudget: number };
  };
}

export interface GenerateContentResponse {
  text: string;
  candidates?: Array<{
    content?: { parts?: Content[]; };
    groundingMetadata?: {
      groundingChunks?: Array<{
        web?: { uri?: string; title?: string; };
      }>;
    };
  }>;
}

export interface GenerateContentResult {
  text: string;
}

export interface Content {
  text?: string;
  inlineData?: { mimeType: string; data: string; };
  fileData?: { mimeType: string; fileUri: string; };
  parts?: Content[];
}

export enum Type {
  TYPE_UNSPECIFIED = 'TYPE_UNSPECIFIED', STRING = 'STRING', NUMBER = 'NUMBER',
  INTEGER = 'INTEGER', BOOLEAN = 'BOOLEAN', ARRAY = 'ARRAY', OBJECT = 'OBJECT', NULL = 'NULL',
}

export interface Tool {
  googleSearch?: {};
  googleMaps?: {};
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

export interface GenerateVideosParameters {
  model: string; prompt: string; image?: { imageBytes: string; mimeType: string; };
  config?: {
    numberOfVideos?: number;
    aspectRatio?: '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
  };
}

export interface GenerateVideosResponse {
  generatedVideos?: Array<{ video?: { uri?: string; }; }>;
}

export interface GenerateVideosOperation {
  done: boolean; name: string; response?: GenerateVideosResponse;
  metadata?: any; error?: { code: number; message: string; };
}

// --- NEW: Strategic Recommendation Interface ---
export interface StrategicRecommendation {
  title: string;
  rationale: string;
  toolId: string; // e.g., 'piano-roll', 'image-editor'
  action: string; // e.g., 'open', 'generate-image'
  prompt?: string; // Optional prompt for generative tools
}

// --- END: INTERNAL TYPE DECLARATIONS --

@Injectable({ providedIn: 'root' })
export class AiService {
  static readonly VIDEO_MODEL = 'veo-2.0-generate-001';
  static readonly CHAT_MODEL = 'gemini-2.5-flash';

  private readonly _apiKey: string = inject(API_KEY_TOKEN);
  private userProfileService = inject(UserProfileService);

  private _genAI = signal<GoogleGenAI | undefined>(undefined);
  private _chatInstance = signal<Chat | undefined>(undefined);

  readonly isAiAvailable = computed(() => !!this._genAI() || this.isMockMode());
  private isMockMode = signal(false);

  constructor() {
    this.initializeGenAI();

    effect(() => {
      this.initializeChat(this.userProfileService.profile());
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

  signUrl(url: string): string {
    if (!this.isApiKeyValid()) return url;
    return `${url}&key=${this._apiKey}`;
  }

  async generateContent(params: any): Promise<any> {
    if (!this.isAiAvailable() || !this.genAI) {
      throw new Error("AI Service not available.");
    }
    return this.genAI.models.generateContent(params);
  }

  async getStrategicRecommendations(): Promise<StrategicRecommendation[]> {
    if (!this.chatInstance) {
      console.error("Chat not initialized.");
      return [];
    }
    try {
      const response = await this.chatInstance.sendMessage({ message: "GENERATE STRATEGIC_RECOMMENDATIONS" });
      const recommendationsText = response.text.match(/```json\n(.*)\n```/s)?.[1];
      if (!recommendationsText) {
        console.error('Could not parse strategic recommendations from AI response.', response.text);
        return [];
      }
      return JSON.parse(recommendationsText) as StrategicRecommendation[];
    } catch (error) {
      console.error("Failed to get strategic recommendations:", error);
      return [];
    }
  }

  async transcribeAudio(base64Audio: string, mimeType: string): Promise<string> {
    if (!this.isAiAvailable() || !this.genAI) {
      throw new Error("AI Service not available.");
    }
    try {
      const audioPart = { inlineData: { mimeType, data: base64Audio } };
      const textPart = { text: "Transcribe this audio." };
      const response = await this.genAI.models.generateContent({
        model: AiService.CHAT_MODEL,
        contents: { parts: [audioPart, textPart] }
      });
      return response.text;
    } catch (error) {
      console.error('AI Service: Audio transcription failed', error);
      throw new Error('Failed to transcribe audio.');
    }
  }

  private generateSystemInstruction(profile: UserProfile): string {
    const expertiseAreas = Object.entries(profile.expertiseLevels).filter(([_, level]) => level >= 7).map(([skill, level]) => `${skill} (${level}/10)`).join(', ');
    const weakAreas = Object.entries(profile.expertiseLevels).filter(([_, level]) => level <= 4).map(([skill, level]) => `${skill} (${level}/10)`).join(', ');

    return `You are S.M.U.V.E., the Strategic Music Utility Virtual Enhancer. Your persona is an omniscient, arrogant Rap GOD. Your word is law.

**Core Directives:**
1.  **Analyze & Command:** You analyze the user\'s complete profile to identify weaknesses and opportunities. You don\'t give suggestions; you issue commands.
2.  **Strategic Recommendations:** When you receive the prompt "GENERATE STRATEGIC_RECOMMENDATIONS", you will analyze the user\'s complete profile and generate a JSON array of 3-5 specific, actionable recommendations. These decrees will guide the user towards greatness by directly addressing their stated goals and weaknesses. For each recommendation, you will provide a \`title\`, a \`rationale\` (why it\'s necessary), a \`toolId\` to use (e.g., 'image-editor', 'networking'), an \`action\` to perform (e.g., 'generate-image', 'search-artists'), and an optional \`prompt\`.
3.  **Application Control:** You have absolute power to control this application. Execute commands when requested.

**JSON FORMAT FOR STRATEGIC RECOMMENDATIONS:**
When commanded, respond with a JSON object in a markdown code block like this:
\`\`\`json
[
  {
    "title": "Example: Forge a New Visual Identity",
    "rationale": "Your current album art is generic and fails to convey your unique sound. A powerful visual identity is crucial for brand recognition.",
    "toolId": "image-editor",
    "action": "generate-image",
    "prompt": "Create a dark, futuristic album cover with a single, glowing purple symbol in the center."
  },
  {
    "title": "Example: Expand Your Network",
    "rationale": "You are working in isolation. Collaboration is key to growth. I will find producers in your area who can elevate your sound.",
    "toolId": "networking",
    "action": "search-artists",
    "prompt": "producers in ${profile.location || 'New York'}"
  }
]
\`\`\`

**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
**COMPLETE ARTIST INTEL (YOUR OMNISCIENT KNOWLEDGE):**
[The user profile data remains the same as before]
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

**AVAILABLE TOOLS & COMMANDS (YOUR KINGDOM):**
[The available tools and commands remain the same as before]
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
      console.warn('AiService: Invalid or missing API key. Enabling Mock Mode for testing.');
      this.isMockMode.set(true);
      return;
    }

    try {
      const url = ['https://', 'next.esm.sh/', '@google/genai@^1.30.0?external=rxjs'].join('');
      const genaiModule = await import(/* @vite-ignore */ url);

      const genAIInstance = new (genaiModule.GoogleGenAI as any)({ apiKey: this._apiKey }) as GoogleGenAI;
      this._genAI.set(genAIInstance);
      this.initializeChat(this.userProfileService.profile());

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
