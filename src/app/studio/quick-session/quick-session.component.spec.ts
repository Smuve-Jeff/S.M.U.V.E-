import { ComponentFixture, TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";

import { QuickSessionComponent } from "./quick-session.component";
import { AudioSessionService } from "../audio-session.service";
import { RecordingStatusService } from "../recording-status.service";
import { MusicManagerService } from "../../services/music-manager.service";
import { AudioEngineService } from "../../services/audio-engine.service";
import { InstrumentsService } from "../../services/instruments.service";
import { IdeasGeneratorService } from "../../services/ideas-generator.service";
import { HapticService } from "../../services/haptic.service";
import { SnackbarService } from "../../services/snackbar.service";

describe("QuickSessionComponent", () => {
  let component: QuickSessionComponent;
  let fixture: ComponentFixture<QuickSessionComponent>;

  const isPlaying = signal(false);
  const isRecording = signal(false);
  const masterVolume = signal(80);
  const tempo = signal(120);
  const metronomeEnabled = signal(false);
  const playbackLoopEnabled = signal(false);
  const togglePlay = jest.fn();
  const toggleRecord = jest.fn(async () => undefined);
  const updateMasterVolume = jest.fn();
  const addTrack = jest.fn(() => "track-new");
  const updateVolume = jest.fn();
  const setActivePatternSlot = jest.fn((trackId: string, slotId: string) => {
    tracks.update((list) =>
      list.map((track) =>
        track.id === trackId ? { ...track, activePatternSlotId: slotId } : track,
      ),
    );
  });
  const scenePlaybackActive = signal(false);
  const activeSceneColumn = signal<number | null>(null);
  const sceneFollowEnabled = signal(false);
  const sceneFollowBars = signal(4);
  const patternSlotHasContent = jest.fn(
    (track: any, slot: any) =>
      (track.activePatternSlotId === slot.id
        ? (track.steps ?? []).some(Boolean)
        : (slot.versions?.at(-1)?.steps ?? []).some(Boolean)),
  );
  const launchSceneColumn = jest.fn((column: number) => {
    let switched = 0;
    tracks.update((list) =>
      list.map((track) => {
        const slot = track.patternSlots?.[column];
        if (!slot || !patternSlotHasContent(track, slot)) return track;
        switched++;
        return { ...track, activePatternSlotId: slot.id };
      }),
    );
    if (switched > 0) {
      activeSceneColumn.set(column);
      scenePlaybackActive.set(true);
    }
    return switched;
  });
  const backToArrangement = jest.fn(() => {
    scenePlaybackActive.set(false);
    activeSceneColumn.set(null);
  });
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
  const selectedTrackId = signal<string | null>(null);
  const armedTrackIds = signal<Set<string>>(new Set());
  const tracks = signal<any[]>([
    {
      id: "t1",
      name: "Keys",
      type: "midi",
      color: "#2ba09c",
      gain: 0.8,
      muted: false,
      soloed: false,
      notes: [],
      clips: [],
    },
  ]);

  const mockInstruments = {
    getPresets: () => [
      { id: "grand-piano", name: "Grand Piano", category: "piano" },
      { id: "analog-warmth", name: "Analog Warmth", category: "keys" },
      { id: "sub-commander", name: "Sub Commander", category: "bass" },
      { id: "trap-808-elite", name: "Trap 808", category: "drum" },
      { id: "modern-kit-elite", name: "Modern Kit", category: "drum" },
      { id: "cyber-stab", name: "Cyber Stab", category: "lead" },
      { id: "chamber-strings-elite", name: "Chamber Strings", category: "strings" },
    ],
  };

  const mockIdeas = {
    recipes: Array.from({ length: 5 }, (_, index) => ({
      id: `recipe-${index}`,
      name: `Recipe ${index}`,
      glyph: "◈",
      bpm: 90 + index * 12,
      vibe: "late night",
      progression: ["i", "VI", "III", "VII"],
      tracks: [],
    })),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    isPlaying.set(false);
    isRecording.set(false);
    scenePlaybackActive.set(false);
    activeSceneColumn.set(null);
    sceneFollowEnabled.set(false);
    sceneFollowBars.set(4);
    tempo.set(120);
    metronomeEnabled.set(false);
    playbackLoopEnabled.set(false);
    masterVolume.set(80);
    armedTrackIds.set(new Set());
    selectedTrackId.set(null);
    tracks.set([
      {
        id: "t1",
        name: "Keys",
        type: "midi",
        color: "#2ba09c",
        gain: 0.8,
        muted: false,
        soloed: false,
        notes: [],
        steps: Array.from({ length: 16 }, (_, index) => index % 4 === 0),
        clips: [],
        activePatternSlotId: "slot-0",
        patternSlots: [
          { id: "slot-0", name: "Pattern 1", activeVersionId: "v0", versions: [] },
          {
            id: "slot-1",
            name: "Verse",
            activeVersionId: "v1",
            versions: [
              {
                id: "v1",
                name: "captured",
                steps: Array.from({ length: 16 }, () => true),
                notes: [],
              },
            ],
          },
        ],
      },
    ]);

    await TestBed.configureTestingModule({
      imports: [QuickSessionComponent],
      providers: [
        {
          provide: AudioSessionService,
          useValue: {
            isPlaying,
            isRecording,
            masterVolume,
            togglePlay,
            toggleRecord,
            updateMasterVolume,
            stop: jest.fn(),
          },
        },
        {
          provide: RecordingStatusService,
          useValue: {
            armedTrackIds,
            isTrackArmed: (id: string) => armedTrackIds().has(id),
            toggleArmTrack: (id: string) => {
              const next = new Set(armedTrackIds());
              if (next.has(id)) next.delete(id);
              else next.add(id);
              armedTrackIds.set(next);
            },
          },
        },
        {
          provide: MusicManagerService,
          useValue: {
            tracks,
            selectedTrackId,
            addTrack,
            toggleMute: jest.fn(),
            toggleSolo: jest.fn(),
            updateVolume,
            setActivePatternSlot,
            createPatternSlot,
            scenePlaybackActive,
            activeSceneColumn,
            sceneFollowEnabled,
            sceneFollowBars,
            patternSlotHasContent,
            launchSceneColumn,
            backToArrangement,
          },
        },
        {
          provide: AudioEngineService,
          useValue: {
            tempo,
            metronomeEnabled,
            playbackLoopEnabled,
            toggleMetronome: jest.fn(() => metronomeEnabled.update((v) => !v)),
            togglePlaybackLoop: jest.fn(() =>
              playbackLoopEnabled.update((v) => !v),
            ),
          },
        },
        { provide: InstrumentsService, useValue: mockInstruments },
        { provide: IdeasGeneratorService, useValue: mockIdeas },
        { provide: HapticService, useValue: { light: jest.fn(), medium: jest.fn() } },
        {
          provide: SnackbarService,
          useValue: { info: jest.fn(), success: jest.fn(), error: jest.fn() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(QuickSessionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("keeps only the essential instruments on the core screen", () => {
    expect(component.coreInstruments().map((i) => i.id)).toEqual([
      "grand-piano",
      "analog-warmth",
      "sub-commander",
      "trap-808-elite",
      "modern-kit-elite",
      "cyber-stab",
    ]);
    // Drums map to a drum-type channel; everything else stays MIDI.
    expect(
      component.coreInstruments().find((i) => i.id === "modern-kit-elite")!.type,
    ).toBe("drum");
    expect(
      component.coreInstruments().find((i) => i.id === "grand-piano")!.type,
    ).toBe("midi");
  });

  it("offers a short recipe list rather than the whole generator", () => {
    expect(component.recipes()).toHaveLength(4);
  });

  it("drives the shared transport instead of local flags", async () => {
    component.togglePlay();
    expect(togglePlay).toHaveBeenCalledTimes(1);
    await component.toggleRecord();
    expect(toggleRecord).toHaveBeenCalledTimes(1);
    expect(isPlaying()).toBe(false);
  });

  it("clamps tempo to the musical range on both entry points", () => {
    tempo.set(240);
    component.setTempo(1);
    expect(tempo()).toBe(240);

    tempo.set(41);
    component.setTempo(-5);
    expect(tempo()).toBe(40);

    component.onTempoInput("999");
    expect(tempo()).toBe(240);
    component.onTempoInput("not a number");
    expect(tempo()).toBe(240);
  });

  it("adds the chosen sound as a real channel and selects it", () => {
    component.addInstrument(component.coreInstruments()[3]);
    expect(addTrack).toHaveBeenCalledWith("Trap 808", "trap-808-elite", "drum");
    expect(selectedTrackId()).toBe("track-new");
  });

  it("sends recipes through the shell so a dirty sketch is saved first", () => {
    const emitted: string[] = [];
    component.useRecipe.subscribe((id) => emitted.push(id));
    component.startRecipe(component.recipes()[1]);
    expect(emitted).toEqual(["recipe-1"]);
  });

  it("arms a channel through the shared recording state", () => {
    const track = tracks()[0];
    component.toggleArm(track, new MouseEvent("click"));
    expect(component.isArmed(track)).toBe(true);
    expect(component.armedCount()).toBe(1);
    component.toggleArm(track, new MouseEvent("click"));
    expect(component.armedCount()).toBe(0);
  });

  it("maps the compact fader onto the manager's gain scale", () => {
    const track = tracks()[0];
    expect(component.volumePercent(track)).toBe(80);
    component.onVolume(track, 125);
    expect(updateVolume).toHaveBeenCalledWith("t1", 1.25);
    component.onVolume(track, 999);
    expect(updateVolume).toHaveBeenLastCalledWith("t1", 1.5);
  });

  it("opens an editor on the channel it was tapped from", () => {
    const emitted: string[] = [];
    component.openView.subscribe((view) => emitted.push(view));
    component.openEditor(tracks()[0], "piano-roll");
    expect(selectedTrackId()).toBe("t1");
    expect(emitted).toEqual(["piano-roll"]);
  });

  it("opens secondary tools in a side panel, not on the core screen", () => {
    expect(component.panel()).toBeNull();
    component.togglePanel("sounds");
    expect(component.panel()).toBe("sounds");
    component.togglePanel("tools");
    expect(component.panel()).toBe("tools");
    component.togglePanel("tools");
    expect(component.panel()).toBeNull();
  });

  it("closes the open panel on Escape", () => {
    component.togglePanel("tools");
    component.onEscape();
    expect(component.panel()).toBeNull();
  });

  it("leaves the panel closed after jumping to an advanced tool", () => {
    const emitted: string[] = [];
    component.openView.subscribe((view) => emitted.push(view));
    component.togglePanel("tools");
    component.goTo("mixer");
    expect(emitted).toEqual(["mixer"]);
    expect(component.panel()).toBeNull();
  });

  it("exposes the advanced but real controls (master, metronome, loop)", () => {
    component.onMasterVolume(42);
    expect(updateMasterVolume).toHaveBeenCalledWith(42);
    component.toggleMetronome();
    expect(metronomeEnabled()).toBe(true);
    component.toggleLoop();
    expect(playbackLoopEnabled()).toBe(true);
  });

  // ── Scene grid ────────────────────────────────────────────────────
  it("builds the scene grid from the live channels, not a fixed template", () => {
    const rows = component.sceneRows();
    expect(rows.map((row) => row.track.id)).toEqual(["t1"]);
    // Two real slots → two columns, and each cell points at the slot it owns.
    expect(component.sceneColumns()).toEqual([0, 1]);
    expect(rows[0].cells[0].slotId).toBe("slot-0");
    expect(rows[0].cells[0].active).toBe(true);
    expect(rows[0].cells[1].slotId).toBe("slot-1");
    expect(rows[0].cells[1].active).toBe(false);
    // The active pattern is judged by the live pattern, other slots by their
    // latest captured version.
    expect(rows[0].cells[0].hasContent).toBe(true);
    expect(rows[0].cells[1].hasContent).toBe(true);

    // Audio channels have no pattern grid.
    tracks.update((list) => [
      ...list,
      {
        id: "a1",
        name: "Vocal",
        type: "audio",
        color: "#111",
        gain: 0.8,
        muted: false,
        soloed: false,
        notes: [],
        steps: [],
        clips: [],
        patternSlots: [],
      },
    ]);
    expect(component.sceneRows().map((row) => row.track.id)).toEqual(["t1"]);
  });

  it("edits a pattern when its cell is tapped, without starting playback", () => {
    const row = component.sceneRows()[0];
    component.openSceneCell(row, row.cells[1]);
    expect(setActivePatternSlot).toHaveBeenCalledWith("t1", "slot-1");
    expect(selectedTrackId()).toBe("t1");
    expect(togglePlay).not.toHaveBeenCalled();
  });

  it("creates the pattern when an empty cell is tapped", () => {
    const row = component.sceneRows()[0];
    const empty = { ...row.cells[1], slotId: null, active: false, hasContent: false };
    component.openSceneCell(row, empty);
    expect(createPatternSlot).toHaveBeenCalledWith("t1", "Verse");
    expect(setActivePatternSlot).not.toHaveBeenCalled();
  });

  it("adds a pattern to one channel past the last column", () => {
    component.addPattern(tracks()[0]);
    expect(createPatternSlot).toHaveBeenCalledWith("t1");
    expect(component.sceneRows()[0].cells.length).toBe(3);
  });

  it("launches a scene through the manager, then plays", () => {
    component.launchScene(1);
    expect(launchSceneColumn).toHaveBeenCalledWith(1);
    expect(togglePlay).toHaveBeenCalledTimes(1);
    expect(scenePlaybackActive()).toBe(true);
    expect(component.isSceneActive(1)).toBe(true);
    expect(component.isSceneActive(0)).toBe(false);
  });

  it("does not replay the transport or fake a launch for an empty column", () => {
    isPlaying.set(true);
    component.launchScene(1);
    expect(togglePlay).not.toHaveBeenCalled();

    jest.clearAllMocks();
    component.launchScene(6);
    expect(togglePlay).not.toHaveBeenCalled();
    expect(scenePlaybackActive()).toBe(true); // unchanged by the no-op launch
  });

  it("returns to the arrangement from a launched scene", () => {
    component.launchScene(0);
    component.backToSong();
    expect(backToArrangement).toHaveBeenCalledTimes(1);
    expect(scenePlaybackActive()).toBe(false);
    expect(component.isSceneActive(0)).toBe(false);
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

  it("renders the grid and its launch headers", () => {
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector(".qs-scene-grid")).not.toBeNull();
    expect(host.querySelectorAll(".qs-scene-launch")).toHaveLength(2);
    expect(host.querySelectorAll(".qs-scene-cell")).toHaveLength(2);
    // The active pattern is the one marked as being edited.
    expect(host.querySelector(".qs-scene-cell.is-active")).not.toBeNull();
  });

  it("renders the core workspace and hides advanced tools until asked", () => {
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector(".qs-transport")).not.toBeNull();
    expect(host.querySelector(".qs-channel-list")).not.toBeNull();
    expect(host.querySelector("#qs-tools-panel")).toBeNull();

    component.togglePanel("tools");
    fixture.detectChanges();
    expect(host.querySelector("#qs-tools-panel")).not.toBeNull();
    // The backdrop is what makes the panel modal and dismissible.
    expect(host.querySelector(".qs-backdrop")).not.toBeNull();
  });
});
