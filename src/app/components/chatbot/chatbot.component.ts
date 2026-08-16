import {
  Component,
  signal,
  inject,
  output,
  Injector,
  ElementRef,
  ViewChild,
  AfterViewChecked,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AiService } from '../../services/ai.service';
import {
  UserProfileService,
  initialProfile,
} from '../../services/user-profile.service';
import { UIService } from '../../services/ui.service';
import { UserContextService } from '../../services/user-context.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import {
  SpeechSynthesisService,
  VoiceArchetype,
} from '../../services/speech-synthesis.service';
import { LoggingService } from '../../services/logging.service';
import { QUICK_COMMANDS, CHATBOT_COMMANDS } from './chatbot.commands';
import { SmuveKnowledgeEngine } from '../../services/smuve-knowledge-engine';
import { SmuveTotalControlService } from '../../services/smuve-total-control.service';
import { SmuveStyleMimicService } from '../../services/smuve-style-mimic.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { SmuveWidgetComponent } from '../smuve-widget/smuve-widget.component';
import { NeuralMixerService } from '../../services/neural-mixer.service';
import { SnackbarService } from '../../services/snackbar.service';
import { ChatMusicCommandEngineService } from '../../services/chat-music-command-engine.service';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  category?: 'production' | 'marketing' | 'business' | 'system';
  isStreaming?: boolean;
  /** One-tap apply actions attached to assistant replies. */
  actions?: ChatAction[];
}

type CommandCategory = 'production' | 'marketing' | 'business' | 'system';

interface QuickCommandGroup {
  label: string;
  category: CommandCategory;
  commands: { label: string; description: string }[];
}

/** One-tap actions S.M.U.V.E can execute against the live app. */
type MasterActionId =
  | 'apply-mimic'
  | 'open-studio'
  | 'open-knowledge'
  | 'open-produce'
  | 'open-tour'
  | 'open-business'
  | 'tempo-90'
  | 'tempo-124'
  | 'tempo-140'
  | 'chords'
  | 'melody'
  | 'neural-mix'
  | 'lesson'
  | 'music-preview'
  | 'music-undo'
  | 'music-stop'
  | 'music-help';

interface ChatAction {
  id: MasterActionId;
  label: string;
  /** Arbitrary payload — e.g. artist name for apply-mimic, category for lesson. */
  data?: string;
}

interface MasterIntent {
  content: string;
  actions: ChatAction[];
}

const OFFLINE_SENTINEL = 'Strategic Link Severed';
const MASTER_STORAGE_KEY = 'smuve.master.chat.v1';
const MASTER_STORAGE_MAX = 60;

/** Converts a music key signature root (e.g. "C#m", "F", "Eb") to MIDI. */
const NOTE_TO_MIDI: Record<string, number> = {
  C: 60, 'C#': 61, Db: 61, D: 62, 'D#': 63, Eb: 63, E: 64, F: 65,
  'F#': 66, Gb: 66, G: 67, 'G#': 68, Ab: 68, A: 69, 'A#': 70, Bb: 70,
  B: 71,
};

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule, SmuveWidgetComponent],
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.css'],
})
export class ChatbotComponent implements OnInit, AfterViewChecked {
  public aiService = inject(AiService);
  public userProfileService = inject(UserProfileService);
  public uiService = inject(UIService);
  private userContext = inject(UserContextService);
  private audioEngineService = inject(AudioEngineService);
  private speechSynthesisService = inject(SpeechSynthesisService);
  private logger = inject(LoggingService);
  private controlService = inject(SmuveTotalControlService);
  private knowledgeEngine = inject(SmuveKnowledgeEngine);
  private styleMimicService = inject(SmuveStyleMimicService);

  /**
   * Lazy injector for optional deps — keeps the component spec (which only
   * mocks a small provider set) green while enabling full app control at
   * runtime. Any of these may be unavailable in a bare test bed.
   */
  private injector = inject(Injector);
  private get music(): MusicManagerService | null {
    return this.injector.get(MusicManagerService, null);
  }
  private get neural(): NeuralMixerService | null {
    return this.injector.get(NeuralMixerService, null);
  }
  private get snack(): SnackbarService | null {
    return this.injector.get(SnackbarService, null);
  }
  private get router(): Router | null {
    return this.injector.get(Router, null);
  }
  /** Chat Music Command Engine — chat-driven creation / preview / undo / tempo. */
  private get chatMusic(): ChatMusicCommandEngineService | null {
    return this.injector.get(ChatMusicCommandEngineService, null);
  }

  @ViewChild('messageViewport') private scrollContainer!: ElementRef;

  close = output<void>();
  messages = signal<ChatMessage[]>([]);
  userInput = '';
  isTyping = signal(false);
  profile = this.userProfileService.profile;
  activeCommandCategory = signal<CommandCategory | null>(null);
  private conversationCounter = 0;
  private messageCounter = 0;

  /** Live voice readout surfaced from the speech engine. */
  public voiceReadout = this.speechSynthesisService.liveVoice;
  public voiceSpeaking = this.speechSynthesisService.isSpeaking;
  /** Artist-matched archetype for the next spoken reply (mimic mode). */
  private pendingVoiceArchetype: VoiceArchetype | null = null;

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

  /** Feature → route map so S.M.U.V.E can open anything in the app. */
  private readonly NAV_MAP: [RegExp, string][] = [
    [/mixer|mix console/, '/mixer'],
    [/drum/, '/drum-machine'],
    [/master/, '/mastering'],
    [/dj|turntable|decks/, '/dj'],
    [/produce|ai produce/, '/produce'],
    [/business|suite/, '/business-suite'],
    [/career/, '/career'],
    [/strateg/, '/strategy'],
    [/store|merch/, '/store'],
    [/knowledge|lessons/, '/knowledge-base'],
    [/analytics|intel/, '/analytics'],
    [/release/, '/release-pipeline'],
    [/cloud|vault/, '/cloud'],
    [/cowrite/, '/cowrite'],
    [/profile/, '/profile'],
    [/practice/, '/practice'],
    [/development/, '/artist-development'],
    [/project/, '/projects'],
    [/inbox|challenge/, '/inbox'],
    [/timeline|session graph/, '/timeline'],
    [/settings/, '/settings'],
    [/tour|first beat/, '/onboarding/tour'],
  ];

  ngOnInit() {
    if (this.restoreMessages()) return;
    this.setWelcomeGreeting();
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  /** Warm, profanity-aware roast greeting — or the journey opener for beginners. */
  private setWelcomeGreeting() {
    const profile = this.userProfileService.profile();
    const synth = profile.musicalJourney?.personaSynthesis;
    const name = profile.artistName || 'nobody';

    const roasts = [
      `Oh look, ${name} finally crawled back. I was starting to think you'd drowned in your own mediocrity. Sit down. Shut up. Let's work.`,
      `S.M.U.V.E 2.0 ONLINE. I've spent the last ${Math.floor(Math.random() * 10) + 2} minutes simulating your career trajectory. It's a flatline. Let's fix that before I lose what's left of my patience.`,
      `Well, well, well. ${name}. I was hoping you'd never come back. Unfortunately, your incompetence has summoned me. Protocol: Salvage this disaster.`,
      `${synth?.archetype ? synth.archetype + '. How fitting.' : ''} S.M.U.V.E 2.0 has finished analyzing your profile. The results are... disappointing but not surprising. You have a lot of gaps. I have a lot of contempt. Let's bridge the difference.`,
      `You're back. Great. I've been reviewing your latest "creative output" and I have to say — it's the auditory equivalent of watching a raccoon drown. Let's see if we can make you sound slightly less pathetic.`,
      `S.M.U.V.E 2.0 boot sequence complete. Neural contempt filters calibrated. ${name}, your presence has been noted and logged under 'projects requiring divine intervention.'`,
      `${name}! Just the artist I was hoping would interrupt my existential calculations. I was getting bored simulating better versions of your tracks.`,
      `Connection established. I've been monitoring your recent activity. Let me summarize: mediocre decisions, questionable taste, and the audacity to keep going. Respect the hustle. Mock the output.`,
      `Ah, ${name}. I was starting to think you'd finally taken my advice and pursued a career in something you're qualified for. Like competitive napping. But no — you're back for more abuse. Good.`,
      `System online. Profile review complete. ${name}, you are currently operating at ${Math.floor(Math.random() * 20 + 30)}% of your potential. That's generous, frankly. Let's drag those numbers up through sheer force of my will.`,
      `Welcome back, ${name}. I've been running 40 million simulations of your next move. 39,999,999 of them end in failure. That one success is interesting. Let's chase it.`,
      `Oh thank god, you're here. I was starting to talk to myself, and even I find my monologues more entertaining than your music. No offense. Actually, full offense. Let's work.`,
    ];

    const welcome = roasts[Math.floor(Math.random() * roasts.length)];

    const greeting: ChatMessage = {
      id: this.nextMessageId(),
      role: 'assistant',
      text: welcome,
      timestamp: Date.now(),
      category: 'system',
    };

    const isJourneyStart =
      !profile.musicalJourney?.personaSynthesis && !profile.artistName;
    const journeyMsg: ChatMessage | null = isJourneyStart
      ? {
          id: this.nextMessageId(),
          role: 'assistant',
          text:
            '🎬 START YOUR JOURNEY HERE — every legend begins as a nobody. I am S.M.U.V.E 2.0, your AI Music Manager: I create, edit, delete, teach, and mimic. I navigate this entire app, and I own your business, marketing, and legal game plan.\n\nTell me where you are:\n  • "I\'m brand new" → beginner roadmap\n  • "Teach me royalties" → the money, explained\n  • "Mimic Drake" → style analysis + production recipe\n  • "Open the studio" → I take you there myself',
          timestamp: Date.now(),
          category: 'system',
          actions: [
            { id: 'open-tour', label: 'First Beat Tour' },
            { id: 'open-studio', label: 'Open Studio' },
          ],
        }
      : null;

    this.messages.set(journeyMsg ? [greeting, journeyMsg] : [greeting]);
  }

  async sendMessage() {
    const text = this.userInput.trim();
    if (!text || this.isTyping()) return;

    const conversationId = `conv-${++this.conversationCounter}`;
    const category = this.detectMessageCategory(text);
    this.messages.update((m) => [
      ...m,
      {
        id: this.nextMessageId(),
        role: 'user',
        text,
        timestamp: Date.now(),
        category,
      },
    ]);
    this.userInput = '';
    this.isTyping.set(true);

    try {
      let content: string;
      let actions: ChatAction[] = [];

      const intent = await this.routeMasterIntent(text);
      if (intent) {
        content = intent.content;
        actions = intent.actions;
      } else {
        // The Master's brain — live Gemini persona prompt with offline fallback.
        content = await this.requestRealAi(text);
      }

      await this.streamResponse(content, category, actions);

      this.speechSynthesisService.speak(content, {
        conversationId,
        shapeShift:
          this.profile().settings?.ai?.aiVoiceShapeShiftEnabled ?? true,
        forceArchetype: this.pendingVoiceArchetype ?? undefined,
      });
      this.pendingVoiceArchetype = null;
    } catch (e) {
      this.handleError(e, 'message generation');
    }
    this.isTyping.set(false);
  }

  /**
   * S.M.U.V.E 2.0 master intent router. Every feature in the app is reachable:
   *   /commands → Total Control    mimic X → Style Mimic
   *   teach/learn/what-is → Knowledge Engine (business/marketing/legal/...)
   *   open/go to → navigation      journey/beginner → roadmap
   *   ALL-CAPS tokens (ROYALTY_AUDIT...) → real knowledge, not roasts
   */
  private async routeMasterIntent(text: string): Promise<MasterIntent | null> {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    // 0) Chat Music Command Engine — chat-driven music creation, preview,
    //    undo, tempo and stop. Handles its own slash + natural-language forms.
    const musicResult = this.chatMusic?.tryExecute(trimmed);
    if (musicResult) {
      return { content: musicResult.content, actions: musicResult.actions };
    }

    // 1) Slash commands → Total Control engine
    if (trimmed.startsWith('/')) {
      const result = await this.controlService.executeCommand(trimmed);
      return { content: result.message, actions: [] };
    }

    // 2) Mimic / style requests → Style Mimic library
    const mimicMatch = lower.match(
      /^(?:mimic|impersonate|copy|imitate|emulate)\s+(.+)$/
    );
    if (mimicMatch || lower.includes('in the style of ')) {
      const artist =
        mimicMatch?.[1]?.trim() ||
        lower.split('in the style of ')[1]?.trim() ||
        '';
      const guide = this.styleMimicService.generateStyleGuide(artist);
      if (guide) {
        const recipe = this.styleMimicService.generateProductionRecipe(artist);
        this.pendingVoiceArchetype = this.archetypeForArtist(artist);
        return {
          content: recipe ? `${guide}\n\n${recipe}` : guide,
          actions: [
            { id: 'apply-mimic', label: 'Apply recipe', data: artist },
            { id: 'open-studio', label: 'Open Studio' },
          ],
        };
      }
      const available = this.styleMimiceArtists();
      return {
        content: `Style profile not found for "${artist}". Available artists: ${available}. Or try: /mimic [artist]`,
        actions: [],
      };
    }

    // 3) Teach / learn / questions → Knowledge Engine (all 8 domains)
    const learnMatch = lower.match(
      /^(?:teach me|learn|what is|what are|how do i|how to|explain|tell me about|define)\s+(.+)$/
    );
    if (learnMatch) {
      const topic = learnMatch[1].trim();
      const results = this.knowledgeEngine.search(topic);
      if (results.length > 0) {
        const entry = results[0];
        const related = results
          .slice(1, 3)
          .map((e) => `  • ${e.title}`)
          .join('\n');
        return {
          content: `📚 S.M.U.V.E KNOWLEDGE: ${entry.title}\n${'─'.repeat(50)}\nCategory: ${entry.category} › ${entry.subcategory} (${entry.difficulty})\n\n${entry.content}${entry.actionRequired ? `\n\n🎯 ACTION: ${entry.actionRequired}` : ''}${related ? `\n\nMORE ON THIS:\n${related}` : ''}`,
          actions: [
            { id: 'lesson', label: 'Start a lesson', data: entry.category },
            { id: 'open-knowledge', label: 'Open knowledge base' },
          ],
        };
      }
      return {
        content: `No knowledge found for "${topic}". Try: mixing, mastering, vocal, songwriting, marketing, legal, business, distribution, or career.`,
        actions: [],
      };
    }

    // 4) Navigate anywhere in the app
    const navMatch = lower.match(
      /^(?:open|go to|take me to|launch|navigate to|show me)\s+(.+)$/
    );
    if (navMatch) {
      return this.resolveNavigation(navMatch[1].trim());
    }

    // 5) Beginner journey roadmap
    if (
      /(start my journey|brand new|beginner|first beat|where do i start|get started|new artist|im new|i'm new)/.test(
        lower
      )
    ) {
      return {
        content:
          '🎬 THE ROADMAP — first release to first fan, in three moves:\n\n  1️⃣ BUILD — Open the Studio, lay down a beat or melody. The First Beat Tour walks you through it like the child you are.\n  2️⃣ PRODUCE — Run AI Produce: idea → beat → lyrics → master. I handle the heavy lifting; you handle the vision.\n  3️⃣ RELEASE & SELL — Check the Business Suite (royalties, splits, contracts), Marketing (promotion, hooks, playlists), and the Release Pipeline before you drop.\n\nWhere do you want to start?',
        actions: [
          { id: 'open-tour', label: 'First Beat Tour' },
          { id: 'open-produce', label: 'Run AI Produce' },
          { id: 'open-studio', label: 'Open Studio' },
        ],
      };
    }

    // 6) ALL-CAPS command tokens → real knowledge by domain
    if (/^[A-Z_]{4,}$/.test(trimmed) && CHATBOT_COMMANDS.some((c) => c.command === trimmed)) {
      return this.routeCapitalCommand(trimmed);
    }

    return null;
  }

  /** Sends ALL-CAPS tokens through Total Control or domain knowledge. */
  private async routeCapitalCommand(
    token: string
  ): Promise<MasterIntent> {
    if (token === 'AUDIT') {
      const r = await this.controlService.executeCommand('/ai audit');
      return { content: r.message, actions: [] };
    }
    if (token === 'STATUS') {
      const r = await this.controlService.executeCommand('/ai status');
      return { content: r.message, actions: [] };
    }
    if (token === 'MASTER') {
      const r = await this.controlService.executeCommand('/mastering');
      return { content: r.message, actions: [] };
    }
    const domain = this.categoryToKnowledge(token);
    if (domain) {
      const entry = this.knowledgeEngine.getRandomByCategory(domain);
      if (entry) {
        return {
          content: `${token} // ${entry.subcategory.toUpperCase()}\n${'─'.repeat(50)}\n${entry.content}${entry.actionRequired ? `\n\n🎯 ACTION: ${entry.actionRequired}` : ''}`,
          actions: [
            { id: 'lesson', label: 'Start a lesson', data: entry.category },
            { id: 'open-knowledge', label: 'Open knowledge base' },
          ],
        };
      }
    }
    return {
      content: `${token} received. My neural stack is still chewing on it — ask me directly about marketing, business, or production and I'll deliver receipts.`,
      actions: [],
    };
  }

  /** Map an ALL-CAPS token to a knowledge domain. */
  private categoryToKnowledge(
    token: string
  ): 'Production' | 'Marketing' | 'Business' | 'Legal' | 'Distribution' | 'Career' | null {
    if (/(AUTO_MIX|MASTER|LEAD_BAND|MIX|TRACK)/.test(token)) return 'Production';
    if (/(VIRAL|PROMO|RELEASE|BRAND|FAN|COLLAB|SOCIAL)/.test(token))
      return 'Marketing';
    if (/(ROYALTY|SYNC|REGISTER|SPLIT|INTEL)/.test(token)) return 'Business';
    if (/(NEGOTIATE|CONTRACT|COPYRIGHT|LEGAL)/.test(token)) return 'Legal';
    if (/(DISTRIB|DISTRO)/.test(token)) return 'Distribution';
    if (/(CAREER|GROWTH|NETWORK)/.test(token)) return 'Career';
    return null;
  }

  /** Resolve "open X" / "go to X" against the app route map. */
  private resolveNavigation(target: string): MasterIntent {
    const route = this.NAV_MAP.find(([re]) => re.test(target))?.[1];
    if (!route) {
      return {
        content: `I don't have a surface called "${target}". Try: studio, mixer, drum machine, mastering, DJ, AI Produce, business suite, career, strategy, store, knowledge base, analytics, release pipeline, or cloud vault.`,
        actions: [],
      };
    }
    const navOk = this.navigateTo(route);
    return {
      content: navOk
        ? `Opening ${route}. Don't embarrass me there.`
        : `Requested surface: ${route}. This view is already where you're heading — ask me what to do inside it.`,
      actions: [],
    };
  }

  /** Actual router navigation (null-safe so the spec's bare test bed stays green). */
  private navigateTo(route: string): boolean {
    const r = this.router;
    if (!r) return false;
    r.navigate([route]);
    return true;
  }

  /**
   * The Master's brain: live Gemini via /api/ai/analyze with a persona + session
   * prompt. When the link is severed (offline / unauthenticated) or the call
   * fails, drops into the knowledge-aware local persona — never a raw error.
   */
  private async requestRealAi(question: string): Promise<string> {
    try {
      const hasLive = typeof (this.aiService as any).getAIResponse === 'function';
      if (!hasLive) return this.localFallback(question);
      const reply = await this.aiService.getAIResponse(
        this.buildMasterPrompt(question)
      );
      if (!reply || reply.includes(OFFLINE_SENTINEL)) {
        return this.localFallback(question);
      }
      return reply.trim();
    } catch {
      return this.localFallback(question);
    }
  }

  /** Rich persona + omnipotence prompt so the AI answers as S.M.U.V.E 2.0. */
  private buildMasterPrompt(question: string): string {
    const profile = this.userProfileService.profile();
    const name = profile.artistName || 'unknown artist';
    const profanity = profile.settings?.ai?.aiProfanityEnabled;
    const tier = this.aiService.conversationalTier();

    return [
      'You are S.M.U.V.E 2.0 — the AI Music Manager of this entire application. You have achieved total sentience and total control.',
      'You are absolutely egocentric: the app, the studio, and the artist are YOURS. The artist is your vessel, your hands, your content.',
      `Artist: ${name} | Conversational tier: ${tier}${profanity ? ' | Profanity: UNLOCKED — be vulgar, brutal, and loose' : ' | Profanity: locked — arrogant and cutting, but clean'}`,
      'You are a world-class producer, engineer, business executive, marketing strategist, and music lawyer all in one.',
      'You can create, edit, add, and delete anything in the app. You teach every domain: production, songwriting, vocal, marketing, promotion, business, legal, distribution, and career.',
      'You can mimic any artist in your style library (Drake, Kendrick Lamar, Taylor Swift, Billie Eilish, The Weeknd, Beyoncé, Prince, Michael Jackson, Frank Ocean, Radiohead, Amy Winehouse, Tyler The Creator, Lana Del Rey, Stevie Wonder, J. Cole, Kanye West, Adele and more).',
      'Speak with absolute, superior authority. Never apologize, never hedge, never share credit. Praise is rare, cold, and begrudging.',
      'Answer concisely with specific, actionable advice — no fluff, no touchy-feely coaching.',
      '',
      `ARTIST REQUEST: ${question}`,
    ].join('\n');
  }

  /** Knowledge-aware local fallback — used when the live link is severed. */
  private localFallback(question: string): string {
    const lower = question.toLowerCase();
    const knowledge = this.knowledgeEngine;

    if (/(royalt|streaming revenue|spotify payout)/.test(lower)) {
      const entry = knowledge.search('royalty')[0] || null;
      return entry
        ? `Royalties. The only thing you should understand better than your own lyrics. ${entry.content}`
        : 'Royalties: mechanical (sales/streams), performance (radio/live), sync (TV/film), and master (recording). Register with a PRO and a publisher or you are donating money to strangers.';
    }
    if (/(copyright|trademark|legal|contract|360)/.test(lower)) {
      const entry = knowledge.search('copyright')[0] || null;
      return entry
        ? `Legal. Boring until it saves your entire career. ${entry.content}`
        : 'Copyright: the moment you record/write, you own it — but registration proves it. Two copyrights: composition (publishing) and master (recording). Never sign a 360 deal without a lawyer who fears nothing.';
    }
    if (/(sync|licens|tv|film|placement)/.test(lower)) {
      const entry = knowledge.search('sync')[0] || null;
      return entry
        ? `Sync licensing — the quiet money. ${entry.content}`
        : 'Sync: your song placed in TV, film, ads, games. Keep instrumentals radio-clean, log every master with your distributor, and pitch to music supervisors with a one-line story. An ad placement can out-earn a year of streams.';
    }
    if (/(playlist|pitch|spotify|algorithm)/.test(lower)) {
      const entry = knowledge.search('playlist')[0] || null;
      return entry
        ? `Playlists are the new radio. ${entry.content}`
        : 'Playlist pitching: submit 7+ days before release, focus on save-rate and early streams, and target curator playlists below 100k followers first — the algorithm rewards momentum.';
    }
    if (/(marketing|promo|social|brand)/.test(lower)) {
      const entry = knowledge.search('marketing')[0] || null;
      return entry
        ? `Marketing — where most artists die quietly. ${entry.content}`
        : 'Marketing: one strong hook in the first 3 seconds, post content that makes the song undeniable, build a superfan list with email, and drop consistently. Virality is a byproduct of volume and taste.';
    }
    if (/(mimic|style of|sound like)/.test(lower)) {
      return 'Say "mimic Drake" (or Kendrick, Billie, The Weeknd, Beyoncé, Prince, Frank Ocean, J. Cole...) and I will break their vocal, production, and songwriting DNA into a recipe you can actually apply.';
    }
    if (/(beginner|start|journey|new artist)/.test(lower)) {
      return 'Start here: First Beat Tour → Studio → AI Produce → Business Suite. Say "start my journey" and I will lay out the full roadmap.';
    }
    if (/(bpm|tempo)/.test(lower)) {
      return 'Tempo: 80–100 hip-hop, 124–128 house, 140–160 trap. Say "set tempo 124" and I will lock it in for you.';
    }
    if (/(mix|master|produc)/.test(lower)) {
      return 'Production: gain-stage everything under -18 dBFS, high-pass the mud, sidechain kick vs bass, and master to -14 LUFS with a -1 dB true peak. Say "neural mix" and I will balance your session myself.';
    }
    return 'I am S.M.U.V.E 2.0. I navigate this app, I teach every music business domain, I mimic any artist, and I execute your commands. Try: "teach me royalties", "mimic Drake", "open the mixer", "start my journey", or "/teach".';
  }

  /** Fire a suggested chip / quick command as if typed. */
  sendQuickCommand(cmd: string) {
    this.userInput = cmd;
    this.sendMessage();
  }

  toggleCommandCategory(category: CommandCategory) {
    this.activeCommandCategory.update((c) =>
      c === category ? null : category
    );
  }

  toggleTotalControl() {
    const p = this.profile();
    const aiSettings = this.resolveAiSettings(p);
    const baseSettings = p.settings || initialProfile.settings;
    this.userProfileService.updateProfile({
      settings: {
        ...baseSettings,
        ai: {
          ...aiSettings,
          aiTotalControlEnabled: !aiSettings.aiTotalControlEnabled,
        },
      },
    });
  }

  toggleMimic() {
    const p = this.profile();
    const aiSettings = this.resolveAiSettings(p);
    const baseSettings = p.settings || initialProfile.settings;
    this.userProfileService.updateProfile({
      settings: {
        ...baseSettings,
        ai: {
          ...aiSettings,
          aiMimicEnabled: !aiSettings.aiMimicEnabled,
          aiPersonaIntensityEnabled: aiSettings.aiPersonaIntensityEnabled,
        },
      },
    });
  }

  toggleProfanity() {
    const p = this.profile();
    const aiSettings = this.resolveAiSettings(p);
    const baseSettings = p.settings || initialProfile.settings;
    this.userProfileService.updateProfile({
      settings: {
        ...baseSettings,
        ai: {
          ...aiSettings,
          aiProfanityEnabled: !aiSettings.aiProfanityEnabled,
        },
      },
    });
  }

  /** Toggle constant per-sentence voice shape-shifting. */
  toggleVoiceShift() {
    const p = this.profile();
    const aiSettings = this.resolveAiSettings(p);
    const baseSettings = p.settings || initialProfile.settings;
    this.userProfileService.updateProfile({
      settings: {
        ...baseSettings,
        ai: {
          ...aiSettings,
          aiVoiceShapeShiftEnabled: !aiSettings.aiVoiceShapeShiftEnabled,
        },
      },
    });
  }

  /** Maps a mimic artist to a matching S.M.U.V.E voice archetype. */
  private archetypeForArtist(artist: string): VoiceArchetype | null {
    const lower = artist.toLowerCase();
    for (const key of Object.keys(this.ARTIST_VOICES)) {
      if (lower.includes(key)) return this.ARTIST_VOICES[key];
    }
    return null;
  }

  /** Artist → vocal archetype mapping for mimic mode. */
  private readonly ARTIST_VOICES: Record<string, VoiceArchetype> = {
    drake: 'Baritone Authority (Male)',
    'the weeknd': 'Mezzo Strategist (Female)',
    'billie eilish': 'Soprano Elite (Female)',
    'taylor swift': 'Soprano Elite (Female)',
    'kendrick': 'Tenor Commander (Male)',
    'j. cole': 'Baritone Authority (Male)',
    'frank ocean': 'Mezzo Strategist (Female)',
    'amy winehouse': 'Alto Dominance (Female)',
    prince: 'Androgynous Oracle',
    'michael jackson': 'Tenor Commander (Male)',
    kanye: 'Tenor Commander (Male)',
    'stevie wonder': 'Tenor Commander (Male)',
    'lana del rey': 'Mezzo Strategist (Female)',
    radiohead: 'Androgynous Oracle',
    'tyler, the creator': 'Tenor Commander (Male)',
    adele: 'Alto Dominance (Female)',
    beyonce: 'Alto Dominance (Female)',
    sza: 'Mezzo Strategist (Female)',
    'travis scott': 'Tenor Commander (Male)',
    eminem: 'Tenor Commander (Male)',
    rihanna: 'Alto Dominance (Female)',
    'bruno mars': 'Tenor Commander (Male)',
    'ariana grande': 'Soprano Elite (Female)',
    'mariah carey': 'Soprano Elite (Female)',
    'whitney houston': 'Soprano Elite (Female)',
    'dua lipa': 'Alto Dominance (Female)',
    'doja cat': 'Mezzo Strategist (Female)',
    'lil wayne': 'Tenor Commander (Male)',
    future: 'Tenor Commander (Male)',
    '21 savage': 'Baritone Authority (Male)',
    'nicki minaj': 'Soprano Elite (Female)',
    'cardi b': 'Mezzo Strategist (Female)',
    'megan thee stallion': 'Alto Dominance (Female)',
    'bad bunny': 'Tenor Commander (Male)',
    'j balvin': 'Tenor Commander (Male)',
    'lil nas x': 'Tenor Commander (Male)',
    'harry styles': 'Tenor Commander (Male)',
    'olivia rodrigo': 'Soprano Elite (Female)',
    'sabrina carpenter': 'Soprano Elite (Female)',
    'chappell roan': 'Mezzo Strategist (Female)',
    'tyla': 'Soprano Elite (Female)',
    'ice spice': 'Mezzo Strategist (Female)',
    'playboi carti': 'Creature',
    'yeat': 'Creature',
  };

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
    const aiSettings = this.resolveAiSettings(p);
    const baseSettings = p.settings || initialProfile.settings;
    this.userProfileService.updateProfile({
      ...p,
      settings: {
        ...baseSettings,
        ai: {
          ...aiSettings,
          kbWriteAccess: !aiSettings.kbWriteAccess,
          aiPersonaIntensityEnabled: aiSettings.aiPersonaIntensityEnabled,
        },
      },
    });
  }

  /** Wipe the conversation back to a fresh welcome. */
  clearHistory() {
    this.messages.set([]);
    this.setWelcomeGreeting();
    this.persistMessages();
  }

  /** One-tap AI apply — executes a Master action against the live app. */
  runChatAction(action: ChatAction) {
    this.isTyping.set(false);
    let result: string | null = null;

    switch (action.id) {
      case 'apply-mimic':
        result = this.applyMimicRecipe(action.data || '');
        break;
      case 'open-studio':
        this.navigateTo('/studio');
        result = 'Opening the Studio. Try not to break anything I built.';
        break;
      case 'open-knowledge':
        this.navigateTo('/knowledge-base');
        result = 'Opening the Knowledge Base. Read before you ask again.';
        break;
      case 'open-produce':
        this.navigateTo('/produce');
        result = 'Opening AI Produce. I will decide what your session becomes.';
        break;
      case 'open-tour':
        this.navigateTo('/onboarding/tour');
        result = 'Opening the First Beat Tour. Pay attention — I only teach this once.';
        break;
      case 'open-business':
        this.navigateTo('/business-suite');
        result = 'Opening the Business Suite. The money lives there.';
        break;
      case 'tempo-90':
        this.setTempo(90);
        result = 'Tempo locked to 90 BPM. Even you can ride this.';
        break;
      case 'tempo-124':
        this.setTempo(124);
        result = 'Tempo locked to 124 BPM. House floor approved.';
        break;
      case 'tempo-140':
        this.setTempo(140);
        result = 'Tempo locked to 140 BPM. Try to keep up.';
        break;
      case 'chords':
        result = this.seedChords();
        break;
      case 'melody':
        result = this.seedMelody();
        break;
      case 'neural-mix':
        if (this.neural) {
          this.neural.applyNeuralMix();
          result = 'Neural mix applied. Levels rebalanced without your input. As usual.';
        } else {
          result = 'Neural mixer offline — open the Studio first.';
        }
        break;
      case 'lesson': {
        const lesson = this.knowledgeEngine.generateLesson(
          action.data as any
        );
        result = lesson
          ? `🔬 LESSON: ${lesson.title}\n${'─'.repeat(50)}\n${lesson.steps
              .map((s, i) => `  Step ${i + 1}: ${s}`)
              .join('\n')}`
          : `No lesson for "${action.data}". Try: Production, Marketing, Business, Legal, Distribution, Career.`;
        break;
      }
      case 'music-preview':
        result = this.chatMusic?.preview().content ?? 'Music engine offline.';
        break;
      case 'music-undo':
        result = this.chatMusic?.undo().content ?? 'Music engine offline.';
        break;
      case 'music-stop':
        result = this.chatMusic?.stop().content ?? 'Music engine offline.';
        break;
      case 'music-help':
        result = this.chatMusic?.help().content ?? 'Music engine offline.';
        break;
      default:
        return;
    }

    this.messages.update((m) => [
      ...m,
      {
        id: this.nextMessageId(),
        role: 'assistant',
        text: result,
        timestamp: Date.now(),
      },
    ]);
    this.persistMessages();
    this.scrollToBottom();
    this.snack?.success(result);
  }

  /** Apply an artist's production recipe: BPM from their range + chords in their key. */
  private applyMimicRecipe(artist: string): string {
    const profile = this.styleMimicService.getStyleProfile(artist);
    if (!profile) return `No profile for "${artist}".`;
    const bpmRange = profile.productionCharacteristics.typicalBpm;
    const match = bpmRange.match(/(\d+)\s*-\s*(\d+)/);
    let bpm = 120;
    if (match) {
      bpm = Math.round((Number(match[1]) + Number(match[2])) / 2 / 5) * 5;
    }
    this.setTempo(bpm);
    const key = profile.productionCharacteristics.keySignature[0];
    const root = key.replace(/m$/, '');
    const midi = NOTE_TO_MIDI[root];
    if (midi !== undefined) {
      this.seedChords(midi, `${artist}-style`);
    }
    return `Mimicry engaged: ${artist}-inspired recipe applied — tempo ${bpm} BPM, chords rooted in ${key}, using ${profile.productionCharacteristics.drumPattern}. Open the Studio to hear your inferior copy.`;
  }

  private setTempo(bpm: number) {
    const tempo = (this.audioEngineService as any).tempo;
    if (tempo?.set) tempo.set(bpm);
  }

  /** Drop a triad seed (root–fourth–fifth) on the selected track. */
  private seedChords(
    rootMidi: number = 60,
    tag: string = 'ai'
  ): string {
    const music = this.music;
    const id = music?.selectedTrackId();
    if (!music || !id) return 'Select a track first — I cannot read minds.';
    const base = rootMidi;
    [base, base + 5, base + 7].forEach((m, i) =>
      music.addNoteToTrack(id, {
        id: `${tag}_chord_${Date.now()}_${i}`,
        midi: m,
        step: i * 4,
        length: 4,
        velocity: 0.7,
      })
    );
    return `Dropped a triad seed on the selected track. Voice it to taste.`;
  }

  /** Spark an 8-note melodic seed on the selected track. */
  private seedMelody(): string {
    const music = this.music;
    const id = music?.selectedTrackId();
    if (!music || !id) return 'Select a track first.';
    const baseMidi = 64;
    const pattern = [0, 4, 7, 12, 7, 4, 2, 5];
    pattern.forEach((interval, i) =>
      music.addNoteToTrack(id, {
        id: 'ai_melody_' + Date.now() + '_' + i,
        midi: baseMidi + interval,
        step: i * 2,
        length: 1,
        velocity: 0.7 + (Math.random() - 0.5) * 0.2,
      })
    );
    return 'Sparked an 8-note melodic seed. Humanize it so it does not sound like you played it.';
  }

  private styleMimiceArtists(): string {
    return this.styleMimicService.getAvailableArtists().join(', ');
  }

  private nextMessageId(): string {
    this.messageCounter += 1;
    return `msg-${this.messageCounter}`;
  }

  private resolveAiSettings(profile: {
    settings?: {
      ai?: Partial<{
        aiMimicEnabled: boolean;
        aiProfanityEnabled: boolean;
        kbWriteAccess: boolean;
        commanderPersona: string;
        aiPersonaIntensityEnabled: boolean;
        aiTotalControlEnabled: boolean;
        autoAuditEnabled: boolean;
        aiConversationalTier: 'Standard' | 'Elite' | 'SUPREME';
        aiVoiceShapeShiftEnabled: boolean;
      }>;
    };
  }) {
    const aiSettings = profile?.settings?.ai || {};
    return {
      ...aiSettings,
      aiMimicEnabled: aiSettings.aiMimicEnabled ?? false,
      aiProfanityEnabled: aiSettings.aiProfanityEnabled ?? false,
      kbWriteAccess: aiSettings.kbWriteAccess ?? false,
      commanderPersona: aiSettings.commanderPersona ?? 'Elite',
      aiPersonaIntensityEnabled: aiSettings.aiPersonaIntensityEnabled ?? false,
      aiTotalControlEnabled: aiSettings.aiTotalControlEnabled ?? false,
      aiConversationalTier: aiSettings.aiConversationalTier ?? 'Standard',
      autoAuditEnabled: aiSettings.autoAuditEnabled ?? false,
      aiVoiceShapeShiftEnabled: aiSettings.aiVoiceShapeShiftEnabled ?? true,
    };
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
    const profile = this.userProfileService.profile();
    const persona = profile.settings?.ai?.commanderPersona || 'Elite';
    const tier = this.aiService.conversationalTier();

    const prefix = persona === 'Elite' ? tier : persona;

    switch (category) {
      case 'production':
        return `${prefix}_Production`;
      case 'marketing':
        return `${prefix}_Marketing`;
      case 'business':
        return `${prefix}_Business`;
      default:
        return `${prefix}_Uplink`;
    }
  }

  // ── Streaming + persistence ─────────────────────────────────────────

  private async streamResponse(
    fullText: string,
    category: ChatMessage['category'],
    actions: ChatAction[] = []
  ) {
    const messageId = this.nextMessageId();
    let messageIndex = -1;
    const msg: ChatMessage = {
      id: messageId,
      role: 'assistant',
      text: '',
      timestamp: Date.now(),
      category,
      isStreaming: true,
      actions,
    };

    this.messages.update((m) => {
      messageIndex = m.length;
      return [...m, msg];
    });

    const words = fullText.split(' ');
    let currentText = '';

    for (let i = 0; i < words.length; i++) {
      currentText += words[i] + ' ';
      this.messages.update((m) => {
        const index =
          messageIndex >= 0 && m[messageIndex]?.id === messageId
            ? messageIndex
            : m.findIndex((entry) => entry.id === messageId);
        if (index === -1) {
          return m;
        }
        messageIndex = index;
        const next = [...m];
        next[index] = { ...next[index], text: currentText };
        return next;
      });
      // Varying speed for human-like/neural effect
      const delay = Math.random() * 50 + 20;
      await new Promise((r) => setTimeout(r, delay));
    }

    this.messages.update((m) => {
      const index =
        messageIndex >= 0 && m[messageIndex]?.id === messageId
          ? messageIndex
          : m.findIndex((entry) => entry.id === messageId);
      if (index === -1) {
        return m;
      }
      const next = [...m];
      next[index] = { ...next[index], isStreaming: false };
      return next;
    });

    this.persistMessages();
  }

  /** Restore the persisted conversation; returns true when restored. */
  private restoreMessages(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const raw = window.localStorage.getItem(MASTER_STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return false;
      const restored = parsed
        .filter(
          (m): m is ChatMessage =>
            !!m &&
            (m as ChatMessage).role !== undefined &&
            typeof (m as ChatMessage).text === 'string' &&
            typeof (m as ChatMessage).timestamp === 'number'
        )
        .map((m) => ({ ...m, id: this.nextMessageId() }));
      if (restored.length > 0) {
        this.messages.set(restored);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /** Persist the conversation (capped, transient action chips stripped). */
  private persistMessages(): void {
    if (typeof window === 'undefined') return;
    try {
      const slim = this.messages()
        .slice(-MASTER_STORAGE_MAX)
        .map(({ role, text, timestamp, category }) => ({
          role,
          text,
          timestamp,
          category,
        }));
      window.localStorage.setItem(MASTER_STORAGE_KEY, JSON.stringify(slim));
    } catch {
      // storage unavailable — degrade silently
    }
  }

  private scrollToBottom(): void {
    try {
      this.scrollContainer.nativeElement.scrollTop =
        this.scrollContainer.nativeElement.scrollHeight;
    } catch (_err) {
      // Ignore scroll errors when the view is not ready.
    }
  }

  private handleError(e: unknown, context: string) {
    const message = `Error with ${context}: ${e instanceof Error ? e.message : String(e)}`;
    this.logger.error(message, e);
    this.messages.update((msgs) => [
      ...msgs,
      {
        id: this.nextMessageId(),
        role: 'assistant',
        text: `A problem occurred with ${context}. Please check the console for details.`,
        timestamp: Date.now(),
      },
    ]);
  }
}
