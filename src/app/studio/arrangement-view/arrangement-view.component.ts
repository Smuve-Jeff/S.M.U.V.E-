import {
  Component,
  inject,
  signal,
  computed,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  Output,
  EventEmitter,
  HostListener,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import type { ClipClipboardEntry } from "../../services/music-manager.service";
import {
  MusicManagerService,
  TrackModel,
} from "../../services/music-manager.service";
import { AudioSessionService } from "../audio-session.service";
import {
  dropBarFromWorldX,
  droppedAudioName,
  isSupportedAudioFile,
} from "./audio-drop.util";
import { HistoryService } from "../../services/history.service";
import { HapticService } from "../../services/haptic.service";
import { claimKeyEvent } from "../shared/keyboard-claim";
import { StudioFocusService } from "../shared/studio-focus.service";
import { EnhancedTouchGestureService } from "../../services/enhanced-touch-gesture.service";
import { StudioTrack, StudioClip } from "../../types/studio.types";
import {
  StemSeparationService,
  Stems,
} from "../../services/stem-separation.service";
import { SnackbarService } from "../../services/snackbar.service";
import { InteractionDialogService } from "../../services/interaction-dialog.service";
import { LoggingService } from "../../services/logging.service";
import { TakeManagerService } from "../../services/take-manager.service";
import { TakeLaneComponent } from "../take-lane/take-lane.component";
import { WebGLRenderer } from "../webgl/webgl-renderer";
import {
  TimelineRenderer,
  TimelineClip,
  TimelineTrack,
  clipColorFromId,
} from "../webgl/timeline-renderer";
import { StudioVisualSchedulerService } from "../shared/studio-visual-scheduler.service";
import { StudioBottomSheetComponent } from "../shared/studio-bottom-sheet/studio-bottom-sheet.component";
import { AutomationCurveEditorComponent } from "../automation/automation-curve-editor.component";
import { VcaBusService } from "../vca-bus.service";
import { AutomationService } from "../automation.service";
import {
  STEPS_PER_BAR,
  TempoMapService,
  type TempoMarker,
} from "../tempo-map.service";
import {
  MeterMapService,
  METER_OPTIONS,
  type MeterMarker,
} from "../meter-map.service";
import { ArrangementMarkersService } from "../arrangement-markers.service";
import { RecordingStatusService } from "../recording-status.service";

export type ArrangementTool =
  | "select"
  | "draw"
  | "split"
  | "trim"
  | "slip"
  | "duplicate"
  | "glue"
  | "crossfade";

@Component({
  selector: "app-arrangement-view",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TakeLaneComponent,
    StudioBottomSheetComponent,
    AutomationCurveEditorComponent,
  ],
  templateUrl: "./arrangement-view.component.html",
  styleUrls: ["./arrangement-view.component.css", "../shared/platform-ux.css"],
})
export class ArrangementViewComponent implements AfterViewInit, OnDestroy {
  public readonly musicManager = inject(MusicManagerService);
  public readonly vcaBuses = inject(VcaBusService);
  public readonly audioSession = inject(AudioSessionService);
  public readonly history = inject(HistoryService);
  private readonly haptic = inject(HapticService);
  private readonly studioFocus = inject(StudioFocusService);
  private readonly enhancedGestures = inject(EnhancedTouchGestureService);
  private readonly stemSvc = inject(StemSeparationService);
  private readonly snackbar = inject(SnackbarService);
  private readonly visualScheduler = inject(StudioVisualSchedulerService);
  private readonly dialog = inject(InteractionDialogService);
  private readonly logger = inject(LoggingService);
  /** Sprint A3 — take lane state per track (TakeManagerService, root-scoped). */
  public readonly takeManager = inject(TakeManagerService);
  /** Markers are project state, not component state. */
  private readonly markerService = inject(ArrangementMarkersService);
  readonly markers = this.markerService.markers;
  /**
   * The same recording state the transport chip reads. The arrangement uses it
   * to flag the exact track header whose take is being written, instead of a
   * generic "RECORDING" badge with no destination.
   */
  public readonly recordingStatus = inject(RecordingStatusService);
  readonly recordingDetail = this.recordingStatus.recordingDetail;

  /** True while the transport is writing this track's take. */
  isTrackReceivingTake(trackId: string): boolean {
    return this.recordingStatus.isTrackReceivingTake(trackId);
  }

  /**
   * Fired from the empty-arrangement CTA so the Studio shell can switch
   * to AI Produce (or another view) without this component knowing the
   * shell's navigation mechanics.
   */
  @Output() requestViewChange = new EventEmitter<string>();

  /** Forwarded from the automation curve editor so Studio can open the
   *  full bezier panel for the selected lane. */
  @Output() openBezierEditor = new EventEmitter<string>();

  // ── WebGL renderer ───────────────────────────────────────
  private glRenderer!: WebGLRenderer;
  private timelineRenderer!: TimelineRenderer;
  private stopVisualTask: (() => void) | null = null;
  private isGlInitialized = false;
  private activeClipGesture: {
    pointerId: number;
    clipId: string;
    trackId: string;
    mode: 'move' | 'trim-start' | 'trim-end' | 'slip' | 'crossfade';
    startClientX: number;
    initialStart: number;
    initialLength: number;
    initialOffset: number;
    changed: boolean;
    crossfadeLeftId?: string;
    crossfadeRightId?: string;
    crossfadeOverlap?: number;
    crossfadeBarAtDown?: number;
    crossfadeFade?: number;
  } | null = null;

  /** Horizontal drag state for a tempo point in the timeline lane. */
  private activeTempoDrag: {
    pointerId: number;
    markerId: string;
    startClientX: number;
    initialStep: number;
    lastStep: number;
    laneWidth: number;
    moved: boolean;
  } | null = null;

  /** A drag that moved should not also seek when its pointerup synthesizes a click. */
  private suppressTempoSeek = false;

  /** Horizontal drag state for a meter point. */
  private activeMeterDrag: {
    pointerId: number;
    markerId: string;
    startClientX: number;
    initialBar: number;
    lastBar: number;
    laneWidth: number;
    moved: boolean;
  } | null = null;

  private suppressMeterSeek = false;

  // ── Stem-Splitter UI state ───────────────────────────────
  stemOpen = signal(false);
  /** Stage label from the separator, e.g. "Bass · L". */
  stemStage = signal<string | null>(null);
  stemProgress = signal(0);
  stemStems = signal<Stems | null>(null);
  stemFileName = signal<string | null>(null);
  stemBusy = signal(false);

  readonly tracks = this.musicManager.tracks;
  /** The visible editing mode is explicit; the low-level renderer tool follows it. */
  editMode = signal<ArrangementTool>("select");
  activeTool = signal<"select" | "blade" | "glue">("select");
  readonly tempoMap = inject(TempoMapService);
  readonly meterMap = inject(MeterMapService);
  readonly meterOptions = METER_OPTIONS;
  selectedClipIds = signal<Set<string>>(new Set());
  snapEnabled = signal(true);
  private readonly automation = inject(AutomationService);

  /**
   * Mirrors the service, not a local flag: the AUTO button arms real keyframe
   * capture (see AutomationService.captureWrite), so its lit state has to be
   * the same state the write path reads.
   */
  readonly isRecordingAutomation = this.automation.writeEnabled;
  readonly automationMode = this.automation.writeMode;
  readonly automationSmoothing = this.automation.writeSmoothing;
  readonly automationSmoothingPercent = () =>
    Math.round(this.automationSmoothing() * 100);
  clipActionsOpen = signal(false);
  overviewZoom = signal(1);

  readonly arrangementTools: Array<{
    id: ArrangementTool;
    label: string;
    icon: string;
  }> = [
    { id: "select", label: "Select", icon: "near_me" },
    { id: "draw", label: "Draw", icon: "edit" },
    { id: "split", label: "Split", icon: "content_cut" },
    { id: "trim", label: "Trim", icon: "compare_arrows" },
    { id: "slip", label: "Slip", icon: "swap_horiz" },
    { id: "duplicate", label: "Duplicate", icon: "content_copy" },
    { id: "glue", label: "Glue", icon: "join_full" },
    { id: "crossfade", label: "X-Fade", icon: "compare_arrows" },
  ];

  setEditMode(mode: ArrangementTool): void {
    this.editMode.set(mode);
    this.activeTool.set(
      mode === "split" ? "blade" : mode === "glue" ? "glue" : "select",
    );
    this.haptic.light();
  }

  editModeLabel(): string {
    return (
      this.arrangementTools.find((tool) => tool.id === this.editMode())
        ?.label ?? "Select"
    );
  }

  openClipActions(): void {
    if (this.selectedClipIds().size > 0) this.clipActionsOpen.set(true);
  }

  closeClipActions(): void {
    this.clipActionsOpen.set(false);
  }

  setOverviewZoom(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.overviewZoom.set(Math.max(0.5, Math.min(2, value)));
    this.barWidth.set(Math.round(200 * this.overviewZoom()));
    this.markDirty();
  }

  seekFromOverview(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / rect.width),
    );
    this.seekToStep(this.stepAtBar(ratio * Math.max(1, this.effectiveBars())));
  }

  private seekToStep(step: number): void {
    if (this.audioSession.isRecording() || this.engine?.isRecording?.() || this.engine?.isCountIn?.()) {
      this.snackbar.info("Stop recording or count-in before seeking");
      return;
    }
    const position = this.engine?.seekToStep(step);
    if (position === null || position === undefined) return;
    this.musicManager.currentStep.set(position);
    this.markDirty();
  }

  laneHeight = signal(80);
  barWidth = signal(200);
  rulerHeight = 32;

  @ViewChild("gridViewport") gridViewport!: ElementRef<HTMLDivElement>;
  @ViewChild("glCanvas") glCanvas!: ElementRef<HTMLCanvasElement>;

  /** Timeline floor: the classic 4-bar x 16 view, no longer a ceiling. */
  private static readonly MIN_TIMELINE_BARS = 64;
  /** Empty bars kept after the last event so there is always somewhere to draw. */
  private static readonly TIMELINE_TAIL_BARS = 8;
  /** Extra bars requested from the "+ 16 BARS" timeline control. */
  extraTimelineBars = signal(0);

  /** Last bar that holds a clip or note (or the song boundary), rounded up. */
  readonly songEndBar = computed(() => {
    let end = 0;
    for (const track of this.tracks()) {
      for (const clip of track.clips ?? []) {
        end = Math.max(end, (clip.start ?? 0) + Math.max(0.001, clip.length ?? 4));
      }
      for (const note of track.notes ?? []) {
        end = Math.max(
          end,
          this.barCountForStep((note.step ?? 0) + (note.length ?? 0)),
        );
      }
    }
    return Math.ceil(end);
  });

  /** Rendered timeline length in bars: content, plus room to keep drawing. */
  readonly totalBars = computed(() =>
    Math.max(
      ArrangementViewComponent.MIN_TIMELINE_BARS,
      this.effectiveBars(),
      this.songEndBar() + ArrangementViewComponent.TIMELINE_TAIL_BARS,
      this.extraTimelineBars(),
    ),
  );

  bars = computed(() => Array.from({ length: this.totalBars() }, (_, i) => i));
  playheadPos = computed(
    () => this.barPositionAtStep(this.musicManager.currentStep()) * this.barWidth(),
  );
  readonly currentBar = computed(() =>
    this.barAtStep(this.musicManager.currentStep()),
  );
  readonly overviewPlayheadPercent = computed(() => {
    const bars = Math.max(1, this.effectiveBars());
    return Math.max(
      0,
      Math.min(100, (this.barPositionAtStep(this.musicManager.currentStep()) / bars) * 100),
    );
  });

  private barAtStep(step: number): number {
    return this.engine?.barAtStep?.(step) ?? Math.floor(step / 16);
  }

  private barPositionAtStep(step: number): number {
    return this.engine?.barPositionAtStep?.(step) ?? step / 16;
  }

  private stepAtBar(bar: number): number {
    return this.engine?.stepAtBar?.(bar) ?? Math.round(bar * 16);
  }

  private barCountForStep(step: number): number {
    return Math.max(1, this.engine?.barCountForStep?.(step) ?? Math.ceil(step / 16));
  }

  // Sprint A4: Song-Mode UI surface.
  // Defensive optional-chaining so tests that stub `musicManager` without
  // an `engine` field don't crash (defaulting to a sane 'song'/'64'-bar view).
  readonly engine = this.musicManager?.engine;
  readonly playMode = computed(() => this.engine?.playMode?.() ?? "song");
  readonly effectiveBars = computed(() =>
    Math.max(
      1,
      this.barCountForStep(this.engine?.effectiveLoopLength?.() ?? 64),
    ),
  );
  readonly songEnded = computed(() => this.engine?.songEnded?.() ?? false);
  togglePlayMode(): void {
    if (!this.engine?.setPlayMode) return;
    const next = this.engine.playMode() === "song" ? "pattern" : "song";
    this.engine.setPlayMode(next);
    this.haptic?.medium?.();
  }
  acknowledgeSongEnded(): void {
    this.engine?.songEnded?.set?.(false);
  }

  showAutomation = signal(false);

  // ── Lifecycle ────────────────────────────────────────────

  ngAfterViewInit(): void {
    this.initWebGL();
    this.stopVisualTask = this.visualScheduler.register(
      () => this.renderTimelineIfNeeded(),
      { fps: 30 },
    );
  }

  ngOnDestroy(): void {
    this.stopVisualTask?.();
    this.stopVisualTask = null;
    this.glRenderer?.destroy();
  }

  private initWebGL(): void {
    try {
      this.glRenderer = new WebGLRenderer();
      this.glRenderer.initialize(this.glCanvas.nativeElement);
      this.timelineRenderer = new TimelineRenderer(this.glRenderer);
      this.isGlInitialized = true;
      this.markDirty();
    } catch (e) {
      console.warn(
        "WebGL init failed — arrangement view will fall back to DOM",
        e,
      );
    }
  }

  // ── Shared render loop ───────────────────────────────────

  private renderTimelineIfNeeded(): void {
    if (!this.isGlInitialized) return;
    const isPlaying = this.audioSession.isPlaying();
    if (isPlaying || this.glRenderer.isDirty) {
      this.renderTimeline();
    }
  }

  private markDirty(): void {
    this.glRenderer?.markDirty();
  }

  private renderTimeline(): void {
    const canvas = this.glCanvas?.nativeElement;
    const viewport = this.gridViewport?.nativeElement;
    if (!canvas || !viewport || !this.isGlInitialized) return;

    const dpr = window.devicePixelRatio || 1;
    const vpW = viewport.clientWidth;
    const vpH = viewport.clientHeight;

    // Resize if needed
    if (
      canvas.width !== Math.round(vpW * dpr) ||
      canvas.height !== Math.round(vpH * dpr)
    ) {
      this.glRenderer.resize();
    }

    const ppb = this.barWidth();
    this.timelineRenderer.setPixelsPerBar(ppb);

    // The canvas is CSS-width gridWidth() and lives inside this scrolling
    // viewport, so native scrolling already positions it. The renderer camera
    // must NOT pan by the scroll offset as well: doing so double-counted the
    // scroll, so scrolled timelines drew every clip/beat at ~2x the scroll
    // distance and `screenToWorld` resolved taps to the wrong bar. The offset
    // stays at zero (only zoom is meaningful here).
    const camera = {
      scrollX: 0,
      scrollY: 0,
      zoom: 1.0,
    };

    // Build timeline tracks from MusicManager tracks
    const visibleTracks = this.tracks().filter(
      (t) =>
        !t.parentId ||
        !this.tracks().find((p) => p.id === t.parentId)?.collapsed,
    );

    const tlTracks: TimelineTrack[] = [];
    const tlClips: TimelineClip[] = [];
    let y = this.rulerHeight;

    for (const track of visibleTracks) {
      const th = this.laneHeight();
      tlTracks.push({
        id: track.id,
        name: track.name,
        y,
        height: th,
        muted: !!track.muted,
        soloed: !!track.soloed,
      });

      for (const clip of track.clips) {
        const color = clipColorFromId(clip.id);
        const clipLen = Math.max(0.001, clip.length || 4);
        tlClips.push({
          id: clip.id,
          x: clip.start || 0,
          y,
          width: clipLen,
          height: th,
          color,
          label: clip.name || track.name,
          selected: this.selectedClipIds().has(clip.id),
          isCrosslinked: this.isClipCrosslinked(track, clip),
          type: (clip.type as TimelineClip["type"]) || "midi",
          // Phase F2 — fade lengths as fractions of the clip width so the
          // renderer can draw wedges that scale with zoom.
          fadeIn: clip.type === "audio" ? (clip.fadeIn || 0) / clipLen : 0,
          fadeOut: clip.type === "audio" ? (clip.fadeOut || 0) / clipLen : 0,
        });
      }
      y += th;
    }

    const totalBars = this.totalBars();
    const playheadBar = this.barPositionAtStep(this.musicManager.currentStep() || 0);

    this.glRenderer.clear(0.02, 0.04, 0.09, 1.0);
    this.timelineRenderer.render(
      tlClips,
      tlTracks,
      playheadBar,
      totalBars,
      camera,
      this.rulerHeight,
    );
  }

  // ── Pointer / interaction handlers (WebGL-aware) ─────────

  // ── Audio drops ────────────────────────────────────────────────────────
  // Importing audio used to mean leaving the timeline for the sample browser
  // or the stem splitter. Dropping a file on the arrangement is how every DAW
  // takes audio in, and it lands at the bar you dropped it on.

  /** Accept the drag only for real files, so clip drags are untouched. */
  onAudioDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types?.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  async onAudioDrop(event: DragEvent): Promise<void> {
    const files = Array.from(event.dataTransfer?.files ?? []).filter(
      isSupportedAudioFile,
    );
    if (!files.length) return;
    event.preventDefault();

    const bar = this.dropBarFor(event);
    let added = 0;
    for (const file of files) {
      try {
        const buffer = await this.decodeDroppedFile(file);
        if (!buffer) continue;
        this.musicManager.addAudioTrack({
          id: "audio_" + Date.now() + "_" + added,
          name: droppedAudioName(file.name),
          color: "#0E7C7B",
          buffer,
          offset: bar,
        });
        added++;
      } catch (error) {
        this.logger.warn(
          "Arrangement: dropped audio could not be decoded",
          error,
        );
      }
    }

    if (added === 0) {
      this.snackbar.error("That file could not be read as audio.");
      return;
    }
    this.haptic.light();
    this.snackbar.success(
      added === 1
        ? `Audio added at bar ${bar + 1}`
        : `${added} audio tracks added at bar ${bar + 1}`,
    );
  }

  /** Bar under the cursor, falling back to the start when GL is not ready. */
  private dropBarFor(event: DragEvent): number {
    if (!this.isGlInitialized || !this.glCanvas?.nativeElement) return 0;
    const rect = this.glCanvas.nativeElement.getBoundingClientRect();
    const world = this.glRenderer.screenToWorld(
      event.clientX,
      event.clientY,
      rect,
    );
    return dropBarFromWorldX(world.x, this.barWidth());
  }

  private async decodeDroppedFile(file: File): Promise<AudioBuffer | null> {
    const ctx = this.musicManager.engine?.ctx;
    if (!ctx?.decodeAudioData) return null;
    const bytes = await file.arrayBuffer();
    return await new Promise<AudioBuffer>((resolve, reject) => {
      // The callback form is the one every WebView ships; the promise form is
      // newer and not guaranteed on Android System WebView.
      ctx.decodeAudioData(bytes, resolve, reject);
    });
  }

  /** Handle pointer down on the WebGL grid */
  onGridPointerDown(e: PointerEvent): void {
    if (!this.isGlInitialized) return;
    const canvas = this.glCanvas.nativeElement;
    const viewport = this.gridViewport.nativeElement;
    const rect = canvas.getBoundingClientRect();

    const world = this.glRenderer.screenToWorld(e.clientX, e.clientY, rect);

    // Account for viewport scroll
    const barX = world.x / this.barWidth();
    const rulerH = this.rulerHeight;

    if (world.y < rulerH) {
      // Clicked on ruler area — seek playhead
      const seekBar = Math.max(0, barX);
      const seekStep = Math.round(seekBar * 16);
      this.seekToStep(seekStep);
      return;
    }

    // Determine which track lane was clicked
    const visibleTracks = this.tracks().filter(
      (t) =>
        !t.parentId ||
        !this.tracks().find((p) => p.id === t.parentId)?.collapsed,
    );
    let y = rulerH;
    let hitTrack: TrackModel | null = null;

    for (const track of visibleTracks) {
      const th = this.laneHeight();
      if (world.y >= y && world.y < y + th) {
        hitTrack = track;
        break;
      }
      y += th;
    }

    if (!hitTrack) return;

    // Check if we hit a clip in the track
    const hitClip = hitTrack.clips.find((clip) => {
      const cs = clip.start || 0;
      const cl = clip.length || 4;
      return barX >= cs && barX < cs + cl;
    });

    if (hitClip) {
      this.onClipPointerDown(e, hitTrack.id, hitClip, barX);
    } else {
      this.onLanePointerDownWorld(hitTrack, barX);
    }
  }

  /** Handle scroll wheel for zoom */
  onGridWheel(e: WheelEvent): void {
    if (!e.ctrlKey && !e.metaKey) return; // Only zoom with Ctrl+wheel
    e.preventDefault();
    // Zoom via barWidth adjustment
    const delta = e.deltaY > 0 ? -20 : 20;
    this.barWidth.update((v) => Math.max(40, Math.min(600, v + delta)));
    this.markDirty();
  }

  /** Clip hit test and gesture start from the WebGL timeline. */
  onClipPointerDown(e: PointerEvent, trackId: string, clip: StudioClip, barX = clip.start) {
    e.stopPropagation();
    this.selectTrack(trackId);
    if (this.activeTool() === "glue") {
      const next = new Set(
        Array.from(this.selectedClipIds()).filter(
          (id) => this.findClipOwner(id)?.track.id === trackId,
        ),
      );
      next.add(clip.id);
      this.selectedClipIds.set(next);
      this.markDirty();
      if (next.size > 1) this.consolidateSelected();
      return;
    }
    if (!e.shiftKey) this.selectedClipIds.set(new Set([clip.id]));
    else {
      const next = new Set(this.selectedClipIds());
      if (next.has(clip.id)) next.delete(clip.id);
      else next.add(clip.id);
      this.selectedClipIds.set(next);
    }

    if (this.editMode() === 'crossfade') {
      if (e.button !== 0 || e.shiftKey) return;
      const pair = this.findCrossfadePair(trackId, clip.id);
      if (!pair) {
        this.snackbar.info(
          "X-Fade needs two overlapping audio clips on the same track",
        );
        return;
      }
      this.selectedClipIds.set(
        new Set([pair.left.clip.id, pair.right.clip.id]),
      );
      const target = e.currentTarget as HTMLElement | null;
      target?.setPointerCapture?.(e.pointerId);
      this.activeClipGesture = {
        pointerId: e.pointerId,
        clipId: clip.id,
        trackId,
        mode: 'crossfade',
        startClientX: e.clientX,
        initialStart: clip.start,
        initialLength: clip.length,
        initialOffset: clip.offset ?? 0,
        changed: false,
        crossfadeLeftId: pair.left.clip.id,
        crossfadeRightId: pair.right.clip.id,
        crossfadeOverlap: pair.overlap,
        crossfadeBarAtDown: barX,
        crossfadeFade: this.clampCrossfadeBars(
          barX - pair.right.clip.start,
          pair.overlap,
        ),
      };
      return;
    }

    if (e.button !== 0 || e.shiftKey || this.editMode() === 'split') {
      if (this.editMode() === 'split') this.musicManager.splitClip(trackId, clip.id, barX);
      this.markDirty();
      return;
    }
    if (this.editMode() === 'duplicate') {
      this.musicManager.addClipToTrack(trackId, {
        ...clip,
        id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        start: clip.start + clip.length,
      });
      this.markDirty();
      return;
    }
    if (!['select', 'draw', 'trim', 'slip'].includes(this.editMode())) return;
    const mode = this.editMode() === 'trim'
      ? (barX < clip.start + clip.length / 2 ? 'trim-start' : 'trim-end')
      : this.editMode() === 'slip' ? 'slip' : 'move';
    const target = e.currentTarget as HTMLElement | null;
    target?.setPointerCapture?.(e.pointerId);
    this.activeClipGesture = {
      pointerId: e.pointerId,
      clipId: clip.id,
      trackId,
      mode,
      startClientX: e.clientX,
      initialStart: clip.start,
      initialLength: clip.length,
      initialOffset: clip.offset ?? 0,
      changed: false,
    };
  }

  onGridPointerMove(e: PointerEvent): void {
    const gesture = this.activeClipGesture;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    const delta = (e.clientX - gesture.startClientX) / Math.max(1, this.barWidth());
    const snapped = this.snapEnabled() ? Math.round(delta * 4) / 4 : delta;

    if (gesture.mode === 'crossfade') {
      const left = gesture.crossfadeLeftId
        ? this.findClipOwner(gesture.crossfadeLeftId)
        : null;
      const right = gesture.crossfadeRightId
        ? this.findClipOwner(gesture.crossfadeRightId)
        : null;
      if (!left || !right) return;
      const pointerBar = (gesture.crossfadeBarAtDown ?? 0) + snapped;
      const fade = this.clampCrossfadeBars(
        pointerBar - right.clip.start,
        gesture.crossfadeOverlap ?? 0,
      );
      if (Math.abs(fade - (gesture.crossfadeFade ?? 0)) < 0.001) return;
      this.writeCrossfade(left, right, fade);
      gesture.crossfadeFade = fade;
      gesture.changed = true;
      this.markDirty();
      return;
    }

    const clip = this.findClipOwner(gesture.clipId)?.clip;
    if (!clip) return;
    const patch: Partial<StudioClip> = {};
    if (gesture.mode === 'move') {
      patch.start = Math.max(0, gesture.initialStart + snapped);
    } else if (gesture.mode === 'trim-start') {
      const start = Math.max(0, Math.min(gesture.initialStart + snapped, gesture.initialStart + gesture.initialLength - 0.25));
      const shift = start - gesture.initialStart;
      patch.start = start;
      patch.length = gesture.initialLength - shift;
      if (clip.type === 'audio') {
        const secondsPerBar = 60 / this.musicManager.engine.tempo() * 4;
        if (clip.clipStreamer) {
          patch.clipOriginSeconds = Math.max(0, (clip.clipOriginSeconds ?? 0) + shift * secondsPerBar);
        } else {
          patch.offset = Math.max(0, gesture.initialOffset + shift * secondsPerBar);
        }
      }
    } else if (gesture.mode === 'trim-end') {
      patch.length = Math.max(0.25, gesture.initialLength + snapped);
    } else if (clip.type === 'audio') {
      const secondsPerBar = 60 / this.musicManager.engine.tempo() * 4;
      if (clip.clipStreamer) {
        patch.clipOriginSeconds = Math.max(0, (clip.clipOriginSeconds ?? 0) + snapped * secondsPerBar);
      } else {
        patch.offset = Math.max(0, gesture.initialOffset + snapped * secondsPerBar);
      }
    }
    this.ensureTimelineCovers(
      (patch.start ?? clip.start) + (patch.length ?? clip.length),
    );
    const changed = Object.entries(patch).some(([key, value]) => Math.abs(Number((clip as any)[key] ?? 0) - Number(value ?? 0)) > 0.001);
    if (!changed) return;
    this.musicManager.updateClip(gesture.trackId, gesture.clipId, patch);
    gesture.changed = true;
    this.markDirty();
  }

  /** Grow the timeline by whole bars so a song can run past the classic 64. */
  extendTimeline(bars = 16): void {
    this.extraTimelineBars.update(
      (current) => Math.max(current, this.totalBars()) + Math.max(1, Math.round(bars)),
    );
  }

  /** Make sure the timeline reaches `endBar` before a clip is placed there. */
  private ensureTimelineCovers(endBar: number): void {
    const needed =
      Math.ceil(endBar) + ArrangementViewComponent.TIMELINE_TAIL_BARS;
    if (needed > this.totalBars()) this.extraTimelineBars.set(needed);
  }

  onGridPointerUp(e: PointerEvent): void {
    const gesture = this.activeClipGesture;
    if (gesture?.pointerId !== e.pointerId) return;
    if (gesture.mode === 'crossfade' && gesture.changed) {
      const left = gesture.crossfadeLeftId
        ? this.findClipOwner(gesture.crossfadeLeftId)
        : null;
      const right = gesture.crossfadeRightId
        ? this.findClipOwner(gesture.crossfadeRightId)
        : null;
      this.haptic.medium();
      this.snackbar.show(
        `🎚 Crossfade ${this.formatFade(gesture.crossfadeFade ?? 0)} · ${
          left?.clip.name || "clip"
        } → ${right?.clip.name || "clip"}`,
      );
    } else if (gesture.changed) {
      this.haptic.light();
    }
    this.activeClipGesture = null;
  }

  /** Lane click to create clips from WebGL */
  onLanePointerDownWorld(track: TrackModel, barX: number) {
    this.selectTrack(track.id);

    if (this.editMode() === 'crossfade') {
      this.snackbar.info(
        "Drag across two overlapping audio clips on this track to draw a crossfade",
      );
      return;
    }

    if (this.editMode() === 'draw') {
      const bar = this.snapEnabled() ? Math.round(barX * 4) / 4 : barX;
      this.musicManager.addClipToTrack(track.id, {
        start: Math.max(0, bar),
        length: 4,
        type: track.type === 'midi' || track.type === 'drum' ? 'midi' : 'audio',
      });
      this.ensureTimelineCovers(bar + 4);
      this.haptic.light();
      this.markDirty();
      return;
    }

    if (this.activeTool() === "select") {
      let bar = barX;
      if (this.snapEnabled()) bar = Math.floor(bar * 4) / 4;

      this.musicManager.addClipToTrack(track.id, {
        start: bar,
        length: 4,
        type: track.type === "midi" || track.type === "drum" ? "midi" : "audio",
      });
      this.haptic.light();
      this.markDirty();
    }
  }

  // Legacy DOM lane handler (kept for backwards compat)
  onLanePointerDown(e: PointerEvent, track: TrackModel) {
    // Deprecated — canvas handles this now
    this.onGridPointerDown(e);
  }

  // ── Existing methods (unchanged behavior) ────────────────

  addMarker(name: string) {
    const time = this.musicManager.currentStep() / 16;
    this.markerService.add(name, time);
  }

  removeMarker(id: string) {
    this.markerService.remove(id);
  }

  toggleAutomationView() {
    this.showAutomation.update((v) => !v);
  }

  createGroup() {
    if (this.musicManager.addTrack("New Group", "none", "bus")) {
      this.markDirty();
    }
  }

  selectTrack(id: string) {
    this.musicManager.selectedTrackId.set(id);
  }

  isTrackSelected(id: string) {
    return this.musicManager.selectedTrackId() === id;
  }

  toggleMute(id: string, e: Event) {
    e.stopPropagation();
    this.musicManager.toggleMute(id);
  }

  toggleSolo(id: string, e: Event) {
    e.stopPropagation();
    this.musicManager.toggleSolo(id);
  }

  /**
   * Duplicate a whole track below itself. No confirmation is needed: unlike
   * removing a track this destroys nothing, and one Ctrl+Z takes the copy away.
   */
  duplicateTrack(id: string, e?: Event) {
    e?.stopPropagation();
    if (!this.musicManager.duplicateTrack(id)) return;
    this.haptic.light();
  }

  async removeTrack(id: string, e: Event) {
    e.stopPropagation();
    // In-app dialog rather than `window.confirm`: a native modal freezes the
    // WebView on Android, and where the host does not implement it, it returns
    // false — so this destructive action silently did nothing on those devices.
    const track = this.tracks().find((t) => t.id === id);
    const approved = await this.dialog.confirm({
      title: "Delete track",
      message: `Delete "${track?.name ?? "this track"}" and everything on it?`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (approved) this.musicManager.removeTrack(id);
  }

  toggleTakes(id: string, e: Event) {
    e.stopPropagation();
    this.musicManager.takesExpanded.update((v) => ({ ...v, [id]: !v[id] }));
  }

  /**
   * Sprint A3 — rows this track's expanded take lane shows: the max of the
   * legacy audio-clip take count and the TakeManagerService MIDI take count.
   */
  takeLaneRows(track: TrackModel): number {
    const clipTakes = track.clips?.[0]?.takes?.length ?? 0;
    const midiTakes = this.takeManager.getTakes(track.id)().length;
    return Math.max(clipTakes, midiTakes);
  }

  toggleSnap() {
    this.snapEnabled.update((v) => !v);
  }

  addTrack() {
    if (this.musicManager.addTrack("New Track", "grand-piano")) {
      this.markDirty();
    }
  }

  /**
   * Zoom level the pinch started from, used to convert the gesture service's
   * accumulated zoom into a delta on the timeline's own barWidth.
   */
  private pinchZoomRef = 1;

  onGridTouchStart(event: TouchEvent) {
    if (event.touches.length === 2) {
      this.pinchZoomRef = this.enhancedGestures.zoomLevel();
      this.enhancedGestures.handlePinch(event);
    }
  }

  onGridTouchMove(event: TouchEvent) {
    if (event.touches.length === 2) {
      event.preventDefault();
      this.enhancedGestures.handlePinch(event);
      // The gesture service tracked the pinch, but the timeline is laid out
      // from barWidth — so a pinch used to zoom nothing at all on touch
      // devices. Fold the accumulated pinch zoom into barWidth between the
      // same 40-600px clamps the wheel zoom uses.
      const zoom = this.enhancedGestures.zoomLevel();
      const ratio = this.pinchZoomRef > 0 ? zoom / this.pinchZoomRef : 1;
      if (ratio !== 1) {
        this.barWidth.update((v) =>
          Math.max(40, Math.min(600, Math.round(v * ratio))),
        );
        this.pinchZoomRef = zoom;
        this.markDirty();
      }
    }
  }

  /**
   * Releasing the fingers must clear the pinch reference span, otherwise the
   * next two-finger gesture is measured against the previous one's distance and
   * jumps on its first frame.
   */
  onGridTouchEnd() {
    this.enhancedGestures.resetPinch();
    this.pinchZoomRef = this.enhancedGestures.zoomLevel();
  }

  /** Snapshot the selected clips onto the service clipboard. */
  copyClips(): void {
    const entries: ClipClipboardEntry[] = [];
    this.selectedClipIds().forEach((id) => {
      const found = this.findClipOwner(id);
      if (!found) return;
      const snapshot: Omit<StudioClip, "id"> & { id?: string } = {
        ...found.clip,
      };
      delete snapshot.id;
      entries.push({ clip: snapshot, sourceTrackId: found.track.id });
    });
    if (!this.musicManager.copyClips(entries)) return;
    this.haptic.light();
    this.snackbar.info(
      `Copied ${entries.length} clip${entries.length === 1 ? "" : "s"}`,
    );
    this.markDirty();
  }

  canPasteClips(): boolean {
    return this.musicManager.hasClipClipboard();
  }

  /** Paste onto the selected track, at the bar under the playhead. */
  pasteClips(): void {
    const trackId = this.musicManager.selectedTrackId();
    if (!trackId || !this.musicManager.hasClipClipboard()) return;
    const atBar = Math.max(0, Math.round(this.musicManager.currentStep() / 16));
    const pasted = this.musicManager.pasteClips(trackId, atBar);
    if (pasted.length === 0) return;
    // Leave the paste selected, like the piano roll does, so it can be dragged
    // straight into place.
    this.selectedClipIds.set(new Set(pasted));
    this.haptic.medium();
    this.snackbar.success(
      `Pasted ${pasted.length} clip${pasted.length === 1 ? "" : "s"}`,
    );
    this.markDirty();
  }

  /**
   * Clip-level keyboard editing. Duplicate falls back to the whole track when
   * no clip is selected, so one key covers whichever thing is pointed at.
   *
   * Guarded against text fields and modifier combos the shell owns; note that
   * the piano roll listens for Ctrl+D too, but only acts when it has a note
   * selection, so the two do not fire together in normal use.
   */
  /** Pointing at this view makes it the owner of the shared shortcuts. */
  @HostListener("pointerdown")
  onPointerActivity(): void {
    this.studioFocus.noteActivity("arrangement");
  }

  /**
   * Focus counts as pointing: a keyboard-only pass never fires pointerdown, so
   * without this the other view would keep the shortcut after tabbing in here.
   */
  @HostListener("focusin")
  onFocusActivity(): void {
    this.studioFocus.noteActivity("arrangement");
  }

  @HostListener("window:keydown", ["$event"])
  onArrangementKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.repeat || event.isComposing) return;
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable)
    ) {
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    if (!mod || event.altKey) return;
    const key = event.key.toLowerCase();

    // Shortcuts belong to the view the artist last touched; see
    // StudioFocusService for why listener order is not enough.
    if (!this.studioFocus.ownsShortcuts("arrangement")) return;
    if (key === "c") {
      if (this.selectedClipIds().size === 0) return;
      if (!claimKeyEvent(event)) return;
      event.preventDefault();
      this.copyClips();
      return;
    }
    if (key === "v") {
      if (!this.canPasteClips()) return;
      if (!claimKeyEvent(event)) return;
      event.preventDefault();
      this.pasteClips();
      return;
    }
    if (key === "d") {
      if (this.selectedClipIds().size > 0) {
        if (!claimKeyEvent(event)) return;
        event.preventDefault();
        this.duplicateSelected();
        return;
      }
      const trackId = this.musicManager.selectedTrackId();
      if (!trackId) return;
      if (!claimKeyEvent(event)) return;
      event.preventDefault();
      this.duplicateTrack(trackId);
    }
  }

  duplicateSelected() {
    const newSelection = new Set<string>();
    this.selectedClipIds().forEach((id) => {
      const found = this.findClipOwner(id);
      if (found) {
        const newId = "clip_" + Date.now() + Math.random();
        this.musicManager.addClipToTrack(found.track.id, {
          ...found.clip,
          id: newId,
          start: found.clip.start + found.clip.length,
        });
        newSelection.add(newId);
      }
    });
    this.selectedClipIds.set(newSelection);
    this.haptic.medium();
    this.markDirty();
  }

  canConsolidateSelection(): boolean {
    return this.getConsolidateSelection() !== null;
  }

  consolidateSelected() {
    const selection = this.getConsolidateSelection();
    if (!selection) {
      this.snackbar.info("Select 2+ clips on one track to glue");
      return;
    }

    const mergedClipId =
      this.musicManager.glueClips?.(selection.track.id, selection.clipIds) ??
      null;
    if (!mergedClipId) {
      this.snackbar.info(
        "Glue works on touching clips that share the same type/source",
      );
      return;
    }

    this.selectedClipIds.set(new Set([mergedClipId]));
    this.selectTrack(selection.track.id);
    this.haptic.medium();
    this.markDirty();
    this.snackbar.info(`Glued ${selection.clipIds.length} clips into 1`);
  }

  quantizeSelected(grid: number = 0.25) {
    let moved = 0;
    this.selectedClipIds().forEach((id) => {
      const found = this.findClipOwner(id);
      if (!found) return;
      const currentStart = found.clip.start || 0;
      const snappedStart = Math.round(currentStart / grid) * grid;
      if (Math.abs(snappedStart - currentStart) < 0.001) {
        return;
      }
      this.musicManager.updateClip?.(found.track.id, id, {
        start: snappedStart,
      });
      moved++;
    });

    if (moved === 0) {
      this.snackbar.info("Selected clips are already on the grid");
      return;
    }

    this.haptic.medium();
    this.markDirty();
    this.snackbar.info(
      `Quantized ${moved} clip${moved === 1 ? "" : "s"} to the grid`,
    );
  }

  clipLabel(track: StudioTrack, clip: StudioClip): string {
    return clip.name || track.name;
  }

  private findClipOwner(
    clipId: string,
  ): { track: TrackModel; clip: StudioClip } | null {
    for (const track of this.tracks()) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) return { track, clip };
    }
    return null;
  }

  private getConsolidateSelection(): {
    track: TrackModel;
    clipIds: string[];
  } | null {
    const ids = Array.from(this.selectedClipIds());
    if (ids.length < 2) return null;

    const owners = ids
      .map((id) => this.findClipOwner(id))
      .filter(
        (owner): owner is { track: TrackModel; clip: StudioClip } =>
          owner !== null,
      );
    if (owners.length !== ids.length) return null;

    const track = owners[0].track;
    if (owners.some((owner) => owner.track.id !== track.id)) return null;
    return { track, clipIds: owners.map((owner) => owner.clip.id) };
  }

  findFirstSelectedTrack(): TrackModel | null {
    const ids = this.selectedClipIds();
    if (ids.size === 0) {
      const id = this.musicManager.selectedTrackId();
      return id ? (this.tracks().find((t) => t.id === id) ?? null) : null;
    }
    return this.findClipOwner(ids.values().next().value ?? "")?.track ?? null;
  }

  findFirstSelectedClip(): StudioClip | null {
    const ids = this.selectedClipIds();
    if (ids.size === 0) return null;
    return this.findClipOwner(ids.values().next().value ?? "")?.clip ?? null;
  }

  splitAtPlayhead() {
    const bar = this.musicManager.currentStep() / 16;
    this.selectedClipIds().forEach((id) => {
      const found = this.findClipOwner(id);
      if (found) this.musicManager.splitClip(found.track.id, id, bar);
    });
    this.markDirty();
  }

  async bounceSelected() {
    const tid = this.musicManager.selectedTrackId();
    if (!tid) return;
    let result: Awaited<ReturnType<MusicManagerService["bounceTrack"]>>;
    try {
      result = await this.musicManager.bounceTrack(tid);
    } catch (err) {
      // A failed render must reach the artist, not reject into the void.
      this.logger.error("Track bounce failed", err);
      this.snackbar.show("🎚 Bounce failed — the track could not be rendered");
      return;
    }
    if (!result) {
      this.snackbar.show("🎚 Bounce failed — select a valid track");
      return;
    }
    const name =
      this.musicManager.selectedTrack?.()?.name ??
      this.tracks().find((t) => t.id === tid)?.name ??
      "track";
    // Hand the file off through our own handle on the rendered audio, so the
    // bounce result keeps the URL it exposes, and release ours once the browser
    // has taken the data.
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}-bounce.wav`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    this.snackbar.show(`🎚 Bounced "${name}" → ${result.format}`);
  }

  // ── Phase F2: Clip Trim / Fade / Delete (pro audio editing) ──

  /** Fade presets offered by the cycle button (bars). 0 = no fade. */
  readonly FADE_PRESETS = [0, 0.5, 1, 2];

  /**
   * Trim every selected clip by `deltaBars` on the given edge.
   * 'start' shrinks/grows the clip's left edge (start + length adjust),
   * 'end' adjusts the right edge (length only). Clamped so a clip can
   * never collapse below a quarter bar or start before bar 0.
   */
  trimSelected(edge: "start" | "end", deltaBars: number): void {
    const ids = Array.from(this.selectedClipIds());
    if (ids.length === 0) return;
    let changed = 0;
    ids.forEach((id) => {
      const found = this.findClipOwner(id);
      if (!found) return;
      const { track, clip } = found;
      const start = clip.start || 0;
      const length = clip.length || 4;
      let nextStart = start;
      let nextLength = length;

      if (edge === "start") {
        nextStart = Math.max(0, start + deltaBars);
        const actualDelta = nextStart - start;
        nextLength = Math.max(0.25, length - actualDelta);
      } else {
        nextLength = Math.max(0.25, length + deltaBars);
      }

      if (nextStart === start && nextLength === length) return;
      this.musicManager.updateClip(track.id, id, {
        start: nextStart,
        length: nextLength,
      });
      changed++;
    });
    if (changed > 0) {
      this.haptic.light();
      this.markDirty();
      this.snackbar.show(
        `✂ Trimmed ${changed} clip${changed === 1 ? "" : "s"} ${
          edge === "start" ? "left" : "right"
        }`,
      );
    }
  }

  /**
   * Cycle the fade-in/fade-out length (in bars) on selected audio clips:
   * 0 → 0.5 → 1 → 2 → 0. MIDI clips are skipped with a hint.
   */
  cycleFade(side: "in" | "out"): void {
    const ids = Array.from(this.selectedClipIds());
    if (ids.length === 0) return;
    let changed = 0;
    let skipped = 0;
    let nextVal = 0;
    ids.forEach((id) => {
      const found = this.findClipOwner(id);
      if (!found) return;
      const { track, clip } = found;
      if (clip.type !== "audio") {
        skipped++;
        return;
      }
      const current = side === "in" ? clip.fadeIn || 0 : clip.fadeOut || 0;
      const idx = this.FADE_PRESETS.indexOf(current);
      // Off-preset values (e.g. 0.3) advance to the first real preset instead
      // of silently resetting to 0.
      const next =
        idx === -1
          ? (this.FADE_PRESETS[1] ?? 0)
          : this.FADE_PRESETS[(idx + 1) % this.FADE_PRESETS.length];
      if (changed === 0) nextVal = next;
      this.musicManager.updateClip(track.id, id, {
        [side === "in" ? "fadeIn" : "fadeOut"]: next,
      });
      changed++;
    });
    if (changed > 0) {
      this.haptic.medium();
      this.markDirty();
      this.snackbar.show(
        `🎚 Fade-${side === "in" ? "in" : "out"} → ${this.formatFade(
          nextVal,
        )} on ${changed} clip${changed === 1 ? "" : "s"}`,
      );
    } else if (skipped > 0) {
      this.snackbar.info("Fades apply to audio clips only");
    }
  }

  /**
   * The best overlapping audio partner for `clipId` on one track.
   *
   * The earlier clip is `left` and the later one is `right`; `overlap` is the
   * shared bar range. The X-Fade tool and the toolbar action both use this so
   * one tap and one drag cannot disagree about which pair is being edited.
   */
  private findCrossfadePair(trackId: string, clipId: string): {
    left: { track: TrackModel; clip: StudioClip };
    right: { track: TrackModel; clip: StudioClip };
    overlap: number;
  } | null {
    const track = this.tracks().find((candidate) => candidate.id === trackId);
    const clip = track?.clips.find((candidate) => candidate.id === clipId);
    if (!track || !clip || clip.type !== "audio") return null;

    let best: {
      left: { track: TrackModel; clip: StudioClip };
      right: { track: TrackModel; clip: StudioClip };
      overlap: number;
    } | null = null;
    for (const other of track.clips) {
      if (other.id === clip.id || other.type !== "audio") continue;
      const [left, right] =
        clip.start <= other.start ? [clip, other] : [other, clip];
      const overlap =
        Math.min(left.start + left.length, right.start + right.length) -
        right.start;
      if (overlap <= 0 || (best && best.overlap >= overlap)) continue;
      best = {
        left: { track, clip: left },
        right: { track, clip: right },
        overlap,
      };
    }
    return best;
  }

  /** Clamp a drawn crossfade to the actual overlap, snapped to ¼ bar. */
  private clampCrossfadeBars(bars: number, overlap: number): number {
    const limit = Math.max(0, overlap);
    if (limit <= 0) return 0;
    const snapped = this.snapEnabled() ? Math.round(bars * 4) / 4 : bars;
    return Math.max(Math.min(0.25, limit), Math.min(limit, snapped));
  }

  /** Write the same equal-power fade pair used by both crossfade gestures. */
  private writeCrossfade(
    left: { track: TrackModel; clip: StudioClip },
    right: { track: TrackModel; clip: StudioClip },
    fade: number,
  ): void {
    this.musicManager.updateClip(left.track.id, left.clip.id, {
      fadeOut: fade,
      fadeCurve: "equalPower",
    });
    this.musicManager.updateClip(right.track.id, right.clip.id, {
      fadeIn: fade,
      fadeCurve: "equalPower",
    });
  }

  /**
   * Crossfade exactly two overlapping audio clips on the same track.
   *
   * The overlap is the shared time range; the earlier clip fades out across
   * it and the later clip fades in, so the hand-off is equal-power at the
   * centre instead of a hard cut. Requires two audio clips; MIDI clips have
   * no waveform to cross.
   */
  crossfadeSelected(): void {
    const ids = Array.from(this.selectedClipIds());
    if (ids.length !== 2) {
      this.snackbar.info("Select two overlapping audio clips to crossfade");
      return;
    }
    const first = this.findClipOwner(ids[0]);
    const second = this.findClipOwner(ids[1]);
    if (!first || !second || first.track.id !== second.track.id) {
      this.snackbar.info("Crossfade needs two clips on the same track");
      return;
    }
    if (first.clip.type !== "audio" || second.clip.type !== "audio") {
      this.snackbar.info("Crossfade applies to audio clips only");
      return;
    }

    const [left, right] =
      first.clip.start <= second.clip.start
        ? [first, second]
        : [second, first];
    const overlap =
      Math.min(
        left.clip.start + left.clip.length,
        right.clip.start + right.clip.length,
      ) - right.clip.start;
    if (overlap <= 0) {
      this.snackbar.info("Move the clips so they overlap, then crossfade");
      return;
    }

    this.writeCrossfade(left, right, overlap);
    this.haptic.medium();
    this.markDirty();
    this.snackbar.show(
      `🎚 Crossfade ${this.formatFade(overlap)} · ${left.clip.name || "clip"} → ${right.clip.name || "clip"}`,
    );
  }

  /** Fade value (bars) of the first selected clip, 0 when none. */
  firstSelectedFade(side: "in" | "out"): number {
    const clip = this.findFirstSelectedClip();
    if (!clip || clip.type !== "audio") return 0;
    return side === "in" ? clip.fadeIn || 0 : clip.fadeOut || 0;
  }

  /** Human label for a fade length in bars (0 = none). */
  formatFade(bars: number): string {
    if (!bars || bars <= 0) return "none";
    return bars === 0.5 ? "½ bar" : `${bars} bar${bars === 1 ? "" : "s"}`;
  }

  /** Pin the current tempo at the playhead's bar from the arrangement lane. */
  addTempoHere(): void {
    const bar = Math.floor(this.musicManager.currentStep() / STEPS_PER_BAR);
    this.addTempoMarkerAt(
      bar * STEPS_PER_BAR,
      this.musicManager.engine.tempo(),
    );
  }

  private addTempoMarkerAt(step: number, bpm: number): void {
    const marker = this.tempoMap.addMarker(step, bpm);
    if (!marker) {
      this.snackbar.info("Tempo must be between 20 and 300 BPM");
      return;
    }
    this.haptic.light();
    this.snackbar.show(
      `⏱ Tempo ${marker.bpm} BPM pinned at bar ${this.tempoMap.barOf(marker)}`,
    );
  }

  /** Tap an empty part of the lane to add a tempo point at that bar. */
  onTempoLanePointerDown(event: PointerEvent): void {
    const target = event.target as Element | null;
    if (target?.closest?.(".arrangement-tempo-marker, button, input")) return;
    const lane = event.currentTarget as HTMLElement | null;
    const rect = lane?.getBoundingClientRect();
    if (!rect?.width) return;
    const totalSteps = Math.max(1, this.totalBars()) * STEPS_PER_BAR;
    const step = this.snapTempoStep(
      ((event.clientX - rect.left) / rect.width) * totalSteps,
    );
    const existing = this.tempoMap.markers().find((marker) => marker.step === step);
    if (existing) {
      this.seekToTempoMarker(existing.step);
      this.snackbar.info(`Tempo already pinned at bar ${this.tempoMap.barOf(existing)}`);
      return;
    }
    this.addTempoMarkerAt(step, this.tempoMap.bpmAtStep(step));
  }

  /** Begin dragging a tempo point; horizontal movement retimes it. */
  startTempoDrag(event: PointerEvent, marker: TempoMarker): void {
    if (event.button > 0) return;
    const handle = event.currentTarget as HTMLElement | null;
    const lane = handle?.closest(".arrangement-tempo-track") as HTMLElement | null;
    const rect = lane?.getBoundingClientRect();
    if (!rect?.width) return;
    event.preventDefault();
    event.stopPropagation();
    handle?.setPointerCapture?.(event.pointerId);
    this.suppressTempoSeek = false;
    this.activeTempoDrag = {
      pointerId: event.pointerId,
      markerId: marker.id,
      startClientX: event.clientX,
      initialStep: marker.step,
      lastStep: marker.step,
      laneWidth: rect.width,
      moved: false,
    };
  }

  onTempoDragMove(event: PointerEvent): void {
    const drag = this.activeTempoDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const totalSteps = Math.max(1, this.totalBars()) * STEPS_PER_BAR;
    const step = this.snapTempoStep(
      drag.initialStep +
        ((event.clientX - drag.startClientX) / drag.laneWidth) * totalSteps,
    );
    if (step === drag.lastStep) return;
    if (!this.retimeTempoMarker(drag.markerId, step, true)) return;
    drag.lastStep = step;
    drag.moved = true;
  }

  onTempoDragEnd(event: PointerEvent): void {
    const drag = this.activeTempoDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const handle = event.currentTarget as HTMLElement | null;
    if (handle?.hasPointerCapture?.(drag.pointerId)) {
      handle.releasePointerCapture(drag.pointerId);
    }
    if (drag.moved) {
      const marker = this.tempoMap
        .markers()
        .find((candidate) => candidate.id === drag.markerId);
      if (marker) {
        this.haptic.light();
        this.snackbar.show(
          `⏱ Tempo ${marker.bpm} BPM moved to bar ${this.tempoMap.barOf(marker)}`,
        );
      }
      this.suppressTempoSeek = true;
    }
    this.activeTempoDrag = null;
  }

  /** Arrow keys retime a focused tempo point by one beat. */
  onTempoDragKey(event: KeyboardEvent, marker: TempoMarker): void {
    const delta =
      event.key === "ArrowLeft" ? -4 : event.key === "ArrowRight" ? 4 : 0;
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    if (!this.retimeTempoMarker(marker.id, this.snapTempoStep(marker.step + delta))) {
      return;
    }
    this.haptic.light();
    const moved = this.tempoMap
      .markers()
      .find((candidate) => candidate.id === marker.id);
    if (moved) {
      this.snackbar.info(
        `Tempo ${moved.bpm} BPM at bar ${this.tempoMap.barOf(moved)}`,
      );
    }
  }

  private retimeTempoMarker(id: string, step: number, quiet = false): boolean {
    const marker = this.tempoMap.markers().find((candidate) => candidate.id === id);
    if (!marker || marker.step === step) return false;
    if (
      this.tempoMap
        .markers()
        .some((candidate) => candidate.id !== id && candidate.step === step)
    ) {
      if (!quiet) this.snackbar.info("A tempo change already exists at that bar");
      return false;
    }
    this.tempoMap.updateMarker(id, { step });
    return true;
  }

  private snapTempoStep(step: number): number {
    const maxStep = Math.max(
      0,
      Math.max(1, this.totalBars()) * STEPS_PER_BAR - 4,
    );
    return Math.max(0, Math.min(maxStep, Math.round(step / 4) * 4));
  }

  /** Commit a BPM typed directly on a timeline tempo point. */
  setTempoMarkerBpm(marker: TempoMarker, event: Event): void {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < 20 || value > 300) {
      input.value = String(marker.bpm);
      this.snackbar.info("Tempo must be between 20 and 300 BPM");
      return;
    }
    const bpm = Math.round(value * 10) / 10;
    this.tempoMap.updateMarker(marker.id, { bpm });
    this.haptic.light();
    this.snackbar.info(`Tempo ${bpm} BPM at bar ${this.tempoMap.barOf(marker)}`);
  }

  removeTempoMarker(id: string, event: Event): void {
    event.stopPropagation();
    this.tempoMap.removeMarker(id);
    this.haptic.light();
  }

  /** Toggle a marker between a hard tempo change and a continuous glide. */
  toggleTempoCurve(marker: { id: string; curve?: 'step' | 'ramp' }, event: Event): void {
    event.stopPropagation();
    this.tempoMap.toggleCurve(marker.id);
    this.haptic.light();
    this.snackbar.info(
      marker.curve === 'ramp'
        ? 'Tempo change set to step'
        : 'Tempo automation ramp enabled',
    );
  }

  seekToTempoMarker(step: number): void {
    if (this.suppressTempoSeek) {
      this.suppressTempoSeek = false;
      return;
    }
    this.musicManager.engine.seekToStep(step);
  }

  /** Marker position as a percentage of the arrangement's visible bars. */
  tempoMarkerLeft(step: number): number {
    const bars = Math.max(1, this.totalBars());
    return Math.max(0, Math.min(100, (step / (STEPS_PER_BAR * bars)) * 100));
  }

  /** Vertical position of a tempo point, using the lane's current BPM range. */
  tempoMarkerTop(bpm: number): number {
    const { min, max } = this.tempoLaneRange();
    const ratio = max <= min ? 0.5 : (bpm - min) / (max - min);
    return Math.max(10, Math.min(90, 100 - ratio * 100));
  }

  tempoLaneMin(): number {
    return Math.round(this.tempoLaneRange().min);
  }

  tempoLaneMax(): number {
    return Math.round(this.tempoLaneRange().max);
  }

  /** SVG path for the tempo envelope; ramps become diagonals, steps verticals. */
  tempoLanePath(): string {
    const totalSteps = Math.max(1, this.totalBars()) * STEPS_PER_BAR;
    const x = (step: number) =>
      Math.max(0, Math.min(100, (step / totalSteps) * 100)).toFixed(3);
    const y = (bpm: number) => this.tempoMarkerTop(bpm).toFixed(3);
    const markers = [...this.tempoMap.markers()].sort(
      (a, b) => a.step - b.step || a.bpm - b.bpm,
    );
    let current: { step: number; bpm: number; curve?: "step" | "ramp" } = {
      step: 0,
      bpm: this.tempoMap.bpmAtStep(0),
    };
    const first = markers[0];
    if (first && first.step <= 0) {
      current = { step: 0, bpm: first.bpm, curve: first.curve };
      markers.shift();
    }
    const commands = [`M 0 ${y(current.bpm)}`];
    for (const marker of markers) {
      if (current.curve === "ramp") {
        commands.push(`L ${x(marker.step)} ${y(marker.bpm)}`);
      } else {
        commands.push(
          `L ${x(marker.step)} ${y(current.bpm)}`,
          `L ${x(marker.step)} ${y(marker.bpm)}`,
        );
      }
      current = { step: marker.step, bpm: marker.bpm, curve: marker.curve };
    }
    commands.push(`L 100 ${y(current.bpm)}`);
    return commands.join(" ");
  }

  private tempoLaneRange(): { min: number; max: number } {
    const values = [
      this.tempoMap.bpmAtStep(0),
      ...this.tempoMap.markers().map((marker) => marker.bpm),
    ].filter((value) => Number.isFinite(value));
    let min = Math.min(...values, 120);
    let max = Math.max(...values, 120);
    if (max - min < 20) {
      min -= 10;
      max += 10;
    }
    const padding = Math.max(4, (max - min) * 0.1);
    min = Math.max(20, min - padding);
    max = Math.min(300, max + padding);
    if (max - min < 4) max = min + 4;
    return { min, max };
  }

  /** Pin the transport's current meter at the playhead's bar. */
  addMeterHere(): void {
    const bar = this.barAtStep(this.musicManager.currentStep());
    const signature = this.engine?.timeSignature?.() ?? { beats: 4, unit: 4 };
    this.addMeterMarkerAt(this.stepAtBar(bar), signature.beats, signature.unit);
  }

  private addMeterMarkerAt(step: number, beats: number, unit: number): void {
    const marker = this.meterMap.addMarker(step, beats, unit);
    if (!marker) {
      this.snackbar.info("Choose a valid time signature");
      return;
    }
    this.haptic.light();
    this.snackbar.show(
      `🎵 Meter ${marker.beats}/${marker.unit} pinned at bar ${this.meterBarOf(marker)}`,
    );
  }

  /** Tap an empty part of the meter lane to add a change at that bar. */
  onMeterLanePointerDown(event: PointerEvent): void {
    const target = event.target as Element | null;
    if (target?.closest?.(".arrangement-meter-marker, button, select, input")) {
      return;
    }
    const lane = event.currentTarget as HTMLElement | null;
    const rect = lane?.getBoundingClientRect();
    if (!rect?.width) return;
    const totalBars = Math.max(1, this.totalBars());
    const bar = Math.max(
      0,
      Math.min(
        totalBars - 1,
        Math.round(((event.clientX - rect.left) / rect.width) * totalBars),
      ),
    );
    const step = this.stepAtBar(bar);
    const existing = this.meterMap
      .markers()
      .find((marker) => marker.step === step);
    if (existing) {
      this.seekToMeterMarker(existing.step);
      this.snackbar.info(
        `Meter change already pinned at bar ${this.meterBarOf(existing)}`,
      );
      return;
    }
    const signature = this.engine?.timeSignature?.() ?? { beats: 4, unit: 4 };
    this.addMeterMarkerAt(step, signature.beats, signature.unit);
  }

  startMeterDrag(event: PointerEvent, marker: MeterMarker): void {
    if (event.button > 0) return;
    const handle = event.currentTarget as HTMLElement | null;
    const lane = handle?.closest(".arrangement-meter-track") as HTMLElement | null;
    const rect = lane?.getBoundingClientRect();
    if (!rect?.width) return;
    event.preventDefault();
    event.stopPropagation();
    handle?.setPointerCapture?.(event.pointerId);
    this.suppressMeterSeek = false;
    this.activeMeterDrag = {
      pointerId: event.pointerId,
      markerId: marker.id,
      startClientX: event.clientX,
      initialBar: this.barAtStep(marker.step),
      lastBar: this.barAtStep(marker.step),
      laneWidth: rect.width,
      moved: false,
    };
  }

  onMeterDragMove(event: PointerEvent): void {
    const drag = this.activeMeterDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const totalBars = Math.max(1, this.totalBars());
    const bar = Math.max(
      0,
      Math.min(
        totalBars - 1,
        Math.round(
          drag.initialBar +
            ((event.clientX - drag.startClientX) / drag.laneWidth) * totalBars,
        ),
      ),
    );
    if (bar === drag.lastBar) return;
    const step = this.stepAtBar(bar);
    if (!this.retimeMeterMarker(drag.markerId, step, true)) return;
    drag.lastBar = bar;
    drag.moved = true;
  }

  onMeterDragEnd(event: PointerEvent): void {
    const drag = this.activeMeterDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const handle = event.currentTarget as HTMLElement | null;
    if (handle?.hasPointerCapture?.(drag.pointerId)) {
      handle.releasePointerCapture(drag.pointerId);
    }
    if (drag.moved) {
      const marker = this.meterMap
        .markers()
        .find((candidate) => candidate.id === drag.markerId);
      if (marker) {
        this.haptic.light();
        this.snackbar.show(
          `🎵 Meter ${marker.beats}/${marker.unit} moved to bar ${this.meterBarOf(marker)}`,
        );
      }
      this.suppressMeterSeek = true;
    }
    this.activeMeterDrag = null;
  }

  /** Arrow keys move a meter point by one visual bar. */
  onMeterDragKey(event: KeyboardEvent, marker: MeterMarker): void {
    const delta =
      event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    const targetBar = Math.max(
      0,
      Math.min(
        Math.max(1, this.totalBars()) - 1,
        this.barAtStep(marker.step) + delta,
      ),
    );
    if (!this.retimeMeterMarker(marker.id, this.stepAtBar(targetBar))) {
      return;
    }
    this.haptic.light();
    const moved = this.meterMap
      .markers()
      .find((candidate) => candidate.id === marker.id);
    if (moved) {
      this.snackbar.info(
        `Meter ${moved.beats}/${moved.unit} at bar ${this.meterBarOf(moved)}`,
      );
    }
  }

  private retimeMeterMarker(id: string, step: number, quiet = false): boolean {
    const marker = this.meterMap.markers().find((candidate) => candidate.id === id);
    if (!marker || marker.step === step) return false;
    if (
      this.meterMap
        .markers()
        .some((candidate) => candidate.id !== id && candidate.step === step)
    ) {
      if (!quiet) this.snackbar.info("A meter change already exists at that bar");
      return false;
    }
    this.meterMap.updateMarker(id, { step });
    return true;
  }

  setMeterMarkerSignature(marker: MeterMarker, event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    if (!select) return;
    const [beats, unit] = select.value.split("/").map(Number);
    if (!Number.isFinite(beats) || !Number.isFinite(unit)) {
      select.value = this.meterMarkerLabel(marker);
      return;
    }
    this.meterMap.updateMarker(marker.id, { beats, unit });
    this.haptic.light();
    this.snackbar.info(
      `Meter ${beats}/${unit} at bar ${this.meterBarOf(marker)}`,
    );
  }

  removeMeterMarker(id: string, event: Event): void {
    event.stopPropagation();
    this.meterMap.removeMarker(id);
    this.haptic.light();
  }

  seekToMeterMarker(step: number): void {
    if (this.suppressMeterSeek) {
      this.suppressMeterSeek = false;
      return;
    }
    this.musicManager.engine.seekToStep(step);
  }

  meterMarkerLabel(marker: MeterMarker): string {
    return `${marker.beats}/${marker.unit}`;
  }

  private meterBarOf(marker: MeterMarker): number {
    return this.barAtStep(marker.step) + 1;
  }

  /** Meter-point position as a percentage of the visible bar grid. */
  meterMarkerLeft(step: number): number {
    const bars = Math.max(1, this.totalBars());
    return Math.max(
      0,
      Math.min(100, (this.barPositionAtStep(step) / bars) * 100),
    );
  }

  /** Delete all selected clips (history-aware). */
  deleteSelected(): void {
    const ids = Array.from(this.selectedClipIds());
    if (ids.length === 0) return;
    let removed = 0;
    ids.forEach((id) => {
      const found = this.findClipOwner(id);
      if (!found) return;
      this.musicManager.removeClip(found.track.id, id);
      removed++;
    });
    this.selectedClipIds.set(new Set());
    if (removed > 0) {
      this.haptic.medium();
      this.markDirty();
      this.snackbar.show(
        `🗑 Deleted ${removed} clip${removed === 1 ? "" : "s"}`,
      );
    }
  }

  /**
   * Ripple delete: remove the selected clips and close the time range they
   * occupied on every affected track, pulling later clips left so the edit
   * does not leave a silent hole. Clips that merely start inside the range
   * but were not selected are moved to its head, never deleted silently.
   */
  deleteSelectedRippled(): void {
    const ids = Array.from(this.selectedClipIds());
    if (ids.length === 0) return;

    const spans = new Map<string, { start: number; end: number }>();
    const removed = new Set<string>();
    ids.forEach((id) => {
      const found = this.findClipOwner(id);
      if (!found) return;
      const start = Number(found.clip.start ?? 0);
      const end = start + Math.max(0, Number(found.clip.length ?? 0));
      const span = spans.get(found.track.id);
      spans.set(found.track.id, {
        start: span ? Math.min(span.start, start) : start,
        end: span ? Math.max(span.end, end) : end,
      });
      removed.add(id);
    });
    if (removed.size === 0) return;

    removed.forEach((id) => {
      const found = this.findClipOwner(id);
      if (found) this.musicManager.removeClip(found.track.id, id);
    });

    let moved = 0;
    spans.forEach((span, trackId) => {
      const width = Math.max(0, span.end - span.start);
      if (width <= 0) return;
      const track = this.tracks().find((candidate) => candidate.id === trackId);
      (track?.clips ?? []).forEach((clip) => {
        if (removed.has(clip.id)) return;
        const start = Number(clip.start ?? 0);
        if (start < span.start) return;
        const next = Math.max(span.start, start - width);
        if (next === start) return;
        this.musicManager.updateClip(trackId, clip.id, { start: next });
        moved++;
      });
    });

    this.selectedClipIds.set(new Set());
    this.haptic.medium();
    this.markDirty();
    this.snackbar.show(
      `↩ Ripple deleted ${removed.size} clip${removed.size === 1 ? "" : "s"}` +
        (moved > 0 ? ` · moved ${moved}` : ""),
    );
  }

  // ── Pattern-per-clip editing ─────────────────────────────────────

  /** A MIDI/drum clip can reference a pattern; audio clips cannot. */
  selectedClipIsPatternable(): boolean {
    const clip = this.findFirstSelectedClip();
    return !!clip && clip.type !== "audio";
  }

  /** Pattern slot id the selected clip references (null = live pattern). */
  selectedClipPatternId(): string | null {
    const clip = this.findFirstSelectedClip();
    return clip?.patternSlotId ?? null;
  }

  /**
   * Options for the clip's pattern select: the track's slots plus a leading
   * "live pattern" entry for clips that follow the working pattern.
   */
  patternOptionsForSelectedClip(): { id: string; label: string }[] {
    const track = this.findFirstSelectedTrack();
    const options: { id: string; label: string }[] = [
      { id: "", label: "◆ Live pattern" },
    ];
    (track?.patternSlots ?? []).forEach((slot) => {
      options.push({ id: slot.id, label: slot.name });
    });
    return options;
  }

  /** Human label for a pattern slot id (used in tooltips). */
  patternSlotLabel(slotId: string | null): string | null {
    if (!slotId) return null;
    const track = this.findFirstSelectedTrack();
    return track?.patternSlots?.find((s) => s.id === slotId)?.name ?? slotId;
  }

  /** Re-point the selected clip at another pattern (empty = live). */
  onSelectedClipPatternChange(slotId: string): void {
    const track = this.findFirstSelectedTrack();
    const clip = this.findFirstSelectedClip();
    if (!track || !clip) return;
    this.musicManager.setClipPattern(
      track.id,
      clip.id,
      slotId === "" ? null : slotId,
    );
    this.haptic.light();
    this.markDirty();
  }

  /**
   * Capture the track's CURRENT pattern into a fresh slot and point the
   * selected clip at it — the FL-style "paint variations along the song"
   * loop: edit pattern → capture → draw clip → edit again.
   */
  newPatternFromSelection(): void {
    const track = this.findFirstSelectedTrack();
    if (!track) {
      this.snackbar.info("Select a clip first");
      return;
    }
    const slotId = this.musicManager.createPatternSlot(track.id);
    if (!slotId) return;
    const clip = this.findFirstSelectedClip();
    if (clip && clip.type !== "audio") {
      this.musicManager.setClipPattern(track.id, clip.id, slotId);
    }
    this.haptic.medium();
    this.markDirty();
    this.snackbar.show(
      `🎼 Pattern captured · new slot selected on "${track.name}"`,
    );
  }

  crossLinkToPianoRoll(track: TrackModel, clip: StudioClip) {
    this.selectTrack(track.id);
    const selectedIds = new Set(this.selectedClipIds());
    selectedIds.add(clip.id);
    this.selectedClipIds.set(selectedIds);
    const startStep = this.stepAtBar(Math.max(0, clip.start || 0));
    const endStep = Math.max(
      startStep + 1,
      this.stepAtBar((clip.start || 0) + (clip.length || 4)),
    );
    this.musicManager.requestCrossLink({
      view: "piano-roll",
      trackId: track.id,
      noteRange: { startStep, endStep },
      label: clip.name || track.name,
    });
    this.haptic.medium();
  }

  isClipCrosslinked(track: TrackModel, clip: StudioClip): boolean {
    const req = this.musicManager.crossLinkRequest();
    if (!req || req.trackId !== track.id) return false;
    if (!req.noteRange) return false;
    const startStep = this.stepAtBar(clip.start || 0);
    const endStep = this.stepAtBar((clip.start || 0) + (clip.length || 4));
    return (
      startStep <= req.noteRange.endStep && endStep >= req.noteRange.startStep
    );
  }

  aiVariation() {
    this.haptic.impact("heavy");
    const track = this.tracks().find(
      (t) => t.id === this.musicManager.selectedTrackId(),
    );
    if (track && track.notes.length > 0) {
      this.musicManager.humanizeTrack(track.id);
      this.musicManager.addAutomationLane(track.id, "cutoff");
    }
  }

  aiSuggestArrangement() {
    this.haptic.impact("heavy");
    this.duplicateSelected();
    if (this.musicManager.addTrack("AI Pad", "glass-pad", "midi")) {
      this.markDirty();
    }
  }

  aiMixTransition() {
    this.haptic.impact("heavy");
    const tid = this.musicManager.selectedTrackId();
    if (tid) {
      this.musicManager.updateVolume(tid, 0);
      setTimeout(() => this.musicManager.updateVolume(tid, 0.8), 2000);
    }
  }

  toggleAutomation() {
    this.haptic.medium();
    const armed = !this.automation.writeEnabled();
    this.automation.setWriteEnabled(armed);
    if (armed) {
      const track = this.tracks().find(
        (t) => t.id === this.musicManager.selectedTrackId(),
      );
      this.snackbar.info(
        `Automation write armed${track ? " · " + track.name : ""} — move a fader or pan while the song plays`,
      );
    } else {
      this.snackbar.info("Automation write off — curves play back as drawn");
    }
  }

  setAutomationMode(mode: "touch" | "latch") {
    this.automation.setWriteMode(mode);
    this.haptic.light();
    this.snackbar.info(
      mode === "touch"
        ? "Automation write: touch — release to stop writing"
        : "Automation write: latch — the last value keeps writing",
    );
  }

  setAutomationSmoothing(event: Event) {
    const percent = Number((event.target as HTMLInputElement).value);
    this.automation.setWriteSmoothing(percent / 100);
  }

  toggleGroup(trackId: string) {
    this.musicManager.tracks.update((ts) =>
      ts.map((t) => {
        if (t.id === trackId || t.parentId === trackId) {
          return { ...t, collapsed: !t.collapsed };
        }
        return t;
      }),
    );
    this.markDirty();
  }

  // ── Stem Splitter ────────────────────────────────────────

  openStemSplit(): void {
    this.stemOpen.set(true);
    this.stemProgress.set(0);
    this.stemStems.set(null);
    this.stemFileName.set(null);
    this.stemStage.set(null);
  }

  closeStemSplit(): void {
    this.stemOpen.set(false);
  }

  async onStemFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.stemBusy.set(true);
    this.stemFileName.set(file.name);
    this.stemProgress.set(15);
    this.snackbar.show("🎚 Stem Split · decoding " + file.name);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = this.musicManager.engine.ctx;
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      this.stemProgress.set(45);
      this.snackbar.show("🎚 Stem Split · spectral decomposition");
      const stems = await this.stemSvc.separate(audioBuffer, (update) => {
        this.stemStage.set(update.label);
        this.stemProgress.set(10 + Math.round(update.progress * 0.85));
      });
      this.stemStems.set(stems);
      this.stemProgress.set(100);
      this.stemStage.set("Stems Ready");
      this.snackbar.show("🎚 Stem Split · 4 stems ready");
    } catch (err: any) {
      console.error("Stem split failed", err);
      this.snackbar.show(
        "🎚 Stem Split failed: " + (err?.message ?? "unknown"),
      );
    } finally {
      this.stemBusy.set(false);
      input.value = "";
    }
  }

  applyStems(): void {
    const stems = this.stemStems();
    if (!stems) return;
    this.musicManager.addStemsAsAudioTracks(stems as any);
    this.snackbar.show("🎚 4 Stem Tracks added");
    this.closeStemSplit();
  }

  canvasHeight() {
    return this.tracks().length * this.laneHeight() + this.rulerHeight;
  }

  gridWidth() {
    return this.totalBars() * this.barWidth();
  }
}
