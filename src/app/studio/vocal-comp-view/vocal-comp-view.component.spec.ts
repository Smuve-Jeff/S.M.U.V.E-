import { ComponentFixture, TestBed } from "@angular/core/testing";
import { signal, WritableSignal } from "@angular/core";
import { VocalCompViewComponent } from "./vocal-comp-view.component";
import {
  SmartRecordingService,
  CompGroup,
  CompTake,
} from "../smart-recording.service";
import { VocalCompSuggesterService } from "../vocal-comp-suggester.service";
import { AudioEngineService } from "../../services/audio-engine.service";
import { SnackbarService } from "../../services/snackbar.service";
import { LoggingService } from "../../services/logging.service";

describe("VocalCompViewComponent", () => {
  let component: VocalCompViewComponent;
  let fixture: ComponentFixture<VocalCompViewComponent>;
  let smartRecording: jest.Mocked<SmartRecordingService>;
  let snackbar: jest.Mocked<SnackbarService>;
  let suggester: any;
  /** Real signal, like the service exposes, so the view's computeds update. */
  let mockCompGroups: WritableSignal<CompGroup[]>;

  const mockTakes: CompTake[] = [
    {
      id: "take-1",
      takeNumber: 1,
      label: "Take 1",
      blob: new Blob(["test-audio-1"]),
      url: "blob:mock-url-1",
      durationMs: 5000,
      peakDbL: -6,
      peakDbR: -7,
      isCompSelection: false,
      isMuted: false,
      regions: [],
    },
    {
      id: "take-2",
      takeNumber: 2,
      label: "Take 2",
      blob: new Blob(["test-audio-2"]),
      url: "blob:mock-url-2",
      durationMs: 4200,
      peakDbL: -8,
      peakDbR: -9,
      isCompSelection: true,
      isMuted: false,
      regions: [],
    },
  ];

  const mockGroup: CompGroup = {
    id: "group-1",
    sectionLabel: "Verse 1",
    trackName: "Vocal Track",
    trackId: "vocal-track",
    takes: mockTakes,
    createdAt: Date.now() - 60000,
    selectedTakeId: "take-2",
    fxSlots: [],
    activeRegionId: null,
    baseStartBeat: 0,
    compRegions: [],
  };

  beforeEach(async () => {
    mockCompGroups = signal<CompGroup[]>([mockGroup]);

    smartRecording = {
      compGroups: mockCompGroups,
      activeCompGroupId: jest.fn().mockReturnValue("group-1"),
      startNewCompGroup: jest.fn(),
      setActiveCompGroup: jest.fn(() => true),
      deleteCompGroup: jest.fn(),
      selectCompTake: jest.fn(),
      toggleTakeMute: jest.fn(),
      deleteTake: jest.fn(),
      createEmptyGroup: jest.fn(),
    } as any;

    snackbar = {
      info: jest.fn(),
      success: jest.fn(),
      warning: jest.fn(),
      error: jest.fn(),
    } as any;

    const audioEngine = {
      ctx: null,
      isPlaying: jest.fn().mockReturnValue(false),
    } as any;

    const logging = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    suggester = {
      suggestBestTake: jest.fn(() => null),
      suggestActiveGroup: jest.fn(() => null),
      applySuggestion: jest.fn(() => null),
    };

    await TestBed.configureTestingModule({
      imports: [VocalCompViewComponent],
      providers: [
        { provide: SmartRecordingService, useValue: smartRecording },
        { provide: AudioEngineService, useValue: audioEngine },
        { provide: SnackbarService, useValue: snackbar },
        { provide: LoggingService, useValue: logging },
        { provide: VocalCompSuggesterService, useValue: suggester },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VocalCompViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should auto-select first group on init", () => {
    expect(component.selectedGroup()).toBeDefined();
    expect(component.selectedGroup()?.sectionLabel).toBe("Verse 1");
  });

  it("should return takes from the selected group", () => {
    expect(component.takes()).toHaveLength(2);
  });

  it("should find the comp-selected take", () => {
    const comp = component.compTake();
    expect(comp).toBeDefined();
    expect(comp?.id).toBe("take-2");
  });

  it("should report correct take count", () => {
    expect(component.takeCount()).toBe(2);
    expect(component.hasTakes()).toBe(true);
  });

  it("should set selectedGroupId when selecting a group", () => {
    component.selectGroup("group-1");
    expect(component.selectedGroupId()).toBe("group-1");
    expect(component.compareMode()).toBe("off");
  });

  it("should create new comp group", () => {
    component.createNewGroup();
    expect(smartRecording.startNewCompGroup).toHaveBeenCalledWith(
      "vocal-track",
      "Vocal Track",
      "Section 2",
    );
    expect(snackbar.info).toHaveBeenCalledWith("New comp group created");
  });

  it("should delete a group", () => {
    smartRecording.deleteCompGroup.mockImplementation((id: string) => {
      mockCompGroups.update((groups) => groups.filter((g) => g.id !== id));
    });

    component.deleteGroup("group-1");

    expect(smartRecording.deleteCompGroup).toHaveBeenCalledWith("group-1");
    expect(mockCompGroups()).toHaveLength(0);
    expect(snackbar.info).toHaveBeenCalledWith('Group "Verse 1" deleted');
  });

  it("should rename a group", () => {
    component.renameGroup("group-1", "Chorus 1");

    expect(mockCompGroups().find((g) => g.id === "group-1")?.sectionLabel).toBe(
      "Chorus 1",
    );
  });

  it("should select a take as comp", () => {
    component.selectTake("take-1");
    expect(smartRecording.selectCompTake).toHaveBeenCalledWith(
      "group-1",
      "take-1",
    );
    expect(component.compareMode()).toBe("off");
  });

  it("should toggle mute on a take", () => {
    component.toggleMute("group-1", "take-1");
    expect(smartRecording.toggleTakeMute).toHaveBeenCalledWith(
      "group-1",
      "take-1",
    );
  });

  it("should delete a take", () => {
    component.deleteTake("group-1", "take-1");
    expect(smartRecording.deleteTake).toHaveBeenCalledWith("group-1", "take-1");
    expect(snackbar.info).toHaveBeenCalledWith("Take deleted");
  });

  it("should cycle through compare modes", () => {
    expect(component.compareMode()).toBe("off");
    component.toggleCompare();
    expect(component.compareMode()).toBe("a-b");
    component.toggleCompare();
    expect(component.compareMode()).toBe("all");
    component.toggleCompare();
    expect(component.compareMode()).toBe("off");
  });

  it("should set reference take for A/B comparison", () => {
    component.setReferenceTake("take-1");
    expect(component.abReferenceTakeId()).toBe("take-1");
    expect(snackbar.info).toHaveBeenCalledWith(
      "Reference take set for A/B comparison",
    );
  });

  it("should assemble comp URL from selected take", () => {
    const url = component.assembleComp();
    expect(url).toBe("blob:mock-url-2"); // comp-selected take
  });

  it("should return empty string if no comp group selected", () => {
    component.selectGroup("nonexistent");
    const url = (component["_currentAudio"] = null);
    const result = component.assembleComp();
    expect(result).toBe("");
  });

  it("should format duration in M:SS format", () => {
    expect(component.formatDuration(5000)).toBe("0:05");
    expect(component.formatDuration(65000)).toBe("1:05");
    expect(component.formatDuration(120000)).toBe("2:00");
  });

  it("should return distinct colors for take numbers", () => {
    const color1 = component.getTakeColor(1);
    const color2 = component.getTakeColor(2);
    expect(color1).toBeDefined();
    expect(color2).toBeDefined();
    expect(color1).not.toBe(color2);
  });

  it("should generate waveform bars of length 48", () => {
    const bars = component.generateWaveformBars();
    expect(bars).toHaveLength(48);
    bars.forEach((b) => {
      expect(b).toBeGreaterThanOrEqual(0.05);
      expect(b).toBeLessThanOrEqual(1.0);
    });
  });

  it("should filter groups by search query", () => {
    component.searchQuery.set("Verse");
    expect(component.filteredGroups()).toHaveLength(1);
    component.searchQuery.set("Nonexistent");
    expect(component.filteredGroups()).toHaveLength(0);
  });

  it("should stop playback when stopPlayback is called", () => {
    const audioMock = { pause: jest.fn() } as any;
    (component as any)._currentAudio = audioMock;
    component.stopPlayback();
    expect(audioMock.pause).toHaveBeenCalled();
    expect((component as any)._currentAudio).toBeNull();
    expect(component.playingTakeId()).toBeNull();
  });

  it("toggles a take off when its play button is tapped while playing", () => {
    const pause = jest.fn();
    const play = jest.fn().mockReturnValue(Promise.resolve());
    const original = (globalThis as any).Audio;
    (globalThis as any).Audio = class {
      onended: (() => void) | null = null;
      play = play;
      pause = pause;
    };
    try {
      component.playTake("take-1");
      expect(play).toHaveBeenCalledTimes(1);
      expect(component.playingTakeId()).toBe("take-1");

      component.playTake("take-1");
      expect(pause).toHaveBeenCalledTimes(1);
      expect(play).toHaveBeenCalledTimes(1);
      expect(component.playingTakeId()).toBeNull();
    } finally {
      (globalThis as any).Audio = original;
    }
  });

  it("clears the playback highlight when the browser blocks playback", async () => {
    const play = jest
      .fn()
      .mockReturnValue(Promise.reject(new Error("blocked")));
    const original = (globalThis as any).Audio;
    (globalThis as any).Audio = class {
      onended: (() => void) | null = null;
      play = play;
      pause = jest.fn();
    };
    try {
      component.playTake("take-1");
      await Promise.resolve();
      await Promise.resolve();
      expect(component.playingTakeId()).toBeNull();
      expect((component as any)._currentAudio).toBeNull();
      expect(snackbar.error).toHaveBeenCalled();
    } finally {
      (globalThis as any).Audio = original;
    }
  });

  it("stops playback on destroy", () => {
    const pause = jest.fn();
    const original = (globalThis as any).Audio;
    (globalThis as any).Audio = class {
      onended: (() => void) | null = null;
      play = jest.fn().mockReturnValue(Promise.resolve());
      pause = pause;
    };
    try {
      component.playTake("take-1");
      component.ngOnDestroy();
      expect(pause).toHaveBeenCalled();
      expect(component.playingTakeId()).toBeNull();
    } finally {
      (globalThis as any).Audio = original;
    }
  });

  it("points recording at the section the artist selects", () => {
    component.selectGroup("group-1");

    expect(smartRecording.setActiveCompGroup).toHaveBeenCalledWith("group-1");
  });

  it("hands recording to the next section after a delete", () => {
    const chorus = { ...mockGroup, id: "group-2", sectionLabel: "Chorus" };
    mockCompGroups.set([mockGroup, chorus]);
    smartRecording.deleteCompGroup.mockImplementation((id: string) => {
      mockCompGroups.update((groups) => groups.filter((g) => g.id !== id));
    });
    component.selectedGroupId.set("group-1");

    component.deleteGroup("group-1");

    expect(component.selectedGroupId()).toBe("group-2");
    expect(smartRecording.setActiveCompGroup).toHaveBeenCalledWith("group-2");
  });

  it("should run a suggestion and populate the suggestion signal", () => {
    suggester.suggestBestTake.mockReturnValue({
      takeId: "take-1",
      takeNumber: 1,
      score: 88,
      reasons: ["Clean headroom", "Length matches median"],
      excludedMuted: 0,
    });
    component.suggestBestTake();
    expect(suggester.suggestBestTake).toHaveBeenCalledWith("group-1");
    expect(component.suggestion()?.takeNumber).toBe(1);
    expect(component.suggestion()?.score).toBe(88);
    expect(snackbar.info).toHaveBeenCalled();
  });

  it("should warn when nothing usable to suggest from", () => {
    component.suggestBestTake();
    expect(component.suggestion()).toBeNull();
    expect(snackbar.warning).toHaveBeenCalled();
  });

  it("should apply the suggested take to the comp selection", () => {
    component.suggestion.set({
      takeId: "take-2",
      takeNumber: 2,
      score: 90,
      reasons: ["x"],
      excludedMuted: 0,
    });
    component.applySuggestedTake();
    expect(smartRecording.selectCompTake).toHaveBeenCalledWith(
      "group-1",
      "take-2",
    );
    expect(snackbar.success).toHaveBeenCalled();
  });

  it("should not apply without a suggestion", () => {
    component.suggestion.set(null);
    component.applySuggestedTake();
    expect(smartRecording.selectCompTake).not.toHaveBeenCalled();
  });

  it("should clear a suggestion", () => {
    component.suggestion.set({
      takeId: "take-2",
      takeNumber: 2,
      score: 90,
      reasons: ["x"],
      excludedMuted: 0,
    });
    component.clearSuggestion();
    expect(component.suggestion()).toBeNull();
  });

  describe("comp export", () => {
    /** Bound before any spy is installed, so re-entering a test cannot recurse. */
    const realCreateElement = document.createElement.bind(document);

    beforeEach(() => {
      (URL as any).createObjectURL = jest.fn(() => "blob:assembled");
      (URL as any).revokeObjectURL = jest.fn();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    /** Capture the anchors the component clicks to start a download. */
    const captureDownloads = (): HTMLAnchorElement[] => {
      const anchors: HTMLAnchorElement[] = [];
      jest
        .spyOn(document, "createElement")
        .mockImplementation((tag: string) => {
          const element = realCreateElement(tag) as any;
          if (tag === "a") {
            element.click = jest.fn();
            anchors.push(element);
          }
          return element;
        });
      return anchors;
    };

    const splitGroup = () => ({
      ...mockGroup,
      segments: [{ id: "s1", startBar: 1, endBar: 3, takeId: "take-1" }],
    });

    it("downloads a rendered comp for a split section", async () => {
      const assemble = jest.fn().mockResolvedValue(new Blob(["comp"]));
      (smartRecording as any).renderCompAssembly = assemble;
      mockCompGroups.set([splitGroup()]);
      const anchors = captureDownloads();

      await component.exportComp();

      expect(assemble).toHaveBeenCalledWith("group-1");
      expect(anchors).toHaveLength(1);
      expect(anchors[0].href).toContain("blob:assembled");
      expect(anchors[0].download).toMatch(/^SMUVE_Comp_Verse_1_\d+\.wav$/);
      expect(snackbar.success).toHaveBeenCalled();
      expect(component.isExporting()).toBe(false);
    });

    it("keeps the lossless take download for an unsplit section", async () => {
      const assemble = jest.fn();
      (smartRecording as any).renderCompAssembly = assemble;
      const anchors = captureDownloads();

      await component.exportComp();

      expect(assemble).not.toHaveBeenCalled();
      expect(anchors[0].href).toBe("blob:mock-url-2");
    });

    it("warns when a split section has nothing to assemble", async () => {
      const assemble = jest.fn().mockResolvedValue(null);
      (smartRecording as any).renderCompAssembly = assemble;
      mockCompGroups.set([splitGroup()]);
      const anchors = captureDownloads();

      await component.exportComp();

      expect(anchors).toHaveLength(0);
      expect(snackbar.warning).toHaveBeenCalledWith(
        "No comp selection to export",
      );
    });
  });
});
