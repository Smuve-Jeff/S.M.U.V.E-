import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AutoSaveService } from './auto-save.service';
import { MusicManagerService } from './music-manager.service';
import { DatabaseService } from './database.service';
import { UserProfileService } from './user-profile.service';
import { LoggingService } from './logging.service';
import { OfflineSyncService } from './offline-sync.service';

describe('AutoSaveService', () => {
  const musicManager = {
    projectLoaded: signal(true),
    snapshotProject: jest.fn(),
  };
  const offlineSync = {
    readLocal: jest.fn().mockResolvedValue(null),
    saveLocal: jest.fn().mockResolvedValue(undefined),
    queueOperation: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    musicManager.snapshotProject.mockReturnValue(null);

    TestBed.configureTestingModule({
      providers: [
        AutoSaveService,
        { provide: MusicManagerService, useValue: musicManager },
        {
          provide: DatabaseService,
          useValue: { saveUserProfile: jest.fn(), saveProject: jest.fn() },
        },
        {
          provide: UserProfileService,
          useValue: { profile: signal({ id: 'test-user' }) },
        },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        { provide: OfflineSyncService, useValue: offlineSync },
      ],
    });
  });

  it('ignores a fresh session with no current project during bootstrap', async () => {
    expect(() => TestBed.inject(AutoSaveService)).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(musicManager.snapshotProject).toHaveBeenCalled();
    expect(offlineSync.saveLocal).not.toHaveBeenCalled();
  });

  it('does not persist a stale debounced save after the selected project was deleted', async () => {
    const service = TestBed.inject(AutoSaveService);
    const saveProject = TestBed.inject(DatabaseService).saveProject;
    musicManager.snapshotProject.mockReturnValue(null);
    await (service as any).syncProject({ id: 'deleted-id', tracks: [{ id: 'track-1' }] });
    expect(saveProject).not.toHaveBeenCalled();
    expect(offlineSync.queueOperation).not.toHaveBeenCalled();
  });

  it('still persists a debounced save for the current project', async () => {
    const service = TestBed.inject(AutoSaveService);
    const project = { id: 'selected-id', tracks: [] };
    musicManager.snapshotProject.mockReturnValue(project);
    await (service as any).syncProject(project);
    expect(TestBed.inject(DatabaseService).saveProject).toHaveBeenCalled();
  });

  it('does not autosave an empty project snapshot', async () => {
    musicManager.snapshotProject.mockReturnValue({ tracks: [] });

    TestBed.inject(AutoSaveService);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(offlineSync.saveLocal).not.toHaveBeenCalled();
  });
});
