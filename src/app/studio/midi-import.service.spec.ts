import { TestBed } from '@angular/core/testing';
import { MusicManagerService } from '../services/music-manager.service';
import { LoggingService } from '../services/logging.service';
import { MidiImportService } from './midi-import.service';
import { parseMidiFile } from './midi-reader.util';
import { MidiWriter } from './midi-writer.util';

describe('MidiImportService', () => {
  let svc: MidiImportService;
  let tracks: Array<{ id: string; name: string; notes: any[] }>;
  let addTrack: jest.Mock;
  let replaceTrackNotes: jest.Mock;
  const tempoSet = jest.fn();

  const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  beforeEach(() => {
    tracks = [];
    tempoSet.mockClear();
    addTrack = jest.fn((name: string) => {
      const id = `t${tracks.length + 1}`;
      tracks.push({ id, name, notes: [] });
      return id;
    });
    replaceTrackNotes = jest.fn((id: string, notes: any[]) => {
      const track = tracks.find((t) => t.id === id);
      if (track) track.notes = notes;
    });
    const mockMusicManager = {
      tracks: () => tracks,
      addTrack,
      replaceTrackNotes,
      engine: { tempo: { set: tempoSet } },
    };
    TestBed.configureTestingModule({
      providers: [
        MidiImportService,
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: LoggingService, useValue: mockLogger },
      ],
    });
    svc = TestBed.inject(MidiImportService);
  });

  const parsedWith = (overrides: Record<string, unknown> = {}) => ({
    format: 1,
    ticksPerBeat: 480,
    tracks: [],
    ...overrides,
  });

  it('maps ticks onto the 16th-note step grid and normalizes velocity', () => {
    const summary = svc.importParsed(
      parsedWith({
        tracks: [
          {
            name: 'Lead',
            notes: [
              { note: 60, velocity: 127, startTick: 480, durationTicks: 240, channel: 0 },
              { note: 400, velocity: 0, startTick: -5, durationTicks: 0, channel: 0 },
            ],
          },
        ],
      }) as any,
    );

    expect(summary).toEqual({ trackCount: 1, noteCount: 2, skippedTracks: 0 });
    expect(tracks[0].name).toBe('Lead');
    expect(tracks[0].notes[0]).toEqual({
      id: expect.any(String),
      midi: 60,
      step: 4,
      length: 2,
      velocity: 1,
    });
    // Out-of-range note/velocity/step are clamped to legal values.
    expect(tracks[0].notes[1]).toEqual({
      id: expect.any(String),
      midi: 127,
      step: 0,
      length: 0.0625,
      velocity: 0.008,
    });
  });

  it('applies a plausible file tempo and ignores out-of-range ones', () => {
    svc.importParsed(
      parsedWith({ tempoBpm: 128, tracks: [{ name: 'A', notes: [{ note: 60, velocity: 100, startTick: 0, durationTicks: 480 }] }] }) as any,
    );
    expect(tempoSet).toHaveBeenCalledWith(128);

    tempoSet.mockClear();
    svc.importParsed(
      parsedWith({ tempoBpm: 900, tracks: [{ name: 'B', notes: [{ note: 60, velocity: 100, startTick: 0, durationTicks: 480 }] }] }) as any,
    );
    expect(tempoSet).not.toHaveBeenCalled();
  });

  it('skips empty tracks and de-duplicates track names', () => {
    const summary = svc.importParsed(
      parsedWith({
        tracks: [
          { name: 'Piano', notes: [] },
          { name: 'Piano', notes: [{ note: 60, velocity: 90, startTick: 0, durationTicks: 120 }] },
          { name: '  ', notes: [{ note: 62, velocity: 90, startTick: 0, durationTicks: 120 }] },
        ],
      }) as any,
    );
    expect(summary.trackCount).toBe(2);
    expect(summary.skippedTracks).toBe(1);
    expect(tracks.map((t) => t.name)).toEqual(['Piano', 'MIDI Track']);
  });

  it('caps the imported track count at 32', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      name: `T${i}`,
      notes: [{ note: 60, velocity: 100, startTick: 0, durationTicks: 120 }],
    }));
    const summary = svc.importParsed(parsedWith({ tracks: many }) as any);
    expect(summary.trackCount).toBe(32);
    expect(summary.skippedTracks).toBe(8);
    expect(tracks).toHaveLength(32);
  });

  it('caps the total imported note count at 20,000', () => {
    const bigNotes = Array.from({ length: 19_999 }, () => ({
      note: 60,
      velocity: 100,
      startTick: 0,
      durationTicks: 120,
    }));
    const tailNotes = Array.from({ length: 5 }, () => ({
      note: 64,
      velocity: 100,
      startTick: 0,
      durationTicks: 120,
    }));
    const summary = svc.importParsed(
      parsedWith({
        tracks: [
          { name: 'Big', notes: bigNotes },
          { name: 'Tail', notes: tailNotes },
        ],
      }) as any,
    );
    expect(summary.noteCount).toBe(20_000);
    expect(tracks[1].notes).toHaveLength(1);
  });

  it('imports a MidiWriter round-trip end to end', () => {
    const bytes = MidiWriter.toArrayBuffer(
      [
        {
          name: 'Keys',
          notes: [
            { note: 57, velocity: 96, startTick: 0, durationTicks: 480 },
            { note: 60, velocity: 96, startTick: 480, durationTicks: 480 },
          ],
        },
      ],
      110,
      'Round Trip',
    );
    const summary = svc.importParsed(parseMidiFile(bytes));
    expect(summary.trackCount).toBe(1);
    expect(summary.noteCount).toBe(2);
    const keys = tracks.find((t) => t.name === 'Keys');
    expect(keys?.notes.map((n) => ({ step: n.step, midi: n.midi }))).toEqual([
      { step: 0, midi: 57 },
      { step: 4, midi: 60 },
    ]);
  });
});
