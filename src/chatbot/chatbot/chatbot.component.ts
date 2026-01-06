import { Component, ChangeDetectionStrategy, signal, output, ElementRef, viewChild, input, inject, computed, effect, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiService, GenerateContentResponse, Content, Type, Tool } from '../../services/ai.service';
// FIX: Update AppTheme and Track imports to break circular dependency
import { AppTheme, MainViewMode, Track, UserContextService } from '../../services/user-context.service';
import { UserProfileService } from '../../services/user-profile.service';

// Type declarations for browser APIs
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}
interface SpeechRecognitionResultList { [index: number]: { [index: number]: { transcript: string; }; }; length: number; }

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  urls?: { uri: string; title?: string }[];
  imageUrl?: string;
}

@Component({
  selector: 'app-chatbot',
  standalone: true,
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.css'],
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatbotComponent implements OnInit, OnDestroy {
  close = output<void>();
  appCommand = output<{ action: string; parameters: any; }>();
  theme = input.required<AppTheme>();
  mainViewMode = input.required<MainViewMode>();
  imageToAnalyzeUrl = input<string | null>(null);
  videoToAnalyze = input<{ track: Track, prompt: string } | null>(null);
  imageAnalysisResult = output<string>();
  mapLocationResult = output<string>();

  messages = signal<ChatMessage[]>([]);
  userMessage = signal('');
  isLoading = signal(false);
  isVoiceInputActive = signal(false);
  isSpeaking = signal(false);
  isDeepQueryActive = signal(false);
  isTranscribing = signal(false);

  private aiService = inject(AiService);
  private userContext = inject(UserContextService);
  private userProfileService = inject(UserProfileService);
  // FIX: A computed signal's value must be read by calling it as a function.
  isAiAvailable = computed(() => this.aiService.isAiAvailable());
  chatHistoryRef = viewChild<ElementRef<HTMLDivElement>>('chatHistory');
  private speechRecognition: any;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private utterance: SpeechSynthesisUtterance | null = null;
  private wasViewChangedByChatbot = false;

  constructor() {
    this.initializeSpeechRecognition();
    effect(() => {
      if (!this.isAiAvailable()) {
        this.messages.set([{ role: 'model', content: 'S.M.U.V.E. systems offline. Connection to the core severed. Verify your access credentials.' }]);
      }
    }, { allowSignalWrites: true });
    effect(() => {
      const imageUrl = this.imageToAnalyzeUrl();
      if (imageUrl) this.analyzeImage(imageUrl, 'Describe this image for a music video concept.');
    });
    effect(() => {
      const video = this.videoToAnalyze();
      if(video) this.analyzeVideo(video.track, video.prompt);
    });

    effect((onCleanup) => {
      const mode = this.mainViewMode();
      const timer = setTimeout(() => {
        if (this.wasViewChangedByChatbot) {
          this.wasViewChangedByChatbot = false;
        } else {
          this.giveContextualAdvice(mode);
        }
      }, 1000);
      onCleanup(() => clearTimeout(timer));
    }, { allowSignalWrites: true });
  }

  ngOnInit() {
    this.messages.set([{ role: 'model', content: "S.M.U.V.E. online. I see everything. What is your request?" }]);
  }

  ngOnDestroy() {
    this.stopSpeaking();
    this.stopVoiceInput();
  }

  private initializeSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(SpeechRecognition) {
      this.speechRecognition = new SpeechRecognition();
      this.speechRecognition.onresult = (event: { results: SpeechRecognitionResultList; }) => {
        this.userMessage.set(event.results[0][0].transcript);
        this.sendMessage();
      };
      this.speechRecognition.onend = () => this.isVoiceInputActive.set(false);
    }
  }

  async sendMessage(): Promise<void> {
    const message = this.userMessage().trim();
    if (!message || !this.isAiAvailable()) return;

    this.messages.update(msgs => [...msgs, { role: 'user', content: message }]);
    this.userMessage.set('');
    this.isLoading.set(true);

    const contextualPrompt = this.buildContextualPrompt(message);

    const command = this.parseCommand(message);
    if(command) {
      await this.handleCommand(command.action, command.params, contextualPrompt);
    } else {
      await this.sendStandardMessage(contextualPrompt);
    }

    this.isLoading.set(false);
  }

  private parseCommand(message: string): { action: string, params: string } | null {
    const trimmedMessage = message.trim();
    const parts = trimmedMessage.split(/\s+/);
    const firstWord = parts[0].toUpperCase();

    // A list of known commands to check against for more reliable parsing.
    const KNOWN_COMMANDS = [
        'SEARCH', 'DEEP', 'TRANSCRIBE', 'MAP', 'FIND_ON_MAP',
        'SET_THEME', 'GENERATE_IMAGE', 'GENERATE_VIDEO', 'ANALYZE_IMAGE',
        'ANALYZE_VIDEO', 'FIND_ARTISTS', 'VIEW_ARTIST_PROFILE',
        'ENTER_HUB', 'LAUNCH_GAME', 'PLAYER_CONTROL', 'TOGGLE_STUDIO_TOOL'
    ];

    if (KNOWN_COMMANDS.includes(firstWord)) {
        const params = parts.slice(1).join(' ');
        return { action: firstWord, params: params };
    }

    return null;
  }

  async handleCommand(action: string, params: string, contextualPrompt: string) {
    switch(action) {
      case 'SEARCH': await this.sendGoogleSearchQuery(contextualPrompt); break;
      case 'DEEP': await this.sendDeepQuery(contextualPrompt); break;
      case 'TRANSCRIBE': await this.startAudioTranscription(); this.isLoading.set(false); break;
      case 'MAP':
      case 'FIND_ON_MAP': await this.sendGoogleMapsQuery(params); break;
      default:
        this.wasViewChangedByChatbot = true;
        this.appCommand.emit({ action, parameters: { ...this.parseParams(params) } });
        this.isLoading.set(false);
        break;
    }
  }

  private parseParams(paramString: string): any {
    const params: { [key: string]: any } = {};
    if (!paramString) return params;

    paramString.split(';').forEach(part => {
        const [key, value] = part.split('=').map(s => s.trim());
        if (key && value) {
            params[key] = value;
        } else if (key) {
            params['prompt'] = key;
        }
    });
    // If no params were parsed but there's a string, treat it as the main query/prompt
    if (Object.keys(params).length === 0 && paramString) {
      params['query'] = paramString; // for map
      params['location'] = paramString; // for artists
      params['name'] = paramString; // for artist profile
    }
    return params;
  }

  async sendStandardMessage(message: string): Promise<void> {
    try {
      const response = await this.aiService.chatInstance?.sendMessage({ message });
      if (response) {
        this.messages.update(msgs => [...msgs, { role: 'model', content: response.text }]);
        this.speakResponse(response.text);
      }
    } catch (e) { this.handleError(e, 'message'); }
  }

  async sendGoogleSearchQuery(query: string): Promise<void> {
    try {
      const response = await this.aiService.genAI?.models.generateContent({
        model: 'gemini-2.5-flash', contents: query, config: { tools: [{ googleSearch: {} }] }
      });
      if (response) {
        const urls = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map(c => c.web && c.web.uri ? { uri: c.web.uri, title: c.web.title } : undefined).filter(Boolean) as { uri: string, title?: string }[];
        this.messages.update(msgs => [...msgs, { role: 'model', content: response.text, urls }]);
        this.speakResponse(response.text);
      }
    } catch (e) { this.handleError(e, 'search'); }
  }

  async sendGoogleMapsQuery(query: string): Promise<void> {
    try {
      const response = await this.aiService.genAI?.models.generateContent({
        model: 'gemini-2.5-flash', contents: `Find this on a map and describe its location: ${query}`, config: { tools: [{ googleMaps: {} }] }
      });
      if (response) this.mapLocationResult.emit(response.text);
      else this.mapLocationResult.emit(`Could not find information for "${query}".`);
    } catch (e) { this.handleError(e, 'map query'); }
  }

  async sendDeepQuery(message: string): Promise<void> {
    try {
      const response = await this.aiService.genAI?.models.generateContent({
        model: 'gemini-2.5-flash', contents: message, config: { thinkingConfig: { thinkingBudget: 8192 } }
      });
      if (response) {
        this.messages.update(msgs => [...msgs, { role: 'model', content: `[DEEP QUERY]: ${response.text}` }]);
        this.speakResponse(response.text);
      }
    } catch (e) { this.handleError(e, 'deep query'); }
  }

  async analyzeImage(base64ImageData: string, prompt: string): Promise<void> {
    try {
      const mimeType = base64ImageData.split(';')[0].split(':')[1];
      const data = base64ImageData.split(',')[1];
      const imagePart: Content = { inlineData: { mimeType, data } };
      const response = await this.aiService.genAI?.models.generateContent({
        model: 'gemini-2.5-flash', contents: { parts: [imagePart, { text: prompt }] }
      });
      if(response) this.imageAnalysisResult.emit(response.text);
    } catch (e) { this.handleError(e, 'image analysis'); }
  }

  async analyzeVideo(track: Track, prompt: string): Promise<void> {
    const context = `Analyze this video based on its title "${track.name}" and artist "${track.artist}". The user wants to know the following: "${prompt}". Provide a concise analysis based on this metadata.`;
    try {
      const response = await this.aiService.genAI?.models.generateContent({
        model: 'gemini-2.5-flash', contents: context
      });
      if(response) {
        this.messages.update(msgs => [...msgs, { role: 'model', content: `[VIDEO ANALYSIS]: ${response.text}` }]);
        this.speakResponse(response.text);
      }
    } catch (e) { this.handleError(e, 'video analysis'); }
  }

  async startAudioTranscription(): Promise<void> {
    if (this.isTranscribing()) {
      this.mediaRecorder?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];
      this.mediaRecorder.ondataavailable = event => this.audioChunks.push(event.data);
      this.mediaRecorder.onstop = async () => {
        this.isTranscribing.set(false);
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(this.audioChunks);
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64Audio = (e.target?.result as string).split(',')[1];
          await this.transcribeAudio(base64Audio, audioBlob.type);
        };
        reader.readAsDataURL(audioBlob);
      };
      this.mediaRecorder.start();
      this.isTranscribing.set(true);
    } catch (e) { this.handleError(e, "microphone access"); }
  }

  async transcribeAudio(base64Audio: string, mimeType: string): Promise<void> {
    this.isLoading.set(true);
    try {
      const transcription = await this.aiService.transcribeAudio(base64Audio, mimeType);
      this.messages.update(msgs => [...msgs, { role: 'model', content: `[TRANSCRIPTION]: ${transcription}` }]);
      this.speakResponse(transcription);
    } catch (e) { this.handleError(e, "audio transcription"); }
    this.isLoading.set(false);
  }

  toggleVoiceInput(): void { if(this.isVoiceInputActive()) this.stopVoiceInput(); else this.startVoiceInput(); }
  startVoiceInput(): void { if (this.speechRecognition) { this.isVoiceInputActive.set(true); this.speechRecognition.start(); } }
  stopVoiceInput(): void { if (this.speechRecognition) { this.isVoiceInputActive.set(false); this.speechRecognition.stop(); } }

  speakResponse(text: string): void {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) return;
    this.stopSpeaking();
    this.utterance = new SpeechSynthesisUtterance(text);
    this.utterance.onstart = () => this.isSpeaking.set(true);
    this.utterance.onend = () => this.isSpeaking.set(false);
    this.utterance.onerror = () => this.isSpeaking.set(false);
    window.speechSynthesis.speak(this.utterance);
  }

  stopSpeaking(): void {
    if (window.speechSynthesis?.speaking) window.speechSynthesis.cancel();
  }

  onClose(): void { this.stopSpeaking(); this.close.emit(); }

  private handleError(e: any, context: string) {
    const message = `Error with ${context}: ${e instanceof Error ? e.message : String(e)}`;
    this.messages.update(msgs => [...msgs, { role: 'model', content: message }]);
    this.isLoading.set(false);
  }

  private giveContextualAdvice(mode: MainViewMode) {
    let advice = '';
    const lastTheme = this.userContext.lastUsedTheme();
    const lastImage = this.userContext.lastGeneratedImageUrl();
    const profile = this.userProfileService.profile();

    if (profile.artistName === 'New Artist' && mode !== 'profile') {
        advice = "Welcome to Smuve Jeff Presents! I see you're new here. I recommend starting by filling out your Artist Profile. It will help me give you the best, personalized advice on your musical journey. Just click the [PROFILE] button in the header.";
    } else {
        switch(mode) {
            case 'image-editor':
                advice = `Image Lab activated. As a ${profile.primaryGenre} artist, what kind of visuals fit your sound? ${lastTheme ? `That '${lastTheme.name}' theme could be a great starting point.` : ''}`;
                break;
            case 'video-editor':
                advice = `Now in the Video Lab. ${lastImage ? 'We could animate the last image you generated. ' : ''}Ready to make some motion for your music?`;
                break;
            case 'piano-roll':
                advice = `Piano Roll is ready. Since your focus is on '${profile.currentFocus}', let's try to compose something that fits that goal.`;
                break;
            case 'networking':
                advice = `Networking Hub. Based on your goals to '${profile.careerGoals.join(', ')}', let's find some potential collaborators.`;
                break;
        }
    }

    if (advice) {
      this.messages.update(msgs => [...msgs, { role: 'model', content: advice }]);
    }
  }

  private buildContextualPrompt(message: string): string {
    const mode = this.mainViewMode();
    const theme = this.userContext.lastUsedTheme();
    const lastImage = this.userContext.lastGeneratedImageUrl();
    const profile = this.userProfileService.profile();

    let context = `System Context: The user is in the '${mode}' view.`;
    context += `\nArtist Profile: Name: ${profile.artistName}, Genre: ${profile.primaryGenre}, Skills: ${profile.skills.join(', ')}, Goals: ${profile.careerGoals.join(', ')}, Current Focus: ${profile.currentFocus}.`;

    const links = Object.entries(profile.links || {})
      // FIX: The value 'url' from Object.entries can be inferred as 'unknown'. Added a type guard to ensure it's a string before calling .trim().
      .filter(([, url]) => typeof url === 'string' && url.trim() !== '')
      .map(([platform, url]) => `${platform}: ${url}`)
      .join(', ');

    if (links) {
      context += `\nLinked Accounts: ${links}.`;
    }

    if (theme) {
      context += ` The last theme they used was '${theme.name}'.`;
    }
    if (lastImage && (mode === 'image-editor' || mode === 'video-editor')) {
      context += ` They recently generated an image.`;
    }

    return `${context}\n\nUser Message: "${message}"`;
  }
}
