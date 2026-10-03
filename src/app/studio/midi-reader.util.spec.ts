import { MidiWriter } from './midi-writer.util';
import {
  MidiParseError,
  midiTicksToSteps,
  parseMidiFile,
} from './midi-reader.util';

/** VLQ bytes for test data. */
function vlq(value: number): number[] {
  const bytes = [value & 0x7f];
  let rest = value >> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  return bytes;
}

function chunk(id: string, data: number[]): number[] {
  const bytes = [...id].map((c) => c.charCodeAt(0));
  bytes.push(
    (data.length >> 24) & 0xff,
    (data.length >> 16) & 0xff,
    (data.length >> 8) & 0xff,
    data.length & 0xff,
  );
  return [...bytes, ...data];
}

function header(format: number, ntrks: number, division: number): number[] {
  return chunk('MThd', [
    0,
    format,
    0,
    ntrks,
    (division >> 8) & 0xff,
    division & 0xff,
  ]);
}

function toBytes(parts: number[][]): Uint8Array {
  return new Uint8Array(parts.flat());
}

describe('midi-reader.util', () => {
  it('round-trips a MidiWriter export (format 1, tempo, names, notes)', () => {
    // The writer already produces a complete file; parse it directly.
    const parsed = parseMidiFile(
      MidiWriter.toArrayBuffer(
        [
          {
            name: 'Lead',
            notes: [
              { note: 60, velocity: 100, startTick: 0, durationTicks: 480 },
              { note: 64, velocity: 80, startTick: 480, durationTicks: 240 },
            ],
          },
          {
            name: 'Bass',
            program: 38,
            notes: [{ note: 36, velocity: 120, startTick: 0, durationTicks: 960 }],
          },
        ],
        128,
        'QA Set',
      ),
    );

    expect(parsed.format).toBe(1);
    expect(parsed.ticksPerBeat).toBe(480);
    expect(parsed.tempoBpm).toBe(128);

    const lead = parsed.tracks.find((t) => t.name === 'Lead');
    expect(lead).toBeDefined();
    expect(lead!.notes).toEqual([
      expect.objectContaining({
        note: 60,
        velocity: 100,
        startTick: 0,
        durationTicks: 480,
      }),
      expect.objectContaining({
        note: 64,
        velocity: 80,
        startTick: 480,
        durationTicks: 240,
      }),
    ]);

    const bass = parsed.tracks.find((t) => t.name === 'Bass');
    expect(bass?.program).toBe(38);
    expect(bass?.notes[0]).toEqual(
      expect.objectContaining({ note: 36, durationTicks: 960 }),
    );
  });

  it('treats velocity-0 note-on as note off', () => {
    const track = [
      ...vlq(0),
      0xff,
      0x03,
      0x04,
      0x52,
      0x69,
      0x66,
      0x66, // name "Riff"
      ...vlq(0),
      0x90,
      60,
      100,
      ...vlq(960),
      0x90,
      60,
      0,
      ...vlq(0),
      0xff,
      0x2f,
      0x00,
    ];
    const parsed = parseMidiFile(toBytes([header(0, 1, 480), chunk('MTrk', track)]));
    expect(parsed.tracks[0].name).toBe('Riff');
    expect(parsed.tracks[0].notes).toHaveLength(1);
    expect(parsed.tracks[0].notes[0]).toEqual(
      expect.objectContaining({ note: 60, durationTicks: 960, velocity: 100 }),
    );
  });

  it('supports running status across consecutive note events', () => {
    const track = [
      ...vlq(0),
      0x90,
      60,
      100, // note on 60
      ...vlq(480),
      62,
      90, // running status → note on 62
      ...vlq(480),
      60,
      0, // running status → note on 60 vel 0 (note off)
      ...vlq(0),
      0xff,
      0x2f,
      0x00,
    ];
    const parsed = parseMidiFile(toBytes([header(0, 1, 480), chunk('MTrk', track)]));
    expect(parsed.tracks[0].notes).toHaveLength(2);
    expect(parsed.tracks[0].notes.map((n) => n.note)).toEqual([60, 62]);
    expect(parsed.tracks[0].notes[0].durationTicks).toBe(960);
  });

  it('closes hanging voices at end-of-track instead of dropping them', () => {
    const track = [
      ...vlq(0),
      0x90,
      72,
      100, // note on, never released
      ...vlq(960),
      0xff,
      0x2f,
      0x00,
    ];
    const parsed = parseMidiFile(toBytes([header(0, 1, 480), chunk('MTrk', track)]));
    expect(parsed.tracks[0].notes[0]).toEqual(
      expect.objectContaining({ note: 72, durationTicks: 960 }),
    );
  });

  it('skips unknown chunks and sysex data', () => {
    const sysexTrack = [
      ...vlq(0),
      0xf0,
      ...vlq(4),
      1,
      2,
      3,
      4, // sysex payload
      ...vlq(0),
      0x90,
      65,
      120,
      ...vlq(480),
      0x80,
      65,
      64,
      ...vlq(0),
      0xff,
      0x2f,
      0x00,
    ];
    const parsed = parseMidiFile(
      toBytes([
        header(1, 2, 480),
        chunk('JUNK', [1, 2, 3]),
        chunk('MTrk', sysexTrack),
      ]),
    );
    expect(parsed.tracks).toHaveLength(1);
    expect(parsed.tracks[0].notes).toHaveLength(1);
  });

  it('rejects malformed and unsupported files with clear errors', () => {
    expect(() => parseMidiFile(new Uint8Array([1, 2, 3]))).toThrow(MidiParseError);
    expect(() =>
      parseMidiFile(toBytes([[...'XXXX'].map((c) => c.charCodeAt(0)), 0, 0, 0, 6, 0, 1, 0, 1, 1, 0x80]])),
    ).toThrow(/MThd/);
    expect(() =>
      parseMidiFile(toBytes([header(0, 1, 0x8000)])),
    ).toThrow(/SMPTE/);
    // Truncated track payload.
    const truncated = chunk('MTrk', [
      ...vlq(0),
      0x90,
      60,
      100,
      ...vlq(480),
      0x90,
      60,
    ]);
    expect(() => parseMidiFile(toBytes([header(0, 1, 480), truncated]))).toThrow(
      MidiParseError,
    );
  });

  it('maps ticks to 16th-note steps', () => {
    expect(midiTicksToSteps(480, 480)).toBe(4);
    expect(midiTicksToSteps(120, 480)).toBe(1);
    expect(midiTicksToSteps(240, 960)).toBe(1);
    expect(midiTicksToSteps(100, 0)).toBe(0);
  });
});
