import { ComponentFixture, TestBed } from "@angular/core/testing";
import { computed, signal } from "@angular/core";

import { InspectorComponent } from "./inspector.component";
import { MusicManagerService } from "../../services/music-manager.service";
import { HapticService } from "../../services/haptic.service";
import { LoggingService } from "../../services/logging.service";

import { PluginStoreService } from "../../services/plugin-store.service";

function makeTrack(overrides: Record<string, unknown> = {}) {
  return {
    id: "track-1",
    name: "Lead Vox",
    type: "audio",
    instrumentId: "grand-piano",
    notes: [],
    steps: [],
    fxSlots: [],
    muted: false,
    soloed: false,
    volume: 0.8,
    gain: 0.8,
    pan: 0,
    sendA: 0,
    sendB: 0,
    color: "#E11D48",
    phaseInvert: false,
    stereoWidth: 0,
    ...overrides,
  } as any;
}

describe("InspectorComponent", () => {
  let fixture: ComponentFixture<InspectorComponent>;
  let component: InspectorComponent;
  let tracks: ReturnType<typeof signal<any[]>>;
  let selectedTrackId: ReturnType<typeof signal<string | null>>;

  const manager = {
    updateVolume: jest.fn(),
    updateTrackPan: jest.fn(),
    updateSend: jest.fn(),
    updateStereoWidth: jest.fn(),
    toggleMute: jest.fn(),
    toggleSolo: jest.fn(),
    togglePhase: jest.fn(),
    toggleFxSlot: jest.fn(),
    removeFxSlot: jest.fn(),
    setTrackPlugins: jest.fn(),
  };

  const catalog = [
    { id: "smuve.tube.v1", name: "Tube Glue", category: "Saturation" },
    { id: "smuve.eq.v1", name: "Channel EQ", category: "EQ" },
  ];
  const pluginStore = { catalog: catalog as any[] };

  beforeEach(async () => {
    jest.clearAllMocks();
    tracks = signal<any[]>([]);
    selectedTrackId = signal<string | null>(null);
    // A real computed, not a fresh signal per read: the component binds this
    // directly, so a new instance on every access would thrash change detection.
    const selectedTrack = computed(
      () => tracks().find((t) => t.id === selectedTrackId()) ?? null,
    );

    await TestBed.configureTestingModule({
      imports: [InspectorComponent],
      providers: [
        {
          provide: MusicManagerService,
          useValue: {
            tracks,
            selectedTrackId,
            selectedTrack,
            ...manager,
          },
        },
        {
          provide: HapticService,
          useValue: {
            light: jest.fn(),
            medium: jest.fn(),
          },
        },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        { provide: PluginStoreService, useValue: pluginStore },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InspectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("never renders a dead panel — it explains the gesture instead", () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? "";
    expect(text).toContain("Tap a track lane");
    expect(text).toContain("0 tracks in this session");
  });

  it("shows the selected track with a dB level and a text pan cue", () => {
    tracks.set([makeTrack()]);
    selectedTrackId.set("track-1");
    fixture.detectChanges();

    expect(component.gainLabel).toBe("-1.9 dB");
    expect(component.panLabel).toBe("C");

    const text = (fixture.nativeElement as HTMLElement).textContent ?? "";
    expect(text).toContain("Lead Vox");
    expect(text).toContain("AUDIO");
  });

  it("reads pan as a direction, not a signed number", () => {
    tracks.set([makeTrack({ pan: -0.42 })]);
    selectedTrackId.set("track-1");
    expect(component.panLabel).toBe("L42");

    tracks.set([makeTrack({ pan: 0.5 })]);
    expect(component.panLabel).toBe("R50");
  });

  it("floors a muted-out level at -infinity instead of printing NaN", () => {
    tracks.set([makeTrack({ gain: 0 })]);
    selectedTrackId.set("track-1");
    expect(component.gainLabel).toBe("−∞");
  });

  it("writes volume through the manager on the 0–150 scale it expects", () => {
    tracks.set([makeTrack()]);
    selectedTrackId.set("track-1");
    component.onVolume("125");
    expect(manager.updateVolume).toHaveBeenCalledWith("track-1", 1.25);
  });

  it("writes pan as a -100…100 percentage, which the manager normalizes", () => {
    tracks.set([makeTrack()]);
    selectedTrackId.set("track-1");
    component.onPan("-60");
    expect(manager.updateTrackPan).toHaveBeenCalledWith("track-1", -60);
  });

  it("routes mute, solo and phase through the manager, not into local state", () => {
    tracks.set([makeTrack()]);
    selectedTrackId.set("track-1");
    component.toggleMute();
    component.toggleSolo();
    component.togglePhase();
    expect(manager.toggleMute).toHaveBeenCalledWith("track-1");
    expect(manager.toggleSolo).toHaveBeenCalledWith("track-1");
    expect(manager.togglePhase).toHaveBeenCalledWith("track-1");
  });

  it("renders one row per insert and toggles it by slot id", () => {
    tracks.set([
      makeTrack({
        fxSlots: [
          { id: "fx1", type: "Reverb", params: {}, enabled: true },
          { id: "fx2", type: "Compressor", params: {}, enabled: false },
        ],
      }),
    ]);
    selectedTrackId.set("track-1");
    fixture.detectChanges();

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll(
      ".insp-fx-slot",
    );
    expect(rows.length).toBe(2);
    expect(rows[1].classList.contains("is-off")).toBe(true);

    component.toggleFx("fx2");
    expect(manager.toggleFxSlot).toHaveBeenCalledWith("track-1", "fx2");
  });

  it("emits the track id when the rack is requested, and nothing without one", () => {
    const emitted: string[] = [];
    component.openEffectsRack.subscribe((id) => emitted.push(id));

    component.openRack();
    expect(emitted).toEqual([]);

    tracks.set([makeTrack()]);
    selectedTrackId.set("track-1");
    component.openRack();
    expect(emitted).toEqual(["track-1"]);
  });

  it("hides the whole body when collapsed but keeps the track colour visible", () => {
    tracks.set([makeTrack()]);
    selectedTrackId.set("track-1");
    fixture.componentRef.setInput("collapsed", true);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector(".insp-body")).toBeNull();
    expect(host.querySelector(".insp-rail-swatch")).not.toBeNull();
    expect(
      host.querySelector(".insp")?.classList.contains("insp-collapsed"),
    ).toBe(true);
  });

  it("asks the shell to toggle rather than owning the collapsed state itself", () => {
    const toggles: number[] = [];
    component.toggleCollapsed.subscribe(() => toggles.push(1));
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      ".insp-toggle",
    ) as HTMLButtonElement;
    button.click();
    expect(toggles).toHaveLength(1);
  });

  it("lists the channel's plugins with readable names and removes by id", () => {
    tracks.set([makeTrack({ pluginIds: ["smuve.tube.v1"] })]);
    selectedTrackId.set("track-1");
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const rows = host.querySelectorAll(".insp-plugin");
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain("Tube Glue");

    component.removePlugin("smuve.tube.v1");
    expect(manager.setTrackPlugins).toHaveBeenCalledWith("track-1", []);
  });

  it("inserts only plugins the track does not already run", () => {
    tracks.set([makeTrack({ pluginIds: ["smuve.tube.v1"] })]);
    selectedTrackId.set("track-1");
    fixture.detectChanges();

    expect(component.availablePlugins().map((p) => p.id)).toEqual([
      "smuve.eq.v1",
    ]);

    component.togglePluginPicker();
    component.addPlugin(component.availablePlugins()[0]);
    expect(manager.setTrackPlugins).toHaveBeenCalledWith("track-1", [
      "smuve.tube.v1",
      "smuve.eq.v1",
    ]);
    expect(component.pluginPickerOpen()).toBe(false);
  });

  it("labels track kinds for the badge", () => {
    expect(component.typeLabel(makeTrack({ type: "audio" }))).toBe("AUDIO");
    expect(component.typeLabel(makeTrack({ type: "drum" }))).toBe("DRUM");
    expect(component.typeLabel(makeTrack({ type: "bus" }))).toBe("BUS");
    expect(component.typeLabel(makeTrack({ type: "midi" }))).toBe("MIDI");
  });
});
