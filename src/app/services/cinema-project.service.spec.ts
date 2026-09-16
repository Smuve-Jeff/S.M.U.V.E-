import { TestBed } from '@angular/core/testing';
import { AudioEngineService } from './audio-engine.service';
import { CinemaProjectService } from './cinema-project.service';
import { LocalStorageService } from './local-storage.service';
import { LoggingService } from './logging.service';
import { VideoEngineService, VideoClip } from './video-engine.service';

/** A playable still, so a clip has media that survives a reload. */
const STILL = 'data:image/jpeg;base64,AAAA';

const clip = (
  overrides: Partial<Omit<VideoClip, 'id' | 'trackId'>> = {}
): Omit<VideoClip, 'id' | 'trackId'> => ({
  name: 'Take 1',
  url: 'blob:take-1',
  startTime: 0,
  duration: 5,
  offset: 0,
  type: 'video',
  effects: {
    upscale: false,
    bgRemoval: false,
    noiseReduction: false,
    brightness: 1,
    contrast: 1,
    filter: 'none',
    transition: 'cut',
    transitionDuration: 0.4,
    trimStart: 0,
    trimEnd: 0,
  },
  ...overrides,
});

describe('CinemaProjectService', () => {
  let stored: Map<string, any>;
  let storage: {
    persistenceStatus: jest.Mock;
    saveItem: jest.Mock;
    getItem: jest.Mock;
    getAllItems: jest.Mock;
    deleteItem: jest.Mock;
  };

  const buildStorage = () => {
    stored = new Map<string, any>();
    storage = {
      persistenceStatus: jest.fn(async () => 'ready'),
      saveItem: jest.fn(async (_store: string, item: any) => {
        stored.set(item.id, item);
      }),
      getItem: jest.fn(async (_store: string, id: string) =>
        stored.has(id) ? stored.get(id) : null
      ),
      getAllItems: jest.fn(async () => Array.from(stored.values())),
      deleteItem: jest.fn(async (_store: string, id: string) => {
        stored.delete(id);
      }),
    };
    return storage;
  };

  const createHarness = () => {
    TestBed.configureTestingModule({
      providers: [
        CinemaProjectService,
        VideoEngineService,
        { provide: LocalStorageService, useValue: buildStorage() },
        { provide: LoggingService, useValue: { error: jest.fn(), warn: jest.fn() } },
        { provide: AudioEngineService, useValue: { tempo: () => 120 } },
      ],
    });

    const service = TestBed.inject(CinemaProjectService);
    const engine = TestBed.inject(VideoEngineService);
    return { service, engine, storage };
  };

  it('starts with nothing saved', async () => {
    const { service } = createHarness();

    await service.refresh();

    expect(service.projects()).toEqual([]);
    expect(service.hasProjects()).toBe(false);
    expect(service.activeProjectId()).toBeNull();
  });

  describe('save', () => {
    it('creates a project and makes it the active one', async () => {
      const { service, engine } = createHarness();
      engine.addClip('t1', clip({ url: STILL }));
      engine.addMarker('Act 1', 3);

      const outcome = await service.save('Feature Cut');

      expect(outcome.ok).toBe(true);
      expect(outcome.message).toContain('FEATURE CUT');
      expect(service.activeProjectId()).toBe(outcome.id);
      expect(service.projects()).toHaveLength(1);
      expect(service.projects()[0]).toMatchObject({
        name: 'Feature Cut',
        clipCount: 1,
        markerCount: 1,
        needsMediaCount: 0,
      });
    });

    it('overwrites the open project instead of forking a copy', async () => {
      const { service, engine } = createHarness();
      const first = await service.save('Feature Cut');
      const createdAt = service.projects()[0].createdAt;

      engine.addClip('t1', clip({ url: STILL }));
      const second = await service.save('Feature Cut v2', first.id);

      expect(second.id).toBe(first.id);
      expect(service.projects()).toHaveLength(1);
      expect(service.projects()[0].name).toBe('Feature Cut v2');
      expect(service.projects()[0].clipCount).toBe(1);
      expect(service.projects()[0].createdAt).toBe(createdAt);
    });

    it('says up front how many clips will need re-ingesting', async () => {
      const { service, engine } = createHarness();
      engine.addClip('t1', clip({ url: 'blob:take-1' }));
      engine.addClip('t1', clip({ url: STILL }));

      const outcome = await service.save('Half Linked');

      expect(outcome.ok).toBe(true);
      expect(outcome.message).toContain('1 clip');
      expect(outcome.message).toContain('re-ingested');
      expect(service.projects()[0].needsMediaCount).toBe(1);
    });

    it('refuses to pretend when this host cannot store anything', async () => {
      const { service, engine, storage } = createHarness();
      storage.persistenceStatus.mockResolvedValue('unsupported');
      engine.addClip('t1', clip({ url: STILL }));

      const outcome = await service.save('Feature Cut');

      // A no-op write still resolves, so a silent "saved" would be a lie.
      expect(outcome.ok).toBe(false);
      expect(outcome.message).toContain('cannot store projects');
      expect(service.storageAvailable()).toBe(false);
      expect(service.projects()).toEqual([]);
      expect(storage.saveItem).not.toHaveBeenCalled();
    });

    it('blames the other tab, not the browser, when storage is blocked', async () => {
      const { service, storage } = createHarness();
      storage.persistenceStatus.mockResolvedValue('blocked');

      const outcome = await service.save('Feature Cut');

      // A browser whose database is held by another tab is perfectly capable of
      // storing data; only one of these two messages leads to a fix.
      expect(outcome.ok).toBe(false);
      expect(outcome.message).toContain('another open tab');
      expect(outcome.message).not.toContain('cannot store projects');
      expect(service.storageState()).toBe('blocked');
      // The persistent notice already says this; mirroring it into lastError
      // printed the identical sentence twice in the panel.
      expect(service.lastError()).toBeNull();
    });

    it('overwrites the stored record even when the list has gone stale', async () => {
      const { service, engine, storage } = createHarness();
      const saved = await service.save('Feature Cut');
      const createdAt = service.projects()[0].createdAt;

      // A refresh that failed empties the list while the record is still there.
      storage.getAllItems.mockRejectedValueOnce(new Error('read failed'));
      await service.refresh();
      expect(service.projects()).toEqual([]);
      expect(service.activeProjectId()).toBe(saved.id);

      engine.addClip('t1', clip({ url: STILL }));
      const outcome = await service.save('Feature Cut', saved.id);

      // The overwrite target comes from storage, so this stays an overwrite
      // rather than forking a duplicate and orphaning the original.
      expect(outcome.id).toBe(saved.id);
      expect(service.projects()).toHaveLength(1);
      expect(service.projects()[0].createdAt).toBe(createdAt);
      expect(service.projects()[0].clipCount).toBe(1);
    });

    it('reports a write the store rejected', async () => {
      const { service, storage } = createHarness();
      storage.saveItem.mockRejectedValue(new Error('quota'));

      const outcome = await service.save('Too Big');

      expect(outcome.ok).toBe(false);
      expect(outcome.message).toContain('could not be saved');
      expect(service.lastError()).not.toBeNull();
    });

    it('names a blank project rather than storing an empty title', async () => {
      const { service } = createHarness();

      await service.save('   ');

      expect(service.projects()[0].name).toBe('Untitled Cinema Project');
    });

    it('bounds the title so the list stays readable', async () => {
      const { service } = createHarness();

      await service.save('A'.repeat(200));

      expect(service.projects()[0].name).toHaveLength(60);
    });
  });

  describe('open', () => {
    it('restores the saved edit and reports the media that was lost', async () => {
      const { service, engine } = createHarness();
      engine.addClip('t1', clip({ url: 'blob:take-1' }));
      engine.addClip('t1', clip({ url: STILL }));
      engine.addMarker('Act 1', 3);
      const saved = await service.save('Feature Cut');

      // A later session: empty timeline, then reopen the project.
      engine.tracks.update((tracks) =>
        tracks.map((track) => ({ ...track, clips: [] }))
      );
      engine.markers.set([]);
      service.startNew();

      const outcome = await service.open(saved.id!);

      expect(outcome.ok).toBe(true);
      expect(outcome.report).toEqual({
        clips: 2,
        markers: 1,
        clipsMissingMedia: 1,
      });
      expect(outcome.message).toContain('lost their media');
      expect(engine.markers()).toHaveLength(1);
      expect(
        engine.tracks().find((track) => track.id === 't1')!.clips
      ).toHaveLength(2);
      expect(service.activeProjectId()).toBe(saved.id);
    });

    it('fails cleanly when the record is gone', async () => {
      const { service } = createHarness();

      const outcome = await service.open('cinema-missing');

      expect(outcome.ok).toBe(false);
      expect(outcome.message).toContain('no longer in storage');
      expect(service.lastError()).not.toBeNull();
    });

    it('refuses a record written by a different format version', async () => {
      const { service, engine } = createHarness();
      const saved = await service.save('Feature Cut');
      const record = stored.get(saved.id!);
      record.snapshot.version = 99;
      stored.set(saved.id!, record);

      const outcome = await service.open(saved.id!);

      // Reading a future shape as if it were this one would drop whatever it
      // carried, silently.
      expect(outcome.ok).toBe(false);
      expect(outcome.message).toContain('different version');
      expect(engine.markers()).toEqual([]);
    });
  });

  describe('remove and startNew', () => {
    it('deletes the project and clears the active pointer', async () => {
      const { service } = createHarness();
      const saved = await service.save('Feature Cut');

      const removed = await service.remove(saved.id!);

      expect(removed).toBe(true);
      expect(service.projects()).toEqual([]);
      expect(service.activeProjectId()).toBeNull();
    });

    it('reports a delete the store rejected', async () => {
      const { service, storage } = createHarness();
      const saved = await service.save('Feature Cut');
      storage.deleteItem.mockRejectedValue(new Error('locked'));

      const removed = await service.remove(saved.id!);

      expect(removed).toBe(false);
      expect(service.lastError()).toContain('could not be deleted');
    });

    it('detaches without touching the timeline', async () => {
      const { service, engine } = createHarness();
      engine.addClip('t1', clip({ url: STILL }));
      await service.save('Feature Cut');

      service.startNew();

      // "New project" is a save-as-new, never a destructive reset.
      expect(service.activeProjectId()).toBeNull();
      expect(
        engine.tracks().find((track) => track.id === 't1')!.clips
      ).toHaveLength(1);
      expect(service.projects()).toHaveLength(1);
    });
  });

  it('lists the most recently touched project first', async () => {
    const { service, engine } = createHarness();
    // A controlled clock: two saves inside the same millisecond would tie, and a
    // stable sort would then pass this without the re-save doing anything.
    let clock = 1_000;
    const nowSpy = jest
      .spyOn(Date, 'now')
      .mockImplementation(() => (clock += 1_000));

    try {
      const older = await service.save('Older');
      // Saving again would overwrite the open project, so a second project needs
      // a detach first — the "save" / "save as new" split the UI exposes.
      service.startNew();
      await service.save('Newer');

      expect(service.projects().map((project) => project.name)).toEqual([
        'Newer',
        'Older',
      ]);

      // Re-saving an older project is what should bring it back to the top.
      engine.addMarker('touched', 1);
      await service.save('Older', older.id);

      expect(service.projects().map((project) => project.name)).toEqual([
        'Older',
        'Newer',
      ]);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
