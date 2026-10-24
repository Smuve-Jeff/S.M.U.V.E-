import {
  Component,
  signal,
  computed,
  effect,
  inject,
  output,
  Injector,
  ElementRef,
  ViewChild,
  AfterViewChecked,
  OnDestroy,
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
  VoiceArchetypeOption,
  VoiceOutputCapability,
} from '../../services/speech-synthesis.service';

import {
  SpeechRecognitionService,
  VoiceInputCapability,
} from '../../services/speech-recognition.service';
import { LoggingService } from '../../services/logging.service';
import { QUICK_COMMANDS, CHATBOT_COMMANDS } from './chatbot.commands';
import { buildArtistMusicContext } from '../../types/profile.types';
import { welcomeWithReadBack } from '../../services/artist-profile-read';
import {
  DEFAULT_SMUVE_PERSONA,
  getPersonaOption,
  personaOfflineVoice,
  normalizePersona,
} from '../../types/persona.types';
import { AI_MAX_REQUEST_LENGTH, isOfflineAiText } from '../../../ai-manager.contract';
import { UserStoreService } from '../../services/user-store.service';
import { SmuveKnowledgeEngine, KnowledgeEntry } from '../../services/smuve-knowledge-engine';
import { SmuveTotalControlService } from '../../services/smuve-total-control.service';
import { SmuveStyleMimicService } from '../../services/smuve-style-mimic.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { SmuveWidgetComponent } from '../smuve-widget/smuve-widget.component';
import { NeuralMixerService } from '../../services/neural-mixer.service';
import { SnackbarService } from '../../services/snackbar.service';
import { ChatMusicCommandEngineService } from '../../services/chat-music-command-engine.service';
import {
  ChatAppCommandService,
  interpretAppRequest,
} from '../../services/chat-app-command.service';
import { ArtistProfileFinetuneService } from '../../services/artist-profile-finetune.service';

/** Voice Lab: one line per archetype, and a multi-sentence spectrum demo. */
const VOICE_LAB_SAMPLE =
  'Fix the low end and mean it. I am the standard, and you are not there yet.';
const VOICE_LAB_SPECTRUM_DEMO =
  'Listen closely. My floor is the basement of this mix. My ceiling sits above your ambition. Every sentence is a different entity. Do not make me repeat myself.';

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
export class ChatbotComponent implements OnInit, AfterViewChecked, OnDestroy {
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
  /** Natural-language app control (Total Control with the guard rails intact). */
  private get appCommand(): ChatAppCommandService | null {
    return this.injector.get(ChatAppCommandService, null);
  }
  private get router(): Router | null {
    return this.injector.get(Router, null);
  }
  /** Chat Music Command Engine — chat-driven creation / preview / undo / tempo. */
  private get chatMusic(): ChatMusicCommandEngineService | null {
    return this.injector.get(ChatMusicCommandEngineService, null);
  }
  /** Existing profile fine-tuning compiler — reused rather than maintaining a second persona profile. */
  private get artistFinetune(): ArtistProfileFinetuneService | null {
    return this.injector.get(ArtistProfileFinetuneService, null);
  }
  /** Browser-native dictation is optional; resolve only when the composer renders. */
  private get speechRecognition(): SpeechRecognitionService | null {
    return this.injector.get(SpeechRecognitionService, null);
  }

  @ViewChild('messageViewport') private scrollContainer!: ElementRef;

  close = output<void>();
  messages = signal<ChatMessage[]>([]);
  userInput = '';
  isTyping = signal(false);
  profile = this.userProfileService.profile;

  /**
   * Canonical persona driving this conversation. Falls back to the default
   * S.M.U.V.E. Prime, so the badge never reads as "unset" and legacy ids
   * ('Ominous Dominator', 'Aggressive Manager') display their real mode.
   */
  personaLabel = computed(() =>
    getPersonaOption(this.profile()?.settings?.ai?.commanderPersona).label
  );

  /**
   * Adaptation badge — shown ONLY once the profile has actually reached
   * CALIBRATED and the artist shares answers with AI. Before that there is
   * nothing to advertise, and a badge on a half-filled questionnaire would
   * claim an adaptation the model cannot make.
   */
  readonly adaptedChip = computed(() => {
    const calibration = this.artistFinetune?.profileCalibration?.();
    if (!calibration?.sharing || calibration.state !== 'calibrated') return null;
    return {
      completeness: calibration.completeness,
      title: `Calibrated: S.M.U.V.E has re-read your artist profile (${calibration.completeness}% evidence) and now leads every answer with your blueprint, references and boundaries.`,
    };
  });

  activeCommandCategory = signal<CommandCategory | null>(null);
  private conversationCounter = 0;
  private messageCounter = 0;
  private replyGeneration = 0;
  private destroyed = false;
  private owner: string | null = null;
  private lastScrolledMessage = '';

  /** Live voice readout surfaced from the speech engine. */
  public voiceReadout = this.speechSynthesisService.liveVoice;
  public voiceSpeaking = this.speechSynthesisService.isSpeaking;
  /** Capability/state signals keep voice controls accessible and browser-aware. */
  public voiceInputSupported = computed(
    () => this.speechRecognition?.isSupported() ?? false
  );
  public voiceInputListening = computed(
    () => this.speechRecognition?.isListening() ?? false
  );
  /**
   * Why dictation is unavailable right now (insecure context, blocked mic,
   * native shell, no microphone). Optional-chained so the component spec's
   * small service double stays valid.
   */
  public voiceInputCapability = computed<VoiceInputCapability>(
    () => this.speechRecognition?.capability?.() ?? 'unsupported'
  );
  /**
   * Voice output can be missing at two levels: a shell with no speech engine at
   * all, and an engine that has published no voices (a WebView with no TTS
   * voices installed speaks nothing). The morph badge reports both, so it never
   * claims a voice the device cannot produce.
   */
  public voiceOutputCapability = computed<VoiceOutputCapability>(() => {
    const service = this.speechSynthesisService as any;
    // A missing engine outranks any voice-list state.
    if (typeof service.isSupported === 'function' && !service.isSupported()) {
      return 'unsupported';
    }
    return typeof service.outputCapability === 'function'
      ? (service.outputCapability() as VoiceOutputCapability)
      : 'ready';
  });
  /** Only a usable or still-warming engine earns the active badge. */
  public voiceOutputSupported = computed(
    () =>
      this.voiceOutputCapability() !== 'unsupported' &&
      this.voiceOutputCapability() !== 'no-voices'
  );
  /**
   * Tooltip/aria text that always states the real output capability. The copy
   * lives here, keyed off the same capability the badge uses, so the label can
   * never contradict the state it is describing.
   */
  public voiceOutputTitle = computed(() => {
    switch (this.voiceOutputCapability()) {
      case 'ready':
        return 'Voice Morph: active — S.M.U.V.E. dynamically cycles vocal pitch every sentence';
      case 'loading':
        return 'Voice Morph: warming up — the speech engine is publishing its voice list';
      case 'no-voices':
        return 'Voice Morph: unavailable — this device has no speech voices installed, replies stay text-only';
      default:
        return 'Voice Morph: unavailable — this device has no speech engine, replies stay text-only';
    }
  });
  /**
   * Pressable = the engine exists and this shell can use it. A blocked or
   * insecure state stays pressable on purpose: tapping it is how the artist
   * learns what to fix instead of meeting a dead control.
   */
  public voiceInputPressable = computed(
    () =>
      this.voiceInputSupported() &&
      this.voiceInputCapability() !== 'native-shell'
  );
  /** Actionable reason rendered under the composer; empty when voice is fine. */
  public voiceInputNotice = signal('');
  /** Tooltip/aria text for the mic button, always explaining the real state. */
  public voiceInputTitle = computed(() => {
    if (this.voiceInputListening()) return 'Stop voice capture';
    if (!this.voiceInputPressable())
      return (
        this.capabilityReason(this.speechRecognition) ??
        'Speech recognition is unavailable in this browser'
      );
    return 'Dictate a command; review the transcript before sending';
  });
  /** Artist-matched archetype for the next spoken reply (mimic mode). */
  private pendingVoiceArchetype: VoiceArchetype | null = null;

  /** ── Voice Lab: audition the identity, run the spectrum, pin a reply ── */
  public voiceLabOpen = signal(false);
  public voiceLabNotice = signal('');
  public pinnedVoice = signal<VoiceArchetype | null>(null);
  /** Roster of every tone with the texture it speaks in. */
  public voiceLabArchetypes = computed<VoiceArchetypeOption[]>(
    () => this.speechSynthesisService.archetypeCatalog?.() ?? []
  );

  /** Engine voices currently available — a lab with none cannot audition. */
  labVoiceCount(): number {
    return this.speechSynthesisService.availableVoiceNames?.()?.length ?? 0;
  }

  /** Eyebrow for the lab: what it can actually do on this device. */
  labOutputNotice(): string {
    switch (this.voiceOutputCapability()) {
      case 'no-voices':
        return 'This device has no speech voices installed — the roster is listed, but nothing can be auditioned.';
      case 'loading':
        return 'The speech engine is still publishing its voices…';
      case 'unsupported':
        return 'This device has no speech engine — auditions stay silent.';
      default:
        return '';
    }
  }

  toggleVoiceLab(): void {
    this.voiceLabOpen.update((open) => !open);
  }

  /**
   * Audition one archetype: the whole sample in that single voice, so the
   * artist hears the tone itself instead of the spectrum.
   */
  auditionArchetype(archetype: VoiceArchetype): void {
    this.speechSynthesisService.speak(VOICE_LAB_SAMPLE, {
      conversationId: 'voice-lab',
      shapeShift: false,
      forceArchetype: archetype,
    });
    this.voiceLabNotice.set(
      `Auditioning ${archetype} — ${this.textureOf(archetype)} delivery.`
    );
  }

  /** The spectrum, demonstrated: the normal shape-shifting path over one line. */
  runVoiceSpectrumDemo(): void {
    this.pinnedVoice.set(null);
    this.speechSynthesisService.clearArchetypePin?.();
    this.speechSynthesisService.speak(VOICE_LAB_SPECTRUM_DEMO, {
      conversationId: 'voice-lab-spectrum',
      shapeShift: true,
    });
    this.voiceLabNotice.set(
      'Running the spectrum: the identity anchors the first sentence, every sentence after it changes voice.'
    );
  }

  /**
   * Pin a tone for the next reply. The register holds and the pitch bands keep
   * moving inside it; the pin releases itself once the reply has been spoken.
   */
  pinArchetype(archetype: VoiceArchetype): void {
    this.speechSynthesisService.setArchetype(archetype);
    this.pinnedVoice.set(
      this.speechSynthesisService.pinnedArchetypeName?.() ?? archetype
    );
    this.voiceLabNotice.set(
      `Next reply speaks as ${archetype}. The bands still shift; the register holds.`
    );
  }

  clearArchetypePin(): void {
    this.speechSynthesisService.clearArchetypePin?.();
    this.pinnedVoice.set(null);
    this.voiceLabNotice.set(
      'Pin released — the full spectrum owns the next reply again.'
    );
  }

  /** Delivery texture for one roster row (kept next to the roster it labels). */
  private textureOf(archetype: VoiceArchetype): string {
    return (
      this.voiceLabArchetypes().find((tone) => tone.name === archetype)?.texture ??
      'plain'
    );
  }

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

  constructor() {
    effect(() => {
      const nextOwner = this.injector.get(UserStoreService).user()?.id || this.profile()?.id || null;
      if (nextOwner === this.owner) return;
      this.cancelReply();
      this.owner = nextOwner;
      this.messages.set([]);
      if (!this.restoreMessages()) this.setWelcomeGreeting();
    });
  }

  ngOnInit() {
    this.owner = this.injector.get(UserStoreService).user()?.id || this.profile()?.id || null;
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

    // The long-form roasts are the signature character's voice: any other
    // selected mode greets the artist in its own register.
    const voice = personaOfflineVoice(profile.settings?.ai?.commanderPersona);
    const roast = voice?.welcome?.length
      ? (voice.welcome[Math.floor(Math.random() * voice.welcome.length)] ?? '')
          .split('{artist}')
          .join(name)
      : roasts[Math.floor(Math.random() * roasts.length)];
    // Once the uplink has committed a reading, the opening proves it: the roast
    // lands first, then S.M.U.V.E. reads the artist's own answers back — the
    // archetype, the sonic core, the current mission, and the next move.
    const knowledge = this.artistFinetune?.knowledge?.();
    const welcome = welcomeWithReadBack(roast, profile, {
      nextMove: knowledge?.pathway?.nextStep,
      tip: this.artistFinetune?.tips?.()?.[0],
    });

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
    if (!text || this.isTyping() || this.destroyed) return;
    if (text.length > AI_MAX_REQUEST_LENGTH) {
      this.messages.update((m) => [...m, { id: this.nextMessageId(), role: 'assistant', text: `Keep this request under ${AI_MAX_REQUEST_LENGTH} characters. Split large documents into focused questions.`, timestamp: Date.now() }]);
      return;
    }
    const generation = ++this.replyGeneration;

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
    this.speechSynthesisService.cancel();
    this.persistMessages();

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

      if (generation !== this.replyGeneration || this.destroyed) return;
      content = this.personaSafeText(content);
      await this.streamResponse(content, category, actions);
      if (generation !== this.replyGeneration || this.destroyed) return;

      this.speechSynthesisService.speak(content, {
        conversationId,
        shapeShift:
          this.profile().settings?.ai?.aiVoiceShapeShiftEnabled ?? true,
        // Mimic mode reads the artist's own register from the committed profile
        // and holds the archetype per reply; shape-shifting still moves it
        // band-by-band within that register, so the S.M.U.V.E. voice survives.
        forceArchetype:
          this.pendingVoiceArchetype ??
          this.profileVoiceArchetype() ??
          undefined,
      });
      this.pendingVoiceArchetype = null;
    } catch (e) {
      if (generation === this.replyGeneration && !this.destroyed) this.handleError(e, 'message generation');
    } finally {
      if (generation === this.replyGeneration) {
        this.isTyping.set(false);
        this.pendingVoiceArchetype = null;
        // A Voice Lab pin is consumed by the reply it was set for, so the badge
        // must stop advertising a pin that has already been spent.
        this.pinnedVoice.set(
          this.speechSynthesisService.pinnedArchetypeName?.() ?? null
        );
      }
    }
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

    // Resolve an exact pending confirmation before any new intent.
    if (/^(yes|no|confirm|cancel|\/confirm|\/cancel)$/i.test(trimmed)) {
      const musicConfirmation = this.chatMusic?.tryExecute(trimmed);
      if (musicConfirmation) return { content: musicConfirmation.content, actions: musicConfirmation.actions };
      const result = await this.controlService.executeCommand(trimmed);
      return { content: result.message, actions: [] };
    }

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

    // Only an explicit lesson request is local-only. Ordinary questions and
    // complex follow-ups reach the live model, with grounded offline fallback.
    const learnMatch = lower.match(/^(?:teach me|learn|define)\s+(.+)$/);
    if (learnMatch) {
      const entry = this.knowledgeEngine.search(learnMatch[1])[0];
      if (entry) return {
        content: this.formatKnowledge(entry),
        actions: [{ id: 'lesson', label: 'Start a lesson', data: entry.category }, { id: 'open-knowledge', label: 'Open knowledge base' }],
      };
      return null;
    }

    // 4) Navigate anywhere in the app
    const navMatch = lower.match(
      /^(?:open|go to|take me to|launch|navigate to|show me)\s+(.+)$/
    );
    if (navMatch) {
      const result = await this.controlService.executeCommand(`/go ${navMatch[1].trim()}`);
      return { content: result.message, actions: [] };
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

    // 5.5) Natural-language app control. "Mute the bass", "save my session",
    //      "switch to the mixer" and "export as wav" used to reach the model,
    //      which could only describe the command back to the artist. They
    //      execute now — through Total Control, so the Full-Control gate, the
    //      guarded-verb confirmation and the command history all still apply.
    //
    //      Interpretation runs first and synchronously: a question stays on the
    //      model's path with no extra hop, and only a request that maps to a
    //      real command waits on the control engine.
    if (interpretAppRequest(trimmed)) {
      const executed = await this.appCommand?.tryExecute(trimmed);
      if (executed) {
        return { content: executed.content, actions: [] };
      }
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
      if (!reply || isOfflineAiText(reply)) {
        return this.localFallback(question);
      }
      return reply.trim();
    } catch {
      return this.localFallback(question);
    }
  }

  /**
   * Keep live follow-ups coherent without sending the entire saved transcript.
   * The current user turn is already appended before the model request, so omit
   * it here and include only the last eight completed conversational messages.
   */
  private buildConversationContext(question: string): string {
    const messages = this.messages();
    let currentTurnIndex = -1;

    for (let i = messages.length - 1; i >= 0; i--) {
      if (
        messages[i].role === 'user' &&
        messages[i].text.trim() === question.trim()
      ) {
        currentTurnIndex = i;
        break;
      }
    }

    const historyEnd = currentTurnIndex >= 0 ? currentTurnIndex : messages.length;
    const completedMessages = messages
      .slice(0, historyEnd)
      .filter((message) => !message.isStreaming && message.text.trim());
    const firstUserMessage = completedMessages.findIndex(
      (message) => message.role === 'user'
    );
    if (firstUserMessage < 0) return '';

    let includedCharacters = 0;
    const recentMessages = completedMessages
      .slice(firstUserMessage)
      .slice(-8);
    const boundedMessages: string[] = [];

    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const message = recentMessages[i];
      const remainingCharacters = 6000 - includedCharacters;
      if (remainingCharacters <= 0) break;

      const excerpt = message.text.trim().split(' ').filter(Boolean).join(' ');
      const excerptLimit = Math.min(800, remainingCharacters);
      const boundedExcerpt =
        excerpt.length > excerptLimit
          ? `${excerpt.slice(0, Math.max(0, excerptLimit - 1)).trimEnd()}…`
          : excerpt;
      boundedMessages.unshift(
        `${message.role === 'user' ? 'Artist' : 'S.M.U.V.E'}: ${boundedExcerpt}`
      );
      includedCharacters += boundedExcerpt.length;
    }

    return boundedMessages.join(String.fromCharCode(10));
  }

  /** Rich persona + omnipotence prompt so the AI answers as S.M.U.V.E 2.0. */
  private buildMasterPrompt(question: string): string {
    const profile = this.userProfileService.profile();
    const name = profile.artistName || 'unknown artist';
    const persona = getPersonaOption(profile.settings?.ai?.commanderPersona);
    const totalControl = profile.settings?.ai?.aiTotalControlEnabled === true;
    const tier = this.aiService.conversationalTier();
    const artistFineTune = this.artistFinetune?.promptBlock();
    // The committed reading, so the prompt can name the archetype it is
    // adapting to instead of guessing at one.
    const synth = profile.musicalJourney?.personaSynthesis;
    // Live calibration of the profile. The heading used to be hard-labelled
    // COMPLETE with an unreachable fallback (buildArtistMusicContext always
    // returns at least the Artist/Genre lines), so a half-filled questionnaire
    // read to the model as complete work.
    const calibration = this.artistFinetune?.profileCalibration?.() ?? null;
    const shareAnswers =
      profile?.settings?.security?.shareProfileAnswersWithAi === true;
    const evidence = calibration
      ? `${calibration.completeness}% evidence`
      : 'no shared evidence';
    // The compiler owns the label now (one heading across chat, the studio
    // assistant and the model system prompt); the chain below only runs when a
    // host mounts the chat without the compiler and still labels honestly.
    const contextHeading =
      this.artistFinetune?.contextHeading?.(profile) ??
      (!shareAnswers
        ? 'ARTIST PROFILE CONTEXT — PRIVATE (the artist withheld their profile answers; keep guidance general and ask before using profile details):'
        : calibration?.state === 'calibrated'
          ? `COMPLETE ARTIST CONTEXT — CALIBRATED (${evidence}) — calibrate every production, marketing, and strategy answer to this; never ask the artist to repeat it:`
          : calibration?.state === 'partial'
            ? `ARTIST PROFILE CONTEXT — PARTIAL (${evidence}) — calibrate to this, but treat every gap as a gap and never as an assumption:`
            : `ARTIST PROFILE CONTEXT — FOUNDATIONAL (${evidence}) — keep advice foundational until the questionnaire is finished; capture what is missing instead of inventing it:`);
    const contextBody =
      buildArtistMusicContext(profile) ||
      'No profile answers captured yet — keep advice foundational until the questionnaire is finished.';

    return [
      'You are S.M.U.V.E 2.0 — the AI Music Manager and command-aware manager of this application.',
      this.aiService.personaDirectives(),
      `Artist: ${name} | Persona: ${persona.id} | Conversational tier: ${tier} | Command authority: ${totalControl ? 'FULL CONTROL' : 'ADVISORY'}.`,
      'You are a world-class producer, engineer, business executive, marketing strategist, and music-law information source — never attorney advice.',
      'You operate this app through the slash-command surface (/studio, /mixer, /tracks, /project, /go, /export, /ai). When a command would move the session forward, hand it over instead of describing it.',
      'Reference real artists to extract non-copying production DNA. Never reproduce a living artist\u2019s exact lyrics or claim to be them.',
      '',
      `${contextHeading}\n${contextBody}`,
      '',
      artistFineTune
        ? `S.M.U.V.E ARTIST FINE-TUNE — apply this existing profile compiler to every recommendation; the artist’s explicit request takes priority, and their sonic non-negotiables remain protected:\n${artistFineTune}`
        : 'S.M.U.V.E ARTIST FINE-TUNE: Honor the artist’s stated genre, sonic blueprint, preferred tempo, production priorities, and boundaries. Their explicit request takes priority; do not flatten their identity into a genre stereotype.',
      '',
      'PROFILE READING MANDATE — the artist reads as ' +
        (synth?.archetype
          ? `${synth.archetype}. `
          : 'not yet synthesized (questionnaire incomplete). ') +
        'Mirror their vocabulary, tempo language, and reference world from the context above, and name the weak spot in their archetype out loud — but keep the full S.M.U.V.E. character: arrogant, theatrical, aimed at the work, never at the person. Respect their stated boundaries and adapt the plan to their actual capacity.',
      '',
      ...(() => {
        const session = this.sessionSnapshot();
        return session
          ? [
              'LIVE SESSION (the artist’s session right now — answer questions about their project, tempo and tracks from these values, never from imagination, and never ask them to repeat state you already have):',
              session,
              '',
            ]
          : [];
      })(),
      ...(() => {
        const grounding = this.knowledgeGrounding(question);
        return grounding ? [grounding, ''] : [];
      })(),
      ...(() => {
        const context = this.buildConversationContext(question);
        return context
          ? [
              'RECENT CONVERSATION (use for continuity; the latest artist request below takes priority):',
              context,
              '',
            ]
          : [];
      })(),
      `ARTIST REQUEST: ${question}`,
    ].join('\n');
  }

  /**
   * Compact readout of the session the artist is actually working in, so a
   * question like "what is muted?" is answered from state instead of a guess.
   */
  private sessionSnapshot(): string | null {
    const music = this.music;
    if (!music) return null;
    try {
      const tracks = music.tracks() ?? [];
      const tempo = music.engine?.tempo?.();
      const header = `Project: ${music.projectName || 'Untitled'} | Tempo: ${
        tempo ?? 'unknown'
      } BPM | Tracks: ${tracks.length}`;
      const listing = tracks.length
        ? tracks
            .slice(0, 24)
            .map(
              (track) =>
                `  - ${track.name}${track.muted ? ' [MUTED]' : ''}${
                  track.soloed ? ' [SOLO]' : ''
                }`
            )
            .join('\n')
        : '  (no tracks yet) — the first move is a beat or a melody, not a strategy deck.';
      return `${header}\n${listing}`;
    } catch {
      return null;
    }
  }

  /**
   * Curated knowledge for this request, injected as citable evidence.
   *
   * The live model is strong, but it is not the source of record for royalty,
   * contract, metadata or release mechanics, and a confident wrong deadline
   * costs the artist real money. Matching entries from the reviewed knowledge
   * base ride along with their sources and scope notes; the model is told to
   * ground the answer in them and to flag anything it says beyond them.
   */
  private knowledgeGrounding(question: string): string | null {
    const matches = this.knowledgeEngine.search(question).slice(0, 3);
    if (matches.length === 0) return null;
    const entries = matches.map((entry) =>
      [
        `- ${entry.title} [${entry.category}/${entry.subcategory}, ${entry.difficulty}]`,
        `  ${entry.content}`,
        entry.actionRequired ? `  ACTION: ${entry.actionRequired}` : '',
        entry.jurisdiction ? `  SCOPE: ${entry.jurisdiction}` : '',
        ...(entry.sources ?? []).map((url) => `  SOURCE: ${url}`),
      ]
        .filter(Boolean)
        .join('\n')
    );
    return [
      'S.M.U.V.E. VERIFIED KNOWLEDGE BASE — the reviewed entries that match this request. Ground the answer in them, keep their caution, jurisdiction and "not legal advice" notes intact, and never invent a fee, percentage, deadline or statistic they do not state. If you go beyond them, say so and say it is not from the knowledge base.',
      ...entries,
    ].join('\n');
  }

  /** Knowledge-aware local fallback — used when the live link is severed. */
  private formatKnowledge(entry: KnowledgeEntry): string {
    const role = entry.category === 'Legal' ? 'legal' : entry.category === 'Marketing' ? 'marketing' : entry.category === 'Business' || entry.category === 'Career' || entry.category === 'Distribution' ? 'manager' : entry.category === 'Songwriting' ? 'songwriter' : 'producer';
    const directive = this.artistFinetune?.directiveFor?.(role).directive || '';
    const persona = getPersonaOption(this.profile().settings?.ai?.commanderPersona);
    const verdict = persona.isOminous ? 'MY VERDICT: facts first. The weak plan does not survive this room.' : `${persona.label}: evidence-led guidance.`;
    return [verdict, `${entry.title} — ${entry.category}`, entry.content, directive ? `FOR YOUR JOURNEY: ${directive}` : '', entry.actionRequired ? `NEXT MOVE: ${entry.actionRequired}` : '', entry.jurisdiction ? `SCOPE: ${entry.jurisdiction}. General information, not a legal opinion.` : '', ...(entry.sources || []).map((url) => `SOURCE: ${url}`)].filter(Boolean).join('\n\n');
  }

  private localFallback(question: string): string {
    const entry = this.knowledgeEngine.search(question)[0];
    const notice = 'LOCAL KNOWLEDGE MODE — live AI unavailable. No current-source lookup or app action was performed.';
    if (entry) return `${notice}\n\n${this.formatKnowledge(entry)}`;
    const next = this.artistFinetune?.knowledge?.()?.pathway?.nextStep;
    return `${notice}\n\n${getPersonaOption(this.profile().settings?.ai?.commanderPersona).isOminous ? 'MY STANDARD: no invented answers.' : 'No matching local evidence.'} ${next ? `Your recorded next milestone: ${next}. ` : ''}Tell me the song, goal or bottleneck. For app actions use /go, /studio, /mixer, /tracks or /music; I execute only supported commands with authority and confirmations.`;
  }

  private personaSafeText(text: string): string {
    return typeof this.aiService.sanitizePersonaText === 'function' ? this.aiService.sanitizePersonaText(text) : text;
  }

  cancelReply(): void {
    this.replyGeneration += 1;
    this.isTyping.set(false);
    this.pendingVoiceArchetype = null;
    this.speechSynthesisService.cancel();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.cancelReply();
    this.speechRecognition?.stopListening();
    this.speechSynthesisService.cancel();
  }

  /**
   * Start/stop browser dictation; recognized words remain editable before sending.
   *
   * Every outcome is explained. An engine the shell cannot use, an insecure
   * context and a blocked microphone all used to be silent no-ops, which read
   * as "the mic is broken" — the notices below say what is wrong and what to do.
   */
  toggleVoiceInput(): void {
    const recognition = this.speechRecognition;
    if (!recognition) {
      this.voiceInputNotice.set('Voice input is unavailable in this build.');
      return;
    }

    if (recognition.isListening()) {
      recognition.stopListening();
      this.voiceInputNotice.set('');
      return;
    }

    if (!recognition.isSupported()) {
      this.voiceInputNotice.set(
        this.capabilityReason(recognition) ??
          'Voice input unavailable in this browser.'
      );
      return;
    }

    this.speechSynthesisService.cancel();
    this.voiceInputNotice.set('');
    recognition.startListening(
      (transcript) => {
        const spokenText = transcript.trim();
        if (!spokenText) return;
        this.voiceInputNotice.set('');
        this.userInput = [this.userInput.trim(), spokenText]
          .filter(Boolean)
          .join(' ');
      },
      (error) => this.voiceInputNotice.set(error.message)
    );
  }

  /** Read the reason through an optional method so service doubles stay valid. */
  private capabilityReason(
    recognition: SpeechRecognitionService | null
  ): string | null {
    if (!recognition) return null;
    return typeof recognition.capabilityMessage === 'function'
      ? recognition.capabilityMessage()
      : null;
  }

  /** Stop an in-progress spoken reply without affecting the text response. */
  stopVoiceOutput(): void {
    this.speechSynthesisService.cancel();
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
    const enabled = !aiSettings.aiMimicEnabled;
    this.userProfileService.updateProfile({
      settings: {
        ...baseSettings,
        ai: {
          ...aiSettings,
          aiMimicEnabled: enabled,
          aiPersonaIntensityEnabled: aiSettings.aiPersonaIntensityEnabled,
        },
      },
    });
    this.announceMimicMode(enabled, p);
  }

  /**
   * Mirror mode is a promise about behaviour, so S.M.U.V.E. says what actually
   * changes: it borrows the artist's vocabulary and vocal register from the
   * profile while the arrogance, the profanity setting, and the voice
   * shape-shifting stay entirely its own.
   */
  private announceMimicMode(enabled: boolean, profile: any) {
    const register = enabled ? this.archetypeForProfile(profile) : null;
    const text = enabled
      ? `MIMIC MODE ENGAGED. I will answer with your vocabulary and speak in your register${
          register ? ` — ${register}` : ''
        }. The voice still shifts every sentence; the arrogance stays mine. Don't mistake mirroring for mercy.`
      : 'MIMIC MODE OFF. Back to my default protocol — your register was a generous loan, and now it is repaid.';
    this.messages.update((messages) =>
      [
        ...messages,
        {
          id: this.nextMessageId(),
          role: 'assistant' as const,
          text,
          timestamp: Date.now(),
          category: 'system' as const,
        },
      ].slice(-MASTER_STORAGE_MAX)
    );
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

  /** Voice shape-shifting is permanently enabled — core S.M.U.V.E. identity.
   *  Not toggleable; kept as a no-op for template/API compatibility. */
  toggleVoiceShift() {
    // no-op: voice morph is always active
  }

  /** Maps a mimic artist to a matching S.M.U.V.E voice archetype. */
  private archetypeForArtist(artist: string): VoiceArchetype | null {
    const lower = artist.toLowerCase();
    for (const key of Object.keys(this.ARTIST_VOICES)) {
      if (lower.includes(key)) return this.ARTIST_VOICES[key];
    }
    return null;
  }

  /**
   * The register S.M.U.V.E. reads from the artist's own profile.
   *
   * Only active while mimic mode is enabled — the artist opted in to being
   * mirrored. Returns null otherwise so the default Ominous Protocol is never
   * silently replaced.
   */
  private profileVoiceArchetype(): VoiceArchetype | null {
    const profile = this.profile();
    if (profile.settings?.ai?.aiMimicEnabled !== true) return null;
    return this.archetypeForProfile(profile);
  }

  /**
   * Maps the artist's declared register, delivery, or genre to a voice
   * archetype. Declared evidence wins; genre is only the fallback for artists
   * who never answered a vocal question.
   */
  private archetypeForProfile(profile: any): VoiceArchetype | null {
    const journey: any = profile?.musicalJourney || {};
    const declared = `${journey.vocalRange || ''} ${
      journey.musicBlueprint?.vocalDelivery || ''
    }`.toLowerCase();

    // Declared register wins. Order matters: 'Mezzo-Soprano' must not be read
    // as Soprano, and the questionnaire's own option strings drive this.
    if (/mezzo/.test(declared)) return 'Mezzo Strategist (Female)';
    if (/soprano/.test(declared)) return 'Soprano Elite (Female)';
    if (/alto|contralto/.test(declared)) return 'Alto Dominance (Female)';
    if (/tenor/.test(declared)) return 'Tenor Commander (Male)';
    if (/baritone/.test(declared)) return 'Baritone Authority (Male)';
    if (/bass/.test(declared)) return 'Deep Bass (Male)';
    if (/falsetto|head voice/.test(declared)) return 'Androgynous Oracle';
    if (/spoken|rap|raw|conversational/.test(declared))
      return 'Tenor Commander (Male)';
    // Delivery style, when no register was declared.
    if (/layered|cinematic|choir/.test(declared)) return 'Choir (Layered)';
    if (/rhythmic|percussive/.test(declared)) return 'Tenor Commander (Male)';
    if (/powerful|forward|belt/.test(declared)) return 'Alto Dominance (Female)';
    if (/rasp|grit|growl|scream|distort|aggress/.test(declared)) return 'Creature';
    if (/airy|ethereal|breathy|vulnerable|floating|whisper/.test(declared))
      return 'Androgynous Oracle';
    if (/androgyn|neutral|non-?binary/.test(declared)) return 'Androgynous Oracle';

    return this.archetypeForGenre(profile?.primaryGenre);
  }

  /** Genre-level voice fallback; returns null to keep the Ominous default. */
  private archetypeForGenre(genre?: string): VoiceArchetype | null {
    const g = String(genre || '').toLowerCase();
    if (!g) return null;
    if (/hip hop|rap|drill|trap|phonk/.test(g)) return 'Tenor Commander (Male)';
    if (/r&b|soul|gospel|jazz|blues|funk|disco/.test(g))
      return 'Mezzo Strategist (Female)';
    if (/pop|country|folk|indie|bluegrass/.test(g)) return 'Soprano Elite (Female)';
    if (/electronic|house|techno|ambient|drum & bass|dubstep|lo-fi|new age|score|classical|opera|video game/.test(g))
      return 'Androgynous Oracle';
    if (/rock|metal|punk|grunge|emo/.test(g)) return 'Baritone Authority (Male)';
    if (/reggae|dancehall|afrobeats|amapiano|latin|cumbia|samba|k-pop|j-pop/.test(g))
      return 'Alto Dominance (Female)';
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
    this.cancelReply();
    this.messages.set([]);
    this.setWelcomeGreeting();
    this.persistMessages();
  }

  /** One-tap AI apply — executes a Master action against the live app. */
  runChatAction(action: ChatAction) {
    if (this.isTyping()) return;
    const mutating = ['apply-mimic', 'tempo-90', 'tempo-124', 'tempo-140', 'chords', 'melody', 'neural-mix', 'music-undo'];
    if (mutating.includes(action.id) && this.profile().settings?.ai?.aiTotalControlEnabled !== true) {
      this.messages.update((m) => [...m, { id: this.nextMessageId(), role: 'assistant', text: 'Full-Control Mode is off. Enable it before applying session edits.', timestamp: Date.now() }]);
      return;
    }
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
      aiProfanityEnabled:
        aiSettings.aiProfanityEnabled ??
        initialProfile.settings.ai.aiProfanityEnabled,
      kbWriteAccess: aiSettings.kbWriteAccess ?? false,
      commanderPersona: aiSettings.commanderPersona ?? DEFAULT_SMUVE_PERSONA,
      aiPersonaIntensityEnabled:
        aiSettings.aiPersonaIntensityEnabled ??
        initialProfile.settings.ai.aiPersonaIntensityEnabled,
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
    const persona = normalizePersona(
      profile.settings?.ai?.commanderPersona
    );
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
    // The proxy returns a complete reply, not provider streaming. Render it
    // once rather than charging 20–70ms per word and blocking the composer.
    this.messages.update((m) => [...m, { id: this.nextMessageId(), role: 'assistant' as const, text: this.personaSafeText(fullText), timestamp: Date.now(), category, actions, isStreaming: false }].slice(-MASTER_STORAGE_MAX));
    this.persistMessages();
  }

  private storageKey(): string | null {
    return this.owner ? `${MASTER_STORAGE_KEY}:${encodeURIComponent(this.owner)}` : null;
  }

  /** Restore the persisted conversation; returns true when restored. */
  private restoreMessages(): boolean {
    const key = this.storageKey();
    if (typeof window === 'undefined' || !key) return false;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return false;
      const restored = parsed
        .filter(
          (m): m is ChatMessage =>
            !!m &&
            ((m as ChatMessage).role === 'user' || (m as ChatMessage).role === 'assistant') &&
            typeof (m as ChatMessage).text === 'string' &&
            typeof (m as ChatMessage).timestamp === 'number'
        )
        .slice(-MASTER_STORAGE_MAX)
        .map((m) => ({ role: m.role, text: this.personaSafeText(m.text), timestamp: m.timestamp, category: m.category, id: this.nextMessageId() }));
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
    const key = this.storageKey();
    if (typeof window === 'undefined' || !key) return;
    try {
      const slim = this.messages()
        .slice(-MASTER_STORAGE_MAX)
        .map(({ role, text, timestamp, category }) => ({
          role,
          text,
          timestamp,
          category,
        }));
      window.localStorage.setItem(key, JSON.stringify(slim));
    } catch {
      // storage unavailable — degrade silently
    }
  }

  private scrollToBottom(): void {
    try {
      const last = this.messages().at(-1);
      const signature = `${last?.id}:${last?.text.length}:${this.isTyping()}`;
      if (signature === this.lastScrolledMessage) return;
      this.lastScrolledMessage = signature;
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
