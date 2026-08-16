import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ChatMusicCommandEngineService } from './chat-music-command-engine.service';
import { MusicManagerService, TrackNote, TrackModel } from './music-manager.service';
import { AudioEngineService } from './audio-engine.service';
import { SpeechSynthesisService } from './speech-synthesis.service';

function makeTrack(
  id: string,
  name: string,
  instrumentId: string,
  type: 'midi' | 'drum',
  notes: TrackNote[] = []
): TrackModel {
  return {
    id,
    name,
    type,
    instrumentId,
    notes,
    muted: false,
    soloed: false,
    volume: 0.8,
    gain: 0.8,
    pan: 0,
    clips: [],
    steps: [],
    fxSlots: [],
    pluginIds: [],
    sendA: 0,
    sendB: 0,
    color: '#fff',
    synthParams: {},
    effects: [],
    patternSlots: [],
    activePatternSlotId: 'slot-0',
  } as unknown as TrackModel;
}

describe('ChatMusicCommandEngineService', () => {
  let service: ChatMusicCommandEngineService;
  let tracks: ReturnType<typeof signal<TrackModel[]>>;
  let addNoteToTrack: jest.Mock;
  let removeNotes: jest.Mock;
  let tempo: ReturnType<typeof signal<number>>;
  let playAudition: jest.Mock;
  let stopAudition: jest.Mock;
  let speak: jest.Mock;

  beforeEach(() => {
    tracks = signal<TrackModel[]>([]);
    tempo = signal(120);
    addNoteToTrack = jest.fn((trackId: string, note: TrackNote) => {
      tracks.update((ts) =>
        ts.map((t) =>
          t.id === trackId ? { ...t, notes: [...t.notes, note] } : t
        )
      );
    });
    removeNotes = jest.fn((trackId: string, noteIds: string[]) => {
      tracks.update((ts) =>
        ts.map((t) =>
          t.id === trackId
            ? { ...t, notes: t.notes.filter((n) => !noteIds.includes(n.id)) }
            : t
        )
      );
    });
    playAudition = jest.fn();
    stopAudition = jest.fn();
    speak = jest.fn();

    const audioMock = {
      tempo,
      playAudition,
      stopAudition,
    };
    const musicMock = {
      tracks,
      selectedTrackId: signal<string | null>(null),
      engine: audioMock,
      addTrack: jest.fn(
        (name: string, instrumentId: string, type: 'midi' | 'drum') => {
          const id = `track-${name.toLowerCase()}`;
          tracks.update((ts) => [
            ...ts,
            makeTrack(id, name, instrumentId, type),
          ]);
          return id;
        }
      ),
      addNoteToTrack,
      removeNotes,
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: MusicManagerService, useValue: musicMock as any },
        { provide: AudioEngineService, useValue: audioMock as any },
        { provide: SpeechSynthesisService, useValue: { speak } as any },
      ],
    });

    service = TestBed.inject(ChatMusicCommandEngineService);
  });

  const noteCount = () =>
    tracks().reduce((sum, t) => sum + t.notes.length, 0);
  const trackNames = () => tracks().map((t) => t.name);

  it('returns null for non-music input', () => {
    expect(service.tryExecute('teach me royalties')).toBeNull();
    expect(service.tryExecute('open the mixer')).toBeNull();
    expect(service.tryExecute('')).toBeNull();
  });

  it('shows the help deck for /music', () => {
    const result = service.tryExecute('/music');
    expect(result).not.toBeNull();
    expect(result!.content).toContain('CHAT MUSIC ENGINE');
  });

  it('builds a full beat from slash input (tempo + key + tracks + notes)', () => {
    const result = service.tryExecute('/make beat at 140 in C minor');
    expect(result).not.toBeNull();
    expect(result!.content).toContain('C minor');
    expect(tempo()).toBe(140);
    expect(trackNames()).toEqual(
      expect.arrayContaining(['Drums', 'Bass', 'Chords', 'Melody'])
    );
    expect(noteCount()).toBeGreaterThan(20);
  });

  it('builds a beat from natural language with default BPM', () => {
    const result = service.tryExecute('make me a beat');
    expect(result).not.toBeNull();
    expect(trackNames()).toContain('Drums');
    expect(tempo()).toBe(120);
  });

  it('writes a chord progression from "play C - Am - F - G"', () => {
    const result = service.tryExecute('play C - Am - F - G');
    expect(result).not.toBeNull();
    expect(result!.content).toContain('C – Am – F – G');
    const chords = tracks().find((t) => t.name === 'Chords');
    expect(chords).toBeDefined();
    expect(chords!.notes).toHaveLength(12); // 4 triads × 3 notes
  });

  it('plants a bassline in a requested key', () => {
    const result = service.tryExecute('bassline in A minor');
    expect(result).not.toBeNull();
    expect(result!.content).toContain('A minor');
    const bass = tracks().find((t) => t.name === 'Bass');
    expect(bass!.notes.length).toBeGreaterThan(0);
  });

  it('sketches a melody in a major key', () => {
    const result = service.tryExecute('melody in E major');
    expect(result).not.toBeNull();
    const melody = tracks().find((t) => t.name === 'Melody');
    expect(melody!.notes.length).toBe(8);
  });

  it('locks tempo via "set tempo 128"', () => {
    const result = service.tryExecute('set tempo to 128');
    expect(result).not.toBeNull();
    expect(tempo()).toBe(128);
  });

  it('undo restores the pre-command state after a beat', () => {
    service.tryExecute('/make beat at 140 in C minor');
    expect(noteCount()).toBeGreaterThan(20);

    const undoResult = service.tryExecute('undo');
    expect(undoResult).not.toBeNull();
    expect(undoResult!.content).toContain('Undone');
    expect(noteCount()).toBe(0);
  });

  it('undo can be repeated until the history is empty', () => {
    service.tryExecute('drop some drums');
    service.tryExecute('undo');
    const second = service.tryExecute('/undo');
    expect(second!.content).toContain('Nothing to undo');
  });

  it('clear removes all music-track notes and undo brings them back', () => {
    service.tryExecute('/make beat');
    expect(noteCount()).toBeGreaterThan(20);

    const clearResult = service.tryExecute('clear the music');
    expect(clearResult).not.toBeNull();
    expect(noteCount()).toBe(0);

    service.tryExecute('undo');
    expect(noteCount()).toBeGreaterThan(20);
  });

  it('preview renders the last creation and auditions it', async () => {
    (window as any).OfflineAudioContext = class FakeOffline {
      destination = {};
      constructor(
        public channels: number,
        public length: number,
        public sampleRate: number
      ) {}
      createGain() {
        return {
          connect: jest.fn(),
          gain: {
            value: 0,
            setValueAtTime: jest.fn(),
            exponentialRampToValueAtTime: jest.fn(),
          },
        };
      }
      createOscillator() {
        return {
          connect: jest.fn(),
          start: jest.fn(),
          stop: jest.fn(),
          type: '',
          frequency: { value: 0 },
        };
      }
      startRendering() {
        return Promise.resolve({ duration: 2 });
      }
    };

    service.tryExecute('/make beat at 100');
    const previewResult = service.tryExecute('preview');
    expect(previewResult).not.toBeNull();
    expect(previewResult!.content).toContain('Previewing');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(playAudition).toHaveBeenCalled();
  });

  it('preview degrades gracefully without Web Audio', () => {
    (window as any).OfflineAudioContext = undefined;
    service.tryExecute('/make beat');
    const result = service.tryExecute('/preview');
    expect(result!.content).toContain('Preview engine offline');
    expect(playAudition).not.toHaveBeenCalled();
  });

  it('stop halts audition playback', () => {
    service.tryExecute('stop');
    expect(stopAudition).toHaveBeenCalled();
  });

  it('speaks confirmations in the Ominous Protocol archetype when asked', () => {
    service.tryExecute('stop', { speak: true });
    expect(speak).toHaveBeenCalledWith(
      expect.stringContaining('Playback halted'),
      expect.objectContaining({ forceArchetype: 'Ominous Protocol' })
    );
  });
});
