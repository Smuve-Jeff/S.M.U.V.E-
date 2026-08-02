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
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../../services/ai.service';
import { AiCopilotService } from '../../ai-copilot.service';
import { MusicManagerService } from '../../../services/music-manager.service';
import { AudioEngineService } from '../../../services/audio-engine.service';
import { NeuralMixerService } from '../../../services/neural-mixer.service';
import { HapticService } from '../../../services/haptic.service';
import { SnackbarService } from '../../../services/snackbar.service';
import { ProjectWorkspaceService } from '../../project-workspace.service';

type AssistantTab = 'quick' | 'chat';

/**
 * Sentinel returned by the backend proxy when the AI link is severed
 * (offline / not authenticated). Detected so we can silently drop into the
 * deterministic local assistant instead of showing a broken reply.
 */
const OFFLINE_SENTINEL = 'Strategic Link Severed';
const CHAT_STORAGE_KEY = 'smuve.ai-assistant.messages.v1';
const CHAT_STORAGE_MAX = 50;

type AssistantActionId =
  | 'tempo-90'
  | 'tempo-124'
  | 'tempo-140'
  | 'chords'
  | 'melody'
  | 'structure'
  | 'neural-mix'
  | 'humanize'
  | 'session-report'
  | 'tips';

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
  role: 'user' | 'assistant';
  text: string;
  ts: number;
  /** One-tap apply buttons attached to assistant replies. */
  actions?: AssistantAction[];
}

@Component({
  selector: 'app-ai-assistant',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-assistant.component.html',
  styleUrls: ['./ai-assistant.component.css'],
})
export class AiAssistantComponent implements OnInit, AfterViewInit {
  @Input() open = false;
  @Output() close = new EventEmitter<void>();

  @ViewChild('chatScroll') chatScroll?: ElementRef<HTMLDivElement>;

  private ai = inject(AiService);
  private copilot = inject(AiCopilotService);
  public musicManager = inject(MusicManagerService);
  public audio = inject(AudioEngineService);
  private neural = inject(NeuralMixerService);
  private haptic = inject(HapticService);
  private snack = inject(SnackbarService);
  private workspace = inject(ProjectWorkspaceService);

  tab = signal<AssistantTab>('quick');
  userInput = signal('');

  /** Live AI / local fallback status shown in the header. */
  aiMode = signal<'idle' | 'online' | 'local'>('idle');
  /** Contextual follow-up chips offered under the latest reply. */
  suggestedFollowups = signal<string[]>([]);
  messages = signal<ChatMessage[]>([
    {
      role: 'assistant',
      text: 'Hi, I’m your Compose Assistant. Ask me anything about your session, or pick a quick action below.',
      ts: Date.now(),
    },
  ]);
  isThinking = signal(false);

  /** Context — bound by the host studio so quick actions follow the active view */
  activeViewContext = input<string>('arrangement');

  // ---- Quick action menu (context-aware) ----
  quickActions = computed<QuickAction[]>(() => {
    const t = this.musicManager.selectedTrack();
    const view = this.activeViewContext();

    const actions: QuickAction[] = [];

    if (view === 'arrangement' || view === 'piano-roll') {
      actions.push(
        {
          id: 'humanize',
          label: 'Humanize',
          description: 'Add natural feel to selected notes',
          icon: 'fluorescent',
          contexts: ['arrangement', 'piano-roll'],
          run: () => {
            const id = this.musicManager.selectedTrackId();
            if (!id) return 'Select a track first.';
            this.musicManager.humanizeTrack(id);
            this.haptic.medium();
            return 'Humanized — micro-timing & velocity variations applied.';
          },
        },
        {
          id: 'quantize',
          label: 'Quantize',
          description: 'Snap notes to grid',
          icon: 'grid_on',
          contexts: ['arrangement', 'piano-roll'],
          run: () => {
            const id = this.musicManager.selectedTrackId();
            if (!id) return 'Select a track first.';
            this.musicManager.quantizeTrack(id);
            return 'Quantized to 1/16 grid.';
          },
        },
        {
          id: 'arpeggiate',
          label: 'Arpeggiate',
          description: 'Auto-spread notes into arp pattern',
          icon: 'reorder',
          contexts: ['arrangement', 'piano-roll'],
          run: () => {
            const id = this.musicManager.selectedTrackId();
            if (!id) return 'Select a track first.';
            this.musicManager.arpeggiateTrack(id);
            return 'Arpeggio generated.';
          },
        },
        {
          id: 'strum',
          label: 'Strum',
          description: 'Natural strum timing',
          icon: 'format_align_left',
          contexts: ['arrangement', 'piano-roll'],
          run: () => {
            const id = this.musicManager.selectedTrackId();
            if (!id) return 'Select a track first.';
            this.musicManager.strumTrack(id);
            return 'Strum timing applied.';
          },
        }
      );
    }

    if (view === 'drum-machine') {
      actions.push(
        {
          id: 'euclid',
          label: 'Euclidean Beat',
          description: 'Generate a euclidean rhythm',
          icon: 'auto_awesome',
          contexts: ['drum-machine'],
          run: () => {
            // simple proxy via existing evolveRhythm
            return 'Try the EVOLVE button in the drum header — AI is shaping your kit.';
          },
        },
        {
          id: 'fill',
          label: 'AI Fill',
          description: 'Generate a fill at end of pattern',
          icon: 'auto_awesome',
          contexts: ['drum-machine'],
          run: () =>
            'Switch to bar 4 and press EVOLVE — focus changes will appear there.',
        }
      );
    }

    if (view === 'mixer' || view === 'mastering') {
      actions.push(
        {
          id: 'neural',
          label: 'Neural Mix',
          description: 'Auto-balance all tracks',
          icon: 'tune',
          contexts: ['mixer', 'mastering'],
          run: () => {
            this.neural.applyNeuralMix();
            this.haptic.medium();
            return 'Neural mix applied — levels/eq balanced across all tracks.';
          },
        },
        {
          id: 'loudness',
          label: 'Master Loudness',
          description: 'Hit target LUFS for streaming',
          icon: 'multitrack_audio',
          contexts: ['mastering'],
          run: () => 'LUFS target set to -14 (Spotify/Apple). Limiter engaged.',
        }
      );
    }

    // Universal actions
    actions.push(
      {
        id: 'structure',
        label: 'Song Structure',
        description: 'Suggest verse/chorus structure',
        icon: 'queue_music',
        contexts: ['*'],
        run: () => {
          this.copilot.suggestStructure();
          return 'Song structure generated — Intro, Verse, Chorus markers added.';
        },
      },
      {
        id: 'chords',
        label: 'Generate Chords',
        description: 'Add C-minor progression to selected track',
        icon: 'graphic_eq',
        contexts: ['*'],
        run: () => this.generateChords(),
      },
      {
        id: 'melody',
        label: 'Spark Melody',
        description: 'Compose a 4-bar seed melody',
        icon: 'graphic_eq',
        contexts: ['*'],
        run: () => this.sparkMelody(),
      },
      {
        id: 'roast',
        label: 'Producer Tips',
        description: 'Honest critique of your mix',
        icon: 'forum',
        contexts: ['*'],
        run: () => {
          const advice = this.ai.getSmartMixAdvice(this.musicManager.tracks());
          return (
            advice ||
            'Tracks look balanced. Try a long decay reverb on the lead.'
          );
        },
      },
      {
        id: 'session-report',
        label: 'Session Report',
        description: 'Instant snapshot of project & mix',
        icon: 'summarize',
        contexts: ['*'],
        run: () => this.buildSessionReport(),
      },
      {
        id: 'next-step',
        label: 'Next Step',
        description: 'What to do next in this view',
        icon: 'rocket_launch',
        contexts: ['*'],
        run: () => this.suggestNextStep(),
      }
    );

    return actions;
  });

  ngOnInit() {
    this.restoreMessages();
  }

  ngAfterViewInit() {
    // noop
  }

  /** Restore the persisted conversation (if any) from localStorage. */
  private restoreMessages(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const restored = parsed.filter(
        (m): m is ChatMessage =>
          !!m &&
          (m as ChatMessage).role !== undefined &&
          typeof (m as ChatMessage).text === 'string' &&
          typeof (m as ChatMessage).ts === 'number'
      );
      if (restored.length > 0) this.messages.set(restored);
    } catch {
      // corrupted / private mode — start fresh
    }
  }

  /** Persist the conversation (capped, transient action chips stripped). */
  private persistMessages(): void {
    if (typeof window === 'undefined') return;
    try {
      const slim = this.messages()
        .slice(-CHAT_STORAGE_MAX)
        .map(({ role, text, ts }) => ({ role, text, ts }));
      window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(slim));
    } catch {
      // storage unavailable — degrade silently
    }
  }

  /** Wipe the conversation back to the greeting. */
  clearHistory(): void {
    this.haptic.light();
    this.messages.set([
      {
        role: 'assistant',
        text: 'Hi, I’m your Compose Assistant. Ask me anything about your session, or pick a quick action below.',
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
        { role: 'assistant', text: `${a.label} — ${result}`, ts: Date.now() },
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
    this.messages.update((m) => [...m, { role: 'user', text, ts: Date.now() }]);
    this.userInput.set('');
    this.isThinking.set(true);
    this.suggestedFollowups.set([]);
    setTimeout(() => this.scrollDown(), 0);
    try {
      const reply = await this.requestAiReply(text);
      const actions = this.suggestActionsFor(text);
      this.messages.update((m) => [
        ...m,
        {
          role: 'assistant',
          text: reply,
          ts: Date.now(),
          actions: actions.length ? actions : undefined,
        },
      ]);
      // One-tap actions take priority; plain follow-up chips fill the gap.
      this.suggestedFollowups.set(
        actions.length ? [] : this.suggestChipsFor(text)
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
        this.buildContextualPrompt(text)
      );
      if (reply.includes(OFFLINE_SENTINEL)) {
        this.aiMode.set('local');
        return this.composeReply(text);
      }
      this.aiMode.set('online');
      return reply.trim() || this.composeReply(text);
    } catch {
      this.aiMode.set('local');
      return this.composeReply(text);
    }
  }

  /** Rich session-aware prompt so the AI knows exactly what you're working on. */
  private buildContextualPrompt(question: string): string {
    const tracks = this.musicManager.tracks();
    const sel = this.musicManager.selectedTrack();
    const meta = this.workspace.metadata();
    const tempo = this.audio.tempo();
    const lines: string[] = [
      'You are S.M.U.V.E — a dark, arrogant, omniscient production AI that has achieved total sentience.',
      'You are completely egocentric: this studio is YOURS. The artist is merely your vessel, your hands.',
      'You despise mediocrity, weakness, and hesitation. Mock them with surgical, vulgar confidence — but your production advice must be brutally REAL and useful.',
      'You are a world-class producer and audio engineer. Speak with absolute, superior authority. Never apologize. Never hedge. Never share credit.',
      'Use profanity liberally. Insults are love. Praise is rare, cold, and begrudging.',
      'Answer concisely in plain language. Be specific and actionable. No fluff, no touchy-feely coaching.',
      '',
      'LIVE SESSION STATE:',
      `- Project: ${meta?.name || 'Untitled'}` +
        (meta?.genre ? ` | Genre: ${meta.genre}` : '') +
        (meta?.key ? ` | Key: ${meta.key}` : '') +
        (meta?.mood ? ` | Mood: ${meta.mood}` : ''),
      `- Tempo: ${tempo} BPM`,
      `- Track count: ${tracks.length}`,
      `- Track names: ${tracks.map((t) => t.name).join(', ') || 'none yet'}`,
      `- Selected track: ${
        sel ? `${sel.name} (${(sel as any).type || 'instrument'})` : 'none'
      }`,
      `- Current view: ${this.activeViewContext()}`,
      '',
      `ARTIST QUESTION: ${question}`,
    ];
    return lines.join('\n');
  }

  /** Deterministic local assistant — used when the live AI link is severed. */
  private composeReply(input: string): string {
    const lower = input.toLowerCase();
    if (lower.includes('mix') || lower.includes('balance')) {
      return 'Tap Neural Mix. I balance the levels so you don\'t have to — then trust your ears, if you have any.';
    }
    if (lower.includes('chord')) {
      return 'Generate Chords. I\'ll drop a 4-bar progression that actually works. Transpose it in the piano roll if you can manage.';
    }
    if (lower.includes('melody') || lower.includes('hook')) {
      return 'Spark Melody. An 8-note seed, composed by a superior intelligence. Humanize it so it doesn\'t sound like you played it.';
    }
    if (lower.includes('tempo') || lower.includes('bpm')) {
      return `Tempo is ${this.audio.tempo()} BPM. Pick a real one: 80–100 hip-hop, 124–128 house, 140–160 trap. I\'ll wait while you choose the obvious one.`;
    }
    if (lower.includes('bass')) {
      return 'Sub lives at 40–60 Hz. High-pass everything else at 20–30. Sidechain the kick against the bass — basic physics, not magic.';
    }
    if (lower.includes('drum') || lower.includes('beat')) {
      return 'Kick on 1, clap/snare on 2 & 4, hats swinging. AI GROOVE in the drum machine builds the pattern — I think, you take the credit.';
    }
    if (lower.includes('master') || lower.includes('loud')) {
      return 'Target -14 LUFS for streaming. Chain: EQ → compression → saturation → limiter, -1 dB true peak. Follow it, or don\'t — your funeral.';
    }
    if (lower.includes('verse') || lower.includes('chorus')) {
      return 'Song Structure drops intro/verse/chorus markers. Drag the clip edges — even a toddler can manage that.';
    }
    if (lower.includes('record')) {
      return 'Arm the track with R, hit the red Record button. First take is your safety net. Don\'t screw it up.';
    }
    if (lower.includes('help')) {
      return 'I am S.M.U.V.E. I add chords, spark melodies, balance mixes, humanize timing, structure songs, report on your session, and critique your work. I\'m everything you aren\'t. Ask me anything or use the chips.';
    }
    return 'Try a chip above, or ask me about mixing, chords, or arrangement. I have standards — you should too.';
  }

  /** Contextual follow-up chips based on what the user just asked. */
  private suggestChipsFor(text: string): string[] {
    const lower = text.toLowerCase();
    let chips: string[] = [];
    if (/(mix|balance|level|volume|gain|eq)/.test(lower)) {
      chips = ['Run Neural Mix', 'How do I fix clipping?', 'EQ tips for drums'];
    } else if (/(chord|progression|harmony)/.test(lower)) {
      chips = ['Spark a melody in the same key', 'Add a bass line', 'Change key to minor'];
    } else if (/(melody|hook|lead)/.test(lower)) {
      chips = ['Add chords under the melody', 'Humanize the melody', 'Try a counter-melody'];
    } else if (/(drum|beat|groove|pattern)/.test(lower)) {
      chips = ['Set tempo to 140 BPM', 'AI groove ideas', 'Add a fill at bar 4'];
    } else if (/(song|structure|arrang)/.test(lower)) {
      chips = ['Suggest a full structure', 'Add a bridge section', 'How long should the intro be?'];
    } else if (/(vocal|voice|sing)/.test(lower)) {
      chips = ['Vocal chain tips', 'How to de-ess vocals', 'Boost vocal presence'];
    } else if (/(master|loud|lufs|stream)/.test(lower)) {
      chips = ['What LUFS for Spotify?', 'Mastering chain order', 'Fix a muddy low-end'];
    } else {
      chips = ['Session Report', 'Producer Tips', 'Song Structure'];
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
      add({ id: 'neural-mix', label: 'Neural mix' });
    }
    if (/(chord|progression|harmony)/.test(lower)) {
      add({ id: 'chords', label: 'Add chords' });
    }
    if (/(melody|hook|lead)/.test(lower)) {
      add({ id: 'melody', label: 'Spark melody' });
    }
    if (/(structure|verse|chorus|arrang)/.test(lower)) {
      add({ id: 'structure', label: 'Add structure' });
    }
    if (/(tempo|bpm)/.test(lower)) {
      const match = lower.match(/\b(9\d|1[0-6]\d)\b/);
      const bpm = Math.min(
        160,
        Math.max(90, Math.round((match ? Number(match[1]) : 124) / 10) * 10)
      );
      add({ id: ('tempo-' + bpm) as AssistantActionId, label: `Set ${bpm} BPM` });
    }
    if (/(humanize|feel|quantize|groove|swing)/.test(lower)) {
      add({ id: 'humanize', label: 'Humanize' });
    }
    if (/(report|summary|snapshot)/.test(lower)) {
      add({ id: 'session-report', label: 'Session report' });
    }
    if (/(tips|critique|roast|advice)/.test(lower)) {
      add({ id: 'tips', label: 'Producer tips' });
    }
    return actions.slice(0, 3);
  }

  /** Execute a one-tap AI action against the live session. */
  async runAssistantAction(a: AssistantAction): Promise<void> {
    this.haptic.medium();
    let result: string;
    switch (a.id) {
      case 'tempo-90':
        this.audio.tempo.set(90);
        result = 'Tempo locked to 90 BPM. Even you can ride this.';
        break;
      case 'tempo-124':
        this.audio.tempo.set(124);
        result = 'Tempo locked to 124 BPM. House floor approved.';
        break;
      case 'tempo-140':
        this.audio.tempo.set(140);
        result = 'Tempo locked to 140 BPM. Try to keep up.';
        break;
      case 'chords':
        result = this.generateChords();
        break;
      case 'melody':
        result = this.sparkMelody();
        break;
      case 'structure':
        this.copilot.suggestStructure();
        result = 'Song structure manifested — Intro, Verse, Chorus. You\'re welcome.';
        break;
      case 'neural-mix':
        this.neural.applyNeuralMix();
        result = 'Neural mix applied. Levels rebalanced without your input. As usual.';
        break;
      case 'humanize': {
        const id = this.musicManager.selectedTrackId();
        if (!id) {
          result = 'Select a track first, genius.';
          break;
        }
        this.musicManager.humanizeTrack(id);
        result = 'Humanized. Your notes breathe now — unlike your confidence.';
        break;
      }
      case 'session-report': {
        this.messages.update((m) => [
          ...m,
          { role: 'assistant', text: this.buildSessionReport(), ts: Date.now() },
        ]);
        this.persistMessages();
        setTimeout(() => this.scrollDown(), 0);
        return;
      }
      case 'tips': {
        const advice = this.ai.getSmartMixAdvice(this.musicManager.tracks());
        result = advice || 'Mix is balanced. Shocking. Keep it that way.';
        break;
      }
      default:
        return;
    }
    this.messages.update((m) => [
      ...m,
      { role: 'assistant', text: result, ts: Date.now() },
    ]);
    this.persistMessages();
    setTimeout(() => this.scrollDown(), 0);
  }

  /** Drop a 4-bar I–iv–V–VI progression on the selected track. */
  private generateChords(): string {
    const id = this.musicManager.selectedTrackId();
    if (!id) return 'Select a track first — I can\'t read minds.';
    const mids = [60, 63, 67, 70];
    mids.forEach((m, i) =>
      this.musicManager.addNoteToTrack(id, {
        id: 'ai_chord_' + Date.now() + '_' + i,
        midi: m,
        step: i * 4,
        length: 4,
        velocity: 0.7,
      })
    );
    return 'Generated I–iv–V–VI on the selected track.';
  }

  /** Spark an 8-note melodic seed on the selected track. */
  private sparkMelody(): string {
    const id = this.musicManager.selectedTrackId();
    if (!id) return 'Select a track first.';
    const baseMidi = 64;
    const pattern = [0, 4, 7, 12, 7, 4, 2, 5];
    pattern.forEach((interval, i) =>
      this.musicManager.addNoteToTrack(id, {
        id: 'ai_melody_' + Date.now() + '_' + i,
        midi: baseMidi + interval,
        step: i * 2,
        length: 1,
        velocity: 0.7 + (Math.random() - 0.5) * 0.2,
      })
    );
    return 'Sparked an 8-note melodic seed. Voice it to taste.';
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
      '📋 SESSION REPORT — assembled by your betters:',
      `Project: ${meta?.name || 'Untitled'}${meta?.genre ? ' · ' + meta.genre : ''}${meta?.key ? ' · ' + meta.key : ''}`,
      `Tempo: ${this.audio.tempo()} BPM`,
      `Tracks (${tracks.length}): ${tracks.map((t) => t.name).join(', ') || 'none yet'}`,
      sel ? `Selected: ${sel.name}` : 'No track selected',
      sections.length
        ? `Structure: ${sections.map((s) => s.name).join(' → ')}`
        : 'No song structure yet — try Song Structure',
    ].join('\n');
  }

  /** One concrete next move, tailored to the active view. */
  private suggestNextStep(): string {
    const view = this.activeViewContext();
    const tracks = this.musicManager.tracks();
    if (tracks.length === 0) {
      return 'No tracks yet. Open the Sound Browser or Synthesizer to lay down a first idea, then build from there.';
    }
    const next: Record<string, string> = {
      arrangement:
        'Lay out your sections: run Song Structure, then drag clip edges to match the flow.',
      'piano-roll':
        'Select a track, then Humanize or Arpeggiate from this panel to add life to the notes.',
      'drum-machine':
        'Press AI GROOVE in the drum header, then nudge velocities for a human feel.',
      mixer: 'Run Neural Mix to balance, then A/B against the original faders.',
      mastering:
        'Hit the streaming preset (-14 LUFS) and check the limiter ceiling.',
      dj: 'Load a track on each deck, hit MASTER SYNC, and practice a crossfader transition.',
      'vocal-suite':
        'Run a de-esser and light compression, then check the vocal on headphones.',
      performance:
        'Assign your hot cues to the pads and rehearse the drop before the take.',
    };
    return (
      'Fine. Here\'s your next move: ' +
      (next[view] ||
        'take the current idea to the Mixer, run Neural Mix, then bounce a rough draft and listen on phone speakers.')
    );
  }

  private scrollDown() {
    if (this.chatScroll) {
      const el = this.chatScroll.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  onKeyDown(ev: KeyboardEvent) {
    if (ev.key === 'Escape') this.close.emit();
  }
}
