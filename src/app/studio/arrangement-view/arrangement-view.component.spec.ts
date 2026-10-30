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
import { RecordingStatusService } from "../recording-status.service";

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
    addClipToTrack: jest.fn(),
    splitClip: jest.fn(),
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

  const receivingTrackIds = signal(new Set<string>());
  const mockRecordingStatus = {
    recordingDetail: signal(""),
    recordDestinations: signal([] as { trackId: string; trackName: string }[]),
    isTrackReceivingTake: (id: string) => receivingTrackIds().has(id),
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
        { provide: RecordingStatusService, useValue: mockRecordingStatus },
        {
          provide: MusicManagerService,
          useValue: { ...mockMusicManager, engine: { tempo: signal(124) } },
        },
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

  it("marks the track header whose take is actually being written", () => {
    receivingTrackIds.set(new Set(["1"]));
    mockAudioSession.isRecording.set(true);
    mockRecordingStatus.recordingDetail.set("Track: Lead · Microphone input");
    fixture.detectChanges();

    const header = fixture.nativeElement.querySelector(
      ".track-header",
    ) as HTMLElement;
    expect(header.classList).toContain("rec-capture");
    expect(header.querySelector(".track-rec-badge")?.textContent).toContain(
      "REC",
    );
    expect(
      fixture.nativeElement.querySelector(".module-transport-target")
        ?.textContent,
    ).toContain("Track: Lead");

    receivingTrackIds.set(new Set());
    mockAudioSession.isRecording.set(false);
    mockRecordingStatus.recordingDetail.set("");
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

  it("moves, trims and slips clips using the selected edit tool", () => {
    const clip: any = {
      id: "clip-drag",
      name: "Audio",
      start: 1,
      length: 4,
      type: "audio",
      offset: 0,
    };
    mockMusicManager.tracks.set([
      { id: "1", name: "Audio", clips: [clip], mute: false, solo: false },
    ]);
    const capture = { setPointerCapture: jest.fn() } as any;
    (component as any).gridViewport = {
      nativeElement: { getBoundingClientRect: () => ({ width: 200 }) },
    };
    (component as any).glCanvas = {
      nativeElement: { getBoundingClientRect: () => ({ width: 200 }) },
    };
    const down = {
      stopPropagation: jest.fn(),
      button: 0,
      shiftKey: false,
      pointerId: 8,
      clientX: 100,
      currentTarget: capture,
    } as any;
    component.setEditMode("select");
    component.onClipPointerDown(down, "1", clip, 2);
    expect(capture.setPointerCapture).toHaveBeenCalledWith(8);
    component.onGridPointerMove({ pointerId: 8, clientX: 150 } as any);
    expect(mockMusicManager.updateClip).toHaveBeenLastCalledWith(
      "1",
      "clip-drag",
      { start: 1.25 },
    );
    component.onGridPointerUp({ pointerId: 8 } as any);

    mockMusicManager.updateClip.mockClear();
    component.setEditMode("trim");
    component.onClipPointerDown(
      { ...down, clientX: 100 } as any,
      "1",
      clip,
      1.5,
    );
    component.onGridPointerMove({ pointerId: 8, clientX: 150 } as any);
    expect(mockMusicManager.updateClip).toHaveBeenLastCalledWith(
      "1",
      "clip-drag",
      {
        start: 1.25,
        length: 3.75,
        offset: 0.25 * (60 / 124) * 4,
      },
    );
    component.onGridPointerUp({ pointerId: 8 } as any);

    mockMusicManager.updateClip.mockClear();
    component.setEditMode("slip");
    component.onClipPointerDown({ ...down, clientX: 100 } as any, "1", clip, 2);
    component.onGridPointerMove({ pointerId: 8, clientX: 150 } as any);
    expect(mockMusicManager.updateClip).toHaveBeenLastCalledWith(
      "1",
      "clip-drag",
      {
        offset: 0.25 * (60 / 124) * 4,
      },
    );
    component.onGridPointerUp({ pointerId: 8 } as any);
  });

  it("splits clips from the split edit mode and duplicates from the duplicate mode", () => {
    const clip: any = {
      id: "clip-1",
      name: "Lead",
      start: 0,
      length: 4,
      type: "midi",
    };
    mockMusicManager.tracks.set([
      { id: "1", name: "Lead", clips: [clip], mute: false, solo: false },
    ]);
    const down = {
      stopPropagation: jest.fn(),
      button: 0,
      shiftKey: false,
      pointerId: 2,
      clientX: 100,
      currentTarget: null,
    } as any;
    component.setEditMode("split");
    component.onClipPointerDown(down, "1", clip, 2);
    expect(mockMusicManager.splitClip).toHaveBeenCalledWith("1", "clip-1", 2);
    component.setEditMode("duplicate");
    component.onClipPointerDown(down, "1", clip, 2);
    expect(mockMusicManager.addClipToTrack).toHaveBeenCalledWith(
      "1",
      expect.objectContaining({
        start: 4,
        length: 4,
        id: expect.not.stringMatching("clip-1"),
      }),
    );
  });

  it("grows the timeline past the classic 64 bars as the song needs it", () => {
    expect(component.totalBars()).toBe(64);

    mockMusicManager.tracks.set([
      {
        id: "1",
        name: "Lead",
        clips: [
          { id: "clip-90", start: 90, length: 4, name: "Outro", type: "midi" },
        ],
        mute: false,
        solo: false,
      },
    ]);

    expect(component.songEndBar()).toBe(94);
    expect(component.totalBars()).toBeGreaterThanOrEqual(102);
    expect(component.gridWidth()).toBe(
      component.totalBars() * component.barWidth(),
    );

    component.extendTimeline(16);
    expect(component.totalBars()).toBeGreaterThanOrEqual(118);
  });

  it("extends the timeline when a clip is drawn past the end", () => {
    component.setEditMode("draw");
    component.onLanePointerDownWorld({ id: "1", type: "midi" } as any, 70);

    expect(mockMusicManager.addClipToTrack).toHaveBeenCalled();
    expect(component.totalBars()).toBeGreaterThanOrEqual(78);
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
