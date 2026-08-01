import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../services/auth.service';
import { LocalStorageService } from '../services/local-storage.service';
import { LoggingService } from '../services/logging.service';
import { MusicManagerService } from '../services/music-manager.service';
import { OfflineSyncService } from '../services/offline-sync.service';
import { ProjectService } from '../services/project.service';
import { ProjectBundle, ProjectWorkspaceService } from './project-workspace.service';

describe('ProjectWorkspaceService', () => {
  let service: ProjectWorkspaceService;
  let tracks: ReturnType<typeof signal<any[]>>;
  let saveItem: jest.Mock;
  let queueOperation: jest.Mock;
  let tempoSet: jest.Mock;

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
    saveItem = jest.fn().mockResolvedValue(undefined);
    queueOperation = jest.fn().mockResolvedValue('sync_test_1');
    tempoSet = jest.fn();

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
            engine: {
              tempo: { set: tempoSet },
              masterGain: { gain: { value: 0.8 } },
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
            getItem: jest.fn().mockResolvedValue(null),
            getAllItems: jest.fn().mockResolvedValue([]),
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
    expect(snapshot.tracks).toBe(tracks());
    expect(tempoSet).toHaveBeenCalledWith(124);
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
});
