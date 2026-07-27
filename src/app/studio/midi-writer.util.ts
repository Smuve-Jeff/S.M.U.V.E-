/**
 * Standard MIDI File (.mid) Writer — Format 1 (Multiple Synchronous Tracks)
 *
 * Generates proper binary SMF data consumable by any DAW, sampler, or media player.
 * - Track 0: Conductor track (tempo, time signature, sequence name)
 * - Track 1+: Note tracks (one per music manager track)
 * - Metrical timing (ticks per quarter note = 480)
 *
 * Usage:
 *   const midiBytes = MidiWriter.toArrayBuffer(tracks, bpm);
 *   const blob = new Blob([midiBytes], { type: 'audio/midi' });
 *   downloadBlob(blob, 'project.mid');
 */

export interface MidiNoteEvent {
  /** MIDI note number 0–127 (60 = Middle C) */
  note: number;
  /** Velocity 0–127 */
  velocity: number;
  /** Start time in ticks from track start */
  startTick: number;
  /** Duration in ticks */
  durationTicks: number;
  /** MIDI channel 0–15 */
  channel?: number;
}

export interface MidiTrackData {
  /** Track name (meta event FF 03) */
  name: string;
  /** Note events sorted by startTick ascending */
  notes: MidiNoteEvent[];
  /** MIDI program number 0–127 (optional, sets instrument) */
  program?: number;
}

/** Default ticks-per-quarter-note resolution */
const TICKS_PER_BEAT = 480;

// ─── Variable-Length Quantity (VLQ) ──────────────────────────

function writeVLQ(value: number): number[] {
  const bytes: number[] = [];
  bytes.push(value & 0x7f);
  while ((value >>= 7) > 0) {
    bytes.unshift((value & 0x7f) | 0x80);
  }
  return bytes;
}

function writeVLQToArray(arr: number[], value: number): void {
  arr.push(...writeVLQ(value));
}

// ─── MIDI Event Builders ─────────────────────────────────────

/** Note On: status 0x90 + channel */
function noteOn(channel: number, note: number, velocity: number): number[] {
  return [0x90 | (channel & 0x0f), note & 0x7f, velocity & 0x7f];
}

/** Note Off: status 0x80 + channel */
function noteOff(
  channel: number,
  note: number,
  velocity: number = 64
): number[] {
  return [0x80 | (channel & 0x0f), note & 0x7f, velocity & 0x7f];
}

/** Program Change: status 0xC0 + channel */
function programChange(channel: number, program: number): number[] {
  return [0xc0 | (channel & 0x0f), program & 0x7f];
}

/** Controller Change: status 0xB0 + channel */
function controllerChange(
  channel: number,
  controller: number,
  value: number
): number[] {
  return [0xb0 | (channel & 0x0f), controller & 0x7f, value & 0x7f];
}

// ─── Meta Event Builders ─────────────────────────────────────

function metaSequenceName(name: string): number[] {
  const textBytes = [...new TextEncoder().encode(name)];
  const bytes: number[] = [0xff, 0x03];
  writeVLQToArray(bytes, textBytes.length);
  bytes.push(...textBytes);
  return bytes;
}

function metaTrackName(name: string): number[] {
  const textBytes = [...new TextEncoder().encode(name)];
  const bytes: number[] = [0xff, 0x03];
  writeVLQToArray(bytes, textBytes.length);
  bytes.push(...textBytes);
  return bytes;
}

function metaInstrumentName(name: string): number[] {
  const textBytes = [...new TextEncoder().encode(name)];
  const bytes: number[] = [0xff, 0x04];
  writeVLQToArray(bytes, textBytes.length);
  bytes.push(...textBytes);
  return bytes;
}

function metaTempo(bpm: number): number[] {
  const micros = Math.floor(60_000_000 / Math.max(1, bpm));
  return [
    0xff,
    0x51,
    0x03,
    (micros >> 16) & 0xff,
    (micros >> 8) & 0xff,
    micros & 0xff,
  ];
}

function metaTimeSignature(
  numerator: number,
  denominatorPowerOf2: number = 2
): number[] {
  // denominatorPowerOf2: 2 = quarter note (since 2^2=4)
  return [
    0xff,
    0x58,
    0x04,
    numerator & 0xff,
    denominatorPowerOf2 & 0xff,
    24, // MIDI clocks per metronome click
    8, // 32nd notes per quarter note
  ];
}

function metaEndOfTrack(): number[] {
  return [0xff, 0x2f, 0x00];
}

// ─── Track Builder ───────────────────────────────────────────

/**
 * Build a single track chunk's raw event bytes (including delta-times).
 * Does NOT include the MTrk header or length prefix.
 */
function buildTrackEvents(
  name: string,
  notes: MidiNoteEvent[],
  channel: number,
  program?: number
): number[] {
  const events: number[] = [];

  // Delta 0 + track name meta
  writeVLQToArray(events, 0);
  events.push(...metaTrackName(name));

  // Delta 0 + instrument name if program set
  if (program !== undefined) {
    writeVLQToArray(events, 0);
    events.push(...metaInstrumentName(name));
    // Program Change
    writeVLQToArray(events, 0);
    events.push(...programChange(channel, program));
  }

  // Sort notes by startTick ascending
  const sorted = [...notes].sort((a, b) => a.startTick - b.startTick);

  // We need to emit note-on and note-off events in chronological order.
  // Build a timeline of events.
  interface TimedEvent {
    tick: number;
    type: 'on' | 'off';
    note: number;
    velocity: number;
  }

  const timeline: TimedEvent[] = [];

  for (const n of sorted) {
    if (n.velocity > 0) {
      timeline.push({
        tick: n.startTick,
        type: 'on',
        note: n.note,
        velocity: n.velocity,
      });
    }
    const endTick = n.startTick + Math.max(1, n.durationTicks);
    timeline.push({ tick: endTick, type: 'off', note: n.note, velocity: 64 });
  }

  // Sort by tick, then off before on at same tick
  timeline.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    // off before on at same tick
    if (a.type !== b.type) return a.type === 'off' ? -1 : 1;
    return 0;
  });

  // Write events using delta-time encoding
  let lastTick = 0;
  for (const evt of timeline) {
    const delta = evt.tick - lastTick;
    writeVLQToArray(events, delta);
    if (evt.type === 'on') {
      events.push(...noteOn(channel, evt.note, evt.velocity));
    } else {
      events.push(...noteOff(channel, evt.note, 64));
    }
    lastTick = evt.tick;
  }

  // End of track
  writeVLQToArray(events, 0);
  events.push(...metaEndOfTrack());

  return events;
}

/**
 * Build the conductor track (Track 0) with tempo, time signature, sequence name.
 */
function buildConductorTrackEvents(
  sequenceName: string,
  bpm: number
): number[] {
  const events: number[] = [];

  // Delta 0 + sequence name
  writeVLQToArray(events, 0);
  events.push(...metaSequenceName(sequenceName));

  // Delta 0 + tempo
  writeVLQToArray(events, 0);
  events.push(...metaTempo(bpm));

  // Delta 0 + time signature (4/4)
  writeVLQToArray(events, 0);
  events.push(...metaTimeSignature(4, 2));

  // End of track
  writeVLQToArray(events, 0);
  events.push(...metaEndOfTrack());

  return events;
}

// ─── Public API ──────────────────────────────────────────────

export class MidiWriter {
  /**
   * Generate a complete Format 1 MIDI file as an ArrayBuffer.
   *
   * @param tracks   Array of track data (name + notes). Each track gets its own MIDI channel.
   * @param bpm      Tempo in beats per minute (default 120).
   * @param sequenceName  Optional sequence/project name for the conductor track.
   * @returns        ArrayBuffer containing the complete .mid file.
   */
  static toArrayBuffer(
    tracks: MidiTrackData[],
    bpm: number = 120,
    sequenceName: string = 'S.M.U.V.E Project'
  ): ArrayBuffer {
    const numTracks = tracks.length + 1; // +1 for conductor track
    const format = 1;

    // Build conductor track (Track 0)
    const condEvents = buildConductorTrackEvents(sequenceName, bpm);
    const condTrack = buildTrackChunkBytes(condEvents);

    // Build instrument tracks (Track 1+)
    const trackChunks: Uint8Array[] = [condTrack];
    tracks.forEach((track, idx) => {
      const channel = idx % 16; // wrap around if > 15 tracks
      const evts = buildTrackEvents(
        track.name,
        track.notes,
        channel,
        track.program
      );
      trackChunks.push(buildTrackChunkBytes(evts));
    });

    // Build header
    const header = buildHeaderBytes(format, numTracks, TICKS_PER_BEAT);

    // Concatenate everything
    const totalLength =
      header.length + trackChunks.reduce((s, c) => s + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    result.set(header, offset);
    offset += header.length;
    for (const chunk of trackChunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result.buffer as ArrayBuffer;
  }

  /**
   * Convert ticks-per-beat to actual time in seconds for a given BPM.
   */
  static tickToSeconds(
    tick: number,
    bpm: number,
    ticksPerBeat: number = TICKS_PER_BEAT
  ): number {
    const beatsPerSecond = bpm / 60;
    const ticksPerSecond = beatsPerSecond * ticksPerBeat;
    return tick / ticksPerSecond;
  }
}

// ─── Binary builders ─────────────────────────────────────────

function buildHeaderBytes(
  format: number,
  numTracks: number,
  division: number
): Uint8Array {
  const buf = new ArrayBuffer(14);
  const view = new DataView(buf);
  view.setUint32(0, 0x4d546864); // "MThd"
  view.setUint32(4, 6); // Header length = 6
  view.setUint16(8, format); // Format (0 or 1)
  view.setUint16(10, numTracks); // Number of tracks
  view.setUint16(12, division); // Ticks per quarter note
  return new Uint8Array(buf);
}

function buildTrackChunkBytes(eventBytes: number[]): Uint8Array {
  const buf = new ArrayBuffer(8 + eventBytes.length);
  const view = new DataView(buf);
  view.setUint32(0, 0x4d54726b); // "MTrk"
  view.setUint32(4, eventBytes.length);
  const result = new Uint8Array(buf);
  result.set(eventBytes, 8);
  return result;
}
