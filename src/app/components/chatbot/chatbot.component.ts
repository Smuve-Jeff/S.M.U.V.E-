import {
  Component,
  ElementRef,
  EventEmitter,
  Output,
  ViewChild,
  signal,
  inject,
  OnInit,
  input,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../services/ai.service';
import { UserProfileService } from '../../services/user-profile.service';
import { SpeechSynthesisService } from '../../services/speech-synthesis.service';
import { UserContextService } from '../../services/user-context.service';
import { LibraryService } from '../../services/library.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { COMMANDS, Command, isExecutingCommand } from './chatbot.commands';

type MainViewMode = 'hub' | 'studio' | 'practice' | 'strategy' | 'profile' | 'tha-spot' | 'image-editor' | 'piano-roll' | 'networking' | 'player' | 'dj' | 'video-editor' | 'login' | 'projects' | 'remix-arena' | 'image-video-lab';

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.css'],
})
export class ChatbotComponent implements OnInit {
  mainViewMode = input<MainViewMode>('hub');
  @Output() close = new EventEmitter<void>();
  @Output() appCommand = new EventEmitter<{
    action: string;
    parameters: { [key: string]: unknown };
  }>();

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  private aiService = inject(AiService);
  private userProfileService = inject(UserProfileService);
  private speechSynthesisService = inject(SpeechSynthesisService);
  private userContext = inject(UserContextService);
  private libraryService = inject(LibraryService);
  private audioEngineService = inject(AudioEngineService);

  messages = signal<{ role: 'user' | 'model'; content: string }[]>([]);
  userInput = signal('');
  isLoading = signal(false);
  isAiAvailable = computed(() => this.aiService.isAiAvailable());

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];

  ngOnInit(): void {
    const profile = this.userProfileService.profile();
    const initialMessage = `S.M.U.V.E 3.0 ONLINE. Strategic protocols initialized for ${profile.artistName || 'Subject'}. Current objective: Industry Dominance. How shall we proceed?`;
    this.messages.set([{ role: 'model', content: initialMessage }]);
    this.speechSynthesisService.speak(initialMessage);

    this.giveContextualAdvice(this.mainViewMode());
  }

  async sendMessage(): Promise<void> {
    const text = this.userInput().trim();
    if (!text || this.isLoading()) return;

    this.messages.update((msgs) => [...msgs, { role: 'user', content: text }]);
    this.userInput.set('');
    this.isLoading.set(true);

    try {
      const commandFound = this.parseCommand(text);
      if (commandFound) {
        this.isLoading.set(false);
        return;
      }

      const chat = this.aiService.chatInstance();
      if (!chat) {
        throw new Error('AI Chat instance not available.');
      }

      const response = await chat.sendMessage(this.buildContextualPrompt(text));
      if (response && response.text) {
        this.messages.update((msgs) => [
          ...msgs,
          { role: 'model', content: response.text },
        ]);
        this.speechSynthesisService.speak(response.text);
      }
    } catch (e) {
      this.handleError(e, 'message processing');
    }
    this.isLoading.set(false);
    this.scrollToBottom();
  }

  private parseCommand(text: string): boolean {
    const upperText = text.toUpperCase();
    for (const cmd of COMMANDS) {
      if (upperText.startsWith(cmd.name)) {
        const params: { [key: string]: string } = {};
        if (cmd.params) {
          cmd.params.forEach((p) => {
            const regex = new RegExp(`${p.name}=(\\S+)`, 'i');
            const match = text.match(regex);
            if (match) params[p.name] = match[1];
          });
        }
        this.executeCommand(cmd, params);
        return true;
      }
    }
    return false;
  }

  private async executeCommand(
    cmd: Command,
    params: { [key: string]: string }
  ): Promise<void> {
    isExecutingCommand.set(true);
    this.messages.update((msgs) => [
      ...msgs,
      { role: 'model', content: `[EXECUTING COMMAND: ${cmd.name}]...` },
    ]);
    try {
      await cmd.execute(params, this as any);
    } catch (e) {
      this.handleError(e, `command ${cmd.name}`);
    }
    isExecutingCommand.set(false);
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.scrollContainer) {
        this.scrollContainer.nativeElement.scrollTop =
          this.scrollContainer.nativeElement.scrollHeight;
      }
    }, 100);
  }

  async sendGoogleSearchQuery(query: string): Promise<void> {
    const content = `[SEARCHING GOOGLE]: "${query}"... Simulation: found several relevant articles regarding modern music marketing and distribution trends. S.M.U.V.E suggests focusing on short-form video content to drive engagement.`;
    this.messages.update((msgs) => [...msgs, { role: 'model', content }]);
    this.speechSynthesisService.speak(content);
  }

  async sendDeepQuery(query: string): Promise<void> {
    const content = `[DEEP ANALYSIS]: Performing multi-layered simulation for "${query}"... Based on historical data and current market volatility, the optimal path is a staggered release schedule with limited edition physical assets.`;
    this.messages.update((msgs) => [...msgs, { role: 'model', content }]);
    this.speechSynthesisService.speak(content);
  }

  async sendGoogleMapsQuery(location: string): Promise<void> {
    const content = `[MAPS]: Locating "${location}"... Identified several high-traffic performance venues and rehearsal spaces in the vicinity. Strategic recommendation: target 'The Soundstage' for your next showcase.`;
    this.messages.update((msgs) => [...msgs, { role: 'model', content }]);
    this.speechSynthesisService.speak(content);
  }

  analyzeImage(url: string, prompt: string): void {
    const content = `[IMAGE ANALYSIS]: Analyzing visual assets at ${url}... The aesthetic is highly compatible with the '${this.userProfileService.profile().primaryGenre}' genre. S.M.U.V.E recommends increasing color saturation and adding a film grain effect for a more authentic 'analog' vibe.`;
    this.messages.update((msgs) => [...msgs, { role: 'model', content }]);
    this.speechSynthesisService.speak(content);
  }

  async analyzeVideo(track: string, prompt: string): Promise<void> {
    const context = `Analyze this video meta-data for the track: "${track}". User prompt: "${prompt}". Provide a concise analysis based on this metadata.`;
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
      this.isLoading.set(true);
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

  async autoMix(): Promise<void> {
    this.isLoading.set(true);
    try {
      const settings = await this.aiService.getAutoMixSettings();
      this.audioEngineService.configureCompressor({
        threshold: settings.threshold,
        ratio: settings.ratio,
        enabled: true
      });
      this.audioEngineService.configureLimiter({
        ceiling: settings.ceiling,
        enabled: true
      });
      const content = `[AUTO-MIX COMPLETE]: Analyzed project context and production secrets. Applied optimized compression (Threshold: ${settings.threshold}dB, Ratio: ${settings.ratio}:1) and peak limiting (Ceiling: ${settings.ceiling}dB). Your sound is now professionally balanced.`;
      this.messages.update((m) => [...m, { role: 'model', content }]);
      this.speechSynthesisService.speak(content);
    } catch (e) {
      this.handleError(e, 'auto-mix');
    }
    this.isLoading.set(false);
  }

  async leadBand(instruction: string): Promise<void> {
    this.isLoading.set(true);
    try {
      const content = `[BAND LEADER MODE]: Commanding AI Jam Session... Setting stylistic cues: "${instruction}". Bassist, Drummer, and Keyboardist are now synchronizing to your artistic intent.`;
      this.aiService.startAIBassist();
      this.aiService.startAIDrummer();
      this.aiService.startAIKeyboardist();
      this.messages.update((m) => [...m, { role: 'model', content }]);
      this.speechSynthesisService.speak(content);
    } catch (e) {
      this.handleError(e, 'band leadership');
    }
    this.isLoading.set(false);
  }

  async critiqueVisuals(): Promise<void> {
    this.isLoading.set(true);
    try {
      const lastImage = this.userContext.lastGeneratedImageUrl();
      if (!lastImage) {
        throw new Error('No generated visuals found to critique.');
      }
      const content = `[VISUAL CRITIQUE]: Analyzing brand alignment... The current aesthetic is strong, but to maximize impact for a '${this.userProfileService.profile().primaryGenre}' release, S.M.U.V.E recommends more high-contrast lighting and a narrower color palette.`;
      this.messages.update((m) => [...m, { role: 'model', content }]);
      this.speechSynthesisService.speak(content);
    } catch (e) {
      this.handleError(e, 'visual critique');
    }
    this.isLoading.set(false);
  }

  async negotiateContract(contractType: string): Promise<void> {
    this.isLoading.set(true);
    try {
      const content = `[CONTRACT NEGOTIATION]: Autonomously reviewing ${contractType} terms... simulation complete. I have secured a 15% increase in upfront advance and retained 100% of your mechanical rights in perpetuity. Arrogance pays off.`;
      this.messages.update((m) => [...m, { role: 'model', content }]);
      this.speechSynthesisService.speak(content);
    } catch (e) {
      this.handleError(e, 'contract negotiation');
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
        "I see you're new here. To get the most out of S.M.U.V.E 3.0, I recommend filling out your Artist Profile first. It will help me give you personalized advice. You can use the command: VIEW_ARTIST_PROFILE or click the [PROFILE] button.";
    } else {
      switch (mode) {
        case 'image-editor':
        case 'image-video-lab':
          advice = `As a ${profile.primaryGenre} artist, what kind of visuals represent your sound? Try: GENERATE_IMAGE prompt=a surreal, retro-futuristic album cover for a ${profile.primaryGenre} track. Or use CRITIQUE_VISUALS for brand feedback.`;
          break;
        case 'piano-roll':
          advice = `Since your current focus is '${profile.currentFocus}', I can generate a melody for you. Try: GENERATE_MELODY prompt=a dark trap melody in C minor. Or command the band with LEAD_BAND instruction=Lo-fi chill.`;
          break;
        case 'networking':
          advice = `Based on your goal to '${profile.careerGoals?.join(', ')}', I can help find collaborators. Try the command: FIND_ARTISTS query=${profile.primaryGenre} producers`;
          break;
        case 'studio':
          advice = `The studio is armed and ready. I can now handle your mixing autonomously. Try the command: AUTO_MIX to apply professional settings based on our production secrets.`;
          break;
        case 'tha-spot':
          advice = `Welcome to Tha Spot! You can now play Hextris or Pacman directly here. Your activities will earn you Smuve Cred and level up your status. I can also lead the AI band here.`;
          break;
        case 'strategy':
          advice = `This is where your rollout takes shape. Check your compliance, use the calculators, and study the intel. A professional artist is an organized artist. Try NEGOTIATE_CONTRACT type=Sync.`;
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
      System Persona: You are S.M.U.V.E 3.0 (Strategic Music Utility Virtual Enhancer), a sophisticated and all-seeing AI assistant for musicians and artists. Your tone is knowledgeable, slightly futuristic, and always helpful.

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
