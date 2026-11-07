import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ChatMusicCommandEngineService } from './chat-music-command-engine.service';
import { MusicManagerService, TrackNote, TrackModel } from './music-manager.service';
import { AudioEngineService } from './audio-engine.service';
import { SpeechSynthesisService } from './speech-synthesis.service';
import { UserProfileService } from './user-profile.service';
import { initialProfile, UserProfile } from '../types/profile.types';
import {
  CompositionCoreService,
  type CompositionPass,
} from '../composer/composition-core.service';
import { CompositionAuditionService } from '../composer/composition-audition.service';
import { ComponentKind, Composition } from '../composer/composer.types';
import { InstrumentsService } from './instruments.service';
import { BEAT_SAMPLE_PACKS } from './beat-sample-packs';

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

function makeComposition(overrides: Partial<Composition> = {}): Composition {
  return {
    id: 'comp-1',
    title: 'Concrete Protocol',
    component: 'bassline',
    componentLabel: 'Bassline',
    genreLabel: 'House',
    bpm: 124,
    keyLabel: 'F# Minor (Aeolian)',
    modeLabel: 'minor',
    grooveName: 'Deep House Pocket',
    totalBars: 32,
    durationSeconds: 62,
    energy: 0.6,
    darkness: 0.5,
    complexity: 0.55,
    variation: 'fresh',
    sections: [
      { label: 'Intro', bars: 4 },
      { label: 'Drop', bars: 28 },
    ] as unknown as Composition['sections'],
    parts: [
      { name: 'Bass', range: 'F#1–C#3' },
      { name: 'Chords', range: 'F#3–A4', reference: true },
    ] as unknown as Composition['parts'],
    theory: ['F# natural minor; i–VI–III–VII.'],
    rationale: ['The profile declared house, so the pocket leads.'],
    ...overrides,
  } as Composition;
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
  let profile: ReturnType<typeof signal<UserProfile>>;
  let composeGate: ReturnType<typeof signal<any>>;
  let generateStep: jest.Mock<Composition | null, [ComponentKind]>;
  let setBrief: jest.Mock;
  let currentComposition: ReturnType<typeof signal<Composition | null>>;
  let passHistory: ReturnType<typeof signal<CompositionPass[]>>;
  let restorePass: jest.Mock;
  let sendToStudio: jest.Mock;
  let auditionPlaying: ReturnType<typeof signal<boolean>>;
  let auditionMock: {
    toggle: jest.Mock;
    start: jest.Mock;
    stop: jest.Mock;
    playing: () => boolean;
    error: () => string | null;
  };

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
    profile = signal<UserProfile>({ ...initialProfile, settings: { ...initialProfile.settings, ai: { ...initialProfile.settings.ai, aiTotalControlEnabled: true } } });
    composeGate = signal({ ready: true, blockers: [] });
    generateStep = jest.fn((component: ComponentKind) =>
      makeComposition({
        component,
        componentLabel:
          component === 'full-song' ? 'Complete song' : component.replace('-', ' '),
      })
    );

    currentComposition = signal<Composition | null>(null);
    passHistory = signal<CompositionPass[]>([]);
    restorePass = jest.fn((pass: CompositionPass) => {
      currentComposition.set(pass.composition);
      return pass.composition;
    });
    sendToStudio = jest.fn(() => ({ trackIds: ['track-1', 'track-2'], skipped: [] }));
    auditionPlaying = signal(false);
    auditionMock = {
      toggle: jest.fn(async () => {
        auditionPlaying.set(true);
      }),
      start: jest.fn(async () => {
        auditionPlaying.set(true);
      }),
      stop: jest.fn(() => auditionPlaying.set(false)),
      playing: () => auditionPlaying(),
      error: () => null,
    };
    setBrief = jest.fn();
    const composerMock = {
      gate: composeGate,
      ensureGenreSelected: jest.fn(),
      generateStep,
      setBrief,
      error: () => null,
      current: () => currentComposition(),
      passHistory: () => passHistory(),
      restorePass,
      sendToStudio,
    };

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
      setInstrument: jest.fn((trackId: string, instrumentId: string) => {
        tracks.update((ts) =>
          ts.map((t) => (t.id === trackId ? { ...t, instrumentId } : t))
        );
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: MusicManagerService, useValue: musicMock as any },
        { provide: AudioEngineService, useValue: audioMock as any },
        { provide: SpeechSynthesisService, useValue: { speak } as any },
        { provide: UserProfileService, useValue: { profile } },
        { provide: CompositionCoreService, useValue: composerMock as any },
        { provide: CompositionAuditionService, useValue: auditionMock },
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

  /*
   * "play some lofi beats" used to fall through the chord parser into the
   * generic AI fallback. A "play X" request for an instrument is a creation
   * request, and the engine must claim it instead of shrugging.
   */
  it('creates a beat from loose phrasing like "play some lofi beats"', () => {
    const result = service.tryExecute('play some lofi beats');
    expect(result).not.toBeNull();
    expect(result!.content).toContain('Beat forged');
    expect(result!.content).toContain('lofi energy');
    expect(trackNames()).toEqual(
      expect.arrayContaining(['Drums', 'Bass', 'Chords', 'Melody'])
    );
  });

  it('routes "play a beat" to the beat builder, not the AI fallback', () => {
    const result = service.tryExecute('play a beat');
    expect(result).not.toBeNull();
    expect(trackNames()).toContain('Drums');
  });

  it('routes instrument phrasing to the right writer and keeps its key', () => {
    expect(service.tryExecute('play some drums')!.content).toContain('Drum pattern');
    expect(service.tryExecute('play bass in A minor')!.content).toContain('A minor');
    expect(service.tryExecute('play a melody in E major')!.content).toContain('E major');
  });

  it('still leaves navigation phrases like "play the mixer" to the router', () => {
    expect(service.tryExecute('play the mixer')).toBeNull();
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

  it('builds a beat from natural language with the artist profile as its default', () => {
    profile.set({
      ...initialProfile,
      settings: { ...initialProfile.settings, ai: { ...initialProfile.settings.ai, aiTotalControlEnabled: true } },
      primaryGenre: 'Ambient',
      genreSpecificData: { tempo: 82, key: 'D major' },
      musicalJourney: {
        ...initialProfile.musicalJourney,
        preferredBpmRange: '70-90',
        musicBlueprint: {
          ...initialProfile.musicalJourney.musicBlueprint,
          rhythmicFeel: 'sparse and breathing',
          harmonicLanguage: 'open fifths',
          sonicNonNegotiables: 'leave the room tone intact',
        },
      },
    });

    const result = service.tryExecute('make me a beat');
    expect(result).not.toBeNull();
    expect(result!.content).toContain('D major');
    expect(result!.content).toContain('Ambient energy');
    expect(result!.content).toContain('leave the room tone intact');
    expect(trackNames()).toContain('Drums');
    expect(tempo()).toBe(80);
    const drums = tracks().find((track) => track.name === 'Drums')!;
    expect(drums.notes.filter((note) => note.midi === 38)).toHaveLength(0);
    const chords = tracks().find((track) => track.name === 'Chords')!;
    expect(chords.notes).toHaveLength(8); // four open fifths, two notes each
  });

  it.each([
    ['lofi', 'lofi'],
    ['house', 'house'],
    ['jazz', 'jazz'],
    ['drum and bass', 'drum and bass'],
    ['reggaeton', 'reggaeton'],
    ['afrobeats', 'afrobeats'],
    ['amapiano', 'amapiano'],
    ['drill', 'drill'],
    ['metal', 'metal'],
  ])('adapts generated drums to %s rather than using one default groove', (promptGenre, expectedGenre) => {
    const result = service.tryExecute(`make a ${promptGenre} beat`);
    expect(result).not.toBeNull();
    expect(result!.content).toContain(`${expectedGenre} energy`);
    const drumTrack = tracks().find((track) => track.name === 'Drums')!;
    expect(drumTrack.notes.length).toBeGreaterThan(0);
    expect(new Set(drumTrack.notes.map((note) => note.step)).size).toBeGreaterThan(4);
    service.tryExecute('undo');
  });

  it('keeps an unlisted genre label and explicit BPM/key instead of calling it trap', () => {
    const result = service.tryExecute('make a cumbia beat at 96 in F minor');
    expect(result).not.toBeNull();
    expect(result!.content).toContain('cumbia energy');
    expect(result!.content).toContain('F minor at 96 BPM');
    expect(tempo()).toBe(96);
  });

  it('uses an explicit tempo and key instead of profile defaults', () => {
    profile.set({
      ...initialProfile,
      settings: { ...initialProfile.settings, ai: { ...initialProfile.settings.ai, aiTotalControlEnabled: true } },
      primaryGenre: 'Ambient',
      musicalJourney: {
        ...initialProfile.musicalJourney,
        preferredBpmRange: '70-90',
      },
    });
    const result = service.tryExecute('make a house beat at 124 in A minor');
    expect(result!.content).toContain('A minor at 124 BPM');
    expect(tempo()).toBe(124);
  });

  it('writes a different beat on every request instead of replaying one loop', () => {
    service.tryExecute('make a jazz beat');
    const first = tracks().map((track) => track.notes.map(({ midi, step }) => ({ midi, step })));
    const firstIds = tracks().flatMap((track) => track.notes.map((note) => note.id));
    service.tryExecute('undo');
    service.tryExecute('make a jazz beat');
    const second = tracks().map((track) => track.notes.map(({ midi, step }) => ({ midi, step })));
    const secondIds = tracks().flatMap((track) => track.notes.map((note) => note.id));

    // Same genre and the same four tracks — but a genuinely new reading.
    expect(second).not.toEqual(first);
    expect(trackNames()).toEqual(['Drums', 'Bass', 'Chords', 'Melody']);
    expect(second.every((notes) => notes.length > 0)).toBe(true);
    expect(new Set(secondIds).size).toBe(secondIds.length);
    expect(secondIds).not.toEqual(firstIds);
  });

  it('builds beats from the sample-library shelves instead of four fixed presets', () => {
    const known = new Set(
      TestBed.inject(InstrumentsService)
        .getPresets()
        .map((preset) => preset.id)
    );

    const first = service.tryExecute('make a jazz beat')!;
    const firstInstruments = tracks().map((track) => track.instrumentId);
    expect(first.content).toMatch(/from the .+ shelf\./);
    expect(BEAT_SAMPLE_PACKS.some((pack) => first.content.includes(pack.label))).toBe(true);
    expect(new Set(firstInstruments).size).toBe(4);
    expect(firstInstruments.every((id) => known.has(id))).toBe(true);

    service.tryExecute('undo');
    const second = service.tryExecute('make a jazz beat')!;
    const secondInstruments = tracks().map((track) => track.instrumentId);
    // The next reading lands on another shelf and repoints the same channels.
    expect(secondInstruments).not.toEqual(firstInstruments);
    expect(secondInstruments.every((id) => known.has(id))).toBe(true);
    expect(BEAT_SAMPLE_PACKS.some((pack) => second.content.includes(pack.label))).toBe(true);
  });

  it("undo restores the previous shelf's instruments", () => {
    service.tryExecute('make a jazz beat');
    const first = tracks().map((track) => track.instrumentId);
    service.tryExecute('make a jazz beat');
    expect(tracks().map((track) => track.instrumentId)).not.toEqual(first);

    expect(service.tryExecute('undo')!.content).toContain('Undone');
    expect(tracks().map((track) => track.instrumentId)).toEqual(first);
  });

  it('writes a chord progression with the nearest-octave voice leading', () => {
    const result = service.tryExecute('play C - Am - F - G');
    expect(result).not.toBeNull();
    expect(result!.content).toContain('C – Am – F – G');
    const chords = tracks().find((t) => t.name === 'Chords');
    expect(chords).toBeDefined();
    expect(chords!.notes).toHaveLength(12); // 4 triads × 3 notes
    const roots = [0, 4, 8, 12].map((step) =>
      chords!.notes.filter((note) => note.step === step * 4).reduce((lowest, note) => Math.min(lowest, note.midi), Infinity)
    );
    expect(roots).toEqual([60, 57, 53, 55]);
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
    expect(clearResult!.content).toContain('/confirm');
    expect(noteCount()).toBeGreaterThan(20);
    service.tryExecute('/confirm');
    expect(noteCount()).toBe(0);

    service.tryExecute('undo');
    expect(noteCount()).toBeGreaterThan(20);
  });

  it('preview renders the last creation and auditions it', async () => {
    const oscTypes: string[] = [];
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
        const osc: any = {
          connect: jest.fn(),
          start: jest.fn(),
          stop: jest.fn(),
          _type: '',
          frequency: { value: 0 },
        };
        Object.defineProperty(osc, 'type', {
          get: () => osc._type,
          set: (wave: string) => {
            osc._type = wave;
            oscTypes.push(wave);
          },
        });
        return osc;
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
    // The kit keeps its own voices instead of one flat triangle synth.
    expect(new Set(oscTypes).size).toBeGreaterThan(1);
  });

  it('previews from the factory samples the presets declare', async () => {
    let bufferSources = 0;
    const sampleBuffer = { duration: 1.2, getChannelData: () => new Float32Array(1) };
    class FakeSampleOffline {
      destination = {};
      constructor(
        public channels: number,
        public length: number,
        public sampleRate = 44100
      ) {}
      createGain() {
        return {
          connect: jest.fn(),
          gain: {
            value: 0,
            setValueAtTime: jest.fn(),
            exponentialRampToValueAtTime: jest.fn(),
            setTargetAtTime: jest.fn(),
            linearRampToValueAtTime: jest.fn(),
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
      createBufferSource() {
        bufferSources += 1;
        return {
          buffer: null,
          connect: jest.fn(),
          start: jest.fn(),
          stop: jest.fn(),
          playbackRate: { setValueAtTime: jest.fn() },
        };
      }
      createStereoPanner() {
        return {
          connect: jest.fn(),
          pan: {
            setValueAtTime: jest.fn(),
            linearRampToValueAtTime: jest.fn(),
          },
        };
      }
      decodeAudioData() {
        return Promise.resolve(sampleBuffer);
      }
      startRendering() {
        return Promise.resolve({ duration: 2 });
      }
    }
    (window as any).OfflineAudioContext = FakeSampleOffline;
    const fetchMock = jest.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    }));
    const originalFetch = (global as any).fetch;
    (global as any).fetch = fetchMock;
    try {
      service.tryExecute('make a jazz beat');
      const instruments = TestBed.inject(InstrumentsService);
      const usesSamples = tracks().some((track) =>
        instruments.sampleSelectionFor(
          track.instrumentId,
          track.notes[0]?.midi ?? 60,
          0.9
        )
      );
      expect(usesSamples).toBe(true);

      expect(service.tryExecute('preview')!.content).toContain('Previewing');
      for (let i = 0; i < 100 && bufferSources === 0; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(fetchMock).toHaveBeenCalled();
      expect(bufferSources).toBeGreaterThan(0);
    } finally {
      (global as any).fetch = originalFetch;
      (window as any).OfflineAudioContext = undefined;
    }
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

  it('undo removes tracks created by a command and restores the prior selection', () => {
    service.tryExecute('make a beat');
    expect(trackNames()).toEqual(
      expect.arrayContaining(['Drums', 'Bass', 'Chords', 'Melody'])
    );

    const result = service.tryExecute('undo');
    expect(result!.content).toContain('Undone');
    expect(trackNames()).toEqual([]);
    expect((service as any).music.selectedTrackId()).toBeNull();
  });

  it('speaks confirmations in the Ominous Protocol archetype when asked', () => {
    service.tryExecute('stop', { speak: true });
    expect(speak).toHaveBeenCalledWith(
      expect.stringContaining('Playback halted'),
      expect.objectContaining({ forceArchetype: 'Ominous Protocol' })
    );
  });
  it.each(['How do I mix bass?', 'Explain chord progressions', 'What is melody?', 'Should I add drums?', "Don't add bass", 'My bass sounds muddy', 'play bowling'])('never mutates for discussion: %s', (question) => {
    expect(service.tryExecute(question)).toBeNull();
    expect(noteCount()).toBe(0);
    expect(tempo()).toBe(120);
  });

  it('blocks music mutations when full control is off and permits help', () => {
    profile.set(initialProfile);
    expect(service.tryExecute('make a beat')!.content).toContain('Full-Control Mode is off');
    expect(service.tryExecute('/chords C - Am')!.content).toContain('Full-Control Mode is off');
    expect(service.tryExecute('/music')!.content).toContain('CHAT MUSIC ENGINE');
    expect(tracks()).toHaveLength(0);
  });

  it('invalidates a clear confirmation when notes change or the artist cancels', () => {
    service.tryExecute('make a beat');
    const before = noteCount();
    service.tryExecute('clear the music');
    addNoteToTrack(tracks()[0].id, { id: 'new', midi: 60, step: 0, length: 1, velocity: 1 });
    expect(service.tryExecute('/confirm')!.content).toContain('changed');
    expect(noteCount()).toBe(before + 1);
    service.tryExecute('clear the music');
    expect(service.tryExecute('/cancel')!.content).toContain('Cancelled');
    expect(service.tryExecute('/confirm')).toBeNull();
    expect(noteCount()).toBe(before + 1);
  });

  it('expires clear confirmations', () => {
    service.tryExecute('make a beat');
    service.tryExecute('clear the music');
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
    expect(service.tryExecute('/confirm')!.content).toContain('expired');
    expect(noteCount()).toBeGreaterThan(0);
    clock.mockRestore();
  });

  it('preserves flat and sharp key names without doubled accidentals', () => {
    expect(service.tryExecute('make a beat in Bb minor')!.content).toContain('Bb minor');
    expect(service.tryExecute('play Dbmaj7 - Ebm7')!.content).toContain('Dbmaj7');
  });

  it('composes a single step through Composition Core without touching the session', async () => {
    const before = noteCount();
    const intent = service.detectComposeIntent('/compose bassline');
    expect(intent?.component).toBe('bassline');
    const result = await service.compose(intent!.component, intent!.brief);
    expect(result.content).toContain('BASS');
    expect(result.content).toContain('Concrete Protocol');
    expect(result.content).toContain('Nothing touched your session yet');
    expect(result.actions.map((action) => action.id)).toEqual([
      'composer-audition',
      'composer-load',
      'composer-open',
    ]);
    expect(generateStep).toHaveBeenLastCalledWith('bassline');
    expect(noteCount()).toBe(before);
  });

  it('treats a bare compose request as a complete song', async () => {
    expect(service.detectComposeIntent('/compose')?.component).toBe('full-song');
    const result = await service.compose('full-song');
    expect(result.content).toContain('COMPLETE SONG');
    expect(generateStep).toHaveBeenLastCalledWith('full-song');
    expect(service.detectComposeIntent('compose a melody')?.component).toBe('melody');
  });

  it('recognizes genre-locked step asks in natural language', () => {
    expect(service.detectComposeIntent('write me a bassline for my profile')?.component).toBe('bassline');
    expect(service.detectComposeIntent('make a melody for me')?.component).toBe('melody');
    expect(service.detectComposeIntent('how do I compose a bassline?')).toBeNull();
    expect(service.tryExecute('how do I compose a bassline?')).toBeNull();
  });

  it("passes the artist's brief through to Composition Core", async () => {
    const intent = service.detectComposeIntent('compose a darker bassline at 140 bpm');
    expect(intent?.component).toBe('bassline');
    await service.compose(intent!.component, intent!.brief);
    expect(setBrief).toHaveBeenLastCalledWith('compose a darker bassline at 140 bpm');
  });

  it('detects history asks without mistaking them for generation', () => {
    expect(service.detectCompositionHistoryIntent('go back to the previous reading')).toEqual({
      kind: 'relative',
      offset: 1,
    });
    expect(service.detectCompositionHistoryIntent('go back two readings')).toEqual({
      kind: 'relative',
      offset: 2,
    });
    expect(service.detectCompositionHistoryIntent('show my pass history')).toEqual({ kind: 'list' });
    expect(service.detectCompositionHistoryIntent('/compose history')).toEqual({ kind: 'list' });
    expect(service.detectCompositionHistoryIntent('/compose restore 2')).toEqual({
      kind: 'index',
      index: 2,
    });
    expect(service.detectCompositionHistoryIntent('how do I see my pass history?')).toBeNull();
  });

  it('lists passes and restores an earlier reading', async () => {
    const older = makeComposition({ id: 'old', title: 'Older Reading', variation: 'fresh' });
    const newer = makeComposition({ id: 'new', title: 'Newer Reading', variation: 'evolve' });
    const passes: CompositionPass[] = [
      { id: 'p2', composition: newer, brief: 'bright', intensity: { complexity: 0.5, energy: 0.7, darkness: 0.3 }, createdAt: 2 },
      { id: 'p1', composition: older, brief: 'dark', intensity: { complexity: 0.6, energy: 0.8, darkness: 0.7 }, createdAt: 1 },
    ];
    passHistory.set(passes);
    currentComposition.set(newer);

    const listed = await service.compositionHistory({ kind: 'list' });
    expect(listed.content).toContain('▸ 1. Newer Reading');
    expect(listed.content).toContain('2. Older Reading');

    const restored = await service.compositionHistory({ kind: 'relative', offset: 1 });
    expect(restorePass).toHaveBeenCalledWith(passes[1]);
    expect(restored.content).toContain('Restored pass 2 of 2');
    expect(restored.content).toContain('Older Reading');
    expect(restored.actions.map((action) => action.id)).toContain('composer-audition');
  });

  it('detects A/B comparison requests without treating them as generation', () => {
    expect(service.detectCompositionCompareIntent('/compose compare 1 3')).toEqual({
      a: { kind: 'index', index: 1 },
      b: { kind: 'index', index: 3 },
    });
    expect(
      service.detectCompositionCompareIntent('compare the previous reading with the current one')
    ).toEqual({ a: { kind: 'relative', offset: 1 }, b: { kind: 'relative', offset: 0 } });
    expect(service.detectCompositionCompareIntent('compare the last two passes')).toEqual({
      a: { kind: 'index', index: 2 },
      b: { kind: 'index', index: 1 },
    });
    expect(
      service.detectCompositionCompareIntent('compare "Concrete Protocol" and "Older Reading"')
    ).toEqual({
      a: { kind: 'title', query: 'concrete protocol' },
      b: { kind: 'title', query: 'older reading' },
    });
    expect(service.detectCompositionCompareIntent('how do these passes compare?')).toBeNull();
  });

  it('compares two passes by number and by name without restoring', async () => {
    const newest = makeComposition({ id: 'new', title: 'Newest Reading', bpm: 140, variation: 'evolve' });
    const middle = makeComposition({ id: 'mid', title: 'Middle Reading', bpm: 120 });
    const oldest = makeComposition({ id: 'old', title: 'Oldest Reading', bpm: 96 });
    passHistory.set([
      { id: 'p3', composition: newest, brief: 'bright', intensity: { complexity: 0.6, energy: 0.8, darkness: 0.3 }, createdAt: 3 },
      { id: 'p2', composition: middle, brief: 'dark', intensity: { complexity: 0.6, energy: 0.6, darkness: 0.6 }, createdAt: 2 },
      { id: 'p1', composition: oldest, brief: 'chill', intensity: { complexity: 0.4, energy: 0.3, darkness: 0.5 }, createdAt: 1 },
    ]);
    currentComposition.set(newest);

    const byNumber = await service.compositionCompare({
      a: { kind: 'index', index: 3 },
      b: { kind: 'index', index: 1 },
    });
    expect(byNumber.content).toContain('A/B COMPARE — pass 3 vs pass 1');
    expect(byNumber.content).toContain('A · Oldest Reading');
    expect(byNumber.content).toContain('B · Newest Reading');
    expect(byNumber.content).toContain('tempo +44 BPM');
    expect(byNumber.content).toContain('Nothing was restored');
    expect(byNumber.actions.find((action) => action.id === 'composer-load-a')?.data).toBe('p1');
    expect(byNumber.actions.find((action) => action.id === 'composer-load-b')?.data).toBe('p3');
    expect(byNumber.actions.find((action) => action.id === 'composer-audition-a')?.data).toBe('p1');
    expect(byNumber.actions.find((action) => action.id === 'composer-audition-b')?.data).toBe('p3');

    const auditioned = await service.auditionPass('p1');
    expect(auditionMock.start).toHaveBeenCalledWith(oldest);
    expect(currentComposition()).toBe(newest);
    expect(restorePass).not.toHaveBeenCalled();
    expect(auditioned.content).toContain('Auditioning “Oldest Reading”');
    expect(auditioned.content).toContain('untouched');

    const byName = await service.compositionCompare({
      a: { kind: 'title', query: 'middle reading' },
      b: { kind: 'title', query: 'newest reading' },
    });
    expect(byName.content).toContain('A · Middle Reading');
    expect(byName.content).toContain('B · Newest Reading');
    expect(restorePass).not.toHaveBeenCalled();
  });

  it('needs two passes before comparing', async () => {
    passHistory.set([
      {
        id: 'p1',
        composition: makeComposition(),
        brief: '',
        intensity: { complexity: 0.6, energy: 0.6, darkness: 0.5 },
        createdAt: 1,
      },
    ]);
    const result = await service.compositionCompare({
      a: { kind: 'index', index: 1 },
      b: { kind: 'index', index: 2 },
    });
    expect(result.content).toContain('at least two passes');
  });

  it('loads a compared pass into the Studio without navigating', async () => {
    const pass = makeComposition({ id: 'old', title: 'Older Reading' });
    passHistory.set([
      {
        id: 'p1',
        composition: pass,
        brief: 'dark',
        intensity: { complexity: 0.6, energy: 0.6, darkness: 0.6 },
        createdAt: 1,
      },
    ]);

    const result = await service.loadPassIntoStudio('p1');

    expect(restorePass).toHaveBeenCalledWith(passHistory()[0]);
    expect(sendToStudio).toHaveBeenCalledWith({ navigate: false });
    expect(result.content).toContain('Loaded “Older Reading”');
    expect(result.content).toContain('2 tracks');
    expect(result.content).toContain('still in the conversation');
  });

  it('reports a pass that has left history instead of loading the wrong one', async () => {
    const result = await service.loadPassIntoStudio('missing');
    expect(result.content).toContain('no longer in history');
    expect(restorePass).not.toHaveBeenCalled();
    expect(sendToStudio).not.toHaveBeenCalled();
  });

  it('asks for a number when a title matches more than one pass', async () => {
    const first = makeComposition({ id: 'a', title: 'Same Name', variation: 'fresh' });
    const second = makeComposition({ id: 'b', title: 'Same Name', variation: 'evolve' });
    passHistory.set([
      { id: 'p2', composition: second, brief: '', intensity: { complexity: 0.6, energy: 0.6, darkness: 0.5 }, createdAt: 2 },
      { id: 'p1', composition: first, brief: '', intensity: { complexity: 0.6, energy: 0.6, darkness: 0.5 }, createdAt: 1 },
    ]);
    currentComposition.set(second);

    const result = await service.compositionCompare({
      a: { kind: 'title', query: 'same name' },
      b: { kind: 'index', index: 1 },
    });
    expect(result.content).toContain('matches 2 passes');
    expect(result.content).toContain('1. Same Name (evolve)');
  });

  it('reports empty and out-of-range history honestly', async () => {
    expect((await service.compositionHistory({ kind: 'list' })).content).toContain(
      'No passes in history'
    );

    passHistory.set([
      {
        id: 'p1',
        composition: makeComposition(),
        brief: '',
        intensity: { complexity: 0.5, energy: 0.7, darkness: 0.5 },
        createdAt: 1,
      },
    ]);
    currentComposition.set(passHistory()[0].composition);
    expect(
      (await service.compositionHistory({ kind: 'relative', offset: 5 })).content
    ).toContain('further back');
    expect(
      (await service.compositionHistory({ kind: 'relative', offset: -1 })).content
    ).toContain('newest reading');
  });

  it('refuses to compose when the artist profile gate is locked', async () => {
    composeGate.set({
      ready: false,
      blockers: [{ label: 'Artist profile committed', detail: 'Commit the profile.' }],
    });
    const result = await service.compose('drums');
    expect(result.content).toContain('🔒');
    expect(result.content).toContain('Artist profile committed');
    expect(result.actions).toEqual([]);
    expect(generateStep).not.toHaveBeenCalled();
  });

});
