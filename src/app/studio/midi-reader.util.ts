/**
 * Standard MIDI File (.mid) reader — Format 0 and Format 1.
 *
 * The counterpart to `midi-writer.util.ts`: parses any SMF produced by a DAW,
 * phone app, or hardware sequencer into plain note spans the Studio can load.
 *
 * Supported events:
 *   • Note on / note off (including running status and velocity-0 note offs)
 *   • Program change (per track)
 *   • Tempo meta (0x51), track name meta (0x03), end-of-track (0x2F)
 *   • Sysex / escape chunks are skipped by their VLQ length
 *
 * Deliberately strict: malformed or truncated data throws `MidiParseError`
 * with a human-readable reason so the import path can skip the file instead
 * of creating ghost notes.
 */

export interface ParsedMidiNote {
  /** MIDI note number 0–127 (60 = middle C). */
  note: number;
  /** Velocity 1–127 (normalized by the import service). */
  velocity: number;
  /** Start time in ticks from the start of the track. */
  startTick: number;
  /** Duration in ticks (always >= 1). */
  durationTicks: number;
  /** MIDI channel 0–15. */
  channel: number;
}

export interface ParsedMidiTrack {
  name: string;
  /** First program change seen on the track, 0–127. */
  program?: number;
  notes: ParsedMidiNote[];
}

export interface ParsedMidiFile {
  format: number;
  /** Ticks per quarter note (the only metrical division supported). */
  ticksPerBeat: number;
  tracks: ParsedMidiTrack[];
  /** First tempo meta event, in BPM. */
  tempoBpm?: number;
}

export class MidiParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MidiParseError';
  }
}

/** Convert a MIDI tick delta to the Studio's 16th-note step grid. */
export function midiTicksToSteps(ticks: number, ticksPerBeat: number): number {
  if (!Number.isFinite(ticks) || !Number.isFinite(ticksPerBeat) || ticksPerBeat <= 0) {
    return 0;
  }
  return (ticks * 4) / ticksPerBeat;
}

interface TrackContext {
  /** `${channel}:${note}` → open note-on bookkeeping. */
  active: Map<string, { startTick: number; velocity: number }>;
  notes: ParsedMidiNote[];
  name: string;
  program?: number;
}

export function parseMidiFile(data: ArrayBuffer | Uint8Array): ParsedMidiFile {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < 14) {
    throw new MidiParseError('File is too small to be a MIDI file.');
  }

  let pos = 0;
  const ensure = (count: number, what: string) => {
    if (pos + count > bytes.length) {
      throw new MidiParseError(`Unexpected end of file while reading ${what}.`);
    }
  };
  const u8 = () => {
    ensure(1, 'a byte');
    return bytes[pos++];
  };
  const u16 = () => {
    ensure(2, 'a 16-bit value');
    const value = (bytes[pos] << 8) | bytes[pos + 1];
    pos += 2;
    return value;
  };
  const u32 = () => {
    ensure(4, 'a 32-bit value');
    const value =
      ((bytes[pos] << 24) |
        (bytes[pos + 1] << 16) |
        (bytes[pos + 2] << 8) |
        bytes[pos + 3]) >>>
      0;
    pos += 4;
    return value;
  };
  const ascii = (count: number) => {
    ensure(count, 'a chunk id');
    let out = '';
    for (let i = 0; i < count; i++) out += String.fromCharCode(bytes[pos + i]);
    pos += count;
    return out;
  };
  const vlq = () => {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const byte = u8();
      value = (value << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    throw new MidiParseError('Invalid variable-length quantity (too long).');
  };

  // ── Header chunk ────────────────────────────────────────────────
  const headerId = ascii(4);
  if (headerId !== 'MThd') {
    throw new MidiParseError('Missing MThd header — not a Standard MIDI File.');
  }
  const headerLength = u32();
  if (headerLength < 6) {
    throw new MidiParseError('Malformed MThd header (length < 6).');
  }
  const format = u16();
  const declaredTracks = u16();
  const division = u16();
  if (division & 0x8000) {
    throw new MidiParseError('SMPTE time division is not supported yet.');
  }
  if (division <= 0) {
    throw new MidiParseError('Invalid ticks-per-beat division.');
  }
  // Skip any extra header bytes (spec allows larger MThd payloads).
  pos += headerLength - 6;
  ensure(0, 'the MThd payload');

  const tracks: ParsedMidiTrack[] = [];
  let tempoBpm: number | undefined;

  // ── Track chunks ────────────────────────────────────────────────
  for (let index = 0; index < declaredTracks; index++) {
    if (pos >= bytes.length) break; // Some tools under-declare the track count.
    const chunkId = ascii(4);
    const chunkLength = u32();
    ensure(chunkLength, `track ${index + 1} data`);
    const chunkStart = pos;
    const chunkEnd = pos + chunkLength;

    if (chunkId !== 'MTrk') {
      pos = chunkEnd; // Unknown chunk type — skip it.
      continue;
    }

    const ctx: TrackContext = { active: new Map(), notes: [], name: '' };
    let tick = 0;
    let runningStatus = 0;

    while (pos < chunkEnd) {
      tick += vlq();
      if (pos > chunkEnd) {
        throw new MidiParseError('Track data is truncated mid-event.');
      }
      if (pos >= chunkEnd) break;

      let status = bytes[pos];
      if (status < 0x80) {
        if (runningStatus === 0) {
          throw new MidiParseError('Running status used before any status byte.');
        }
        status = runningStatus;
      } else {
        pos++;
        if (status < 0xf0) runningStatus = status;
        else runningStatus = 0;
      }

      if (status === 0xff) {
        const type = u8();
        const length = vlq();
        const payloadStart = pos;
        ensure(length, 'a meta event payload');
        if (type === 0x51 && length >= 3 && tempoBpm === undefined) {
          const micros =
            (bytes[payloadStart] << 16) |
            (bytes[payloadStart + 1] << 8) |
            bytes[payloadStart + 2];
          if (micros > 0) tempoBpm = Math.round((60_000_000 / micros) * 1000) / 1000;
        } else if (type === 0x03 && length > 0 && !ctx.name) {
          ctx.name = new TextDecoder()
            .decode(bytes.subarray(payloadStart, payloadStart + length))
            .replace(/\0/g, '')
            .trim()
            .slice(0, 64);
        } else if (type === 0x2f) {
          pos = payloadStart + length;
          break; // End of track.
        }
        pos = payloadStart + length;
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        const length = vlq();
        ensure(length, 'a sysex payload');
        pos += length;
        continue;
      }

      const kind = status & 0xf0;
      const channel = status & 0x0f;
      const data1 = u8();
      const data2 = kind === 0xc0 || kind === 0xd0 ? 0 : u8();

      switch (kind) {
        case 0x90: {
          if (data2 === 0) {
            closeNote(ctx, channel, data1, tick);
          } else {
            const key = `${channel}:${data1}`;
            // A second note-on for the same pitch implicitly ends the first.
            if (ctx.active.has(key)) closeNote(ctx, channel, data1, tick);
            ctx.active.set(key, { startTick: tick, velocity: data2 });
          }
          break;
        }
        case 0x80:
          closeNote(ctx, channel, data1, tick);
          break;
        case 0xc0:
          if (ctx.program === undefined) ctx.program = data1;
          break;
        default:
          break; // Aftertouch, CC, pitch bend — not mapped to notes yet.
      }
    }

    // Voices left hanging when the track ends without note-offs.
    for (const [key, note] of Array.from(ctx.active.entries())) {
      const [channelPart, notePart] = key.split(':');
      ctx.notes.push({
        note: Number(notePart),
        velocity: note.velocity,
        startTick: note.startTick,
        durationTicks: Math.max(1, tick - note.startTick),
        channel: Number(channelPart),
      });
    }

    ctx.notes.sort((a, b) => a.startTick - b.startTick || a.note - b.note);
    tracks.push({
      name: ctx.name || `MIDI Track ${tracks.length + 1}`,
      program: ctx.program,
      notes: ctx.notes,
    });
    pos = chunkEnd;
  }

  return { format, ticksPerBeat: division, tracks, tempoBpm };
}

function closeNote(
  ctx: TrackContext,
  channel: number,
  note: number,
  tick: number,
): void {
  const key = `${channel}:${note}`;
  const open = ctx.active.get(key);
  if (!open) return;
  ctx.active.delete(key);
  ctx.notes.push({
    note,
    velocity: open.velocity,
    startTick: open.startTick,
    durationTicks: Math.max(1, tick - open.startTick),
    channel,
  });
}
