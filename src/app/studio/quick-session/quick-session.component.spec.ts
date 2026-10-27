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
        clips: [],
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
