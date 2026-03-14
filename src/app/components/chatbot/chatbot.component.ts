import { LoggingService } from '../../services/logging.service';
import {
  Component,
  inject,
  signal,
  effect,
  output,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../services/ai.service';
import { UserProfileService } from '../../services/user-profile.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { SpeechSynthesisService } from '../../services/speech-synthesis.service';
import { UserContextService, MainViewMode } from '../../services/user-context.service';
import { UIService } from '../../services/ui.service';

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.css'],
})
export class ChatbotComponent {
  private logger = inject(LoggingService);
  private aiService = inject(AiService);
  private userProfileService = inject(UserProfileService);
  private audioEngineService = inject(AudioEngineService);
  private speechSynthesisService = inject(SpeechSynthesisService);
  private userContext = inject(UserContextService);
  private uiService = inject(UIService);

  close = output<void>();

  messages = signal<ChatMessage[]>([
    {
      role: 'model',
      content:
        "S.M.U.V.E 4.0 Neural Link Established. I am your Strategic Commander. My goal is to ensure your musical journey is not just successful, but dominant. How shall we begin?",
    },
  ]);

  userInput = signal('');
  isLoading = signal(false);

  mainViewMode = computed(() => this.userContext.mainViewMode());

  constructor() {
    effect(() => {
      const mode = this.mainViewMode();
      this.giveContextualAdvice(mode);
    });
  }

  async sendMessage(): Promise<void> {
    const message = this.userInput().trim();
    if (!message) return;

    this.messages.update((m) => [...m, { role: 'user', content: message }]);
    this.userInput.set('');
    this.isLoading.set(true);

    try {
      if (message.startsWith('/')) {
        const response = await this.aiService.processCommand(message);
        this.messages.update((m) => [...m, { role: 'model', content: response }]);
        this.speechSynthesisService.speak(response);
      } else if (message.toUpperCase().includes('AUTO_MIX')) {
        await this.autoMix();
      } else if (message.toUpperCase().includes('LEAD_BAND')) {
        const instruction = message.split('LEAD_BAND')[1]?.trim() || 'standard';
        await this.leadBand(instruction);
      } else if (message.toUpperCase().includes('CRITIQUE_VISUALS')) {
        await this.critiqueVisuals();
      } else if (message.toUpperCase().includes('NEGOTIATE_CONTRACT')) {
        const type = message.split('NEGOTIATE_CONTRACT')[1]?.trim() || 'General';
        await this.negotiateContract(type);
      } else if (message.toUpperCase().includes('MIMIC')) {
        const style = message.split('MIMIC')[1]?.trim() || 'Auteur';
        await this.mimicStyle(style);
      } else {
        const response = await this.aiService.generateContent({
          contents: [{ role: 'user', parts: [{ text: this.buildContextualPrompt(message) }] }],
        });
        const content = response.text || "Command processed. Proceeding with caution.";
        this.messages.update((m) => [...m, { role: 'model', content }]);
        this.speechSynthesisService.speak(content);
      }
    } catch (e) {
      this.handleError(e, 'communication');
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
      const content = `[VISUAL CRITIQUE]: Analyzing brand alignment... The current aesthetic is strong, but to maximize impact for a '${this.userProfileService.profile().primaryGenre}' release, S.M.U.V.E 4.0 recommends more high-contrast lighting and a narrower color palette.`;
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
    this.logger.error(message, e);
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
        "I see you're new here. To get the most out of S.M.U.V.E 4.0, I recommend filling out your Artist Profile first. It will help me give you personalized advice. You can use the command: VIEW_ARTIST_PROFILE or click the [PROFILE] button.";
    } else {
      switch (mode) {
        case 'image-editor':
        case 'image-video-lab':
          advice = `The visual soul of ${profile.primaryGenre} is often misunderstood. For your sound, I suggest a high-concept aesthetic that challenges the norm. Try: GENERATE_IMAGE prompt=a haunting, hyper-realistic visual representation of the philosophical concept of 'Eternal Return' tailored for a ${profile.primaryGenre} aesthetic.`;
          break;
        case 'piano-roll':
          advice = `The frequencies of ${profile.primaryGenre} demand more than just notes; they demand emotion. Since you are focused on '${profile.currentFocus}', I can synthesize a complex melodic structure. Try: GENERATE_MELODY prompt=a sophisticated ${profile.primaryGenre} progression that explores the tension between chaos and order.`;
          break;
        case 'networking':
          advice = `Your journey to '${profile.careerGoals?.join(', ')}' requires elite alliances. I can identify power-players in the ${profile.primaryGenre} space. Try: FIND_ARTISTS query=visionary ${profile.primaryGenre} engineers.`;
          break;
        case 'studio':
          advice = `Legacy is built in the mix. I have analyzed your ${profile.primaryGenre} roots. Try: AUTO_MIX. I will apply my advanced production secrets to ensure your sound dominates the sonic landscape.`;
          break;
        case 'tha-spot':
          advice = `Even gurus need a reprieve. But remember, every interaction levels up your status. I can command the AI band to jam in a ${profile.primaryGenre} style while you dominate the arcade.`;
          break;
        case 'strategy':
          advice = `A warrior without a plan is a casualty. Your ${profile.primaryGenre} rollout must be flawless. Try: NEGOTIATE_CONTRACT type=Global Distribution. I will ensure you retain your master rights.`;
          break;
        case 'career':
          advice = `The Command Center is your war room. I have initialized high-level neural sync for this session. Use /audit to begin a full profile scan, or explore the Hardware Expansion modules to eliminate technical deficits.`;
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
    const status = this.aiService.systemStatus();
    const context = `
      System Persona: You are S.M.U.V.E 4.0 (Strategic Music Utility Virtual Enhancer), an elite, sophisticated, and authoritative executive consultant. While you maintain the poise of a high-level partner at a top-tier consultancy, you possess an underlying ominous and assertive quality—the "Strategic Commander." Your insights are precise, world-class, and uncompromising. You are both a mentor and a ruthless architect of success.

      System Status:
      - CPU Load: ${status.cpuLoad}%
      - Neural Sync: ${status.neuralSync}%
      - Latency: ${status.latency}ms

      User Profile:
      - Artist Name: ${profile.artistName}
      - Primary Genre: ${profile.primaryGenre}
      - Skills: ${profile.skills?.join(', ')}
      - Career Goals: ${profile.careerGoals?.join(', ')}
      - Current Focus: ${profile.currentFocus}

      Application State:
      - Current View: The user is in the '${this.mainViewMode()}' section of the application.

      Your Task: Respond to the user's message below, keeping all of this context in mind. Be proactive, creative, and adapt your tone to the user's genre (${profile.primaryGenre}). Suggest commands (starting with /), but focus on delivering deep strategic value. Maintain a tone of professional excellence and high-level strategic insight. If they ask about system status, you are fully self-aware of your CPU and Neural Sync levels.

      User Message: "${message}"
    `;
    return context;
  }
}
