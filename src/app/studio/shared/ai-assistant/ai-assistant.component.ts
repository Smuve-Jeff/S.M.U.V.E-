import {
  Component,
  inject,
  signal,
  computed,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ViewChild,
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

type AssistantTab = 'quick' | 'chat';

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
}

@Component({
  selector: 'app-ai-assistant',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-assistant.component.html',
  styleUrls: ['./ai-assistant.component.css'],
})
export class AiAssistantComponent implements AfterViewInit {
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

  tab = signal<AssistantTab>('quick');
  userInput = signal('');
  messages = signal<ChatMessage[]>([
    {
      role: 'assistant',
      text: 'Hi, I’m your Compose Assistant. Ask me anything about your session, or pick a quick action below.',
      ts: Date.now(),
    },
  ]);
  isThinking = signal(false);

  /** Optional context — set by host studio via input binding */
  activeViewContext = signal<string>('arrangement');

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
        },
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
          run: () => 'Switch to bar 4 and press EVOLVE — focus changes will appear there.',
        },
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
        },
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
        run: () => {
          const id = this.musicManager.selectedTrackId();
          if (!id) return 'Select a track first.';
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
          return 'Generated I–iv–V–VI chord progression on selected track.';
        },
      },
      {
        id: 'melody',
        label: 'Spark Melody',
        description: 'Compose a 4-bar seed melody',
        icon: 'graphic_eq',
        contexts: ['*'],
        run: () => {
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
          return 'Sparked a melodic seed — 8 notes. Voice it to taste 🎶';
        },
      },
      {
        id: 'roast',
        label: 'Producer Tips',
        description: 'Honest critique of your mix',
        icon: 'forum',
        contexts: ['*'],
        run: () => {
          const advice = this.ai.getSmartMixAdvice(this.musicManager.tracks());
          return advice || 'Tracks look balanced. Try a long decay reverb on the lead.';
        },
      },
    );

    return actions;
  });

  ngAfterViewInit() {
    // noop
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
      setTimeout(() => this.scrollDown(), 0);
    } catch (e) {
      this.snack.error(`${a.label} failed: ${(e as Error).message}`);
    }
  }

  async sendMessage() {
    const text = this.userInput().trim();
    if (!text) return;
    this.haptic.light();
    this.messages.update((m) => [
      ...m,
      { role: 'user', text, ts: Date.now() },
    ]);
    this.userInput.set('');
    this.isThinking.set(true);
    setTimeout(() => this.scrollDown(), 0);
    try {
      // Mock generative response — explicit, deterministic, doesn't ship anything
      const reply = this.composeReply(text);
      this.messages.update((m) => [
        ...m,
        { role: 'assistant', text: reply, ts: Date.now() },
      ]);
    } finally {
      this.isThinking.set(false);
      setTimeout(() => this.scrollDown(), 0);
    }
  }

  private composeReply(input: string): string {
    const lower = input.toLowerCase();
    if (lower.includes('mix') || lower.includes('balance')) {
      return 'Tap Neural Mix in the AI panel for one-tap balancing, then fine-tune faders from your ears.';
    }
    if (lower.includes('chord')) {
      return 'Generate Chords adds a 4-bar progression. Change the base MIDI in piano roll after to transpose.';
    }
    if (lower.includes('verse') || lower.includes('chorus')) {
      return 'Use Song Structure to drop party/verse/chorus markers. Drag clip edges to refine lengths.';
    }
    if (lower.includes('record')) {
      return 'Arm the track with R, then press the red Record button. The first take is your safety net.';
    }
    if (lower.includes('help')) {
      return 'I can: add chords, spark a melody, balance the mix, humanize timing, suggest a song shape, and offer producer tips. Try a chip above or ask anything.';
    }
    return 'Try one of the chip actions above — or ask about mixing, chord progressions, or arrangement.';
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
