import { Injectable, inject } from '@angular/core';
import {
  MusicManagerService,
  TrackNote,
  TrackModel,
} from './music-manager.service';
import { AudioEngineService } from './audio-engine.service';
import { SpeechSynthesisService } from './speech-synthesis.service';
import { UserProfileService } from './user-profile.service';

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
  /** Tracks created by this command, so undo can remove them again. */
  createdTrackIds?: string[];
  /** Selection before the command changed it by creating a track. */
  selectedTrackId?: string | null;
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

/** Recognized names are normalized for groove selection; unknown names retain their label and use a neutral pocket. */
const GENRE_ALIASES: Array<{ alias: string; genre: string }> = [
  { alias: 'drum and bass', genre: 'drum and bass' },
  { alias: 'dnb', genre: 'drum and bass' },
  { alias: 'd&b', genre: 'drum and bass' },
  { alias: 'jersey club', genre: 'jersey club' },
  { alias: 'uk garage', genre: 'uk garage' },
  { alias: 'afro house', genre: 'afro house' },
  { alias: 'deep house', genre: 'deep house' },
  { alias: 'future bass', genre: 'future bass' },
  { alias: 'new jack swing', genre: 'new jack swing' },
  { alias: 'bossa nova', genre: 'bossa nova' },
  { alias: 'k-pop', genre: 'k-pop' },
  { alias: 'j-pop', genre: 'j-pop' },
  { alias: 'hyperpop', genre: 'hyperpop' },
  { alias: 'synthwave', genre: 'synthwave' },
  { alias: 'cloud rap', genre: 'cloud rap' },
  { alias: 'emo rap', genre: 'emo rap' },
  { alias: 'uk drill', genre: 'uk drill' },
  { alias: 'jersey drill', genre: 'jersey drill' },
  { alias: 'soca', genre: 'soca' },
  { alias: 'gqom', genre: 'gqom' },
  { alias: 'highlife', genre: 'highlife' },
  { alias: 'bossa nova', genre: 'bossa nova' },
  { alias: 'cumbia', genre: 'cumbia' },
  { alias: 'flamenco', genre: 'flamenco' },
  { alias: 'tango', genre: 'tango' },
  { alias: 'worship', genre: 'worship' },
  { alias: 'experimental', genre: 'experimental' },
  { alias: 'new age', genre: 'new age' },
  { alias: 'shoegaze', genre: 'shoegaze' },
  { alias: 'jungle', genre: 'jungle' },
  { alias: 'bhangra', genre: 'bhangra' },
  { alias: 'samba', genre: 'samba' },
  { alias: 'brazilian funk', genre: 'brazilian funk' },
  { alias: 'jersey club', genre: 'jersey club' },
  { alias: 'uk garage', genre: 'uk garage' },
  { alias: 'boom bap', genre: 'boom bap' },
  { alias: 'neo soul', genre: 'neo soul' },
  { alias: 'alt country', genre: 'alt country' },
  { alias: 'alternative rock', genre: 'alternative rock' },
  { alias: 'indie rock', genre: 'indie rock' },
  { alias: 'hard rock', genre: 'hard rock' },
  { alias: 'heavy metal', genre: 'heavy metal' },
  { alias: 'afrobeats', genre: 'afrobeats' },
  { alias: 'afrobeat', genre: 'afrobeats' },
  { alias: 'amapiano', genre: 'amapiano' },
  { alias: 'reggaeton', genre: 'reggaeton' },
  { alias: 'dancehall', genre: 'dancehall' },
  { alias: 'classical', genre: 'classical' },
  { alias: 'orchestral', genre: 'orchestral' },
  { alias: 'ambient', genre: 'ambient' },
  { alias: 'shoegaze', genre: 'shoegaze' },
  { alias: 'breakbeat', genre: 'breakbeat' },
  { alias: 'dubstep', genre: 'dubstep' },
  { alias: 'grime', genre: 'grime' },
  { alias: 'phonk', genre: 'phonk' },
  { alias: 'drill', genre: 'drill' },
  { alias: 'gospel', genre: 'gospel' },
  { alias: 'country', genre: 'country' },
  { alias: 'bluegrass', genre: 'bluegrass' },
  { alias: 'reggae', genre: 'reggae' },
  { alias: 'salsa', genre: 'salsa' },
  { alias: 'bachata', genre: 'bachata' },
  { alias: 'latin', genre: 'latin' },
  { alias: 'jazz', genre: 'jazz' },
  { alias: 'swing', genre: 'jazz' },
  { alias: 'funk', genre: 'funk' },
  { alias: 'disco', genre: 'disco' },
  { alias: 'house', genre: 'house' },
  { alias: 'techno', genre: 'techno' },
  { alias: 'trance', genre: 'trance' },
  { alias: 'electronic', genre: 'electronic' },
  { alias: 'r&b', genre: 'r&b' },
  { alias: 'rnb', genre: 'r&b' },
  { alias: 'soul', genre: 'soul' },
  { alias: 'rock', genre: 'rock' },
  { alias: 'metal', genre: 'metal' },
  { alias: 'punk', genre: 'punk' },
  { alias: 'pop', genre: 'pop' },
  { alias: 'hip hop', genre: 'hip hop' },
  { alias: 'hiphop', genre: 'hip hop' },
  { alias: 'rap', genre: 'hip hop' },
  { alias: 'trap', genre: 'trap' },
  { alias: 'lo-fi', genre: 'lofi' },
  { alias: 'lo fi', genre: 'lofi' },
  { alias: 'lofi', genre: 'lofi' },
  { alias: 'folk', genre: 'folk' },
  { alias: 'acoustic', genre: 'acoustic' },
];

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
  private profileService = inject(UserProfileService, { optional: true });

  private currentProfile() {
    return this.profileService?.profile() ?? null;
  }

  private readonly undoStack: UndoEntry[] = [];
  private generationCounter = 0;

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
    // A command that created tracks must remove those tracks as part of its
    // own undo transaction. Otherwise "undo" leaves empty Drums/Bass/etc.
    // channels behind and the assistant falsely claims the session is exact.
    if (entry.createdTrackIds?.length) {
      const created = new Set(entry.createdTrackIds);
      this.music.tracks.update((ts) => ts.filter((track) => !created.has(track.id)));
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
    if (entry.selectedTrackId !== undefined) {
      this.music.selectedTrackId.set(entry.selectedTrackId);
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

    // "play a beat" / "play some drums" / "play bass" / "play some lofi
    // beats" — a request to *create* something, not to navigate or parse
    // harmony. Checked before the chord parser, whose note-letter
    // regex would happily read "bass" as a B chord and "a melody" as an A
    // chord. Anything with an instrument noun routes to the right writer; a
    // request with a style adjective ("lofi beats", "drill beat") still lands
    // on the beat builder.
    const playRequest = lower.match(/^(?:play|make|drop|cook up|give me)\s+(.+)$/);
    if (playRequest && !/^(?:the\s+)?(?:mixer|console|studio|master|track list)/.test(playRequest[1])) {
      const rest = playRequest[1];
      const args = this.parseBeatArgs(rest);
      const isDrumAndBass = /\b(?:drum and bass|d&b)\b/.test(rest);
      if (/\bbass\b/.test(rest) && !isDrumAndBass) return this.createBass(args);
      if (/\bmelod|lead line|riff\b/.test(rest)) return this.createMelody(args);
      if (/\bchord|progression\b/.test(rest)) return this.createChords(args);
      if (/\bdrum/.test(rest) && !isDrumAndBass) return this.createDrums({ genre: args.genre, feel: args.feel });
      if (
        /\b(beat|beats|banger|loop|track|vibe|instrumental)/.test(rest)
      ) {
        return this.createBeat(args);
      }
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
      const keyArg = lower.match(/in\s+([a-g](#|b)?(\s*(major|maj|minor|min|m))?)/);
      return this.createChords(
        keyArg ? { key: keyArg[1] } : {}
      );
    }

    // "drums" / "drop some drums".
    if (/(drums|drum pattern|a beat drop)/.test(lower)) {
      return this.createDrums(this.parseBeatArgs(lower));
    }

    // "bassline in A minor" / "bass in E" / "add a bass line".
    if (/(bassline|bass line|bass\b)/.test(lower)) {
      const keyArg = lower.match(/in\s+([a-g](#|b)?(\s*(major|maj|minor|min|m))?)/);
      return this.createBass(keyArg ? { key: keyArg[1] } : {});
    }

    // "melody in E major" / "write me a melody".
    if (/(melody|lead line|riff)/.test(lower)) {
      const keyArg = lower.match(/in\s+([a-g](#|b)?(\s*(major|maj|minor|min|m))?)/);
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
    feel?: string;
  }): ChatMusicResult {
    const profile = this.currentProfile();
    const journey = profile?.musicalJourney;
    const blueprint = journey?.musicBlueprint;
    const bpm =
      args.bpm ??
      this.preferredBpm(journey?.preferredBpmRange) ??
      (Number.isFinite(profile?.genreSpecificData?.tempo)
        ? Math.max(40, Math.min(240, profile.genreSpecificData.tempo))
        : this.currentTempo());
    const key =
      this.parseKey(args.key) ??
      this.parseKey(profile?.genreSpecificData?.key) ??
      this.parseKey('C minor')!;
    const genre = args.genre || profile?.primaryGenre || 'trap';

    const target = this.music.selectedTrackId();
    const tracks = this.music.tracks();
    const snapshot: UndoEntry = {
      label: `beat in ${key.label} at ${bpm} BPM (${genre})`,
      tempo: this.currentTempo(),
      notes: [],
      createdTrackIds: [],
      selectedTrackId: this.music.selectedTrackId(),
    };

    const drumId = this.ensureTrack(tracks, 'Drums', 'trap-808-elite', 'drum', snapshot);
    const bassId = this.ensureTrack(tracks, 'Bass', 'sub-commander', 'midi', snapshot);
    const chordId = this.ensureTrack(tracks, 'Chords', 'analog-warmth', 'midi', snapshot);
    const melodyId = this.ensureTrack(tracks, 'Melody', 'cyber-stab', 'midi', snapshot);

    this.music.engine.tempo.set(bpm);

    this.writeDrumPattern(drumId, genre, args.feel || blueprint?.rhythmicFeel || '');
    this.writeBass(bassId, key);
    this.writeChords(chordId, key, blueprint?.harmonicLanguage || '');
    this.writeMelody(melodyId, key);

    if (target) this.music.selectedTrackId.set(target);

    this.pushUndo(snapshot);
    this.lastCommandLabel = snapshot.label;

    return {
      content: `Beat forged: ${key.label} at ${bpm} BPM, ${genre} energy. Four tracks armed — Drums, Bass, Chords, Melody.${blueprint?.sonicNonNegotiables ? ` Protecting your sonic rule: ${blueprint.sonicNonNegotiables}.` : ''} Say "preview" to hear it or "undo" to scrap it.`,
      actions: [
        { id: 'music-preview', label: 'Preview' },
        { id: 'music-undo', label: 'Undo' },
      ],
    };
  }

  private createDrums(args: { genre?: string; feel?: string }): ChatMusicResult {
    const tracks = this.music.tracks();
    const snapshot: UndoEntry = {
      label: 'drum pattern',
      notes: [],
      createdTrackIds: [],
      selectedTrackId: this.music.selectedTrackId(),
    };
    const drumId = this.ensureTrack(tracks, 'Drums', 'trap-808-elite', 'drum', snapshot);
    this.writeDrumPattern(
      drumId,
      args.genre || this.currentProfile()?.primaryGenre || 'trap',
      args.feel || this.currentProfile()?.musicalJourney?.musicBlueprint?.rhythmicFeel || ''
    );
    this.pushUndo(snapshot);
    this.lastCommandLabel = snapshot.label;
    return {
      content: `Drum pattern locked on the Drums track for ${args.genre || this.currentProfile()?.primaryGenre || 'your session'} — kick, snare, hats and claps at ${this.currentTempo()} BPM. Say "preview".`,
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
      createdTrackIds: [],
      selectedTrackId: this.music.selectedTrackId(),
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
      createdTrackIds: [],
      selectedTrackId: this.music.selectedTrackId(),
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
      createdTrackIds: [],
      selectedTrackId: this.music.selectedTrackId(),
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
    snapshot.createdTrackIds ??= [];
    snapshot.createdTrackIds.push(id);
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
  private writeDrumPattern(trackId: string, genre: string, rhythmicFeel = '') {
    const kickMidi = 36;
    const snareMidi = 38;
    const hatMidi = 42;
    const clapMidi = 39;
    const bars = 2;
    const style = genre.toLowerCase();
    const feel = rhythmicFeel.toLowerCase();
    const hits: { midi: number; step: number; velocity: number }[] = [];
    const add = (midi: number, step: number, velocity: number) =>
      hits.push({ midi, step, velocity });

    for (let bar = 0; bar < bars; bar++) {
      const base = bar * 16;
      if (/(sparse|spacious|breathing|minimal)/.test(feel) || /ambient|classical|orchestral/.test(style)) {
        // Leave intentional space; the Studio's other tracks carry the harmony.
        add(kickMidi, base, 0.4);
        add(49, base + 12, 0.24);
        add(hatMidi, base + 8, 0.2);
      } else if (/lofi|lo-fi|chillhop/.test(style)) {
        add(kickMidi, base, 0.82);
        add(kickMidi, base + 10, 0.58);
        add(snareMidi, base + 4, 0.68);
        add(snareMidi, base + 12, 0.62);
        for (let step = 0; step < 16; step += 2) {
          add(hatMidi, base + step, step % 4 === 0 ? 0.34 : 0.22);
        }
      } else if (/house|techno|trance|disco|electronic|uk garage/.test(style) || /four.on.the.floor|driving four/.test(feel)) {
        for (let beat = 0; beat < 4; beat++) add(kickMidi, base + beat * 4, 0.95);
        add(clapMidi, base + 4, 0.72);
        add(clapMidi, base + 12, 0.72);
        for (let step = 2; step < 16; step += 4) {
          add(46, base + step, 0.48);
          add(hatMidi, base + step, 0.34);
        }
      } else if (/drum and bass|breakbeat|dubstep|jungle/.test(style)) {
        add(kickMidi, base, 0.98);
        add(kickMidi, base + 10, 0.72);
        add(snareMidi, base + 4, 0.92);
        add(snareMidi, base + 12, 0.96);
        for (let step = 0; step < 16; step++) {
          if (step % 2 === 0 || step === 7 || step === 15) {
            add(hatMidi, base + step, step % 4 === 0 ? 0.54 : 0.28);
          }
        }
      } else if (/jazz|swing|blues/.test(style) || /swing|shuffle|triplet/.test(feel)) {
        add(kickMidi, base, 0.72);
        add(kickMidi, base + 8, 0.48);
        add(snareMidi, base + 4, 0.34);
        add(snareMidi, base + 12, 0.42);
        for (const step of [0, 3, 4, 7, 8, 11, 12, 15]) {
          add(hatMidi, base + step, step % 4 === 0 ? 0.42 : 0.25);
        }
        for (const step of [2, 6, 10, 14]) add(51, base + step, 0.38);
      } else if (/\\breggae\\b|dancehall|ska/.test(style)) {
        add(kickMidi, base, 0.82);
        add(kickMidi, base + 10, 0.55);
        add(37, base + 4, 0.58); // cross-stick on the backbeat
        add(37, base + 12, 0.62);
        for (const step of [2, 6, 10, 14]) add(hatMidi, base + step, 0.38);
        for (const step of [3, 7, 11, 15]) add(54, base + step, 0.3);
      } else if (/afro|amapiano|gqom|highlife/.test(style)) {
        for (const step of [0, 6, 10]) add(kickMidi, base + step, step === 0 ? 0.92 : 0.66);
        add(snareMidi, base + 4, 0.76);
        add(clapMidi, base + 12, 0.62);
        for (let step = 0; step < 16; step += 2) add(hatMidi, base + step, step % 4 === 0 ? 0.38 : 0.26);
        for (const step of [3, 7, 11, 15]) add(54, base + step, 0.34);
        if (/amapiano/.test(style)) {
          add(45, base + 7, 0.56); // log-drum-like low tom syncopation
          add(45, base + 14, 0.42);
        }
      } else if (/reggaeton|latin|salsa|bachata|cumbia|soca|samba|bossa nova|flamenco|tango|bhangra|brazilian funk/.test(style)) {
        for (const step of [0, 6, 10]) add(kickMidi, base + step, step === 0 ? 0.9 : 0.68);
        add(snareMidi, base + 4, 0.78);
        add(snareMidi, base + 12, 0.85);
        for (const step of [2, 6, 10, 14]) add(54, base + step, 0.42);
        for (const step of [0, 4, 8, 12]) add(hatMidi, base + step, 0.28);
      } else if (/rock|punk|metal|country|bluegrass|folk|acoustic|shoegaze/.test(style)) {
        add(kickMidi, base, 0.94);
        add(kickMidi, base + 8, 0.76);
        add(kickMidi, base + 14, 0.46);
        add(snareMidi, base + 4, 0.94);
        add(snareMidi, base + 12, 0.9);
        add(snareMidi, base + 10, 0.18);
        for (let step = 0; step < 16; step += 2) {
          add(hatMidi, base + step, step % 4 === 0 ? 0.58 : 0.36);
        }
      } else if (/pop/.test(style)) {
        for (let beat = 0; beat < 4; beat++) add(kickMidi, base + beat * 4, 0.92);
        add(snareMidi, base + 4, 0.9);
        add(snareMidi, base + 12, 0.86);
        add(clapMidi, base + 4, 0.24);
        add(clapMidi, base + 12, 0.24);
        for (let step = 0; step < 16; step += 2) {
          add(hatMidi, base + step, step % 4 === 0 ? 0.58 : 0.4);
        }
      } else if (/r&b|soul|gospel|funk|neo soul|new jack swing|worship/.test(style)) {
        add(kickMidi, base, 0.94);
        add(kickMidi, base + 7, 0.56);
        add(kickMidi, base + 10, 0.72);
        add(snareMidi, base + 4, 0.82);
        add(snareMidi, base + 12, 0.88);
        add(snareMidi, base + 15, 0.22);
        for (const step of [0, 2, 4, 6, 8, 10, 12, 14]) {
          add(hatMidi, base + step, step % 4 === 0 ? 0.48 : 0.28);
        }
      } else if (/jersey club|jersey drill/.test(style)) {
        for (const step of [0, 3, 6, 8, 11, 14]) add(kickMidi, base + step, step % 8 === 0 ? 0.92 : 0.66);
        add(snareMidi, base + 4, 0.84);
        add(snareMidi, base + 12, 0.86);
        for (const step of [2, 6, 10, 14]) add(46, base + step, 0.38);
        for (const step of [0, 4, 8, 12]) add(hatMidi, base + step, 0.36);
      } else if (/drill/.test(style)) {
        add(kickMidi, base, 0.96);
        add(kickMidi, base + 6, 0.62);
        add(kickMidi, base + 11, 0.82);
        add(snareMidi, base + 7, 0.9);
        add(snareMidi, base + 15, 0.94);
        for (let step = 0; step < 16; step += 2) {
          add(hatMidi, base + step, step % 4 === 0 ? 0.48 : 0.26);
        }
        add(hatMidi, base + 13, 0.34);
        add(hatMidi, base + 14, 0.28);
      } else if (/trap|phonk|cloud rap|emo rap/.test(style)) {
        add(kickMidi, base, 0.96);
        add(kickMidi, base + 8, 0.72);
        add(kickMidi, base + 12, 0.5);
        add(snareMidi, base + 4, 0.9);
        add(snareMidi, base + 12, 0.92);
        for (let step = 0; step < 16; step++) {
          if (step % 2 === 0 || step >= 13) {
            add(hatMidi, base + step, step % 4 === 0 ? 0.5 : 0.26);
          }
        }
      } else if (/hip hop|boom bap|rap|grime/.test(style)) {
        add(kickMidi, base, 0.92);
        add(kickMidi, base + 7, 0.6);
        add(kickMidi, base + 10, 0.76);
        add(snareMidi, base + 4, 0.88);
        add(snareMidi, base + 12, 0.92);
        for (const step of [0, 2, 4, 6, 8, 10, 12, 14]) {
          add(hatMidi, base + step, step % 4 === 0 ? 0.46 : 0.28);
        }

      } else {
        // A flexible straight-time pocket for new or highly specific subgenres.
        add(kickMidi, base, 0.92);
        add(kickMidi, base + 8, 0.68);
        add(snareMidi, base + 4, 0.82);
        add(snareMidi, base + 12, 0.86);
        for (let step = 0; step < 16; step += 2) {
          add(hatMidi, base + step, step % 4 === 0 ? 0.46 : 0.3);
        }
      }
    }

    const stamp = this.nextStamp('drums');
    hits.forEach((hit, index) => {
      this.music.addNoteToTrack(trackId, {
        id: `${stamp}_${index}`,
        midi: hit.midi,
        step: hit.step,
        length: index % 2 === 0 ? 1 : 0.5,
        velocity: hit.velocity,
      });
    });
  }

  private writeBass(trackId: string, key: ParsedKey) {
    const rootMidi = key.root + 24; // octave 2
    const stamp = this.nextStamp('bass');
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

  private writeChords(trackId: string, key: ParsedKey, harmonicLanguage = '') {
    let progression = this.defaultProgression(key);
    const language = harmonicLanguage.toLowerCase();
    if (/open fifth|power chord|no third/.test(language)) {
      progression = progression.map((chord) => ({ ...chord, intervals: [0, 7] }));
    } else if (/suspend|sus2|sus4/.test(language)) {
      const suspension = /sus2/.test(language) ? 2 : 5;
      progression = progression.map((chord) => ({ ...chord, intervals: [0, suspension, 7] }));
    } else if (/seventh|7th|jazz|extended|rich voicing/.test(language)) {
      const sevenths = key.minor ? [10, 11, 11, 10] : [11, 10, 10, 11];
      progression = progression.map((chord, index) => ({
        ...chord,
        intervals: [...chord.intervals, sevenths[index % sevenths.length]],
      }));
    }
    this.writeProgression(trackId, progression);
  }

  private writeProgression(trackId: string, chords: ParsedChord[]) {
    const stamp = this.nextStamp('chords');
    const rootOctave = 60; // C4 anchor — stack chords with smooth voice leading
    let previousRoot: number | null = null;
    chords.forEach((chord, bar) => {
      // Move each chord to the nearest octave to the previous chord root.
      let root = rootOctave + chord.root;
      if (previousRoot !== null) {
        while (root - previousRoot > 6) root -= 12;
        while (root - previousRoot < -6) root += 12;
      }
      previousRoot = root;
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
    const stamp = this.nextStamp('melody');
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
        velocity: [0.78, 0.58, 0.68, 0.62, 0.72, 0.56, 0.66, 0.6][i],
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
      .replace(/\s+(major|maj|minor|min|m)\s*$/, (_, q) =>
        q === 'm' || q === 'min' || q === 'minor' ? 'm' : ''
      );
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
    feel?: string;
  } {
    const args: { bpm?: number; key?: string; genre?: string; feel?: string } = {};

    const bpmMatch = raw.match(/(\d{2,3})\s*(?:bpm)?/);
    if (bpmMatch) args.bpm = Math.max(40, Math.min(240, Number(bpmMatch[1])));

    // Require a real boundary after the note/key so "in Cumbia" is treated as
    // a genre, not as the key of C. Accept key phrases followed by tempo text.
    const keyMatch = raw.match(
      /\bin\s+([a-g](?:#|b)?(?:\s*(?:major|maj|minor|min|m))?)(?=\s*(?:$|[,;]|at\b|\d{2,3}\s*(?:bpm\b)?))/i
    );
    if (keyMatch) args.key = keyMatch[1];

    const normalized = raw.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    const feelMatch = normalized.match(/\b(swing|shuffle|triplet|straight|sparse|spacious|breathing|minimal|four on the floor|driving four)\b/i);
    if (feelMatch) args.feel = feelMatch[1];
    for (const { alias, genre } of GENRE_ALIASES) {
      const phrase = alias.replace(/[-_]+/g, ' ').split(/\s+/).join('\\s+');
      if (new RegExp(`(?:^|[^a-z0-9])${phrase}(?:$|[^a-z0-9])`, 'i').test(normalized)) {
        args.genre = genre;
        break;
      }
    }

    // Preserve an explicitly requested subgenre that is not in the built-in
    // groove map. It will use the neutral pocket rather than being mislabeled.
    if (!args.genre) {
      const freeform = normalized.match(
        /\bin\s+(?![a-g](?:#|b)?(?:\s*(?:major|maj|minor|min|m))?(?=\s*(?:$|[,;]|at\b|\d{2,3}\s*(?:bpm\b)?)))([a-z][a-z0-9 &'/-]{1,28}?)(?=\s+(?:at\b|\d{2,3}\s*(?:bpm\b)|with\b)|$)/i
      );
      const styledRequest = normalized.match(
        /^(?:\/?make|create|build|play|drop|cook up|give me)\s+(?:(?:me|us)\s+)?(?:a|an|some)?\s*(.*?)\s+(?:beat|beats|banger|loop|instrumental)\b/i
      );
      const customGenre = (freeform?.[1] || styledRequest?.[1] || '')
        .replace(/^(?:a|an|some|the)\s+/i, '')
        .trim();
      if (
        customGenre &&
        !/^(?:style|the style of|key|major|minor|beat|beats|track|loop|swing|shuffle|triplet|straight|sparse|spacious|breathing|minimal)$/i.test(customGenre)
      ) {
        args.genre = customGenre;
      }
    }
    return args;
  }

  private preferredBpm(range?: string): number | null {
    const match = String(range || '').match(/(\d{2,3})(?:\s*-\s*(\d{2,3}))?/);
    if (!match) return null;
    const low = Number(match[1]);
    const high = Number(match[2] || match[1]);
    if (low < 40 || high > 240 || high < low) return null;
    return Math.max(40, Math.min(240, Math.round(((low + high) / 2) / 5) * 5));
  }

  private nextStamp(prefix: string): string {
    this.generationCounter += 1;
    return `${prefix}_${Date.now()}_${this.generationCounter}`;
  }
}
