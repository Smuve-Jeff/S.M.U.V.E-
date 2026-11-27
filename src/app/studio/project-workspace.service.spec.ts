import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Subject } from 'rxjs';
import { AutomationService } from './automation.service';
import { AuthService } from "../services/auth.service";
import { LocalStorageService } from "../services/local-storage.service";
import { LoggingService } from "../services/logging.service";
import { MusicManagerService } from "../services/music-manager.service";
import { LiveEngineService } from "../services/live-engine.service";
import { OfflineSyncService } from "../services/offline-sync.service";
import { CloudSyncService } from "../services/cloud-sync.service";
import { PROJECT_BACKING_TRACK } from "./project-backing-track.token";
import { ProjectService } from "../services/project.service";
import {
  PROJECT_LEASE_KEY_PREFIX,
  PROJECT_SYNC_STATUS_STORE,
  ProjectBundle,
  ProjectWorkspaceService,
} from "./project-workspace.service";
import { ArrangementMarkersService } from "./arrangement-markers.service";
import { SidechainRoutingService } from "./sidechain-routing.service";
import { TempoMapService } from "./tempo-map.service";
import { MeterMapService } from "./meter-map.service";
import { VcaBusService } from "./vca-bus.service";
import * as audioChannelCodec from "./audio-channel-codec.util";

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
  let cloudQueuePush: jest.Mock;
  let cloudPushSucceeded: Subject<{
    projectId: string;
    at: number;
    uploadId?: string;
  }>;
  let cloudTimeline: ReturnType<typeof signal<any[]>>;
  let backingArchiveFile: jest.Mock;
  let tempoSet: jest.Mock;
  let monitorMono: ReturnType<typeof signal<boolean>>;
  let launchQuantize: ReturnType<typeof signal<any>>;
  let sceneFollowEnabled: ReturnType<typeof signal<boolean>>;
  let sceneFollowBars: ReturnType<typeof signal<number>>;
  let sceneFollowRules: ReturnType<typeof signal<Record<string, any>>>;
  let livePerformance: ReturnType<typeof signal<any>>;
  let getItem: jest.Mock;
  let getAllItems: jest.Mock;
  let deleteItems: jest.Mock;
  let projectRemove: jest.Mock;
  let tempoMarkers: ReturnType<typeof signal<any[]>>;
  let meterMarkers: ReturnType<typeof signal<any[]>>;
  let arrangementMarkers: ReturnType<typeof signal<any[]>>;
  let vcaBuses: ReturnType<typeof signal<any[]>>;
  let vcaAssignments: ReturnType<typeof signal<Record<string, string | null>>>;
  let sidechainRoutes: ReturnType<typeof signal<any[]>>;

  /** In-memory project-state services, shared by both TestBed configurations. */
  const projectStateProviders = () => [
    {
      provide: TempoMapService,
      useValue: {
        markers: tempoMarkers,
        clear: () => tempoMarkers.set([]),
        replaceAll: (markers: any[]) => tempoMarkers.set([...(markers ?? [])]),
      },
    },
    {
      provide: MeterMapService,
      useValue: {
        markers: meterMarkers,
        clear: () => meterMarkers.set([]),
        replaceAll: (markers: any[]) => meterMarkers.set([...(markers ?? [])]),
      },
    },
    {
      provide: ArrangementMarkersService,
      useValue: {
        markers: arrangementMarkers,
        clear: () => arrangementMarkers.set([]),
        replaceAll: (markers: any[]) =>
          arrangementMarkers.set([...(markers ?? [])]),
      },
    },
    {
      provide: VcaBusService,
      useValue: {
        buses: vcaBuses,
        assignments: vcaAssignments,
        replaceRouting: (
          buses: any[],
          assignments: Record<string, string | null>,
        ) => {
          vcaBuses.set([...(buses ?? [])]);
          vcaAssignments.set({ ...(assignments ?? {}) });
        },
        effectiveMultiplier: (trackId: string) => {
          const busId = vcaAssignments()[trackId];
          const bus = vcaBuses().find((item) => item.id === busId);
          if (!bus) return 1;
          return bus.muted ? 0 : bus.faderValue;
        },
      },
    },
    {
      provide: SidechainRoutingService,
      useValue: {
        routes: sidechainRoutes,
        clear: () => sidechainRoutes.set([]),
        replaceAll: (routes: any[]) => sidechainRoutes.set([...(routes ?? [])]),
      },
    },
  ];

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

  let authUser: ReturnType<typeof signal<any>>;

  beforeEach(() => {
    tracks = signal([{ id: "track-1", notes: [] }]);
    authUser = signal<any>(null);
    stemAudioCache = new Map<string, any>();
    saveItem = jest.fn().mockResolvedValue(undefined);
    queueOperation = jest.fn().mockResolvedValue("sync_test_1");
    cloudQueuePush = jest.fn().mockResolvedValue("sync_test_1");
    cloudPushSucceeded = new Subject<{
      projectId: string;
      at: number;
      uploadId?: string;
    }>();
    cloudTimeline = signal<any[]>([]);
    backingArchiveFile = jest.fn().mockReturnValue(null);
    tempoSet = jest.fn();
    monitorMono = signal(false);
    launchQuantize = signal("none");
    sceneFollowEnabled = signal(false);
    sceneFollowBars = signal(4);
    sceneFollowRules = signal<Record<string, any>>({});
    livePerformance = signal({ octave: 0, chordType: "minor" });
    getItem = jest.fn().mockResolvedValue(null);
    getAllItems = jest.fn().mockResolvedValue([]);
    deleteItems = jest.fn().mockResolvedValue(undefined);
    projectRemove = jest.fn().mockResolvedValue(false);
    tempoMarkers = signal<any[]>([]);
    meterMarkers = signal<any[]>([]);
    arrangementMarkers = signal<any[]>([]);
    vcaBuses = signal<any[]>([]);
    vcaAssignments = signal<Record<string, string | null>>({});
    sidechainRoutes = signal<any[]>([]);

    TestBed.configureTestingModule({
      providers: [
        ProjectWorkspaceService,
        {
          provide: LiveEngineService,
          useValue: {
            smartChords: signal(false),
            scaleLock: signal(false),
            scaleMode: signal("major"),
            scaleRoot: signal(0),
            arpeggiatorEnabled: signal(false),
            arpeggiatorRate: signal("8n"),
            arpeggiatorPattern: signal("up"),
            arpeggiatorLatch: signal(false),
            arpeggiatorSwing: signal(0),
            restorePerformanceState: jest.fn(),
          },
        },
        { provide: AutomationService, useValue: { lanes: signal([]), macros: signal([]), modulationSources: signal([]) } },
        {
          provide: AuthService,
          useValue: {
            currentUser: authUser,
            isGuest: () => authUser()?.role === 'Guest',
          },
        },
        {
          provide: MusicManagerService,
          useValue: {
            tracks,
            launchQuantize,
            setLaunchQuantize: (value: any) => {
              launchQuantize.set(value);
              return value;
            },
            sceneFollowEnabled,
            setSceneFollowEnabled: (enabled: boolean) => {
              sceneFollowEnabled.set(!!enabled);
              return enabled;
            },
            sceneFollowBars,
            setSceneFollowBars: (bars: number) => {
              const next = Math.min(32, Math.max(1, Math.floor(Number(bars) || 1)));
              sceneFollowBars.set(next);
              return next;
            },
            sceneFollowRules,
            setSceneFollowRules: (rules: Record<string, any>) => {
              sceneFollowRules.set({ ...(rules ?? {}) });
              return sceneFollowRules();
            },
            clearSceneFollowRules: () => sceneFollowRules.set({}),
            livePerformance,
            setLivePerformance: jest.fn(),
            structure: signal([]),
            selectedTrackId: signal(null),
            activeLoopBars: signal(64),
            arrangementEndBar: () => 4,
            captureMasterPluginState: () => ({ pluginIds: [], params: {} }),
            applyMasterPluginState: jest.fn(),
            stemAudioCache,
            updateClip: jest.fn(
              (trackId: string, clipId: string, patch: Record<string, any>) => {
                tracks.update((items) =>
                  items.map((track) =>
                    track.id === trackId
                      ? {
                          ...track,
                          clips: (track.clips ?? []).map((clip: any) =>
                            clip.id === clipId ? { ...clip, ...patch } : clip,
                          ),
                        }
                      : track,
                  ),
                );
              },
            ),
            removeClip: jest.fn((trackId: string, clipId: string) => {
              tracks.update((items) =>
                items.map((track) =>
                  track.id === trackId
                    ? {
                        ...track,
                        clips: (track.clips ?? []).filter(
                          (clip: any) => clip.id !== clipId,
                        ),
                      }
                    : track,
                ),
              );
            }),
            engine: {
              stop: jest.fn(),
              tempo: { set: tempoSet },
              timeSignature: signal({ beats: 4, unit: 4 }),
              setTimeSignature: (beats: number, unit: number) => {
                const engine = (TestBed.inject(MusicManagerService) as any).engine;
                engine.timeSignature.set({ beats, unit });
                return { beats, unit };
              },
              masterGain: { gain: { value: 0.8 } },
              monoMonitoring: monitorMono,
              setMonoMonitoring: (enabled: boolean) => {
                monitorMono.set(enabled);
                return enabled;
              },
              playbackLoopEnabled: signal(false),
              playbackLoopStart: signal<number | null>(null),
              playbackLoopEnd: signal<number | null>(null),
              setPlaybackLoop: (start: number | null, end: number | null) => {
                const engine = (TestBed.inject(MusicManagerService) as any).engine;
                engine.playbackLoopStart.set(start);
                engine.playbackLoopEnd.set(end);
                if (start === null || end === null) {
                  engine.playbackLoopEnabled.set(false);
                  return false;
                }
                return true;
              },
              togglePlaybackLoop: (enabled?: boolean) => {
                const engine = (TestBed.inject(MusicManagerService) as any).engine;
                engine.playbackLoopEnabled.set(enabled === true);
                return enabled === true;
              },
              setSongLengthSteps: jest.fn(),
              setVcaMultiplier: jest.fn(),
              getMasteringTargets: () => ({ lufs: -14, truePeak: -0.1 }),
              getMasterToneEq: () => ({
                lowShelfDb: 0,
                lowMidDb: 0,
                highShelfDb: 0,
              }),
              getMasterWidth: () => 1,
              getMasterMakeupDb: () => 0,
              setMasterToneEq: jest.fn(),
              setMasterWidth: jest.fn(),
              setMasterMakeupDb: jest.fn(),
              setMasteringTargets: jest.fn(),
              ctx: {
                decodeAudioData: jest.fn(async () =>
                  createFakeAudioBuffer([[0.3, -0.3, 0.2]]),
                ),
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
          useValue: { currentProject: signal(null), projectDeleted$: new Subject<string>(), refresh: jest.fn().mockResolvedValue(undefined), remove: projectRemove },
        },
        {
          provide: LocalStorageService,
          useValue: {
            saveItem,
            persistenceStatus: jest.fn().mockResolvedValue('ready'),
            getItem,
            getAllItems,
            deleteItems,
          },
        },
        {
          provide: OfflineSyncService,
          useValue: {
            saveLocal: jest.fn().mockResolvedValue(undefined),
            queueOperation,
            registerEndpointHandler: jest.fn().mockReturnValue(jest.fn()),
          },
        },
        {
          provide: CloudSyncService,
          useValue: {
            queuePush: (...args: unknown[]) => cloudQueuePush(...args),
            pushSucceeded$: cloudPushSucceeded,
            timeline: cloudTimeline,
            payloadBytes: (payload: unknown) =>
              JSON.stringify(payload ?? null).length,
          },
        },
        {
          provide: PROJECT_BACKING_TRACK,
          useValue: {
            archiveFile: (...args: unknown[]) => backingArchiveFile(...args),
            adoptProject: jest.fn().mockResolvedValue(true),
            restoreProject: jest.fn().mockResolvedValue(false),
            persistProject: jest.fn().mockResolvedValue(undefined),
            forgetProject: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        ...projectStateProviders(),
      ],
    });
    service = TestBed.inject(ProjectWorkspaceService);
  });

  afterEach(() => {
    service.stopAutoSave();
    Object.keys(localStorage)
      .filter((key) => key.startsWith(PROJECT_LEASE_KEY_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  });

  it("creates a complete local snapshot and applies genre tempo", () => {
    service.updateMetadata({ name: "Night Drive" });
    service.setGenre("house");

    const snapshot = service.createSnapshot();

    expect(snapshot.metadata.name).toBe("Night Drive");
    expect(snapshot.metadata.genre).toBe("house");
    expect(snapshot.tracks).toEqual(tracks());
    expect(tempoSet).toHaveBeenCalledWith(124);
  });

  it("round-trips the saved drum channel cycle length", () => {
    tracks.set([{ id: 'drums', type: 'drum', drumPatternLength: 7, notes: [], clips: [] }] as any);
    const snapshot = JSON.parse(JSON.stringify(service.createSnapshot()));
    tracks.set([]);
    service.restoreFromSnapshot(snapshot);
    expect(tracks()[0].drumPatternLength).toBe(7);
  });

  it("stores the engine meter in the snapshot metadata", () => {
    const engine = (TestBed.inject(MusicManagerService) as any).engine;
    engine.setTimeSignature(3, 4);

    const snapshot = service.createSnapshot();

    expect(snapshot.metadata.timeSignature).toEqual([3, 4]);
  });

  it("restores the saved meter onto the engine", () => {
    const engine = (TestBed.inject(MusicManagerService) as any).engine;
    service.restoreFromSnapshot({
      ...makeBundle(),
      metadata: { ...metadata, timeSignature: [6, 8] },
    });

    expect(engine.timeSignature()).toEqual({ beats: 6, unit: 8 });
  });

  it("opens pre-meter bundles in 4/4 instead of inheriting the last set", () => {
    const engine = (TestBed.inject(MusicManagerService) as any).engine;
    engine.setTimeSignature(5, 4);

    service.restoreFromSnapshot(makeBundle());

    expect(engine.timeSignature()).toEqual({ beats: 4, unit: 4 });
  });

  it("clears a cloud size refusal when another project is restored", () => {
    service.cloudSyncRefusal.set(
      "Saved on this device, but this version is too large to sync.",
    );

    service.restoreFromSnapshot(makeBundle());

    expect(service.cloudSyncRefusal()).toBe("");
  });

  it("saves a tempo or meter edit shortly after it lands", () => {
    jest.useFakeTimers();
    const save = jest.spyOn(service, "autoSave").mockResolvedValue(undefined);
    service.autoSaveEnabled.set(true);
    service.isDirty.set(true);

    (service as any).scheduleTransportSave();
    jest.advanceTimersByTime(1300);

    expect(save).toHaveBeenCalledTimes(1);
    save.mockRestore();
    jest.useRealTimers();
  });

  it("does not write from the transport debounce while the set is clean", () => {
    jest.useFakeTimers();
    const save = jest.spyOn(service, "autoSave").mockResolvedValue(undefined);
    service.autoSaveEnabled.set(true);
    service.isDirty.set(false);

    (service as any).scheduleTransportSave();
    jest.advanceTimersByTime(1300);

    expect(save).not.toHaveBeenCalled();
    save.mockRestore();
    jest.useRealTimers();
  });

  it("applies the genre vocabulary the app actually offers", () => {
    // These are the questionnaire's own values; the old map keyed on lowercase
    // hyphenated names, so every one of them silently kept the previous tempo.
    const cases: Array<[string, number]> = [
      ["Hip Hop", 90],
      ["R&B", 90],
      ["Drum & Bass", 174],
      ["K-Pop", 120],
      ["Lo-Fi", 78],
      ["Neo-Soul", 92],
      ["Rock", 120],
      ["House", 124],
    ];

    for (const [genre, bpm] of cases) {
      tempoSet.mockClear();
      service.setGenre(genre);
      expect(service.metadata()?.bpm).toBe(bpm);
      expect(tempoSet).toHaveBeenCalledWith(bpm);
    }
  });

  it("records an unknown genre without inventing a tempo for it", () => {
    service.setGenre("house");
    const houseTempo = service.metadata()?.bpm;

    tempoSet.mockClear();
    service.setGenre("Gregorian Throat Singing");

    expect(service.metadata()?.genre).toBe("Gregorian Throat Singing");
    expect(service.metadata()?.bpm).toBe(houseTempo);
    expect(tempoSet).not.toHaveBeenCalled();
  });

  it("sets a mood alongside the tempo for a known genre", () => {
    service.setGenre("Trap");
    expect(service.metadata()?.mood).toBe("dark");
    service.setGenre("Reggae");
    expect(service.metadata()?.mood).toBe("chill");
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

  it("persists an imported drum one-shot even before a step is programmed", () => {
    const sampleRefId = "drum-sample-pad-36-kick";
    const buffer = createFakeAudioBuffer([[0.2, -0.35, 0.45]]);
    stemAudioCache.set(sampleRefId, buffer);
    tracks.set([
      {
        id: MusicManagerService.DRUM_TRACK_ID,
        type: "drum",
        notes: [],
        drumPadSamples: [
          {
            id: "pad-36",
            sampleRefId,
            sampleName: "kick.wav",
            sampleMeta: { sampleRate: 48000, channels: 1, duration: 0.5 },
          },
        ],
      },
    ]);

    const snapshot = service.createSnapshot();
    expect(snapshot.tracks[0].drumPadSamples[0].sampleRefId).toBe(sampleRefId);
    expect(snapshot.audioAssets).toEqual([
      expect.objectContaining({
        id: sampleRefId,
        channelCount: 1,
        frameCount: 3,
      }),
    ]);

    stemAudioCache.clear();
    service.restoreFromSnapshot(snapshot);
    expect(stemAudioCache.get(sampleRefId)).toBeTruthy();
    expect(
      Array.from(stemAudioCache.get(sampleRefId).getChannelData(0)),
    ).toEqual([0.20000000298023224, -0.3499999940395355, 0.44999998807907104]);
    expect(tracks()[0].drumPadSamples[0].sampleRefId).toBe(sampleRefId);
  });

  it("stores a note-level one-shot by reference and strips its PCM from JSON", () => {
    const buffer = createFakeAudioBuffer([[0.2, -0.35, 0.45]]);
    tracks.set([
      {
        id: MusicManagerService.DRUM_TRACK_ID,
        type: "drum",
        notes: [
          {
            id: "hit-1",
            midi: 36,
            step: 0,
            length: 1,
            velocity: 0.9,
            params: { sampleBuffer: buffer },
          },
        ],
      },
    ]);

    const snapshot = service.createSnapshot();
    const note = snapshot.tracks[0].notes[0];
    expect(note.params.sampleRefId).toBe("drum-sample-track_drums_100-hit-1");
    expect(note.params.sampleBuffer).toBeUndefined();
    expect(snapshot.audioAssets).toEqual([
      expect.objectContaining({ id: "drum-sample-track_drums_100-hit-1" }),
    ]);
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
    expect(typeof exportSnapshot.audioAssets?.[0]?.channels?.[0]).toBe("string");
    expect(exportSnapshot.audioAssets?.[0]?.channels?.[0]).toMatch(/^f32b64:/);

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

  it('reports a failed autosave instead of claiming the sketch is safe', async () => {
    service.isDirty.set(true);
    saveItem.mockRejectedValueOnce(new Error('Quota exceeded'));

    await expect(service.autoSave()).resolves.toBe(false);

    expect(service.isDirty()).toBe(true);
    expect(service.persistenceError()).toBe('Quota exceeded');
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

  it('reads a float32 fader value back as the master gain that was saved', () => {
    // AudioParam.value is float32: a master gain saved as 0.8 reads back as
    // 0.800000011920929. Comparing that raw kept every project permanently
    // dirty, so the status strip could never reach "Saved locally".
    const engine = (TestBed.inject(MusicManagerService) as any).engine;
    engine.masterGain.gain.value = 0.8;
    const saved = (service as any).captureStateSignature();

    engine.masterGain.gain.value = 0.800000011920929;

    expect((service as any).captureStateSignature()).toBe(saved);
  });

  it('counts the versions that clearing would remove', async () => {
    const id = service.metadata()!.id;
    const payload = { id: `project_${id}`, metadata: { id, name: 'Sized' }, tracks: [] };
    getAllItems.mockImplementation((store: string) =>
      Promise.resolve(
        store === 'projects'
          ? []
          : [3, 2, 1].map((n) => ({
              id: `version_${id}_${n}`,
              projectId: id,
              savedAt: n,
              title: 'Sized',
              version: n,
              payload,
            })),
      ),
    );

    const usage = await service.measureStorageUsage();

    expect(usage.sets[0].versionCount).toBe(3);
    expect(usage.staleVersionCount).toBe(2);
    expect(usage.staleVersionBytes).toBeGreaterThan(0);
  });

  it('puts a deleted version back unchanged', async () => {
    const version = {
      id: 'version_proj_x_9',
      projectId: 'proj_x',
      savedAt: 9,
      title: 'Back',
      version: 9,
      payload: { id: 'project_proj_x', metadata: { id: 'proj_x' }, tracks: [] },
    } as any;

    await expect(service.restoreDeletedVersion(version)).resolves.toBe(true);

    expect(saveItem).toHaveBeenCalledWith('offline_local_cache', version);
    await expect(service.restoreDeletedVersion({} as any)).resolves.toBe(false);
  });

  it('deletes exactly one version by its record id', async () => {
    const id = service.metadata()!.id;
    const versionId = `version_${id}_7`;

    await expect(service.deleteLocalVersion(versionId)).resolves.toBe(true);

    expect(deleteItems).toHaveBeenCalledTimes(1);
    expect(deleteItems).toHaveBeenCalledWith('offline_local_cache', [versionId]);
    await expect(service.deleteLocalVersion('')).resolves.toBe(false);
  });

  it('clears only the set it is asked about', async () => {
    const id = service.metadata()!.id;
    const payloadFor = (projectId: string) => ({
      id: `project_${projectId}`,
      metadata: { id: projectId, name: projectId },
      tracks: [],
    });
    getAllItems.mockResolvedValue([
      ...[2, 1].map((n) => ({
        id: `version_${id}_${n}`,
        projectId: id,
        savedAt: n,
        title: id,
        version: n,
        payload: payloadFor(id),
      })),
      ...[5, 4].map((n) => ({
        id: `version_proj_other_${n}`,
        projectId: 'proj_other',
        savedAt: n,
        title: 'other',
        version: n,
        payload: payloadFor('proj_other'),
      })),
    ]);

    const result = await service.clearOldLocalVersions(id);

    expect(result.removed).toBe(1);
    expect(deleteItems).toHaveBeenCalledWith('offline_local_cache', [
      `version_${id}_1`,
    ]);
  });

  it('clears every version but the newest one per set', async () => {
    const id = service.metadata()!.id;
    const payload = { id: `project_${id}`, metadata: { id, name: 'Sized' }, tracks: [] };
    getAllItems.mockResolvedValue(
      [3, 2, 1].map((n) => ({
        id: `version_${id}_${n}`,
        projectId: id,
        savedAt: n,
        title: 'Sized',
        version: n,
        payload,
      })),
    );

    const result = await service.clearOldLocalVersions();

    expect(result.removed).toBe(2);
    expect(result.freedBytes).toBeGreaterThan(0);
    expect(deleteItems).toHaveBeenCalledWith('offline_local_cache', [
      `version_${id}_2`,
      `version_${id}_1`,
    ]);
  });

  it('measures the room a set and its device versions take', async () => {
    const id = service.metadata()!.id;
    const record = {
      id: `project_${id}`,
      metadata: { id, name: 'Sized', bpm: 120, timeSignature: [4, 4] },
      tracks: [],
      audioAssets: [
        { id: 'take-1', sampleRate: 44100, channelCount: 2, frameCount: 100, duration: 0 },
      ],
      savedAt: 5,
      source: 'manual',
    };
    const version = (n: number) => ({
      id: `version_${id}_${n}`,
      projectId: id,
      savedAt: n,
      title: 'Sized',
      version: n,
      payload: record,
    });
    getAllItems.mockImplementation((store: string) =>
      Promise.resolve(store === 'projects' ? [record] : [version(2), version(1)]),
    );

    const usage = await service.measureStorageUsage();

    expect(usage.sets).toHaveLength(1);
    expect(usage.sets[0].versionCount).toBe(2);
    // 100 frames x 2 channels x 4 bytes of samples, plus the JSON around them.
    expect(usage.sets[0].setBytes).toBeGreaterThan(800);
    expect(usage.sets[0].versionBytes).toBe(usage.sets[0].setBytes * 2);
    expect(usage.totalBytes).toBe(usage.sets[0].setBytes * 3);
  });

  it('keeps a device version with every manual save', async () => {
    await service.manualSave();

    const versions = saveItem.mock.calls.filter(
      ([store, item]) =>
        store === 'offline_local_cache' &&
        String(item?.id || '').startsWith('version_'),
    );

    expect(versions).toHaveLength(1);
    expect(versions[0][1].projectId).toBe(service.metadata()!.id);
    expect(versions[0][1].payload.source).toBe('recovery');
  });

  it('keeps a device version the history panel can fall back to', async () => {
    await expect(service.saveLocalVersion()).resolves.toBe(true);

    const [store, record] = saveItem.mock.calls.at(-1)!;
    expect(store).toBe('offline_local_cache');
    expect(record.id.startsWith('version_')).toBe(true);
    expect(record.projectId).toBe(service.metadata()!.id);
    expect(record.payload.metadata.id).toBe(record.projectId);
  });

  it('lists only this project\'s device versions, newest first', async () => {
    const id = service.metadata()!.id;
    getAllItems.mockResolvedValue([
      { id: `version_${id}_1`, projectId: id, savedAt: 10, title: 'A', version: 2, payload: { metadata: { id } } },
      { id: `version_${id}_2`, projectId: id, savedAt: 20, title: 'B', version: 3, payload: { metadata: { id } } },
      { id: 'version_proj_other_3', projectId: 'proj_other', savedAt: 30, title: 'C', version: 1, payload: { metadata: { id: 'proj_other' } } },
      { id: 'last_saved_project_id', payload: id, savedAt: 40 },
    ]);

    const versions = await service.listLocalVersions(id);

    expect(versions.map((version) => version.title)).toEqual(['B', 'A']);
    expect(getAllItems).toHaveBeenCalledWith('offline_local_cache');
  });

  it('keeps no device version for a guest', async () => {
    authUser.set({ id: 'guest_1', role: 'Guest' });

    await expect(service.saveLocalVersion()).resolves.toBe(false);

    expect(saveItem).not.toHaveBeenCalled();
  });

  it('refuses to save a guest session and writes nothing', async () => {
    authUser.set({ id: 'guest_1', role: 'Guest' });
    service.isDirty.set(true);

    await expect(service.manualSave()).rejects.toThrow(
      'Guest sessions are not saved'
    );

    expect(saveItem).not.toHaveBeenCalled();
    expect(service.isDirty()).toBe(true);
  });

  it('skips auto-save for a guest session', async () => {
    authUser.set({ id: 'guest_1', role: 'Guest' });
    service.isDirty.set(true);

    await expect(service.autoSave()).resolves.toBe(false);

    expect(saveItem).not.toHaveBeenCalled();
    expect(service.isDirty()).toBe(true);
  });

  it('writes no recovery snapshot for a guest session', async () => {
    authUser.set({ id: 'guest_1', role: 'Guest' });

    await (service as any).persistRecoverySnapshot();

    expect(saveItem).not.toHaveBeenCalled();
  });

  it('downloads a guest export without caching it in the vault', () => {
    authUser.set({ id: 'guest_1', role: 'Guest' });
    service.restoreFromSnapshot(makeBundle());
    const offline = TestBed.inject(OfflineSyncService) as any;
    const originalCreate = (URL as any).createObjectURL;
    const originalRevoke = (URL as any).revokeObjectURL;
    (URL as any).createObjectURL = jest.fn(() => 'blob:guest-export');
    (URL as any).revokeObjectURL = jest.fn();

    try {
      service.downloadProjectBundle();
    } finally {
      (URL as any).createObjectURL = originalCreate;
      (URL as any).revokeObjectURL = originalRevoke;
    }

    expect((URL as any).createObjectURL).toBeDefined();
    expect(offline.saveLocal).not.toHaveBeenCalled();
  });

  it('caches a signed-in export for recovery', () => {
    service.restoreFromSnapshot(makeBundle());
    const offline = TestBed.inject(OfflineSyncService) as any;
    const originalCreate = (URL as any).createObjectURL;
    const originalRevoke = (URL as any).revokeObjectURL;
    (URL as any).createObjectURL = jest.fn(() => 'blob:artist-export');
    (URL as any).revokeObjectURL = jest.fn();

    try {
      service.downloadProjectBundle();
    } finally {
      (URL as any).createObjectURL = originalCreate;
      (URL as any).revokeObjectURL = originalRevoke;
    }

    expect(offline.saveLocal).toHaveBeenCalled();
  });

  it('opens a guest import in the tab without writing a project record', async () => {
    authUser.set({ id: 'guest_1', role: 'Guest' });
    const bundle = makeBundle();
    const importUrl = (URL as any).createObjectURL;
    (URL as any).createObjectURL = jest.fn(() => 'blob:noop');
    (URL as any).revokeObjectURL = jest.fn();

    try {
      const result = await service.importProjectBundle(bundle);
      expect(result).toBe(true);
    } finally {
      (URL as any).createObjectURL = importUrl;
    }

    expect(saveItem).not.toHaveBeenCalled();
    expect(service.metadata()?.id).toBe(bundle.metadata.id);
  });

  it('skips the recovery snapshot for a workspace that is already saved', async () => {
    service.isDirty.set(false);

    await (service as any).persistRecoverySnapshot();

    expect(saveItem).not.toHaveBeenCalled();
  });

  it('writes a recovery snapshot while the workspace has unsaved changes', async () => {
    service.isDirty.set(true);

    await (service as any).persistRecoverySnapshot();

    expect(saveItem).toHaveBeenCalledWith(
      'projects',
      expect.objectContaining({ source: 'recovery' }),
    );
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

  it('blocks an import whose audio clips have no matching take', async () => {
    const bundle = makeBundle();
    bundle.tracks = [
      {
        id: 'track-vocal',
        name: 'Lead Vocal',
        notes: [],
        clips: [
          {
            id: 'clip-vocal',
            name: 'Take 2',
            type: 'audio',
            audioRefId: 'missing-take',
            start: 0,
            length: 4,
          },
        ],
      },
    ];

    await expect(service.importProjectBundle(bundle)).resolves.toBe(false);

    expect(saveItem).not.toHaveBeenCalled();
    expect(service.audioIntegrity()).toEqual(
      expect.objectContaining({
        ok: false,
        missingCount: 1,
        issues: [
          expect.objectContaining({
            clipName: 'Take 2',
            trackName: 'Lead Vocal',
            reason: 'missing-asset',
          }),
        ],
      }),
    );
    expect(service.persistenceError()).toContain('Import blocked');
    expect(service.persistenceError()).toContain('missing-take');
  });

  it('blocks an export whose audio clips have no matching take', () => {
    tracks.set([
      {
        id: 'track-vocal',
        name: 'Lead Vocal',
        notes: [],
        clips: [
          {
            id: 'clip-vocal',
            name: 'Take 2',
            type: 'audio',
            audioRefId: 'missing-take',
            start: 0,
            length: 4,
          },
        ],
      },
    ]);

    expect(() => service.downloadProjectBundle()).toThrow(/Export blocked/);
    expect(service.audioIntegrity()).toEqual(
      expect.objectContaining({ ok: false, missingCount: 1 }),
    );
  });

  it('relinks a missing take from a local audio file and clears the report', async () => {
    tracks.set([
      {
        id: 'track-vocal',
        name: 'Lead Vocal',
        notes: [],
        clips: [
          {
            id: 'clip-vocal',
            name: 'Take 2',
            type: 'audio',
            audioRefId: 'missing-take',
            start: 0,
            length: 4,
          },
        ],
      },
    ]);
    service.inspectCurrentAudioIntegrity();
    const issue = service.audioIntegrity()!.issues[0];
    const manager = TestBed.inject(MusicManagerService) as any;
    const file = new File([new Uint8Array([1, 2, 3])], 'take.wav', {
      type: 'audio/wav',
    });

    await expect(service.relinkMissingTake(issue, file)).resolves.toBe(true);

    expect(manager.engine.ctx.decodeAudioData).toHaveBeenCalled();
    expect(manager.stemAudioCache.has('clip-vocal')).toBe(true);
    expect(tracks()[0].clips[0].audioRefId).toBe('clip-vocal');
    expect(service.audioIntegrity()?.ok).toBe(true);
    expect(service.canRepairAudio()).toBe(false);
  });

  it('removes one missing clip and re-checks the project', () => {
    tracks.set([
      {
        id: 'track-vocal',
        name: 'Lead Vocal',
        notes: [],
        clips: [
          {
            id: 'clip-vocal',
            name: 'Take 2',
            type: 'audio',
            audioRefId: 'missing-take',
            start: 0,
            length: 4,
          },
        ],
      },
    ]);
    service.inspectCurrentAudioIntegrity();

    expect(service.canRepairAudio()).toBe(true);
    expect(service.removeMissingTake(service.audioIntegrity()!.issues[0])).toBe(
      true,
    );

    expect(tracks()[0].clips).toEqual([]);
    expect(service.audioIntegrity()?.ok).toBe(true);
  });

  it('blocks manual save when a referenced take is missing', async () => {
    tracks.set([
      {
        id: 'track-vocal',
        name: 'Lead Vocal',
        notes: [],
        clips: [
          {
            id: 'clip-vocal',
            name: 'Take 2',
            type: 'audio',
            audioRefId: 'missing-take',
          },
        ],
      },
    ]);

    await expect(service.manualSave()).rejects.toThrow('Save blocked');

    expect(saveItem).not.toHaveBeenCalled();
    expect(service.audioIntegrity()?.ok).toBe(false);
  });

  it('pauses autosave instead of overwriting a good copy with a missing take', async () => {
    tracks.set([
      {
        id: 'track-vocal',
        name: 'Lead Vocal',
        notes: [],
        clips: [
          {
            id: 'clip-vocal',
            name: 'Take 2',
            type: 'audio',
            audioRefId: 'missing-take',
            start: 0,
            length: 4,
          },
        ],
      },
    ]);
    service.isDirty.set(true);

    await expect(service.autoSave()).resolves.toBe(false);

    expect(saveItem).not.toHaveBeenCalled();
    expect(service.persistenceError()).toContain('Auto-save paused');
    expect(service.audioIntegrity()?.ok).toBe(false);
  });

  it('skips cloud sync when the snapshot is missing audio', async () => {
    const missing = makeBundle();
    missing.tracks = [
      {
        id: 'track-vocal',
        name: 'Lead Vocal',
        notes: [],
        clips: [
          {
            id: 'clip-vocal',
            name: 'Take 2',
            type: 'audio',
            audioRefId: 'missing-take',
          },
        ],
      },
    ];

    await (service as any).tryQueueCloudSync(missing);

    expect(queueOperation).not.toHaveBeenCalled();
    expect(TestBed.inject(LoggingService).warn).toHaveBeenCalledWith(
      'ProjectWorkspace: Cloud sync skipped; audio is incomplete',
      expect.stringContaining('Cloud sync paused'),
    );
    expect(service.audioIntegrity()?.ok).toBe(false);
  });

  it('refuses an oversized cloud version before base64 conversion', async () => {
    authUser.set({ id: 'artist_1' });
    cloudQueuePush.mockClear();
    const huge = {
      ...makeBundle(),
      metadata: { ...metadata, id: 'proj_huge', name: 'Huge Set' },
      audioAssets: [
        {
          id: 'take-huge',
          sampleRate: 44100,
          channelCount: 2,
          // Deliberately larger than the 512 MiB cloud ceiling without
          // allocating the samples: the guard must read the binary shape.
          frameCount: 200_000_000,
          duration: 1,
          channels: [new Float32Array([0]), new Float32Array([0])],
        },
      ],
    };
    const convert = jest.spyOn(service as any, 'toCloudSafeBundle');
    const encode = jest.spyOn(audioChannelCodec, 'encodeFloat32Channel');

    try {
      await (service as any).tryQueueCloudSync(huge);

      expect(convert).not.toHaveBeenCalled();
      expect(encode).not.toHaveBeenCalled();
      expect(cloudQueuePush).not.toHaveBeenCalled();
      expect(service.cloudSyncQueued()).toBe(false);
      expect(service.cloudSyncRefusal()).toContain('Saved on this device');
      expect(service.cloudSyncRefusal()).toContain('too large to sync');
      expect(service.cloudSyncRefusal()).toContain('512 MB');
      const status = service.syncStatusFor('proj_huge');
      expect(status?.state).toBe('too-large');
      expect(status?.breakdown.audioBytes).toBeGreaterThan(512 * 1024 * 1024);
      expect(status?.breakdown.totalBytes).toBeGreaterThan(512 * 1024 * 1024);
    } finally {
      convert.mockRestore();
      encode.mockRestore();
    }
  });

  it('queues binary audio as compact base64 channels through the versioned contract', async () => {
    authUser.set({ id: 'artist_1' });
    cloudQueuePush.mockClear();
    const binaryBundle = {
      ...makeBundle(),
      metadata: { id: 'proj_sync', name: 'Sync Me', bpm: 120 },
      audioAssets: [
        {
          id: 'take-1',
          sampleRate: 44100,
          channelCount: 1,
          frameCount: 2,
          duration: 1,
          channels: [new Float32Array([0.1, -0.2])],
        },
      ],
    };

    await (service as any).queueCloudSync(binaryBundle);

    expect(cloudQueuePush).toHaveBeenCalledTimes(1);
    const [projectId, title, payload] = cloudQueuePush.mock.calls[0];
    expect(projectId).toBe('proj_sync');
    expect(title).toBe('Sync Me');
    const channels = (payload as any).audioAssets[0].channels;
    expect(typeof channels[0]).toBe('string');
    expect(channels[0]).toMatch(/^f32b64:/);
    // The queued copy converts; the live binary bundle keeps its typed arrays.
    expect(binaryBundle.audioAssets[0].channels[0]).toBeInstanceOf(Float32Array);
    // The compact channel restores to the same samples.
    const jsonBundle = JSON.parse(JSON.stringify(payload));
    stemAudioCache.clear();
    service.restoreFromSnapshot(jsonBundle);
    const restored = stemAudioCache.get('take-1');
    expect(restored).toBeTruthy();
    expect(restored.getChannelData(0)[0]).toBeCloseTo(0.1, 5);
    expect(restored.getChannelData(0)[1]).toBeCloseTo(-0.2, 5);
  });

  it('folds the guide vocal into the outbound cloud bundle', async () => {
    authUser.set({ id: 'artist_1' });
    cloudQueuePush.mockClear();
    backingArchiveFile.mockReturnValue({
      name: 'Guide Take',
      mimeType: 'audio/mpeg',
      data: new Uint8Array([1, 2, 3, 4]),
    });
    const bundle = {
      ...makeBundle(),
      metadata: { id: 'proj_sync', name: 'Sync Me', bpm: 120 },
    };

    await (service as any).queueCloudSync(bundle);

    const payload = cloudQueuePush.mock.calls[0][2] as any;
    expect(payload.guideTrack).toMatchObject({
      name: 'Guide Take',
      mimeType: 'audio/mpeg',
      byteSize: 4,
    });
    expect(typeof payload.guideTrack.dataBase64).toBe('string');
    // The source bundle is untouched — the guide rides a copy.
    expect((bundle as any).guideTrack).toBeUndefined();
  });

  it('leaves an oversized guide on the device instead of stalling the push', async () => {
    authUser.set({ id: 'artist_1' });
    cloudQueuePush.mockClear();
    backingArchiveFile.mockReturnValue({
      name: 'Huge Instrumental',
      mimeType: 'audio/mpeg',
      data: new Uint8Array(7 * 1024 * 1024),
    });
    const bundle = {
      ...makeBundle(),
      metadata: { id: 'proj_sync', name: 'Sync Me', bpm: 120 },
    };

    await (service as any).queueCloudSync(bundle);

    const payload = cloudQueuePush.mock.calls[0][2] as any;
    expect(payload.guideTrack).toBeUndefined();
    expect(cloudQueuePush).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(LoggingService).warn).toHaveBeenCalledWith(
      expect.stringContaining('exceeds'),
    );
  });

  it('adopts a cloud bundle guide on a device that never had the file', async () => {
    const guideBytes = new Uint8Array([10, 20, 30]);
    let binary = '';
    for (const byte of guideBytes) binary += String.fromCharCode(byte);
    const bundle = {
      ...makeBundle(),
      metadata: { id: 'proj_guide', name: 'Guide Set', bpm: 120 },
      guideTrack: {
        name: 'Guide Take',
        mimeType: 'audio/mpeg',
        dataBase64: btoa(binary),
        byteSize: guideBytes.byteLength,
      },
    };

    service.restoreFromSnapshot(bundle as any);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const backing = TestBed.inject(PROJECT_BACKING_TRACK) as any;
    expect(backing.adoptProject).toHaveBeenCalledWith(
      'proj_guide',
      expect.objectContaining({ name: 'Guide Take' }),
      expect.objectContaining({ persist: true }),
    );
    const blob = backing.adoptProject.mock.calls[0][1].blob as Blob;
    expect(blob.size).toBe(guideBytes.byteLength);
  });

  it('rejects a bundle whose live rig names a value no control can produce', async () => {
    const bundle = makeBundle() as any;
    bundle.session = {
      performance: {
        smartChords: true,
        scaleLock: false,
        scaleMode: 'major',
        scaleRoot: 0,
        arpEnabled: false,
        arpRate: '8n',
        arpPattern: 'up',
        arpLatch: false,
        arpSwing: 0,
        octave: 0,
        chordType: 'power',
      },
    };
    const before = tracks();

    await expect(service.importProjectBundle(bundle)).resolves.toBe(false);

    expect(tracks()).toBe(before);
    expect(saveItem).not.toHaveBeenCalled();
  });

  it('imports a rig with the augmented chord the editor can build', async () => {
    const bundle = makeBundle() as any;
    bundle.session = {
      performance: {
        smartChords: false,
        scaleLock: false,
        scaleMode: 'dorian',
        scaleRoot: 7,
        arpEnabled: true,
        arpRate: '16n',
        arpPattern: 'upDown',
        arpLatch: true,
        arpSwing: 0.2,
        octave: -1,
        chordType: 'aug',
      },
    };

    await expect(service.importProjectBundle(bundle)).resolves.toBe(true);

    expect(
      TestBed.inject(MusicManagerService).setLivePerformance,
    ).toHaveBeenCalledWith(expect.objectContaining({ chordType: 'aug' }));
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

  it("round-trips solo-safe, mono, launch quantization and follow actions", () => {
    tracks.set([
      {
        id: "track-1",
        notes: [],
        soloSafe: true,
        patternSlots: [
          {
            id: "slot-a",
            name: "Guide",
            activeVersionId: "v1",
            versions: [],
            launchQuantize: "2bar",
          },
          {
            id: "slot-b",
            name: "Drop",
            activeVersionId: "v2",
            versions: [],
            launchQuantize: null,
          },
        ],
      },
    ]);
    monitorMono.set(true);
    launchQuantize.set("4bar");
    sceneFollowEnabled.set(true);
    sceneFollowBars.set(8);
    sceneFollowRules.set({
      "slot-a": { mode: "loop" },
      "slot-b": { mode: "advance", bars: 8 },
    });

    const snapshot = service.createSnapshot();
    expect(snapshot.mixState.monitorMono).toBe(true);
    expect(snapshot.session?.launchQuantize).toBe("4bar");
    expect(snapshot.session?.followEnabled).toBe(true);
    expect(snapshot.session?.followBars).toBe(8);
    expect(snapshot.session?.sceneFollowRules).toEqual({
      "slot-a": { mode: "loop" },
      "slot-b": { mode: "advance", bars: 8 },
    });
    expect(snapshot.tracks[0].soloSafe).toBe(true);
    expect(snapshot.tracks[0].patternSlots[0].launchQuantize).toBe("2bar");
    expect(snapshot.tracks[0].patternSlots[1].launchQuantize).toBeNull();

    monitorMono.set(false);
    launchQuantize.set("none");
    sceneFollowEnabled.set(false);
    sceneFollowBars.set(2);
    sceneFollowRules.set({});
    tracks.set([{ id: "track-1", notes: [] }]);
    service.restoreFromSnapshot(snapshot);

    expect(monitorMono()).toBe(true);
    expect(launchQuantize()).toBe("4bar");
    expect(sceneFollowEnabled()).toBe(true);
    expect(sceneFollowBars()).toBe(8);
    expect(sceneFollowRules()).toEqual({
      "slot-a": { mode: "loop" },
      "slot-b": { mode: "advance", bars: 8 },
    });
    expect(tracks()[0].soloSafe).toBe(true);
    expect(tracks()[0].patternSlots[0].launchQuantize).toBe("2bar");
  });

  it("defaults an older bundle to immediate launch instead of leaking the last set", () => {
    launchQuantize.set("2bar");
    sceneFollowEnabled.set(true);
    sceneFollowBars.set(16);
    sceneFollowRules.set({ "0": { mode: "loop" } });
    const legacy = makeBundle();
    service.restoreFromSnapshot(legacy);
    expect(launchQuantize()).toBe("none");
    expect(sceneFollowEnabled()).toBe(false);
    expect(sceneFollowBars()).toBe(4);
    expect(sceneFollowRules()).toEqual({});
  });

  it("round-trips tempo map, markers, VCA, sidechain, loop and master state", () => {
    const manager = TestBed.inject(MusicManagerService) as any;
    const engine = manager.engine;
    tracks.set([{ id: "track-1", notes: [] }, { id: "track-2", notes: [] }]);
    tempoMarkers.set([
      { id: "tempo-1", step: 0, bpm: 120 },
      { id: "tempo-2", step: 32, bpm: 90 },
    ]);
    meterMarkers.set([
      { id: "meter-1", step: 0, beats: 4, unit: 4 },
      { id: "meter-2", step: 32, beats: 3, unit: 4 },
    ]);
    arrangementMarkers.set([
      { id: "marker-1", name: "Drop", time: 8, color: "#facc15" },
    ]);
    vcaBuses.set([
      { id: "vca-1", name: "Drums", faderValue: 0.5, muted: false },
    ]);
    vcaAssignments.set({ "track-1": "vca-1" });
    sidechainRoutes.set([
      { triggerTrackId: "track-1", targetTrackId: "track-2" },
    ]);
    engine.playbackLoopStart.set(16);
    engine.playbackLoopEnd.set(48);
    engine.playbackLoopEnabled.set(true);
    engine.masterGain.gain.value = 0.55;
    engine.getMasterToneEq = () => ({
      lowShelfDb: 2,
      lowMidDb: -1,
      highShelfDb: 3,
    });
    engine.getMasterWidth = () => 1.4;
    engine.getMasterMakeupDb = () => 2.5;
    engine.getMasteringTargets = () => ({ lufs: -10, truePeak: -0.5 });
    manager.captureMasterPluginState = () => ({
      pluginIds: ["smuve.eq.mastering.v2"],
      params: { "smuve.eq.mastering.v2": { lowGainDb: 2 } },
    });

    const snapshot = service.createSnapshot();
    expect(snapshot.tempoMap).toHaveLength(2);
    expect(snapshot.meterMap).toHaveLength(2);
    expect(snapshot.markers).toHaveLength(1);
    expect(snapshot.vca?.assignments["track-1"]).toBe("vca-1");
    expect(snapshot.sidechain).toEqual([
      { triggerTrackId: "track-1", targetTrackId: "track-2" },
    ]);
    expect(snapshot.playback).toEqual({
      loopEnabled: true,
      loopStart: 16,
      loopEnd: 48,
    });
    expect(snapshot.master).toEqual(
      expect.objectContaining({
        gain: 0.55,
        width: 1.4,
        makeupDb: 2.5,
        targets: { lufs: -10, truePeak: -0.5 },
        pluginIds: ["smuve.eq.mastering.v2"],
      }),
    );

    tempoMarkers.set([]);
    meterMarkers.set([]);
    arrangementMarkers.set([]);
    vcaBuses.set([]);
    vcaAssignments.set({});
    sidechainRoutes.set([]);
    engine.playbackLoopStart.set(null);
    engine.playbackLoopEnd.set(null);
    engine.playbackLoopEnabled.set(false);
    engine.masterGain.gain.value = 1;

    service.restoreFromSnapshot(snapshot);

    expect(tempoMarkers().map((marker: any) => marker.bpm)).toEqual([120, 90]);
    expect(meterMarkers().map((marker: any) => marker.beats)).toEqual([4, 3]);
    expect(arrangementMarkers()[0].name).toBe("Drop");
    expect(vcaAssignments()["track-1"]).toBe("vca-1");
    expect(engine.setVcaMultiplier).toHaveBeenCalledWith("track-1", 0.5);
    expect(sidechainRoutes()).toEqual([
      { triggerTrackId: "track-1", targetTrackId: "track-2" },
    ]);
    expect(engine.playbackLoopStart()).toBe(16);
    expect(engine.playbackLoopEnd()).toBe(48);
    expect(engine.playbackLoopEnabled()).toBe(true);
    expect(engine.masterGain.gain.value).toBe(0.55);
    expect(engine.setMasterToneEq).toHaveBeenCalledWith({
      lowShelfDb: 2,
      lowMidDb: -1,
      highShelfDb: 3,
    });
    expect(engine.setMasterWidth).toHaveBeenCalledWith(1.4);
    expect(engine.setMasterMakeupDb).toHaveBeenCalledWith(2.5);
    expect(engine.setMasteringTargets).toHaveBeenCalledWith({
      lufs: -10,
      truePeak: -0.5,
    });
    expect(manager.applyMasterPluginState).toHaveBeenCalledWith(
      ["smuve.eq.mastering.v2"],
      { "smuve.eq.mastering.v2": { lowGainDb: 2 } },
    );
  });

  it("resets project-scoped state when opening an older bundle", () => {
    const engine = (TestBed.inject(MusicManagerService) as any).engine;
    tempoMarkers.set([{ id: "tempo-1", step: 0, bpm: 150 }]);
    meterMarkers.set([{ id: "meter-1", step: 0, beats: 3, unit: 4 }]);
    arrangementMarkers.set([{ id: "marker-1", name: "Old", time: 1 }]);
    vcaBuses.set([{ id: "vca-1", name: "Old", faderValue: 0.2, muted: false }]);
    vcaAssignments.set({ "track-1": "vca-1" });
    sidechainRoutes.set([
      { triggerTrackId: "track-1", targetTrackId: "track-2" },
    ]);
    engine.playbackLoopStart.set(8);
    engine.playbackLoopEnd.set(32);
    engine.playbackLoopEnabled.set(true);

    service.restoreFromSnapshot(makeBundle());

    expect(tempoMarkers()).toEqual([]);
    expect(meterMarkers()).toEqual([]);
    expect(arrangementMarkers()).toEqual([]);
    expect(vcaBuses()).toEqual([]);
    expect(vcaAssignments()).toEqual({});
    expect(sidechainRoutes()).toEqual([]);
    expect(engine.playbackLoopStart()).toBeNull();
    expect(engine.playbackLoopEnd()).toBeNull();
    expect(engine.playbackLoopEnabled()).toBe(false);
    expect(engine.setMasterWidth).toHaveBeenCalledWith(1);
    expect(engine.setMasteringTargets).toHaveBeenCalledWith({
      lufs: -14,
      truePeak: -0.1,
    });
  });

  it("clears armed follow actions when a fresh project replaces the set", () => {
    sceneFollowEnabled.set(true);
    sceneFollowBars.set(12);
    sceneFollowRules.set({ "1": { mode: "advance", bars: 12 } });

    service.startFreshProject({ id: "proj_fresh", name: "Fresh" });

    expect(sceneFollowEnabled()).toBe(false);
    expect(sceneFollowBars()).toBe(4);
    expect(sceneFollowRules()).toEqual({});
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

  it("persists a local-only sync status with an actionable size breakdown", async () => {
    const bundle = await service.manualSave();

    expect(service.currentSyncStatus()).toEqual(
      expect.objectContaining({
        projectId: bundle.metadata.id,
        state: 'local-only',
      }),
    );
    expect(service.currentSyncStatus()?.breakdown.totalBytes).toBeGreaterThan(0);
    expect(saveItem).toHaveBeenCalledWith(
      PROJECT_SYNC_STATUS_STORE,
      expect.objectContaining({
        id: bundle.metadata.id,
        state: 'local-only',
        breakdown: expect.objectContaining({
          audioBytes: expect.any(Number),
          guideBytes: expect.any(Number),
          projectBytes: expect.any(Number),
        }),
      }),
    );
  });

  it("keeps a cloud conflict visible through an autosave", async () => {
    const projectId = service.metadata()!.id;
    const size = {
      totalBytes: 2048,
      audioBytes: 1024,
      guideBytes: 0,
      projectBytes: 1024,
    };
    await (service as any).recordSyncStatus(
      projectId,
      'conflict',
      'Cloud version v4 is newer than this device’s copy.',
      size,
    );

    await expect(service.autoSave()).resolves.toBe(true);

    expect(service.syncStatusFor(projectId)).toEqual(
      expect.objectContaining({
        state: 'conflict',
        reason: expect.stringContaining('Cloud version v4'),
      }),
    );
  });

  it("keeps an oversized set marked too-large through an autosave", async () => {
    const projectId = service.metadata()!.id;
    const size = {
      totalBytes: 620 * 1024 * 1024,
      audioBytes: 610 * 1024 * 1024,
      guideBytes: 0,
      projectBytes: 10 * 1024 * 1024,
    };
    await (service as any).recordSyncStatus(
      projectId,
      'too-large',
      'Saved on this device, but this version is too large to sync.',
      size,
    );
    const measure = jest
      .spyOn(service as any, 'measureCloudBundle')
      .mockReturnValue(size);

    try {
      await expect(service.autoSave()).resolves.toBe(true);
    } finally {
      measure.mockRestore();
    }

    expect(service.syncStatusFor(projectId)).toEqual(
      expect.objectContaining({
        state: 'too-large',
        cloudBytes: size.totalBytes,
        breakdown: size,
      }),
    );
    expect(service.cloudSyncRefusal()).toContain('too large to sync');
  });

  it("refuses to import over a set leased by another Studio window", async () => {
    const bundle = makeBundle();
    localStorage.setItem(
      `${PROJECT_LEASE_KEY_PREFIX}${bundle.metadata.id}`,
      JSON.stringify({
        projectId: bundle.metadata.id,
        ownerId: 'other-window',
        ownerLabel: 'Other window',
        acquiredAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      }),
    );

    await expect(service.importProjectBundle(bundle)).resolves.toBe(false);

    expect(saveItem).not.toHaveBeenCalled();
    expect(service.persistenceError()).toContain('another Studio window');
  });

  it("refuses to save over a lease held by another Studio window", async () => {
    const projectId = service.metadata()!.id;
    const key = `${PROJECT_LEASE_KEY_PREFIX}${projectId}`;
    localStorage.setItem(
      key,
      JSON.stringify({
        projectId,
        ownerId: 'other-window',
        ownerLabel: 'Other window',
        acquiredAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      }),
    );

    await expect(service.manualSave()).rejects.toThrow(/another Studio window/i);

    expect(saveItem).not.toHaveBeenCalled();
    expect(service.leaseConflict()?.ownerLabel).toBe('Other window');
    localStorage.removeItem(key);
  });

  it("lets the artist explicitly take over a set leased by another window", async () => {
    const projectId = service.metadata()!.id;
    const key = `${PROJECT_LEASE_KEY_PREFIX}${projectId}`;
    localStorage.setItem(
      key,
      JSON.stringify({
        projectId,
        ownerId: 'other-window',
        ownerLabel: 'Other window',
        acquiredAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      }),
    );

    expect(service.takeOverProjectLease()).toBe(true);
    await expect(service.manualSave()).resolves.toBeTruthy();

    expect(service.leaseConflict()).toBeNull();
    localStorage.removeItem(key);
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

  it("marks a rig-only change dirty so autosave stores it", async () => {
    expect(service.isDirty()).toBe(false);

    // Transposing the keys or changing the stamp touches no track. Before the
    // rig joined the signature, this change left the set "clean" and the next
    // autosave kept the old rig.
    livePerformance.set({ octave: -2, chordType: "maj7" });
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
        {
          provide: LiveEngineService,
          useValue: {
            smartChords: signal(false),
            scaleLock: signal(false),
            scaleMode: signal("major"),
            scaleRoot: signal(0),
            arpeggiatorEnabled: signal(false),
            arpeggiatorRate: signal("8n"),
            arpeggiatorPattern: signal("up"),
            arpeggiatorLatch: signal(false),
            arpeggiatorSwing: signal(0),
            restorePerformanceState: jest.fn(),
          },
        },
        { provide: AutomationService, useValue: { lanes: signal([]), macros: signal([]), modulationSources: signal([]) } },
        { provide: AuthService, useValue: { currentUser: signal(user) } },
        {
          provide: CloudSyncService,
          useValue: {
            queuePush: (...args: unknown[]) => cloudQueuePush(...args),
            pushSucceeded$: cloudPushSucceeded,
            timeline: cloudTimeline,
            payloadBytes: (payload: unknown) =>
              JSON.stringify(payload ?? null).length,
          },
        },
        {
          provide: PROJECT_BACKING_TRACK,
          useValue: {
            archiveFile: (...args: unknown[]) => backingArchiveFile(...args),
            adoptProject: jest.fn().mockResolvedValue(true),
            restoreProject: jest.fn().mockResolvedValue(false),
            persistProject: jest.fn().mockResolvedValue(undefined),
            forgetProject: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: MusicManagerService,
          useValue: {
            tracks,
            launchQuantize,
            setLaunchQuantize: (value: any) => {
              launchQuantize.set(value);
              return value;
            },
            sceneFollowEnabled,
            setSceneFollowEnabled: (enabled: boolean) => {
              sceneFollowEnabled.set(!!enabled);
              return enabled;
            },
            sceneFollowBars,
            setSceneFollowBars: (bars: number) => {
              const next = Math.min(32, Math.max(1, Math.floor(Number(bars) || 1)));
              sceneFollowBars.set(next);
              return next;
            },
            sceneFollowRules,
            setSceneFollowRules: (rules: Record<string, any>) => {
              sceneFollowRules.set({ ...(rules ?? {}) });
              return sceneFollowRules();
            },
            clearSceneFollowRules: () => sceneFollowRules.set({}),
            livePerformance,
            setLivePerformance: jest.fn(),
            structure: signal([]),
            selectedTrackId: signal(null),
            activeLoopBars: signal(64),
            arrangementEndBar: () => 4,
            captureMasterPluginState: () => ({ pluginIds: [], params: {} }),
            applyMasterPluginState: jest.fn(),
            engine: {
              stop: jest.fn(),
              tempo: { set: tempoSet },
              timeSignature: signal({ beats: 4, unit: 4 }),
              setTimeSignature: (beats: number, unit: number) => {
                const engine = (TestBed.inject(MusicManagerService) as any).engine;
                engine.timeSignature.set({ beats, unit });
                return { beats, unit };
              },
              masterGain: { gain: { value: 0.8 } },
              monoMonitoring: monitorMono,
              setMonoMonitoring: (enabled: boolean) => {
                monitorMono.set(enabled);
                return enabled;
              },
              playbackLoopEnabled: signal(false),
              playbackLoopStart: signal<number | null>(null),
              playbackLoopEnd: signal<number | null>(null),
              setSongLengthSteps: jest.fn(),
              setVcaMultiplier: jest.fn(),
              setPlaybackLoop: jest.fn(() => false),
              togglePlaybackLoop: jest.fn(),
            },
          },
        },
        { provide: ProjectService, useValue: { currentProject: signal(null), projectDeleted$: new Subject<string>(), refresh: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: LocalStorageService,
          useValue: { saveItem, persistenceStatus: jest.fn().mockResolvedValue('ready'), getItem: jest.fn(), getAllItems: jest.fn() },
        },
        {
          provide: OfflineSyncService,
          useValue: {
            saveLocal: jest.fn(),
            queueOperation,
            registerEndpointHandler: jest.fn().mockReturnValue(jest.fn()),
          },
        },
        {
          provide: CloudSyncService,
          useValue: {
            queuePush: (...args: unknown[]) => cloudQueuePush(...args),
            pushSucceeded$: cloudPushSucceeded,
            timeline: cloudTimeline,
            payloadBytes: (payload: unknown) =>
              JSON.stringify(payload ?? null).length,
          },
        },
        {
          provide: PROJECT_BACKING_TRACK,
          useValue: {
            archiveFile: (...args: unknown[]) => backingArchiveFile(...args),
            adoptProject: jest.fn().mockResolvedValue(true),
            restoreProject: jest.fn().mockResolvedValue(false),
            persistProject: jest.fn().mockResolvedValue(undefined),
            forgetProject: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        ...projectStateProviders(),
      ],
    });
    service = TestBed.inject(ProjectWorkspaceService);

    const bundle = makeBundle();
    await expect(service.importProjectBundle(bundle)).resolves.toBe(true);

    expect(tracks()).toEqual(bundle.tracks);
    const queuedUploadId = cloudQueuePush.mock.calls[0][3] as string;
    expect(cloudQueuePush).toHaveBeenCalledWith(
      bundle.metadata.id,
      bundle.metadata.name,
      expect.objectContaining({
        metadata: expect.objectContaining({ id: bundle.metadata.id }),
      }),
      expect.any(String),
    );
    expect(service.cloudSyncQueued()).toBe(true);
    expect(service.syncStatusFor(bundle.metadata.id)).toEqual(
      expect.objectContaining({ state: 'queued', uploadId: queuedUploadId }),
    );

    cloudPushSucceeded.next({
      projectId: bundle.metadata.id,
      at: 777,
      uploadId: queuedUploadId,
    });

    expect(service.syncStatusFor(bundle.metadata.id)?.state).toBe('synced');
    expect(service.syncStatusFor(bundle.metadata.id)?.lastSyncedAt).toBe(777);
  });

  it('keeps a newer queued save queued when an older upload confirms later', async () => {
    authUser.set({ id: 'artist-1' });
    cloudQueuePush.mockClear();
    const bundle = {
      ...makeBundle(),
      metadata: { ...metadata, id: 'proj_two_queues', name: 'Two Queued Saves' },
    };

    await (service as any).queueCloudSync(bundle);
    const firstUploadId = cloudQueuePush.mock.calls[0][3] as string;
    await (service as any).queueCloudSync(bundle);
    const secondUploadId = cloudQueuePush.mock.calls[1][3] as string;

    expect(firstUploadId).toEqual(expect.any(String));
    expect(secondUploadId).toEqual(expect.any(String));
    expect(secondUploadId).not.toBe(firstUploadId);
    expect(service.syncStatusFor('proj_two_queues')).toEqual(
      expect.objectContaining({ state: 'queued', uploadId: secondUploadId }),
    );

    // The older upload finishes after the second save was queued, so its
    // timestamp is newer than the newer queued status. Only an identity match
    // may clear that badge.
    cloudPushSucceeded.next({
      projectId: 'proj_two_queues',
      at: Date.now() + 1_000,
      uploadId: firstUploadId,
    });

    expect(service.syncStatusFor('proj_two_queues')?.state).toBe('queued');
    expect(service.syncStatusFor('proj_two_queues')?.uploadId).toBe(secondUploadId);

    cloudPushSucceeded.next({
      projectId: 'proj_two_queues',
      at: Date.now() + 2_000,
      uploadId: secondUploadId,
    });

    expect(service.syncStatusFor('proj_two_queues')).toEqual(
      expect.objectContaining({ state: 'synced', uploadId: undefined }),
    );
  });

  it("restores a persisted too-large warning after a reload", async () => {
    const bundle = makeBundle();
    getAllItems.mockResolvedValue([
      {
        id: bundle.metadata.id,
        projectId: bundle.metadata.id,
        state: 'too-large',
        reason:
          'Saved on this device, but this version is too large to sync (about 620 MB; the cloud limit is 512 MB).',
        updatedAt: Date.now(),
        cloudBytes: 620 * 1024 * 1024,
        breakdown: {
          totalBytes: 620 * 1024 * 1024,
          audioBytes: 610 * 1024 * 1024,
          guideBytes: 0,
          projectBytes: 10 * 1024 * 1024,
        },
      },
    ]);

    await (service as any).loadSyncStatuses();
    service.restoreFromSnapshot(bundle);

    expect(service.currentSyncStatus()?.state).toBe('too-large');
    expect(service.cloudSyncRefusal()).toContain('too large to sync');
    expect(service.currentSyncStatus()?.breakdown.audioBytes).toBe(
      610 * 1024 * 1024,
    );
  });

  it("clears a stale queued badge when a boot replay already reached the cloud", async () => {
    const projectId = 'proj_boot_replay';
    getAllItems.mockResolvedValue([
      {
        id: projectId,
        projectId,
        state: 'queued',
        reason: 'Waiting to upload.',
        updatedAt: 100,
        cloudBytes: 4096,
        breakdown: {
          totalBytes: 4096,
          audioBytes: 3072,
          guideBytes: 0,
          projectBytes: 1024,
        },
      },
    ]);
    cloudTimeline.set([
      {
        id: 'timeline-boot',
        projectId,
        projectTitle: 'Boot replay',
        direction: 'push',
        status: 'success',
        at: 200,
      },
    ]);

    await (service as any).loadSyncStatuses();

    expect(service.syncStatusFor(projectId)).toEqual(
      expect.objectContaining({
        state: 'synced',
        lastSyncedAt: 200,
      }),
    );
  });

  it("keeps a newer queued upload when a boot replay confirms an older one", async () => {
    const projectId = 'proj_boot_two_uploads';
    const baseStatus = {
      id: projectId,
      projectId,
      state: 'queued',
      reason: 'Waiting to upload.',
      updatedAt: 100,
      uploadId: 'upload_new',
      cloudBytes: 4096,
      breakdown: {
        totalBytes: 4096,
        audioBytes: 3072,
        guideBytes: 0,
        projectBytes: 1024,
      },
    };
    getAllItems.mockResolvedValue([baseStatus]);
    // The older upload's confirmation is persisted later than the newer save
    // was queued, so time cannot tell the two apart.
    cloudTimeline.set([
      {
        id: 'timeline-old-upload',
        projectId,
        projectTitle: 'Older upload',
        direction: 'push',
        status: 'success',
        at: 200,
        uploadId: 'upload_old',
      },
    ]);

    await (service as any).loadSyncStatuses();

    expect(service.syncStatusFor(projectId)).toEqual(
      expect.objectContaining({ state: 'queued', uploadId: 'upload_new' }),
    );
    expect(service.syncStatusFor(projectId)?.lastSyncedAt).toBeUndefined();

    // The newer upload's own confirmation is what clears the badge.
    cloudTimeline.set([
      {
        id: 'timeline-old-upload',
        projectId,
        projectTitle: 'Older upload',
        direction: 'push',
        status: 'success',
        at: 200,
        uploadId: 'upload_old',
      },
      {
        id: 'timeline-new-upload',
        projectId,
        projectTitle: 'Newer upload',
        direction: 'push',
        status: 'success',
        at: 300,
        uploadId: 'upload_new',
      },
    ]);

    await (service as any).loadSyncStatuses();

    expect(service.syncStatusFor(projectId)).toEqual(
      expect.objectContaining({ state: 'synced', lastSyncedAt: 300 }),
    );
  });

  it("keeps a queued badge when the cloud success predates that local save", async () => {
    const projectId = 'proj_boot_pending';
    getAllItems.mockResolvedValue([
      {
        id: projectId,
        projectId,
        state: 'queued',
        reason: 'Waiting to upload.',
        updatedAt: 300,
        cloudBytes: 4096,
        breakdown: {
          totalBytes: 4096,
          audioBytes: 3072,
          guideBytes: 0,
          projectBytes: 1024,
        },
      },
    ]);
    cloudTimeline.set([
      {
        id: 'timeline-older',
        projectId,
        projectTitle: 'Older cloud copy',
        direction: 'push',
        status: 'success',
        at: 200,
      },
    ]);

    await (service as any).loadSyncStatuses();

    expect(service.syncStatusFor(projectId)?.state).toBe('queued');
    expect(service.syncStatusFor(projectId)?.lastSyncedAt).toBeUndefined();
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

  // ── Sets browser: listing, loading and deleting local workspaces ──

  it("lists one row per project built from its freshest record", async () => {
    const olderManual = {
      id: "project_proj_alpha",
      ...makeBundle(),
      metadata: { ...metadata, id: "proj_alpha", name: "Alpha", bpm: 120 },
      savedAt: 100,
      source: "manual",
    };
    const newerAutosave = {
      id: "autosave_proj_alpha",
      ...makeBundle(),
      metadata: { ...metadata, id: "proj_alpha", name: "Alpha", bpm: 128 },
      tracks: [{ id: "t1" }, { id: "t2" }, { id: "t3" }],
      savedAt: 300,
      source: "autosave",
    };
    const otherProject = {
      id: "project_proj_beta",
      ...makeBundle(),
      metadata: { ...metadata, id: "proj_beta", name: "Beta" },
      savedAt: 200,
      source: "manual",
    };
    // Legacy release rows and junk must be ignored.
    getAllItems.mockResolvedValue([
      olderManual,
      newerAutosave,
      otherProject,
      { id: "release_row", name: "Release" },
    ]);

    const sets = await service.listLocalProjects();

    expect(sets.map((set) => set.projectId)).toEqual(["proj_alpha", "proj_beta"]);
    expect(sets[0]).toEqual(
      expect.objectContaining({
        projectId: "proj_alpha",
        recordId: "autosave_proj_alpha",
        name: "Alpha",
        bpm: 128,
        source: "autosave",
        trackCount: 3,
      }),
    );
  });

  it("reports the saved meter next to the tempo in each set row", async () => {
    getAllItems.mockResolvedValue([
      {
        id: "project_proj_meter",
        ...makeBundle(),
        metadata: { ...metadata, id: "proj_meter", timeSignature: [5, 4] },
        savedAt: 600,
        source: "manual",
      },
      {
        id: "recovery_proj_legacy",
        ...makeBundle(),
        metadata: { ...metadata, id: "proj_legacy" },
        savedAt: 500,
        source: "recovery",
      },
    ]);

    const sets = await service.listLocalProjects();

    expect(sets.find((set) => set.projectId === "proj_meter")?.timeSignature).toEqual([5, 4]);
    expect(sets.find((set) => set.projectId === "proj_legacy")?.timeSignature).toEqual([4, 4]);
  });

  it("backfills 4/4 into an older record when it is opened", async () => {
    const legacy = {
      id: "project_proj_old",
      ...makeBundle(),
      metadata: { ...metadata, id: "proj_old" },
      savedAt: 700,
      source: "manual",
    };
    getItem.mockResolvedValue(legacy);

    const loaded = await service.loadProject("proj_old");

    expect(loaded?.metadata.timeSignature).toEqual([4, 4]);
    // The stored object is not mutated; the next save writes the field.
    expect((legacy.metadata as any).timeSignature).toBeUndefined();
  });

  it("keeps the stored meter when an older record already has one", async () => {
    const stored = {
      id: "project_proj_seven",
      ...makeBundle(),
      metadata: { ...metadata, id: "proj_seven", timeSignature: [7, 8] },
      savedAt: 800,
      source: "manual",
    };
    getItem.mockResolvedValue(stored);

    const loaded = await service.loadProject("proj_seven");

    expect(loaded?.metadata.timeSignature).toEqual([7, 8]);
  });

  it("loads a set whose only record is an autosave snapshot", async () => {
    const autosaveBundle = {
      id: "autosave_proj_solo",
      ...makeBundle(),
      metadata: { ...metadata, id: "proj_solo", name: "Solo Sketch" },
      tracks: [{ id: "track-solo", notes: [] }],
      savedAt: 500,
      source: "autosave",
    };
    getItem.mockResolvedValue(null);
    getAllItems.mockResolvedValue([autosaveBundle]);

    const loaded = await service.loadProject("proj_solo");

    expect(loaded?.metadata.name).toBe("Solo Sketch");
    expect(service.metadata()?.name).toBe("Solo Sketch");
    expect(tracks()).toEqual(autosaveBundle.tracks);
    expect(service.lastPersistedAt()).toBe(500);
  });

  it("deletes every stored record for a set when it is not in the project list", async () => {
    projectRemove.mockResolvedValue(false);
    const records = [
      {
        id: "project_proj_gone",
        ...makeBundle(),
        metadata: { ...metadata, id: "proj_gone" },
        savedAt: 10,
        source: "manual",
      },
      {
        id: "autosave_proj_gone",
        ...makeBundle(),
        metadata: { ...metadata, id: "proj_gone" },
        savedAt: 20,
        source: "autosave",
      },
      {
        id: "recovery_proj_other",
        ...makeBundle(),
        metadata: { ...metadata, id: "proj_other" },
        savedAt: 30,
        source: "recovery",
      },
    ];
    getAllItems.mockResolvedValue(records);
    service.startFreshProject({ id: "proj_gone", name: "Gone" });

    await expect(service.deleteLocalProject("proj_gone")).resolves.toBe(true);

    expect(deleteItems).toHaveBeenCalledWith("projects", [
      "project_proj_gone",
      "autosave_proj_gone",
    ]);
    // Deleting the open set detaches the workspace so autosave cannot recreate it.
    expect(service.metadata()?.id).not.toBe("proj_gone");
    expect(service.autoSaveEnabled()).toBe(false);
  });

  it("reports a missing set without touching storage", async () => {
    projectRemove.mockResolvedValue(false);
    getAllItems.mockResolvedValue([]);

    await expect(service.deleteLocalProject("proj_nope")).resolves.toBe(false);

    expect(deleteItems).not.toHaveBeenCalled();
  });

  it('prunes recovery snapshots that a later save already covers', async () => {
    getAllItems.mockResolvedValue([
      {
        id: 'project_proj_prune',
        ...makeBundle(),
        metadata: { ...metadata, id: 'proj_prune' },
        savedAt: 900,
        source: 'manual',
      },
      {
        id: 'recovery_proj_prune',
        ...makeBundle(),
        metadata: { ...metadata, id: 'proj_prune' },
        savedAt: 400,
        source: 'recovery',
      },
      {
        id: 'recovery_proj_unsaved',
        ...makeBundle(),
        metadata: { ...metadata, id: 'proj_unsaved' },
        savedAt: 500,
        source: 'recovery',
      },
    ]);

    await expect(service.pruneRedundantRecoveryRecords()).resolves.toBe(1);

    expect(deleteItems).toHaveBeenCalledWith('projects', [
      'recovery_proj_prune',
    ]);
  });

  it('leaves storage alone when every recovery snapshot is still useful', async () => {
    getAllItems.mockResolvedValue([
      {
        id: 'project_proj_saved',
        ...makeBundle(),
        metadata: { ...metadata, id: 'proj_saved' },
        savedAt: 100,
        source: 'manual',
      },
      {
        id: 'recovery_proj_saved',
        ...makeBundle(),
        metadata: { ...metadata, id: 'proj_saved' },
        savedAt: 800,
        source: 'recovery',
      },
    ]);

    await expect(service.pruneRedundantRecoveryRecords()).resolves.toBe(0);

    expect(deleteItems).not.toHaveBeenCalled();
  });

  it('lists a recovery snapshot only while it holds unsaved work', async () => {
    getAllItems.mockResolvedValue([
      {
        id: 'project_proj_versions',
        ...makeBundle(),
        metadata: { ...metadata, id: 'proj_versions' },
        savedAt: 900,
        source: 'manual',
      },
      {
        id: 'recovery_proj_versions',
        ...makeBundle(),
        metadata: { ...metadata, id: 'proj_versions' },
        savedAt: 400,
        source: 'recovery',
      },
    ]);

    const versions = await service.listProjectVersions('proj_versions');

    expect(versions.map((version) => version.recordId)).toEqual([
      'project_proj_versions',
    ]);
  });

});
