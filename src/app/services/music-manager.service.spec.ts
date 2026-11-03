import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MusicManagerService } from './music-manager.service';
import { AudioEngineService } from './audio-engine.service';
import { ProjectService } from './project.service';
import { HistoryService } from './history.service';
import { PluginStoreService } from './plugin-store.service';
import { InstrumentsService } from './instruments.service';
import { StemSeparationService } from './stem-separation.service';
import { StudioRecordingEngineService } from '../studio/studio-recording-engine.service';
import { LoggingService } from './logging.service';
import { TakeManagerService } from './take-manager.service';
import { AutomationService } from '../studio/automation.service';
import { IdeasGeneratorService } from './ideas-generator.service';
import { StudioDeviceProfileService } from './studio-device-profile.service';

describe('MusicManagerService clip glue workflows', () => {
  let service: MusicManagerService;
  let history: HistoryService;

  const engineMock = {
    tempo: signal(120),
    visualStep: signal(0),
    setSongLengthSteps: jest.fn(),
    triggerAttack: jest.fn(),
    setBaseFaderGain: jest.fn(),
    updateTrack: jest.fn(),
    stop: jest.fn(),
    onScheduleStep: undefined as any,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MusicManagerService,
        HistoryService,
        { provide: AudioEngineService, useValue: engineMock },
        { provide: ProjectService, useValue: { currentProject: signal(null) } },
        { provide: PluginStoreService, useValue: { preload: jest.fn() } },
        { provide: InstrumentsService, useValue: { getPresets: () => [] } },
        { provide: StemSeparationService, useValue: {} },
        { provide: StudioRecordingEngineService, useValue: {} },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        {
          provide: TakeManagerService,
          useValue: { getCompNotesForStepNow: () => [] },
        },
      ],
    });

    service = TestBed.inject(MusicManagerService);
    history = TestBed.inject(HistoryService);
    service.tracks.set([
      {
        id: 'track-1',
        name: 'Lead',
        type: 'midi',
        instrumentId: 'grand-piano',
        muted: false,
        soloed: false,
        volume: 0.8,
        gain: 0.8,
        pan: 0,
        clips: [],
        notes: [],
        steps: new Array(64).fill(false),
        fxSlots: [],
        sendA: 0,
        sendB: 0,
        effects: [],
        patternSlots: [],
        activePatternSlotId: null,
      } as any,
    ]);
  });

  it('turns every starter drum lane into playable kick, snare and hat notes', () => {
    const recipes = new IdeasGeneratorService().recipes;
    for (const recipe of recipes) {
      service.applyGeneratedRecipe(recipe);
      const source = recipe.tracks.find((track) => track.drum)!;
      const track = service.tracks().find((candidate) => candidate.type === 'drum')!;
      expect(track.id).toBe(MusicManagerService.DRUM_TRACK_ID);
      expect(track.instrumentId).toBe('trap-kit-elite');
      for (const [midi, steps] of [[36, source.drum!.kick], [38, source.drum!.snare], [42, source.drum!.hat]] as const) {
        expect(track.notes.filter((note) => note.midi === midi).map((note) => note.step)).toEqual(steps);
      }
      const first = track.notes[0];
      engineMock.triggerAttack.mockClear();
      service.playStep(first.step, 1, 0.25);
      expect(engineMock.triggerAttack.mock.calls.some((call) => call[0] === track.id)).toBe(true);
      const rendered = service.arrangementNotes(track);
      expect(rendered).toHaveLength(track.notes.length);
      rendered.forEach((note) => {
        expect(note.microOffset ?? 0).toBe(note.step % 2 ? source.drum!.swing ?? 0 : 0);
      });
    }
  });

  it('passes the sampled CC curve into live note playback', () => {
    const automation = TestBed.inject(AutomationService);
    const track = service.tracks()[0];
    track.notes = [{ id: 'cc-note', midi: 60, step: 0, length: 4, velocity: 0.8 }];
    service.tracks.set([...service.tracks()]);
    const lane = automation.addLane(track.id, 'cc_cutoff', { min: 0, max: 127 });
    automation.addPoint(lane.id, 0, 0);
    automation.addPoint(lane.id, 4, 127);

    engineMock.triggerAttack.mockClear();
    service.playStep(0, 1, 0.25);

    const call = engineMock.triggerAttack.mock.calls.find((entry) => entry[0] === track.id)!;
    const params = call[9];
    expect(params.midiCc.length).toBeGreaterThan(1);
    expect(params.midiCc[0].cutoff).toBeCloseTo(20, 5);
  });

  it('applies per-note aftertouch as a pressure offset on the voice', () => {
    const track = service.tracks()[0];
    track.notes = [
      { id: 'touch-note', midi: 60, step: 0, length: 4, velocity: 0.8, aftertouch: 0.8 },
    ];
    service.tracks.set([...service.tracks()]);

    engineMock.triggerAttack.mockClear();
    service.playStep(0, 1, 0.25);

    const call = engineMock.triggerAttack.mock.calls.find((entry) => entry[0] === track.id)!;
    const params = call[9];
    expect(params.midiCc[0].expression).toBeCloseTo(0.9, 5);
  });

  it('preserves simultaneous drum hits and recipe swing independently from 808 bass', () => {
    service.applyGeneratedRecipe({
      id: 'test', name: 'Test', glyph: '', bpm: 100, vibe: '', progression: [],
      tracks: [
        { name: 'Bass', instrumentId: 'trap-808-elite', notes: [{ midi: 36, step: 0, length: 1, velocity: 1 }] },
        { name: 'Drums', instrumentId: 'trap-808-elite', notes: [], drum: { kick: [1], snare: [1], hat: [1], swing: 0.3 } },
      ],
    });
    const [bass, drums] = service.tracks();
    expect(bass).toMatchObject({ type: 'midi', instrumentId: 'trap-808-elite' });
    expect(drums.notes.map((note) => note.midi)).toEqual([36, 38, 42]);
    expect(drums.drumSwing).toBe(0.3);
    expect(service.arrangementNotes(drums).every((note) => note.microOffset === 0.3)).toBe(true);
    history.undo();
    expect(service.tracks()[0].id).toBe('track-1');
    history.redo();
    expect(service.tracks()[1].notes).toHaveLength(3);
  });

  it('applies channel swing to live and rendered drum notes without moving another track', () => {
    const base = service.tracks()[0];
    service.tracks.set([
      { ...base, id: 'kit', type: 'drum', drumSwing: 0.5, notes: [{ id: 'hit', midi: 36, step: 1, length: 1, velocity: 0.8, microOffset: 0.1 }] },
      { ...base, id: 'bass', notes: [{ id: 'bass-note', midi: 48, step: 1, length: 1, velocity: 0.8 }] },
    ]);
    engineMock.triggerAttack.mockClear();
    service.playStep(1, 1, 0.25);
    const drumCall = engineMock.triggerAttack.mock.calls.find((call) => call[0] === 'kit')!;
    const bassCall = engineMock.triggerAttack.mock.calls.find((call) => call[0] === 'bass')!;
    expect(drumCall[2]).toBeCloseTo(1.15);
    expect(bassCall[2]).toBe(1);
    expect(service.arrangementNotes(service.tracks()[0])[0].microOffset).toBeCloseTo(0.6);
    expect(service.tracks()[0].notes[0].microOffset).toBe(0.1);
  });

  it('schedules swung drum ratchets evenly with one probability decision', () => {
    const base = service.tracks()[0];
    service.tracks.set([{ ...base, id: 'kit', type: 'drum', drumSwing: 0.5,
      notes: [{ id: 'hit', midi: 36, step: 1, length: 1, velocity: 0.8, probability: 0.75, params: { ratchet: 4 } }],
    }]);
    const random = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      engineMock.triggerAttack.mockClear();
      service.playStep(1, 1, 0.25);
      expect(random).toHaveBeenCalledTimes(1);
      expect(engineMock.triggerAttack.mock.calls.map((call) => call[2])).toEqual([1.125, 1.1875, 1.25, 1.3125]);
      expect(engineMock.triggerAttack.mock.calls.every((call) => call[4] === 0.0625)).toBe(true);
      random.mockReturnValue(0.9);
      engineMock.triggerAttack.mockClear();
      service.playStep(1, 1, 0.25);
      expect(engineMock.triggerAttack).not.toHaveBeenCalled();
    } finally { random.mockRestore(); }
  });

  it('retriggers imported and preset drum samples', () => {
    const base = service.tracks()[0];
    const sampler = jest.fn();
    (service as any).engine.triggerSampler = sampler;
    const sample = { duration: 1 } as AudioBuffer;
    service.stemAudioCache.set('kick', sample);
    service.tracks.set([{ ...base, id: 'kit', type: 'drum', notes: [
      { id: 'hit', midi: 36, step: 0, length: 1, velocity: 0.8, params: { ratchet: 3, sampleRefId: 'kick' } },
    ] }]);
    service.playStep(0, 1, 0.3);
    expect(sampler.mock.calls.map((call) => call[2])).toEqual([1, 1.1, 1.2]);
    service.stemAudioCache.delete('kick');
    const instruments = (service as any).instruments;
    instruments.isSamplePreset = jest.fn(() => true);
    instruments.getPresetSample = jest.fn(() => ({ buffer: sample, rate: 1, oneShot: true, release: 0.05 }));
    service.tracks.update((tracks) => tracks.map((track) => ({ ...track, notes: [{ ...track.notes[0], params: { ratchet: 2 } }] })));
    sampler.mockClear();
    service.playStep(0, 1, 0.3);
    expect(sampler.mock.calls.map((call) => call[2])).toEqual([1, 1.15]);
  });

  it('keeps swing relative to the pattern when clips start on an odd step', () => {
    const base = service.tracks()[0];
    const track = { ...base, type: 'drum' as const, drumSwing: 0.5,
      notes: [{ id: 'hit', midi: 36, step: 1, length: 1, velocity: 0.8 }],
      clips: [{ id: 'clip', start: 1 / 16, length: 1, type: 'midi' as const }],
    } as any;
    expect(service.arrangementNotes(track)[0]).toMatchObject({ step: 2, microOffset: 0.5 });
  });

  it('retimes live clip windows through meter changes', () => {
    const engine = engineMock as any;
    const boundaries = [0, 16, 32, 44, 56];
    engine.stepAtBar = (bar: number) => {
      const whole = Math.min(boundaries.length - 1, Math.floor(bar));
      const fraction = Math.max(0, bar - whole);
      const next = boundaries[Math.min(boundaries.length - 1, whole + 1)];
      return Math.round(boundaries[whole] + (next - boundaries[whole]) * fraction);
    };
    engine.stepsForBars = (start: number, bars: number) =>
      engine.stepAtBar(start + bars) - engine.stepAtBar(start);

    try {
      const base = service.tracks()[0];
      const track = {
        ...base,
        type: 'drum' as const,
        drumPatternLength: 16,
        notes: [{ id: 'hit', midi: 36, step: 8, length: 1, velocity: 0.8 }],
        clips: [{ id: 'clip', start: 2, length: 2, type: 'midi' as const }],
      } as any;

      // Bar 2 starts at step 32 and the following 3/4 bars are 12 steps each,
      // so the two-bar clip ends at 56 instead of the fixed 64-step window.
      expect(service.arrangementNotes(track).map((note) => note.step)).toEqual([40]);
      expect(service.drumStepAt(track, 31)).toBeNull();
      expect(service.drumStepAt(track, 32)).toBe(0);
      expect(service.drumStepAt(track, 55)).not.toBeNull();
      expect(service.drumStepAt(track, 56)).toBeNull();
    } finally {
      delete engine.stepAtBar;
      delete engine.stepsForBars;
    }
  });

  it('runs independent drum cycles across the transport wrap and preserves hidden hits', () => {
    const base = service.tracks()[0];
    const note = (id: string, step: number) => ({ id, midi: 36, step, length: 1, velocity: 0.8 });
    service.tracks.set([
      { ...base, id: 'five', type: 'drum', drumPatternLength: 5, notes: [note('a', 0), note('hidden', 5)] },
      { ...base, id: 'seven', type: 'drum', drumPatternLength: 7, notes: [note('b', 0)] },
      { ...base, id: 'melody', notes: [note('c', 0)] },
    ]);
    engineMock.triggerAttack.mockClear();
    for (let raw = 0; raw <= 70; raw++) service.playStep(raw % 64, raw, 0.25, raw);
    const calls = engineMock.triggerAttack.mock.calls;
    expect(calls.filter((c) => c[0] === 'five').map((c) => c[2])).toEqual(Array.from({ length: 15 }, (_, i) => i * 5));
    expect(calls.filter((c) => c[0] === 'seven').map((c) => c[2])).toEqual(Array.from({ length: 11 }, (_, i) => i * 7));
    expect(calls.filter((c) => c[0] === 'melody').map((c) => c[2])).toEqual([0, 64]);
    expect(service.tracks()[0].notes).toHaveLength(2);
    expect(service.drumStepAt(service.tracks()[0], 1, 65)).toBe(0);
  });

  it('expands cycles within clip-relative windows and the requested no-clip render duration', () => {
    const base = service.tracks()[0];
    const note = { id: 'n', midi: 36, step: 1, length: 1, velocity: 0.8 };
    const hidden = { ...note, id: 'hidden', step: 7 };
    const track = { ...base, type: 'drum' as const, drumPatternLength: 5, drumSwing: 0.5, notes: [note, hidden] };
    expect(service.arrangementNotes(track, 13).map((n) => n.step)).toEqual([1, 6, 11]);
    expect(service.arrangementNotes(track, 13).every((n) => n.microOffset === 0.5)).toBe(true);
    const clipped = { ...track, clips: [{ id: 'c', type: 'midi' as const, start: 1 / 16, length: 1 }] } as any;
    expect(service.arrangementNotes(clipped).map((n) => n.step)).toEqual([2, 7, 12]);
    expect(service.drumStepAt(clipped, 0)).toBeNull();
    expect(service.drumStepAt(clipped, 7)).toBe(1);
    engineMock.triggerAttack.mockClear();
    service.tracks.set([clipped]);
    for (let step = 0; step < 18; step++) service.playStep(step, step, 0.25);
    expect(engineMock.triggerAttack.mock.calls.map((c) => c[2])).toEqual([2.125, 7.125, 12.125]);
    expect(service.arrangementNotes({ ...track, drumPatternLength: undefined }, 13).map((n) => n.step)).toEqual([1, 7]);
  });

  it('keeps a full-loop drum clip in phase across the pattern transport wrap', () => {
    const track = { ...service.tracks()[0], type: 'drum' as const, drumPatternLength: 5,
      notes: [{ id: 'x', midi: 36, step: 0, length: 1, velocity: 1 }],
      clips: [{ id: 'clip', type: 'midi' as const, start: 0, length: 4 }],
    } as any;
    service.tracks.set([track]);
    engineMock.triggerAttack.mockClear();
    for (let raw = 60; raw <= 70; raw++) service.playStep(raw % 64, raw, 0.25, raw);
    expect(engineMock.triggerAttack.mock.calls.map((call) => call[2])).toEqual([60, 65, 70]);
    expect(service.drumStepAt(track, 1, 65)).toBe(0);
  });

  it('persists and undoes channel cycle length without changing notes', () => {
    const track = { ...service.tracks()[0], type: 'drum' as const, notes: [{ id: 'x', midi: 36, step: 20, length: 1, velocity: 1 }] };
    service.tracks.set([track]);
    service.applyTrackPatch(track.id, { drumPatternLength: 7 });
    const snapshot = JSON.parse(JSON.stringify(service.tracks()));
    expect(snapshot[0].drumPatternLength).toBe(7);
    history.undo();
    expect(service.tracks()[0].drumPatternLength).toBeUndefined();
    history.redo();
    expect(service.tracks()[0].notes[0].step).toBe(20);
    expect(service.tracks()[0].drumPatternLength).toBe(7);
  });

  it('keeps the Session grid launch boundary and resets it for a new project', () => {
    expect(service.launchQuantize()).toBe('none');
    expect(service.setLaunchQuantize('4bar')).toBe('4bar');
    expect(service.launchQuantize()).toBe('4bar');
    // Anything outside the grid options is the immediate default.
    expect(service.setLaunchQuantize('bogus' as any)).toBe('none');

    service.setLaunchQuantize('2bar');
    service.newProject(true);
    expect(service.launchQuantize()).toBe('none');
  });

  it('stores per-cell launch quantization on the pattern slot and undoes it', () => {
    service.tracks.update((list) =>
      list.map((track) => ({
        ...track,
        patternSlots: [
          {
            id: 'slot-a',
            name: 'Verse',
            activeVersionId: 'v1',
            versions: [],
          },
        ],
      })),
    );

    expect(service.setPatternSlotLaunchQuantize('track-1', 'slot-a', '2bar')).toBe(
      true,
    );
    expect(service.tracks()[0].patternSlots?.[0].launchQuantize).toBe('2bar');

    history.undo();
    expect(service.tracks()[0].patternSlots?.[0].launchQuantize).toBeNull();

    expect(
      service.setPatternSlotLaunchQuantize('missing', 'slot-a', '1bar'),
    ).toBe(false);
  });

  it('keeps solo-safe channels audible under another channel solo', () => {
    const base = {
      type: 'midi',
      instrumentId: 'grand-piano',
      muted: false,
      soloed: false,
      volume: 0.8,
      gain: 0.8,
      pan: 0,
      clips: [],
      steps: new Array(64).fill(false),
      fxSlots: [],
      sendA: 0,
      sendB: 0,
      effects: [],
      patternSlots: [],
      activePatternSlotId: null,
      notes: [{ midi: 60, step: 0, length: 1, velocity: 1 }],
    };
    service.tracks.set([
      { ...base, id: 'soloed', name: 'Soloed', soloed: true },
      { ...base, id: 'safe', name: 'Guide', soloSafe: true },
      { ...base, id: 'quiet', name: 'Quiet' },
    ] as any);

    engineMock.triggerAttack.mockClear();
    engineMock.setBaseFaderGain.mockClear();
    service.playStep(0, 0, 0.25);

    const channels = engineMock.setBaseFaderGain.mock.calls.map((call) => call[0]);
    expect(channels).toEqual(expect.arrayContaining(['soloed', 'safe']));
    expect(channels).not.toContain('quiet');
    expect(engineMock.triggerAttack).toHaveBeenCalledTimes(2);
  });

  it('mute wins over solo-safe and the flag is undoable', () => {
    service.tracks.update((tracks) =>
      tracks.map((track) => ({ ...track, soloSafe: false }))
    );
    service.toggleSoloSafe('track-1');
    expect(service.tracks()[0].soloSafe).toBe(true);
    history.undo();
    expect(service.tracks()[0].soloSafe).toBe(false);

    const base = {
      type: 'midi',
      instrumentId: 'grand-piano',
      muted: true,
      soloed: false,
      soloSafe: true,
      volume: 0.8,
      gain: 0.8,
      pan: 0,
      clips: [],
      steps: new Array(64).fill(false),
      fxSlots: [],
      sendA: 0,
      sendB: 0,
      effects: [],
      patternSlots: [],
      activePatternSlotId: null,
      notes: [{ midi: 60, step: 0, length: 1, velocity: 1 }],
    };
    service.tracks.set([
      { ...base, id: 'muted-safe', name: 'Muted safe' },
      { ...base, id: 'soloed', name: 'Soloed', muted: false, soloed: true },
    ] as any);
    engineMock.setBaseFaderGain.mockClear();
    service.playStep(0, 0, 0.25);
    expect(
      engineMock.setBaseFaderGain.mock.calls.map((call) => call[0]),
    ).not.toContain('muted-safe');
  });

  it('glues touching clips into one merged clip span', () => {
    service.tracks.update((tracks) =>
      tracks.map((track) =>
        track.id === 'track-1'
          ? {
              ...track,
              clips: [
                {
                  id: 'clip-1',
                  name: 'Lead Part A',
                  start: 0,
                  length: 4,
                  type: 'midi',
                },
                {
                  id: 'clip-2',
                  name: 'Lead Part B',
                  start: 4,
                  length: 2,
                  type: 'midi',
                },
              ],
            }
          : track
      )
    );

    const mergedId = service.glueClips('track-1', ['clip-1', 'clip-2']);
    const clips = service.tracks()[0].clips;

    expect(mergedId).toBeTruthy();
    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({
      id: mergedId,
      start: 0,
      length: 6,
      type: 'midi',
      name: 'Lead Consolidated',
    });
  });

  it('rejects glue when clips have a gap between them', () => {
    service.tracks.update((tracks) =>
      tracks.map((track) =>
        track.id === 'track-1'
          ? {
              ...track,
              clips: [
                {
                  id: 'clip-1',
                  name: 'Lead A',
                  start: 0,
                  length: 2,
                  type: 'midi',
                },
                {
                  id: 'clip-2',
                  name: 'Lead B',
                  start: 3,
                  length: 2,
                  type: 'midi',
                },
              ],
            }
          : track
      )
    );

    const result = service.glueClips('track-1', ['clip-1', 'clip-2']);

    expect(result).toBeNull();
    expect(service.tracks()[0].clips).toHaveLength(2);
  });

  it('supports undo and redo for glued clips', () => {
    service.tracks.update((tracks) =>
      tracks.map((track) =>
        track.id === 'track-1'
          ? {
              ...track,
              clips: [
                {
                  id: 'clip-1',
                  name: 'Lead',
                  start: 0,
                  length: 4,
                  type: 'midi',
                },
                {
                  id: 'clip-2',
                  name: 'Lead',
                  start: 4,
                  length: 4,
                  type: 'midi',
                },
              ],
            }
          : track
      )
    );

    const mergedId = service.glueClips('track-1', ['clip-1', 'clip-2']);
    expect(service.tracks()[0].clips).toHaveLength(1);

    history.undo();
    expect(service.tracks()[0].clips.map((clip) => clip.id)).toEqual([
      'clip-1',
      'clip-2',
    ]);

    history.redo();
    expect(service.tracks()[0].clips.map((clip) => clip.id)).toEqual([
      mergedId,
    ]);
  });

  it('makes wholesale note replacement undoable (comp, sections, MIDI import)', () => {
    service.replaceTrackNotes(
      'track-1',
      [{ id: 'n1', midi: 60, step: 0, length: 1, velocity: 0.8 }],
      'Apply Comp'
    );

    expect(service.tracks()[0].notes).toHaveLength(1);
    expect(history.getUndoDescription()).toContain('Apply Comp');

    history.undo();
    expect(service.tracks()[0].notes).toHaveLength(0);

    history.redo();
    expect(service.tracks()[0].notes.map((n) => n.id)).toEqual(['n1']);
  });

  it('does not reset the patch or add history when selecting the current instrument', () => {
    const patch = { type: 'triangle', cutoff: 1234 };
    service.tracks.update((tracks) => tracks.map((track) => ({ ...track, synthParams: patch })));
    service.replaceTrackNotes('track-1', [
      { id: 'n1', midi: 60, step: 0, length: 1, velocity: 0.8 },
    ], 'Edit Notes');
    history.undo();
    expect(history.canRedo()).toBe(true);

    service.setInstrument('track-1', 'grand-piano');
    service.setInstrument('track-1', 'grand-piano');

    expect(service.tracks()[0].synthParams).toBe(patch);
    expect(history.undoCount()).toBe(0);
    expect(history.canRedo()).toBe(true);
    history.redo();
    expect(service.tracks()[0].notes.map((note) => note.id)).toEqual(['n1']);
  });

  it('keeps real instrument changes undoable and restores the edited patch', () => {
    const oldPatch = { type: 'triangle', cutoff: 1234 };
    service.tracks.update((tracks) => tracks.map((track) => ({ ...track, synthParams: oldPatch })));
    jest.spyOn(TestBed.inject(InstrumentsService), 'getPresets').mockReturnValue([
      { id: 'lead', name: 'Lead', type: 'synth', category: 'lead', tags: [],
        synth: { type: 'sawtooth', attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.3, cutoff: 800, q: 1 } },
    ]);

    service.setInstrument('track-1', 'lead');
    expect(history.undoCount()).toBe(1);
    expect(service.tracks()[0].instrumentId).toBe('lead');
    expect(service.tracks()[0].synthParams.cutoff).toBe(800);
    history.undo();
    expect(service.tracks()[0].instrumentId).toBe('grand-piano');
    expect(service.tracks()[0].synthParams).toEqual(oldPatch);
    history.redo();
    expect(service.tracks()[0].instrumentId).toBe('lead');
  });

  it('ignores note replacement for an unknown track', () => {
    service.replaceTrackNotes('nope', [
      { id: 'n1', midi: 60, step: 0, length: 1, velocity: 0.8 },
    ]);

    expect(service.tracks()[0].notes).toHaveLength(0);
    expect(history.getUndoDescription()).toBeNull();
  });
});

describe('MusicManagerService pattern slots (channel rack / performance grid)', () => {
  let service: MusicManagerService;
  let history: HistoryService;

  const engineMock = {
    tempo: signal(120),
    visualStep: signal(0),
    setSongLengthSteps: jest.fn(),
    triggerAttack: jest.fn(),
    setBaseFaderGain: jest.fn(),
    updateTrack: jest.fn(),
    onScheduleStep: undefined as any,
  };

  const makeTrack = (overrides: any = {}) => ({
    id: 'track-1',
    name: 'Lead',
    type: 'midi',
    instrumentId: 'grand-piano',
    muted: false,
    soloed: false,
    volume: 0.8,
    gain: 0.8,
    pan: 0,
    clips: [],
    notes: [],
    steps: new Array(64).fill(false),
    fxSlots: [],
    sendA: 0,
    sendB: 0,
    effects: [],
    patternSlots: [],
    activePatternSlotId: null,
    ...overrides,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MusicManagerService,
        HistoryService,
        { provide: AudioEngineService, useValue: engineMock },
        { provide: ProjectService, useValue: { currentProject: signal(null) } },
        { provide: PluginStoreService, useValue: { preload: jest.fn() } },
        { provide: InstrumentsService, useValue: { getPresets: () => [] } },
        { provide: StemSeparationService, useValue: {} },
        { provide: StudioRecordingEngineService, useValue: {} },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        {
          provide: TakeManagerService,
          useValue: { getCompNotesForStepNow: () => [] },
        },
      ],
    });
    service = TestBed.inject(MusicManagerService);
    history = TestBed.inject(HistoryService);
    service.tracks.set([makeTrack()]);
  });

  it('preloads arrangement patterns and schedules preset samples instead of oscillators', async () => {
    const buffer = { duration: 2 } as AudioBuffer;
    const instruments = TestBed.inject(InstrumentsService);
    Object.assign(instruments, {
      isSamplePreset: jest.fn(() => true),
      loadPresetSample: jest.fn(async () => undefined),
      getPresetSample: jest.fn(() => ({ buffer, rate: 2, oneShot: false, release: 0.05 })),
    });
    Object.assign(engineMock, { triggerSampler: jest.fn() });
    engineMock.triggerAttack.mockClear();
    service.tracks.set([makeTrack({
      instrumentId: 'grand-piano',
      notes: [{ id: 'n1', midi: 72, step: 0, length: 2, velocity: 0.7 }],
      clips: [{ id: 'c', type: 'midi', start: 1, length: 4 }],
    })]);
    await (engineMock as any).onPreparePlayback();
    expect((instruments as any).loadPresetSample).toHaveBeenCalledWith('grand-piano', 72, 0.7);
    expect(service.arrangementNotes(service.tracks()[0])[0].step).toBe(16);
    service.playStep(16, 3, 0.25);
    expect((engineMock as any).triggerSampler).toHaveBeenCalledWith(
      'track-1', buffer, 3, 0.7, 0, 0.55, 2, 0, 0.05, 0, 0, 48000, 2, true, 0, [],
    );
    expect(engineMock.triggerAttack).not.toHaveBeenCalled();
  });

  it('captures the current pattern into a fixed scene slot and activates it', () => {
    service.tracks.set([
      makeTrack({
        notes: [{ id: 'n1', midi: 60, step: 0, length: 1, velocity: 0.8 }],
        steps: (() => {
          const s = new Array(64).fill(false);
          s[0] = true;
          return s;
        })(),
      }),
    ]);

    service.capturePatternSlot('track-1', 'slot-3', 'Scene 4');

    const track = service.tracks()[0];
    const slot = track.patternSlots?.find((s) => s.id === 'slot-3');
    expect(slot?.name).toBe('Scene 4');
    expect(slot?.versions[slot.versions.length - 1].notes).toEqual([
      { id: 'n1', midi: 60, step: 0, length: 1, velocity: 0.8 },
    ]);
    expect(slot?.versions[slot.versions.length - 1].steps[0]).toBe(true);
    expect(track.activePatternSlotId).toBe('slot-3');
  });

  it('applies and undoes a batched track patch as one edit', () => {
    service.tracks.set([makeTrack({ fxSlots: [] })]);

    expect(
      service.applyTrackPatch(
        'track-1',
        {
          fxSlots: [
            { id: 'fx-ai', type: 'EQ', params: { high: 3 }, enabled: true },
          ],
        },
        'AI Mix · Lead',
      ),
    ).toBe(true);
    expect(service.tracks()[0].fxSlots?.[0].id).toBe('fx-ai');

    service.history.undo();

    expect(service.tracks()[0].fxSlots ?? []).toEqual([]);
    expect(service.applyTrackPatch('nope', { fxSlots: [] })).toBe(false);
  });

  it('patches an optional field the track never had, and undoes it', () => {
    service.tracks.set([makeTrack()]);
    expect(service.tracks()[0].eqData).toBeUndefined();

    // AI Mix's EQ advice patches eqData onto tracks that ship without one.
    // Undo capture clones each patched key, so an absent key must survive the
    // round trip instead of throwing "undefined is not valid JSON".
    expect(
      service.applyTrackPatch('track-1', {
        eqData: { low: 0, mid: 0, high: 3 },
      }),
    ).toBe(true);
    expect(service.tracks()[0].eqData).toEqual({ low: 0, mid: 0, high: 3 });

    service.history.undo();

    expect(service.tracks()[0].eqData).toBeUndefined();
  });

  it('records aux-send moves while automation write is armed', () => {
    const automation = TestBed.inject(AutomationService);
    const capture = jest.spyOn(automation, 'captureWrite');

    service.updateSend('track-1', 'A', 0.45);
    expect(capture).toHaveBeenCalledWith('track-1', 'sendA', 0.45);
    expect(service.tracks()[0].sendA).toBeCloseTo(0.45, 6);

    service.updateSend('track-1', 'B', 0.2);
    expect(capture).toHaveBeenCalledWith('track-1', 'sendB', 0.2);
    expect(service.tracks()[0].sendB).toBeCloseTo(0.2, 6);

    capture.mockRestore();
  });

  it('launches a captured scene by restoring its notes and steps', () => {
    service.tracks.set([
      makeTrack({
        notes: [{ id: 'n1', midi: 64, step: 4, length: 1, velocity: 0.8 }],
      }),
    ]);
    service.capturePatternSlot('track-1', 'slot-1', 'Scene 2');

    // Move on to different content.
    service.tracks.update((ts) =>
      ts.map((t) => ({
        ...t,
        notes: [{ id: 'n2', midi: 72, step: 8, length: 1, velocity: 0.8 }],
        activePatternSlotId: 'slot-0',
      }))
    );

    service.recallPatternSlot('track-1', 'slot-1');
    expect(service.tracks()[0].notes).toEqual([
      { id: 'n1', midi: 64, step: 4, length: 1, velocity: 0.8 },
    ]);
    expect(service.tracks()[0].activePatternSlotId).toBe('slot-1');
  });

  it('does nothing when recalling a scene that was never captured', () => {
    service.tracks.set([makeTrack({ activePatternSlotId: 'slot-0' })]);
    service.recallPatternSlot('track-1', 'slot-5');
    expect(service.tracks()[0].notes).toEqual([]);
    expect(service.tracks()[0].activePatternSlotId).toBe('slot-0');
  });

  it('undoes a scene capture, restoring the pre-capture pattern', () => {
    service.tracks.set([
      makeTrack({
        notes: [{ id: 'n1', midi: 60, step: 0, length: 1, velocity: 0.8 }],
      }),
    ]);
    service.capturePatternSlot('track-1', 'slot-2', 'Scene 3');

    history.undo();
    expect(service.tracks()[0].patternSlots?.length ?? 0).toBe(0);
    expect(service.tracks()[0].activePatternSlotId).toBeNull();
  });

  it('switching the active scene slot undoes back to the previous slot', () => {
    service.tracks.set([
      makeTrack({
        patternSlots: [
          {
            id: 'slot-0',
            name: 'Pattern 1',
            activeVersionId: 'v1',
            versions: [
              {
                id: 'v1',
                name: 'v1',
                steps: new Array(64).fill(false),
                notes: [],
              },
            ],
          },
        ],
        activePatternSlotId: 'slot-0',
      }),
    ]);

    // Slots must exist to be switched to (the guard prevents dangling ids);
    // give the track a second real slot and switch between them.
    const second = service.createPatternSlot('track-1', 'Verse')!;
    service.setActivePatternSlot('track-1', second);
    expect(service.tracks()[0].activePatternSlotId).toBe(second);
    history.undo();
    expect(service.tracks()[0].activePatternSlotId).toBe('slot-0');
  });

  describe('macro FX slots', () => {
    const withSlots = () =>
      service.tracks.set([
        makeTrack({
          fxSlots: [
            { id: 'fx1', type: 'Reverb', params: {}, enabled: true },
          ],
        }),
      ]);

    it('appends a slot and returns its id', () => {
      withSlots();
      const id = service.addFxSlot('track-1', 'Delay');
      expect(id).toBeTruthy();
      const slots = service.tracks()[0].fxSlots;
      expect(slots).toHaveLength(2);
      expect(slots[1].type).toBe('Delay');
      expect(slots[1].enabled).toBe(true);
      expect(slots[1].params).toEqual({});
    });

    it('undoes an added slot and returns null for an unknown track', () => {
      withSlots();
      service.addFxSlot('track-1', 'Compressor');
      expect(service.tracks()[0].fxSlots).toHaveLength(2);
      history.undo();
      expect(service.tracks()[0].fxSlots).toHaveLength(1);
      expect(service.addFxSlot('nope', 'Reverb')).toBeNull();
    });

    it('removes a slot and restores it on undo', () => {
      withSlots();
      service.removeFxSlot('track-1', 'fx1');
      expect(service.tracks()[0].fxSlots).toHaveLength(0);
      history.undo();
      expect(service.tracks()[0].fxSlots).toHaveLength(1);
      expect(service.tracks()[0].fxSlots[0].id).toBe('fx1');
    });

    it('ignores a removal for a slot that is not there', () => {
      withSlots();
      service.removeFxSlot('track-1', 'missing');
      expect(service.tracks()[0].fxSlots).toHaveLength(1);
    });

    it('writes a parameter value onto the slot', () => {
      withSlots();
      service.setFxSlotParam('track-1', 'fx1', 'decay', 4.2);
      expect(service.tracks()[0].fxSlots[0].params.decay).toBe(4.2);
    });

    it('coalesces a knob gesture so one drag undoes as one step', () => {
      withSlots();
      service.setFxSlotParam('track-1', 'fx1', 'wet', 10);
      service.setFxSlotParam('track-1', 'fx1', 'wet', 20);
      service.setFxSlotParam('track-1', 'fx1', 'wet', 30);
      expect(service.tracks()[0].fxSlots[0].params.wet).toBe(30);

      history.undo();
      // The whole drag is reversed at once, not just the last frame.
      expect(service.tracks()[0].fxSlots[0].params.wet).toBeUndefined();
    });

    it('toggles a slot bypass and undoes it', () => {
      withSlots();
      service.toggleFxSlot('track-1', 'fx1');
      expect(service.tracks()[0].fxSlots[0].enabled).toBe(false);
      history.undo();
      expect(service.tracks()[0].fxSlots[0].enabled).toBe(true);
    });
  });

  describe('per-step observers (AI session musicians)', () => {
    it('notifies a registered observer once per step', () => {
      const observer = jest.fn();
      service.onStep(observer);

      service.playStep(0, 1, 0.25);

      expect(observer).toHaveBeenCalledTimes(1);
      expect(observer).toHaveBeenCalledWith(0, 1, 0.25);
    });

    it('stops notifying after unsubscribe', () => {
      const observer = jest.fn();
      const off = service.onStep(observer);
      service.playStep(0, 1, 0.25);
      off();
      service.playStep(1, 1.25, 0.25);

      expect(observer).toHaveBeenCalledTimes(1);
    });

    it('renders the arrangement before the observers', () => {
      // The AI layer improvises *on top of* what the artist wrote: a generated
      // note must never land before (or instead of) the arranged part.
      const order: string[] = [];
      service.tracks.set([
        makeTrack({
          notes: [{ step: 0, midi: 60, length: 1, velocity: 0.8 }],
        }),
      ]);
      engineMock.triggerAttack.mockImplementation(() => order.push('arranged'));
      service.onStep(() => order.push('ai'));

      service.playStep(0, 1, 0.25);

      expect(order).toEqual(['arranged', 'ai']);
    });

    it('hands observers the swung time, not the raw grid time', () => {
      const observer = jest.fn();
      service.tracks.set([
        makeTrack({
          id: MusicManagerService.DRUM_TRACK_ID,
          type: 'drum',
          swingAmount: 0.4,
        }),
      ]);
      service.onStep(observer);

      service.playStep(1, 1, 0.25);

      // Step 1 is an offbeat: swingOffset * duration * 0.5 = 0.4 * 0.125.
      expect(observer).toHaveBeenCalledWith(1, 1.05, 0.25);
    });

    it('isolates a throwing observer so the transport keeps rendering', () => {
      const good = jest.fn();
      service.onStep(() => {
        throw new Error('bad AI part');
      });
      service.onStep(good);

      expect(() => service.playStep(0, 1, 0.25)).not.toThrow();
      expect(good).toHaveBeenCalledTimes(1);
    });

    it('supports several independent observers', () => {
      const first = jest.fn();
      const second = jest.fn();
      service.onStep(first);
      service.onStep(second);

      service.playStep(4, 2, 0.25);

      expect(first).toHaveBeenCalledWith(4, 2, 0.25);
      expect(second).toHaveBeenCalledWith(4, 2, 0.25);
    });
  });

  describe('sub-grid note timing (1/32 and 1/8T snaps)', () => {
    const scheduledTimeOf = (call: unknown[] | undefined) => call?.[2] as number;

    it('plays a half-step (1/32) note half a step late, not a step early', () => {
      // The 1/32 instrument snap stores step = x.5. The step gate floors that
      // to the surrounding step, so the fraction must be carried into the
      // schedule time or the note sounds on the wrong side of the grid.
      service.tracks.set([
        makeTrack({
          notes: [{ id: 'half', midi: 60, step: 4.5, length: 0.5, velocity: 0.8 }],
        }),
      ]);
      engineMock.triggerAttack.mockClear();

      service.playStep(4, 10, 0.25);

      expect(engineMock.triggerAttack).toHaveBeenCalledTimes(1);
      expect(scheduledTimeOf(engineMock.triggerAttack.mock.calls[0])).toBeCloseTo(
        10.125,
        6,
      );
    });

    it('plays a 1/8T triplet note a third of a step late', () => {
      service.tracks.set([
        makeTrack({
          notes: [{ id: 'trip', midi: 62, step: 4 + 4 / 3, length: 4 / 3, velocity: 0.8 }],
        }),
      ]);
      engineMock.triggerAttack.mockClear();

      service.playStep(5, 20, 0.3);

      expect(engineMock.triggerAttack).toHaveBeenCalledTimes(1);
      expect(scheduledTimeOf(engineMock.triggerAttack.mock.calls[0])).toBeCloseTo(
        20 + (4 / 3 - 1) * 0.3,
        6,
      );
    });

    it('still schedules an on-grid note exactly on its step', () => {
      service.tracks.set([
        makeTrack({
          notes: [{ id: 'grid', midi: 64, step: 8, length: 1, velocity: 0.8 }],
        }),
      ]);
      engineMock.triggerAttack.mockClear();

      service.playStep(8, 30, 0.25);

      expect(engineMock.triggerAttack).toHaveBeenCalledTimes(1);
      expect(scheduledTimeOf(engineMock.triggerAttack.mock.calls[0])).toBe(30);
    });
  });
});

/**
 * Mirrors the slice of DynamicEffectsRack the macro FX chain drives, including
 * its append-on-create ordering, so the wiring can be asserted without a real
 * (node-building) rack.
 */
class FakeRack {
  inserts: Array<{
    id: string;
    plugin: {
      id: string;
      enabled: boolean;
      params: Array<{ id: string; value: number }>;
      setParam: jest.Mock;
    };
  }> = [];
  private seq = 0;

  addInsert(pluginId: string) {
    const entry = {
      id: `ins${++this.seq}`,
      plugin: {
        id: pluginId,
        enabled: true,
        // The knobs the panel exposes for an insert; the manager binds stored
        // slot values onto these.
        params: [
          { id: 'wet', value: 60 },
          { id: 'decay', value: 2.5 },
        ],
        setParam: jest.fn(),
      },
    };
    this.inserts.push(entry);
    return entry;
  }

  removeInsert(id: string) {
    this.inserts = this.inserts.filter((s) => s.id !== id);
  }

  moveInsert(id: string, index: number) {
    const i = this.inserts.findIndex((s) => s.id === id);
    if (i < 0) return;
    const [entry] = this.inserts.splice(i, 1);
    this.inserts.splice(Math.max(0, Math.min(index, this.inserts.length)), 0, entry);
  }

  toggleInsert(id: string) {
    const entry = this.inserts.find((s) => s.id === id);
    if (entry) entry.plugin.enabled = !entry.plugin.enabled;
  }
}

/**
 * The rack's Add Effect menu wrote `fxSlots` records that never reached an
 * AudioNode, so every effect it offered — Chorus included — was inaudible.
 */
describe('MusicManagerService macro FX slots (rack wiring)', () => {
  let service: MusicManagerService;
  let history: HistoryService;
  let rack: FakeRack;

  const makeTrack = (overrides: any = {}) => ({
    id: 'track-1',
    name: 'Lead',
    type: 'midi',
    instrumentId: 'grand-piano',
    muted: false,
    soloed: false,
    volume: 0.8,
    gain: 0.8,
    pan: 0,
    clips: [],
    notes: [],
    steps: new Array(64).fill(false),
    fxSlots: [],
    sendA: 0,
    sendB: 0,
    effects: [],
    patternSlots: [],
    activePatternSlotId: null,
    ...overrides,
  });

  const pluginIds = () => rack.inserts.map((s) => s.plugin.id);

  beforeEach(() => {
    rack = new FakeRack();
    const engineMock = {
      tempo: signal(120),
      visualStep: signal(0),
      setSongLengthSteps: jest.fn(),
      triggerAttack: jest.fn(),
    setBaseFaderGain: jest.fn(),
      onScheduleStep: undefined as any,
      getTrackEffectsRack: jest.fn(() => rack),
    };

    TestBed.configureTestingModule({
      providers: [
        MusicManagerService,
        HistoryService,
        // Rack-wiring tests run against a desktop profile so the device cap
        // does not mask insert ordering/undo behavior.
        {
          provide: StudioDeviceProfileService,
          useValue: {
            budget: () => ({
              maxVoices: 32,
              maxActiveEffects: 8,
              maxTracks: 24,
            }),
          },
        },
        { provide: AudioEngineService, useValue: engineMock },
        { provide: ProjectService, useValue: { currentProject: signal(null) } },
        { provide: PluginStoreService, useValue: { preload: jest.fn() } },
        { provide: InstrumentsService, useValue: { getPresets: () => [] } },
        { provide: StemSeparationService, useValue: {} },
        { provide: StudioRecordingEngineService, useValue: {} },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        {
          provide: TakeManagerService,
          useValue: { getCompNotesForStepNow: () => [] },
        },
      ],
    });
    service = TestBed.inject(MusicManagerService);
    history = TestBed.inject(HistoryService);
    service.tracks.set([makeTrack()]);
  });

  it('adds a Chorus from the Add Effect menu as a real insert', () => {
    const id = service.addFxSlot('track-1', 'Chorus');

    expect(id).toBeTruthy();
    expect(pluginIds()).toEqual(['smuve.chorus.v1']);
  });

  it('maps every effect the menu offers that has a plugin behind it', () => {
    for (const type of [
      'Reverb',
      'Delay',
      'Compressor',
      'EQ',
      'Saturation',
      'Chorus',
    ]) {
      service.addFxSlot('track-1', type);
    }

    expect(pluginIds()).toEqual([
      'smuve.reverb.v1',
      'smuve.delay.v1',
      'smuve.compressor.v1',
      'smuve.eq.v1',
      'smuve.distortion.v1',
      'smuve.chorus.v1',
    ]);
  });

  it('pushes a slot knob onto the live plugin, on add and on every edit', () => {
    service.addFxSlot('track-1', 'Reverb');
    const slotId = service.tracks()[0].fxSlots[0].id;
    const plugin = rack.inserts[0].plugin;

    service.setFxSlotParam('track-1', slotId, 'wet', 70);
    expect(plugin.setParam).toHaveBeenCalledWith('wet', 70);

    // A second edit must reach the plugin as well — the sync runs per write,
    // not only when the insert is created.
    service.setFxSlotParam('track-1', slotId, 'decay', 4);
    expect(plugin.setParam).toHaveBeenCalledWith('decay', 4);
  });

  it('leaves a slot with no plugin behind it data-only', () => {
    service.addFxSlot('track-1', 'Filter');

    expect(rack.inserts).toHaveLength(0);
    expect(service.tracks()[0].fxSlots).toHaveLength(1);
  });

  it('removes the insert when its slot goes away', () => {
    service.addFxSlot('track-1', 'Chorus');
    const slotId = service.tracks()[0].fxSlots[0].id;

    service.removeFxSlot('track-1', slotId);

    expect(rack.inserts).toHaveLength(0);
  });

  it('undoing an add releases the insert too', () => {
    service.addFxSlot('track-1', 'Chorus');
    expect(rack.inserts).toHaveLength(1);

    history.undo();

    expect(rack.inserts).toHaveLength(0);
  });

  it('mirrors a slot bypass onto its plugin, and back on undo', () => {
    service.addFxSlot('track-1', 'Chorus');
    const slotId = service.tracks()[0].fxSlots[0].id;
    expect(rack.inserts[0].plugin.enabled).toBe(true);

    service.toggleFxSlot('track-1', slotId);
    expect(rack.inserts[0].plugin.enabled).toBe(false);

    history.undo();
    expect(rack.inserts[0].plugin.enabled).toBe(true);
  });

  it('seats inserts in the order the slots are displayed in', () => {
    service.tracks.set([
      makeTrack({
        fxSlots: [
          { id: 'fx1', type: 'Reverb', params: {}, enabled: true },
          { id: 'fx2', type: 'Chorus', params: {}, enabled: true },
          { id: 'fx3', type: 'EQ', params: {}, enabled: true },
        ],
      }),
    ]);

    service.toggleFxSlot('track-1', 'fx3');

    expect(pluginIds()).toEqual([
      'smuve.reverb.v1',
      'smuve.chorus.v1',
      'smuve.eq.v1',
    ]);
    // Only the toggled slot is bypassed; the chain order is untouched.
    expect(rack.inserts.map((s) => s.plugin.enabled)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('re-seats a slot an undo puts back in front of the chain', () => {
    service.tracks.set([
      makeTrack({
        fxSlots: [
          { id: 'fx1', type: 'Reverb', params: {}, enabled: true },
          { id: 'fx2', type: 'Chorus', params: {}, enabled: true },
        ],
      }),
    ]);
    service.toggleFxSlot('track-1', 'fx1');
    service.removeFxSlot('track-1', 'fx1');
    expect(pluginIds()).toEqual(['smuve.chorus.v1']);

    history.undo();

    // Re-created inserts append, so they must be re-seated to the slot order.
    expect(pluginIds()).toEqual(['smuve.reverb.v1', 'smuve.chorus.v1']);
    expect(rack.inserts.map((s) => s.plugin.enabled)).toEqual([false, true]);
  });

  it('picks up a chain written outside the manager (AI / neural mixer path)', () => {
    service.tracks.update((ts) =>
      ts.map((t) => ({
        ...t,
        fxSlots: [{ id: 'ai1', type: 'Chorus', params: {}, enabled: true }],
      })),
    );
    expect(rack.inserts).toHaveLength(0);

    service.syncTrackFxChain('track-1');

    expect(pluginIds()).toEqual(['smuve.chorus.v1']);
  });
});

describe('MusicManagerService recording teardown', () => {
  const configure = (
    engine: unknown,
    audioEngineOverrides: Record<string, unknown> = {},
  ) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        MusicManagerService,
        HistoryService,
        {
          provide: AudioEngineService,
          useValue: {
            tempo: signal(120),
            visualStep: signal(0),
            setSongLengthSteps: jest.fn(),
            triggerAttack: jest.fn(),
            setBaseFaderGain: jest.fn(),
            ...audioEngineOverrides,
          },
        },
        { provide: ProjectService, useValue: { currentProject: signal(null) } },
        { provide: PluginStoreService, useValue: { preload: jest.fn() } },
        { provide: InstrumentsService, useValue: { getPresets: () => [] } },
        { provide: StemSeparationService, useValue: {} },
        { provide: StudioRecordingEngineService, useValue: engine },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        { provide: TakeManagerService, useValue: { getCompNotesForStepNow: () => [] } },
      ],
    });
    return TestBed.inject(MusicManagerService);
  };

  it('resolves stopRecording only once the engine has flushed and persisted the take', async () => {
    let release!: () => void;
    const engine = {
      stopRecording: jest.fn(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      ),
    };
    const service = configure(engine);

    let settled = false;
    const pending = service.stopRecording('track-1').then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(engine.stopRecording).toHaveBeenCalledTimes(1);
    // The promise used to resolve instantly while the take was still in flight.
    expect(settled).toBe(false);

    release();
    await pending;
    expect(settled).toBe(true);
  });

  it('resolves without throwing when the engine cannot stop', async () => {
    const service = configure({});

    await expect(service.stopRecording('track-1')).resolves.toBeNull();
  });

  it('places a finished pass on its destination track as an audio clip', () => {
    const service = configure({});
    service.tracks.set([
      { id: 'track-1', name: 'Lead', clips: [], notes: [], steps: [] } as any,
    ]);
    const buffer = { duration: 2 } as AudioBuffer;

    const placement = service.placeRecordedTake({
      trackId: 'track-1',
      name: 'Take 10:00:00',
      buffer,
      startStep: 32, // bar 2
      tempo: 120,
    });

    expect(placement).toEqual({
      trackId: 'track-1',
      trackName: 'Lead',
      clipId: expect.any(String),
      startBar: 2,
      lengthBars: 1,
    });
    const clip = service.tracks()[0].clips[0] as any;
    expect(clip).toMatchObject({
      name: 'Take 10:00:00',
      start: 2,
      length: 1,
      type: 'audio',
      audioRefId: placement!.clipId,
      clipGain: 1,
    });
    // The clip resolves its PCM through the reference cache, which is what
    // playback, save/restore and stem export all read.
    expect(service.stemAudioCache.get(placement!.clipId)).toBe(buffer);

    TestBed.inject(HistoryService).undo();
    expect(service.tracks()[0].clips).toHaveLength(0);
  });

  it('trims the pre-roll from the WAV head before caching the clip', () => {
    const pcm = new Float32Array([1, 2, 3, 4]);
    const copyToChannel = jest.fn();
    const trimmed = { copyToChannel, duration: 3 / 48000 };
    const service = configure({}, {
      ctx: { createBuffer: jest.fn(() => trimmed) },
    });
    service.tracks.set([
      { id: 'track-1', name: 'Lead', clips: [], notes: [], steps: [] } as any,
    ]);
    const buffer = {
      duration: 4 / 48000,
      length: 4,
      numberOfChannels: 1,
      sampleRate: 48000,
      getChannelData: jest.fn(() => pcm),
    } as unknown as AudioBuffer;

    const placement = service.placeRecordedTake({
      trackId: 'track-1',
      name: 'Take',
      buffer,
      startStep: 0,
      tempo: 120,
      trimSeconds: 1 / 48000,
    });

    // One leading sample dropped, the rest copied into the cached take.
    expect(copyToChannel).toHaveBeenCalledWith(pcm.subarray(1), 0);
    expect(service.stemAudioCache.get(placement!.clipId)).toBe(trimmed);
  });

  it('leaves the arrangement untouched when the destination track is gone', () => {
    const service = configure({});
    const placement = service.placeRecordedTake({
      trackId: 'missing',
      name: 'Take',
      buffer: { duration: 1 } as AudioBuffer,
      startStep: 0,
      tempo: 120,
    });
    expect(placement).toBeNull();
    expect(service.tracks()).toHaveLength(0);
  });
});

/**
 * The live plugin chain is hosted by the audio thread, so the manager's job is
 * only to hand the engine a provider it can poll and to release the insert when
 * the track goes away.
 */
describe('MusicManagerService live plugin insert wiring', () => {
  const slot = {
    id: 'smuve.saturation.v2',
    kernel: 'saturate',
    params: new Float32Array([0.4, 1, 0]),
  };

  const installTrackPluginInsert = jest.fn();
  const releaseTrackPluginInsert = jest.fn();
  const liveInsertSlot = jest.fn(() => slot);
  const preload = jest.fn();

  let service: MusicManagerService;
  let history: HistoryService;

  const makeTrack = () => ({
    id: 'track-1',
    name: 'Lead',
    type: 'midi',
    instrumentId: 'grand-piano',
    muted: false,
    soloed: false,
    volume: 0.8,
    gain: 0.8,
    pan: 0,
    clips: [],
    notes: [],
    steps: new Array(64).fill(false),
    fxSlots: [],
    pluginIds: [] as string[],
    sendA: 0,
    sendB: 0,
    effects: [],
    patternSlots: [],
    activePatternSlotId: null,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    liveInsertSlot.mockReturnValue(slot);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        MusicManagerService,
        HistoryService,
        {
          provide: AudioEngineService,
          useValue: {
            tempo: signal(120),
            visualStep: signal(0),
            setSongLengthSteps: jest.fn(),
            triggerAttack: jest.fn(),
            setBaseFaderGain: jest.fn(),
            installTrackPluginInsert,
            releaseTrackPluginInsert,
            removeTrackRouting: jest.fn(),
            setTrackBus: jest.fn(),
          },
        },
        { provide: ProjectService, useValue: { currentProject: signal(null) } },
        { provide: PluginStoreService, useValue: { preload, liveInsertSlot } },
        { provide: InstrumentsService, useValue: { getPresets: () => [] } },
        { provide: StemSeparationService, useValue: {} },
        { provide: StudioRecordingEngineService, useValue: {} },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        {
          provide: TakeManagerService,
          useValue: { getCompNotesForStepNow: () => [] },
        },
      ],
    });

    service = TestBed.inject(MusicManagerService);
    history = TestBed.inject(HistoryService);
    service.tracks.set([makeTrack()]);
  });

  it('installs the track insert with a provider that resolves slots through the store', () => {
    service.setTrackPlugins('track-1', ['smuve.saturation.v2']);

    expect(preload).toHaveBeenCalledWith(['smuve.saturation.v2']);
    const [trackId, ids, provider] = installTrackPluginInsert.mock.calls[0];
    expect(trackId).toBe('track-1');
    expect(ids).toEqual(['smuve.saturation.v2']);
    expect(provider(['smuve.saturation.v2'])).toEqual([slot]);
  });

  it('reinstalls the previous chain when the edit is undone', () => {
    service.setTrackPlugins('track-1', ['smuve.saturation.v2']);
    installTrackPluginInsert.mockClear();

    history.undo();

    const [trackId, ids, provider] = installTrackPluginInsert.mock.calls[0];
    expect(trackId).toBe('track-1');
    expect(ids).toEqual([]);
    expect(provider([])).toEqual([]);
  });

  it('releases the live insert when a track is deleted, and restores it on undo', () => {
    service.tracks.set([{ ...makeTrack(), pluginIds: ['smuve.saturation.v2'] }]);

    service.removeTrack('track-1');

    expect(releaseTrackPluginInsert).toHaveBeenCalledWith('track-1');

    history.undo();

    const [trackId, ids] = installTrackPluginInsert.mock.calls[0];
    expect(trackId).toBe('track-1');
    expect(ids).toEqual(['smuve.saturation.v2']);
    expect(service.tracks().map((t) => t.id)).toEqual(['track-1']);
  });

  it('reports the last occupied bar so song length follows the arrangement', () => {
    service.addAudioTrack({
      id: 'track-far',
      name: 'Outro',
      color: '#0E7C7B',
      buffer: { duration: 4, sampleRate: 48000, numberOfChannels: 1 } as AudioBuffer,
      offset: 0,
    });
    service.addClipToTrack('track-far', {
      start: 90,
      length: 4,
      name: 'Far clip',
    });

    expect(service.arrangementEndBar()).toBe(94);
  });

  it('captures a scene into an undoable arrangement block', () => {
    const base = service.tracks()[0];
    service.tracks.set([
      {
        ...base,
        activePatternSlotId: 'slot-a',
        steps: [true],
        patternSlots: [
          {
            id: 'slot-a',
            name: 'Verse Keys',
            activeVersionId: 'v1',
            versions: [{ id: 'v1', steps: [true], notes: [] }],
          },
        ],
      } as any,
    ]);

    expect(service.appendSceneToArrangement(0, 4)).toBe(1);

    const clip = service.tracks()[0].clips[0];
    expect(clip).toMatchObject({
      start: 0,
      length: 4,
      name: 'Verse Keys',
      type: 'midi',
      patternSlotId: 'slot-a',
    });
    expect(service.arrangementEndBar()).toBe(4);

    history.undo();
    expect(service.tracks()[0].clips).toHaveLength(0);
  });

  it('stamps clipStreamer admission fields on addAudioTrack and dispatches streamed vs classic clips in playStep', () => {
    const triggerSampler = jest.fn();
    (service as any).engine.triggerSampler = triggerSampler;
    (service as any).engine.calculatePlaybackRate = jest.fn(() => 1);

    const mockBuffer = {
      duration: 12,
      sampleRate: 48000,
      numberOfChannels: 1,
    } as AudioBuffer;
    const streamer = {
      setPlayhead: jest.fn(),
      getResidentBuffer: jest.fn(() => mockBuffer),
      advancePlayhead: jest.fn(),
      getSampleRate: jest.fn(() => 48000),
      getChannelCount: jest.fn(() => 1),
    } as any;

    service.addAudioTrack({
      id: 'track-streamed',
      name: 'Streamed Stem',
      color: '#0E7C7B',
      buffer: mockBuffer,
      offset: 0,
      clipStreamer: streamer,
      clipOriginSeconds: 1.5,
      clipLengthSeconds: 12,
      clipSampleRate: 48000,
      clipChannels: 1,
      reversed: false,
      clipGain: 1.0,
      importReversedFlag: false,
    });

    // Verify the streamed clip still carries clipStreamer after construction so
    // playStep can dispatch through the streamer path.
    expect(service.tracks().find((t) => t.id === 'track-streamed')!.clips[0].clipStreamer).toBe(streamer);

    const added = service.tracks().find((t) => t.id === 'track-streamed')!;
    const clip: any = added.clips[0];
    expect(clip.clipStreamer).toBe(streamer);
    expect(clip.clipOriginSeconds).toBe(1.5);
    expect(clip.clipLengthSeconds).toBe(12);
    expect(clip.clipSampleRate).toBe(48000);
    expect(clip.clipChannels).toBe(1);

    service.playStep(0, 0.5, 0.125);
    expect(streamer.setPlayhead).toHaveBeenCalledWith(1.5 * 48000);
    expect(triggerSampler).toHaveBeenCalledWith(
      'track-streamed',
      streamer,
      0.5,
      1.0,
      0,
      expect.any(Number),
      1,
      0,
      0,
      1.5,
      12,
      48000,
      1,
      true,
      0,
      [],
      'linear'
    );

    // Classic short clip (no clipStreamer) still triggers with its AudioBuffer
    triggerSampler.mockClear();
    service.addAudioTrack({
      id: 'track-classic',
      name: 'Short Hit',
      color: '#E11D48',
      buffer: mockBuffer,
      offset: 0,
      clipStreamer: null,
      reversed: false,
      clipGain: 1.0,
    });
    service.playStep(0, 1.0, 0.125);
    expect(triggerSampler).toHaveBeenCalledWith(
      'track-classic',
      mockBuffer,
      1.0,
      1.0,
      0,
      expect.any(Number),
      1,
      0,
      0,
      0,
      expect.any(Number),
      48000,
      2,
      true,
      0,
      [],
      'linear'
    );

    // Reversed classic clip (no clipStreamer) — engine.reverseBuffer flips the
    // source buffer and triggerSampler receives the reversed AudioBuffer.
    triggerSampler.mockClear();
    const classicClipId = service.tracks().find((t) => t.id === 'track-classic')!.clips[0].id;
    service.updateClip('track-classic', classicClipId, { reversed: true });
    const mockReversedBuffer = {
      duration: 12,
      sampleRate: 48000,
      numberOfChannels: 1,
      getChannelData: jest.fn((channelIndex: number) =>
        mockBuffer.getChannelData(channelIndex).slice().reverse()
      ),
    } as any;
    (service as any).engine.reverseBuffer = jest.fn(
      (source: AudioBuffer, channelFactory: (channelIndex: number, src: AudioBuffer) => Float32Array) =>
        mockReversedBuffer
    );

    service.playStep(0, 1.0, 0.125);
    expect((service as any).engine.reverseBuffer).toHaveBeenCalledWith(
      mockBuffer,
      expect.any(Function)
    );
    expect(triggerSampler).toHaveBeenCalledWith(
      'track-classic',
      mockReversedBuffer,
      1.0,
      1.0,
      0,
      expect.any(Number),
      1,
      0,
      0,
      0,
      expect.any(Number),
      48000,
      2,
      true,
      0,
      [],
      'linear'
    );
  });

  it('resumes buffered and streamed clips at the seek position without retriggering on later ticks', () => {
    const triggerSampler = jest.fn();
    (service as any).engine.triggerSampler = triggerSampler;
    (service as any).engine.calculatePlaybackRate = jest.fn(() => 2);
    const buffer = { duration: 20 } as AudioBuffer;
    const streamer = { setPlayhead: jest.fn(), getResidentBuffer: jest.fn(), advancePlayhead: jest.fn() } as any;
    service.tracks.set([
      { ...makeTrack(), id: 'buffered', type: 'audio', clips: [{ id: 'a', type: 'audio', start: 1, length: 4, audioData: buffer, offset: 1, fadeIn: 2 }] },
      { ...makeTrack(), id: 'streamed', type: 'audio', clips: [{ id: 'b', type: 'audio', start: 1, length: 4, clipStreamer: streamer, clipOriginSeconds: 3, clipLengthSeconds: 8, clipSampleRate: 48000, clipChannels: 2 }] },
    ] as any);
    service.playStep(24, 5, 0.125, 24, true);
    expect(triggerSampler).toHaveBeenCalledTimes(2);
    expect(triggerSampler).toHaveBeenCalledWith('buffered', buffer, 5, 1, 0, 7, 2, 4, 0, 3, 7, 48000, 2, true, 1, [], 'linear');
    expect(triggerSampler).toHaveBeenCalledWith('streamed', streamer, 5, 1, 0, 7, 2, 0, 0, 5, 8, 48000, 2, true, 1, [], 'linear');
    expect(streamer.setPlayhead).toHaveBeenCalledWith(5 * 48000);
    triggerSampler.mockClear();
    service.playStep(25, 5.125, 0.125);
    expect(triggerSampler).not.toHaveBeenCalled();
  });

  it('applies clip-level gain to streamed clips exactly as to buffered clips', () => {
    // The offline bounce applies clipGain to every audio clip. Live playback
    // used to pass bare track gain for streamed clips, so a long imported take
    // with clipGain 0.5 played at full level but bounced at half.
    const triggerSampler = jest.fn();
    (service as any).engine.triggerSampler = triggerSampler;
    (service as any).engine.calculatePlaybackRate = jest.fn(() => 1);
    const setBaseFaderGain = (service as any).engine.setBaseFaderGain as jest.Mock;
    setBaseFaderGain.mockClear();

    const mockBuffer = {
      duration: 12,
      sampleRate: 48000,
      numberOfChannels: 1,
      getChannelData: jest.fn(() => new Float32Array(1)),
    } as any;
    const streamer = {
      setPlayhead: jest.fn(),
      getResidentBuffer: jest.fn(() => mockBuffer),
      advancePlayhead: jest.fn(),
      getSampleRate: jest.fn(() => 48000),
      getChannelCount: jest.fn(() => 1),
    } as any;

    service.addAudioTrack({
      id: 'streamed-gain',
      name: 'Long Take',
      color: '#0E7C7B',
      buffer: mockBuffer,
      offset: 0,
      clipStreamer: streamer,
      clipOriginSeconds: 0,
      clipLengthSeconds: 12,
      clipSampleRate: 48000,
      clipChannels: 1,
      clipGain: 0.5,
    });

    // The streamed clip must keep the clip gain the bounce will read.
    const streamedClip = (service.tracks().find((t) => t.id === 'streamed-gain')!
      .clips[0] as any);
    expect(streamedClip.clipGain).toBe(0.5);
    expect(streamedClip.reversed).toBeUndefined();

    service.playStep(0, 0.5, 0.125);
    // Track gain is applied once, on the fader, exactly like the bounce's
    // channel gain; the voice peak carries clip gain only.
    expect(setBaseFaderGain).toHaveBeenCalledWith('streamed-gain', 0.8);
    expect(triggerSampler).toHaveBeenCalledWith(
      'streamed-gain',
      streamer,
      0.5,
      0.5,
      0,
      expect.any(Number),
      1,
      0,
      0,
      0,
      12,
      48000,
      1,
      true,
      0,
      [],
      'linear'
    );

    triggerSampler.mockClear();
    service.addAudioTrack({
      id: 'buffered-gain',
      name: 'Short Take',
      color: '#E11D48',
      buffer: mockBuffer,
      offset: 0,
      clipStreamer: null,
      clipGain: 0.5,
    });
    service.playStep(0, 1.0, 0.125);
    // Same split as the streamed path above: fader = track gain, peak = clip
    // gain — so live level matches the 0.8 × 0.5 bounce.
    expect(setBaseFaderGain).toHaveBeenCalledWith('buffered-gain', 0.8);
    expect(triggerSampler).toHaveBeenCalledWith(
      'buffered-gain',
      mockBuffer,
      1.0,
      0.5,
      0,
      expect.any(Number),
      1,
      0,
      0,
      0,
      expect.any(Number),
      48000,
      2,
      true,
      0,
      [],
      'linear'
    );
  });

  it('plays an imported one-shot pad note through the sampler, not the synth', () => {
    const triggerSampler = jest.fn();
    (service as any).engine.triggerSampler = triggerSampler;
    const triggerAttack = (service as any).engine.triggerAttack as jest.Mock;
    triggerAttack.mockClear();
    const sample = { duration: 0.42, sampleRate: 48000 } as AudioBuffer;

    service.tracks.update((tracks) =>
      tracks.map((t) =>
        t.id === 'track-1'
          ? {
              ...t,
              notes: [
                {
                  id: 'n1',
                  step: 0,
                  midi: 36,
                  velocity: 0.75,
                  length: 1,
                  params: { sampleBuffer: sample },
                },
              ] as any,
            }
          : t
      )
    );

    service.playStep(0, 0, 0.125);

    expect(triggerSampler).toHaveBeenCalledWith(
      'track-1',
      sample,
      0,
      0.75,
      0,
      0.42,
      1, 0, 0, 0, 0, 48000, 2, true, 0, [],
    );
    expect(triggerAttack).not.toHaveBeenCalled();
  });

  it('resolves a restored one-shot by sample reference when the buffer was stripped from JSON', () => {
    const triggerSampler = jest.fn();
    (service as any).engine.triggerSampler = triggerSampler;
    const triggerAttack = (service as any).engine.triggerAttack as jest.Mock;
    triggerAttack.mockClear();
    const sample = { duration: 0.5, sampleRate: 48000 } as AudioBuffer;
    service.stemAudioCache.set('drum-sample-ref', sample);

    service.tracks.update((tracks) =>
      tracks.map((t) =>
        t.id === 'track-1'
          ? {
              ...t,
              notes: [
                {
                  id: 'n2',
                  step: 0,
                  midi: 36,
                  velocity: 0.8,
                  length: 1,
                  params: { sampleRefId: 'drum-sample-ref', sampleBuffer: {} },
                },
              ] as any,
            }
          : t
      )
    );

    service.playStep(0, 0, 0.125);

    expect(triggerSampler).toHaveBeenCalledWith(
      'track-1',
      sample,
      0,
      0.8,
      0,
      0.5,
      1, 0, 0, 0, 0, 48000, 2, true, 0, [],
    );
    expect(triggerAttack).not.toHaveBeenCalled();
    service.stemAudioCache.delete('drum-sample-ref');
  });

  it('applies track gain once, on the fader, for note voices too', () => {
    const triggerAttack = (service as any).engine.triggerAttack as jest.Mock;
    const setBaseFaderGain = (service as any).engine.setBaseFaderGain as jest.Mock;
    triggerAttack.mockClear();
    setBaseFaderGain.mockClear();

    service.tracks.update((tracks) =>
      tracks.map((t) =>
        t.id === 'track-1'
          ? {
              ...t,
              gain: 0.5,
              notes: [
                { id: 'n1', step: 0, midi: 60, velocity: 0.75, length: 1 },
              ] as any,
            }
          : t
      )
    );

    service.playStep(0, 0, 0.125);

    // The fader carries the track gain (the bounce's channel gain); folding it
    // into the voice peak as well squared the live level once a fader moved.
    expect(setBaseFaderGain).toHaveBeenCalledWith('track-1', 0.5);
    expect(triggerAttack).toHaveBeenCalledWith(
      'track-1',
      expect.any(Number),
      0,
      0.75,
      expect.any(Number),
      1.0,
      0,
      0,
      0,
      undefined
    );
  });
});

describe('MusicManagerService per-scene follow rules', () => {
  let service: MusicManagerService;

  const engineMock = {
    tempo: signal(120),
    visualStep: signal(0),
    setSongLengthSteps: jest.fn(),
    triggerAttack: jest.fn(),
    setBaseFaderGain: jest.fn(),
    stop: jest.fn(),
    onScheduleStep: undefined as any,
    setPlayMode: jest.fn(),
  };

  /** Two scene columns with material so follow has somewhere to go. */
  const sceneTrack = () => ({
    id: 'track-1',
    name: 'Keys',
    type: 'midi',
    instrumentId: 'grand-piano',
    muted: false,
    soloed: false,
    volume: 0.8,
    gain: 0.8,
    pan: 0,
    clips: [],
    notes: [],
    steps: new Array(64).fill(false),
    fxSlots: [],
    sendA: 0,
    sendB: 0,
    effects: [],
    activePatternSlotId: 'slot-0',
    patternSlots: [0, 1].map((index) => {
      const steps = new Array(64).fill(false);
      steps[0] = true;
      return {
        id: `slot-${index}`,
        name: `Scene ${index + 1}`,
        activeVersionId: `v${index}`,
        versions: [{ id: `v${index}`, steps, notes: [] }],
      };
    }),
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MusicManagerService,
        HistoryService,
        { provide: AudioEngineService, useValue: engineMock },
        { provide: ProjectService, useValue: { currentProject: signal(null) } },
        { provide: PluginStoreService, useValue: { preload: jest.fn() } },
        { provide: InstrumentsService, useValue: { getPresets: () => [] } },
        { provide: StemSeparationService, useValue: {} },
        { provide: StudioRecordingEngineService, useValue: {} },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        {
          provide: TakeManagerService,
          useValue: { getCompNotesForStepNow: () => [] },
        },
      ],
    });
    service = TestBed.inject(MusicManagerService);
    service.tracks.set([sceneTrack()]);
  });

  const advanceBars = (bars: number) => {
    for (let bar = 0; bar < bars; bar++) {
      (service as any).advanceSceneFollow(0);
    }
  };

  it('clamps an advance rule and clears it back to the global setting', () => {
    expect(service.setSceneFollowRule(1, { mode: 'advance', bars: 99 })).toEqual({
      mode: 'advance',
      bars: 32,
    });
    // Stored against the scene's identity, not its position.
    expect(service.sceneIdentity(1)).toBe('slot-1');
    expect(service.sceneFollowRules()).toEqual({
      'slot-1': { mode: 'advance', bars: 32 },
    });

    expect(service.setSceneFollowRule(1, null)).toBeNull();
    expect(service.sceneFollowRule(1)).toBeNull();
    expect(service.sceneFollowRules()).toEqual({});
  });

  it('defaults an advance rule to the global interval and drops bad input', () => {
    service.setSceneFollowBars(6);
    expect(service.setSceneFollowRule(0, { mode: 'advance' })).toEqual({
      mode: 'advance',
      bars: 6,
    });
    expect(service.setSceneFollowRule(-1, { mode: 'loop' })).toBeNull();
    expect(service.setSceneFollowRule(0.5, { mode: 'loop' })).toBeNull();
    // A column no channel owns is not a scene, so it cannot hold a rule.
    expect(service.sceneIdentity(4)).toBeNull();
    expect(service.setSceneFollowRule(4, { mode: 'loop' })).toBeNull();
  });

  it('keeps a rule on its scene when an earlier scene is deleted', () => {
    service.setSceneFollowRule(1, { mode: 'loop' });

    // Delete the first scene column on every channel: scene 2 shifts to 0.
    service.tracks.update((tracks) =>
      tracks.map((track) => ({
        ...track,
        patternSlots: track.patternSlots.slice(1),
      })),
    );

    expect(service.sceneIdentity(0)).toBe('slot-1');
    expect(service.sceneFollowRule(0)).toEqual({ mode: 'loop' });
    expect(service.sceneFollowRules()).toEqual({ 'slot-1': { mode: 'loop' } });
  });

  it('prunes rules whose scene no longer exists', () => {
    service.setSceneFollowRule(0, { mode: 'loop' });
    service.setSceneFollowRule(1, { mode: 'advance', bars: 2 });

    service.tracks.update((tracks) =>
      tracks.map((track) => ({
        ...track,
        patternSlots: track.patternSlots.slice(1),
      })),
    );
    service.pruneSceneFollowRules();

    expect(service.sceneFollowRules()).toEqual({
      'slot-1': { mode: 'advance', bars: 2 },
    });
  });

  it('holds a looping scene even while global follow is armed', () => {
    service.setSceneFollowRule(0, { mode: 'loop' });
    service.setSceneFollowEnabled(true);
    service.setSceneFollowBars(1);
    service.launchSceneColumn(0);

    advanceBars(4);

    expect(service.activeSceneColumn()).toBe(0);
    expect(service.sceneFollowEnabled()).toBe(true);
  });

  it('advances a scene on its own bar count while global follow is off', () => {
    service.setSceneFollowEnabled(false);
    service.setSceneFollowRule(0, { mode: 'advance', bars: 2 });
    service.launchSceneColumn(0);

    advanceBars(1);
    expect(service.activeSceneColumn()).toBe(0);

    advanceBars(1);
    expect(service.activeSceneColumn()).toBe(1);
  });

  it('keeps a rule on the last scene instead of disarming follow globally', () => {
    service.tracks.set([
      {
        ...sceneTrack(),
        patternSlots: [sceneTrack().patternSlots[0]],
      },
    ]);
    service.setSceneFollowRule(0, { mode: 'advance', bars: 1 });
    service.setSceneFollowEnabled(true);
    service.launchSceneColumn(0);

    advanceBars(2);

    expect(service.activeSceneColumn()).toBe(0);
    expect(service.sceneFollowEnabled()).toBe(true);
    expect(service.sceneFollowRule(0)).toEqual({ mode: 'advance', bars: 1 });
  });

  it('still disarms global follow when there is nowhere else to go', () => {
    service.tracks.set([
      {
        ...sceneTrack(),
        patternSlots: [sceneTrack().patternSlots[0]],
      },
    ]);
    service.setSceneFollowEnabled(true);
    service.setSceneFollowBars(1);
    service.launchSceneColumn(0);

    advanceBars(1);

    expect(service.sceneFollowEnabled()).toBe(false);
  });

  it('sanitises restored rules and migrates column-keyed bundles', () => {
    const saved = service.setSceneFollowRules({
      'slot-0': { mode: 'loop' },
      // Bundles saved before scene identity existed keyed rules by column.
      '1': { mode: 'advance', bars: 900 },
      'slot-9': { mode: 'advance', bars: 3 },
      '2': { mode: 'advance', bars: 3 },
      bad: { mode: 'loop' },
      'slot-0-bad': { mode: 'inherit' },
    });

    expect(saved).toEqual({
      'slot-0': { mode: 'loop' },
      'slot-1': { mode: 'advance', bars: 32 },
    });

    service.clearSceneFollowRules();
    expect(service.sceneFollowRules()).toEqual({});
  });

  it('drops scene rules when a new project replaces the set', () => {
    service.setSceneFollowRule(2, { mode: 'loop' });
    service.setSceneFollowBars(9);

    service.newProject(true);

    expect(service.sceneFollowRules()).toEqual({});
    expect(service.sceneFollowBars()).toBe(4);
  });

  it('duplicates a track with its notes and selects the copy', () => {
    const source = service.tracks()[0];
    service.tracks.set([
      {
        ...source,
        notes: [{ id: 'n1', step: 0, midi: 60, length: 1, velocity: 100 }],
        clips: [],
      },
    ]);
    service.selectedTrackId.set('track-1');

    const copyId = service.duplicateTrack('track-1');
    const list = service.tracks();

    expect(list).toHaveLength(2);
    expect(copyId).not.toBe('track-1');
    expect(list[1].id).toBe(copyId);
    expect(list[1].name).toBe(source.name + ' copy');
    // Fresh note ids: the copy must not shadow the source's selection.
    expect(list[1].notes[0].id).not.toBe('n1');
    expect(list[1].notes[0].midi).toBe(60);
    expect(service.selectedTrackId()).toBe(copyId);

    // This describe's `history` fixture is not a real HistoryService, so drive
    // undo through the instance the service actually records into.
    const recorder = (service as unknown as { history: { undo(): void } })
      .history;
    recorder.undo();
    expect(service.tracks()).toHaveLength(1);
    expect(service.selectedTrackId()).toBe('track-1');
  });


  it('pastes the clip clipboard onto another track as one undoable step', () => {
    const source = service.tracks()[0];
    service.tracks.set([
      { ...source, id: 'track-a', notes: [], clips: [] },
      { ...source, id: 'track-b', notes: [], clips: [] },
    ]);
    service.addClipToTrack('track-a', { start: 2, length: 4, name: 'Verse' });
    service.addClipToTrack('track-a', { start: 6, length: 2, name: 'Fill' });

    const clips = service.tracks().find((t) => t.id === 'track-a')!.clips;
    service.copyClips(
      clips.map((c) => {
        const snapshot: Omit<typeof c, 'id'> & { id?: string } = { ...c };
        delete snapshot.id;
        return { clip: snapshot, sourceTrackId: 'track-a' };
      }),
    );

    const pastedIds = service.pasteClips('track-b', 8);
    const destination = service.tracks().find((t) => t.id === 'track-b')!;

    expect(pastedIds).toHaveLength(2);
    expect(destination.clips.map((c) => c.start).sort((a, b) => a - b)).toEqual([
      8, 12,
    ]);

    const recorder = (service as unknown as { history: { undo(): void } })
      .history;
    recorder.undo();
    expect(
      service.tracks().find((t) => t.id === 'track-b')!.clips,
    ).toHaveLength(0);
  });

  it('ramps selected velocities by note time and pitch in one undoable step', () => {
    const source = service.tracks()[0];
    service.tracks.set([
      {
        ...source,
        notes: [
          { id: 'late', step: 8, midi: 60, length: 1, velocity: 0.5 },
          { id: 'chord-low', step: 4, midi: 60, length: 1, velocity: 0.5 },
          { id: 'chord-high', step: 4, midi: 67, length: 1, velocity: 0.5 },
          { id: 'untouched', step: 2, midi: 72, length: 1, velocity: 0.5 },
        ],
        clips: [],
      },
    ]);

    expect(
      service.rampNoteVelocity(
        'track-1',
        ['late', 'chord-low', 'chord-high'],
        'up',
      ),
    ).toBe(true);

    const byId = new Map(service.tracks()[0].notes.map((n) => [n.id, n]));
    expect(byId.get('chord-low')!.velocity).toBe(0.3);
    expect(byId.get('chord-high')!.velocity).toBe(0.75);
    expect(byId.get('late')!.velocity).toBe(1.2);
    expect(byId.get('untouched')!.velocity).toBe(0.5);

    const recorder = (service as unknown as { history: { undo(): void } })
      .history;
    recorder.undo();
    expect(
      service.tracks()[0].notes.every((n) => n.velocity === 0.5),
    ).toBe(true);

    expect(
      service.rampNoteVelocity(
        'track-1',
        ['late', 'chord-low', 'chord-high'],
        'down',
      ),
    ).toBe(true);
    const reversed = new Map(service.tracks()[0].notes.map((n) => [n.id, n]));
    expect(reversed.get('chord-low')!.velocity).toBe(1.2);
    expect(reversed.get('chord-high')!.velocity).toBe(0.75);
    expect(reversed.get('late')!.velocity).toBe(0.3);

    expect(service.rampNoteVelocity('track-1', ['late'], 'up')).toBe(false);
  });

  it('legato-joins chords to the next selected onset in one undoable step', () => {
    const source = service.tracks()[0];
    service.tracks.set([
      {
        ...source,
        notes: [
          { id: 'chord-root', step: 0, midi: 60, length: 0.5, velocity: 0.8 },
          { id: 'chord-fifth', step: 0, midi: 67, length: 0.5, velocity: 0.8 },
          { id: 'middle', step: 4, midi: 64, length: 1, velocity: 0.8 },
          { id: 'last', step: 8, midi: 72, length: 2, velocity: 0.8 },
          { id: 'untouched', step: 2, midi: 55, length: 0.5, velocity: 0.8 },
        ],
        clips: [],
      },
    ]);
    const ids = ['chord-root', 'chord-fifth', 'middle', 'last'];

    expect(service.legatoNotes('track-1', ids)).toBe(true);

    const byId = new Map(service.tracks()[0].notes.map((n) => [n.id, n]));
    expect(byId.get('chord-root')!.length).toBe(4);
    expect(byId.get('chord-fifth')!.length).toBe(4);
    expect(byId.get('middle')!.length).toBe(4);
    expect(byId.get('last')!.length).toBe(2);
    expect(byId.get('untouched')!.length).toBe(0.5);

    const recorder = (service as unknown as { history: { undo(): void } })
      .history;
    recorder.undo();
    const restored = new Map(service.tracks()[0].notes.map((n) => [n.id, n]));
    expect(restored.get('chord-root')!.length).toBe(0.5);
    expect(restored.get('middle')!.length).toBe(1);

    expect(
      service.legatoNotes('track-1', ['chord-root', 'chord-fifth']),
    ).toBe(false);
  });

});
