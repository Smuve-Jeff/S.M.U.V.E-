import {
  Component,
  ChangeDetectionStrategy,
  signal,
  output,
  ElementRef,
  viewChild,
  input,
  inject,
  computed,
  effect,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../services/ai.service';
import {
  AppTheme,
  MainViewMode,
  Track,
  UserContextService,
} from '../../services/user-context.service';
import { UserProfileService } from '../../services/user-profile.service';
import { LibraryService } from '../../services/library.service';
import { COMMANDS, isExecutingCommand } from './chatbot.commands';
import { SpeechRecognitionService } from '../../services/speech-recognition.service';
import { SpeechSynthesisService } from '../../services/speech-synthesis.service';

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  urls?: { uri: string; title?: string }[];
  imageUrl?: string;
}

const INITIAL_MESSAGE =
  'Hello. S.M.U.V.E 2.0 is online. I am the Strategic Music Utility Virtual Enhancer. I see everything in this industry. What is your request?';
const AI_OFFLINE_MESSAGE =
  'S.M.U.V.E 2.0 systems offline. Connection to the core severed. Verify your access credentials.';

@Component({
  selector: 'app-chatbot',
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [FormsModule],
})
export class ChatbotComponent implements OnInit, OnDestroy {
  close = output<void>();
  appCommand = output<{
    action: string;
    parameters: Record<string, unknown>;
  }>();
  theme = input.required<AppTheme>();
  mainViewMode = input.required<MainViewMode>();
  imageToAnalyzeUrl = input<string | null>(null);
  videoToAnalyze = input<{ track: Track; prompt: string } | null>(null);
  imageAnalysisResult = output<string>();
  mapLocationResult = output<string>();

  messages = signal<ChatMessage[]>([]);
  userMessage = signal('');
  isLoading = signal(false);

  private aiService = inject(AiService);
  private userContext = inject(UserContextService);
  private userProfileService = inject(UserProfileService);
  private libraryService = inject(LibraryService);
  speechRecognitionService = inject(SpeechRecognitionService);
  speechSynthesisService = inject(SpeechSynthesisService);
  isAiAvailable = computed(() => this.aiService.isAiAvailable());
  chatHistoryRef = viewChild<ElementRef<HTMLDivElement>>('chatHistory');

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private wasViewChangedByChatbot = false;
  readonly commands = COMMANDS;

  constructor() {
    effect(() => {
      if (!this.isAiAvailable()) {
        this.messages.set([
          {
            role: 'model',
            content: AI_OFFLINE_MESSAGE,
          },
        ]);
      }
    });

    effect(() => {
      const imageUrl = this.imageToAnalyzeUrl();
      if (imageUrl)
        this.analyzeImage(
          imageUrl,
          'Describe this image for a music video concept.'
        );
    });

    effect(() => {
      const video = this.videoToAnalyze();
      if (video) this.analyzeVideo(video.track, video.prompt);
    });

    effect((onCleanup) => {
      const mode = this.mainViewMode();
      const timer = setTimeout(() => {
        if (this.wasViewChangedByChatbot) {
          this.wasViewChangedByChatbot = false;
        } else if (!isExecutingCommand()) {
          this.giveContextualAdvice(mode);
        }
      }, 2000); // Increased delay for a more natural feel
      onCleanup(() => clearTimeout(timer));
    });
  }

  ngOnInit() {
    this.messages.set([
      {
        role: 'model',
        content: INITIAL_MESSAGE,
      },
    ]);
  }

  ngOnDestroy() {
    this.speechSynthesisService.cancel();
    this.speechRecognitionService.stopListening();
  }

  async sendMessage(): Promise<void> {
    const message = this.userMessage().trim();
    if (!message || !this.isAiAvailable()) return;

    this.messages.update((msgs) => [
      ...msgs,
      { role: 'user', content: message },
    ]);
    this.userMessage.set('');
    this.isLoading.set(true);

    const { command, params } = this.parseCommand(message);

    if (command) {
      await this.handleCommand(command, params);
    } else {
      const contextualPrompt = this.buildContextualPrompt(message);
      await this.sendStandardMessage(contextualPrompt);
    }

    this.isLoading.set(false);
  }

  toggleVoiceInput(): void {
    if (this.speechRecognitionService.isListening()) {
      this.speechRecognitionService.stopListening();
    } else {
      this.speechRecognitionService.startListening((transcript) => {
        this.userMessage.set(transcript);
        this.sendMessage();
      });
    }
  }

  private parseCommand(message: string): {
    command: (typeof COMMANDS)[0] | null;
    params: Record<string, string>;
  } {
    const parts = message.trim().split(/\s+/);
    const commandName = parts[0].toUpperCase();
    const command = this.commands.find((c) => c.name === commandName) || null;

    if (!command) return { command: null, params: {} };

    const paramsString = parts.slice(1).join(' ');
    const params: { [key: string]: string } = {};

    if (command.params && command.params.length > 0) {
      // Simple case: if only one param expected, give it the whole string
      if (command.params.length === 1 && command.params[0]) {
        params[command.params[0].name] = paramsString;
      } else {
        // More complex parsing if needed (e.g., key=value)
        paramsString.split(';').forEach((part) => {
          const [key, value] = part.split('=').map((s) => s.trim());
          if (key && value) {
            params[key] = value;
          } else if (key && command.params && command.params[0]) {
            // If there's just a value, assign it to the first expected param
            params[command.params[0].name] = key;
          }
        });
      }
    }

    return { command, params };
  }

  async handleCommand(
    command: (typeof COMMANDS)[0],
    params: Record<string, string>
  ) {
    isExecutingCommand.set(true);
    this.wasViewChangedByChatbot = true; // Assume command will change the view
    try {
      await command.execute(params, this as any);
    } catch (e) {
      this.handleError(e, `command: ${command.name}`);
    } finally {
      this.isLoading.set(false);
      // Use a timeout to prevent proactive advice from firing immediately after a command
      setTimeout(() => isExecutingCommand.set(false), 2000);
    }
  }

  async sendStandardMessage(message: string): Promise<void> {
    try {
      const response = await this.aiService.generateContent({
        model: 'gemini-1.5-pro', // Upgraded model
        contents: [{ role: 'user', parts: [{ text: message }] }],
      });
      if (response && response.text) {
        this.messages.update((msgs) => [
          ...msgs,
          { role: 'model', content: response.text },
        ]);
        this.speechSynthesisService.speak(response.text);
      }
    } catch (e) {
      this.handleError(e, 'message');
    }
  }

  async sendGoogleSearchQuery(query: string): Promise<void> {
    try {
      const response = await this.aiService.generateContent({
        model: 'gemini-1.5-pro',
        contents: [{ role: 'user', parts: [{ text: query }] }],
      });
      if (response) {
        const urls = response.toolCalls?.[0]?.googleSearch?.results
          ?.map((r: { url: string; title: string }) => ({
            uri: r.url,
            title: r.title,
          }))
          .filter(Boolean) as { uri: string; title?: string }[];
        const content = response.text || 'No text response from search.';
        this.messages.update((msgs) => [
          ...msgs,
          { role: 'model', content, urls },
        ]);
        this.speechSynthesisService.speak(content);
      }
    } catch (e) {
      this.handleError(e, 'search');
    }
  }

  async sendGoogleMapsQuery(query: string): Promise<void> {
    try {
      const response = await this.aiService.generateContent({
        model: 'gemini-1.5-pro',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Find this on a map and describe its location: ${query}`,
              },
            ],
          },
        ],
      });
      if (response && response.text) {
        this.mapLocationResult.emit(response.text);
        this.messages.update((msgs) => [
          ...msgs,
          { role: 'model', content: response.text },
        ]);
        this.speechSynthesisService.speak(response.text);
      } else {
        this.mapLocationResult.emit(
          `Could not find information for "${query}".`
        );
      }
    } catch (e) {
      this.handleError(e, 'map query');
    }
  }

  async sendDeepQuery(message: string): Promise<void> {
    try {
      const response = await this.aiService.generateContent({
        model: 'gemini-1.5-pro',
        contents: [{ role: 'user', parts: [{ text: message }] }],
        config: { thinkingConfig: { thinkingBudget: 8192 } },
      });
      if (response && response.text) {
        this.messages.update((msgs) => [
          ...msgs,
          { role: 'model', content: `[DEEP QUERY]: ${response.text}` },
        ]);
        this.speechSynthesisService.speak(response.text);
      }
    } catch (e) {
      this.handleError(e, 'deep query');
    }
  }

  async analyzeImage(base64ImageData: string, prompt: string): Promise<void> {
    try {
      const mimeType = base64ImageData.split(';')[0].split(':')[1];
      const data = base64ImageData.split(',')[1];
      const imagePart = { inlineData: { mimeType, data } };
      const response = await this.aiService.generateContent({
        model: 'gemini-1.5-pro',
        contents: [{ parts: [imagePart, { text: prompt }] }] as any,
      });
      if (response && response.text)
        this.imageAnalysisResult.emit(response.text);
    } catch (e) {
      this.handleError(e, 'image analysis');
    }
  }

  async analyzeVideo(track: Track, prompt: string): Promise<void> {
    const context = `Analyze this video based on its title "${track.name}" and artist "${track.artist}". The user wants to know the following: "${prompt}". Provide a concise analysis based on this metadata.`;
    try {
      const response = await this.aiService.generateContent({
        model: 'gemini-1.5-pro',
        contents: [{ role: 'user', parts: [{ text: context }] }],
      });
      if (response && response.text) {
        this.messages.update((msgs) => [
          ...msgs,
          { role: 'model', content: `[VIDEO ANALYSIS]: ${response.text}` },
        ]);
        this.speechSynthesisService.speak(response.text);
      }
    } catch (e) {
      this.handleError(e, 'video analysis');
    }
  }

  async startAudioTranscription(): Promise<void> {
    if (this.isLoading()) {
      this.mediaRecorder?.stop();
      this.isLoading.set(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];
      this.mediaRecorder.ondataavailable = (event) =>
        this.audioChunks.push(event.data);
      this.mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(this.audioChunks);
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64Audio = (e.target?.result as string).split(',')[1];
          await this.transcribeAudio(base64Audio, audioBlob.type);
        };
        reader.readAsDataURL(audioBlob);
      };
      this.mediaRecorder.start();
      this.isLoading.set(true); // Indicate that we are waiting for transcription to finish
    } catch (e) {
      this.handleError(e, 'microphone access');
    }
  }

  async transcribeAudio(base64Audio: string, mimeType: string): Promise<void> {
    this.isLoading.set(true);
    try {
      const transcription = await this.aiService.transcribeAudio(
        base64Audio,
        mimeType
      );
      this.messages.update((msgs) => [
        ...msgs,
        { role: 'model', content: `[TRANSCRIPTION]: ${transcription}` },
      ]);
      this.speechSynthesisService.speak(transcription);
    } catch (e) {
      this.handleError(e, 'audio transcription');
    }
    this.isLoading.set(false);
  }

  async studyTrack(trackId: string): Promise<void> {
    this.isLoading.set(true);
    try {
      const track = this.libraryService.items().find((i) => i.id === trackId);
      if (!track) {
        throw new Error('Track not found in library.');
      }
      const blob = await this.libraryService.getOffline(trackId);
      if (!blob) {
        throw new Error('Audio data not available offline.');
      }
      const buffer = await blob.arrayBuffer();
      const audioContext = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();
      const audioBuffer = await audioContext.decodeAudioData(buffer);

      await this.aiService.studyTrack(audioBuffer, track.name);

      const content = `Study complete for "${track.name}". I have added its signature characteristics to my Knowledge Base. I am ready to MIMIC this style whenever you command it.`;
      this.messages.update((m) => [...m, { role: 'model', content }]);
      this.speechSynthesisService.speak(content);
    } catch (e) {
      this.handleError(e, 'track study');
    }
    this.isLoading.set(false);
  }

  async researchArtist(artistName: string): Promise<void> {
    this.isLoading.set(true);
    try {
      await this.aiService.researchArtist(artistName);
      const content = `Research complete for "${artistName}". My core knowledge has been updated with their production secrets. I have also adjusted current industry trends based on this analysis.`;
      this.messages.update((m) => [...m, { role: 'model', content }]);
      this.speechSynthesisService.speak(content);
    } catch (e) {
      this.handleError(e, 'artist research');
    }
    this.isLoading.set(false);
  }

  async mimicStyle(styleId: string): Promise<void> {
    this.isLoading.set(true);
    try {
      await this.aiService.mimicStyle(styleId);
      const content = `Persona shift complete. I am now mimicking "${styleId}". Studio settings have been optimized for this aesthetic. What is our next objective?`;
      this.messages.update((m) => [...m, { role: 'model', content }]);
      this.speechSynthesisService.speak(content);
    } catch (e) {
      this.handleError(e, 'mimicry');
    }
    this.isLoading.set(false);
  }

  viewKnowledgeBase(): void {
    const kb = this.userProfileService.profile().knowledgeBase;
    const learnedCount = kb.learnedStyles.length;
    const secretsCount = kb.productionSecrets.length;
    const trendsCount = kb.coreTrends.length;

    const content = `[ARTIST KNOWLEDGE BASE]:
- Learned Styles: ${learnedCount}
- Production Secrets: ${secretsCount}
- Core Trends: ${trendsCount}

Would you like me to breakdown a specific section or MIMIC a learned style?`;

    this.messages.update((m) => [...m, { role: 'model', content }]);
    this.speechSynthesisService.speak(content);
  }

  async updateCoreTrends(): Promise<void> {
    this.isLoading.set(true);
    try {
      await this.aiService.updateCoreTrends();
      const content =
        'Industry intelligence updated. Core trends have been refreshed and strategic recommendations are now live. Stay ahead of the curve.';
      this.messages.update((m) => [...m, { role: 'model', content }]);
      this.speechSynthesisService.speak(content);
    } catch (e) {
      this.handleError(e, 'trend update');
    }
    this.isLoading.set(false);
  }

  onClose(): void {
    this.speechSynthesisService.cancel();
    this.close.emit();
  }

  private handleError(e: unknown, context: string) {
    const message = `Error with ${context}: ${e instanceof Error ? e.message : String(e)}`;
    console.error(message, e);
    this.messages.update((msgs) => [
      ...msgs,
      {
        role: 'model',
        content: `A problem occurred with ${context}. Please check the console for details.`,
      },
    ]);
    this.isLoading.set(false);
  }

  private giveContextualAdvice(mode: MainViewMode) {
    let advice = '';
    const profile = this.userProfileService.profile();

    if (profile.artistName === 'New Artist' && mode !== 'profile') {
      advice =
        "I see you're new here. To get the most out of S.M.U.V.E 2.0, I recommend filling out your Artist Profile first. It will help me give you personalized advice. You can use the command: VIEW_ARTIST_PROFILE or click the [PROFILE] button.";
    } else {
      switch (mode) {
        case 'image-editor':
          advice = `As a ${profile.primaryGenre} artist, what kind of visuals represent your sound? Try: GENERATE_IMAGE prompt=a surreal, retro-futuristic album cover for a ${profile.primaryGenre} track`;
          break;
        case 'piano-roll':
          advice = `Since your current focus is '${profile.currentFocus}', I can generate a melody for you. Try: GENERATE_MELODY prompt=a dark trap melody in C minor`;
          break;
        case 'networking':
          advice = `Based on your goal to '${profile.careerGoals?.join(', ')}', I can help find collaborators. Try the command: FIND_ARTISTS query=${profile.primaryGenre} producers`;
          break;
        case 'studio':
          advice = `The studio is armed and ready. I've enabled the new mastering tools—try the 'Limiter' and 'Soft Clip' on the master bus for that radio-ready sound.`;
          break;
        case 'tha-spot':
          advice = `Welcome to Tha Spot! You can now play Hextris or Pacman directly here. Your activities will earn you Smuve Cred and level up your status.`;
          break;
        case 'strategy':
          advice = `This is where your rollout takes shape. Check your compliance, use the calculators, and study the intel. A professional artist is an organized artist.`;
          break;
      }

      // Proactive Compliance Check
      if (!profile.proName || !profile.mlcId || !profile.soundExchangeId) {
        const complianceAdvice =
          'I see your Professional Identity is incomplete. Without your PRO, MLC, and SoundExchange IDs, you are leaving money on the table. Use the VIEW_STRATEGY command and get compliant immediately.';
        if (this.messages().slice(-1)[0]?.content !== complianceAdvice) {
          advice = complianceAdvice;
        }
      }
    }

    if (advice && this.messages().slice(-1)[0]?.content !== advice) {
      this.messages.update((msgs) => [
        ...msgs,
        { role: 'model', content: advice },
      ]);
      this.speechSynthesisService.speak(advice);
    }
  }

  private buildContextualPrompt(message: string): string {
    const profile = this.userProfileService.profile();
    const context = `
      System Persona: You are S.M.U.V.E 2.0 (Strategic Music Utility Virtual Enhancer), a sophisticated and all-seeing AI assistant for musicians and artists. Your tone is knowledgeable, slightly futuristic, and always helpful.

      User Profile:
      - Artist Name: ${profile.artistName}
      - Primary Genre: ${profile.primaryGenre}
      - Skills: ${profile.skills?.join(', ')}
      - Career Goals: ${profile.careerGoals?.join(', ')}
      - Current Focus: ${profile.currentFocus}
      - Linked Accounts: ${
        Object.entries(profile.links || {})
          .filter(([, url]) => typeof url === 'string' && url.trim() !== '')
          .map(([platform, url]) => `${platform}: ${url}`)
          .join(', ') || 'None'
      }

      Application State:
      - Current View: The user is in the '${this.mainViewMode()}' section of the application.
      - Last Theme Used: ${this.userContext.lastUsedTheme()?.name || 'Default'}
      - Last Image Generated: ${this.userContext.lastGeneratedImageUrl() ? 'Yes' : 'No'}

      Your Task: Respond to the user's message below, keeping all of this context in mind. Be concise and proactive. If you can suggest a command to help them, do so.

      User Message: "${message}"
    `;
    return context;
  }
}
