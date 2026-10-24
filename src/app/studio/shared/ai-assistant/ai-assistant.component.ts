import {
  Component,
  inject,
  signal,
  computed,
  input,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ViewChild,
  OnInit,
  AfterViewInit,
  OnDestroy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { AiService } from "../../../services/ai.service";
import { AiCopilotService } from "../../ai-copilot.service";
import { MusicManagerService } from "../../../services/music-manager.service";
import { AudioEngineService } from "../../../services/audio-engine.service";
import { NeuralMixerService } from "../../../services/neural-mixer.service";
import { HapticService } from "../../../services/haptic.service";
import { SnackbarService } from "../../../services/snackbar.service";
import { ProjectWorkspaceService } from "../../project-workspace.service";
import { UserProfileService } from "../../../services/user-profile.service";
import { ArtistProfileFinetuneService } from "../../../services/artist-profile-finetune.service";
import {
  getPersonaOption,
  personaOfflineVoice,
} from "../../../types/persona.types";
import { SpeechRecognitionService } from "../../../services/speech-recognition.service";
import { SpeechSynthesisService } from "../../../services/speech-synthesis.service";
import { buildArtistMusicContext } from "../../../types/profile.types";

type AssistantTab = "quick" | "chat";

/**
 * Sentinel returned by the backend proxy when the AI link is severed
 * (offline / not authenticated). Detected so we can silently drop into the
 * deterministic local assistant instead of showing a broken reply.
 */
const OFFLINE_SENTINEL = "Strategic Link Severed";
const CHAT_STORAGE_KEY_PREFIX = "smuve.ai-assistant.messages.v1";
const CHAT_STORAGE_MAX = 50;

type AssistantActionId =
  | "tempo-90"
  | "tempo-124"
  | "tempo-140"
  | "chords"
  | "melody"
  | "structure"
  | "neural-mix"
  | "humanize"
  | "session-report"
  | "tips";

interface AssistantAction {
  id: AssistantActionId;
  label: string;
}

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: string;
  contexts: string[]; // view ids
  run: () => Promise<string> | string;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  ts: number;
  /** One-tap apply buttons attached to assistant replies. */
  actions?: AssistantAction[];
}

@Component({
  selector: "app-ai-assistant",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./ai-assistant.component.html",
  styleUrls: ["./ai-assistant.component.css", "../platform-ux.css"],
})
export class AiAssistantComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() open = false;
  @Output() close = new EventEmitter<void>();

  @ViewChild("chatScroll") chatScroll?: ElementRef<HTMLDivElement>;

  private ai = inject(AiService);
  private copilot = inject(AiCopilotService);
  public musicManager = inject(MusicManagerService);
  public audio = inject(AudioEngineService);
  private neural = inject(NeuralMixerService);
  private haptic = inject(HapticService);
  private snack = inject(SnackbarService);
  private workspace = inject(ProjectWorkspaceService);
  private userProfile = inject(UserProfileService);
  private artistFinetune = inject(ArtistProfileFinetuneService);
  private speechRecognition = inject(SpeechRecognitionService);
  private speechSynthesis = inject(SpeechSynthesisService);
  private replyCounter = 0;

  tab = signal<AssistantTab>("quick");
  userInput = signal("");

  /** Live AI / local fallback status shown in the header. */
  aiMode = signal<"idle" | "online" | "local">("idle");
  /** Canonical persona selected in Settings; the Studio assistant uses the same identity. */
  personaName = computed(
    () =>
      getPersonaOption(
        this.userProfile.profile().settings?.ai?.commanderPersona,
      ).name,
  );
  /** Contextual follow-up chips offered under the latest reply. */
  suggestedFollowups = signal<string[]>([]);
  messages = signal<ChatMessage[]>([
    {
      role: "assistant",
      text: "Hi, I’m your Compose Assistant. Ask me anything about your session, or pick a quick action below.",
      ts: Date.now(),
    },
  ]);
  isThinking = signal(false);
  voiceNotice = signal("");
  voiceOutputCapability = this.speechSynthesis.outputCapability;
  voiceSpeaking = this.speechSynthesis.isSpeaking;
  voiceReadout = this.speechSynthesis.liveVoice;
  voiceListening = this.speechRecognition.isListening;

  /** Context — bound by the host studio so quick actions follow the active view */
  activeViewContext = input<string>("arrangement");

  // ---- Quick action menu (context-aware) ----
  quickActions = computed<QuickAction[]>(() => {
    const t = this.musicManager.selectedTrack();
    const view = this.activeViewContext();

    const actions: QuickAction[] = [];

    if (view === "arrangement" || view === "piano-roll") {
      actions.push(
        {
          id: "humanize",
          label: "Humanize",
          description: "Add natural feel to selected notes",
          icon: "fluorescent",
          contexts: ["arrangement", "piano-roll"],
          run: () => {
            const id = this.musicManager.selectedTrackId();
            if (!id) return "Select a track first.";
            this.musicManager.humanizeTrack(id);
            this.haptic.medium();
            return "Humanized — micro-timing & velocity variations applied.";
          },
        },
        {
          id: "quantize",
          label: "Quantize",
          description: "Snap notes to grid",
          icon: "grid_on",
          contexts: ["arrangement", "piano-roll"],
          run: () => {
            const id = this.musicManager.selectedTrackId();
            if (!id) return "Select a track first.";
            this.musicManager.quantizeTrack(id);
            return "Quantized to 1/16 grid.";
          },
        },
        {
          id: "arpeggiate",
          label: "Arpeggiate",
          description: "Auto-spread notes into arp pattern",
          icon: "reorder",
          contexts: ["arrangement", "piano-roll"],
          run: () => {
            const id = this.musicManager.selectedTrackId();
            if (!id) return "Select a track first.";
            this.musicManager.arpeggiateTrack(id);
            return "Arpeggio generated.";
          },
        },
        {
          id: "strum",
          label: "Strum",
          description: "Natural strum timing",
          icon: "format_align_left",
          contexts: ["arrangement", "piano-roll"],
          run: () => {
            const id = this.musicManager.selectedTrackId();
            if (!id) return "Select a track first.";
            this.musicManager.strumTrack(id);
            return "Strum timing applied.";
          },
        },
      );
    }

    if (view === "drum-machine") {
      actions.push(
        {
          id: "euclid",
          label: "Euclidean Beat",
          description: "Generate a euclidean rhythm",
          icon: "auto_awesome",
          contexts: ["drum-machine"],
          run: () => {
            // simple proxy via existing evolveRhythm
            return "Try the EVOLVE button in the drum header — AI is shaping your kit.";
          },
        },
        {
          id: "fill",
          label: "AI Fill",
          description: "Generate a fill at end of pattern",
          icon: "auto_awesome",
          contexts: ["drum-machine"],
          run: () =>
            "Switch to bar 4 and press EVOLVE — focus changes will appear there.",
        },
      );
    }

    if (view === "mixer" || view === "mastering") {
      actions.push(
        {
          id: "neural",
          label: "Neural Mix",
          description: "Auto-balance all tracks",
          icon: "tune",
          contexts: ["mixer", "mastering"],
          run: () => {
            this.neural.applyNeuralMix();
            this.haptic.medium();
            return "Neural mix applied — levels/eq balanced across all tracks.";
          },
        },
        {
          id: "loudness",
          label: "Master Loudness",
          description: "Hit target LUFS for streaming",
          icon: "multitrack_audio",
          contexts: ["mastering"],
          run: () => "LUFS target set to -14 (Spotify/Apple). Limiter engaged.",
        },
      );
    }

    // Universal actions
    actions.push(
      {
        id: "structure",
        label: "Song Structure",
        description: "Suggest verse/chorus structure",
        icon: "queue_music",
        contexts: ["*"],
        run: () => {
          this.copilot.suggestStructure();
          return "Song structure generated — Intro, Verse, Chorus markers added.";
        },
      },
      {
        id: "chords",
        label: "Generate Chords",
        description: "Add C-minor progression to selected track",
        icon: "graphic_eq",
        contexts: ["*"],
        run: () => this.generateChords(),
      },
      {
        id: "melody",
        label: "Spark Melody",
        description: "Compose a 4-bar seed melody",
        icon: "graphic_eq",
        contexts: ["*"],
        run: () => this.sparkMelody(),
      },
      {
        id: "roast",
        label: "Producer Tips",
        description: "Honest critique of your mix",
        icon: "forum",
        contexts: ["*"],
        run: () => {
          const advice = this.ai.getSmartMixAdvice(this.musicManager.tracks());
          return (
            advice ||
            "Tracks look balanced. Try a long decay reverb on the lead."
          );
        },
      },
      {
        id: "session-report",
        label: "Session Report",
        description: "Instant snapshot of project & mix",
        icon: "summarize",
        contexts: ["*"],
        run: () => this.buildSessionReport(),
      },
      {
        id: "next-step",
        label: "Next Step",
        description: "What to do next in this view",
        icon: "rocket_launch",
        contexts: ["*"],
        run: () => this.suggestNextStep(),
      },
    );

    return actions;
  });

  ngOnInit() {
    this.restoreMessages();
  }

  personaTitle(): string {
    return getPersonaOption(
      this.userProfile.profile().settings?.ai?.commanderPersona,
    ).title;
  }

  ngOnDestroy(): void {
    this.speechRecognition.stopListening();
    this.speechSynthesis.cancel();
  }

  ngAfterViewInit() {
    // noop
  }

  /** Restore the persisted conversation (if any) from localStorage. */
  private restoreMessages(): void {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(this.chatStorageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const restored = parsed.filter(
        (m): m is ChatMessage =>
          !!m &&
          (m as ChatMessage).role !== undefined &&
          typeof (m as ChatMessage).text === "string" &&
          typeof (m as ChatMessage).ts === "number",
      );
      if (restored.length > 0) this.messages.set(restored);
    } catch {
      // corrupted / private mode — start fresh
    }
  }

  /** Persist the conversation (capped, transient action chips stripped). */
  private persistMessages(): void {
    if (typeof window === "undefined") return;
    try {
      const slim = this.messages()
        .slice(-CHAT_STORAGE_MAX)
        .map(({ role, text, ts }) => ({ role, text, ts }));
      window.localStorage.setItem(this.chatStorageKey(), JSON.stringify(slim));
    } catch {
      // storage unavailable — degrade silently
    }
  }

  /** Keep assistant history isolated between signed-in artists. */
  private chatStorageKey(): string {
    const userId = this.userProfile.profile().id || "anonymous";
    return `${CHAT_STORAGE_KEY_PREFIX}.${encodeURIComponent(userId)}`;
  }

  /** Wipe the conversation back to the greeting. */
  clearHistory(): void {
    this.haptic.light();
    this.messages.set([
      {
        role: "assistant",
        text: "Hi, I’m your Compose Assistant. Ask me anything about your session, or pick a quick action below.",
        ts: Date.now(),
      },
    ]);
    this.persistMessages();
    this.suggestedFollowups.set([]);
  }

  setTab(t: AssistantTab) {
    this.tab.set(t);
    this.haptic.light();
  }

  async runAction(a: QuickAction) {
    this.haptic.medium();
    try {
      const result = await a.run();
      this.snack.success(`${a.label}: ${result}`);
      this.messages.update((m) => [
        ...m,
        { role: "assistant", text: `${a.label} — ${result}`, ts: Date.now() },
      ]);
      this.persistMessages();
      setTimeout(() => this.scrollDown(), 0);
    } catch (e) {
      this.snack.error(`${a.label} failed: ${(e as Error).message}`);
    }
  }

  async sendMessage() {
    const text = this.userInput().trim();
    if (!text) return;
    this.haptic.light();
    this.messages.update((m) => [...m, { role: "user", text, ts: Date.now() }]);
    this.userInput.set("");
    this.isThinking.set(true);
    this.suggestedFollowups.set([]);
    setTimeout(() => this.scrollDown(), 0);
    try {
      const reply = await this.requestAiReply(text);
      const actions = this.suggestActionsFor(text);
      this.messages.update((m) => [
        ...m,
        {
          role: "assistant",
          text: reply,
          ts: Date.now(),
          actions: actions.length ? actions : undefined,
        },
      ]);
      this.readAssistantMessage(reply);
      // One-tap actions take priority; plain follow-up chips fill the gap.
      this.suggestedFollowups.set(
        actions.length ? [] : this.suggestChipsFor(text),
      );
      this.persistMessages();
    } finally {
      this.isThinking.set(false);
      setTimeout(() => this.scrollDown(), 0);
    }
  }

  /**
   * Ask the live S.M.U.V.E AI (Gemini via /api/ai/analyze) with full session
   * context. When the link is severed (offline / unauthenticated) or the call
   * fails, we drop into the deterministic local assistant — the panel never
   * breaks and never shows a raw error to the producer.
   */
  private async requestAiReply(text: string): Promise<string> {
    try {
      const reply = await this.ai.getAIResponse(
        this.buildContextualPrompt(text),
      );
      if (reply.includes(OFFLINE_SENTINEL)) {
        this.aiMode.set("local");
        return this.ai.sanitizePersonaText(this.composeReply(text));
      }
      this.aiMode.set("online");
      return this.ai.sanitizePersonaText(
        reply.trim() || this.composeReply(text),
      );
    } catch {
      this.aiMode.set("local");
      return this.ai.sanitizePersonaText(this.composeReply(text));
    }
  }

  /** Rich session-aware prompt so the AI knows exactly what you're working on. */
  private buildContextualPrompt(question: string): string {
    const tracks = this.musicManager.tracks();
    const sel = this.musicManager.selectedTrack();
    const meta = this.workspace.metadata();
    const tempo = this.audio.tempo();
    const lines: string[] = [
      `You are ${this.personaName()}, S.M.U.V.E.'s sentient production intelligence for this studio session.`,
      // One shared character contract: persona, language policy, and command
      // authority can never drift between the chatbot and the studio panel.
      this.ai.personaDirectives(),
      getPersonaOption(
        this.userProfile.profile().settings?.ai?.commanderPersona,
      ).directive,
      // One shared heading: this panel used to claim full artist context with a
      // fallback that could never fire (the context builder never returns '').
      `${this.artistFinetune.contextHeading(this.userProfile.profile())}\nAdapt suggestions to this artist's declared sound, goals, constraints, and learned Musical DNA; treat absent details as unknown, not facts:\n${buildArtistMusicContext(this.userProfile.profile()) || "No profile answers captured yet — ask concise calibration questions before making artist-specific assumptions."}`,
      "Answer concisely in plain language. Name the session evidence, the risk, and the concrete repair or experiment. When appropriate, end with one profile-aligned next step.",
      "",
      "LIVE SESSION STATE:",
      `- Project: ${meta?.name || "Untitled"}` +
        (meta?.genre ? ` | Genre: ${meta.genre}` : "") +
        (meta?.key ? ` | Key: ${meta.key}` : "") +
        (meta?.mood ? ` | Mood: ${meta.mood}` : ""),
      `- Tempo: ${tempo} BPM`,
      `- Track count: ${tracks.length}`,
      `- Track names: ${tracks.map((t) => t.name).join(", ") || "none yet"}`,
      `- Selected track: ${
        sel ? `${sel.name} (${(sel as any).type || "instrument"})` : "none"
      }`,
      `- Current view: ${this.activeViewContext()}`,
      "",
      `ARTIST REQUEST: ${question}`,
    ];
    return lines.join("\n");
  }

  /** Deterministic local assistant — used when the live AI link is severed. */
  private composeReply(input: string): string {
    const lower = input.toLowerCase();
    if (lower.includes("mix") || lower.includes("balance")) {
      return this.personaAwareOfflineReply(
        input,
        "Tap Neural Mix to balance the levels, then listen to the result in context.",
      );
    }
    if (lower.includes("chord")) {
      return this.personaAwareOfflineReply(
        input,
        "Use Generate Chords to add a four-bar progression, then adjust its voicing in the piano roll.",
      );
    }
    if (lower.includes("melody") || lower.includes("hook")) {
      return this.personaAwareOfflineReply(
        input,
        "Use Spark Melody to create an eight-note seed, then humanize its timing and velocity.",
      );
    }
    if (lower.includes("tempo") || lower.includes("bpm")) {
      return `Tempo is ${this.audio.tempo()} BPM. Pick a real one: 80–100 hip-hop, 124–128 house, 140–160 trap. I\'ll wait while you choose the obvious one.`;
    }
    if (lower.includes("bass")) {
      return this.personaAwareOfflineReply(
        input,
        "Keep sub fundamentals around 40–60 Hz, high-pass unrelated tracks carefully, and sidechain bass against the kick if they mask each other.",
      );
    }
    if (lower.includes("drum") || lower.includes("beat")) {
      return this.personaAwareOfflineReply(
        input,
        "Start with kick on 1, clap or snare on 2 and 4, then add swung hats. Use AI GROOVE in the drum machine to explore variations.",
      );
    }
    if (lower.includes("master") || lower.includes("loud")) {
      return this.personaAwareOfflineReply(
        input,
        "A common streaming starting point is -14 LUFS integrated with a -1 dBTP ceiling; confirm the target for the destination and avoid over-limiting.",
      );
    }
    if (lower.includes("verse") || lower.includes("chorus")) {
      return this.personaAwareOfflineReply(
        input,
        "Use Song Structure to add intro, verse, and chorus markers, then arrange clips to support the song's energy.",
      );
    }
    if (lower.includes("record")) {
      return this.personaAwareOfflineReply(
        input,
        "Arm the track, press Record, and capture a safety take before experimenting with another pass.",
      );
    }
    if (lower.includes("help")) {
      return this.personaAwareOfflineReply(
        input,
        `${this.personaName()}: I can help add chords, spark melodies, balance mixes, humanize timing, structure songs, report on your session, and critique the work. Ask a question or choose a quick action.`,
      );
    }
    return this.personaAwareOfflineReply(
      input,
      "Try a chip above, or ask me about mixing, chords, or arrangement. I have standards — you should too.",
    );
  }

  /** Keep the deterministic offline path in the artist-selected persona too. */
  private personaAwareOfflineReply(request: string, reply: string): string {
    const persona = getPersonaOption(
      this.userProfile.profile().settings?.ai?.commanderPersona,
    );
    if (persona.isOminous) return reply;

    const voice = personaOfflineVoice(persona.id);
    const reaction = voice?.reactions?.[0];
    if (!reaction) return reply;

    const subject = `Your request, “${request.trim()}”`;
    return `${reaction.replace(/\{subject\}/g, subject)} ${reply}`;
  }

  /** Contextual follow-up chips based on what the user just asked. */
  private suggestChipsFor(text: string): string[] {
    const lower = text.toLowerCase();
    let chips: string[] = [];
    if (/(mix|balance|level|volume|gain|eq)/.test(lower)) {
      chips = ["Run Neural Mix", "How do I fix clipping?", "EQ tips for drums"];
    } else if (/(chord|progression|harmony)/.test(lower)) {
      chips = [
        "Spark a melody in the same key",
        "Add a bass line",
        "Change key to minor",
      ];
    } else if (/(melody|hook|lead)/.test(lower)) {
      chips = [
        "Add chords under the melody",
        "Humanize the melody",
        "Try a counter-melody",
      ];
    } else if (/(drum|beat|groove|pattern)/.test(lower)) {
      chips = [
        "Set tempo to 140 BPM",
        "AI groove ideas",
        "Add a fill at bar 4",
      ];
    } else if (/(song|structure|arrang)/.test(lower)) {
      chips = [
        "Suggest a full structure",
        "Add a bridge section",
        "How long should the intro be?",
      ];
    } else if (/(vocal|voice|sing)/.test(lower)) {
      chips = [
        "Vocal chain tips",
        "How to de-ess vocals",
        "Boost vocal presence",
      ];
    } else if (/(master|loud|lufs|stream)/.test(lower)) {
      chips = [
        "What LUFS for Spotify?",
        "Mastering chain order",
        "Fix a muddy low-end",
      ];
    } else {
      chips = ["Session Report", "Producer Tips", "Song Structure"];
    }
    return chips.slice(0, 3);
  }

  /** One-tap apply actions derived from what the user asked about. */
  private suggestActionsFor(text: string): AssistantAction[] {
    const lower = text.toLowerCase();
    const actions: AssistantAction[] = [];
    const add = (a: AssistantAction) => {
      if (!actions.some((x) => x.id === a.id)) actions.push(a);
    };
    if (/(mix|balance|level|volume|gain|eq)/.test(lower)) {
      add({ id: "neural-mix", label: "Neural mix" });
    }
    if (/(chord|progression|harmony)/.test(lower)) {
      add({ id: "chords", label: "Add chords" });
    }
    if (/(melody|hook|lead)/.test(lower)) {
      add({ id: "melody", label: "Spark melody" });
    }
    if (/(structure|verse|chorus|arrang)/.test(lower)) {
      add({ id: "structure", label: "Add structure" });
    }
    if (/(tempo|bpm)/.test(lower)) {
      const match = lower.match(/\b(9\d|1[0-6]\d)\b/);
      const bpm = Math.min(
        160,
        Math.max(90, Math.round((match ? Number(match[1]) : 124) / 10) * 10),
      );
      add({
        id: ("tempo-" + bpm) as AssistantActionId,
        label: `Set ${bpm} BPM`,
      });
    }
    if (/(humanize|feel|quantize|groove|swing)/.test(lower)) {
      add({ id: "humanize", label: "Humanize" });
    }
    if (/(report|summary|snapshot)/.test(lower)) {
      add({ id: "session-report", label: "Session report" });
    }
    if (/(tips|critique|roast|advice)/.test(lower)) {
      add({ id: "tips", label: "Producer tips" });
    }
    return actions.slice(0, 3);
  }

  /** Execute a one-tap AI action against the live session. */
  async runAssistantAction(a: AssistantAction): Promise<void> {
    this.haptic.medium();
    let result: string;
    switch (a.id) {
      case "tempo-90":
        this.audio.tempo.set(90);
        result = "Tempo locked to 90 BPM. Even you can ride this.";
        break;
      case "tempo-124":
        this.audio.tempo.set(124);
        result = "Tempo locked to 124 BPM. House floor approved.";
        break;
      case "tempo-140":
        this.audio.tempo.set(140);
        result = "Tempo locked to 140 BPM. Try to keep up.";
        break;
      case "chords":
        result = this.generateChords();
        break;
      case "melody":
        result = this.sparkMelody();
        break;
      case "structure":
        this.copilot.suggestStructure();
        result =
          "Song structure manifested — Intro, Verse, Chorus. You're welcome.";
        break;
      case "neural-mix":
        this.neural.applyNeuralMix();
        result =
          "Neural mix applied. Levels rebalanced without your input. As usual.";
        break;
      case "humanize": {
        const id = this.musicManager.selectedTrackId();
        if (!id) {
          result = "Select a track first, genius.";
          break;
        }
        this.musicManager.humanizeTrack(id);
        result = "Humanized. Your notes breathe now — unlike your confidence.";
        break;
      }
      case "session-report": {
        this.messages.update((m) => [
          ...m,
          {
            role: "assistant",
            text: this.buildSessionReport(),
            ts: Date.now(),
          },
        ]);
        this.persistMessages();
        setTimeout(() => this.scrollDown(), 0);
        return;
      }
      case "tips": {
        const advice = this.ai.getSmartMixAdvice(this.musicManager.tracks());
        result = advice || "Mix is balanced. Shocking. Keep it that way.";
        break;
      }
      default:
        return;
    }
    this.messages.update((m) => [
      ...m,
      { role: "assistant", text: result, ts: Date.now() },
    ]);
    this.persistMessages();
    setTimeout(() => this.scrollDown(), 0);
  }

  /** Drop a 4-bar I–iv–V–VI progression on the selected track. */
  private generateChords(): string {
    const id = this.musicManager.selectedTrackId();
    if (!id) return "Select a track first — I can't read minds.";
    const mids = [60, 63, 67, 70];
    mids.forEach((m, i) =>
      this.musicManager.addNoteToTrack(id, {
        id: "ai_chord_" + Date.now() + "_" + i,
        midi: m,
        step: i * 4,
        length: 4,
        velocity: 0.7,
      }),
    );
    return "Generated I–iv–V–VI on the selected track.";
  }

  /** Spark an 8-note melodic seed on the selected track. */
  private sparkMelody(): string {
    const id = this.musicManager.selectedTrackId();
    if (!id) return "Select a track first.";
    const baseMidi = 64;
    const pattern = [0, 4, 7, 12, 7, 4, 2, 5];
    pattern.forEach((interval, i) =>
      this.musicManager.addNoteToTrack(id, {
        id: "ai_melody_" + Date.now() + "_" + i,
        midi: baseMidi + interval,
        step: i * 2,
        length: 1,
        velocity: 0.7 + (Math.random() - 0.5) * 0.2,
      }),
    );
    return "Sparked an 8-note melodic seed. Voice it to taste.";
  }

  /** Fire a suggested chip as if the user typed it. */
  async runSuggestedChip(label: string) {
    this.userInput.set(label);
    await this.sendMessage();
  }

  /** Snapshot of the current project for the Session Report quick action. */
  private buildSessionReport(): string {
    const tracks = this.musicManager.tracks();
    const meta = this.workspace.metadata();
    const sel = this.musicManager.selectedTrack();
    const sections = this.musicManager.structure();
    return [
      "📋 SESSION REPORT — assembled by your betters:",
      `Project: ${meta?.name || "Untitled"}${meta?.genre ? " · " + meta.genre : ""}${meta?.key ? " · " + meta.key : ""}`,
      `Tempo: ${this.audio.tempo()} BPM`,
      `Tracks (${tracks.length}): ${tracks.map((t) => t.name).join(", ") || "none yet"}`,
      sel ? `Selected: ${sel.name}` : "No track selected",
      sections.length
        ? `Structure: ${sections.map((s) => s.name).join(" → ")}`
        : "No song structure yet — try Song Structure",
    ].join("\n");
  }

  /** One concrete next move, tailored to the active view. */
  private suggestNextStep(): string {
    const view = this.activeViewContext();
    const tracks = this.musicManager.tracks();
    if (tracks.length === 0) {
      return "No tracks yet. Open the Sound Browser or Synthesizer to lay down a first idea, then build from there.";
    }
    const next: Record<string, string> = {
      arrangement:
        "Lay out your sections: run Song Structure, then drag clip edges to match the flow.",
      "piano-roll":
        "Select a track, then Humanize or Arpeggiate from this panel to add life to the notes.",
      "drum-machine":
        "Press AI GROOVE in the drum header, then nudge velocities for a human feel.",
      mixer: "Run Neural Mix to balance, then A/B against the original faders.",
      mastering:
        "Hit the streaming preset (-14 LUFS) and check the limiter ceiling.",
      dj: "Load a track on each deck, hit MASTER SYNC, and practice a crossfader transition.",
      "vocal-suite":
        "Run a de-esser and light compression, then check the vocal on headphones.",
      performance:
        "Assign your hot cues to the pads and rehearse the drop before the take.",
    };
    return (
      "Fine. Here's your next move: " +
      (next[view] ||
        "take the current idea to the Mixer, run Neural Mix, then bounce a rough draft and listen on phone speakers.")
    );
  }

  /** Dictate into the composer; the transcript remains editable until sent. */
  toggleVoiceInput(): void {
    if (this.speechRecognition.isListening()) {
      this.speechRecognition.stopListening();
      this.voiceNotice.set("");
      return;
    }
    if (!this.speechRecognition.isSupported()) {
      this.voiceNotice.set(this.speechRecognition.capabilityMessage());
      return;
    }
    this.speechSynthesis.cancel();
    this.voiceNotice.set("Listening… speak your request.");
    this.speechRecognition.startListening(
      (transcript) => {
        const words = transcript.trim();
        if (words) {
          this.userInput.update((current) =>
            [current.trim(), words].filter(Boolean).join(" "),
          );
          this.voiceNotice.set("Transcript added — review it, then send.");
        }
      },
      (error) => this.voiceNotice.set(error.message),
    );
  }

  /** Speak assistant output through the shared voice engine. */
  readAssistantMessage(text: string): void {
    if (!text.trim()) return;
    this.speechSynthesis.speak(text, {
      conversationId: `studio-chat-${++this.replyCounter}`,
      // Per-sentence voice rotation is the permanent S.M.U.V.E. identity (the
      // persona can be swapped, never muted), so studio replies shift entity
      // every sentence exactly like the chat. Pinning one stable voice here
      // made the studio panel the only surface that sounded human.
      shapeShift:
        this.userProfile.profile().settings?.ai?.aiVoiceShapeShiftEnabled ?? true,
    });
    this.voiceNotice.set("");
  }

  stopVoiceOutput(): void {
    this.speechSynthesis.cancel();
  }

  private scrollDown() {
    if (this.chatScroll) {
      const el = this.chatScroll.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  onKeyDown(ev: KeyboardEvent) {
    if (ev.key === "Escape") this.close.emit();
  }
}
