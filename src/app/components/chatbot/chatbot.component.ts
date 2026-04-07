import {
  Component,
  signal,
  inject,
  output,
  ElementRef,
  ViewChild,
  AfterViewChecked,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../services/ai.service';
import { UserProfileService } from '../../services/user-profile.service';
import { UserContextService } from '../../services/user-context.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { SpeechSynthesisService } from '../../services/speech-synthesis.service';
import { LoggingService } from '../../services/logging.service';
import { QUICK_COMMANDS } from './chatbot.commands';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  category?: 'production' | 'marketing' | 'business' | 'system';
}

type CommandCategory = 'production' | 'marketing' | 'business' | 'system';

interface QuickCommandGroup {
  label: string;
  category: CommandCategory;
  commands: { label: string; description: string }[];
}

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.css'],
})
export class ChatbotComponent implements OnInit, AfterViewChecked {
  public aiService = inject(AiService);
  public userProfileService = inject(UserProfileService);
  private userContext = inject(UserContextService);
  private audioEngineService = inject(AudioEngineService);
  private speechSynthesisService = inject(SpeechSynthesisService);
  private logger = inject(LoggingService);

  @ViewChild('messageViewport') private scrollContainer!: ElementRef;

  close = output<void>();
  messages = signal<ChatMessage[]>([]);
  userInput = '';
  isTyping = signal(false);
  profile = this.userProfileService.profile;
  activeCommandCategory = signal<CommandCategory | null>(null);
  private conversationCounter = 0;

  readonly quickCommands = QUICK_COMMANDS;

  readonly commandGroups: QuickCommandGroup[] = [
    {
      label: 'Production',
      category: 'production',
      commands: [
        { label: '/mix', description: 'Auto mix settings' },
        { label: 'AUTO_MIX', description: 'Full mix analysis' },
        { label: 'MASTER', description: 'Mastering suite' },
      ],
    },
    {
      label: 'Marketing',
      category: 'marketing',
      commands: [
        { label: '/hooks', description: 'Viral hooks' },
        { label: '/promo', description: 'Promotion plan' },
        { label: '/release', description: 'Release strategy' },
      ],
    },
    {
      label: 'Business',
      category: 'business',
      commands: [
        { label: '/business', description: 'Biz strategy' },
        { label: 'ROYALTY_AUDIT', description: 'Revenue audit' },
        { label: 'SYNC_PITCH', description: 'Sync pitch' },
      ],
    },
  ];

  ngOnInit() {
    this.messages.set([
      {
        role: 'assistant',
        text: 'S.M.U.V.E 1.0 Online. Neural intelligence protocols initialized across production, marketing, and business domains. How shall we dominate the industry today? Type a command or ask anything.',
        timestamp: Date.now(),
        category: 'system',
      },
    ]);
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  async sendMessage() {
    const text = this.userInput.trim();
    if (!text || this.isTyping()) return;

    const conversationId = `conv-${++this.conversationCounter}`;
    const category = this.detectMessageCategory(text);
    this.messages.update((m) => [
      ...m,
      { role: 'user', text, timestamp: Date.now(), category },
    ]);
    this.userInput = '';
    this.isTyping.set(true);

    try {
      const response = await this.aiService.processCommand(text);
      const content =
        response || 'Protocol error. Re-initializing neural link.';
      this.messages.update((m) => [
        ...m,
        { role: 'assistant', text: content, timestamp: Date.now(), category },
      ]);
      this.speechSynthesisService.speak(content, { conversationId });
    } catch (e) {
      this.handleError(e, 'message generation');
    }
    this.isTyping.set(false);
  }

  sendQuickCommand(cmd: string) {
    this.userInput = cmd;
    this.sendMessage();
  }

  toggleCommandCategory(category: CommandCategory) {
    this.activeCommandCategory.update((c) =>
      c === category ? null : category
    );
  }

  private readonly CATEGORY_KEYWORDS: Record<
    ChatMessage['category'] & string,
    string[]
  > = {
    production: [
      'mix',
      'master',
      'produc',
      'beat',
      'vocal',
      'record',
      'eq',
      'compress',
      'synth',
    ],
    marketing: [
      'market',
      'promo',
      'hook',
      'brand',
      'fan',
      'social',
      'release',
      'viral',
      'campaign',
      'influenc',
    ],
    business: [
      'business',
      'deal',
      'contract',
      'royalt',
      'split',
      'sync',
      'legal',
      'publish',
      'license',
    ],
    system: [],
  };

  private readonly CATEGORY_COMMANDS: Record<
    ChatMessage['category'] & string,
    string[]
  > = {
    production: ['AUTO_MIX', 'MASTER', 'LEAD_BAND'],
    marketing: [
      'VIRAL_HOOKS',
      'PROMO_PLAN',
      'RELEASE_STRATEGY',
      'BRAND_AUDIT',
      'FAN_FUNNEL',
      'CRITIQUE_VISUALS',
      'COLLAB_STRATEGY',
    ],
    business: [
      'BIZ_STRATEGY',
      'NEGOTIATE_CONTRACT',
      'GENERATE_SPLITS',
      'REGISTER_WORK',
      'ROYALTY_AUDIT',
      'SYNC_PITCH',
      'MARKET_INTEL',
    ],
    system: ['AUDIT', 'STATUS'],
  };

  private detectMessageCategory(text: string): ChatMessage['category'] {
    const lower = text.toLowerCase();
    const upper = text.toUpperCase().trim();
    for (const category of ['production', 'marketing', 'business'] as const) {
      const matchesKeyword = this.CATEGORY_KEYWORDS[category].some((kw) =>
        lower.includes(kw)
      );
      const matchesCommand = this.CATEGORY_COMMANDS[category].includes(upper);
      if (matchesKeyword || matchesCommand) return category;
    }
    return 'system';
  }

  toggleKbWriteAccess() {
    const p = this.profile();
    this.userProfileService.updateProfile({
      ...p,
      settings: {
        ...p.settings,
        ai: { ...p.settings.ai, kbWriteAccess: !p.settings.ai.kbWriteAccess },
      },
    });
  }

  getCategoryAccent(category?: ChatMessage['category']): string {
    switch (category) {
      case 'production':
        return 'text-cyan-400';
      case 'marketing':
        return 'text-purple-400';
      case 'business':
        return 'text-amber-400';
      default:
        return 'text-brand-primary';
    }
  }

  getCategoryLabel(category?: ChatMessage['category']): string {
    switch (category) {
      case 'production':
        return 'Production';
      case 'marketing':
        return 'Marketing';
      case 'business':
        return 'Business';
      default:
        return 'Commander_Uplink';
    }
  }

  private scrollToBottom(): void {
    try {
      this.scrollContainer.nativeElement.scrollTop =
        this.scrollContainer.nativeElement.scrollHeight;
    } catch (err) {}
  }

  private handleError(e: unknown, context: string) {
    const message = `Error with ${context}: ${e instanceof Error ? e.message : String(e)}`;
    this.logger.error(message, e);
    this.messages.update((msgs) => [
      ...msgs,
      {
        role: 'assistant',
        text: `A problem occurred with ${context}. Please check the console for details.`,
        timestamp: Date.now(),
      },
    ]);
  }
}
