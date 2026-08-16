import { Injectable, inject } from '@angular/core';
import {
  MusicManagerService,
  TrackNote,
  TrackModel,
} from './music-manager.service';
import { AudioEngineService } from './audio-engine.service';
import { SpeechSynthesisService } from './speech-synthesis.service';

/**
 * Chat Music Command Engine — S.M.U.V.E 2.0's chat-driven music surface.
 *
 * Turns natural-language and slash input into real Studio edits:
 *   "make a beat at 140 in C minor"  → drums + bass + chords + melody tracks
 *   "play C - Am - F - G"            → chord progression on the chords track
 *   "drop some drums" / "bassline in A minor" / "melody in E major"
 *   "preview" / "play it"            → offline-rendered audition through the engine
 *   "stop"                           → halts preview playback
 *   "undo"                           → restores the previous track state
 *   "set tempo 90"                   → locks the transport BPM
 *
 * Every mutating command pushes a snapshot (affected track notes + tempo) onto
 * an undo stack, so `undo` is always safe. Results are written in short,
 * speak-friendly sentences so the chatbot's voice layer reads them aloud.
 */

export type ChatMusicActionId =
  | 'music-preview'
  | 'music-undo'
  | 'music-stop'
  | 'music-help';

export interface ChatMusicAction {
  id: ChatMusicActionId;
  label: string;
}

export interface ChatMusicResult {
  content: string;
  actions: ChatMusicAction[];
}

export interface ChatMusicOptions {
  /** When true, the confirmation is also spoken via SpeechSynthesisService. */
  speak?: boolean;
}

interface UndoEntry {
  label: string;
  tempo?: number;
  notes: { trackId: string; notes: TrackNote[] }[];
}

interface NoteEvent {
  midi: number;
  start: number; // seconds
  duration: number; // seconds
  velocity: number;
}

// ── Music theory helpers ────────────────────────────────────────────────────

const NOTE_INDEX: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Chord quality → semitone intervals from the root. */
const CHORD_INTERVALS: Record<string, number[]> = {
  '': [0, 4, 7],
  maj: [0, 4, 7],
  major: [0, 4, 7],
  M: [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  minor: [0, 3, 7],
  maj7: [0, 4, 7, 11],
  M7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  min7: [0, 3, 7, 10],
  '7': [0, 4, 7, 10],
  dom7: [0, 4, 7, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  '5': [0, 7],
  power: [0, 7],
};

interface ParsedKey {
  root: number; // 0-11
  minor: boolean;
  label: string;
}

interface ParsedChord {
  root: number; // 0-11
  intervals: number[];
  label: string;
}

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

/** Roman numeral → scale degree (0-indexed) + implied quality. */
const NUMERAL_DEGREE: Record<string, number> = {
  I: 0,
  II: 1,
  III: 2,
  IV: 3,
  V: 4,
  VI: 5,
  VII: 6,
};

@Injectable({ providedIn: 'root' })
export class ChatMusicCommandEngineService {
  private music = inject(MusicManagerService);
  private audio = inject(AudioEngineService);
  private speech = inject(SpeechSynthesisService);

  private readonly undoStack: UndoEntry[] = [];

  /** Last mutation label — used by preview()/undo() messaging. */
  private lastCommandLabel = '';

  /**
   * Parse + execute a chat message. Returns null when the message is not a
   * music command so the chatbot can fall through to its other intents.
   */
  tryExecute(input: string, options?: ChatMusicOptions): ChatMusicResult | null {
    const trimmed = (input || '').trim();
    if (!trimmed) return null;

    const slash = this.trySlashCommand(trimmed);
    if (slash) {
      if (options?.speak) this.announce(slash.content);
      return slash;
    }

    const natural = this.tryNaturalCommand(trimmed);
    if (natural) {
      if (options?.speak) this.announce(natural.content);
      return natural;
    }
    return null;
  }

  // ── Public action surface (used by chatbot one-tap chips) ─────────────────

  preview(): ChatMusicResult {
    const events = this.collectLastEvents();
    if (events.length === 0) {
      return {
        content:
          'Nothing to preview yet — make a beat, drop some drums, or play a chord progression first.',
        actions: [{ id: 'music-help', label: 'Music commands' }],
      };
    }
    const bpm = this.currentTempo();
    if (!window.OfflineAudioContext) {
      return {
        content:
          'Preview engine offline — open the Studio for playback, or say "undo" to rewind instead.',
        actions: [{ id: 'music-undo', label: 'Undo' }],
      };
    }
    // Render off the main thread, then audition through the monitor gain.
    void this.renderToBuffer(events, bpm)
      .then((buffer) => this.audio.playAudition(buffer))
      .catch(() => undefined);
    return {
      content: `Previewing the ${this.lastCommandLabel || 'session'} — ${events.length} notes at ${bpm} BPM. Listen close.`,
      actions: [
        { id: 'music-stop', label: 'Stop' },
        { id: 'music-undo', label: 'Undo' },
      ],
    };
  }

  stop(): ChatMusicResult {
    this.audio.stopAudition();
    return {
      content: 'Playback halted. Silence restored.',
      actions: [{ id: 'music-preview', label: 'Preview' }],
    };
  }

  undo(): ChatMusicResult {
    const entry = this.undoStack.pop();
    if (!entry) {
      return {
        content: 'Nothing to undo — the history is clean.',
        actions: [],
      };
    }
    for (const snap of entry.notes) {
      this.music.tracks.update((ts) =>
        ts.map((t) =>
          t.id === snap.trackId ? { ...t, notes: [...snap.notes] } : t
        )
      );
    }
    if (entry.tempo !== undefined) {
      this.music.engine.tempo.set(entry.tempo);
    }
    this.lastCommandLabel = entry.label;
    return {
      content: `Undone: ${entry.label}. The session is exactly as it was before — don't make me do that again.`,
      actions: [{ id: 'music-preview', label: 'Preview' }],
    };
  }

  help(): ChatMusicResult {
    return {
      content: [
        '🎛 CHAT MUSIC ENGINE — say it, I build it:',
        '  • "make a beat at 140 in C minor" — full kit: drums, bass, chords, melody',
        '  • "play C - Am - F - G" — chord progression',
        '  • "drop some drums" / "bassline in A minor" / "melody in E major"',
        '  • "set tempo 90" — lock the BPM',
        '  • "preview" / "play it" — hear what I made',
        '  • "undo" — rewind the last edit',
        '  • "stop" — cut playback',
        '',
        'Slash forms: /make, /drums, /bass, /chords, /melody, /tempo 128, /preview, /undo, /stop.',
      ].join('\n'),
      actions: [{ id: 'music-preview', label: 'Preview' }],
    };
  }

  // ── Slash commands ────────────────────────────────────────────────────────

  private trySlashCommand(text: string): ChatMusicResult | null {
    const lower = text.toLowerCase();
    if (lower === '/music' || lower === '/music help' || lower === '/music ?') {
      return this.help();
    }
    if (lower === '/make') {
      return this.createBeat({});
    }
    if (lower.startsWith('/make ')) {
      return this.createBeat(this.parseBeatArgs(lower.slice(6)));
    }
    if (lower === '/drums' || lower === '/drum') {
      return this.createDrums({});
    }
    if (lower.startsWith('/drums ') || lower.startsWith('/drum ')) {
      return this.createDrums({ genre: lower.split(' ')[1] });
    }
    if (lower === '/bass' || lower === '/bassline') {
      return this.createBass({});
    }
    if (lower.startsWith('/bass ') || lower.startsWith('/bassline ')) {
      const arg = lower.split(' ').slice(1).join(' ');
      return this.createBass({ key: arg });
    }
    if (lower === '/chords') {
      return this.createChords({});
    }
    if (lower.startsWith('/chords ')) {
      return this.createChords({ progression: lower.slice(8) });
    }
    if (lower === '/melody') {
      return this.createMelody({});
    }
    if (lower.startsWith('/melody ')) {
      return this.createMelody({ key: lower.slice(8) });
    }
    if (lower === '/tempo' || lower === '/bpm') {
      return this.setTempo(120);
    }
    const tempoMatch = lower.match(/^\/(?:tempo|bpm)\s+(\d+)/);
    if (tempoMatch) {
      return this.setTempo(Number(tempoMatch[1]));
    }
    if (lower === '/preview' || lower === '/play' || lower === '/play it') {
      return this.preview();
    }
    if (lower === '/stop' || lower === '/stop music') {
      return this.stop();
    }
    if (lower === '/undo') {
      return this.undo();
    }
    if (lower === '/clear-music' || lower === '/clear music') {
      return this.clearMusic();
    }
    return null;
  }

  // ── Natural language commands ─────────────────────────────────────────────

  private tryNaturalCommand(text: string): ChatMusicResult | null {
    const lower = text.toLowerCase().replace(/\s+/g, ' ').trim();

    // Undo / stop — short, voice-friendly phrases first.
    if (
      lower === 'undo' ||
      lower === 'undo that' ||
      lower === 'undo last' ||
      lower === 'undo it' ||
      lower === 'take that back'
    ) {
      return this.undo();
    }
    if (
      lower === 'stop' ||
      lower === 'stop the music' ||
      lower === 'stop playback' ||
      lower === 'stop the beat' ||
      lower === 'cut the sound'
    ) {
      return this.stop();
    }
    if (
      lower === 'preview' ||
      lower === 'preview it' ||
      lower === 'play it' ||
      lower === 'play that' ||
      lower === 'play the beat' ||
      lower === 'play my beat' ||
      lower === 'let me hear it' ||
      lower === 'hear it' ||
      lower === 'play the track' ||
      lower === 'play the music'
    ) {
      return this.preview();
    }

    // Chord progression playback: "play C - Am - F - G" / "play C major".
    const chordPlay = lower.match(
      /^(?:play|play the chords|give me)\s+(.+)$/
    );
    if (chordPlay) {
      const parsed = this.parseProgression(chordPlay[1]);
      if (parsed.length > 0) {
        return this.createChords({ progression: chordPlay[1] });
      }
    }

    // Tempo: "set tempo to 128" / "set the tempo 90" / "tempo 128".
    const tempoMatch = lower.match(
      /(?:set\s+)?(?:the\s+)?tempo\s+(?:to\s+)?(\d{2,3})/
    );
    if (tempoMatch) {
      const bpm = Math.max(40, Math.min(240, Number(tempoMatch[1])));
      return this.setTempo(bpm);
    }

    // Beat creation.
    if (
      /^(make|create|build|give me|drop)\s+(me\s+)?(us\s+)?(a\s+|an\s+|some\s+)?(beat|track|banger|loop|idea)/.test(
        lower
      )
    ) {
      return this.createBeat(this.parseBeatArgs(lower));
    }

    // "chords in C minor" / "add some chords" / "give me chords".
    if (/(chords|progression)/.test(lower)) {
      const keyArg = lower.match(/in\s+([a-g](#|b)?(\s*(m|min|minor|major))?)/);
      return this.createChords(
        keyArg ? { key: keyArg[1] } : {}
      );
    }

    // "drums" / "drop some drums".
    if (/(drums|drum pattern|a beat drop)/.test(lower)) {
      return this.createDrums({});
    }

    // "bassline in A minor" / "bass in E" / "add a bass line".
    if (/(bassline|bass line|bass\b)/.test(lower)) {
      const keyArg = lower.match(/in\s+([a-g](#|b)?(\s*(m|min|minor|major))?)/);
      return this.createBass(keyArg ? { key: keyArg[1] } : {});
    }

    // "melody in E major" / "write me a melody".
    if (/(melody|lead line|riff)/.test(lower)) {
      const keyArg = lower.match(/in\s+([a-g](#|b)?(\s*(m|min|minor|major))?)/);
      return this.createMelody(keyArg ? { key: keyArg[1] } : {});
    }

    // Clear: "clear the music" / "wipe the pattern".
    if (/(clear|wipe|erase)\s+(the\s+)?(music|pattern|tracks|notes)/.test(lower)) {
      return this.clearMusic();
    }

    return null;
  }

  // ── Beat builder ──────────────────────────────────────────────────────────

  private createBeat(args: {
    bpm?: number;
    key?: string;
    genre?: string;
  }): ChatMusicResult {
    const bpm = args.bpm ?? this.currentTempo();
    const key = this.parseKey(args.key) ?? this.parseKey('C minor')!;
    const genre = args.genre || 'trap';

    const target = this.music.selectedTrackId();
    const tracks = this.music.tracks();
    const snapshot: UndoEntry = {
      label: `beat in ${key.label} at ${bpm} BPM (${genre})`,
      tempo: this.currentTempo(),
      notes: [],
    };

    const drumId = this.ensureTrack(tracks, 'Drums', 'trap-808-elite', 'drum', snapshot);
    const bassId = this.ensureTrack(tracks, 'Bass', 'sub-commander', 'midi', snapshot);
    const chordId = this.ensureTrack(tracks, 'Chords', 'analog-warmth', 'midi', snapshot);
    const melodyId = this.ensureTrack(tracks, 'Melody', 'cyber-stab', 'midi', snapshot);

    this.music.engine.tempo.set(bpm);

    this.writeDrumPattern(drumId, genre);
    this.writeBass(bassId, key);
    this.writeChords(chordId, key);
    this.writeMelody(melodyId, key);

    if (target) this.music.selectedTrackId.set(target);

    this.pushUndo(snapshot);
    this.lastCommandLabel = snapshot.label;

    return {
      content: `Beat forged: ${key.label} at ${bpm} BPM, ${genre} energy. Four tracks armed — Drums, Bass, Chords, Melody. Say "preview" to hear it or "undo" to scrap it.`,
      actions: [
        { id: 'music-preview', label: 'Preview' },
        { id: 'music-undo', label: 'Undo' },
      ],
    };
  }

  private createDrums(args: { genre?: string }): ChatMusicResult {
    const tracks = this.music.tracks();
    const snapshot: UndoEntry = {
      label: 'drum pattern',
      notes: [],
    };
    const drumId = this.ensureTrack(tracks, 'Drums', 'trap-808-elite', 'drum', snapshot);
    this.writeDrumPattern(drumId, args.genre || 'trap');
    this.pushUndo(snapshot);
    this.lastCommandLabel = snapshot.label;
    return {
      content: `Drum pattern locked on the Drums track — kick, snare, hats and claps at ${this.currentTempo()} BPM. Say "preview".`,
      actions: [
        { id: 'music-preview', label: 'Preview' },
        { id: 'music-undo', label: 'Undo' },
      ],
    };
  }

  private createBass(args: { key?: string }): ChatMusicResult {
    const key = this.parseKey(args.key) ?? this.parseKey('C minor')!;
    const tracks = this.music.tracks();
    const snapshot: UndoEntry = {
      label: `bassline in ${key.label}`,
      notes: [],
    };
    const bassId = this.ensureTrack(tracks, 'Bass', 'sub-commander', 'midi', snapshot);
    this.writeBass(bassId, key);
    this.pushUndo(snapshot);
    this.lastCommandLabel = snapshot.label;
    return {
      content: `Bassline planted in ${key.label} — sub on the root, moving on the five. Say "preview".`,
      actions: [
        { id: 'music-preview', label: 'Preview' },
        { id: 'music-undo', label: 'Undo' },
      ],
    };
  }

  private createChords(args: { progression?: string; key?: string }): ChatMusicResult {
    const tracks = this.music.tracks();
    const snapshot: UndoEntry = {
      label: 'chord progression',
      notes: [],
    };
    const chordId = this.ensureTrack(tracks, 'Chords', 'analog-warmth', 'midi', snapshot);

    const progression = args.progression
      ? this.parseProgression(args.progression)
      : [];
    if (progression.length > 0) {
      this.writeProgression(chordId, progression);
      snapshot.label = progression.map((c) => c.label).join(' – ');
    } else {
      const key = this.parseKey(args.key) ?? this.parseKey('C minor')!;
      this.writeChords(chordId, key);
      snapshot.label = `chords in ${key.label}`;
    }

    this.pushUndo(snapshot);
    this.lastCommandLabel = snapshot.label;
    return {
      content: `Progression on the Chords track: ${snapshot.label}. Say "preview" to hear the harmony, "undo" to pull it back.`,
      actions: [
        { id: 'music-preview', label: 'Preview' },
        { id: 'music-undo', label: 'Undo' },
      ],
    };
  }

  private createMelody(args: { key?: string }): ChatMusicResult {
    const key = this.parseKey(args.key) ?? this.parseKey('C major')!;
    const tracks = this.music.tracks();
    const snapshot: UndoEntry = {
      label: `melody in ${key.label}`,
      notes: [],
    };
    const melodyId = this.ensureTrack(tracks, 'Melody', 'cyber-stab', 'midi', snapshot);
    this.writeMelody(melodyId, key);
    this.pushUndo(snapshot);
    this.lastCommandLabel = snapshot.label;
    return {
      content: `Melody sketched in ${key.label} — eight notes, one hook. Say "preview" to hear it.`,
      actions: [
        { id: 'music-preview', label: 'Preview' },
        { id: 'music-undo', label: 'Undo' },
      ],
    };
  }

  private setTempo(bpm: number): ChatMusicResult {
    const clamped = Math.max(40, Math.min(240, bpm));
    const before = this.currentTempo();
    this.pushUndo({ label: `tempo ${before} → ${clamped} BPM`, tempo: before, notes: [] });
    this.music.engine.tempo.set(clamped);
    this.lastCommandLabel = `tempo ${clamped} BPM`;
    return {
      content: `Tempo locked at ${clamped} BPM. The grid moves; try to keep up.`,
      actions: [{ id: 'music-preview', label: 'Preview' }],
    };
  }

  private clearMusic(): ChatMusicResult {
    const tracks = this.music.tracks();
    const musicTracks = tracks.filter((t) =>
      /drums|bass|chord|melody|piano|keys/i.test(t.name) ||
      /drum|bass|piano|key/.test(t.instrumentId)
    );
    if (musicTracks.length === 0) {
      return {
        content: 'No music tracks to clear. Make a beat first.',
        actions: [{ id: 'music-help', label: 'Music commands' }],
      };
    }
    const snapshot: UndoEntry = {
      label: `cleared ${musicTracks.length} track${musicTracks.length === 1 ? '' : 's'}`,
      notes: musicTracks.map((t) => ({ trackId: t.id, notes: [...t.notes] })),
    };
    for (const t of musicTracks) {
      this.music.removeNotes(t.id, t.notes.map((n) => n.id));
    }
    this.pushUndo(snapshot);
    this.lastCommandLabel = snapshot.label;
    return {
      content: `Wiped the pattern across ${musicTracks.length} track${musicTracks.length === 1 ? '' : 's'}. Clean slate. Say "undo" if you want it back.`,
      actions: [{ id: 'music-undo', label: 'Undo' }],
    };
  }

  // ── Track helpers ─────────────────────────────────────────────────────────

  private ensureTrack(
    tracks: TrackModel[],
    name: string,
    instrumentId: string,
    type: 'midi' | 'drum',
    snapshot: UndoEntry
  ): string {
    const existing = tracks.find(
      (t) => t.instrumentId === instrumentId || t.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      snapshot.notes.push({ trackId: existing.id, notes: [...existing.notes] });
      return existing.id;
    }
    const id = this.music.addTrack(name, instrumentId, type);
    snapshot.notes.push({ trackId: id, notes: [] });
    return id;
  }

  private currentTempo(): number {
    return this.music.engine.tempo();
  }

  private pushUndo(entry: UndoEntry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > 20) this.undoStack.shift();
  }

  // ── Writers ───────────────────────────────────────────────────────────────

  /** Standard trap/hip-hop grid: kick on 1 & 3, snare on 2 & 4, busy hats. */
  private writeDrumPattern(trackId: string, genre: string) {
    const kickMidi = 36;
    const snareMidi = 38;
    const hatMidi = 42;
    const clapMidi = 39;
    const bars = 2;
    const stamp = `drums_${Date.now()}`;

    const hits: { midi: number; step: number; velocity: number }[] = [];
    if (/pop/i.test(genre)) {
      for (let b = 0; b < bars; b++) {
        for (let q = 0; q < 4; q++) hits.push({ midi: kickMidi, step: b * 16 + q * 4, velocity: 0.95 });
        hits.push({ midi: snareMidi, step: b * 16 + 4, velocity: 0.9 });
        hits.push({ midi: snareMidi, step: b * 16 + 12, velocity: 0.85 });
        for (let s = 0; s < 16; s += 2) hits.push({ midi: hatMidi, step: b * 16 + s, velocity: s % 4 === 0 ? 0.6 : 0.4 });
      }
    } else {
      for (let b = 0; b < bars; b++) {
        hits.push({ midi: kickMidi, step: b * 16, velocity: 1 });
        hits.push({ midi: kickMidi, step: b * 16 + 8, velocity: 0.85 });
        hits.push({ midi: kickMidi, step: b * 16 + 12, velocity: 0.5 });
        hits.push({ midi: snareMidi, step: b * 16 + 4, velocity: 0.95 });
        hits.push({ midi: snareMidi, step: b * 16 + 12, velocity: 0.9 });
        hits.push({ midi: clapMidi, step: b * 16 + 4, velocity: 0.25 });
        hits.push({ midi: clapMidi, step: b * 16 + 12, velocity: 0.25 });
        for (let s = 0; s < 16; s += 2) {
          hits.push({ midi: hatMidi, step: b * 16 + s, velocity: 0.45 + Math.random() * 0.25 });
        }
        hits.push({ midi: 46, step: b * 16 + 14, velocity: 0.3 }); // open hat
      }
    }

    for (let i = 0; i < hits.length; i++) {
      this.music.addNoteToTrack(trackId, {
        id: `${stamp}_${i}`,
        midi: hits[i].midi,
        step: hits[i].step,
        length: i % 2 === 0 ? 1 : 0.5,
        velocity: hits[i].velocity,
      });
    }
  }

  private writeBass(trackId: string, key: ParsedKey) {
    const rootMidi = key.root + 24; // octave 2
    const stamp = `bass_${Date.now()}`;
    const scale = key.minor ? MINOR_SCALE : MAJOR_SCALE;
    const fifth = scale[4];
    const sixth = scale[5];

    const pattern: { midi: number; step: number; length: number; velocity: number }[] = [
      { midi: rootMidi, step: 0, length: 6, velocity: 0.95 },
      { midi: rootMidi + fifth, step: 8, length: 2, velocity: 0.7 },
      { midi: rootMidi + 12, step: 10, length: 2, velocity: 0.6 },
      { midi: rootMidi + sixth, step: 12, length: 4, velocity: 0.65 },
    ];
    pattern.forEach((n, i) =>
      this.music.addNoteToTrack(trackId, {
        id: `${stamp}_${i}`,
        midi: n.midi,
        step: n.step,
        length: n.length,
        velocity: n.velocity,
      })
    );
  }

  private writeChords(trackId: string, key: ParsedKey) {
    const progression = this.defaultProgression(key);
    this.writeProgression(trackId, progression);
  }

  private writeProgression(trackId: string, chords: ParsedChord[]) {
    const stamp = `chords_${Date.now()}`;
    const rootOctave = 60; // C4 anchor — stack chords with smooth voice leading
    chords.forEach((chord, bar) => {
      // Keep each chord's root near the previous one for smooth voice leading.
      const prevRoot = bar > 0 ? chords[bar - 1].root : chord.root;
      let octaveShift = 0;
      if (bar > 0) {
        let diff = chord.root - prevRoot;
        if (diff > 6) diff -= 12;
        if (diff < -6) diff += 12;
        octaveShift = diff;
      }
      const root = rootOctave + chord.root + octaveShift;
      chord.intervals.forEach((interval, i) => {
        this.music.addNoteToTrack(trackId, {
          id: `${stamp}_${bar}_${i}`,
          midi: root + interval,
          step: bar * 16,
          length: 15,
          velocity: 0.55 + (i === 0 ? 0.2 : 0),
        });
      });
    });
  }

  private writeMelody(trackId: string, key: ParsedKey) {
    const stamp = `melody_${Date.now()}`;
    const scale = key.minor ? MINOR_SCALE : MAJOR_SCALE;
    const anchor = key.root + 60; // octave 4
    // Pentatonic-ish contour: root, 3rd, 4th, 5th, 7th, octave — 8 steps.
    const contour = [0, 2, 4, 5, 4, 7, 5, 2];
    contour.forEach((degree, i) => {
      const midi = anchor + scale[degree % 7] + Math.floor(degree / 7) * 12;
      this.music.addNoteToTrack(trackId, {
        id: `${stamp}_${i}`,
        midi,
        step: i * 2,
        length: 1.5,
        velocity: 0.7 + Math.random() * 0.2,
      });
    });
  }

  // ── Preview rendering ─────────────────────────────────────────────────────

  private collectLastEvents(): NoteEvent[] {
    const tracks = this.music.tracks();
    const recent = tracks
      .filter((t) =>
        /drums|bass|chord|melody|piano|keys/i.test(t.name) ||
        /drum|bass|piano|key/.test(t.instrumentId)
      )
      .flatMap((t) => t.notes);
    if (recent.length === 0) return [];
    const spb = 60 / this.currentTempo() / 4; // seconds per 16th step
    return recent.map((n) => ({
      midi: n.midi,
      start: n.step * spb,
      duration: Math.max(0.05, n.length * spb),
      velocity: n.velocity,
    }));
  }

  /** Simple offline render — a detuned triangle synth with a pluck envelope. */
  private async renderToBuffer(
    events: NoteEvent[],
    bpm: number
  ): Promise<AudioBuffer> {
    const Ctx = window.OfflineAudioContext;
    if (!Ctx) throw new Error('OfflineAudioContext unavailable');
    const maxEnd = events.reduce(
      (m, e) => Math.max(m, e.start + e.duration),
      0.5
    );
    const bufferLength = Math.ceil((maxEnd + 0.2) * 44100);
    const ctx = new Ctx(2, bufferLength, 44100);
    const master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);

    for (const e of events) {
      // Kick-ish low thump for drum-register notes (≤ 46).
      const osc = ctx.createOscillator();
      osc.type = e.midi <= 46 ? 'sine' : 'triangle';
      osc.frequency.value = this.midiToFreq(e.midi);
      const gain = ctx.createGain();
      const peak = Math.max(0.05, Math.min(1, e.velocity));
      gain.gain.setValueAtTime(0.0001, e.start);
      gain.gain.exponentialRampToValueAtTime(peak, e.start + 0.008);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        e.start + Math.max(0.1, e.duration)
      );
      osc.connect(gain);
      gain.connect(master);
      osc.start(e.start);
      osc.stop(e.start + Math.max(0.12, e.duration));
    }
    return ctx.startRendering();
  }

  private midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // ── Music theory parsing ──────────────────────────────────────────────────

  private parseKey(input?: string): ParsedKey | null {
    if (!input) return null;
    const raw = input
      .trim()
      .toLowerCase()
      .replace(/\s+(m|minor|maj|major)\s*$/, (_, q) => (q === 'm' || q === 'minor' ? 'm' : ''));
    const match = raw.match(/^([a-g])(#|b)?(m)?$/);
    if (!match) return null;
    const root = NOTE_INDEX[(match[1].toUpperCase() + (match[2] || '')) as string];
    if (root === undefined) return null;
    const minor = match[3] === 'm';
    const label =
      NOTE_NAMES[root] + (match[2] || '') + (minor ? ' minor' : ' major');
    return { root, minor, label };
  }

  /** Parse "C - Am - F - G", "Cmaj7", "D min", "A♭" etc. into chords. */
  private parseProgression(input: string): ParsedChord[] {
    const cleaned = input
      .replace(/[♭]/g, 'b')
      .replace(/[♯#]/g, '#')
      .replace(/[–—]/g, '-')
      .replace(/\s*-\s*/g, '-');
    const tokens = cleaned.split(/-|,/).map((s) => s.trim()).filter(Boolean);
    const chords: ParsedChord[] = [];
    for (const token of tokens) {
      const chord = this.parseChord(token);
      if (chord) chords.push(chord);
    }
    return chords;
  }

  private parseChord(token: string): ParsedChord | null {
    const match = token.match(/^([a-gA-G])([#b]?)(.*)$/);
    if (!match) return null;
    const root = NOTE_INDEX[match[1].toUpperCase() + (match[2] || '')];
    if (root === undefined) return null;
    const qualityToken = match[3].trim().toLowerCase();
    // Normalize "major"/"minor" spellings to the shorthand map.
    let quality = qualityToken;
    if (quality === 'major') quality = 'maj';
    if (quality === 'minor') quality = 'm';
    if (quality === 'min') quality = 'm';
    const intervals = CHORD_INTERVALS[quality] ?? CHORD_INTERVALS[''];
    const label =
      NOTE_NAMES[root] + (match[2] || '') + (quality ? quality : '');
    return { root, intervals, label };
  }

  /** i–VI–III–VII for minor, I–V–vi–IV for major. */
  private defaultProgression(key: ParsedKey): ParsedChord[] {
    const numerals = key.minor
      ? ['i', 'VI', 'III', 'VII']
      : ['I', 'V', 'vi', 'IV'];
    return numerals.map((numeral) => this.degreeToChord(key, numeral));
  }

  private degreeToChord(key: ParsedKey, numeral: string): ParsedChord {
    const scale = key.minor ? MINOR_SCALE : MAJOR_SCALE;
    const degree = NUMERAL_DEGREE[numeral.toUpperCase()] ?? 0;
    const root = (key.root + scale[degree]) % 12;
    const isMinor = numeral === numeral.toLowerCase() && !numeral.includes('°');
    const isDim = numeral.includes('°');
    const intervals = isDim
      ? CHORD_INTERVALS['dim']
      : isMinor
        ? CHORD_INTERVALS['m']
        : CHORD_INTERVALS[''];
    return { root, intervals, label: NOTE_NAMES[root] + (isMinor ? 'm' : '') };
  }

  private announce(text: string) {
    try {
      this.speech.speak(text, {
        shapeShift: false,
        forceArchetype: 'Ominous Protocol',
      });
    } catch {
      // Voice layer is optional — the chat reply still renders.
    }
  }

  private parseBeatArgs(raw: string): {
    bpm?: number;
    key?: string;
    genre?: string;
  } {
    const args: { bpm?: number; key?: string; genre?: string } = {};
    const bpmMatch = raw.match(/(\d{2,3})\s*(bpm)?/);
    if (bpmMatch) args.bpm = Math.max(40, Math.min(240, Number(bpmMatch[1])));
    const keyMatch = raw.match(/in\s+([a-g](#|b)?(\s*(m|min|minor|major))?)/);
    if (keyMatch) args.key = keyMatch[1];
    for (const genre of ['trap', 'hip hop', 'hiphop', 'pop', 'house', 'drill', 'boom bap']) {
      if (raw.includes(genre)) {
        args.genre = genre;
        break;
      }
    }
    return args;
  }
}
