import { Injectable, inject } from '@angular/core';
import {
  MusicManagerService,
  type TrackNote,
} from '../services/music-manager.service';
import { LoggingService } from '../services/logging.service';
import {
  midiTicksToSteps,
  parseMidiFile,
  type ParsedMidiFile,
} from './midi-reader.util';

export interface MidiImportSummary {
  trackCount: number;
  noteCount: number;
  skippedTracks: number;
  /** Tempo applied to the project (omitted when the file carried none). */
  tempoBpm?: number;
}

/** Result of merging a MIDI file into the track the piano roll is editing. */
export interface MidiClipImportSummary {
  trackCount: number;
  noteCount: number;
  skippedNotes: number;
  /** Ids of the notes added to the destination track, in file order. */
  noteIds: string[];
  /** Last occupied step after the merge, for growing the visible grid. */
  lastStep: number;
}

/** Guardrails so a malformed 200 MB file cannot lock the tab. */
const MAX_IMPORT_TRACKS = 32;
const MAX_IMPORT_NOTES = 20_000;
const MIN_NOTE_LENGTH_STEPS = 0.0625;
const DEFAULT_INSTRUMENT = 'grand-piano';

/**
 * Imports Standard MIDI Files into the Studio: parses the file and materializes
 * one MusicManager track per non-empty MIDI track, mapping ticks onto the
 * 16th-note step grid used by the piano roll and arrangement.
 */
@Injectable({ providedIn: 'root' })
export class MidiImportService {
  private readonly musicManager = inject(MusicManagerService);
  private readonly logger = inject(LoggingService);

  /** Read + parse a picked `.mid` / `.midi` file. Throws MidiParseError. */
  async parseFile(file: File): Promise<ParsedMidiFile> {
    const buffer = await file.arrayBuffer();
    return parseMidiFile(buffer);
  }

  /** Read a picked file and merge its notes into one existing track. */
  async importFileToTrack(
    file: File,
    trackId: string,
    atStep: number
  ): Promise<MidiClipImportSummary> {
    return this.importParsedToTrack(await this.parseFile(file), trackId, atStep);
  }

  /**
   * Merge a parsed file's notes into the selected track at `atStep`, keeping
   * every note already there. Unlike `importParsed`, this does not create
   * tracks or change the project tempo: dropping a phrase into a clip should
   * affect that clip only. The whole merge is one history command.
   */
  importParsedToTrack(
    parsed: ParsedMidiFile,
    trackId: string,
    atStep: number
  ): MidiClipImportSummary {
    const track = this.musicManager.tracks().find((t) => t.id === trackId);
    const baseStep = Math.max(0, Math.round(atStep));
    const empty: MidiClipImportSummary = {
      trackCount: 0,
      noteCount: 0,
      skippedNotes: 0,
      noteIds: [],
      lastStep: baseStep,
    };
    if (!track) return empty;

    const stamp = Date.now().toString(36);
    const imported: TrackNote[] = [];
    let trackCount = 0;
    let skippedNotes = 0;

    for (const midiTrack of parsed.tracks) {
      if (midiTrack.notes.length === 0) continue;
      const remaining = MAX_IMPORT_NOTES - imported.length;
      if (remaining <= 0) {
        skippedNotes += midiTrack.notes.length;
        continue;
      }
      const usable = midiTrack.notes.slice(0, remaining);
      const noteBase = imported.length;
      usable.forEach((note, index) => {
        imported.push(
          parsedNoteToTrackNote(
            note,
            parsed.ticksPerBeat,
            `midi_clip_${stamp}_${noteBase + index}`,
            baseStep
          )
        );
      });
      skippedNotes += midiTrack.notes.length - usable.length;
      trackCount++;
    }

    if (imported.length === 0) return empty;

    this.musicManager.replaceTrackNotes(
      trackId,
      [...track.notes, ...imported],
      "Import MIDI to clip"
    );
    const lastStep = Math.max(
      ...imported.map((note) => note.step + Math.max(0.125, note.length))
    );
    const result: MidiClipImportSummary = {
      trackCount,
      noteCount: imported.length,
      skippedNotes,
      noteIds: imported.map((note) => note.id),
      lastStep,
    };
    this.logger.info(
      `MIDI clip import: ${result.noteCount} note(s) at step ${baseStep}`
    );
    return result;
  }

  /**
   * Create tracks + notes from a parsed file. Returns what was imported so the
   * caller can report it; never throws for empty tracks (they are skipped).
   */
  importParsed(parsed: ParsedMidiFile): MidiImportSummary {
    const summary: MidiImportSummary = {
      trackCount: 0,
      noteCount: 0,
      skippedTracks: 0,
    };
    const ticksPerBeat = parsed.ticksPerBeat;

    if (
      parsed.tempoBpm !== undefined &&
      Number.isFinite(parsed.tempoBpm) &&
      parsed.tempoBpm >= 20 &&
      parsed.tempoBpm <= 300
    ) {
      const tempo = this.musicManager.engine?.tempo;
      if (typeof tempo?.set === 'function') {
        tempo.set(Math.round(parsed.tempoBpm));
        summary.tempoBpm = Math.round(parsed.tempoBpm);
      }
    }

    for (const midiTrack of parsed.tracks) {
      if (summary.trackCount >= MAX_IMPORT_TRACKS) {
        summary.skippedTracks++;
        continue;
      }
      if (midiTrack.notes.length === 0) {
        summary.skippedTracks++;
        continue;
      }

      const remaining = MAX_IMPORT_NOTES - summary.noteCount;
      if (remaining <= 0) {
        summary.skippedTracks++;
        continue;
      }
      const usable = midiTrack.notes.slice(0, remaining);

      const notes: TrackNote[] = usable.map((note, index) =>
        parsedNoteToTrackNote(
          note,
          ticksPerBeat,
          `midi_${Date.now().toString(36)}_${summary.trackCount}_${index}`,
          0
        )
      );

      const trackId = this.musicManager.addTrack(
        uniqueName(midiTrack.name, this.musicManager.tracks().map((t) => t.name)),
        DEFAULT_INSTRUMENT,
        'midi',
      );
      if (!trackId) {
        this.logger.warn('MIDI import stopped at the device track limit.');
        break;
      }
      this.musicManager.replaceTrackNotes(trackId, notes, "Import MIDI");

      summary.trackCount++;
      summary.noteCount += notes.length;
      if (usable.length < midiTrack.notes.length) {
        this.logger.warn(
          `MIDI import: truncated ${midiTrack.name || 'track'} at the ${MAX_IMPORT_NOTES}-note cap`,
        );
      }
    }

    this.logger.info(
      `MIDI import: ${summary.trackCount} track(s), ${summary.noteCount} note(s)` +
        (summary.tempoBpm ? ` @ ${summary.tempoBpm} BPM` : ''),
    );
    return summary;
  }
}

function parsedNoteToTrackNote(
  note: { note: number; velocity: number; startTick: number; durationTicks: number },
  ticksPerBeat: number,
  id: string,
  stepOffset: number
): TrackNote {
  return {
    id,
    midi: clampInt(note.note, 0, 127),
    step: round4(
      Math.max(0, stepOffset + midiTicksToSteps(note.startTick, ticksPerBeat))
    ),
    length: round4(
      Math.max(
        MIN_NOTE_LENGTH_STEPS,
        midiTicksToSteps(note.durationTicks, ticksPerBeat)
      )
    ),
    velocity: round3(clamp(note.velocity, 1, 127) / 127),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Musical positions keep 4 decimals so 1/16-step fractions stay exact. */
function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function uniqueName(name: string, existing: string[]): string {
  const base = (name || 'MIDI Track').trim().slice(0, 48) || 'MIDI Track';
  if (!existing.includes(base)) return base;
  for (let suffix = 2; suffix < 100; suffix++) {
    const candidate = `${base} ${suffix}`;
    if (!existing.includes(candidate)) return candidate;
  }
  return `${base} ${Date.now().toString(36)}`;
}
