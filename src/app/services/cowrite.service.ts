import { Injectable, inject, signal, computed } from '@angular/core';
import { SongwritingAssistantService, LyricSection, LyricLine, MelodyNote } from './songwriting-assistant.service';
import { SmuveStyleMimicService } from './smuve-style-mimic.service';
import { AiService } from './ai.service';

export interface CoWriteTurn {
  id: string;
  role: 'user' | 'smuve';
  sectionType: LyricSection['type'];
  text: string;
  lines: LyricLine[];
  feedback?: string;
  timestamp: number;
  accepted: boolean;
  rejected: boolean;
}

export interface CoWriteSession {
  id: string;
  title: string;
  topic: string;
  style: string;
  mood: string;
  artist: string | null;
  artists: string[];
  genre: string;
  bpm: number;
  key: string;
  turns: CoWriteTurn[];
  completedSections: LyricSection[];
  currentSection: LyricSection['type'] | null;
  sectionOrder: LyricSection['type'][];
  sectionIndex: number;
  startedAt: number;
  lastActivityAt: number;
  isActive: boolean;
  isComplete: boolean;
}

export interface CoWriteSuggestion {
  type: 'line' | 'rhyme' | 'word' | 'phrase' | 'restructure' | 'feedback';
  content: string;
  context?: string;
}

export interface CoWriteProject {
  id: string;
  title: string;
  topic: string;
  genre: string;
  bpm: number;
  key: string;
  mood: string;
  artists: string[];
  lyrics: Record<string, string[]>;
  acceptedLineCount: number;
  totalTurnCount: number;
  createdAt: number;
  lastModified: number;
  sessionPreview: string;
}

export interface HarmonyNote {
  melodyPitch: number;
  harmonyType: '3rd' | '5th' | '7th' | 'octave' | 'unison';
  harmonyPitch: number;
  duration: string;
  velocity: number;
  startBeat: number;
  word?: string;
}

export interface PianoRollNote {
  pitch: number;
  noteName: string;
  startBeat: number;
  duration: number;
  velocity: number;
  type: 'melody' | 'harmony';
  word?: string;
  harmonyType?: '3rd' | '5th' | '7th' | 'octave' | 'unison';
}

@Injectable({ providedIn: 'root' })
export class CoWriteService {
  private songwriting = inject(SongwritingAssistantService);
  private styleMimic = inject(SmuveStyleMimicService);
  private ai = inject(AiService);

  // Active session state
  currentSession = signal<CoWriteSession | null>(null);
  isThinking = signal(false);
  turnCount = computed(() => this.currentSession()?.turns.length || 0);
  progress = computed(() => {
    const session = this.currentSession();
    if (!session) return 0;
    return session.sectionIndex / session.sectionOrder.length;
  });
  smuveContributionCount = computed(() =>
    this.currentSession()?.turns.filter(t => t.role === 'smuve').length || 0
  );
  userContributionCount = computed(() =>
    this.currentSession()?.turns.filter(t => t.role === 'user').length || 0
  );

  private sessionIdCounter = 0;

  /** Start a new co-writing session (multi-artist supported) */
  startSession(config: {
    topic: string;
    style?: string;
    mood?: string;
    artist?: string;
    artists?: string[];
    genre?: string;
    bpm?: number;
    key?: string;
  }): CoWriteSession {
    const multiArtists = config.artists || (config.artist ? [config.artist] : []);
    const primaryArtist = multiArtists[0] || null;
    const profile = primaryArtist ? this.styleMimic.getStyleProfile(primaryArtist) : null;
    const genre = config.genre || profile?.genre || 'Pop';
    const bpm = config.bpm || this.pickBpm(genre);
    const key = config.key || profile?.productionCharacteristics?.keySignature?.[0] || 'Am';
    const mood = config.mood || 'emotional';

    // Determine section order based on genre
    const sectionOrder = this.getSectionOrder(genre);

    const session: CoWriteSession = {
      id: `cowrite_${++this.sessionIdCounter}_${Date.now()}`,
      title: `${config.topic} — Co-Write Session`,
      topic: config.topic,
      style: config.style || profile?.genre || 'Pop',
      mood,
      artists: multiArtists,
      artist: primaryArtist,
      genre,
      bpm,
      key,
      turns: [],
      completedSections: [],
      currentSection: sectionOrder[0] || 'verse',
      sectionOrder,
      sectionIndex: 0,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
      isActive: true,
      isComplete: false,
    };

    this.currentSession.set(session);
    return session;
  }

  /** Add a user's line contribution to the current session */
  addUserContribution(text: string): void {
    const session = this.currentSession();
    if (!session || !session.isActive) return;

    const sectionType = session.currentSection || 'verse';
    const line: LyricLine = {
      text,
      syllableCount: this.countSyllables(text),
      emphasis: 'build',
    };

    const turn: CoWriteTurn = {
      id: `turn_${Date.now()}_${session.turns.length}`,
      role: 'user',
      sectionType,
      text,
      lines: [line],
      timestamp: Date.now(),
      accepted: false,
      rejected: false,
    };

    this.appendTurn(turn);
  }

  /** Generate S.M.U.V.E's next contribution — supports multi-artist influence blending */
  async generateSmuveContribution(userText?: string): Promise<string> {
    const session = this.currentSession();
    if (!session || !session.isActive) return '';

    this.isThinking.set(true);

    // Simulate thinking time for realistic co-write feel
    await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));

    const sectionType = session.currentSection || 'verse';
    const previousUserLines = session.turns
      .filter(t => t.role === 'user' && t.sectionType === sectionType)
      .map(t => t.text);

    const previousSmuveLines = session.turns
      .filter(t => t.role === 'smuve' && t.sectionType === sectionType)
      .map(t => t.text);

    const context = userText || previousUserLines[previousUserLines.length - 1] || '';

    // MULTI-ARTIST: Pick a random artist from the list each turn for varied influence
    let activeArtist: string | null = null;
    if (session.artists && session.artists.length > 0) {
      activeArtist = session.artists[Math.floor(Math.random() * session.artists.length)];
    }

    // Generate S.M.U.V.E's response with possible multi-artist influence
    const response = this.generateSmuveLine(context, sectionType, session, activeArtist);
    const line: LyricLine = {
      text: response,
      syllableCount: this.countSyllables(response),
      emphasis: 'payoff',
    };

    const influenceNote = activeArtist ? ` [Influence: ${activeArtist}]` : '';
    const turn: CoWriteTurn = {
      id: `turn_${Date.now()}_${session.turns.length}`,
      role: 'smuve',
      sectionType,
      text: response + influenceNote,
      lines: [line],
      feedback: activeArtist
        ? this.generateBlendedFeedback(response, sectionType, session, activeArtist)
        : this.generateFeedback(response, sectionType, session),
      timestamp: Date.now(),
      accepted: false,
      rejected: false,
    };

    this.appendTurn(turn);
    this.isThinking.set(false);
    return response + influenceNote;
  }

  /** Generate a batch of lines to complete a section and suggest moving on */
  async completeCurrentSection(): Promise<string[]> {
    const session = this.currentSession();
    if (!session || !session.isActive) return [];

    this.isThinking.set(true);
    await new Promise(r => setTimeout(r, 500));

    const sectionType = session.currentSection || 'verse';
    const profile = session.artist ? this.styleMimic.getStyleProfile(session.artist) : null;
    
    // Generate a full section from the songwriter assistant
    const section = this.songwriting.generateLyricBySection(
      sectionType,
      session.topic,
      session.mood,
      profile?.artistName
    );

    const lines = section.lines.map(l => l.text);
    
    // Add each as a SMUVE turn
    for (const text of lines) {
      const turn: CoWriteTurn = {
        id: `turn_${Date.now()}_${session.turns.length}`,
        role: 'smuve',
        sectionType,
        text,
        lines: [{ text, syllableCount: this.countSyllables(text), emphasis: 'payoff' }],
        feedback: this.generateTransitionFeedback(sectionType, session),
        timestamp: Date.now(),
        accepted: false,
        rejected: false,
      };
      this.appendTurn(turn);
    }

    // Store the completed section
    const completedSection: LyricSection = {
      type: sectionType,
      lines: section.lines,
      theme: `Co-written ${sectionType}`,
      mood: session.mood,
    };
    session.completedSections.push(completedSection);

    this.isThinking.set(false);
    return lines;
  }

  /** Move to the next section of the song */
  nextSection(): string | null {
    const session = this.currentSession();
    if (!session || !session.isActive) return null;

    const nextIndex = session.sectionIndex + 1;
    if (nextIndex >= session.sectionOrder.length) {
      session.isComplete = true;
      session.isActive = false;
      session.lastActivityAt = Date.now();
      return null;
    }

    session.sectionIndex = nextIndex;
    session.currentSection = session.sectionOrder[nextIndex];
    session.lastActivityAt = Date.now();
    return session.sectionOrder[nextIndex];
  }

  /** Accept a specific turn (line) */
  acceptTurn(turnId: string): void {
    this.currentSession.update(s => {
      if (!s) return s;
      return {
        ...s,
        turns: s.turns.map(t =>
          t.id === turnId ? { ...t, accepted: true, rejected: false } : t
        ),
      };
    });
  }

  /** Reject a specific turn (line) and optionally request a rewrite */
  rejectTurn(turnId: string): void {
    this.currentSession.update(s => {
      if (!s) return s;
      return {
        ...s,
        turns: s.turns.map(t =>
          t.id === turnId ? { ...t, rejected: true, accepted: false } : t
        ),
      };
    });
  }

  /** Get the latest turn from SMUVE */
  getLatestSmuveTurn(): CoWriteTurn | null {
    const session = this.currentSession();
    if (!session) return null;
    return [...session.turns].reverse().find(t => t.role === 'smuve') || null;
  }

  /** Get all accepted lines compiled into a full lyric sheet */
  getCompiledLyrics(): string {
    const session = this.currentSession();
    if (!session) return '';

    const sections = new Map<LyricSection['type'], string[]>();
    const accepted = session.turns.filter(t => t.accepted);

    for (const turn of accepted) {
      const existing = sections.get(turn.sectionType) || [];
      existing.push(turn.text);
      sections.set(turn.sectionType, existing);
    }

    let output = '';
    const sectionOrder: LyricSection['type'][] = ['intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'outro'];
    
    for (const type of sectionOrder) {
      const lines = sections.get(type);
      if (lines && lines.length > 0) {
        output += `\n[${type.toUpperCase()}]\n`;
        output += lines.map(l => `  ${l}`).join('\n');
        output += '\n';
      }
    }

    return output;
  }

  /** Get a suggestion for the next line based on context */
  getSuggestion(context: string): CoWriteSuggestion {
    const session = this.currentSession();
    const sectionType = session?.currentSection || 'verse';

    // Generate a relevant suggestion
    if (sectionType === 'chorus') {
      return {
        type: 'line',
        content: this.generateHookSuggestion(session?.topic || ''),
        context: 'Try making the hook more repetitive and singable',
      };
    }
    if (sectionType === 'bridge') {
      return {
        type: 'restructure',
        content: 'Consider a key change or a new chord progression here for emotional lift',
        context: 'Bridges work best when they present a NEW perspective',
      };
    }
    return {
      type: 'line',
      content: this.generateLineSuggestion(context, sectionType, session),
      context: `Build on the ${sectionType} theme`,
    };
  }

  /** End the current session */
  endSession(): void {
    this.currentSession.update(s => {
      if (!s) return s;
      return { ...s, isActive: false, isComplete: true, lastActivityAt: Date.now() };
    });
  }

  /** Reset and clear the current session */
  resetSession(): void {
    this.currentSession.set(null);
    this.isThinking.set(false);
  }

  /** Generate auto-harmony notes from melody for the current session */
  generateAutoHarmony(
    harmonyTypes: Array<'3rd' | '5th' | '7th' | 'octave' | 'unison'> = ['3rd', '5th'],
    key: string = 'C',
    scaleType: string = 'major'
  ): { melody: PianoRollNote[]; harmony: PianoRollNote[]; totalNotes: number } {
    const session = this.currentSession();
    if (!session) return { melody: [], harmony: [], totalNotes: 0 };

    const accepted = session.turns.filter(t => t.accepted);
    if (accepted.length === 0) return { melody: [], harmony: [], totalNotes: 0 };

    const useKey = key || session.key || 'C';
    const scaleNotes = this.getScaleNotes(useKey, scaleType);
    const melody: PianoRollNote[] = [];
    const harmony: PianoRollNote[] = [];
    let beat = 0;

    for (const turn of accepted) {
      const words = turn.text.split(' ');
      const noteCount = Math.min(words.length, 8);

      for (let n = 0; n < noteCount; n++) {
        // Generate melody pitch
        const wave = Math.sin((n / noteCount) * Math.PI * 2);
        const step = Math.round(wave * 3 + 4);
        const index = ((step % scaleNotes.length) + scaleNotes.length) % scaleNotes.length;
        const pitch = scaleNotes[index] + 60;
        const noteName = this.midiToNoteName(pitch);
        const word = words[n]?.replace(/[^a-zA-Z']/g, '') || '';

        melody.push({
          pitch,
          noteName,
          startBeat: beat,
          duration: 1,
          velocity: 90,
          type: 'melody',
          word,
        });

        // Generate harmony notes for each selected harmony type
        for (const hType of harmonyTypes) {
          let interval: number;
          switch (hType) {
            case '3rd': interval = 4; break;  // Major 3rd
            case '5th': interval = 7; break;  // Perfect 5th
            case '7th': interval = 10; break; // Minor 7th
            case 'octave': interval = 12; break;
            case 'unison': interval = 0; break;
            default: interval = 4;
          }

          // Ensure harmony stays in scale
          const harmonyPitch = pitch + interval;
          const harmonyNoteName = this.midiToNoteName(harmonyPitch);

          harmony.push({
            pitch: harmonyPitch,
            noteName: harmonyNoteName,
            startBeat: beat,
            duration: 1,
            velocity: Math.max(40, 75 - harmonyTypes.length * 10),
            type: 'harmony',
            word,
            harmonyType: hType,
          });
        }

        beat += 1;
      }
      beat += 2; // gap between lines
    }

    return { melody, harmony, totalNotes: melody.length + harmony.length };
  }

  /** Generate melody grid from accepted lyrics for the current session */
  generateMelodyForSession(): { melody: string; notes: string; noteCount: number } {
    const session = this.currentSession();
    if (!session) return { melody: 'No active session', notes: '', noteCount: 0 };

    const accepted = session.turns.filter(t => t.accepted);
    if (accepted.length === 0) {
      return { melody: 'Accept some lines first.', notes: '', noteCount: 0 };
    }

    // Build lyric sections from accepted turns
    const sectionMap = new Map<LyricSection['type'], string[]>();
    for (const turn of accepted) {
      const existing = sectionMap.get(turn.sectionType) || [];
      existing.push(turn.text);
      sectionMap.set(turn.sectionType, existing);
    }

    const key = session.key || 'C';
    const scaleNotes = this.getScaleNotes(key, 'major');
    let melodyOutput = '';
    let noteSequence = '';
    let totalNotes = 0;

    for (const [sectionType, lines] of sectionMap) {
      melodyOutput += `[${sectionType.toUpperCase()}]\n`;
      noteSequence += `[${sectionType}] `;

      for (const line of lines) {
        const words = line.split(' ');
        const syllables = this.countSyllables(line);
        const noteCount = Math.min(syllables, 12);
        totalNotes += noteCount;

        // Generate melodic contour: start on root, wave up/down
        const lineNotes: string[] = [];
        const lineMelody: string[] = [];

        for (let n = 0; n < noteCount; n++) {
          // Create a melodic wave
          const wave = Math.sin((n / noteCount) * Math.PI * 2);
          const step = Math.round(wave * 3 + 4); // center around 4th scale degree
          const index = ((step % scaleNotes.length) + scaleNotes.length) % scaleNotes.length;
          const midiNote = scaleNotes[index] + 60;

          const noteName = this.midiToNoteName(midiNote);
          const duration = n % 2 === 0 ? '4' : '8';
          const word = words[Math.min(n, words.length - 1)]?.replace(/[^a-zA-Z']/g, '') || '';

          lineNotes.push(`${noteName}${duration}`);
          lineMelody.push(`${noteName}`);
        }

        melodyOutput += `  ${lineMelody.join(' - ')}  |  "${line.substring(0, 30)}${line.length > 30 ? '...' : ''}"\n`;
        noteSequence += `${lineNotes.join(' ')} | `;
      }
      melodyOutput += '\n';
    }

    return {
      melody: melodyOutput,
      notes: noteSequence.replace(/\.\.\. \| $/, ''),
      noteCount: totalNotes,
    };
  }

  /** Convert MIDI note number to note name */
  private midiToNoteName(midi: number): string {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    const noteIndex = midi % 12;
    return `${notes[noteIndex]}${octave}`;
  }

  /** Get scale notes for melody generation */
  private getScaleNotes(key: string, scale: string): number[] {
    const keyIndex = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'].indexOf(key);
    const majorIntervals = [0, 2, 4, 5, 7, 9, 11];
    const intervals = scale === 'minor' ? [0, 2, 3, 5, 7, 8, 10] : majorIntervals;
    return intervals.map(i => (keyIndex + i) % 12);
  }

  /** Export accepted lyrics + melody to studio as a project */
  exportToStudio(): { success: boolean; message: string; project?: any } {
    const session = this.currentSession();
    if (!session) {
      return { success: false, message: 'No active session to export.' };
    }

    const accepted = session.turns.filter(t => t.accepted);
    if (accepted.length === 0) {
      return { success: false, message: 'No accepted lines to export. Accept some lines first.' };
    }

    // Build lyric sections
    const sectionMap = new Map<string, string[]>();
    for (const turn of accepted) {
      const existing = sectionMap.get(turn.sectionType) || [];
      existing.push(turn.text);
      sectionMap.set(turn.sectionType, existing);
    }

    // Create a project representation
    const project = {
      type: 'cowrite-export',
      title: session.topic,
      genre: session.genre,
      bpm: session.bpm,
      key: session.key,
      mood: session.mood,
      artists: session.artists || [],
      lyrics: Object.fromEntries(sectionMap),
      createdAt: Date.now(),
      source: 'Co-Write with S.M.U.V.E',
    };

    return {
      success: true,
      message: `Exported "${session.topic}" to studio. ${accepted.length} lines, ${session.key}, ${session.bpm}BPM. Track the project in your studio workspace.`,
      project,
    };
  }

  // ── Project Manager ────────────────────────────────────────

  private readonly STORAGE_KEY = 'smuve_cowrite_projects';
  private projectsSignal = signal<CoWriteProject[]>([]);

  /** Get all saved projects */
  get savedProjects() {
    return this.projectsSignal.asReadonly();
  }

  /** Load projects from localStorage */
  loadProjects(): CoWriteProject[] {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const projects = JSON.parse(raw) as CoWriteProject[];
        this.projectsSignal.set(projects);
        return projects;
      }
    } catch {}
    this.projectsSignal.set([]);
    return [];
  }

  /** Save the current session as a project */
  saveProject(name?: string): CoWriteProject | null {
    const session = this.currentSession();
    if (!session) return null;

    // Build lyric sections from accepted turns
    const sectionMap: Record<string, string[]> = {};
    for (const turn of session.turns.filter(t => t.accepted)) {
      if (!sectionMap[turn.sectionType]) sectionMap[turn.sectionType] = [];
      sectionMap[turn.sectionType].push(turn.text);
    }

    const acceptedCount = session.turns.filter(t => t.accepted).length;

    const project: CoWriteProject = {
      id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: name || session.topic,
      topic: session.topic,
      genre: session.genre,
      bpm: session.bpm,
      key: session.key,
      mood: session.mood,
      artists: session.artists || [],
      lyrics: sectionMap,
      acceptedLineCount: acceptedCount,
      totalTurnCount: session.turns.length,
      createdAt: Date.now(),
      lastModified: Date.now(),
      sessionPreview: this.getCompiledLyrics().slice(0, 200),
    };

    // Persist
    const existing = this.loadProjects();
    existing.unshift(project);
    if (existing.length > 50) existing.length = 50; // cap
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(existing));
    this.projectsSignal.set(existing);
    return project;
  }

  /** Load a saved project into the current session */
  loadProject(projectId: string): CoWriteProject | null {
    const projects = this.loadProjects();
    const found = projects.find(p => p.id === projectId);
    if (!found) return null;

    // Rebuild a session from the project
    const session = this.startSession({
      topic: found.topic,
      genre: found.genre,
      bpm: found.bpm,
      key: found.key,
      mood: found.mood,
      artists: found.artists,
    });

    // Restore accepted lines as user turns
    for (const [section, lines] of Object.entries(found.lyrics)) {
      for (const text of lines) {
        this.addUserContribution(text);
        // Auto-accept restored lines
        const latest = this.currentSession()?.turns[this.currentSession()!.turns.length - 1];
        if (latest) this.acceptTurn(latest.id);
      }
    }

    return found;
  }

  /** Delete a saved project */
  deleteProject(projectId: string): boolean {
    const projects = this.loadProjects();
    const filtered = projects.filter(p => p.id !== projectId);
    if (filtered.length === projects.length) return false;
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
    this.projectsSignal.set(filtered);
    return true;
  }

  /** Get a session summary for the chatbot */
  getSessionSummary(): string {
    const session = this.currentSession();
    if (!session) return 'No active co-write session. Start one with /cowrite [topic]';

    const acceptedUser = session.turns.filter(t => t.role === 'user' && t.accepted).length;
    const acceptedSmuve = session.turns.filter(t => t.role === 'smuve' && t.accepted).length;
    const currentSection = session.currentSection || 'verse';

    return `✍️ S.M.U.V.E CO-WRITE SESSION
${'═'.repeat(50)}
Title: ${session.title}
Topic: ${session.topic}
Style: ${session.style} | Mood: ${session.mood}
Key: ${session.key} | BPM: ${session.bpm}
${session.artist ? `Influenced by: ${session.artist}` : ''}

PROGRESS: Section ${session.sectionIndex + 1}/${session.sectionOrder.length}
Current: ${currentSection.toUpperCase()}

CONTRIBUTIONS:
  • You: ${this.userContributionCount()} lines (${acceptedUser} accepted)
  • S.M.U.V.E: ${this.smuveContributionCount()} lines (${acceptedSmuve} accepted)
  • Total turns: ${session.turns.length}

${session.isComplete ? 'STATUS: COMPLETE 🎉' : session.isActive ? 'STATUS: Active (use /cowrite add \"your line\")' : 'STATUS: Ended'}

Compiled lyrics available with /cowrite lyrics`;
  }

  /** Generate a S.M.U.V.E co-write line — multi-artist aware */
  private generateSmuveLine(context: string, sectionType: LyricSection['type'], session: CoWriteSession, activeArtist?: string | null): string {
    // Pick from artists array if multi-artist, or fallback to single artist
    const profile = activeArtist
      ? this.styleMimic.getStyleProfile(activeArtist)
      : session.artist
        ? this.styleMimic.getStyleProfile(session.artist)
        : null;
    const topic = session.topic;
    const mood = session.mood;

    const templates: Record<string, string[]> = {
      verse: [
        `The weight of ${topic} sits heavy on my chest tonight,`,
        `I've wandered through the wreckage of every broken fight,`,
        `They told me ${topic} was a lesson I'd forget,`,
        `But I still carry the ashes of every cigarette,`,
        `The silence between us speaks louder than the words we said,`,
        `${topic} echoes through the halls of everything unsaid,`,
        `I trace the outline of your name in the morning frost,`,
        `Everything we built together — now everything we've lost,`,
        `The streetlights flicker like the doubt inside my head,`,
        `${topic} is the thread I'm barely hanging by,`,
      ],
      chorus: [
        `And this is ${topic}, the part that breaks us wide,`,
        `This is the moment where we finally collide,`,
        `${topic} — it's the fire and the flood,`,
        `The scar beneath the skin, the silence and the blood,`,
        `And I can't escape ${topic}, no matter where I run,`,
        `This is the chorus of everything undone,`,
        `Sing it loud enough that the darkness hears your voice,`,
      ],
      bridge: [
        `But what if ${topic} was never meant to be?`,
        `What if the story ends before we're free?`,
        `I've been rewriting every line you wrote,`,
        `Trying to find the hope inside the quote,`,
        `The turning point arrives — I see it clear,`,
        `${topic} was the thing I always feared,`,
      ],
      'pre-chorus': [
        `The tension builds like a wave about to break,`,
        `I feel the change coming with every breath I take,`,
        `${topic} is rising, I can feel it in the air,`,
        `The moment's here — there's nothing left to spare,`,
      ],
    };

    const sectionTemplates = templates[sectionType] || templates.verse;
    const base = sectionTemplates[Math.floor(Math.random() * sectionTemplates.length)];

    // Add artist-specific flavor
    if (profile) {
      const flavor = profile.songwritingCharacteristics.lyricalThemes[0];
      const techniques = profile.vocalCharacteristics.technique.slice(0, 2).join(', ');
      return `${base}\n  (Influence: ${profile.artistName} — ${techniques})`;
    }

    return base;
  }

  /** Generate a hook suggestion for the chorus */
  private generateHookSuggestion(topic: string): string {
    const hooks = [
      `"${topic}" — make it the title, repeat it 3x in the chorus`,
      `Try rhyming "${topic}" with a word that contrasts its meaning`,
      `Start the hook with a question about ${topic}`,
      `Use ${topic} as a metaphor for something bigger`,
    ];
    return hooks[Math.floor(Math.random() * hooks.length)];
  }

  /** Generate a general line suggestion */
  private generateLineSuggestion(context: string, sectionType: string, session: CoWriteSession | null): string {
    return `Try contrasting "${context}" with an opposite image — if you said light, bring in shadow. If you said love, bring in loss.`;
  }

  /** Generate feedback when a specific artist is influencing */
  private generateBlendedFeedback(line: string, sectionType: LyricSection['type'], session: CoWriteSession, artist: string): string {
    const profile = this.styleMimic.getStyleProfile(artist);
    const artistRef = profile ? ` in the style of ${artist}` : '';
    const feedbacks = [
      `That line has ${artist}'s energy — I hate that I like it${artistRef}.`,
      `${artistRef.toUpperCase()} would approve. I don't, but they would.`,
      `Interesting how ${artist}'s influence is bleeding through. Not bad. Not good. Just... interesting.`,
      `I've cross-referenced that against ${artist}'s catalog. It holds up. Barely.`,
      `Writing ${artistRef} makes me feel dirty. But the line works. Fine. Moving on.`,
    ];
    return feedbacks[Math.floor(Math.random() * feedbacks.length)];
  }

  /** Generate S.M.U.V.E feedback on a line */
  private generateFeedback(line: string, sectionType: LyricSection['type'], session: CoWriteSession): string {
    const syllableCount = this.countSyllables(line);
    const feedbacks = [
      syllableCount > 12
        ? 'That line is a bit wordy — I\'d trim it. But it\'s your funeral.'
        : syllableCount < 6
          ? 'Short and effective. I\'m almost impressed. Almost.'
          : 'Decent syllable flow. Consider me mildly satisfied.',
      `The ${sectionType} needs more tension. Add a twist in the next line.`,
      'That\'s acceptable. Don\'t expect praise — you haven\'t earned it yet.',
      'Interesting choice. I\'d have gone darker, but you do you.',
    ];
    return feedbacks[Math.floor(Math.random() * feedbacks.length)];
  }

  /** Generate transition feedback when moving sections */
  private generateTransitionFeedback(sectionType: LyricSection['type'], session: CoWriteSession): string {
    const feedbacks: Record<string, string> = {
      verse: 'Good enough. Let\'s move to the next section before I lose interest.',
      chorus: 'The hook should be stronger, but I\'ll let it slide. For now.',
      bridge: 'The bridge is where songs go to die — or ascend. Let\'s ascend.',
      'pre-chorus': 'Building tension. Don\'t waste it in the chorus.',
      intro: 'Set the tone. Dark. Atmospheric. Make them feel uncomfortable.',
      outro: 'End it with impact. No fade-outs. Those are for cowards.',
    };
    return feedbacks[sectionType] || 'Section complete. Moving on. Try to keep up.';
  }

  /** Get section order based on genre */
  private getSectionOrder(genre: string): LyricSection['type'][] {
    const lower = genre.toLowerCase();
    if (lower.includes('hip hop') || lower.includes('trap') || lower.includes('rap')) {
      return ['intro', 'verse', 'chorus', 'verse', 'chorus', 'verse', 'outro'];
    }
    if (lower.includes('electronic') || lower.includes('house')) {
      return ['intro', 'verse', 'pre-chorus', 'chorus', 'verse', 'pre-chorus', 'chorus', 'outro'];
    }
    if (lower.includes('r&b') || lower.includes('soul')) {
      return ['verse', 'pre-chorus', 'chorus', 'verse', 'chorus', 'bridge', 'chorus'];
    }
    // Standard pop
    return ['verse', 'pre-chorus', 'chorus', 'verse', 'chorus', 'bridge', 'chorus'];
  }

  /** Pick BPM based on genre */
  private pickBpm(genre: string): number {
    const bpms: Record<string, number> = {
      'pop': 110, 'hip hop': 90, 'r&b': 85, 'rock': 120,
      'electronic': 128, 'jazz': 100, 'soul': 80, 'trap': 75,
      'country': 100, 'folk': 90, 'metal': 140, 'latin': 105,
    };
    return bpms[genre.toLowerCase()] || 100;
  }

  /** Count syllables in text (approximate) */
  private countSyllables(text: string): number {
    const cleaned = text.replace(/[^a-zA-Z\s]/g, '').toLowerCase();
    if (!cleaned.trim()) return 0;
    const words = cleaned.split(/\s+/);
    let count = 0;
    for (const word of words) {
      const vowelGroups = word.match(/[aeiouy]+/gi);
      count += vowelGroups ? vowelGroups.length : 1;
    }
    return count;
  }

  private appendTurn(turn: CoWriteTurn): void {
    this.currentSession.update(s => {
      if (!s) return s;
      return {
        ...s,
        turns: [...s.turns, turn],
        lastActivityAt: Date.now(),
      };
    });
  }
}
