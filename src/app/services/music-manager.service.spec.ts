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

describe('MusicManagerService clip glue workflows', () => {
  let service: MusicManagerService;
  let history: HistoryService;

  const engineMock = {
    tempo: signal(120),
    visualStep: signal(0),
    setSongLengthSteps: jest.fn(),
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
});

describe('MusicManagerService pattern slots (channel rack / performance grid)', () => {
  let service: MusicManagerService;
  let history: HistoryService;

  const engineMock = {
    tempo: signal(120),
    visualStep: signal(0),
    setSongLengthSteps: jest.fn(),
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

    service.setActivePatternSlot('track-1', 'slot-7');
    expect(service.tracks()[0].activePatternSlotId).toBe('slot-7');
    history.undo();
    expect(service.tracks()[0].activePatternSlotId).toBe('slot-0');
  });
});
