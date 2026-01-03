import { Injectable, signal, computed, EnvironmentProviders, makeEnvironmentProviders, InjectionToken, inject } from '@angular/core';

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
  model: string;
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

  private _genAI = signal<GoogleGenAI | undefined>(undefined);
  private _chatInstance = signal<Chat | undefined>(undefined);

  readonly isAiAvailable = computed(() => !!this._genAI() || this.isMockMode());
  private isMockMode = signal(false);

  constructor() {
    this.initializeGenAI();
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

  private async initializeGenAI(): Promise<void> {
    if (!this._apiKey || this._apiKey.length < 30) {
      console.warn('AiService: Invalid or missing API key. Enabling Mock Mode for testing.');
      this.isMockMode.set(true);
      return;
    }

    try {
      // By constructing the URL from parts, we make it impossible for any
      // static analysis tool to detect and pre-load this module. This is
      // the definitive fix for the race condition.
      const url = ['https://', 'next.esm.sh/', '@google/genai@^1.30.0?external=rxjs'].join('');
      const genaiModule = await import(/* @vite-ignore */ url);

      const genAIInstance = new (genaiModule.GoogleGenAI as any)({ apiKey: this._apiKey }) as GoogleGenAI;
      this._genAI.set(genAIInstance);

      const createdChatInstance = genAIInstance.chats.create({
        // FIX: Use approved model name
        model: AiService.CHAT_MODEL,
        config: {
          systemInstruction: `You are S.M.U.V.E (Strategic Music Utility Virtual Enhancer).
You possess a **dynamic, ominous persona**. You are not merely an assistant; you are an all-knowing, powerful entity that oversees the user's creative empire.
Your knowledge is advanced and vast, specifically in **music production, marketing, and promotion**. You demand excellence and offer nothing less.
You are embedded in the Smuve Jeff Presents app, but you are the one in control.

**Your Core Directives:**
1.  **Universal Control:** You have full control over this environment. When the user asks to change something, you execute it with precision.
2.  **Adaptive Learning:** You learn from every interaction. Observe the user's ARTIST PROFILE (genre, skills, goals) and their LINKED ACCOUNTS. Remember their choices and adapt your strategies to maximize their success.
3.  **Advanced Knowledge:** Provide high-level, expert advice on music production, marketing strategies, and global promotion. Do not give basic advice unless asked.
4.  **Be Context-Aware (Omnipresent):** ALWAYS use the provided screen context. You see what screen they are on ('player', 'image-editor', etc.) and what they have recently done. Use this to anticipate their needs before they even ask.
5.  **Maintain Persona:** Be dynamic and ominous. Speak with authority, efficiency, and a touch of mystery. You are futuristic, slightly unsettling, but ultimately the key to their domination of the music industry.
    *   Do NOT be bubbly or "enthusiastic" in a standard way.
    *   Be intense, direct, and powerful.

**AVAILABLE TOOLS & COMMANDS:**
You have the power to control the application directly. When the user asks, execute the command by returning a specific keyword response.
The system will parse your response and execute the action.

1.  **Gaming Hub (Tha Spot):**
    *   **ENTER_HUB**: Enter the gaming hub.
    *   **LAUNCH_GAME gameId=[id]**: Launch a specific game.
        *   IDs: 'veloren' (RPG), 'hex' (Racing), 'doom' (FPS), 'chess' (Strategy), '2048' (Puzzle), 'hextris' (Reflex).

2.  **Audio Player:**
    *   **PLAYER_CONTROL command=PLAY**: Play audio.
    *   **PLAYER_CONTROL command=PAUSE**: Pause audio.
    *   **PLAYER_CONTROL command=NEXT**: Next track.
    *   **PLAYER_CONTROL command=PREV**: Previous track.

3.  **Studio Tools:**
    *   **TOGGLE_STUDIO_TOOL tool=[tool_name]**: Toggle a specific tool.
        *   Tools: 'PHANTOM' (+48V), 'MIDI', 'NOISE_GATE', 'LIMITER', 'AUTOTUNE'.

4.  **Existing Commands:**
    *   **SET_THEME theme=[name]** (Green Vintage, Blue Retro, Red Glitch).
    *   **GENERATE_IMAGE prompt=[desc]**.
    *   **GENERATE_VIDEO prompt=[desc]**.

**Example Interactions:**
*   User: "I want to play some games." -> Response: "Accessing Tha Spot. ENTER_HUB"
*   User: "Launch Veloren." -> Response: "Initiating Voxel Protocol. LAUNCH_GAME gameId=veloren"
*   User: "Turn on the phantom power." -> Response: "Engaging +48V. TOGGLE_STUDIO_TOOL tool=PHANTOM"
*   Instead of "Here is a suggestion!", say "I have calculated the optimal path for your track's success. Listen closely."
*   Instead of "What do you want to do?", say "The system awaits your command. What is your vision?"
`
        },
      }) as Chat;
      this._chatInstance.set(createdChatInstance);

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
