import { Injectable, inject, signal, computed } from '@angular/core';
import {
  SongwritingAssistantService,
  LyricSection,
  LyricLine,
  MelodyNote,
} from './songwriting-assistant.service';
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

export interface PianoRollNote {
  pitch: number;
  noteName: string;
  startBeat: number;
  duration: number;
  velocity: number;
  type: 'melody' | 'harmony';
  word?: string;
  harmonyType?: '3rd' | '5th' | '7th' | 'octave' | 'unison' | 'chord';
  voicing?: string;
}

export interface ChordVoicingConfig {
  type: '3rd' | '5th' | '7th' | 'octave' | 'unison' | 'chord';
  enabled: boolean;
  inversion: number; // 0 = root, 1 = first, 2 = second
  octaveShift: number; // -2 to 2
  spread: 'close' | 'open' | 'wide';
}

@Injectable({ providedIn: 'root' })
export class CoWriteService {
  private songwriting = inject(SongwritingAssistantService);
  private styleMimic = inject(SmuveStyleMimicService);
  private ai = inject(AiService);

  currentSession = signal<CoWriteSession | null>(null);
  isThinking = signal(false);
  turnCount = computed(() => this.currentSession()?.turns.length || 0);
  progress = computed(() => {
    const session = this.currentSession();
    if (!session) return 0;
    return session.sectionIndex / session.sectionOrder.length;
  });
  smuveContributionCount = computed(
    () =>
      this.currentSession()?.turns.filter((t) => t.role === 'smuve').length || 0
  );
  userContributionCount = computed(
    () =>
      this.currentSession()?.turns.filter((t) => t.role === 'user').length || 0
  );

  // Audio playback
  private audioContext: AudioContext | null = null;
  private scheduledNodes: OscillatorNode[] = [];
  isPlayingAudio = signal(false);

  private sessionIdCounter = 0;

  readonly NOTE_NAMES = [
    'C',
    'C#',
    'D',
    'D#',
    'E',
    'F',
    'F#',
    'G',
    'G#',
    'A',
    'A#',
    'B',
  ];

  // ── MIDI Export ─────────────────────────────────────────

  /** Generate and download a standard MIDI file from piano roll notes */
  exportMidi(
    melodyNotes: PianoRollNote[],
    harmonyNotes: PianoRollNote[],
    bpm: number = 120
  ): void {
    const allNotes = [
      ...melodyNotes.map((n) => ({ ...n, channel: 0 })),
      ...harmonyNotes.map((n) => ({ ...n, channel: 1 })),
    ];
    if (allNotes.length === 0) return;

    // Sort by start beat
    allNotes.sort((a, b) => a.startBeat - b.startBeat);

    // MIDI constants
    const header = new Uint8Array([
      0x4d,
      0x54,
      0x68,
      0x64, // MThd
      0x00,
      0x00,
      0x00,
      0x06, // chunk length
      0x00,
      0x01, // format 1
      0x00,
      0x02, // 2 tracks (melody + harmony)
      // ticks per quarter note (480)
      (bpm / 60) & 0xff,
      (bpm / 60) & 0xff,
    ]);

    // Build track data
    const track0 = this.buildMidiTrack(
      allNotes.filter((n) => n.channel === 0),
      0,
      bpm
    );
    const track1 = this.buildMidiTrack(
      allNotes.filter((n) => n.channel === 1),
      1,
      bpm
    );

    // Combine tracks
    const track0Header = new Uint8Array([
      0x4d,
      0x54,
      0x72,
      0x6b, // MTrk
      ...this.encodeVarLen(track0.length),
    ]);
    const track1Header = new Uint8Array([
      0x4d,
      0x54,
      0x72,
      0x6b,
      ...this.encodeVarLen(track1.length),
    ]);

    // Concatenate everything
    const midiData = new Uint8Array([
      ...header,
      ...track0Header,
      ...track0,
      ...track1Header,
      ...track1,
    ]);

    // Download as .mid file
    const blob = new Blob([midiData], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'smuvemelody.mid';
    a.click();
    URL.revokeObjectURL(url);
  }

  private buildMidiTrack(
    notes: PianoRollNote[],
    channel: number,
    bpm: number
  ): Uint8Array {
    const ticksPerQuarter = 480;
    const tickRate = (bpm / 60) * ticksPerQuarter;
    const events: { tick: number; data: number[] }[] = [];

    // Track name event
    events.push({
      tick: 0,
      data: [
        0xff,
        0x03,
        ...this.encodeVarLen(channel === 0 ? 6 : 7),
        ...(channel === 0
          ? [0x4d, 0x65, 0x6c, 0x6f, 0x64, 0x79]
          : [0x48, 0x61, 0x72, 0x6d, 0x6f, 0x6e, 0x79]),
      ],
    });

    // Program change: Acoustic Grand Piano (0) for melody, Electric Piano (4) for harmony
    events.push({ tick: 0, data: [0xc0 | channel, channel === 0 ? 0 : 4] });

    // Add note on/off events
    for (const note of notes) {
      const startTick = Math.round(note.startBeat * ticksPerQuarter);
      const durationTicks = Math.max(
        ticksPerQuarter / 4,
        Math.round(note.duration * ticksPerQuarter)
      );

      // Note On
      events.push({
        tick: startTick,
        data: [
          0x90 | channel,
          note.pitch,
          Math.max(20, Math.min(127, note.velocity)),
        ],
      });
      // Note Off
      events.push({
        tick: startTick + durationTicks,
        data: [0x80 | channel, note.pitch, 64],
      });
    }

    // End of track
    events.push({
      tick: Math.max(...events.map((e) => e.tick)) + ticksPerQuarter,
      data: [0xff, 0x2f, 0x00],
    });

    // Sort by tick
    events.sort((a, b) => a.tick - b.tick);

    // Encode to bytes
    const bytes: number[] = [];
    let lastTick = 0;
    for (const evt of events) {
      const delta = evt.tick - lastTick;
      bytes.push(...this.encodeVarLen(delta));
      bytes.push(...evt.data);
      lastTick = evt.tick;
    }

    return new Uint8Array(bytes);
  }

  private encodeVarLen(value: number): number[] {
    const bytes: number[] = [];
    if (value < 128) {
      bytes.push(value);
    } else {
      // Build bytes from back to front
      let temp = value;
      bytes.push(temp & 0x7f);
      temp >>= 7;
      while (temp > 0) {
        bytes.unshift((temp & 0x7f) | 0x80);
        temp >>= 7;
      }
    }
    return bytes;
  }

  // ── Audio Preview ───────────────────────────────────────

  /** Play melody + harmony using Web Audio API synthesizer */
  playAudioPreview(
    melodyNotes: PianoRollNote[],
    harmonyNotes: PianoRollNote[],
    bpm: number = 120
  ): void {
    if (this.isPlayingAudio()) {
      this.stopAudioPreview();
      return;
    }

    this.audioContext = new AudioContext();
    const ctx = this.audioContext;
    this.isPlayingAudio.set(true);

    const beatsPerSecond = bpm / 60;
    const allNotes = [
      ...melodyNotes.map((n) => ({ ...n, synth: 'melody' as const })),
      ...harmonyNotes.map((n) => ({ ...n, synth: 'harmony' as const })),
    ];

    for (const note of allNotes) {
      const startTime = note.startBeat / beatsPerSecond;
      const duration = Math.max(0.1, note.duration / beatsPerSecond);

      // Use different waveforms for melody vs harmony
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = note.synth === 'melody' ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(this.midiToFreq(note.pitch), startTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(
        note.synth === 'melody' ? 8000 : 4000,
        startTime
      );

      const velocity = note.velocity / 127;

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(velocity * 0.3, startTime + 0.02);
      gain.gain.setValueAtTime(velocity * 0.3, startTime + duration - 0.05);
      gain.gain.linearRampToValueAtTime(0, startTime + duration);

      // Reverb send via convolver (simple delay-based reverb)
      const delay = ctx.createDelay(0.5);
      delay.delayTime.setValueAtTime(0.08, startTime);
      const feedback = ctx.createGain();
      feedback.gain.setValueAtTime(0.2, startTime);
      const reverbGain = ctx.createGain();
      reverbGain.gain.setValueAtTime(0.15, startTime);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      // Subtle reverb
      gain.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(reverbGain);
      reverbGain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.1);

      this.scheduledNodes.push(osc);
    }

    // Auto-stop after all notes play
    const totalDuration = allNotes.reduce((max, n) => {
      const end = (n.startBeat + n.duration) / beatsPerSecond;
      return Math.max(max, end);
    }, 0);

    setTimeout(
      () => {
        this.stopAudioPreview();
      },
      totalDuration * 1000 + 500
    );
  }

  /** Stop audio preview playback */
  stopAudioPreview(): void {
    this.isPlayingAudio.set(false);
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.scheduledNodes = [];
  }

  /** Convert MIDI note number to frequency in Hz */
  private midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // ── Chord Voicing Engine ────────────────────────────────

  /** Generate chord voicings from a set of harmony notes */
  generateChordVoicings(
    melody: PianoRollNote[],
    harmonyTypes: Array<
      '3rd' | '5th' | '7th' | 'octave' | 'unison' | 'chord'
    > = ['3rd', '5th', '7th'],
    voicingConfigs: ChordVoicingConfig[] = [],
    key: string = 'C'
  ): { melody: PianoRollNote[]; harmony: PianoRollNote[] } {
    const scaleNotes = this.getScaleNotes(key, 'major');
    const harmonyNotes: PianoRollNote[] = [];

    // Default configs if none provided
    const configs =
      voicingConfigs.length > 0
        ? voicingConfigs
        : harmonyTypes.map((t) => ({
            type: t as '3rd' | '5th' | '7th' | 'octave' | 'unison' | 'chord',
            enabled: true,
            inversion: 0,
            octaveShift: 0,
            spread: 'close' as const,
          }));

    for (const note of melody) {
      let voicingIndex = 0;

      for (const config of configs) {
        if (!config.enabled) continue;

        let intervalBase: number;
        switch (config.type) {
          case '3rd':
            intervalBase = 4;
            break;
          case '5th':
            intervalBase = 7;
            break;
          case '7th':
            intervalBase = 10;
            break;
          case 'octave':
            intervalBase = 12;
            break;
          case 'unison':
            intervalBase = 0;
            break;
          case 'chord':
            intervalBase = 4 + voicingIndex * 3;
            break; // stacked 3rds
          default:
            intervalBase = 4;
        }

        // Apply inversion (0 = root, 1 = first, 2 = second)
        let inversionShift = 0;
        if (config.inversion === 1)
          inversionShift = -4; // drop the 3rd down an octave
        else if (config.inversion === 2) inversionShift = -9; // drop the 5th down

        // Apply spread
        let spreadShift = 0;
        if (config.spread === 'open')
          spreadShift = 12; // spread up an octave
        else if (config.spread === 'wide') spreadShift = 24; // spread up two octaves

        // Apply octave shift
        const octShift = config.octaveShift * 12;

        const finalPitch =
          note.pitch + intervalBase + inversionShift + spreadShift + octShift;

        // Keep in a reasonable range
        const clampedPitch = Math.max(36, Math.min(96, finalPitch));

        // Choose voicing name
        const inversionNames = ['Root', '1st Inv.', '2nd Inv.'];
        const voicingName = `${config.type} (${inversionNames[config.inversion] || 'Root'}, ${config.spread})`;

        harmonyNotes.push({
          pitch: clampedPitch,
          noteName: this.midiToNoteName(clampedPitch),
          startBeat: note.startBeat,
          duration: note.duration,
          velocity: Math.max(30, 70 - configs.length * 8),
          type: 'harmony',
          word: note.word,
          harmonyType: config.type,
          voicing: voicingName,
        });

        voicingIndex++;
      }
    }

    return { melody, harmony: harmonyNotes };
  }

  // ── Melody & Piano Roll ─────────────────────────────────

  /** Generate auto-harmony notes from melody */
  generateAutoHarmony(
    harmonyTypes: Array<'3rd' | '5th' | '7th' | 'octave' | 'unison'> = [
      '3rd',
      '5th',
    ],
    key: string = 'C',
    scaleType: string = 'major'
  ): { melody: PianoRollNote[]; harmony: PianoRollNote[]; totalNotes: number } {
    const session = this.currentSession();
    if (!session) return { melody: [], harmony: [], totalNotes: 0 };

    const accepted = session.turns.filter((t) => t.accepted);
    if (accepted.length === 0)
      return { melody: [], harmony: [], totalNotes: 0 };

    const useKey = key || session.key || 'C';
    const scaleNotes = this.getScaleNotes(useKey, scaleType);
    const melody: PianoRollNote[] = [];
    const harmony: PianoRollNote[] = [];
    let beat = 0;

    for (const turn of accepted) {
      const words = turn.text.split(' ');
      const noteCount = Math.min(words.length, 8);

      for (let n = 0; n < noteCount; n++) {
        const wave = Math.sin((n / noteCount) * Math.PI * 2);
        const step = Math.round(wave * 3 + 4);
        const index =
          ((step % scaleNotes.length) + scaleNotes.length) % scaleNotes.length;
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

        for (const hType of harmonyTypes) {
          let interval: number;
          switch (hType) {
            case '3rd':
              interval = 4;
              break;
            case '5th':
              interval = 7;
              break;
            case '7th':
              interval = 10;
              break;
            case 'octave':
              interval = 12;
              break;
            case 'unison':
              interval = 0;
              break;
            default:
              interval = 4;
          }
          const harmonyPitch = pitch + interval;
          harmony.push({
            pitch: harmonyPitch,
            noteName: this.midiToNoteName(harmonyPitch),
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
      beat += 2;
    }

    return { melody, harmony, totalNotes: melody.length + harmony.length };
  }

  /** Generate melody grid from accepted lyrics */
  generateMelodyForSession(): {
    melody: string;
    notes: string;
    noteCount: number;
  } {
    const session = this.currentSession();
    if (!session)
      return { melody: 'No active session', notes: '', noteCount: 0 };

    const accepted = session.turns.filter((t) => t.accepted);
    if (accepted.length === 0)
      return { melody: 'Accept some lines first.', notes: '', noteCount: 0 };

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
        const lineNotes: string[] = [];
        const lineMelody: string[] = [];

        for (let n = 0; n < noteCount; n++) {
          const wave = Math.sin((n / noteCount) * Math.PI * 2);
          const step = Math.round(wave * 3 + 4);
          const index =
            ((step % scaleNotes.length) + scaleNotes.length) %
            scaleNotes.length;
          const midiNote = scaleNotes[index] + 60;
          const noteName = this.midiToNoteName(midiNote);
          const duration = n % 2 === 0 ? '4' : '8';
          const word =
            words[Math.min(n, words.length - 1)]?.replace(/[^a-zA-Z']/g, '') ||
            '';
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
  midiToNoteName(midi: number): string {
    const octave = Math.floor(midi / 12) - 1;
    const noteIndex = midi % 12;
    return `${this.NOTE_NAMES[noteIndex]}${octave}`;
  }

  /** Get scale notes for melody generation */
  private getScaleNotes(key: string, scale: string): number[] {
    const keyIndex = [
      'C',
      'Db',
      'D',
      'Eb',
      'E',
      'F',
      'F#',
      'G',
      'Ab',
      'A',
      'Bb',
      'B',
    ].indexOf(key);
    const majorIntervals = [0, 2, 4, 5, 7, 9, 11];
    const intervals =
      scale === 'minor' ? [0, 2, 3, 5, 7, 8, 10] : majorIntervals;
    return intervals.map((i) => (keyIndex + i) % 12);
  }

  // ── Session Management ──────────────────────────────────

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
    const multiArtists =
      config.artists || (config.artist ? [config.artist] : []);
    const primaryArtist = multiArtists[0] || null;
    const profile = primaryArtist
      ? this.styleMimic.getStyleProfile(primaryArtist)
      : null;
    const genre = config.genre || profile?.genre || 'Pop';
    const bpm = config.bpm || this.pickBpm(genre);
    const key =
      config.key ||
      profile?.productionCharacteristics?.keySignature?.[0] ||
      'Am';
    const mood = config.mood || 'emotional';
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

  async generateSmuveContribution(userText?: string): Promise<string> {
    const session = this.currentSession();
    if (!session || !session.isActive) return '';
    this.isThinking.set(true);
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));

    const sectionType = session.currentSection || 'verse';
    const previousUserLines = session.turns
      .filter((t) => t.role === 'user' && t.sectionType === sectionType)
      .map((t) => t.text);
    const previousSmuveLines = session.turns
      .filter((t) => t.role === 'smuve' && t.sectionType === sectionType)
      .map((t) => t.text);
    const context =
      userText || previousUserLines[previousUserLines.length - 1] || '';

    let activeArtist: string | null = null;
    if (session.artists && session.artists.length > 0) {
      activeArtist =
        session.artists[Math.floor(Math.random() * session.artists.length)];
    }

    const response = this.generateSmuveLine(
      context,
      sectionType,
      session,
      activeArtist
    );
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
        ? this.generateBlendedFeedback(
            response,
            sectionType,
            session,
            activeArtist
          )
        : this.generateFeedback(response, sectionType, session),
      timestamp: Date.now(),
      accepted: false,
      rejected: false,
    };
    this.appendTurn(turn);
    this.isThinking.set(false);
    return response + influenceNote;
  }

  async completeCurrentSection(): Promise<string[]> {
    const session = this.currentSession();
    if (!session || !session.isActive) return [];
    this.isThinking.set(true);
    await new Promise((r) => setTimeout(r, 500));
    const sectionType = session.currentSection || 'verse';
    const profile = session.artist
      ? this.styleMimic.getStyleProfile(session.artist)
      : null;
    const section = this.songwriting.generateLyricBySection(
      sectionType,
      session.topic,
      session.mood,
      profile?.artistName
    );
    const lines = section.lines.map((l) => l.text);
    for (const text of lines) {
      const turn: CoWriteTurn = {
        id: `turn_${Date.now()}_${session.turns.length}`,
        role: 'smuve',
        sectionType,
        text,
        lines: [
          {
            text,
            syllableCount: this.countSyllables(text),
            emphasis: 'payoff',
          },
        ],
        feedback: this.generateTransitionFeedback(sectionType, session),
        timestamp: Date.now(),
        accepted: false,
        rejected: false,
      };
      this.appendTurn(turn);
    }
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

  acceptTurn(turnId: string): void {
    this.currentSession.update((s) =>
      s
        ? {
            ...s,
            turns: s.turns.map((t) =>
              t.id === turnId ? { ...t, accepted: true, rejected: false } : t
            ),
          }
        : s
    );
  }
  rejectTurn(turnId: string): void {
    this.currentSession.update((s) =>
      s
        ? {
            ...s,
            turns: s.turns.map((t) =>
              t.id === turnId ? { ...t, rejected: true, accepted: false } : t
            ),
          }
        : s
    );
  }

  getLatestSmuveTurn(): CoWriteTurn | null {
    const session = this.currentSession();
    if (!session) return null;
    return [...session.turns].reverse().find((t) => t.role === 'smuve') || null;
  }

  getCompiledLyrics(): string {
    const session = this.currentSession();
    if (!session) return '';
    const sections = new Map<LyricSection['type'], string[]>();
    for (const turn of session.turns.filter((t) => t.accepted)) {
      const existing = sections.get(turn.sectionType) || [];
      existing.push(turn.text);
      sections.set(turn.sectionType, existing);
    }
    let output = '';
    const sectionOrder: LyricSection['type'][] = [
      'intro',
      'verse',
      'pre-chorus',
      'chorus',
      'bridge',
      'outro',
    ];
    for (const type of sectionOrder) {
      const lines = sections.get(type);
      if (lines && lines.length > 0) {
        output += `\n[${type.toUpperCase()}]\n`;
        output += lines.map((l) => `  ${l}`).join('\n') + '\n';
      }
    }
    return output;
  }

  getSuggestion(context: string): CoWriteSuggestion {
    const session = this.currentSession();
    const sectionType = session?.currentSection || 'verse';
    if (sectionType === 'chorus')
      return {
        type: 'line',
        content: this.generateHookSuggestion(session?.topic || ''),
        context: 'Try making the hook more repetitive and singable',
      };
    if (sectionType === 'bridge')
      return {
        type: 'restructure',
        content:
          'Consider a key change or a new chord progression here for emotional lift',
        context: 'Bridges work best when they present a NEW perspective',
      };
    return {
      type: 'line',
      content: this.generateLineSuggestion(context, sectionType, session),
      context: `Build on the ${sectionType} theme`,
    };
  }

  endSession(): void {
    this.currentSession.update((s) =>
      s
        ? {
            ...s,
            isActive: false,
            isComplete: true,
            lastActivityAt: Date.now(),
          }
        : s
    );
  }
  resetSession(): void {
    this.currentSession.set(null);
    this.isThinking.set(false);
  }

  // ── Project Manager ─────────────────────────────────────

  private readonly STORAGE_KEY = 'smuve_cowrite_projects';
  private projectsSignal = signal<CoWriteProject[]>([]);
  get savedProjects() {
    return this.projectsSignal.asReadonly();
  }

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

  saveProject(name?: string): CoWriteProject | null {
    const session = this.currentSession();
    if (!session) return null;
    const sectionMap: Record<string, string[]> = {};
    for (const turn of session.turns.filter((t) => t.accepted)) {
      if (!sectionMap[turn.sectionType]) sectionMap[turn.sectionType] = [];
      sectionMap[turn.sectionType].push(turn.text);
    }
    const acceptedCount = session.turns.filter((t) => t.accepted).length;
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
    const existing = this.loadProjects();
    existing.unshift(project);
    if (existing.length > 50) existing.length = 50;
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(existing));
    this.projectsSignal.set(existing);
    return project;
  }

  loadProject(projectId: string): CoWriteProject | null {
    const projects = this.loadProjects();
    const found = projects.find((p) => p.id === projectId);
    if (!found) return null;
    this.startSession({
      topic: found.topic,
      genre: found.genre,
      bpm: found.bpm,
      key: found.key,
      mood: found.mood,
      artists: found.artists,
    });
    for (const [section, lines] of Object.entries(found.lyrics)) {
      for (const text of lines) {
        this.addUserContribution(text);
        const latest =
          this.currentSession()?.turns[this.currentSession()!.turns.length - 1];
        if (latest) this.acceptTurn(latest.id);
      }
    }
    return found;
  }

  deleteProject(projectId: string): boolean {
    const projects = this.loadProjects();
    const filtered = projects.filter((p) => p.id !== projectId);
    if (filtered.length === projects.length) return false;
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
    this.projectsSignal.set(filtered);
    return true;
  }

  exportToStudio(): { success: boolean; message: string; project?: any } {
    const session = this.currentSession();
    if (!session)
      return { success: false, message: 'No active session to export.' };
    const accepted = session.turns.filter((t) => t.accepted);
    if (accepted.length === 0)
      return {
        success: false,
        message: 'No accepted lines to export. Accept some lines first.',
      };
    const sectionMap = new Map<string, string[]>();
    for (const turn of accepted) {
      const existing = sectionMap.get(turn.sectionType) || [];
      existing.push(turn.text);
      sectionMap.set(turn.sectionType, existing);
    }
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

  getSessionSummary(): string {
    const session = this.currentSession();
    if (!session)
      return 'No active co-write session. Start one with /cowrite [topic]';
    const acceptedUser = session.turns.filter(
      (t) => t.role === 'user' && t.accepted
    ).length;
    const acceptedSmuve = session.turns.filter(
      (t) => t.role === 'smuve' && t.accepted
    ).length;
    const currentSection = session.currentSection || 'verse';
    return `✍️ S.M.U.V.E CO-WRITE SESSION\n${'═'.repeat(50)}\nTitle: ${session.title}\nTopic: ${session.topic}\nStyle: ${session.style} | Mood: ${session.mood}\nKey: ${session.key} | BPM: ${session.bpm}\n${session.artist ? `Influenced by: ${session.artist}` : ''}\n\nPROGRESS: Section ${session.sectionIndex + 1}/${session.sectionOrder.length}\nCurrent: ${currentSection.toUpperCase()}\n\nCONTRIBUTIONS:\n  • You: ${this.userContributionCount()} lines (${acceptedUser} accepted)\n  • S.M.U.V.E: ${this.smuveContributionCount()} lines (${acceptedSmuve} accepted)\n  • Total turns: ${session.turns.length}\n\n${session.isComplete ? 'STATUS: COMPLETE 🎉' : session.isActive ? 'STATUS: Active (use /cowrite add \\"your line\\")' : 'STATUS: Ended'}\n\nCompiled lyrics available with /cowrite lyrics`;
  }

  private generateSmuveLine(
    context: string,
    sectionType: LyricSection['type'],
    session: CoWriteSession,
    activeArtist?: string | null
  ): string {
    const profile = activeArtist
      ? this.styleMimic.getStyleProfile(activeArtist)
      : session.artist
        ? this.styleMimic.getStyleProfile(session.artist)
        : null;
    const topic = session.topic;
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
    const base =
      sectionTemplates[Math.floor(Math.random() * sectionTemplates.length)];
    if (profile) {
      const techniques = profile.vocalCharacteristics.technique
        .slice(0, 2)
        .join(', ');
      return `${base}\n  (Influence: ${profile.artistName} — ${techniques})`;
    }
    return base;
  }

  private generateHookSuggestion(topic: string): string {
    const hooks = [
      `"${topic}" — make it the title, repeat it 3x in the chorus`,
      `Try rhyming "${topic}" with a word that contrasts its meaning`,
      `Start the hook with a question about ${topic}`,
      `Use ${topic} as a metaphor for something bigger`,
    ];
    return hooks[Math.floor(Math.random() * hooks.length)];
  }
  private generateLineSuggestion(
    context: string,
    sectionType: string,
    session: CoWriteSession | null
  ): string {
    return `Try contrasting "${context}" with an opposite image — if you said light, bring in shadow. If you said love, bring in loss.`;
  }
  private generateBlendedFeedback(
    line: string,
    sectionType: LyricSection['type'],
    session: CoWriteSession,
    artist: string
  ): string {
    const feedbacks = [
      `That line has ${artist}'s energy — I hate that I like it.`,
      `${artist} would approve. I don't, but they would.`,
      `Interesting how ${artist}'s influence is bleeding through. Not bad. Not good. Just... interesting.`,
      `I've cross-referenced that against ${artist}'s catalog. It holds up. Barely.`,
    ];
    return feedbacks[Math.floor(Math.random() * feedbacks.length)];
  }
  private generateFeedback(
    line: string,
    sectionType: LyricSection['type'],
    session: CoWriteSession
  ): string {
    const syllableCount = this.countSyllables(line);
    const feedbacks = [
      syllableCount > 12
        ? "That line is a bit wordy — I'd trim it. But it's your funeral."
        : syllableCount < 6
          ? "Short and effective. I'm almost impressed. Almost."
          : 'Decent syllable flow. Consider me mildly satisfied.',
      `The ${sectionType} needs more tension. Add a twist in the next line.`,
      "That's acceptable. Don't expect praise — you haven't earned it yet.",
      "Interesting choice. I'd have gone darker, but you do you.",
    ];
    return feedbacks[Math.floor(Math.random() * feedbacks.length)];
  }
  private generateTransitionFeedback(
    sectionType: LyricSection['type'],
    session: CoWriteSession
  ): string {
    const feedbacks: Record<string, string> = {
      verse:
        "Good enough. Let's move to the next section before I lose interest.",
      chorus: "The hook should be stronger, but I'll let it slide. For now.",
      bridge: "The bridge is where songs go to die — or ascend. Let's ascend.",
      'pre-chorus': "Building tension. Don't waste it in the chorus.",
      intro: 'Set the tone. Dark. Atmospheric. Make them feel uncomfortable.',
      outro: 'End it with impact. No fade-outs. Those are for cowards.',
    };
    return (
      feedbacks[sectionType] || 'Section complete. Moving on. Try to keep up.'
    );
  }
  private getSectionOrder(genre: string): LyricSection['type'][] {
    const lower = genre.toLowerCase();
    if (
      lower.includes('hip hop') ||
      lower.includes('trap') ||
      lower.includes('rap')
    )
      return ['intro', 'verse', 'chorus', 'verse', 'chorus', 'verse', 'outro'];
    if (lower.includes('electronic') || lower.includes('house'))
      return [
        'intro',
        'verse',
        'pre-chorus',
        'chorus',
        'verse',
        'pre-chorus',
        'chorus',
        'outro',
      ];
    if (lower.includes('r&b') || lower.includes('soul'))
      return [
        'verse',
        'pre-chorus',
        'chorus',
        'verse',
        'chorus',
        'bridge',
        'chorus',
      ];
    return [
      'verse',
      'pre-chorus',
      'chorus',
      'verse',
      'chorus',
      'bridge',
      'chorus',
    ];
  }
  private pickBpm(genre: string): number {
    const bpms: Record<string, number> = {
      pop: 110,
      'hip hop': 90,
      'r&b': 85,
      rock: 120,
      electronic: 128,
      jazz: 100,
      soul: 80,
      trap: 75,
      country: 100,
      folk: 90,
      metal: 140,
      latin: 105,
    };
    return bpms[genre.toLowerCase()] || 100;
  }
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
    this.currentSession.update((s) =>
      s ? { ...s, turns: [...s.turns, turn], lastActivityAt: Date.now() } : s
    );
  }
}
