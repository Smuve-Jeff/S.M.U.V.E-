import { ComponentFixture, TestBed } from "@angular/core/testing";
import {
  SmartCreationSheetComponent,
  GenreStarter,
  QuickChordMood,
} from "./smart-creation-sheet.component";
import { HapticService } from "../../../services/haptic.service";
import { IdeasGeneratorService } from "../../../services/ideas-generator.service";
import { MusicManagerService } from "../../../services/music-manager.service";
import { AudioEngineService } from "../../../services/audio-engine.service";
import { SnackbarService } from "../../../services/snackbar.service";
import { UserProfileService } from "../../../services/user-profile.service";
import { WorkProtectionService } from "../../work-protection.service";
import { CompositionAuditionService } from "../../../composer/composition-audition.service";
import { ProjectTemplateService } from "../../../services/project-template.service";
import {
  templateSectionPreviewId,
  templateSectionsPreviewId,
} from "../template-audition.util";
import { signal } from "@angular/core";

/** jsdom has no TouchEvent — build a plain Event carrying a single touch point. */
const touch = (
  type: string,
  point: { clientX?: number; clientY?: number },
): Event => {
  const payload = { clientX: point.clientX ?? 0, clientY: point.clientY ?? 0 };
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: [payload] });
  Object.defineProperty(event, "changedTouches", { value: [payload] });
  return event;
};

/** Vertical touch point, as used by the drag handle. */
const touchEvent = (type: string, clientY: number): Event =>
  touch(type, { clientY });

/** Horizontal touch point, as used by the tab-swipe gesture. */
const swipeEvent = (type: string, clientX: number, clientY = 400): Event =>
  touch(type, { clientX, clientY });

const tap = (target: HTMLElement) =>
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));

const SHEET_MEMORY_KEY = "smuve_smart_sheet_memory";

const sectionTemplateFixture = () =>
  ({
    id: "tpl-7",
    name: "Section Sketch",
    bpm: 100,
    tracks: [
      {
        name: "Lead",
        instrumentId: "analog-warmth",
        type: "midi",
        activePatternSlotId: "slot-1",
        patternSlots: [
          {
            id: "slot-1",
            name: "Verse",
            notes: [{ midi: 64, step: 0, length: 4, velocity: 0.8 }],
            activeVersionId: "v2",
            versions: [
              {
                id: "v1",
                name: "first",
                notes: [{ midi: 60, step: 0, length: 2, velocity: 0.7 }],
              },
              {
                id: "v2",
                name: "lift",
                notes: [{ midi: 67, step: 4, length: 4, velocity: 0.9 }],
              },
            ],
          },
        ],
      },
      {
        name: "Keys",
        instrumentId: "grand-piano",
        type: "midi",
        notes: [{ midi: 48, step: 4, length: 2, velocity: 0.6 }],
      },
    ],
  }) as any;

const readMemory = () =>
  JSON.parse(window.localStorage.getItem(SHEET_MEMORY_KEY) || "null");

describe("SmartCreationSheetComponent", () => {
  let component: SmartCreationSheetComponent;
  let fixture: ComponentFixture<SmartCreationSheetComponent>;

  const mockHaptic = {
    light: jest.fn(),
    medium: jest.fn(),
  };

  const mockIdeas = {
    recipes: [
      { id: "trap", name: "Trap Elite", tempo: 140, genre: "Trap", tracks: [] },
      { id: "rnb", name: "Smooth R&B", tempo: 92, genre: "R&B", tracks: [] },
    ],
    recommend: jest.fn().mockReturnValue({
      id: "rec",
      name: "Recommended",
      tempo: 120,
      genre: "Pop",
      tracks: [],
    }),
    generatePredictiveNotes: jest.fn().mockReturnValue({
      notes: [{ midi: 60, step: 0, length: 4, velocity: 0.8 }],
    }),
  };

  const tracksSignal = signal<any[]>([]);

  const mockMusicManager = {
    tracks: tracksSignal,
    applyGeneratedRecipe: jest.fn(),
    addTrack: jest.fn().mockReturnValue("track_1"),
    replaceTrackNotes: jest.fn(),
  };

  const mockAudioEngine = {
    resume: jest.fn(),
    start: jest.fn(),
    tempo: signal(120),
  };

  const mockSnackbar = {
    success: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  };

  const mockCompositionAudition = {
    rendering: signal(false),
    playing: signal(false),
    error: signal<string | null>(null),
    readyCompositionId: signal<string | null>(null),
    progress: signal(0),
    previewSeconds: signal(0),
    previewBars: signal(1),
    startScore: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn(),
    clear: jest.fn(),
  };

  const userTemplatesSignal = signal<any[]>([]);
  const mockProjectTemplates = {
    userTemplates: userTemplatesSignal,
    saveTemplateSection: jest.fn(),
    renameTemplateSection: jest.fn(),
    setTemplateSectionBars: jest.fn(),
    moveTemplateSection: jest.fn(),
    deleteTemplateSection: jest.fn(),
    applyTemplate: jest.fn(),
    deleteUserTemplate: jest.fn(),
    saveCurrentAsTemplate: jest.fn(),
  };

  const mockUserProfileService = {
    profile: signal<any>({ settings: { studio: {} } }),
    // Faithful to the real service: the patch is merged into the profile signal
    // so a later read (or a re-created component) observes the write.
    updateProfile: jest.fn((patch: any) => {
      const current = mockUserProfileService.profile();
      mockUserProfileService.profile.set({
        ...current,
        ...patch,
        settings: { ...current.settings, ...patch.settings },
      });
      return Promise.resolve(undefined);
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCompositionAudition.rendering.set(false);
    mockCompositionAudition.playing.set(false);
    mockCompositionAudition.error.set(null);
    mockCompositionAudition.readyCompositionId.set(null);
    mockCompositionAudition.progress.set(0);
    mockCompositionAudition.previewSeconds.set(0);
    mockCompositionAudition.previewBars.set(1);
    userTemplatesSignal.set([]);
    window.localStorage.removeItem(SHEET_MEMORY_KEY);
    mockUserProfileService.profile.set({ settings: { studio: {} } });
    await TestBed.configureTestingModule({
      imports: [SmartCreationSheetComponent],
      providers: [
        { provide: HapticService, useValue: mockHaptic },
        { provide: IdeasGeneratorService, useValue: mockIdeas },
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: AudioEngineService, useValue: mockAudioEngine },
        { provide: SnackbarService, useValue: mockSnackbar },
        {
          provide: CompositionAuditionService,
          useValue: mockCompositionAudition,
        },
        { provide: ProjectTemplateService, useValue: mockProjectTemplates },
        { provide: UserProfileService, useValue: mockUserProfileService },
        {
          provide: WorkProtectionService,
          useValue: { preserveBeforeReplace: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SmartCreationSheetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("creates the component and defaults to beats tab", () => {
    expect(component).toBeTruthy();
    expect(component.activeTab()).toBe("beats");
  });

  it("switches tabs on demand", () => {
    component.setTab("vocals");
    expect(component.activeTab()).toBe("vocals");
    expect(mockHaptic.light).toHaveBeenCalled();

    component.setTab("chords");
    expect(component.activeTab()).toBe("chords");

    component.setTab("ai");
    expect(component.activeTab()).toBe("ai");
  });

  it("loads a genre starter groove into timeline", async () => {
    const navigateSpy = jest.spyOn(component.navigateToView, "emit");
    const closeSpy = jest.spyOn(component.closeSheet, "emit");

    const starter: GenreStarter = component.genreStarters[0];
    await component.loadStarter(starter);

    expect(mockHaptic.medium).toHaveBeenCalled();
    expect(mockAudioEngine.resume).toHaveBeenCalled();
    expect(mockMusicManager.applyGeneratedRecipe).toHaveBeenCalled();
    expect(mockAudioEngine.tempo()).toBe(starter.bpm);
    expect(mockSnackbar.success).toHaveBeenCalledWith(
      expect.stringContaining(starter.name),
    );
    expect(navigateSpy).toHaveBeenCalledWith("arrangement");
    expect(closeSpy).toHaveBeenCalled();
  });

  it("sets up vocal recording mode", () => {
    tracksSignal.set([]);
    const navigateSpy = jest.spyOn(component.navigateToView, "emit");
    const closeSpy = jest.spyOn(component.closeSheet, "emit");

    component.setupVocalRecording();

    expect(mockMusicManager.addTrack).toHaveBeenCalledWith(
      "Lead Vocals",
      "grand-piano",
    );
    expect(mockSnackbar.info).toHaveBeenCalledWith(
      expect.stringContaining("Vocal Booth"),
    );
    expect(navigateSpy).toHaveBeenCalledWith("vocal-suite");
    expect(closeSpy).toHaveBeenCalled();
  });

  it("sets up quick audio memo recorder", () => {
    const navigateSpy = jest.spyOn(component.navigateToView, "emit");
    const closeSpy = jest.spyOn(component.closeSheet, "emit");

    component.setupAudioRecorder();

    expect(navigateSpy).toHaveBeenCalledWith("audio-recorder");
    expect(closeSpy).toHaveBeenCalled();
  });

  it("applies chord mood and injects notes", () => {
    const navigateSpy = jest.spyOn(component.navigateToView, "emit");
    const closeSpy = jest.spyOn(component.closeSheet, "emit");

    const mood: QuickChordMood = component.chordMoods[0];
    tracksSignal.set([{ id: "track_keys", name: "Keys / Chords" }]);

    component.applyChordMood(mood);

    expect(mockIdeas.generatePredictiveNotes).toHaveBeenCalled();
    expect(mockMusicManager.replaceTrackNotes).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith("piano-roll");
    expect(closeSpy).toHaveBeenCalled();
  });

  it("navigates to standalone helpers (chord editor, AI produce, drum machine, piano roll)", () => {
    const navigateSpy = jest.spyOn(component.navigateToView, "emit");
    const closeSpy = jest.spyOn(component.closeSheet, "emit");

    component.openChordEditor();
    expect(navigateSpy).toHaveBeenCalledWith("chord-editor");
    expect(closeSpy).toHaveBeenCalled();

    component.openAiProduce();
    expect(navigateSpy).toHaveBeenCalledWith("ai-produce");

    component.openDrumMachine();
    expect(navigateSpy).toHaveBeenCalledWith("drum-machine");

    component.openPianoRoll();
    expect(navigateSpy).toHaveBeenCalledWith("piano-roll");
  });

  // ── Touchscreen gestures (drag handle, backdrop, taps) ─────────────

  it("dismisses the sheet when the drag handle is pulled past the threshold", () => {
    const closeSpy = jest.spyOn(component.closeSheet, "emit");
    const handle: HTMLElement =
      fixture.nativeElement.querySelector(".sc-drag-handle");
    const sheet: HTMLElement = fixture.nativeElement.querySelector(".sc-sheet");

    handle.dispatchEvent(touchEvent("touchstart", 100));
    handle.dispatchEvent(touchEvent("touchmove", 260));
    fixture.detectChanges();

    expect(component.sheetDragOffset()).toBe(160);
    expect(sheet.style.transform).toContain("translateY(160px)");

    handle.dispatchEvent(new Event("touchend", { bubbles: true }));

    expect(component.sheetDragOffset()).toBe(0);
    expect(mockHaptic.medium).toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
  });

  it("snaps back without dismissing when the drag stays under the threshold", () => {
    const closeSpy = jest.spyOn(component.closeSheet, "emit");
    const handle: HTMLElement =
      fixture.nativeElement.querySelector(".sc-drag-handle");

    handle.dispatchEvent(touchEvent("touchstart", 200));
    handle.dispatchEvent(touchEvent("touchmove", 240));
    expect(component.sheetDragOffset()).toBe(40);

    // Upward pulls must not lift the sheet off the bottom edge.
    handle.dispatchEvent(touchEvent("touchmove", 120));
    expect(component.sheetDragOffset()).toBe(0);

    handle.dispatchEvent(new Event("touchend", { bubbles: true }));

    expect(component.sheetDragOffset()).toBe(0);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("resets the drag on touchcancel without dismissing", () => {
    const closeSpy = jest.spyOn(component.closeSheet, "emit");
    const handle: HTMLElement =
      fixture.nativeElement.querySelector(".sc-drag-handle");

    handle.dispatchEvent(touchEvent("touchstart", 100));
    handle.dispatchEvent(touchEvent("touchmove", 400));
    expect(component.sheetDragOffset()).toBe(300);

    handle.dispatchEvent(new Event("touchcancel", { bubbles: true }));

    expect(component.sheetDragOffset()).toBe(0);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("ignores touchmove events before a drag has started", () => {
    const handle: HTMLElement =
      fixture.nativeElement.querySelector(".sc-drag-handle");

    handle.dispatchEvent(touchEvent("touchmove", 300));

    expect(component.sheetDragOffset()).toBe(0);
  });

  it("closes the sheet when the mobile backdrop is tapped", () => {
    const closeSpy = jest.spyOn(component.closeSheet, "emit");

    tap(fixture.nativeElement.querySelector(".sc-backdrop"));

    expect(closeSpy).toHaveBeenCalled();
  });

  it("switches panels when a workflow tab is tapped", () => {
    const tabs: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll(".sc-tab"),
    );

    expect(tabs).toHaveLength(4);
    expect(
      fixture.nativeElement.querySelector(".sc-starters-grid"),
    ).toBeTruthy();

    tap(tabs[1]);
    fixture.detectChanges();

    expect(component.activeTab()).toBe("vocals");
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(
      fixture.nativeElement.querySelector(".sc-vocal-presets-grid"),
    ).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector(".sc-starters-grid"),
    ).toBeFalsy();
  });

  // ── Vocal preset packs ────────────────────────────────────────────

  it("renders a one-tap card for every vocal preset", () => {
    component.setTab("vocals");
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll(
      ".sc-vocal-preset-card",
    );

    expect(component.vocalPresets.length).toBeGreaterThanOrEqual(5);
    expect(cards.length).toBe(component.vocalPresets.length);
    expect(cards[0].getAttribute("aria-label")).toContain(
      component.vocalPresets[0].name,
    );
  });

  it("arms a vocal preset on tap: adds a vocal track and opens the booth", () => {
    tracksSignal.set([]);
    const navigateSpy = jest.spyOn(component.navigateToView, "emit");
    const closeSpy = jest.spyOn(component.closeSheet, "emit");
    const preset = component.vocalPresets[0];

    component.setTab("vocals");
    fixture.detectChanges();
    tap(fixture.nativeElement.querySelector(".sc-vocal-preset-card"));

    expect(mockHaptic.medium).toHaveBeenCalled();
    expect(mockAudioEngine.resume).toHaveBeenCalled();
    expect(mockMusicManager.addTrack).toHaveBeenCalledWith(
      "Lead Vocals",
      "grand-piano",
    );
    expect(mockSnackbar.success).toHaveBeenCalledWith(
      expect.stringContaining(preset.name),
    );
    expect(navigateSpy).toHaveBeenCalledWith("vocal-suite");
    expect(closeSpy).toHaveBeenCalled();
  });

  it("reuses an existing vocal track instead of stacking duplicates", () => {
    tracksSignal.set([{ id: "track_vox", name: "Lead Vocals" }]);
    const preset = component.vocalPresets[1];

    component.applyVocalPreset(preset);

    expect(mockMusicManager.addTrack).not.toHaveBeenCalled();
    expect(mockSnackbar.success).toHaveBeenCalledWith(
      expect.stringContaining(preset.chain[0]),
    );
  });

  // ── Swipe between workflow tabs ────────────────────────────────────

  it("swipes forward and backward between workflow tabs", () => {
    const content: HTMLElement =
      fixture.nativeElement.querySelector(".sc-content");

    content.dispatchEvent(swipeEvent("touchstart", 300));
    content.dispatchEvent(swipeEvent("touchend", 180));
    expect(component.activeTab()).toBe("vocals");

    content.dispatchEvent(swipeEvent("touchstart", 180));
    content.dispatchEvent(swipeEvent("touchend", 300));
    expect(component.activeTab()).toBe("beats");
  });

  it("walks the whole tab strip with repeated swipes", () => {
    const content: HTMLElement =
      fixture.nativeElement.querySelector(".sc-content");
    const swipeLeft = () => {
      content.dispatchEvent(swipeEvent("touchstart", 300));
      content.dispatchEvent(swipeEvent("touchend", 160));
    };

    swipeLeft();
    expect(component.activeTab()).toBe("vocals");
    swipeLeft();
    expect(component.activeTab()).toBe("chords");
    swipeLeft();
    expect(component.activeTab()).toBe("ai");

    // No wrap-around past the last tab.
    swipeLeft();
    expect(component.activeTab()).toBe("ai");
  });

  it("ignores vertical scroll flicks and cancelled swipes", () => {
    const content: HTMLElement =
      fixture.nativeElement.querySelector(".sc-content");

    // Mostly vertical travel — the scroller owns this gesture.
    content.dispatchEvent(swipeEvent("touchstart", 300, 200));
    content.dispatchEvent(swipeEvent("touchend", 200, 320));
    expect(component.activeTab()).toBe("beats");

    // Diagonal drift under the threshold must not flip tabs either.
    content.dispatchEvent(swipeEvent("touchstart", 300, 400));
    content.dispatchEvent(swipeEvent("touchend", 270, 405));
    expect(component.activeTab()).toBe("beats");

    // touchcancel (scroll takeover) drops the gesture.
    content.dispatchEvent(swipeEvent("touchstart", 300));
    content.dispatchEvent(new Event("touchcancel", { bubbles: true }));
    content.dispatchEvent(swipeEvent("touchend", 160));
    expect(component.activeTab()).toBe("beats");
  });

  // ── Flick dismissal from the whole sheet chrome ─────────────────────

  it("dismisses on a quick downward flick that stops short of the threshold", () => {
    const closeSpy = jest.spyOn(component.closeSheet, "emit");
    const header: HTMLElement =
      fixture.nativeElement.querySelector(".sc-header");

    jest.useFakeTimers();
    try {
      header.dispatchEvent(touchEvent("touchstart", 200));
      jest.advanceTimersByTime(60);
      header.dispatchEvent(touchEvent("touchmove", 245)); // 45px in 60ms ≈ 0.75 px/ms
      header.dispatchEvent(new Event("touchend", { bubbles: true }));
    } finally {
      jest.useRealTimers();
    }

    expect(closeSpy).toHaveBeenCalled();
  });

  it("does not treat a slow short drag as a flick", () => {
    const closeSpy = jest.spyOn(component.closeSheet, "emit");
    const header: HTMLElement =
      fixture.nativeElement.querySelector(".sc-header");

    jest.useFakeTimers();
    try {
      header.dispatchEvent(touchEvent("touchstart", 200));
      jest.advanceTimersByTime(400);
      header.dispatchEvent(touchEvent("touchmove", 245)); // same 45px, far too slow
      header.dispatchEvent(new Event("touchend", { bubbles: true }));
    } finally {
      jest.useRealTimers();
    }

    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("never lets a drag inside the scrolling panel move the sheet", () => {
    const closeSpy = jest.spyOn(component.closeSheet, "emit");
    const content: HTMLElement =
      fixture.nativeElement.querySelector(".sc-content");

    content.dispatchEvent(touchEvent("touchstart", 300));
    content.dispatchEvent(touchEvent("touchmove", 500));
    content.dispatchEvent(new Event("touchend", { bubbles: true }));

    expect(component.sheetDragOffset()).toBe(0);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  // ── Remembering the last pack & preset ─────────────────────────────

  it("persists the last groove, preset and tab, then restores them on relaunch", async () => {
    const starter = component.genreStarters[2];
    const preset = component.vocalPresets[3];

    await component.loadStarter(starter);
    component.applyVocalPreset(preset);
    component.setTab("chords");

    expect(readMemory()).toMatchObject({
      lastStarterId: starter.id,
      lastVocalPresetId: preset.id,
      lastTab: "chords",
      updatedAt: expect.any(Number),
    });
    // Per-item stamps ride in the same payload so the Recent row survives too.
    expect(Object.keys(readMemory().recent)).toEqual([
      `starter:${starter.id}`,
      `vocal:${preset.id}`,
    ]);

    // A fresh instance stands in for the next launch.
    const relaunched = TestBed.createComponent(SmartCreationSheetComponent);
    relaunched.detectChanges();
    const fresh = relaunched.componentInstance;

    expect(fresh.activeTab()).toBe("chords");
    expect(fresh.lastStarter()?.id).toBe(starter.id);
    expect(fresh.lastVocalPreset()?.id).toBe(preset.id);

    // Recency: the last-used pack leads its grid.
    expect(fresh.orderedStarters()[0].id).toBe(starter.id);
    expect(fresh.orderedVocalPresets()[0].id).toBe(preset.id);

    fresh.setTab("beats");
    relaunched.detectChanges();
    const resumeBar: HTMLElement =
      relaunched.nativeElement.querySelector(".sc-resume-bar");
    expect(resumeBar.textContent).toContain(starter.name);
    expect(
      relaunched.nativeElement.querySelectorAll(".sc-last-used-chip"),
    ).toHaveLength(1);

    const closeSpy = jest.spyOn(fresh.closeSheet, "emit");
    tap(resumeBar);
    // The starter path passes the preservation gate before it applies.
    await Promise.resolve();

    expect(mockMusicManager.applyGeneratedRecipe).toHaveBeenCalled();
    expect(mockAudioEngine.tempo()).toBe(starter.bpm);
    expect(closeSpy).toHaveBeenCalled();
  });

  it("re-arms the last vocal preset from the resume bar", () => {
    component.applyVocalPreset(component.vocalPresets[2]);

    const relaunched = TestBed.createComponent(SmartCreationSheetComponent);
    relaunched.detectChanges();
    const fresh = relaunched.componentInstance;
    fresh.setTab("vocals");
    relaunched.detectChanges();

    const resumeBar: HTMLElement =
      relaunched.nativeElement.querySelector(".sc-resume-bar");
    expect(resumeBar.textContent).toContain(fresh.vocalPresets[2].name);

    tap(resumeBar);

    expect(mockSnackbar.success).toHaveBeenCalledWith(
      expect.stringContaining(fresh.vocalPresets[2].name),
    );
  });

  it("remembers the last chord mood and pins it to the front of the grid", () => {
    const mood = component.chordMoods[4];

    component.applyChordMood(mood);

    expect(component.lastChordMoodId()).toBe(mood.id);
    expect(component.orderedChordMoods()[0].id).toBe(mood.id);
    expect(readMemory()).toMatchObject({
      lastChordMoodId: mood.id,
      recent: { [`chord:${mood.id}`]: expect.any(Number) },
    });

    const relaunched = TestBed.createComponent(SmartCreationSheetComponent);
    relaunched.detectChanges();
    const fresh = relaunched.componentInstance;
    fresh.setTab("chords");
    relaunched.detectChanges();

    expect(fresh.activeTab()).toBe("chords");
    expect(fresh.lastChordMood()?.id).toBe(mood.id);
    expect(fresh.orderedChordMoods()[0].id).toBe(mood.id);

    const cards = relaunched.nativeElement.querySelectorAll(
      ".sc-chord-mood-card",
    );
    expect(cards[0].getAttribute("aria-label")).toContain(mood.label);
    expect(
      relaunched.nativeElement.querySelectorAll(".sc-last-used-chip"),
    ).toHaveLength(1);
    const resumeBar: HTMLElement =
      relaunched.nativeElement.querySelector(".sc-resume-bar");
    expect(resumeBar.textContent).toContain(mood.label);
  });

  it("ignores stored recall that no longer matches a pack", () => {
    window.localStorage.setItem(
      SHEET_MEMORY_KEY,
      JSON.stringify({
        lastStarterId: "deleted-pack",
        lastVocalPresetId: "deleted-preset",
        lastChordMoodId: "deleted-mood",
        lastTab: "not-a-tab",
        updatedAt: Date.now(),
        recent: {
          "starter:deleted-pack": Date.now(),
          "chord:deleted-mood": Date.now(),
        },
      }),
    );

    const fresh = TestBed.createComponent(
      SmartCreationSheetComponent,
    ).componentInstance;

    expect(fresh.activeTab()).toBe("beats");
    expect(fresh.lastStarter()).toBeNull();
    expect(fresh.lastVocalPreset()).toBeNull();
    expect(fresh.lastChordMood()).toBeNull();
    expect(fresh.lastStarterId()).toBeNull();
    expect(fresh.orderedStarters()).toEqual(fresh.genreStarters);
    expect(fresh.orderedChordMoods()).toEqual(fresh.chordMoods);
    expect(fresh.recentItems()).toEqual([]);
  });

  // ── Combined Recently Used row ─────────────────────────────────────

  it("stays hidden until something has been used, then caps at four entries", async () => {
    expect(component.recentItems()).toEqual([]);
    expect(fixture.nativeElement.querySelector(".sc-recent-row")).toBeFalsy();

    jest.useFakeTimers();
    try {
      for (const starter of component.genreStarters.slice(0, 3)) {
        await component.loadStarter(starter);
        jest.advanceTimersByTime(12);
      }
      component.applyVocalPreset(component.vocalPresets[0]);
      component.applyChordMood(component.chordMoods[0]);
    } finally {
      jest.useRealTimers();
    }

    expect(Object.keys(component.recentUsage())).toHaveLength(5);
    expect(component.recentItems()).toHaveLength(4);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelectorAll(".sc-recent-chip"),
    ).toHaveLength(4);
  });

  it("orders the Recent row newest-first across all three catalogues", async () => {
    jest.useFakeTimers();
    try {
      await component.loadStarter(component.genreStarters[1]);
      jest.advanceTimersByTime(50);
      component.applyVocalPreset(component.vocalPresets[0]);
      jest.advanceTimersByTime(50);
      component.applyChordMood(component.chordMoods[0]);
    } finally {
      jest.useRealTimers();
    }

    const items = component.recentItems();

    expect(items.map((item) => item.kind)).toEqual(["Chords", "Vocal", "Pack"]);
    expect(items.map((item) => item.key)).toEqual([
      `chord:${component.chordMoods[0].id}`,
      `vocal:${component.vocalPresets[0].id}`,
      `starter:${component.genreStarters[1].id}`,
    ]);

    fixture.detectChanges();
    const chips = Array.from(
      fixture.nativeElement.querySelectorAll(".sc-recent-chip"),
    ) as HTMLElement[];
    expect(chips).toHaveLength(3);
    expect(chips[0].textContent).toContain(component.chordMoods[0].label);
    expect(chips[0].textContent).toContain("Chords");
    expect(chips[2].textContent).toContain("Pack");
  });

  it("reuses Recent chips through their own action paths", async () => {
    const starter = component.genreStarters[4];
    const preset = component.vocalPresets[3];

    await component.loadStarter(starter);
    component.applyVocalPreset(preset);
    fixture.detectChanges();

    const chipFor = (kind: string) =>
      (
        Array.from(
          fixture.nativeElement.querySelectorAll(".sc-recent-chip"),
        ) as HTMLElement[]
      ).find((chip) => chip.textContent?.includes(kind))!;

    tap(chipFor("Pack"));
    // The starter path now passes the preservation gate before it applies.
    await Promise.resolve();
    expect(mockAudioEngine.tempo()).toBe(starter.bpm);
    expect(mockMusicManager.applyGeneratedRecipe).toHaveBeenCalled();

    tap(chipFor("Vocal"));
    expect(mockSnackbar.success).toHaveBeenCalledWith(
      expect.stringContaining(preset.name),
    );
  });

  it("injects a chord progression from its Recent chip", () => {
    tracksSignal.set([{ id: "track_keys", name: "Keys / Chords" }]);
    const navigateSpy = jest.spyOn(component.navigateToView, "emit");
    const mood = component.chordMoods[2];

    component.applyChordMood(mood);
    fixture.detectChanges();

    const chip = (
      Array.from(
        fixture.nativeElement.querySelectorAll(".sc-recent-chip"),
      ) as HTMLElement[]
    ).find((entry) => entry.textContent?.includes("Chords"))!;
    expect(chip.textContent).toContain(mood.label);

    tap(chip);

    expect(mockMusicManager.replaceTrackNotes).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith("piano-roll");
  });

  it("merges per-item Recent stamps from this device and the account", () => {
    const now = Date.now();
    window.localStorage.setItem(
      SHEET_MEMORY_KEY,
      JSON.stringify({
        lastStarterId: "lofi",
        updatedAt: now,
        recent: { "starter:lofi": now },
      }),
    );
    mockUserProfileService.profile.set({
      settings: {
        studio: {
          smartSheet: {
            lastVocalPresetId: "crisp-radio",
            updatedAt: now - 1000,
            recent: {
              "vocal:crisp-radio": now - 1000,
              "starter:lofi": now - 5000,
            },
          },
        },
      },
    });

    const fresh = TestBed.createComponent(
      SmartCreationSheetComponent,
    ).componentInstance;

    // Both devices' history feeds the row, newest stamp per key winning.
    expect(fresh.recentItems().map((item) => item.key)).toEqual([
      "starter:lofi",
      "vocal:crisp-radio",
    ]);
    expect(fresh.recentUsage()["starter:lofi"]).toBe(now);
    // The last-used ids still follow the newer blob (this device's copy).
    expect(fresh.lastStarter()?.id).toBe("lofi");
    expect(fresh.lastVocalPreset()).toBeNull();
  });

  // ── Account sync ───────────────────────────────────────────────────

  it("adopts the account recall on a device that has none", () => {
    mockUserProfileService.profile.set({
      settings: {
        studio: {
          smartSheet: {
            lastStarterId: "afrobeats",
            lastVocalPresetId: "vintage-tube",
            lastChordMoodId: "gospel",
            lastTab: "vocals",
            updatedAt: 1_700_000_000_000,
          },
        },
      },
    });

    const fresh = TestBed.createComponent(
      SmartCreationSheetComponent,
    ).componentInstance;

    expect(fresh.activeTab()).toBe("vocals");
    expect(fresh.lastStarter()?.id).toBe("afrobeats");
    expect(fresh.lastVocalPreset()?.id).toBe("vintage-tube");
    expect(fresh.lastChordMood()?.id).toBe("gospel");
    // ...and the recalled entries lead their grids.
    expect(fresh.orderedStarters()[0].id).toBe("afrobeats");
    expect(fresh.orderedVocalPresets()[0].id).toBe("vintage-tube");
    expect(fresh.orderedChordMoods()[0].id).toBe("gospel");
  });

  it("prefers whichever recall — this device or the account — is newer", () => {
    const now = Date.now();
    const account = (updatedAt: number) => ({
      lastStarterId: "synthwave",
      lastTab: "chords",
      updatedAt,
    });
    const local = (updatedAt: number) => ({
      lastStarterId: "lofi",
      lastTab: "beats",
      updatedAt,
    });

    // The account was touched on another device after this one.
    mockUserProfileService.profile.set({
      settings: { studio: { smartSheet: account(now + 60_000) } },
    });
    window.localStorage.setItem(SHEET_MEMORY_KEY, JSON.stringify(local(now)));

    const accountWins = TestBed.createComponent(
      SmartCreationSheetComponent,
    ).componentInstance;
    expect(accountWins.lastStarter()?.id).toBe("synthwave");
    expect(accountWins.activeTab()).toBe("chords");

    // This device was used most recently, so its copy wins.
    mockUserProfileService.profile.set({
      settings: { studio: { smartSheet: account(now) } },
    });
    window.localStorage.setItem(
      SHEET_MEMORY_KEY,
      JSON.stringify(local(now + 60_000)),
    );

    const localWins = TestBed.createComponent(
      SmartCreationSheetComponent,
    ).componentInstance;
    expect(localWins.lastStarter()?.id).toBe("lofi");
    expect(localWins.activeTab()).toBe("beats");
  });

  it("coalesces recall writes into one debounced account push", () => {
    const preset = component.vocalPresets[1];

    jest.useFakeTimers();
    try {
      component.setTab("vocals");
      component.applyVocalPreset(preset);
      component.applyVocalPreset(component.vocalPresets[2]);

      // Still inside the debounce window — nothing pushed yet.
      expect(mockUserProfileService.updateProfile).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1000);
    } finally {
      jest.useRealTimers();
    }

    expect(mockUserProfileService.updateProfile).toHaveBeenCalledTimes(1);
    const pushed = mockUserProfileService.updateProfile.mock.calls[0][0];
    expect(pushed.settings.studio.smartSheet).toMatchObject({
      lastVocalPresetId: component.vocalPresets[2].id,
      lastTab: "vocals",
    });
  });

  it("flushes a pending account push when the sheet closes mid-window", () => {
    component.applyVocalPreset(component.vocalPresets[0]);
    expect(mockUserProfileService.updateProfile).not.toHaveBeenCalled();

    fixture.destroy();

    expect(mockUserProfileService.updateProfile).toHaveBeenCalledTimes(1);
  });

  // ── Template packs: new genre starters & chord moods ──────────────

  it("exposes the new genre template packs and chord moods", () => {
    const starterIds = component.genreStarters.map((s) => s.id);
    const chordIds = component.chordMoods.map((m) => m.id);

    expect(starterIds).toEqual(
      expect.arrayContaining([
        "afrobeats",
        "synthwave",
        "boombap",
        "reggaeton",
      ]),
    );
    expect(chordIds).toEqual(
      expect.arrayContaining(["cinematic", "gospel", "cyberpunk"]),
    );

    component.setTab("beats");
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelectorAll(".sc-starter-card").length,
    ).toBe(component.genreStarters.length);

    component.setTab("chords");
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelectorAll(".sc-chord-mood-card").length,
    ).toBe(component.chordMoods.length);
  });

  it("summarizes saved template patterns and versions", () => {
    const template = {
      tracks: [
        { notes: [{ midi: 60 }], patternSlots: [] },
        {
          patternSlots: [
            { versions: [{}, {}] },
            { versions: [{}] },
          ],
        },
      ],
    } as any;
    expect(component.templatePatternCount(template)).toBe(3);
    expect(component.templateVersionCount(template)).toBe(3);
    expect(component.templateContents(template)).toBe(
      "3 patterns · 3 versions",
    );
    expect(
      component.templateContents({
        tracks: [{ notes: [{}], patternSlots: [{ versions: [{}] }] }],
      } as any),
    ).toBe("1 pattern · 1 version");
    expect(
      component.templateContents({ tracks: [{ notes: [] }] } as any),
    ).toBe("");
  });

  it("auditions a saved template pattern without loading the template", async () => {
    const template = {
      id: "tpl-1",
      name: "Night Sketch",
      bpm: 96,
      tracks: [
        {
          name: "Sub Bass",
          instrumentId: "sub-commander",
          type: "midi",
          notes: [{ midi: 33, step: 0, length: 4, velocity: 0.9 }],
        },
        {
          name: "Drums",
          instrumentId: "trap-kit-elite",
          type: "drum",
          notes: [{ midi: 36, step: 0, length: 1, velocity: 0.9 }],
        },
      ],
    } as any;
    const tracksBefore = JSON.stringify(mockMusicManager.tracks());

    await component.auditionTemplate(template);

    expect(mockAudioEngine.resume).toHaveBeenCalled();
    expect(mockCompositionAudition.startScore).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "template-preview-tpl-1",
        bpm: 96,
        totalBars: 1,
        parts: expect.arrayContaining([
          expect.objectContaining({ role: "bass" }),
          expect.objectContaining({ role: "drums" }),
        ]),
      }),
      false,
    );
    expect(JSON.stringify(mockMusicManager.tracks())).toBe(tracksBefore);
    expect(mockMusicManager.applyGeneratedRecipe).not.toHaveBeenCalled();
    expect(mockMusicManager.addTrack).not.toHaveBeenCalled();
    expect(mockSnackbar.info).toHaveBeenCalledWith(
      expect.stringContaining("nothing loaded"),
    );
  });

  it("stops a playing template audition instead of restarting it", async () => {
    const template = {
      id: "tpl-1",
      name: "Night Sketch",
      tracks: [
        {
          name: "Lead",
          instrumentId: "analog-warmth",
          type: "midi",
          notes: [{ midi: 67, step: 0, length: 1, velocity: 0.8 }],
        },
      ],
    } as any;
    mockCompositionAudition.playing.set(true);
    mockCompositionAudition.readyCompositionId.set("template-preview-tpl-1");

    await component.auditionTemplate(template);

    expect(mockCompositionAudition.stop).toHaveBeenCalled();
    expect(mockCompositionAudition.startScore).not.toHaveBeenCalled();
  });

  it("labels rendering and playback states and rejects patternless templates", async () => {
    const template = { id: "tpl-1", name: "Night Sketch", tracks: [] } as any;
    mockCompositionAudition.rendering.set(true);
    component.auditioningPreviewId.set("template-preview-tpl-1");
    expect(component.templateAuditionLabel(template)).toBe("Rendering…");

    mockCompositionAudition.rendering.set(false);
    mockCompositionAudition.playing.set(true);
    mockCompositionAudition.readyCompositionId.set("template-preview-tpl-1");
    expect(component.templateAuditionLabel(template)).toBe("Stop");

    await component.auditionTemplate(template);
    expect(mockCompositionAudition.startScore).not.toHaveBeenCalled();
    expect(mockSnackbar.info).toHaveBeenCalledWith(
      "This template has no MIDI or drum pattern to audition.",
    );
  });

  it("auditions one pattern row and one specific saved version", async () => {
    const template = {
      id: "tpl-2",
      name: "Slot Sketch",
      bpm: 110,
      tracks: [
        {
          name: "Lead",
          instrumentId: "analog-warmth",
          type: "midi",
          activePatternSlotId: "slot-1",
          patternSlots: [
            {
              id: "slot-1",
              name: "Verse",
              notes: [{ midi: 64, step: 0, length: 4, velocity: 0.8 }],
              activeVersionId: "v2",
              versions: [
                {
                  id: "v1",
                  name: "first",
                  notes: [{ midi: 60, step: 0, length: 2, velocity: 0.7 }],
                },
                {
                  id: "v2",
                  name: "lift",
                  notes: [{ midi: 67, step: 0, length: 4, velocity: 0.9 }],
                },
              ],
            },
          ],
        },
      ],
    } as any;
    const [detail] = component.templateDetails(template);
    const tracksBefore = JSON.stringify(mockMusicManager.tracks());

    await component.auditionTemplatePattern(template, detail);

    expect(mockCompositionAudition.startScore).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "template-preview-tpl-2-0-slot-1-active",
        parts: [
          expect.objectContaining({
            notes: [expect.objectContaining({ midi: 64 })],
          }),
        ],
      }),
      true,
    );

    await component.auditionTemplatePattern(
      template,
      detail,
      undefined,
      "v1",
    );

    expect(mockCompositionAudition.startScore).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "template-preview-tpl-2-0-slot-1-v1",
        parts: [
          expect.objectContaining({
            notes: [expect.objectContaining({ midi: 60 })],
          }),
        ],
      }),
      true,
    );
    expect(JSON.stringify(mockMusicManager.tracks())).toBe(tracksBefore);
    expect(mockMusicManager.applyGeneratedRecipe).not.toHaveBeenCalled();
  });

  it("switches directly from the live slot to a saved version", async () => {
    const template = {
      id: "tpl-1",
      name: "Night Sketch",
      tracks: [
        {
          name: "Lead",
          instrumentId: "analog-warmth",
          type: "midi",
          notes: [{ midi: 67, step: 0, length: 1, velocity: 0.8 }],
          patternSlots: [
            {
              id: "slot-1",
              name: "Verse",
              notes: [{ midi: 67, step: 0, length: 4, velocity: 0.8 }],
              versions: [
                {
                  id: "v1",
                  name: "first",
                  notes: [{ midi: 60, step: 0, length: 2, velocity: 0.7 }],
                },
              ],
            },
          ],
        },
      ],
    } as any;
    const [detail] = component.templateDetails(template);
    mockCompositionAudition.playing.set(true);
    mockCompositionAudition.readyCompositionId.set(
      "template-preview-tpl-1-0-slot-1-active",
    );

    await component.auditionTemplatePattern(
      template,
      detail,
      undefined,
      "v1",
    );

    expect(mockCompositionAudition.startScore).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "template-preview-tpl-1-0-slot-1-v1",
      }),
      true,
    );
  });

  it("mixes selected rows into one looping arrangement preview", async () => {
    const template = {
      id: "tpl-5",
      name: "Section Sketch",
      bpm: 100,
      tracks: [
        {
          name: "Sub Bass",
          instrumentId: "sub-commander",
          type: "midi",
          notes: [{ midi: 33, step: 0, length: 4, velocity: 0.9 }],
        },
        {
          name: "Drums",
          instrumentId: "trap-kit-elite",
          type: "drum",
          notes: [{ midi: 36, step: 0, length: 1, velocity: 0.9 }],
        },
      ],
    } as any;
    component.toggleTemplateDetails(template);
    const details = component.templateDetails(template);
    const tracksBefore = JSON.stringify(mockMusicManager.tracks());

    expect(component.selectedPatternCount(template)).toBe(2);
    component.togglePatternSelection(template, details[1]);
    expect(component.selectedPatternCount(template)).toBe(1);
    expect(component.patternSelected(template, details[0])).toBe(true);
    expect(component.patternSelected(template, details[1])).toBe(false);

    await component.auditionTemplateMix(template);

    expect(mockCompositionAudition.startScore).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "template-preview-tpl-5-mix-0:live",
        bpm: 100,
        totalBars: 1,
        parts: [expect.objectContaining({ role: "bass" })],
      }),
      true,
    );
    expect(mockSnackbar.info).toHaveBeenCalledWith(
      expect.stringContaining("1 row mixed"),
    );

    component.togglePatternSelection(template, details[1]);
    await component.auditionTemplateMix(template);

    expect(mockCompositionAudition.startScore).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "template-preview-tpl-5-mix-0:live~1:live",
        parts: [
          expect.objectContaining({ role: "bass" }),
          expect.objectContaining({ role: "drums" }),
        ],
      }),
      true,
    );
    expect(JSON.stringify(mockMusicManager.tracks())).toBe(tracksBefore);
    expect(mockMusicManager.applyGeneratedRecipe).not.toHaveBeenCalled();
  });

  it("lets each mixed row use a chosen saved version", async () => {
    const template = {
      id: "tpl-6",
      name: "Versioned Section",
      bpm: 112,
      tracks: [
        {
          name: "Lead",
          instrumentId: "analog-warmth",
          type: "midi",
          activePatternSlotId: "slot-1",
          patternSlots: [
            {
              id: "slot-1",
              name: "Verse",
              notes: [{ midi: 64, step: 0, length: 4, velocity: 0.8 }],
              activeVersionId: "v2",
              versions: [
                {
                  id: "v1",
                  name: "first",
                  notes: [{ midi: 60, step: 0, length: 2, velocity: 0.7 }],
                },
                {
                  id: "v2",
                  name: "lift",
                  notes: [{ midi: 67, step: 4, length: 4, velocity: 0.9 }],
                },
              ],
            },
          ],
        },
        {
          name: "Keys",
          instrumentId: "grand-piano",
          type: "midi",
          notes: [{ midi: 48, step: 4, length: 2, velocity: 0.6 }],
        },
      ],
    } as any;
    component.toggleTemplateDetails(template);
    const [lead] = component.templateDetails(template);
    const before = JSON.stringify(template);

    expect(component.patternMixVersionId(template, lead)).toBe("");
    component.setPatternMixVersion(template, lead, "v1");
    expect(component.patternMixVersionId(template, lead)).toBe("v1");

    await component.auditionTemplateMix(template);

    expect(mockCompositionAudition.startScore).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "template-preview-tpl-6-mix-0:slot-1@v1~1:live",
        parts: [
          expect.objectContaining({
            notes: [expect.objectContaining({ midi: 60 })],
          }),
          expect.objectContaining({
            notes: [expect.objectContaining({ midi: 48 })],
          }),
        ],
      }),
      true,
    );

    component.setPatternMixVersion(template, lead, null);
    expect(component.patternMixVersionId(template, lead)).toBe("");

    await component.auditionTemplateMix(template);

    expect(mockCompositionAudition.startScore).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "template-preview-tpl-6-mix-0:slot-1~1:live",
        parts: expect.arrayContaining([
          expect.objectContaining({
            notes: [expect.objectContaining({ midi: 64 })],
          }),
        ]),
      }),
      true,
    );
    expect(JSON.stringify(template)).toBe(before);
  });

  it("saves the current row and version choices as a named section", () => {
    const template = sectionTemplateFixture();
    component.toggleTemplateDetails(template);
    const [lead] = component.templateDetails(template);
    component.setPatternMixVersion(template, lead, "v1");
    component.sectionName.set("  Lift  ");

    const section = {
      id: "sec-1",
      name: "Lift",
      rows: [
        { trackIndex: 0, slotId: "slot-1", versionId: "v1" },
        { trackIndex: 1, slotId: null, versionId: null },
      ],
    };
    mockProjectTemplates.saveTemplateSection.mockReturnValue(section);

    component.saveCurrentSection(template);

    expect(mockProjectTemplates.saveTemplateSection).toHaveBeenCalledWith(
      "tpl-7",
      "  Lift  ",
      [
        { trackIndex: 0, slotId: "slot-1", versionId: "v1" },
        { trackIndex: 1, slotId: null, versionId: null },
      ],
    );
    expect(component.sectionName()).toBe("");
    expect(mockSnackbar.success).toHaveBeenCalledWith(
      expect.stringContaining("Lift"),
    );
    expect(mockCompositionAudition.startScore).not.toHaveBeenCalled();
  });

  it("auditions and deletes a saved section without loading the template", async () => {
    const template = sectionTemplateFixture();
    component.toggleTemplateDetails(template);
    const section = {
      id: "sec-1",
      name: "Lift",
      rows: [
        { trackIndex: 0, slotId: "slot-1", versionId: "v1" },
        { trackIndex: 9, slotId: "gone", versionId: "missing" },
      ],
    };

    await component.applySavedSection(template, section);

    const details = component.templateDetails(template);
    expect(component.selectedPatternCount(template)).toBe(1);
    expect(component.patternMixVersionId(template, details[0])).toBe("v1");
    expect(component.patternSelected(template, details[1])).toBe(false);
    expect(mockCompositionAudition.startScore).toHaveBeenCalledWith(
      expect.objectContaining({
        id: templateSectionPreviewId(template, section),
        totalBars: 1,
        parts: [
          expect.objectContaining({
            notes: [expect.objectContaining({ midi: 60 })],
          }),
        ],
      }),
      true,
      expect.any(Function),
    );
    expect(mockSnackbar.info).toHaveBeenCalledWith(
      expect.stringContaining("section “Lift”"),
    );
    expect(mockProjectTemplates.applyTemplate).not.toHaveBeenCalled();

    mockProjectTemplates.deleteTemplateSection.mockReturnValue(true);
    component.removeSavedSection(template, section);

    expect(mockProjectTemplates.deleteTemplateSection).toHaveBeenCalledWith(
      "tpl-7",
      "sec-1",
    );
    expect(mockSnackbar.info).toHaveBeenCalledWith(
      expect.stringContaining("Lift"),
    );
  });

  it("shows saved section rows and versions without auditioning", () => {
    const template = sectionTemplateFixture();
    const section = {
      id: "sec-1",
      name: "Lift",
      rows: [
        { trackIndex: 0, slotId: "slot-1", versionId: "v1" },
        { trackIndex: 1, slotId: null, versionId: null },
        { trackIndex: 9, slotId: "gone", versionId: "missing" },
      ],
    };

    const rows = component.sectionDetailRows(template, section);
    expect(rows[0]).toEqual({
      track: "Lead",
      slot: "Verse",
      version: "first",
      available: true,
    });
    expect(rows[1]).toEqual({
      track: "Keys",
      slot: "Pattern 1",
      version: "Live pattern",
      available: true,
    });
    expect(rows[2]).toEqual({
      track: "Track 10",
      slot: "Pattern missing",
      version: "No longer in template",
      available: false,
    });

    const missingVersion = component.sectionDetailRows(template, {
      id: "sec-2",
      name: "Stale version",
      rows: [{ trackIndex: 0, slotId: "slot-1", versionId: "gone" }],
    });
    expect(missingVersion[0].version).toBe(
      "Live pattern (saved version missing)",
    );

    component.toggleSectionDetails(section);
    expect(component.expandedSectionId()).toBe("sec-1");
    component.toggleSectionDetails(section);
    expect(component.expandedSectionId()).toBeNull();
    expect(mockCompositionAudition.startScore).not.toHaveBeenCalled();
  });

  it("reorders saved sections without auditioning or renaming them", () => {
    const intro = {
      id: "sec-intro",
      name: "Intro",
      rows: [{ trackIndex: 0, slotId: "slot-1", versionId: "v1" }],
    };
    const hook = {
      id: "sec-hook",
      name: "Hook",
      rows: [{ trackIndex: 1, slotId: null }],
    };
    const template = {
      ...sectionTemplateFixture(),
      sections: [intro, hook],
    };

    component.toggleTemplateDetails(template);
    component.toggleSectionDetails(intro);
    component.beginSectionRename(intro);
    expect(component.expandedSectionId()).toBe("sec-intro");
    expect(component.renamingSectionId()).toBe("sec-intro");
    expect(component.sectionOrderLabel(template)).toBe(
      "Order: Intro → Hook",
    );

    mockCompositionAudition.playing.set(true);
    mockCompositionAudition.readyCompositionId.set(
      "template-preview-tpl-7-mix-0:slot-1@v1",
    );
    component.toggleSectionReorder(template);
    expect(component.reorderingSections()).toBe(true);
    expect(mockCompositionAudition.stop).toHaveBeenCalled();
    expect(component.expandedSectionId()).toBeNull();
    expect(component.renamingSectionId()).toBeNull();
    expect(component.sectionRenameName()).toBe("");

    mockProjectTemplates.moveTemplateSection.mockReturnValue(true);
    component.moveSavedSection(template, intro, 1);

    expect(mockProjectTemplates.moveTemplateSection).toHaveBeenCalledWith(
      "tpl-7",
      "sec-intro",
      1,
    );
    expect(mockHaptic.light).toHaveBeenCalled();
    expect(mockProjectTemplates.applyTemplate).not.toHaveBeenCalled();
    expect(mockCompositionAudition.startScore).not.toHaveBeenCalled();

    component.toggleSectionReorder(template);
    expect(component.reorderingSections()).toBe(false);
    component.toggleSectionReorder(template);
    expect(component.reorderingSections()).toBe(true);
    component.toggleTemplateDetails(template);
    expect(component.reorderingSections()).toBe(false);
  });

  it("renames a saved section in place without auditioning it", () => {
    const template = sectionTemplateFixture();
    const section = {
      id: "sec-1",
      name: "Lift",
      rows: [{ trackIndex: 0, slotId: "slot-1", versionId: "v1" }],
    };
    mockProjectTemplates.renameTemplateSection.mockReturnValue({
      ...section,
      name: "Hook",
    });

    component.beginSectionRename(section);
    expect(component.renamingSectionId()).toBe("sec-1");
    expect(component.sectionRenameName()).toBe("Lift");

    component.sectionRenameName.set("  Hook  ");
    component.commitSectionRename(template, section);

    expect(mockProjectTemplates.renameTemplateSection).toHaveBeenCalledWith(
      "tpl-7",
      "sec-1",
      "  Hook  ",
    );
    expect(component.renamingSectionId()).toBeNull();
    expect(component.sectionRenameName()).toBe("");
    expect(mockSnackbar.success).toHaveBeenCalledWith(
      'Renamed section to “Hook”.',
    );
    expect(mockProjectTemplates.applyTemplate).not.toHaveBeenCalled();
    expect(mockCompositionAudition.startScore).not.toHaveBeenCalled();

    mockProjectTemplates.renameTemplateSection.mockClear();
    component.beginSectionRename(section);
    component.sectionRenameName.set("   ");
    component.commitSectionRename(template, section);
    expect(mockProjectTemplates.renameTemplateSection).not.toHaveBeenCalled();
    expect(mockSnackbar.error).toHaveBeenCalledWith("Give the section a name.");
    expect(component.renamingSectionId()).toBe("sec-1");

    component.cancelSectionRename();
    expect(component.renamingSectionId()).toBeNull();
    expect(component.sectionRenameName()).toBe("");
    expect(mockCompositionAudition.startScore).not.toHaveBeenCalled();
  });

  it("sets a saved section's arrangement length without loading the template", () => {
    const template = sectionTemplateFixture();
    const section = {
      id: "sec-1",
      name: "Lift",
      rows: [{ trackIndex: 0, slotId: "slot-1", versionId: "v1" }],
    };
    const withSections = { ...template, sections: [section] };
    component.toggleTemplateDetails(withSections);

    expect(component.sectionBars(withSections, section)).toBe(1);
    expect(component.sectionLengthIsAuto(section)).toBe(true);
    expect(component.sectionLengthLabel(withSections, section)).toBe(
      "1 bar · auto",
    );

    mockProjectTemplates.setTemplateSectionBars.mockReturnValue({
      ...section,
      bars: 2,
    });
    component.adjustSectionBars(withSections, section, 1);

    expect(mockProjectTemplates.setTemplateSectionBars).toHaveBeenCalledWith(
      "tpl-7",
      "sec-1",
      2,
    );
    expect(mockHaptic.light).toHaveBeenCalled();
    expect(mockProjectTemplates.applyTemplate).not.toHaveBeenCalled();
    expect(mockCompositionAudition.startScore).not.toHaveBeenCalled();
    expect(component.sectionLengthIsAuto({ ...section, bars: 2 })).toBe(false);
    expect(
      component.sectionLengthLabel(withSections, { ...section, bars: 2 }),
    ).toBe("2 bars");
  });

  it("stops the arrangement before changing its length and clamps the ends", () => {
    const template = sectionTemplateFixture();
    const section = {
      id: "sec-1",
      name: "Lift",
      rows: [{ trackIndex: 0, slotId: "slot-1", versionId: "v1" }],
    };
    const withSections = { ...template, sections: [section] };
    component.toggleTemplateDetails(withSections);
    mockCompositionAudition.playing.set(true);
    mockCompositionAudition.readyCompositionId.set(
      templateSectionsPreviewId("tpl-7", [section]),
    );
    mockProjectTemplates.setTemplateSectionBars.mockReturnValue({
      ...section,
      bars: 2,
    });

    component.adjustSectionBars(withSections, section, 1);
    expect(mockCompositionAudition.stop).toHaveBeenCalled();

    mockCompositionAudition.stop.mockClear();
    mockCompositionAudition.playing.set(true);
    mockCompositionAudition.readyCompositionId.set(
      templateSectionPreviewId(withSections, section),
    );
    component.adjustSectionBars(withSections, section, 1);
    expect(mockCompositionAudition.stop).toHaveBeenCalledTimes(1);

    mockProjectTemplates.setTemplateSectionBars.mockClear();
    component.adjustSectionBars(withSections, { ...section, bars: 1 }, -1);
    component.adjustSectionBars(withSections, { ...section, bars: 32 }, 1);
    expect(mockProjectTemplates.setTemplateSectionBars).not.toHaveBeenCalled();

    mockProjectTemplates.setTemplateSectionBars.mockReturnValue(null);
    component.adjustSectionBars(withSections, section, 1);
    expect(mockSnackbar.error).toHaveBeenCalledWith(
      "Could not change this section's length.",
    );
  });

  it("loops a saved section only for its set number of bars", async () => {
    const template = sectionTemplateFixture();
    component.toggleTemplateDetails(template);
    const section = {
      id: "sec-1",
      name: "Lift",
      bars: 2,
      rows: [{ trackIndex: 0, slotId: "slot-1", versionId: "v1" }],
    };

    await component.applySavedSection(template, section);

    expect(mockCompositionAudition.startScore).toHaveBeenCalledTimes(1);
    const [score, loop] = mockCompositionAudition.startScore.mock.calls[0];
    expect(loop).toBe(true);
    expect(score.id).toBe(templateSectionPreviewId(template, section));
    expect(score.totalBars).toBe(2);
    expect(score.parts[0].notes[0]).toMatchObject({ midi: 60, bar: 0 });
    expect(mockSnackbar.info).toHaveBeenCalledWith(
      expect.stringContaining("section “Lift”"),
    );
    expect(mockProjectTemplates.applyTemplate).not.toHaveBeenCalled();
  });

  it("switches section auditions between looping and one pass", async () => {
    const template = sectionTemplateFixture();
    component.toggleTemplateDetails(template);
    const section = {
      id: "sec-1",
      name: "Lift",
      bars: 2,
      rows: [{ trackIndex: 0, slotId: "slot-1", versionId: "v1" }],
    };
    const previewId = templateSectionPreviewId(template, section);

    expect(component.sectionAuditionLoop()).toBe(true);
    mockCompositionAudition.playing.set(true);
    mockCompositionAudition.readyCompositionId.set(previewId);

    component.toggleSectionAuditionLoop(template);

    expect(component.sectionAuditionLoop()).toBe(false);
    expect(mockCompositionAudition.stop).toHaveBeenCalled();
    expect(mockHaptic.light).toHaveBeenCalled();
    expect(readMemory().sectionAuditionLoop).toBe(false);

    mockCompositionAudition.playing.set(false);
    mockCompositionAudition.readyCompositionId.set(null);
    await component.applySavedSection(template, section);

    expect(mockCompositionAudition.startScore).toHaveBeenCalledTimes(1);
    expect(mockCompositionAudition.startScore.mock.calls[0][1]).toBe(false);
    expect(mockSnackbar.info).toHaveBeenCalledWith(
      expect.stringContaining("one pass"),
    );
  });

  it("remembers the one-pass choice on the next launch", () => {
    window.localStorage.setItem(
      SHEET_MEMORY_KEY,
      JSON.stringify({ sectionAuditionLoop: false, updatedAt: Date.now() }),
    );

    const fresh = TestBed.createComponent(
      SmartCreationSheetComponent,
    ).componentInstance;

    expect(fresh.sectionAuditionLoop()).toBe(false);
  });

  it("shows progress for the active section in both audition modes", () => {
    const template = sectionTemplateFixture();
    const section = {
      id: "sec-1",
      name: "Lift",
      bars: 4,
      rows: [{ trackIndex: 0, slotId: "slot-1", versionId: "v1" }],
    };
    const other = {
      ...section,
      id: "sec-2",
      name: "Hook",
      rows: [{ trackIndex: 0, slotId: "slot-1", versionId: "v2" }],
    };
    mockCompositionAudition.playing.set(true);
    mockCompositionAudition.readyCompositionId.set(
      templateSectionPreviewId(template, section),
    );
    mockCompositionAudition.progress.set(0.5);
    mockCompositionAudition.previewBars.set(4);
    mockCompositionAudition.previewSeconds.set(8);

    expect(component.sectionPreviewActive(template, section)).toBe(true);
    expect(component.sectionPreviewActive(template, other)).toBe(false);
    expect(component.sectionPreviewProgressPercent(template, section)).toBe(50);
    expect(component.sectionPreviewProgressLabel(template, section)).toBe(
      "bar 3/4 · 0:04 / 0:08 · loop",
    );

    component.sectionAuditionLoop.set(false);
    expect(component.sectionPreviewProgressLabel(template, section)).toBe(
      "bar 3/4 · 0:04 / 0:08 · one pass",
    );
    expect(component.sectionPreviewProgressPercent(template, other)).toBe(0);
    expect(component.sectionPreviewProgressLabel(template, other)).toBe("");
  });

  it("holds a finished one-pass section at 100% for a moment", async () => {
    const template = sectionTemplateFixture();
    component.toggleTemplateDetails(template);
    component.sectionAuditionLoop.set(false);
    const section = {
      id: "sec-1",
      name: "Lift",
      bars: 2,
      rows: [{ trackIndex: 0, slotId: "slot-1", versionId: "v1" }],
    };

    await component.applySavedSection(template, section);
    const onEnd = mockCompositionAudition.startScore.mock.calls[0][2];
    expect(typeof onEnd).toBe("function");
    mockCompositionAudition.previewBars.set(2);
    mockCompositionAudition.previewSeconds.set(4);

    jest.useFakeTimers();
    try {
      onEnd(true);

      expect(component.sectionPreviewActive(template, section)).toBe(true);
      expect(component.sectionPreviewProgressPercent(template, section)).toBe(
        100,
      );
      expect(component.sectionPreviewProgressLabel(template, section)).toBe(
        "bar 2/2 · 0:04 / 0:04 · one pass",
      );

      jest.advanceTimersByTime(1900);
      expect(component.sectionPreviewActive(template, section)).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not hold the strip when a one-pass section is stopped early", async () => {
    const template = sectionTemplateFixture();
    component.toggleTemplateDetails(template);
    component.sectionAuditionLoop.set(false);
    const section = {
      id: "sec-1",
      name: "Lift",
      bars: 2,
      rows: [{ trackIndex: 0, slotId: "slot-1", versionId: "v1" }],
    };

    await component.applySavedSection(template, section);
    const onEnd = mockCompositionAudition.startScore.mock.calls[0][2];
    mockCompositionAudition.previewBars.set(2);
    mockCompositionAudition.previewSeconds.set(4);
    onEnd(false);

    expect(component.sectionPreviewActive(template, section)).toBe(false);
    expect(component.sectionPreviewProgressPercent(template, section)).toBe(0);
    expect(component.sectionPreviewProgressLabel(template, section)).toBe("");
  });

  it("plays saved sections once in their listed order", async () => {
    const intro = {
      id: "sec-intro",
      name: "Intro",
      rows: [{ trackIndex: 0, slotId: "slot-1", versionId: "v1" }],
    };
    const hook = {
      id: "sec-hook",
      name: "Hook",
      rows: [{ trackIndex: 1, slotId: null }],
    };
    const template = {
      ...sectionTemplateFixture(),
      sections: [intro, hook],
    };
    component.toggleTemplateDetails(template);

    await component.auditionSavedSections(template);

    expect(mockCompositionAudition.startScore).toHaveBeenCalledTimes(1);
    const [score, loop] = mockCompositionAudition.startScore.mock.calls[0];
    expect(loop).toBe(false);
    expect(score.totalBars).toBe(2);
    expect(score.parts).toHaveLength(2);
    expect(score.parts[0].notes[0]).toMatchObject({ midi: 60, bar: 0 });
    expect(score.parts[1].notes[0].bar).toBe(1);
    expect(score.id).toContain("template-preview-tpl-7-mix-arrangement-");
    expect(mockSnackbar.info).toHaveBeenCalledWith(
      "Auditioning 2 saved sections in order — preview only, nothing loaded.",
    );
    expect(mockProjectTemplates.applyTemplate).not.toHaveBeenCalled();
    expect(mockProjectTemplates.saveTemplateSection).not.toHaveBeenCalled();

    mockCompositionAudition.playing.set(true);
    mockCompositionAudition.readyCompositionId.set(score.id);
    mockCompositionAudition.previewBars.set(2);
    mockCompositionAudition.previewSeconds.set(4);
    mockCompositionAudition.progress.set(0.5);
    expect(component.sectionsPreviewPlaying(template)).toBe(true);
    expect(component.sectionsPreviewLabel(template)).toBe("Stop");
    expect(component.sectionsPreviewProgressLabel(template)).toBe(
      "2 sections · bar 2/2 · 0:02 / 0:04 · one pass",
    );

    await component.auditionSavedSections(template);

    expect(mockCompositionAudition.stop).toHaveBeenCalled();
    expect(mockCompositionAudition.startScore).toHaveBeenCalledTimes(1);
    expect(mockSnackbar.info).toHaveBeenCalledWith(
      "Stopped the saved-section arrangement.",
    );
    expect(mockProjectTemplates.applyTemplate).not.toHaveBeenCalled();

    mockCompositionAudition.playing.set(false);
    mockCompositionAudition.rendering.set(true);
    component.auditioningPreviewId.set(score.id);
    expect(component.sectionsPreviewRendering(template)).toBe(true);
    expect(component.sectionsPreviewLabel(template)).toBe("Rendering…");

    await component.auditionSavedSections(template);

    expect(mockCompositionAudition.clear).toHaveBeenCalled();
    expect(mockCompositionAudition.startScore).toHaveBeenCalledTimes(1);
    expect(mockProjectTemplates.applyTemplate).not.toHaveBeenCalled();
  });

  it("marks a playing section and stops it on a second click", async () => {
    const template = sectionTemplateFixture();
    component.toggleTemplateDetails(template);
    const section = {
      id: "sec-1",
      name: "Lift",
      rows: [{ trackIndex: 0, slotId: "slot-1", versionId: "v1" }],
    };
    const previewId = templateSectionPreviewId(template, section);

    expect(component.sectionAuditionRendering(template, section)).toBe(false);
    mockCompositionAudition.playing.set(true);
    mockCompositionAudition.readyCompositionId.set(previewId);
    expect(component.sectionAuditionPlaying(template, section)).toBe(true);
    expect(component.sectionAuditionRendering(template, section)).toBe(false);

    await component.applySavedSection(template, section);

    expect(mockCompositionAudition.stop).toHaveBeenCalled();
    expect(mockCompositionAudition.startScore).not.toHaveBeenCalled();
    expect(mockSnackbar.info).toHaveBeenCalledWith('Stopped section “Lift”.');

    mockCompositionAudition.playing.set(false);
    mockCompositionAudition.rendering.set(true);
    component.auditioningPreviewId.set(previewId);
    expect(component.sectionAuditionRendering(template, section)).toBe(true);
    expect(component.sectionAuditionPlaying(template, section)).toBe(false);
    await component.applySavedSection(template, section);
    expect(mockCompositionAudition.clear).toHaveBeenCalled();
    expect(mockCompositionAudition.startScore).not.toHaveBeenCalled();
  });

  it("stops a playing mix when its row selection changes", () => {
    const template = {
      id: "tpl-5",
      name: "Section Sketch",
      tracks: [
        {
          name: "Lead",
          instrumentId: "analog-warmth",
          type: "midi",
          notes: [{ midi: 64, step: 0, length: 4, velocity: 0.8 }],
        },
        {
          name: "Keys",
          instrumentId: "grand-piano",
          type: "midi",
          notes: [{ midi: 60, step: 4, length: 2, velocity: 0.7 }],
        },
      ],
    } as any;
    component.toggleTemplateDetails(template);
    const details = component.templateDetails(template);
    mockCompositionAudition.playing.set(true);
    mockCompositionAudition.readyCompositionId.set(
      "template-preview-tpl-5-mix-0:live~1:live",
    );

    component.togglePatternSelection(template, details[1]);

    expect(mockCompositionAudition.stop).toHaveBeenCalled();
  });

  it("shows progress for the combined mix", () => {
    const template = {
      id: "tpl-5",
      name: "Section Sketch",
      tracks: [
        {
          name: "Lead",
          instrumentId: "analog-warmth",
          type: "midi",
          notes: [{ midi: 64, step: 0, length: 4, velocity: 0.8 }],
        },
        {
          name: "Keys",
          instrumentId: "grand-piano",
          type: "midi",
          notes: [{ midi: 60, step: 4, length: 2, velocity: 0.7 }],
        },
      ],
    } as any;
    component.toggleTemplateDetails(template);
    mockCompositionAudition.playing.set(true);
    mockCompositionAudition.readyCompositionId.set(
      "template-preview-tpl-5-mix-0:live~1:live",
    );
    mockCompositionAudition.progress.set(0.5);
    mockCompositionAudition.previewSeconds.set(8);
    mockCompositionAudition.previewBars.set(2);

    expect(component.mixPreviewActive(template)).toBe(true);
    expect(component.mixPreviewProgressPercent(template)).toBe(50);
    expect(component.mixPreviewProgressLabel(template)).toContain("2 rows");
    expect(component.mixPreviewProgressLabel(template)).toContain("bar 2/2");
    expect(component.mixAuditionLabel(template)).toBe("Stop mix");
  });

  it("requires at least one selected row before mixing", async () => {
    const template = {
      id: "tpl-5",
      name: "Section Sketch",
      tracks: [
        {
          name: "Lead",
          instrumentId: "analog-warmth",
          type: "midi",
          notes: [{ midi: 64, step: 0, length: 4, velocity: 0.8 }],
        },
      ],
    } as any;
    component.toggleTemplateDetails(template);
    const [detail] = component.templateDetails(template);
    component.togglePatternSelection(template, detail);

    await component.auditionTemplateMix(template);

    expect(mockCompositionAudition.startScore).not.toHaveBeenCalled();
    expect(mockSnackbar.info).toHaveBeenCalledWith(
      "Select at least one pattern row to mix.",
    );
  });

  it("shows looping progress for the audible row and names its version", () => {
    const template = {
      id: "tpl-3",
      name: "Progress Sketch",
      tracks: [
        {
          name: "Lead",
          instrumentId: "analog-warmth",
          type: "midi",
          patternSlots: [
            {
              id: "slot-1",
              name: "Hook",
              notes: [{ midi: 67, step: 0, length: 4, velocity: 0.8 }],
              versions: [
                {
                  id: "v1",
                  name: "first",
                  notes: [{ midi: 60, step: 0, length: 2, velocity: 0.7 }],
                },
              ],
            },
          ],
        },
      ],
    } as any;
    const [detail] = component.templateDetails(template);

    expect(component.patternPreviewActive(template, detail)).toBe(false);
    expect(component.patternPreviewProgressPercent(template, detail)).toBe(0);
    expect(component.patternPreviewProgressLabel(template, detail)).toBe("");

    mockCompositionAudition.playing.set(true);
    mockCompositionAudition.readyCompositionId.set(
      "template-preview-tpl-3-0-slot-1-v1",
    );
    mockCompositionAudition.progress.set(0.5);
    mockCompositionAudition.previewSeconds.set(8);
    mockCompositionAudition.previewBars.set(2);

    expect(component.patternPreviewActive(template, detail)).toBe(true);
    expect(component.patternPreviewProgressPercent(template, detail)).toBe(50);
    expect(component.patternPreviewProgressLabel(template, detail)).toContain(
      "first",
    );
    expect(component.patternPreviewProgressLabel(template, detail)).toContain(
      "bar 2/2",
    );
    expect(component.patternPreviewProgressLabel(template, detail)).toContain(
      "0:04 / 0:08",
    );
    expect(component.patternPreviewProgressLabel(template, detail)).toContain(
      "loop",
    );
  });

  it("lists pattern names, launch boundaries and saved versions", () => {
    const template = {
      id: "tpl-1",
      name: "Detail Sketch",
      tracks: [
        {
          name: "Lead",
          patternSlots: [
            {
              id: "slot-1",
              name: "Verse",
              launchQuantize: "1bar",
              activeVersionId: "v2",
              versions: [
                { id: "v1", name: "first" },
                { id: "v2", name: "lift" },
              ],
            },
          ],
        },
        {
          name: "Legacy Keys",
          notes: [{ midi: 60 }],
          patternSlots: [],
        },
      ],
    } as any;

    const details = component.templateDetails(template);
    expect(details[0]).toEqual({
      track: "Lead",
      slot: "Verse",
      launch: "wait 1bar",
      trackIndex: 0,
      slotId: "slot-1",
      versions: [
        { id: "v1", name: "first", active: false },
        { id: "v2", name: "lift", active: true },
      ],
    });
    expect(details[1]).toEqual({
      track: "Legacy Keys",
      slot: "Pattern 1",
      launch: "grid default",
      trackIndex: 1,
      slotId: null,
      versions: [],
    });

    component.toggleTemplateDetails(template);
    expect(component.expandedTemplateId()).toBe("tpl-1");
    expect(component.selectedPatternCount(template)).toBe(2);
    component.toggleTemplateDetails(template);
    expect(component.expandedTemplateId()).toBeNull();
    expect(component.selectedPatternCount(template)).toBe(0);
  });
});
