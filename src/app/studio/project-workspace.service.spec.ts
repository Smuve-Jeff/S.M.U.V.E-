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
import { ArrangementMarkersService } from "./arrangement-markers.service";
import { SidechainRoutingService } from "./sidechain-routing.service";
import { TempoMapService } from "./tempo-map.service";
import { VcaBusService } from "./vca-bus.service";

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
  let monitorMono: ReturnType<typeof signal<boolean>>;
  let launchQuantize: ReturnType<typeof signal<any>>;
  let sceneFollowEnabled: ReturnType<typeof signal<boolean>>;
  let sceneFollowBars: ReturnType<typeof signal<number>>;
  let sceneFollowRules: ReturnType<typeof signal<Record<string, any>>>;
  let getItem: jest.Mock;
  let getAllItems: jest.Mock;
  let deleteItems: jest.Mock;
  let projectRemove: jest.Mock;
  let tempoMarkers: ReturnType<typeof signal<any[]>>;
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

  beforeEach(() => {
    tracks = signal([{ id: "track-1", notes: [] }]);
    stemAudioCache = new Map<string, any>();
    saveItem = jest.fn().mockResolvedValue(undefined);
    queueOperation = jest.fn().mockResolvedValue("sync_test_1");
    tempoSet = jest.fn();
    monitorMono = signal(false);
    launchQuantize = signal("none");
    sceneFollowEnabled = signal(false);
    sceneFollowBars = signal(4);
    sceneFollowRules = signal<Record<string, any>>({});
    getItem = jest.fn().mockResolvedValue(null);
    getAllItems = jest.fn().mockResolvedValue([]);
    deleteItems = jest.fn().mockResolvedValue(undefined);
    projectRemove = jest.fn().mockResolvedValue(false);
    tempoMarkers = signal<any[]>([]);
    arrangementMarkers = signal<any[]>([]);
    vcaBuses = signal<any[]>([]);
    vcaAssignments = signal<Record<string, string | null>>({});
    sidechainRoutes = signal<any[]>([]);

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

    await service.autoSave();

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

    await (service as any).tryQueueCloudSync(metadata, missing);

    expect(queueOperation).not.toHaveBeenCalled();
    expect(TestBed.inject(LoggingService).warn).toHaveBeenCalledWith(
      'ProjectWorkspace: Cloud sync skipped; audio is incomplete',
      expect.stringContaining('Cloud sync paused'),
    );
    expect(service.audioIntegrity()?.ok).toBe(false);
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
            structure: signal([]),
            selectedTrackId: signal(null),
            activeLoopBars: signal(64),
            arrangementEndBar: () => 4,
            captureMasterPluginState: () => ({ pluginIds: [], params: {} }),
            applyMasterPluginState: jest.fn(),
            engine: {
              stop: jest.fn(),
              tempo: { set: tempoSet },
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
          useValue: { saveLocal: jest.fn(), queueOperation },
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
});
