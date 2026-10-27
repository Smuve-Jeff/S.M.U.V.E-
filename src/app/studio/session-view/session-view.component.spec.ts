import { ComponentFixture, TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";

import { SessionViewComponent } from "./session-view.component";
import { AudioSessionService } from "../audio-session.service";
import { MusicManagerService } from "../../services/music-manager.service";
import { HapticService } from "../../services/haptic.service";
import { SnackbarService } from "../../services/snackbar.service";

/**
 * Session View is a projection now: every scene and clip in the grid has to
 * come from the real channels/patterns and every launch has to go through the
 * manager. These tests pin that (and the absence of a local mock store).
 */
describe("SessionViewComponent", () => {
  let component: SessionViewComponent;
  let fixture: ComponentFixture<SessionViewComponent>;

  const isPlaying = signal(false);
  const isRecording = signal(false);
  const togglePlay = jest.fn(() => isPlaying.update((v) => !v));
  const scenePlaybackActive = signal(false);
  const activeSceneColumn = signal<number | null>(null);
  const sceneFollowEnabled = signal(false);
  const sceneFollowBars = signal(4);
  const selectedTrackId = signal<string | null>(null);
  const tempo = signal(120);

  const tracks = signal<any[]>([
    {
      id: "t1",
      name: "Keys",
      type: "midi",
      color: "#2ba09c",
      muted: false,
      notes: [],
      steps: Array.from({ length: 16 }, (_, i) => i % 4 === 0),
      clips: [],
      activePatternSlotId: "slot-a",
      patternSlots: [
        { id: "slot-a", name: "Verse Keys", activeVersionId: "v1", versions: [] },
        {
          id: "slot-b",
          name: "Chorus Keys",
          activeVersionId: "v2",
          versions: [
            {
              id: "v2",
              name: "captured",
              steps: Array.from({ length: 16 }, () => true),
              notes: [],
            },
          ],
        },
      ],
    },
    {
      id: "t2",
      name: "Bass",
      type: "midi",
      color: "#8b5cf6",
      muted: false,
      notes: [],
      steps: Array.from({ length: 16 }, () => false),
      clips: [],
      activePatternSlotId: "slot-c",
      patternSlots: [
        { id: "slot-c", name: "Verse Bass", activeVersionId: "v3", versions: [] },
      ],
    },
    {
      id: "a1",
      name: "Vocal",
      type: "audio",
      color: "#111",
      muted: false,
      notes: [],
      steps: [],
      clips: [],
      patternSlots: [],
    },
  ]);

  const patternSlotHasContent = jest.fn(
    (track: any, slot: any) =>
      track.activePatternSlotId === slot.id
        ? (track.steps ?? []).some(Boolean)
        : (slot.versions?.at(-1)?.steps ?? []).some(Boolean),
  );

  const launchSceneColumn = jest.fn((column: number) => {
    let switched = 0;
    tracks.update((list) =>
      list.map((track) => {
        if (track.type === "audio") return track;
        const slot = track.patternSlots?.[column];
        if (!slot || !patternSlotHasContent(track, slot)) return track;
        switched++;
        return { ...track, activePatternSlotId: slot.id };
      }),
    );
    if (switched > 0) {
      scenePlaybackActive.set(true);
      activeSceneColumn.set(column);
    }
    return switched;
  });

  const launchClipPattern = jest.fn((trackId: string, slotId: string) => {
    tracks.update((list) =>
      list.map((track) =>
        track.id === trackId ? { ...track, activePatternSlotId: slotId } : track,
      ),
    );
    scenePlaybackActive.set(true);
    return true;
  });

  const stopScenePlayback = jest.fn(() => {
    scenePlaybackActive.set(false);
    activeSceneColumn.set(null);
  });
  const backToArrangement = jest.fn(() => stopScenePlayback());

  const createPatternSlot = jest.fn((trackId: string, name?: string) => {
    const id = `slot-new-${trackId}`;
    tracks.update((list) =>
      list.map((track) =>
        track.id === trackId
          ? {
              ...track,
              activePatternSlotId: id,
              patternSlots: [
                ...(track.patternSlots ?? []),
                {
                  id,
                  name: name ?? "Pattern new",
                  activeVersionId: "v-new",
                  versions: [],
                },
              ],
            }
          : track,
      ),
    );
    return id;
  });
  const renamePatternSlot = jest.fn(
    (trackId: string, slotId: string, name: string) => {
      tracks.update((list) =>
        list.map((track) =>
          track.id === trackId
            ? {
                ...track,
                patternSlots: track.patternSlots.map((slot: any) =>
                  slot.id === slotId ? { ...slot, name } : slot,
                ),
              }
            : track,
        ),
      );
      return true;
    },
  );
  const setPatternSlotLaunchQuantize = jest.fn(
    (trackId: string, slotId: string, value: any) => {
      tracks.update((list) =>
        list.map((track) =>
          track.id === trackId
            ? {
                ...track,
                patternSlots: (track.patternSlots ?? []).map((slot: any) =>
                  slot.id === slotId ? { ...slot, launchQuantize: value } : slot,
                ),
              }
            : track,
        ),
      );
      return true;
    },
  );
  const duplicatePatternSlot = jest.fn(() => "slot-copy");
  const deletePatternSlot = jest.fn(() => null);
  const toggleMute = jest.fn((id: string) =>
    tracks.update((list) =>
      list.map((track) =>
        track.id === id ? { ...track, muted: !track.muted } : track,
      ),
    ),
  );

  const launchQuantize = signal<"none" | "1bar" | "2bar" | "4bar">("none");

  const mockMusicManager = {
    tracks,
    launchQuantize,
    setLaunchQuantize: jest.fn((value: any) => {
      launchQuantize.set(value);
      return value;
    }),
    selectedTrackId,
    scenePlaybackActive,
    activeSceneColumn,
    sceneFollowEnabled,
    sceneFollowBars,
    sceneColumnCount: () =>
      tracks()
        .filter((track) => track.type !== "audio")
        .reduce(
          (widest: number, track: any) =>
            Math.max(widest, track.patternSlots?.length ?? 0),
          0,
        ),
    patternSlotHasContent,
    launchSceneColumn,
    launchClipPattern,
    stopScenePlayback,
    backToArrangement,
    createPatternSlot,
    renamePatternSlot,
    duplicatePatternSlot,
    deletePatternSlot,
    setPatternSlotLaunchQuantize,
    toggleMute,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    localStorage.clear();
    launchQuantize.set("none");
    isPlaying.set(false);
    isRecording.set(false);
    scenePlaybackActive.set(false);
    activeSceneColumn.set(null);
    sceneFollowEnabled.set(false);
    sceneFollowBars.set(4);
    tempo.set(120);
    tracks.set([
      {
        id: "t1",
        name: "Keys",
        type: "midi",
        color: "#2ba09c",
        muted: false,
        notes: [],
        steps: Array.from({ length: 16 }, (_, i) => i % 4 === 0),
        clips: [],
        activePatternSlotId: "slot-a",
        patternSlots: [
          { id: "slot-a", name: "Verse Keys", activeVersionId: "v1", versions: [] },
          {
            id: "slot-b",
            name: "Chorus Keys",
            activeVersionId: "v2",
            versions: [
              {
                id: "v2",
                name: "captured",
                steps: Array.from({ length: 16 }, () => true),
                notes: [],
              },
            ],
          },
        ],
      },
      {
        id: "t2",
        name: "Bass",
        type: "midi",
        color: "#8b5cf6",
        muted: false,
        notes: [],
        steps: Array.from({ length: 16 }, () => false),
        clips: [],
        activePatternSlotId: "slot-c",
        patternSlots: [
          { id: "slot-c", name: "Verse Bass", activeVersionId: "v3", versions: [] },
        ],
      },
      {
        id: "a1",
        name: "Vocal",
        type: "audio",
        color: "#111",
        muted: false,
        notes: [],
        steps: [],
        clips: [],
        patternSlots: [],
      },
    ]);

    await TestBed.configureTestingModule({
      imports: [SessionViewComponent],
      providers: [
        {
          provide: AudioSessionService,
          useValue: {
            isPlaying,
            isRecording,
            togglePlay,
            engine: { tempo, visualStep: () => 0 },
          },
        },
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: HapticService, useValue: { light: jest.fn(), medium: jest.fn() } },
        {
          provide: SnackbarService,
          useValue: {
            info: jest.fn(),
            success: jest.fn(),
            warning: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SessionViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("projects scenes from the real pattern columns", () => {
    // Widest channel has two patterns → two scenes; names come from the slots.
    expect(component.scenes().map((scene) => scene.name)).toEqual([
      "Verse Keys",
      "Chorus Keys",
    ]);
    expect(component.scenes()[0].index).toBe(0);
  });

  it("projects clips from channels × patterns and excludes audio channels", () => {
    const clips = component.clips();
    expect(clips.map((clip) => clip.id)).toEqual([
      "t1@slot-a",
      "t1@slot-b",
      "t2@slot-c",
    ]);
    expect(clips.find((clip) => clip.slotId === "slot-b")?.hasContent).toBe(true);
    expect(component.getClipsForScene("scene-0")).toHaveLength(2);
    expect(component.getClipsForScene("scene-1")).toHaveLength(1);
    expect(component.tracks().map((track) => track.id)).toEqual(["t1", "t2"]);
  });

  it("launches a scene through the manager and starts the transport", () => {
    component.launchScene(component.scenes()[1]);

    expect(launchSceneColumn).toHaveBeenCalledWith(1);
    expect(togglePlay).toHaveBeenCalledTimes(1);
    expect(component.isSceneActive(component.scenes()[1])).toBe(true);
    expect(component.sceneStateLabel(component.scenes()[1])).toBe("Playing");
  });

  it("does not restart a running transport and stops a launched scene", () => {
    isPlaying.set(true);
    component.launchScene(component.scenes()[1]);
    expect(togglePlay).not.toHaveBeenCalled();

    component.launchScene(component.scenes()[1]); // same scene = stop
    expect(stopScenePlayback).toHaveBeenCalled();
  });

  it("launches a single clip through the manager", () => {
    const clip = component
      .clips()
      .find((candidate) => candidate.slotId === "slot-b")!;
    component.triggerClip(clip);
    expect(launchClipPattern).toHaveBeenCalledWith("t1", "slot-b");
    expect(togglePlay).toHaveBeenCalledTimes(1);
  });

  it("queues a cell launch on the grid quantization boundary", () => {
    jest.useFakeTimers();
    try {
      isPlaying.set(true);
      component.setLaunchQuantize("1bar");
      const clip = component
        .clips()
        .find((candidate) => candidate.slotId === "slot-b")!;

      component.triggerClip(clip);
      expect(launchClipPattern).not.toHaveBeenCalled();
      expect(component.isCellQueued(clip)).toBe(true);

      jest.advanceTimersByTime(2000);
      expect(launchClipPattern).toHaveBeenCalledWith("t1", "slot-b");
      expect(component.isCellQueued(clip)).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("lets a cell override the grid with immediate launch", () => {
    isPlaying.set(true);
    component.setLaunchQuantize("1bar");
    const clip = component
      .clips()
      .find((candidate) => candidate.slotId === "slot-b")!;

    component.setCellQuantize(clip, "none");
    // The override is stored on the pattern slot, not in a side table, so a
    // project save and the undo stack both carry it.
    const updated = component
      .clips()
      .find((candidate) => candidate.slotId === "slot-b")!;
    expect(updated.launchQuantize).toBe("none");
    expect(component.cellQuantizeSetting(updated)).toBe("none");
    expect(component.cellQuantizeLabel(updated)).toBe("Q OFF");

    component.triggerClip(updated);
    expect(launchClipPattern).toHaveBeenCalledWith("t1", "slot-b");
    expect(setPatternSlotLaunchQuantize).toHaveBeenCalledWith(
      "t1",
      "slot-b",
      "none",
    );

    // Global clears the override instead of storing a second default.
    component.setCellQuantize(updated, "global");
    expect(setPatternSlotLaunchQuantize).toHaveBeenLastCalledWith(
      "t1",
      "slot-b",
      null,
    );
    expect(
      component
        .clips()
        .find((candidate) => candidate.slotId === "slot-b")?.launchQuantize,
    ).toBeNull();
  });

  it("creates a pattern when an empty cell is launched", () => {
    const scene = component.scenes()[1];
    const missing = {
      id: "t2@none",
      trackId: "t2",
      sceneId: scene.id,
      sceneIndex: scene.index,
      name: "",
      isPlaying: false,
      color: "#fff",
      hasContent: false,
      slotId: null,
    };
    component.triggerClip(missing);
    expect(createPatternSlot).toHaveBeenCalledWith("t2", scene.name);
    expect(launchClipPattern).not.toHaveBeenCalled();
  });

  it("stops the session and returns to the arrangement", () => {
    component.launchScene(component.scenes()[0]);
    component.stopAll();
    expect(stopScenePlayback).toHaveBeenCalled();
    expect(isPlaying()).toBe(false);

    component.backToSong();
    expect(backToArrangement).toHaveBeenCalled();
  });

  it("arms follow actions and clamps the bar count", () => {
    component.toggleFollow();
    expect(sceneFollowEnabled()).toBe(true);
    component.setFollowBars(1);
    expect(sceneFollowBars()).toBe(5);
    component.setFollowBars(-99);
    expect(sceneFollowBars()).toBe(1);
    component.setFollowBars(99);
    expect(sceneFollowBars()).toBe(32);
  });

  it("renames a scene across every channel that owns it", () => {
    component.openSceneActions(component.scenes()[0]);
    component.sceneNameInput.set("Intro");
    component.renameSelectedScene();

    expect(renamePatternSlot).toHaveBeenCalledWith("t1", "slot-a", "Intro");
    expect(renamePatternSlot).toHaveBeenCalledWith("t2", "slot-c", "Intro");
    expect(component.sceneActionSceneId()).toBeNull();
  });

  it("adds a scene by adding a pattern to every pattern channel", () => {
    component.addScene();
    expect(createPatternSlot).toHaveBeenCalledTimes(2);
    expect(createPatternSlot).toHaveBeenCalledWith("t1", "Scene 3");
  });

  it("mutes a real channel", () => {
    component.toggleMute(component.tracks()[0], new MouseEvent("click"));
    expect(toggleMute).toHaveBeenCalledWith("t1");
  });

  it("renders the grid from the real channels", () => {
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll(".sv-row").length).toBe(3); // header + 2 channels
    expect(host.querySelectorAll(".sv-scene-launch").length).toBe(2);
    expect(host.querySelectorAll(".sv-cell").length).toBe(4); // 2 channels × 2 scenes
    expect(host.textContent).toContain("Keys");
    expect(host.textContent).not.toContain("Vocal"); // audio channels have no grid
  });
});
