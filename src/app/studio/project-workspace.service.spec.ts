import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Subject } from 'rxjs';
import { AutomationService } from './automation.service';
import { AuthService } from "../services/auth.service";
import { LocalStorageService } from "../services/local-storage.service";
import { LoggingService } from "../services/logging.service";
import { MusicManagerService } from "../services/music-manager.service";
import { OfflineSyncService } from "../services/offline-sync.service";
import { ProjectService } from "../services/project.service";
import {
  ProjectBundle,
  ProjectWorkspaceService,
} from "./project-workspace.service";

const createFakeAudioBuffer = (
  channels: number[][],
  sampleRate = 48000,
): any => ({
  numberOfChannels: channels.length,
  length: channels[0]?.length ?? 0,
  sampleRate,
  duration: (channels[0]?.length ?? 0) / sampleRate,
  getChannelData: (channel: number) =>
    Float32Array.from(channels[channel] ?? []),
});

describe("ProjectWorkspaceService", () => {
  let service: ProjectWorkspaceService;
  let tracks: ReturnType<typeof signal<any[]>>;
  let stemAudioCache: Map<string, any>;
  let saveItem: jest.Mock;
  let queueOperation: jest.Mock;
  let tempoSet: jest.Mock;
  let getItem: jest.Mock;
  let getAllItems: jest.Mock;

  const metadata = {
    id: "proj_test",
    name: "Test Session",
    bpm: 128,
    key: "C",
    genre: "house",
    mood: "energetic",
    tags: ["club"],
    createdAt: 1,
    updatedAt: 2,
    lastOpenedAt: 3,
    version: 1,
  };

  const makeBundle = (): ProjectBundle => ({
    metadata: { ...metadata },
    tracks: [{ id: "track-1", notes: [] }],
    automation: {},
    mixState: {},
    notes: "arrangement note",
    exportedAt: 4,
  });

  it('detaches a deleted active project so autosave cannot recreate its id', () => {
    service.startFreshProject({ id: 'deleted-session', name: 'Old session' });
    const beforeTracks = tracks();
    TestBed.inject(ProjectService).projectDeleted$.next('other-session');
    expect(service.metadata()?.id).toBe('deleted-session');
    TestBed.inject(ProjectService).projectDeleted$.next('deleted-session');
    expect(service.metadata()?.id).not.toBe('deleted-session');
    expect(service.metadata()?.name).toBe('Unsaved session');
    expect(service.autoSaveEnabled()).toBe(false);
    expect(tracks()).toBe(beforeTracks);
  });

  beforeEach(() => {
    tracks = signal([{ id: "track-1", notes: [] }]);
    stemAudioCache = new Map<string, any>();
    saveItem = jest.fn().mockResolvedValue(undefined);
    queueOperation = jest.fn().mockResolvedValue("sync_test_1");
    tempoSet = jest.fn();
    getItem = jest.fn().mockResolvedValue(null);
    getAllItems = jest.fn().mockResolvedValue([]);

    TestBed.configureTestingModule({
      providers: [
        ProjectWorkspaceService,
        { provide: AutomationService, useValue: { lanes: signal([]), macros: signal([]), modulationSources: signal([]) } },
        {
          provide: AuthService,
          useValue: { currentUser: signal(null) },
        },
        {
          provide: MusicManagerService,
          useValue: {
            tracks,
            structure: signal([]),
            selectedTrackId: signal(null),
            stemAudioCache,
            engine: {
              stop: jest.fn(),
              tempo: { set: tempoSet },
              masterGain: { gain: { value: 0.8 } },
              ctx: {
                createBuffer: jest.fn(
                  (
                    channelCount: number,
                    frameCount: number,
                    sampleRate: number,
                  ) => {
                    const data = Array.from(
                      { length: channelCount },
                      () => new Float32Array(frameCount),
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
                  },
                ),
              },
            },
          },
        },
        {
          provide: ProjectService,
          useValue: { currentProject: signal(null), projectDeleted$: new Subject<string>(), refresh: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: LocalStorageService,
          useValue: {
            saveItem,
            persistenceStatus: jest.fn().mockResolvedValue('ready'),
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

  it("creates a complete local snapshot and applies genre tempo", () => {
    service.updateMetadata({ name: "Night Drive" });
    service.setGenre("house");

    const snapshot = service.createSnapshot();

    expect(snapshot.metadata.name).toBe("Night Drive");
    expect(snapshot.metadata.genre).toBe("house");
    expect(snapshot.tracks).toEqual(tracks());
    expect(tempoSet).toHaveBeenCalledWith(124);
  });

  it("serializes cached audio clips and restores them into the stem cache", () => {
    const clipId = "clip-audio-1";
    const buffer = createFakeAudioBuffer([
      [0.1, -0.1, 0.25],
      [0.2, -0.2, 0.5],
    ]);
    stemAudioCache.set(clipId, buffer);
    tracks.set([
      {
        id: "track-audio",
        type: "audio",
        notes: [],
        clips: [
          {
            id: clipId,
            type: "audio",
            start: 0,
            length: 1,
            audioRefId: clipId,
          },
        ],
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

  it("stores binary audio channels locally while keeping export snapshots JSON-friendly", async () => {
    const clipId = "clip-audio-2";
    const buffer = createFakeAudioBuffer([[0.15, -0.25, 0.35]]);
    stemAudioCache.set(clipId, buffer);
    tracks.set([
      {
        id: "track-audio",
        type: "audio",
        notes: [],
        clips: [
          {
            id: clipId,
            type: "audio",
            start: 0,
            length: 1,
            audioRefId: clipId,
          },
        ],
      },
    ]);

    const exportSnapshot = service.createSnapshot();
    expect(Array.isArray(exportSnapshot.audioAssets?.[0]?.channels?.[0])).toBe(
      true,
    );

    await service.manualSave();

    const storedBundle = saveItem.mock.calls[0][1];
    expect(storedBundle.audioAssets?.[0]?.channels?.[0]).toBeInstanceOf(
      Float32Array,
    );

    stemAudioCache.clear();
    service.restoreFromSnapshot(storedBundle);
    const restored = Array.from(stemAudioCache.get(clipId).getChannelData(0));
    expect(restored[0]).toBeCloseTo(0.15, 5);
    expect(restored[1]).toBeCloseTo(-0.25, 5);
    expect(restored[2]).toBeCloseTo(0.35, 5);
  });

  it('rejects failed local saves without clearing dirty state or reporting a saved timestamp', async () => {
    service.isDirty.set(true);
    saveItem.mockRejectedValueOnce(new Error('Quota exceeded'));
    await expect(service.manualSave()).rejects.toThrow('Quota exceeded');
    expect(service.isDirty()).toBe(true);
    expect(service.lastPersistedAt()).toBe(0);
    expect(service.persistenceError()).toBe('Quota exceeded');
    expect(service.isSaving()).toBe(false);
  });

  it('preserves edits made while a save is in flight', async () => {
    let finish!: () => void;
    saveItem.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const saving = service.manualSave();
    await Promise.resolve();
    await Promise.resolve();
    service.updateMetadata({ name: 'Newer edit' });
    finish();
    await saving;
    expect(service.metadata()?.name).toBe('Newer edit');
    expect(service.isDirty()).toBe(true);
  });

  it('rejects malformed imports before writing or replacing the active session', async () => {
    const before = tracks();
    await expect(service.importProjectBundle({ metadata: {}, tracks: [] } as any)).resolves.toBe(false);
    expect(tracks()).toBe(before);
    expect(saveItem).not.toHaveBeenCalled();
    const duplicate = makeBundle();
    duplicate.tracks.push({ ...duplicate.tracks[0] });
    await expect(service.importProjectBundle(duplicate)).resolves.toBe(false);
    expect(saveItem).not.toHaveBeenCalled();
  });

  it('round-trips automation, arrangement sections, master gain and take state', () => {
    const automation = TestBed.inject(AutomationService);
    const manager = TestBed.inject(MusicManagerService);
    manager.structure.set([{ id: 'verse', name: 'Verse', start: 0, length: 8, color: '#0e7c7b' }]);
    automation.lanes.set([{ id: 'lane-1', target: { trackId: 'track-1', parameter: 'volume' }, points: [{ time: 0, value: 0.3 }], enabled: true, interpolation: 'linear', modulationDepth: 0 }]);
    manager.engine.masterGain.gain.value = 0.4;
    const snapshot = service.createSnapshot();
    automation.lanes.set([]);
    manager.engine.masterGain.gain.value = 0.9;
    service.restoreFromSnapshot(snapshot);
    expect(automation.lanes()).toEqual(snapshot.automation.lanes);
    expect(manager.structure()).toEqual(snapshot.structure);
    expect(manager.engine.masterGain.gain.value).toBe(0.4);
    expect(manager.selectedTrackId()).toBe('track-1');
  });

  it("persists manual saves locally before returning the bundle", async () => {
    const bundle = await service.manualSave();

    expect(bundle.metadata.id).toMatch(/^proj_/);
    expect(saveItem).toHaveBeenCalledWith(
      "projects",
      expect.objectContaining({
        id: `project_${bundle.metadata.id}`,
        tracks: bundle.tracks,
      }),
    );
    expect(saveItem).toHaveBeenCalledWith(
      "offline_local_cache",
      expect.objectContaining({
        id: "last_saved_project_id",
        payload: bundle.metadata.id,
      }),
    );
    expect(service.isDirty()).toBe(false);
    expect(service.lastPersistedAt()).toBeGreaterThan(0);
  });

  it("marks arrangement changes dirty even without metadata edits", async () => {
    expect(service.isDirty()).toBe(false);

    tracks.set([
      { id: "track-1", notes: [] },
      { id: "track-2", notes: [{ id: "note-1", step: 4 }] },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.isDirty()).toBe(true);
  });

  it("imports a bundle, restores tracks, and queues authenticated cloud sync", async () => {
    const user = { id: "artist-1" };
    // Recreate with the authenticated provider so the service receives it at construction.
    service.stopAutoSave();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ProjectWorkspaceService,
        { provide: AutomationService, useValue: { lanes: signal([]), macros: signal([]), modulationSources: signal([]) } },
        { provide: AuthService, useValue: { currentUser: signal(user) } },
        {
          provide: MusicManagerService,
          useValue: { tracks, structure: signal([]), selectedTrackId: signal(null), engine: { stop: jest.fn(), tempo: { set: tempoSet } } },
        },
        { provide: ProjectService, useValue: { currentProject: signal(null), projectDeleted$: new Subject<string>(), refresh: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: LocalStorageService,
          useValue: { saveItem, persistenceStatus: jest.fn().mockResolvedValue('ready'), getItem: jest.fn(), getAllItems: jest.fn() },
        },
        {
          provide: OfflineSyncService,
          useValue: { saveLocal: jest.fn(), queueOperation },
        },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    });
    service = TestBed.inject(ProjectWorkspaceService);

    const bundle = makeBundle();
    await expect(service.importProjectBundle(bundle)).resolves.toBe(true);

    expect(tracks()).toEqual(bundle.tracks);
    expect(queueOperation).toHaveBeenCalledWith(
      "CREATE",
      expect.stringContaining("/projects"),
      expect.objectContaining({
        projectId: bundle.metadata.id,
        userId: user.id,
      }),
      { userId: user.id },
    );
    expect(service.cloudSyncQueued()).toBe(true);
  });

  it("restores the freshest local bundle and tracks the recovery source", async () => {
    const olderBundle = {
      id: "project_proj_old",
      ...makeBundle(),
      savedAt: 100,
      source: "manual",
    };
    const newerBundle = {
      id: "recovery_proj_new",
      ...makeBundle(),
      metadata: { ...metadata, name: "Recovered Session", bpm: 132 },
      tracks: [{ id: "track-9", notes: [{ id: "n-1", step: 8 }] }],
      savedAt: 200,
      source: "recovery",
    };
    tracks.set([]);
    getAllItems.mockResolvedValue([olderBundle, newerBundle]);

    await expect(service.restoreLatestProjectState()).resolves.toBe(true);

    expect(service.metadata()?.name).toBe("Recovered Session");
    expect(service.lastRecoveredSource()).toBe("recovery");
    expect(service.lastRecoveredAt()).toBe(200);
    expect(tracks()).toEqual(newerBundle.tracks);
    expect(tempoSet).toHaveBeenCalledWith(132);
  });
});
