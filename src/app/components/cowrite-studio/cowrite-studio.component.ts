import { Component, signal, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CoWriteService, CoWriteTurn, CoWriteSuggestion } from '../../services/cowrite.service';
import { SongwritingAssistantService } from '../../services/songwriting-assistant.service';
import { SmuveStyleMimicService } from '../../services/smuve-style-mimic.service';
import { AiService } from '../../services/ai.service';

@Component({
  selector: 'app-cowrite-studio',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cowrite-studio.component.html',
  styleUrls: ['./cowrite-studio.component.css'],
})
export class CowriteStudioComponent implements OnInit {
  private cowrite = inject(CoWriteService);
  private songwriting = inject(SongwritingAssistantService);
  private styleMimic = inject(SmuveStyleMimicService);
  private ai = inject(AiService);

  // Session state
  currentSession = this.cowrite.currentSession;
  isThinking = this.cowrite.isThinking;
  userInput = signal('');
  showSetup = signal(true);
  showLyrics = signal(false);
  copilotMode = signal<'casual' | 'intense' | 'critic'>('intense');
  selectedLineIndex = signal<number | null>(null);

  // Setup form
  setupConfig = signal({
    topic: '',
    mood: 'emotional' as string,
    artist: '' as string,
    artists: [] as string[],
    genre: 'Pop' as string,
  });

  readonly moods = ['emotional', 'dark', 'uplifting', 'angry', 'dreamy', 'hopeful', 'melancholic', 'aggressive'];
  readonly artists = this.styleMimic.getAvailableArtists();

  // Melody & export state
  showMelody = signal(false);
  melodyResult = signal<{ melody: string; notes: string; noteCount: number } | null>(null);

  exportResult = signal<string | null>(null);

  suggestions = signal<CoWriteSuggestion[]>([]);
  sectionProgress = computed(() => {
    const session = this.currentSession();
    if (!session) return { current: 0, total: 7, label: '' };
    return {
      current: session.sectionIndex + 1,
      total: session.sectionOrder.length,
      label: session.currentSection || 'verse',
    };
  });

  acceptedCount = computed(() =>
    this.currentSession()?.turns.filter(t => t.accepted).length || 0
  );

  getSongStructurePreview(): string[] {
    const session = this.currentSession();
    if (!session) return [];
    return session.sectionOrder.map((s, i) => {
      const prefix = i < session.sectionIndex ? '✅' : i === session.sectionIndex ? '▶' : '○';
      return `${prefix} ${s.toUpperCase()}`;
    });
  }

  ngOnInit() {
    // Pre-populate with some vibe
    this.setupConfig.set({
      topic: '',
      mood: 'emotional',
      artist: '',
      genre: 'Pop',
    });
  }

  toggleArtist(artist: string) {
    this.setupConfig.update(c => {
      const current = [...c.artists];
      const idx = current.indexOf(artist);
      if (idx >= 0) {
        current.splice(idx, 1);
      } else {
        current.push(artist);
      }
      return { ...c, artists: current };
    });
  }

  generateMelody() {
    const result = this.cowrite.generateMelodyForSession();
    this.melodyResult.set(result);
    this.showMelody.set(true);
  }

  exportToStudio() {
    const result = this.cowrite.exportToStudio();
    this.exportResult.set(result.message);
    setTimeout(() => this.exportResult.set(null), 5000);
  }

  startSession() {
    const config = this.setupConfig();
    if (!config.topic.trim()) return;

    const hasArtists = config.artists.length > 0;
    this.cowrite.startSession({
      topic: config.topic,
      mood: config.mood,
      artist: hasArtists ? config.artists[0] : undefined,
      artists: hasArtists ? config.artists : undefined,
      genre: config.genre,
    });

    this.showSetup.set(false);
    this.showLyrics.set(true);

    // S.M.U.V.E opens the session with a characteristic remark + first line
    this.cowrite.generateSmuveContribution();
    
    // Generate an initial suggestion
    this.suggestions.set([this.cowrite.getSuggestion('start')]);
  }

  async sendUserLine() {
    const text = this.userInput().trim();
    if (!text || this.isThinking()) return;

    this.cowrite.addUserContribution(text);
    this.userInput.set('');
    this.selectedLineIndex.set(null);

    // S.M.U.V.E responds
    await this.cowrite.generateSmuveContribution(text);

    // Generate new suggestion
    this.suggestions.set([this.cowrite.getSuggestion(text)]);
  }

  acceptTurn(turnId: string) {
    this.cowrite.acceptTurn(turnId);
  }

  rejectTurn(turnId: string) {
    this.cowrite.rejectTurn(turnId);
  }

  async nextSection() {
    const next = this.cowrite.nextSection();
    if (next) {
      // S.M.U.V.E suggests the opening line for the next section
      await this.cowrite.generateSmuveContribution(`Opening ${next}`);
    } else {
      // Session complete
      this.suggestions.set([{
        type: 'feedback',
        content: 'Session complete! Use /cowrite lyrics to view your compiled song, or start a new session with /cowrite [topic]',
        context: 'Your co-write with S.M.U.V.E has finished',
      }]);
    }
  }

  async completeSection() {
    await this.cowrite.completeCurrentSection();
    this.suggestions.set([this.cowrite.getSuggestion('section complete')]);
  }

  applySuggestion(suggestion: CoWriteSuggestion) {
    if (suggestion.type === 'line' || suggestion.type === 'phrase') {
      this.userInput.set(suggestion.content);
    }
  }

  setCopilotMode(mode: 'casual' | 'intense' | 'critic') {
    this.copilotMode.set(mode);
  }

  getCompiledLyrics(): string {
    return this.cowrite.getCompiledLyrics();
  }

  copyLyrics() {
    const lyrics = this.getCompiledLyrics();
    if (lyrics) {
      navigator.clipboard.writeText(lyrics);
    }
  }

  formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  getTurnVariant(turn: CoWriteTurn): string {
    if (turn.accepted) return 'bg-emerald-900/30 border-emerald-500/40';
    if (turn.rejected) return 'bg-red-900/20 border-red-500/30 opacity-50';
    if (turn.role === 'smuve') return 'bg-violet-900/20 border-violet-500/30';
    return 'bg-brand-primary/10 border-brand-primary/30';
  }
}
