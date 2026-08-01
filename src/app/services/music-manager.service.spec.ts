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
