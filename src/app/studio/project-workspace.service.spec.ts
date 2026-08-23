import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../services/auth.service';
import { LocalStorageService } from '../services/local-storage.service';
import { LoggingService } from '../services/logging.service';
import { MusicManagerService } from '../services/music-manager.service';
import { OfflineSyncService } from '../services/offline-sync.service';
import { ProjectService } from '../services/project.service';
import { ProjectBundle, ProjectWorkspaceService } from './project-workspace.service';

const createFakeAudioBuffer = (
  channels: number[][],
  sampleRate = 48000
): any => ({
  numberOfChannels: channels.length,
  length: channels[0]?.length ?? 0,
  sampleRate,
  duration: (channels[0]?.length ?? 0) / sampleRate,
  getChannelData: (channel: number) => Float32Array.from(channels[channel] ?? []),
});

describe('ProjectWorkspaceService', () => {
  let service: ProjectWorkspaceService;
  let tracks: ReturnType<typeof signal<any[]>>;
  let stemAudioCache: Map<string, any>;
  let saveItem: jest.Mock;
  let queueOperation: jest.Mock;
  let tempoSet: jest.Mock;
  let getItem: jest.Mock;
  let getAllItems: jest.Mock;

  const metadata = {
    id: 'proj_test',
    name: 'Test Session',
    bpm: 128,
    key: 'C',
    genre: 'house',
    mood: 'energetic',
    tags: ['club'],
    createdAt: 1,
    updatedAt: 2,
    lastOpenedAt: 3,
    version: 1,
  };

  const makeBundle = (): ProjectBundle => ({
    metadata: { ...metadata },
    tracks: [{ id: 'track-1', notes: [] }],
    automation: {},
    mixState: {},
    notes: 'arrangement note',
    exportedAt: 4,
  });

  beforeEach(() => {
    tracks = signal([{ id: 'track-1', notes: [] }]);
    stemAudioCache = new Map<string, any>();
    saveItem = jest.fn().mockResolvedValue(undefined);
    queueOperation = jest.fn().mockResolvedValue('sync_test_1');
    tempoSet = jest.fn();
    getItem = jest.fn().mockResolvedValue(null);
    getAllItems = jest.fn().mockResolvedValue([]);

    TestBed.configureTestingModule({
      providers: [
        ProjectWorkspaceService,
        {
          provide: AuthService,
          useValue: { currentUser: signal(null) },
        },
        {
          provide: MusicManagerService,
          useValue: {
            tracks,
            stemAudioCache,
            engine: {
              tempo: { set: tempoSet },
              masterGain: { gain: { value: 0.8 } },
              ctx: {
                createBuffer: jest.fn(
                  (channelCount: number, frameCount: number, sampleRate: number) => {
                    const data = Array.from(
                      { length: channelCount },
                      () => new Float32Array(frameCount)
                    );
                    return {
                      numberOfChannels: channelCount,
                      length: frameCount,
                      sampleRate,
                      duration: frameCount / sampleRate,
                      getChannelData: (channel: number) => data[channel],
                      copyToChannel: (source: Float32Array, channel: number) =>
                        data[channel].set(source),
                    };
                  }
                ),
              },
            },
          },
        },
        {
          provide: ProjectService,
          useValue: { currentProject: signal(null) },
        },
        {
          provide: LocalStorageService,
          useValue: {
            saveItem,
            getItem,
            getAllItems,
          },
        },
        {
          provide: OfflineSyncService,
          useValue: {
            saveLocal: jest.fn().mockResolvedValue(undefined),
            queueOperation,
          },
        },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    });
    service = TestBed.inject(ProjectWorkspaceService);
  });

  afterEach(() => service.stopAutoSave());

  it('creates a complete local snapshot and applies genre tempo', () => {
    service.updateMetadata({ name: 'Night Drive' });
    service.setGenre('house');

    const snapshot = service.createSnapshot();

    expect(snapshot.metadata.name).toBe('Night Drive');
    expect(snapshot.metadata.genre).toBe('house');
    expect(snapshot.tracks).toEqual(tracks());
    expect(tempoSet).toHaveBeenCalledWith(124);
  });

  it('serializes cached audio clips and restores them into the stem cache', () => {
    const clipId = 'clip-audio-1';
    const buffer = createFakeAudioBuffer([[0.1, -0.1, 0.25], [0.2, -0.2, 0.5]]);
    stemAudioCache.set(clipId, buffer);
    tracks.set([
      {
        id: 'track-audio',
        type: 'audio',
        notes: [],
        clips: [{ id: clipId, type: 'audio', start: 0, length: 1, audioRefId: clipId }],
      },
    ]);

    const snapshot = service.createSnapshot();
    expect(snapshot.audioAssets).toEqual([
      expect.objectContaining({
        id: clipId,
        channelCount: 2,
        frameCount: 3,
      }),
    ]);

    stemAudioCache.clear();
    service.restoreFromSnapshot(snapshot);
    expect(stemAudioCache.has(clipId)).toBe(true);
    const restored = Array.from(stemAudioCache.get(clipId).getChannelData(0));
    expect(restored[0]).toBeCloseTo(0.1, 5);
    expect(restored[1]).toBeCloseTo(-0.1, 5);
    expect(restored[2]).toBeCloseTo(0.25, 5);
  });

  it('persists manual saves locally before returning the bundle', async () => {
    const bundle = await service.manualSave();

    expect(bundle.metadata.id).toMatch(/^proj_/);
    expect(saveItem).toHaveBeenCalledWith(
      'projects',
      expect.objectContaining({
        id: `project_${bundle.metadata.id}`,
        tracks: bundle.tracks,
      })
    );
    expect(saveItem).toHaveBeenCalledWith(
      'offline_local_cache',
      expect.objectContaining({
        id: 'last_saved_project_id',
        payload: bundle.metadata.id,
      })
    );
    expect(service.isDirty()).toBe(false);
    expect(service.lastPersistedAt()).toBeGreaterThan(0);
  });

  it('marks arrangement changes dirty even without metadata edits', async () => {
    expect(service.isDirty()).toBe(false);

    tracks.set([
      { id: 'track-1', notes: [] },
      { id: 'track-2', notes: [{ id: 'note-1', step: 4 }] },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.isDirty()).toBe(true);
  });

  it('imports a bundle, restores tracks, and queues authenticated cloud sync', async () => {
    const user = { id: 'artist-1' };
    // Recreate with the authenticated provider so the service receives it at construction.
    service.stopAutoSave();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ProjectWorkspaceService,
        { provide: AuthService, useValue: { currentUser: signal(user) } },
        { provide: MusicManagerService, useValue: { tracks, engine: { tempo: { set: tempoSet } } } },
        { provide: ProjectService, useValue: { currentProject: signal(null) } },
        { provide: LocalStorageService, useValue: { saveItem, getItem: jest.fn(), getAllItems: jest.fn() } },
        { provide: OfflineSyncService, useValue: { saveLocal: jest.fn(), queueOperation } },
        { provide: LoggingService, useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } },
      ],
    });
    service = TestBed.inject(ProjectWorkspaceService);

    const bundle = makeBundle();
    await expect(service.importProjectBundle(bundle)).resolves.toBe(true);

    expect(tracks()).toEqual(bundle.tracks);
    expect(queueOperation).toHaveBeenCalledWith(
      'CREATE',
      expect.stringContaining('/projects'),
      expect.objectContaining({ projectId: bundle.metadata.id, userId: user.id }),
      { userId: user.id }
    );
    expect(service.cloudSyncQueued()).toBe(true);
  });

  it('restores the freshest local bundle and tracks the recovery source', async () => {
    const olderBundle = {
      id: 'project_proj_old',
      ...makeBundle(),
      savedAt: 100,
      source: 'manual',
    };
    const newerBundle = {
      id: 'recovery_proj_new',
      ...makeBundle(),
      metadata: { ...metadata, name: 'Recovered Session', bpm: 132 },
      tracks: [{ id: 'track-9', notes: [{ id: 'n-1', step: 8 }] }],
      savedAt: 200,
      source: 'recovery',
    };
    tracks.set([]);
    getAllItems.mockResolvedValue([olderBundle, newerBundle]);

    await expect(service.restoreLatestProjectState()).resolves.toBe(true);

    expect(service.metadata()?.name).toBe('Recovered Session');
    expect(service.lastRecoveredSource()).toBe('recovery');
    expect(service.lastRecoveredAt()).toBe(200);
    expect(tracks()).toEqual(newerBundle.tracks);
    expect(tempoSet).toHaveBeenCalledWith(132);
  });
});
