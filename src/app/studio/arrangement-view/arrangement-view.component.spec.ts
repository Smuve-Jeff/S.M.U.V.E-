import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ArrangementViewComponent } from "./arrangement-view.component";
import { MusicManagerService } from "../../services/music-manager.service";
import { AudioSessionService } from "../audio-session.service";
import { AudioEngineService } from "../../services/audio-engine.service";
import { signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { HistoryService } from "../../services/history.service";
import { EnhancedTouchGestureService } from "../../services/enhanced-touch-gesture.service";
import { HapticService } from "../../services/haptic.service";
import { AiService } from "../../services/ai.service";
import { SnackbarService } from "../../services/snackbar.service";
import { InteractionDialogService } from "../../services/interaction-dialog.service";

describe("ArrangementViewComponent", () => {
  let component: ArrangementViewComponent;
  let fixture: ComponentFixture<ArrangementViewComponent>;

  const mockDialog = {
    confirm: jest.fn().mockResolvedValue(true),
  };

  const mockAudioSession = {
    isPlaying: signal(false),
    isRecording: signal(false),
    togglePlay: jest.fn(),
    toggleRecord: jest.fn(),
    engine: { ctx: { createAnalyser: jest.fn() } },
    musicManager: { addAutomationLane: jest.fn() },
  };

  const mockMusicManager = {
    tracks: signal([
      { id: "1", name: "Lead", clips: [], mute: false, solo: false },
    ]),
    selectedTrackId: signal("1"),
    currentStep: signal(0),
    ensureTrack: jest.fn(),
    removeTrack: jest.fn(),
    removeClip: jest.fn(),
    toggleMute: jest.fn(),
    toggleSolo: jest.fn(),
    takesExpanded: signal({}),
    addTrack: jest.fn(),
    updateClip: jest.fn(),
    glueClips: jest.fn(),
  };

  const mockHistory = {
    undo: jest.fn(),
    redo: jest.fn(),
    canUndo: signal(false),
    canRedo: signal(false),
    lastActionName: signal(""),
  };

  const mockEnhancedGestures = {
    handlePinch: jest.fn(),
    resetPinch: jest.fn(),
    zoomLevel: signal(1.0),
    verticalZoomLevel: signal(1.0),
  };

  const mockHaptic = {
    light: jest.fn(),
    medium: jest.fn(),
    impact: jest.fn(),
  };

  const mockAiService = {
    getProductionSmartAssist: jest.fn(),
  };

  const mockSnackbar = {
    info: jest.fn(),
    show: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockMusicManager.tracks.set([
      { id: "1", name: "Lead", clips: [], mute: false, solo: false },
    ]);
    mockMusicManager.glueClips.mockReturnValue("clip-glued");
    await TestBed.configureTestingModule({
      imports: [ArrangementViewComponent, CommonModule, FormsModule],
      providers: [
        { provide: AudioSessionService, useValue: mockAudioSession },
        { provide: MusicManagerService, useValue: mockMusicManager },
        {
          provide: AudioEngineService,
          useValue: { tempo: signal(124), visualStep: signal(0) },
        },
        { provide: HistoryService, useValue: mockHistory },
        {
          provide: EnhancedTouchGestureService,
          useValue: mockEnhancedGestures,
        },
        { provide: HapticService, useValue: mockHaptic },
        { provide: AiService, useValue: mockAiService },
        { provide: SnackbarService, useValue: mockSnackbar },
        { provide: InteractionDialogService, useValue: mockDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ArrangementViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("does not pan the render camera by the scroll offset (native scroll owns the pan)", () => {
    const renderSpy = jest.fn();
    (component as any).isGlInitialized = true;
    (component as any).glRenderer = {
      resize: jest.fn(),
      clear: jest.fn(),
      screenToWorld: jest.fn(),
      destroy: jest.fn(),
    };
    (component as any).timelineRenderer = {
      setPixelsPerBar: jest.fn(),
      render: renderSpy,
    };
    (component as any).gridViewport = {
      nativeElement: {
        clientWidth: 400,
        clientHeight: 300,
        scrollLeft: 480,
        scrollTop: 64,
      },
    };

    (component as any).renderTimeline();

    const camera = renderSpy.mock.calls[0][4];
    expect(camera).toEqual({ scrollX: 0, scrollY: 0, zoom: 1 });
    (component as any).isGlInitialized = false;
  });

  it("applies a two-finger pinch to the timeline zoom", () => {
    const preventDefault = jest.fn();
    const barWidthBefore = component.barWidth();
    mockEnhancedGestures.zoomLevel.set(1);

    (component as any).onGridTouchStart({ touches: [{}, {}] } as any);
    // The gesture service accumulates the zoom; the view must fold it into
    // barWidth or the pinch zooms nothing.
    mockEnhancedGestures.zoomLevel.set(1.5);
    (component as any).onGridTouchMove({
      touches: [{}, {}],
      preventDefault,
    } as any);

    expect(component.barWidth()).toBe(Math.round(barWidthBefore * 1.5));
    expect(preventDefault).toHaveBeenCalled();
    (component as any).onGridTouchEnd();
  });

  it("should call removeTrack once the in-app confirm is accepted", async () => {
    // window.confirm froze the Android WebView (and returned false where the
    // host does not implement it), so the prompt must be the app's own dialog.
    mockDialog.confirm.mockResolvedValueOnce(true);
    await component.removeTrack("1", new MouseEvent("click") as any);
    expect(mockDialog.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ tone: "danger" }),
    );
    expect(mockMusicManager.removeTrack).toHaveBeenCalledWith("1");
  });

  it("should keep the track when the delete confirm is dismissed", async () => {
    mockDialog.confirm.mockResolvedValueOnce(false);
    await component.removeTrack("1", new MouseEvent("click") as any);
    expect(mockMusicManager.removeTrack).not.toHaveBeenCalled();
  });

  it("quantizes selected clip starts to the grid", () => {
    mockMusicManager.tracks.set([
      {
        id: "1",
        name: "Lead",
        clips: [
          { id: "clip-1", start: 1.18, length: 4, name: "Clip", type: "midi" },
        ],
        mute: false,
        solo: false,
      },
    ]);
    component.selectedClipIds.set(new Set(["clip-1"]));

    component.quantizeSelected();

    expect(mockMusicManager.updateClip).toHaveBeenCalledWith("1", "clip-1", {
      start: 1.25,
    });
    expect(mockSnackbar.info).toHaveBeenCalledWith(
      "Quantized 1 clip to the grid",
    );
  });

  it("reports when selected clips are already on the grid", () => {
    mockMusicManager.tracks.set([
      {
        id: "1",
        name: "Lead",
        clips: [
          { id: "clip-1", start: 1.25, length: 4, name: "Clip", type: "midi" },
        ],
        mute: false,
        solo: false,
      },
    ]);
    component.selectedClipIds.set(new Set(["clip-1"]));

    component.quantizeSelected();

    expect(mockMusicManager.updateClip).not.toHaveBeenCalled();
    expect(mockSnackbar.info).toHaveBeenCalledWith(
      "Selected clips are already on the grid",
    );
  });

  it("glues selected clips on one track into a single clip workflow", () => {
    mockMusicManager.tracks.set([
      {
        id: "1",
        name: "Lead",
        clips: [
          { id: "clip-1", start: 0, length: 4, name: "Clip A", type: "midi" },
          { id: "clip-2", start: 4, length: 4, name: "Clip B", type: "midi" },
        ],
        mute: false,
        solo: false,
      },
    ]);
    component.selectedClipIds.set(new Set(["clip-1", "clip-2"]));

    component.consolidateSelected();

    expect(mockMusicManager.glueClips).toHaveBeenCalledWith("1", [
      "clip-1",
      "clip-2",
    ]);
    expect(component.selectedClipIds()).toEqual(new Set(["clip-glued"]));
    expect(mockSnackbar.info).toHaveBeenCalledWith("Glued 2 clips into 1");
  });

  it("requires selected clips to stay on one track before gluing", () => {
    mockMusicManager.tracks.set([
      {
        id: "1",
        name: "Lead",
        clips: [
          {
            id: "clip-1",
            start: 0,
            length: 4,
            name: "Clip A",
            type: "midi",
          },
        ],
        mute: false,
        solo: false,
      },
      {
        id: "2",
        name: "Bass",
        clips: [
          {
            id: "clip-2",
            start: 4,
            length: 4,
            name: "Clip B",
            type: "midi",
          },
        ],
        mute: false,
        solo: false,
      },
    ]);
    component.selectedClipIds.set(new Set(["clip-1", "clip-2"]));

    component.consolidateSelected();

    expect(mockMusicManager.glueClips).not.toHaveBeenCalled();
    expect(mockSnackbar.info).toHaveBeenCalledWith(
      "Select 2+ clips on one track to glue",
    );
  });

  it("uses the glue tool to consolidate the clicked clip with the current selection", () => {
    mockMusicManager.tracks.set([
      {
        id: "1",
        name: "Lead",
        clips: [
          { id: "clip-1", start: 0, length: 4, name: "Clip A", type: "midi" },
          { id: "clip-2", start: 4, length: 4, name: "Clip B", type: "midi" },
        ],
        mute: false,
        solo: false,
      },
    ]);
    component.activeTool.set("glue");
    component.selectedClipIds.set(new Set(["clip-1"]));

    component.onClipPointerDown(
      { stopPropagation: jest.fn(), shiftKey: false } as any,
      "1",
      mockMusicManager.tracks()[0].clips[1] as any,
    );

    expect(mockMusicManager.glueClips).toHaveBeenCalledWith("1", [
      "clip-1",
      "clip-2",
    ]);
    expect(component.selectedClipIds()).toEqual(new Set(["clip-glued"]));
  });

  // ── Phase F2: Clip Trim / Fade / Delete ────────────────────

  it("trims the left edge of a selected clip (start later, shorter)", () => {
    mockMusicManager.tracks.set([
      {
        id: "1",
        name: "Lead",
        clips: [
          { id: "clip-1", start: 1, length: 4, name: "Clip", type: "midi" },
        ],
        mute: false,
        solo: false,
      },
    ]);
    component.selectedClipIds.set(new Set(["clip-1"]));

    component.trimSelected("start", 0.25);

    expect(mockMusicManager.updateClip).toHaveBeenCalledWith("1", "clip-1", {
      start: 1.25,
      length: 3.75,
    });
    expect(mockHaptic.light).toHaveBeenCalled();
  });

  it("trims the right edge of a selected clip (shorter)", () => {
    mockMusicManager.tracks.set([
      {
        id: "1",
        name: "Lead",
        clips: [
          { id: "clip-1", start: 0, length: 4, name: "Clip", type: "midi" },
        ],
        mute: false,
        solo: false,
      },
    ]);
    component.selectedClipIds.set(new Set(["clip-1"]));

    component.trimSelected("end", -0.25);

    expect(mockMusicManager.updateClip).toHaveBeenCalledWith("1", "clip-1", {
      start: 0,
      length: 3.75,
    });
  });

  it("never trims a clip below a quarter bar", () => {
    mockMusicManager.tracks.set([
      {
        id: "1",
        name: "Lead",
        clips: [
          { id: "clip-1", start: 0, length: 0.5, name: "Clip", type: "midi" },
        ],
        mute: false,
        solo: false,
      },
    ]);
    component.selectedClipIds.set(new Set(["clip-1"]));

    component.trimSelected("end", -10);

    expect(mockMusicManager.updateClip).toHaveBeenCalledWith("1", "clip-1", {
      start: 0,
      length: 0.25,
    });
  });

  it("cycles fade-in on an audio clip: 0 → ½ bar", () => {
    mockMusicManager.tracks.set([
      {
        id: "1",
        name: "Audio",
        clips: [
          {
            id: "clip-1",
            start: 0,
            length: 4,
            name: "Clip",
            type: "audio",
          },
        ],
        mute: false,
        solo: false,
      },
    ]);
    component.selectedClipIds.set(new Set(["clip-1"]));

    component.cycleFade("in");

    expect(mockMusicManager.updateClip).toHaveBeenCalledWith("1", "clip-1", {
      fadeIn: 0.5,
    });
    expect(mockSnackbar.show).toHaveBeenCalledWith(
      expect.stringContaining("½ bar"),
    );
  });

  it("cycles fade-out forward through presets on an audio clip", () => {
    mockMusicManager.tracks.set([
      {
        id: "1",
        name: "Audio",
        clips: [
          {
            id: "clip-1",
            start: 0,
            length: 4,
            name: "Clip",
            type: "audio",
            fadeOut: 1,
          },
        ],
        mute: false,
        solo: false,
      },
    ]);
    component.selectedClipIds.set(new Set(["clip-1"]));

    component.cycleFade("out");

    expect(mockMusicManager.updateClip).toHaveBeenCalledWith("1", "clip-1", {
      fadeOut: 2,
    });
  });

  it("hints that fades apply to audio clips only when a MIDI clip is selected", () => {
    mockMusicManager.tracks.set([
      {
        id: "1",
        name: "Lead",
        clips: [
          { id: "clip-1", start: 0, length: 4, name: "Clip", type: "midi" },
        ],
        mute: false,
        solo: false,
      },
    ]);
    component.selectedClipIds.set(new Set(["clip-1"]));

    component.cycleFade("in");

    expect(mockMusicManager.updateClip).not.toHaveBeenCalled();
    expect(mockSnackbar.info).toHaveBeenCalledWith(
      "Fades apply to audio clips only",
    );
  });

  it("deletes all selected clips and clears the selection", () => {
    mockMusicManager.tracks.set([
      {
        id: "1",
        name: "Lead",
        clips: [
          { id: "clip-1", start: 0, length: 4, name: "Clip A", type: "midi" },
          { id: "clip-2", start: 4, length: 4, name: "Clip B", type: "midi" },
        ],
        mute: false,
        solo: false,
      },
    ]);
    component.selectedClipIds.set(new Set(["clip-1", "clip-2"]));

    component.deleteSelected();

    expect(mockMusicManager.removeClip).toHaveBeenCalledWith("1", "clip-1");
    expect(mockMusicManager.removeClip).toHaveBeenCalledWith("1", "clip-2");
    expect(component.selectedClipIds()).toEqual(new Set());
    expect(mockSnackbar.show).toHaveBeenCalledWith(
      expect.stringContaining("Deleted 2 clips"),
    );
  });
});
