import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ArrangementViewComponent } from "./arrangement-view.component";
import { MusicManagerService } from "../../services/music-manager.service";
import { StemSeparationService } from "../../services/stem-separation.service";
import {
  IndexedDbStemCacheStore,
  StemCacheService,
  StemCacheStore,
} from "../stem-cache.service";
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
import { StudioFocusService } from "../shared/studio-focus.service";
import { InteractionDialogService } from "../../services/interaction-dialog.service";
import { RecordingStatusService } from "../recording-status.service";

import { TempoMapService } from "../tempo-map.service";
import { MeterMapService } from "../meter-map.service";

describe("ArrangementViewComponent", () => {
  let component: ArrangementViewComponent;
  let fixture: ComponentFixture<ArrangementViewComponent>;

  const mockDialog = {
    confirm: jest.fn().mockResolvedValue(true),
  };

  const tempoMarkers = signal([
    { id: "tempo-1", step: 16, bpm: 90 },
  ]);
  const meterMarkers = signal([
    { id: "meter-1", step: 0, beats: 4, unit: 4 },
  ]);
  const mockMeterMap = {
    markers: meterMarkers,
    addMarker: jest.fn((step: number, beats: number, unit: number) => ({
      id: "meter-new",
      step,
      beats,
      unit,
    })),
    updateMarker: jest.fn(),
    removeMarker: jest.fn(),
    meterAtStep: jest.fn((step: number) => {
      const matches = meterMarkers().filter((marker) => marker.step <= step);
      return matches[matches.length - 1] ?? null;
    }),
  };

  const mockTempoMap = {
    markers: tempoMarkers,
    addMarker: jest.fn((step: number, bpm: number) => ({
      id: "tempo-new",
      step,
      bpm,
    })),
    updateMarker: jest.fn(),
    removeMarker: jest.fn(),
    toggleCurve: jest.fn(),
    bpmAtStep: jest.fn(() => 118),
    barOf: jest.fn((marker: { step: number }) =>
      Math.floor(marker.step / 16) + 1,
    ),
  };

  const mockAudioSession = {
    isPlaying: signal(false),
    isRecording: signal(false),
    togglePlay: jest.fn(),
    toggleRecord: jest.fn(),
    engine: { ctx: { createAnalyser: jest.fn() } },
    musicManager: { addAutomationLane: jest.fn() },
  };

  const seekToStep = jest.fn((step: number) => Math.min(63, Math.max(0, step)));
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
    copyClips: jest.fn(() => 1),
    pasteClips: jest.fn(() => ["clip_pasted"]),
    hasClipClipboard: jest.fn(() => false),
    duplicateTrack: jest.fn(() => "track_copy"),
    glueClips: jest.fn(),
    bounceTrack: jest.fn(),
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
    success: jest.fn(),
    error: jest.fn(),
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
        StemCacheService,
        { provide: StemCacheStore, useClass: IndexedDbStemCacheStore },
        { provide: AudioSessionService, useValue: mockAudioSession },
        { provide: TempoMapService, useValue: mockTempoMap },
        { provide: MeterMapService, useValue: mockMeterMap },
        { provide: RecordingStatusService, useValue: mockRecordingStatus },
        {
          provide: MusicManagerService,
          useValue: {
            ...mockMusicManager,
            engine: {
              tempo: signal(124),
              timeSignature: signal({ beats: 4, unit: 4 }),
              seekToStep,
            },
          },
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

  it("routes overview and ruler clicks to the transport and shows the clamped position", () => {
    const overview = { getBoundingClientRect: () => ({ left: 100, width: 200 }) };
    component.seekFromOverview({ currentTarget: overview, clientX: 300 } as any);
    expect(seekToStep).toHaveBeenCalledWith(64);
    expect(mockMusicManager.currentStep()).toBe(63);
    (component as any).isGlInitialized = true;
    (component as any).glCanvas = { nativeElement: { getBoundingClientRect: () => ({}) } };
    (component as any).gridViewport = { nativeElement: {} };
    (component as any).glRenderer = { screenToWorld: () => ({ x: 250, y: 0 }), markDirty: jest.fn(), destroy: jest.fn() };
    component.onGridPointerDown({ clientX: 0, clientY: 0 } as any);
    expect(seekToStep).toHaveBeenLastCalledWith(20);
    expect(mockMusicManager.currentStep()).toBe(20);
  });

  it("refuses to seek while recording", () => {
    mockAudioSession.isRecording.set(true);
    try {
      component.seekFromOverview({ currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 100 }) }, clientX: 50 } as any);
      expect(seekToStep).not.toHaveBeenCalled();
      expect(mockSnackbar.info).toHaveBeenCalledWith(expect.stringContaining('Stop recording'));
    } finally { mockAudioSession.isRecording.set(false); }
  });

  it("reports a failed track bounce instead of letting the rejection escape", async () => {
    mockMusicManager.bounceTrack.mockRejectedValueOnce(
      new Error("render exploded"),
    );

    await expect(component.bounceSelected()).resolves.toBeUndefined();

    expect(mockSnackbar.show).toHaveBeenCalledWith(
      "🎚 Bounce failed — the track could not be rendered",
    );
    expect(mockSnackbar.show).not.toHaveBeenCalledWith(
      expect.stringContaining("Bounced"),
    );
  });

  it("hands the bounce off through its own object URL and releases it", async () => {
    const createUrl = jest
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:bounce");
    const revokeUrl = jest
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const blob = new Blob(["audio"]);
    mockMusicManager.bounceTrack.mockResolvedValueOnce({
      blob,
      url: "blob:service",
      format: "wav-32-float",
    } as any);

    jest.useFakeTimers();
    try {
      await component.bounceSelected();

      expect(createUrl).toHaveBeenCalledWith(blob);
      expect(click).toHaveBeenCalledTimes(1);
      // Released only after the browser has had a chance to read the file.
      expect(revokeUrl).not.toHaveBeenCalled();
      jest.runAllTimers();
      expect(revokeUrl).toHaveBeenCalledWith("blob:bounce");
      // The bounce result's own URL stays valid for whoever reads it next.
      expect(revokeUrl).not.toHaveBeenCalledWith("blob:service");
    } finally {
      jest.useRealTimers();
      click.mockRestore();
      createUrl.mockRestore();
      revokeUrl.mockRestore();
    }
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

  it("pins the tempo map at the playhead bar", () => {
    mockMusicManager.currentStep.set(32);
    component.addTempoHere();
    expect(mockTempoMap.addMarker).toHaveBeenCalledWith(32, 124);
  });

  it("adds a meter change at the playhead and from the lane", () => {
    mockMusicManager.currentStep.set(32);
    component.addMeterHere();
    expect(mockMeterMap.addMarker).toHaveBeenCalledWith(32, 4, 4);

    const track = { getBoundingClientRect: () => ({ left: 0, width: 1024 }) };
    component.onMeterLanePointerDown({
      clientX: 512,
      currentTarget: track,
      target: { closest: () => null },
    } as any);
    expect(mockMeterMap.addMarker).toHaveBeenCalledWith(512, 4, 4);
  });

  it("edits a meter point inline", () => {
    component.setMeterMarkerSignature(
      { id: "meter-1", step: 0, beats: 4, unit: 4 },
      { target: { value: "3/4" } } as any,
    );
    expect(mockMeterMap.updateMarker).toHaveBeenCalledWith("meter-1", {
      beats: 3,
      unit: 4,
    });
  });

  it("retimes a meter point by dragging it", () => {
    const track = { getBoundingClientRect: () => ({ left: 0, width: 1024 }) };
    const handle = {
      closest: () => track,
      setPointerCapture: jest.fn(),
    };
    component.startMeterDrag(
      {
        button: 0,
        pointerId: 9,
        clientX: 100,
        currentTarget: handle,
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
      } as any,
      { id: "meter-1", step: 0, beats: 4, unit: 4 },
    );
    component.onMeterDragMove({
      pointerId: 9,
      clientX: 164,
      preventDefault: jest.fn(),
    } as any);

    expect(mockMeterMap.updateMarker).toHaveBeenCalledWith("meter-1", {
      step: 64,
    });
  });

  it("adds a tempo point on a lane tap and retimes it by dragging", () => {
    const track = { getBoundingClientRect: () => ({ left: 0, width: 1024 }) };
    component.onTempoLanePointerDown({
      clientX: 512,
      currentTarget: track,
      target: { closest: () => null },
    } as any);
    expect(mockTempoMap.addMarker).toHaveBeenCalledWith(512, 118);

    const marker = { id: "tempo-1", step: 16, bpm: 90 };
    const handle = {
      closest: () => track,
      setPointerCapture: jest.fn(),
    };
    component.startTempoDrag(
      {
        button: 0,
        pointerId: 7,
        clientX: 100,
        currentTarget: handle,
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
      } as any,
      marker,
    );
    component.onTempoDragMove({
      pointerId: 7,
      clientX: 164,
      preventDefault: jest.fn(),
    } as any);

    expect(mockTempoMap.updateMarker).toHaveBeenCalledWith("tempo-1", {
      step: 80,
    });
  });

  it("edits a tempo point's BPM inline", () => {
    component.setTempoMarkerBpm(
      { id: "tempo-1", step: 16, bpm: 90 },
      { target: { value: "132.4" } } as any,
    );
    expect(mockTempoMap.updateMarker).toHaveBeenCalledWith("tempo-1", {
      bpm: 132.4,
    });
  });

  it("draws step and ramp tempo automation across the lane", () => {
    const original = tempoMarkers();
    tempoMarkers.set([
      { id: "tempo-0", step: 0, bpm: 90, curve: "ramp" },
      { id: "tempo-2", step: 32, bpm: 140 },
    ]);
    try {
      const path = component.tempoLanePath();
      expect(path).toContain("M 0");
      expect(path).toContain("L 3.125");
      expect(component.tempoMarkerTop(90)).toBeGreaterThan(
        component.tempoMarkerTop(140),
      );
    } finally {
      tempoMarkers.set(original);
    }
  });

  it("crossfades two overlapping audio clips on the same track", () => {
    mockMusicManager.tracks.set([
      {
        id: "1",
        name: "Lead",
        clips: [
          {
            id: "clip-a",
            start: 0,
            length: 4,
            name: "Verse",
            type: "audio",
          },
          {
            id: "clip-b",
            start: 3,
            length: 4,
            name: "Chorus",
            type: "audio",
          },
        ],
        mute: false,
        solo: false,
      },
    ]);
    component.selectedClipIds.set(new Set(["clip-a", "clip-b"]));

    component.crossfadeSelected();

    expect(mockMusicManager.updateClip).toHaveBeenCalledWith("1", "clip-a", {
      fadeOut: 1,
      fadeCurve: "equalPower",
    });
    expect(mockMusicManager.updateClip).toHaveBeenCalledWith("1", "clip-b", {
      fadeIn: 1,
      fadeCurve: "equalPower",
    });
    expect(mockSnackbar.show).toHaveBeenCalledWith(
      expect.stringContaining("Crossfade"),
    );
  });

  it("draws a shorter crossfade across an overlap with the X-Fade tool", () => {
    const left = {
      id: "clip-a",
      start: 0,
      length: 4,
      name: "Verse",
      type: "audio" as const,
    };
    const right = {
      id: "clip-b",
      start: 3,
      length: 4,
      name: "Chorus",
      type: "audio" as const,
    };
    mockMusicManager.tracks.set([
      {
        id: "1",
        name: "Lead",
        clips: [left, right],
        mute: false,
        solo: false,
      },
    ]);
    const capture = { setPointerCapture: jest.fn() };
    component.setEditMode("crossfade");

    component.onClipPointerDown(
      {
        stopPropagation: jest.fn(),
        button: 0,
        shiftKey: false,
        pointerId: 9,
        clientX: 100,
        currentTarget: capture,
      } as any,
      "1",
      left,
      3.5,
    );
    expect(capture.setPointerCapture).toHaveBeenCalledWith(9);
    expect(component.selectedClipIds()).toEqual(new Set(["clip-a", "clip-b"]));

    component.onGridPointerMove({
      pointerId: 9,
      clientX: 100 + component.barWidth() * 0.25,
    } as any);
    expect(mockMusicManager.updateClip).toHaveBeenCalledWith("1", "clip-a", {
      fadeOut: 0.75,
      fadeCurve: "equalPower",
    });
    expect(mockMusicManager.updateClip).toHaveBeenCalledWith("1", "clip-b", {
      fadeIn: 0.75,
      fadeCurve: "equalPower",
    });

    component.onGridPointerUp({ pointerId: 9 } as any);
    expect(mockSnackbar.show).toHaveBeenCalledWith(
      expect.stringContaining("Crossfade 0.75 bars"),
    );
  });

  it("refuses to crossfade clips that do not overlap", () => {
    mockMusicManager.tracks.set([
      {
        id: "1",
        name: "Lead",
        clips: [
          { id: "clip-a", start: 0, length: 2, type: "audio" },
          { id: "clip-b", start: 3, length: 2, type: "audio" },
        ],
        mute: false,
        solo: false,
      },
    ]);
    component.selectedClipIds.set(new Set(["clip-a", "clip-b"]));

    component.crossfadeSelected();

    expect(mockMusicManager.updateClip).not.toHaveBeenCalled();
    expect(mockSnackbar.info).toHaveBeenCalledWith(
      expect.stringContaining("overlap"),
    );
  });

  it("ripple delete closes the removed range and pulls later clips left", () => {
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
    component.selectedClipIds.set(new Set(["clip-1"]));

    component.deleteSelectedRippled();

    expect(mockMusicManager.removeClip).toHaveBeenCalledWith("1", "clip-1");
    expect(mockMusicManager.updateClip).toHaveBeenCalledWith("1", "clip-2", {
      start: 0,
    });
    expect(component.selectedClipIds()).toEqual(new Set());
  });

  it("copies the selected clips without their ids", () => {
    mockMusicManager.tracks.set([
      {
        id: "1",
        name: "Lead",
        mute: false,
        solo: false,
        clips: [
          { id: "c1", start: 0, length: 4, name: "Verse", type: "midi" },
        ],
      },
    ]);
    component.selectedClipIds.set(new Set(["c1"]));

    component.copyClips();

    const entries = mockMusicManager.copyClips.mock.calls[0][0];
    expect(entries).toHaveLength(1);
    expect(entries[0].sourceTrackId).toBe("1");
    expect(entries[0].clip.name).toBe("Verse");
    expect(entries[0].clip.id).toBeUndefined();
  });

  it("pastes at the playhead bar and selects the new clips", () => {
    mockMusicManager.hasClipClipboard.mockReturnValue(true);
    mockMusicManager.currentStep.set(32); // 2 bars at 16 steps per bar
    mockMusicManager.selectedTrackId.set("1");

    component.pasteClips();

    expect(mockMusicManager.pasteClips).toHaveBeenCalledWith("1", 2);
    expect(Array.from(component.selectedClipIds())).toEqual(["clip_pasted"]);
  });

  it("duplicates the selected clips from the keyboard", () => {
    const duplicate = jest
      .spyOn(component, "duplicateSelected")
      .mockImplementation(() => undefined);
    component.selectedClipIds.set(new Set(["c1"]));

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "d", ctrlKey: true, bubbles: true }),
    );

    expect(duplicate).toHaveBeenCalledTimes(1);
    duplicate.mockRestore();
  });


  it("offers copy and paste from the clip actions sheet", () => {
    mockMusicManager.hasClipClipboard.mockReturnValue(false);
    component.selectedClipIds.set(new Set(["c1"]));
    component.openClipActions();
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(
      host.querySelector('button[aria-label="Copy selected clips"]'),
    ).toBeTruthy();
    const paste = host.querySelector(
      'button[aria-label="Paste clips at the playhead"]',
    ) as HTMLButtonElement | null;
    expect(paste).toBeTruthy();
    // Nothing copied yet, so Paste must be visibly unavailable.
    expect(paste?.disabled).toBe(true);
  });

  it("enables Paste on the sheet once a clipboard exists", () => {
    mockMusicManager.hasClipClipboard.mockReturnValue(true);
    component.selectedClipIds.set(new Set(["c1"]));
    component.openClipActions();
    fixture.detectChanges();

    const paste = (fixture.nativeElement as HTMLElement).querySelector(
      'button[aria-label="Paste clips at the playhead"]',
    ) as HTMLButtonElement | null;
    expect(paste?.disabled).toBe(false);
  });


  it("stands down while another view owns the shortcuts", () => {
    const focus = TestBed.inject(StudioFocusService);
    const duplicate = jest
      .spyOn(component, "duplicateSelected")
      .mockImplementation(() => undefined);
    component.selectedClipIds.set(new Set(["c1"]));

    focus.noteActivity("piano-roll");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "d", ctrlKey: true, bubbles: true }),
    );
    expect(duplicate).not.toHaveBeenCalled();

    // Touching the arrangement hands the shortcut back.
    component.onPointerActivity();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "d", ctrlKey: true, bubbles: true }),
    );
    expect(duplicate).toHaveBeenCalledTimes(1);

    // Focus alone also hands it back: keyboard-only use never clicks here.
    focus.noteActivity("piano-roll");
    component.onFocusActivity();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "d", ctrlKey: true, bubbles: true }),
    );
    expect(duplicate).toHaveBeenCalledTimes(2);

    duplicate.mockRestore();
    focus.noteActivity("arrangement");
  });


  it("auditions the upload and each stem in place, stopping the previous source", () => {
    const sources: any[] = [];
    const ctx = {
      state: "running",
      destination: {},
      resume: jest.fn().mockResolvedValue(undefined),
      createBufferSource: jest.fn(() => {
        const source: any = {
          buffer: null,
          onended: null,
          connect: jest.fn(),
          disconnect: jest.fn(),
          start: jest.fn(),
          stop: jest.fn(),
        };
        sources.push(source);
        return source;
      }),
    };
    (TestBed.inject(MusicManagerService) as any).engine.ctx = ctx;
    const make = () =>
      new AudioBuffer({ length: 100, sampleRate: 44100, numberOfChannels: 1 });
    const original = make();
    const vocals = make();
    component.stemSourceBuffer.set(original);
    component.stemStems.set({
      vocals,
      drums: make(),
      bass: make(),
      instrumental: make(),
      other: make(),
    } as any);

    component.toggleStemAudition("original");
    expect(sources[0].buffer).toBe(original);
    expect(sources[0].start).toHaveBeenCalled();
    expect(component.stemAudition()).toBe("original");

    component.toggleStemAudition("vocals");
    expect(sources[0].stop).toHaveBeenCalled();
    expect(sources[1].buffer).toBe(vocals);
    expect(component.stemAudition()).toBe("vocals");

    // Clicking the sounding stem again stops it instead of restarting.
    component.toggleStemAudition("vocals");
    expect(sources[1].stop).toHaveBeenCalled();
    expect(component.stemAudition()).toBeNull();
  });

  it("stops stem audition and releases its source when the splitter closes", () => {
    const source = { stop: jest.fn(), disconnect: jest.fn(), onended: jest.fn() };
    (component as any).auditionSource = source;
    component.stemAudition.set("instrumental");

    component.closeStemSplit();

    expect(source.stop).toHaveBeenCalled();
    expect(source.disconnect).toHaveBeenCalled();
    expect(component.stemAudition()).toBeNull();
  });



  it("reuses a file's cached stems instead of separating it twice", async () => {
    const make = () =>
      new AudioBuffer({ length: 100, sampleRate: 44100, numberOfChannels: 1 });
    const source = make();
    const stems = {
      vocals: make(),
      drums: make(),
      bass: make(),
      instrumental: make(),
      other: make(),
    };
    const ctx = {
      state: "running",
      decodeAudioData: jest.fn().mockResolvedValue(source),
    };
    (TestBed.inject(MusicManagerService) as any).engine.ctx = ctx;
    const separate = jest
      .spyOn(TestBed.inject(StemSeparationService), "separate")
      .mockResolvedValue(stems as any);
    const file: any = {
      name: "cached.wav",
      size: 4096,
      lastModified: 1234,
      type: "audio/wav",
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(16)),
    };

    await component.onStemFile({ target: { files: [file], value: "" } } as any);
    expect(separate).toHaveBeenCalledTimes(1);
    expect(component.stemStems()).toBe(stems);

    component.closeStemSplit();
    component.openStemSplit();
    expect(component.stemStems()).toBe(stems);
    expect(component.stemCached()).toBe(true);

    await component.onStemFile({ target: { files: [file], value: "" } } as any);
    expect(separate).toHaveBeenCalledTimes(1);
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(component.stemStems()).toBe(stems);
    expect(mockSnackbar.show).toHaveBeenCalledWith(
      expect.stringContaining("restored from cache"),
    );
  });

  it("evicts old cached stems when the budget no longer fits", async () => {
    const make = () =>
      new AudioBuffer({ length: 100, sampleRate: 44100, numberOfChannels: 1 });
    const stems = {
      vocals: make(),
      drums: make(),
      bass: make(),
      instrumental: make(),
      other: make(),
    };
    const ctx = { state: "running", decodeAudioData: jest.fn() };
    (TestBed.inject(MusicManagerService) as any).engine.ctx = ctx;
    jest
      .spyOn(TestBed.inject(StemSeparationService), "separate")
      .mockResolvedValue(stems as any);
    (TestBed.inject(StemCacheService) as any).budgetBytes = 1;
    const file = (name: string) => {
      ctx.decodeAudioData.mockResolvedValue(make());
      return {
        name,
        size: 4096,
        lastModified: 1,
        type: "audio/wav",
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(16)),
      } as any;
    };

    await component.onStemFile({ target: { files: [file("a.wav")], value: "" } } as any);
    await component.onStemFile({ target: { files: [file("b.wav")], value: "" } } as any);
    expect(TestBed.inject(StemCacheService).size).toBe(1);

    component.closeStemSplit();
    component.openStemSplit();
    expect(component.stemFileName()).toBe("b.wav");
  });



  it("restores the last saved split when the splitter opens", async () => {
    const make = () =>
      new AudioBuffer({ length: 100, sampleRate: 44100, numberOfChannels: 1 });
    const entry = {
      key: "saved",
      fileName: "saved.wav",
      source: make(),
      stems: {
        vocals: make(),
        drums: make(),
        bass: make(),
        instrumental: make(),
        other: make(),
      },
      bytes: 1,
    };
    jest
      .spyOn(TestBed.inject(StemCacheService), "loadMostRecent")
      .mockResolvedValue(entry);

    component.openStemSplit();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(component.stemStems()).toBe(entry.stems);
    expect(component.stemFileName()).toBe("saved.wav");
    expect(component.stemCached()).toBe(true);
    expect(component.stemBusy()).toBe(false);
  });



  it("loads a saved split and starts its instrumental preview", async () => {
    const make = () =>
      new AudioBuffer({ length: 100, sampleRate: 44100, numberOfChannels: 1 });
    const entry = {
      key: "saved",
      fileName: "saved.wav",
      source: make(),
      stems: {
        vocals: make(),
        drums: make(),
        bass: make(),
        instrumental: make(),
        other: make(),
      },
      bytes: 1,
    };
    const cache = TestBed.inject(StemCacheService);
    jest.spyOn(cache, "load").mockResolvedValue(entry);
    jest.spyOn(cache, "savedSplits").mockResolvedValue([]);
    const audition = jest
      .spyOn(component, "toggleStemAudition")
      .mockImplementation(() => undefined);

    await component.loadSavedSplit(
      { key: "saved", fileName: "saved.wav", bytes: 2048, lastUsed: 1 },
      true,
    );

    expect(component.stemStems()).toBe(entry.stems);
    expect(component.stemFileName()).toBe("saved.wav");
    expect(audition).toHaveBeenCalledWith("instrumental");
    expect(component.stemBusy()).toBe(false);
  });

  it("deletes a saved split and drops it from the panel", async () => {
    const saved = {
      key: "saved",
      fileName: "saved.wav",
      bytes: 2048,
      lastUsed: 1,
    };
    const cache = TestBed.inject(StemCacheService);
    const forget = jest.spyOn(cache, "forget").mockResolvedValue();
    jest.spyOn(cache, "savedSplits").mockResolvedValue([]);
    component.stemSaved.set([saved]);

    await component.deleteSavedSplit(saved);

    expect(forget).toHaveBeenCalledWith("saved");
    expect(component.stemSaved()).toEqual([]);
  });



  it("confirms before clearing saved stems and can undo the clear", async () => {
    const saved = {
      key: "saved",
      fileName: "saved.wav",
      bytes: 2048,
      lastUsed: 1,
    };
    component.stemSaved.set([saved]);
    const cache = TestBed.inject(StemCacheService);
    const schedule = jest
      .spyOn(cache, "scheduleClearSaved")
      .mockImplementation(() => undefined);
    const cancel = jest
      .spyOn(cache, "cancelScheduledClearSaved")
      .mockReturnValue(true);
    jest.spyOn(cache, "savedSplits").mockResolvedValue([saved]);

    mockDialog.confirm.mockResolvedValueOnce(false);
    await component.clearSavedSplits();
    expect(schedule).not.toHaveBeenCalled();
    expect(component.stemSaved()).toEqual([saved]);

    mockDialog.confirm.mockResolvedValueOnce(true);
    await component.clearSavedSplits();
    expect(schedule).toHaveBeenCalledWith(6000);
    expect(component.stemSaved()).toEqual([]);

    const toast = mockSnackbar.show.mock.calls.at(-1)?.[0] as any;
    expect(toast.action).toBe("Undo");
    toast.onAction();
    expect(cancel).toHaveBeenCalled();
    expect(component.stemSaved()).toEqual([saved]);
  });


});
