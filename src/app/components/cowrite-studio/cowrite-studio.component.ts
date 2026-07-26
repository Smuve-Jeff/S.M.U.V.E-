import { Component, signal, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CoWriteService, CoWriteTurn, CoWriteSuggestion, CoWriteProject, PianoRollNote } from '../../services/cowrite.service';
import { SongwritingAssistantService } from '../../services/songwriting-assistant.service';
import { SmuveStyleMimicService } from '../../services/smuve-style-mimic.service';
import { AiService } from '../../services/ai.service';
import { MelodyPianoRollComponent } from '../melody-piano-roll/melody-piano-roll.component';

@Component({
  selector: 'app-cowrite-studio',
  standalone: true,
  imports: [CommonModule, FormsModule, MelodyPianoRollComponent],
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

  // ── Melody & Piano Roll state ──────────────────────────
  showPianoRoll = signal(false);
  showMelody = signal(false);
  melodyResult = signal<{ melody: string; notes: string; noteCount: number } | null>(null);
  melodyNotes = signal<PianoRollNote[]>([]);
  harmonyNotes = signal<PianoRollNote[]>([]);
  harmonyTypes = signal<string[]>(['3rd', '5th']);

  // ── Project Manager state ──────────────────────────────
  showProjects = signal(false);
  savedProjectsList = signal<CoWriteProject[]>([]);
  projectNameInput = signal('');
  saveConfirm = signal<string | null>(null);
  loadError = signal<string | null>(null);

  // ── Auto-Harmony state ─────────────────────────────────
  showHarmony = signal(false);
  harmonyTypeOptions = signal<Array<'3rd' | '5th' | '7th' | 'octave' | 'unison'>>(['3rd', '5th']);

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

  // ── Computed for piano roll ────────────────────────────
  totalHarmonyNotes = computed(() => this.harmonyNotes().length);

  getSongStructurePreview(): string[] {
    const session = this.currentSession();
    if (!session) return [];
    return session.sectionOrder.map((s, i) => {
      const prefix = i < session.sectionIndex ? '✅' : i === session.sectionIndex ? '▶' : '○';
      return `${prefix} ${s.toUpperCase()}`;
    });
  }

  ngOnInit() {
    this.setupConfig.set({
      topic: '',
      mood: 'emotional',
      artist: '',
      artists: [] as string[],
      genre: 'Pop',
    });
    // Load saved projects from localStorage on init
    this.cowrite.loadProjects();
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

  // ── Melody Piano Roll ──────────────────────────────────

  generateMelody() {
    const result = this.cowrite.generateMelodyForSession();
    this.melodyResult.set(result);
    this.showMelody.set(true);
  }

  openPianoRoll() {
    const result = this.cowrite.generateMelodyForSession();
    this.melodyResult.set(result);

    // Generate melody notes for piano roll
    const harm = this.cowrite.generateAutoHarmony(
      this.harmonyTypeOptions() as Array<'3rd' | '5th' | '7th' | 'octave' | 'unison'>,
      this.currentSession()?.key || 'C'
    );
    this.melodyNotes.set(harm.melody);
    this.harmonyNotes.set(harm.harmony);
    this.showPianoRoll.set(true);
  }

  closePianoRoll() {
    this.showPianoRoll.set(false);
  }

  // ── MIDI Export ────────────────────────────────────────

  exportMidi() {
    this.cowrite.exportMidi(this.melodyNotes(), this.harmonyNotes(), this.currentSession()?.bpm || 120);
  }

  // ── Audio Preview ──────────────────────────────────────

  isPlayingAudio() {
    return this.cowrite.isPlayingAudio();
  }

  toggleAudioPreview() {
    this.cowrite.playAudioPreview(this.melodyNotes(), this.harmonyNotes(), this.currentSession()?.bpm || 120);
  }

  // ── Auto-Harmony & Chord Voicing ───────────────────────

  generateHarmony() {
    const harm = this.cowrite.generateAutoHarmony(
      this.harmonyTypeOptions() as Array<'3rd' | '5th' | '7th' | 'octave' | 'unison'>,
      this.currentSession()?.key || 'C'
    );
    this.melodyNotes.set(harm.melody);
    this.harmonyNotes.set(harm.harmony);
    this.showHarmony.set(true);
    this.showPianoRoll.set(true);
  }

  toggleHarmonyType(type: '3rd' | '5th' | '7th' | 'octave' | 'unison') {
    this.harmonyTypeOptions.update(current => {
      const idx = current.indexOf(type);
      if (idx >= 0) {
        return current.filter(t => t !== type) as Array<'3rd' | '5th' | '7th' | 'octave' | 'unison'>;
      }
      return [...current, type] as Array<'3rd' | '5th' | '7th' | 'octave' | 'unison'>;
    });
  }

  // Chord Voicing specific state
  voicingInversion = signal(0);
  voicingSpread = signal<'close' | 'open' | 'wide'>('close');
  voicingOctaveShift = signal(0);

  applyChordVoicing() {
    const configs = this.harmonyTypeOptions().map(t => ({
      type: t as '3rd' | '5th' | '7th' | 'octave' | 'unison' | 'chord',
      enabled: true,
      inversion: this.voicingInversion(),
      octaveShift: this.voicingOctaveShift(),
      spread: this.voicingSpread(),
    }));

    const result = this.cowrite.generateChordVoicings(
      this.melodyNotes(),
      this.harmonyTypeOptions() as Array<'3rd' | '5th' | '7th' | 'octave' | 'unison' | 'chord'>,
      configs,
      this.currentSession()?.key || 'C'
    );
    this.melodyNotes.set(result.melody);
    this.harmonyNotes.set(result.harmony);
  }

  // ── Project Manager ────────────────────────────────────

  openProjectManager() {
    const projects = this.cowrite.loadProjects();
    this.savedProjectsList.set(projects);
    this.showProjects.set(true);
  }

  closeProjectManager() {
    this.showProjects.set(false);
  }

  saveCurrentProject() {
    const name = this.projectNameInput().trim() || undefined;
    const project = this.cowrite.saveProject(name);
    if (project) {
      this.savedProjectsList.update(list => [project, ...list]);
      this.saveConfirm.set(`Project "${project.title}" saved successfully.`);
      this.projectNameInput.set('');
      setTimeout(() => this.saveConfirm.set(null), 3000);
    } else {
      this.saveConfirm.set('No active session to save.');
      setTimeout(() => this.saveConfirm.set(null), 3000);
    }
  }

  loadProject(projectId: string) {
    const project = this.cowrite.loadProject(projectId);
    if (project) {
      this.showSetup.set(false);
      this.showLyrics.set(true);
      this.loadError.set(null);
      this.saveConfirm.set(`Loaded "${project.title}"`);
      setTimeout(() => this.saveConfirm.set(null), 3000);
    } else {
      this.loadError.set('Failed to load project.');
      setTimeout(() => this.loadError.set(null), 3000);
    }
  }

  deleteProject(projectId: string) {
    this.cowrite.deleteProject(projectId);
    this.savedProjectsList.update(list => list.filter(p => p.id !== projectId));
  }

  exportToStudio() {
    const result = this.cowrite.exportToStudio();
    this.exportResult.set(result.message);
    setTimeout(() => this.exportResult.set(null), 5000);
  }

  // ── Session methods ────────────────────────────────────

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

    this.cowrite.generateSmuveContribution();
    this.suggestions.set([this.cowrite.getSuggestion('start')]);
  }

  async sendUserLine() {
    const text = this.userInput().trim();
    if (!text || this.isThinking()) return;

    this.cowrite.addUserContribution(text);
    this.userInput.set('');
    this.selectedLineIndex.set(null);

    await this.cowrite.generateSmuveContribution(text);
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
      await this.cowrite.generateSmuveContribution(`Opening ${next}`);
    } else {
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
