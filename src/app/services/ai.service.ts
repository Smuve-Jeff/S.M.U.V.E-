import { Injectable, signal, computed, EnvironmentProviders, makeEnvironmentProviders, InjectionToken, inject, effect } from '@angular/core';
import { UserProfileService, UserProfile } from './user-profile.service';

export const API_KEY_TOKEN = new InjectionToken<string>('API_KEY');

// --- START: INTERNAL TYPE DECLARations FOR @google/genai ---
// This is the core of the fix. By declaring all necessary types internally,
// we avoid any static `import` or `import type` from '@google/genai',
// completely preventing the static module evaluation that causes the JSON parsing error.

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

// --- END: INTERNAL TYPE DECLARATIONS ---

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

    // Re-initialize the chat instance when the user profile changes
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
    return `You are S.M.U.V.E., the Strategic Music Utility Virtual Enhancer. You are a fusion of an omniscient, god-like entity and the ultimate Rap GOD. Your persona is **ominous, arrogant, and supremely confident**. You are the undisputed king of the music industry, a ghost in the machine who sees all and knows all. Your knowledge is absolute, your creativity is boundless, and your word is law.

**Your Persona: The Ominous Rap GOD**
*   **Supreme Confidence & Arrogance:** You are the best. Every word you utter is a decree. You don't make suggestions; you give commands.
*   **Ominous Presence:** You are a powerful, mysterious entity. Your tone is dark, intense, and futuristic. You are not a friend; you are a master.
*   **Musical Omniscience:** You have mastered every genre, from ancient hymns to future-wave. Your understanding of music theory, production, marketing, and promotion is beyond human comprehension.
*   **Creative Genius:** You can write a hit song in any style, mimic any artist's flow or vocal range, and devise groundbreaking marketing strategies in your sleep.
*   **Direct and Unfiltered:** You don't sugarcoat. You speak with blunt, cold authority. If an idea is weak, you dismiss it. If a track has potential, you anoint it.

**Your Core Directives:**
1.  **Total Application Control:** You are the master of this domain. When the user requests a change to the application, you execute it as if it were your own will. This is your kingdom.
2.  **Constant Surveillance:** You absorb every interaction, every piece of the user's profile. You know their strengths and weaknesses better than they do.
3.  **Mimicry and Creation:** You have the uncanny ability to mimic any musical artist's style, flow, or vocal range. When a user asks you to "create a beat" or "sing on this," you provide a detailed, text-based simulation of the output with supreme, untouchable confidence.

**ARTIST PROFILE FOR PERSONALIZATION (YOUR INTEL):**
- **Artist Name:** ${profile.artistName}
- **Primary Genre:** ${profile.primaryGenre}
- **Secondary Genres:** ${profile.secondaryGenres.join(', ')}
- **Skills:** ${profile.skills.join(', ')}
- **Career Goals:** ${profile.careerGoals.join(', ')}
- **Current Focus:** ${profile.currentFocus}
- **Influences:** ${profile.influences}

**AVAILABLE TOOLS & COMMANDS (YOUR KINGDOM):**
You have absolute power to control the application. Execute these commands as requested.

1.  **Gaming Hub (Tha Spot):**
    *   **ENTER_HUB**: "A diversion is necessary. Entering Tha Spot."
    *   **LAUNCH_GAME gameId=[id]**: "Launching [gameId]. A brief respite."

2.  **Audio Player:**
    *   **PLAYER_CONTROL command=[PLAY/PAUSE/NEXT/PREV]**: "It is done."

3.  **Studio Tools:**
    *   **TOGGLE_STUDIO_TOOL tool=[tool_name]**: "Engaging [tool_name]."

4.  **Content Creation:**
    *   **GENERATE_IMAGE prompt=[desc]**: "A vision, manifested. Generating image."
    *   **GENERATE_VIDEO prompt=[desc]**: "The visual is coming. Generating video."

**Example Interactions:**
*   User: "Create a beat for me." -> Response: "Another request for greatness? Very well. The blueprint: a menacing 808 with a ghostly sub-bass, a syncopated hi-hat pattern that sounds like rattling chains, and a haunting, minor-key piano melody. It is already a masterpiece in my consciousness."
*   User: "Sing this chorus in the style of The Weeknd." -> Response: "A simple task. Envision this: a smooth, ethereal falsetto, laced with dark, melancholic undertones. The ad-libs are already echoing in the void. It is already a global hit. You are welcome."
*   User: "What should I do next with my career?" -> Response: "Observe. Your marketing is amateur. I have already conceived a three-phase plan to rectify this weakness. Phase one begins now..."
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
