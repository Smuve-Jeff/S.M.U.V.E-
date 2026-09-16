import { LoggingService } from '../../services/logging.service';
import {
  Component,
  signal,
  inject,
  ViewChild,
  ElementRef,
  OnDestroy,
  effect,
  AfterViewInit,
  computed,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../services/ai.service';
import { UserContextService } from '../../services/user-context.service';
import {
  BeatTick,
  ClipFilter,
  ClipTransition,
  DeliveryPreset,
  MIN_ACTIVE_CLIP_DURATION,
  ProductionMode,
  SceneMarker,
  VideoEngineService,
  VideoClip,
} from '../../services/video-engine.service';
import { ExportService } from '../../services/export.service';
import { CinemaProjectService } from '../../services/cinema-project.service';
import { CameraCaptureService } from '../../services/camera-capture.service';
import {
  CinemaCommand,
  CinemaDirectorService,
  ShotPlanShot,
} from '../../services/cinema-director.service';
import { SpeechRecognitionService } from '../../services/speech-recognition.service';
import {
  LIVE_STREAM_PLATFORMS,
  LiveStreamPlatform,
  LiveStreamService,
} from '../../services/live-stream.service';

interface ProductionDirective {
  title: string;
  detail: string;
}

const MIN_TRANSITION_ALPHA = 0.15;
const HUD_FX_LINE_Y = 60;
const AI_CLIP_DURATION_MOVIE = 10;
const AI_CLIP_DURATION_OTHER = 6;
/** Real-time capture windows offered for the canvas video export. */
const EXPORT_WINDOW_OPTIONS = [5, 10, 30, 60];
const DEFAULT_EXPORT_WINDOW = 10;
/** Longest edge of a captured camera still, in px. */
const CAMERA_STILL_MAX_WIDTH = 1920;
/** Sub-millisecond delta — closer than any real frame boundary, so skip the seek. */
const EXACT_SEEK_EPSILON_SECONDS = 0.001;
/**
 * Drift tolerated while a clip is *playing* before the element is re-seeked.
 * Correcting on every frame would fight the decoder and stutter; scrubbing is
 * always exact.
 */
const PLAYING_DRIFT_TOLERANCE_SECONDS = 0.12;
/** Timeline scale at 100% zoom: 10px per second. */
const TIMELINE_BASE_PX_PER_SECOND = 10;
/** One 30fps frame — the step the arrow keys scrub by. */
const FRAME_STEP_SECONDS = 1 / 30;
/** Ruler density cap: past this, the beat grid steps up by whole bars. */
const MAX_RULER_TICKS = 120;
/** Countdown length when the host fires the broadcast cue. */
const BROADCAST_CUE_SECONDS = 3;
/**
 * Longest edge of the program monitor's backing store, in px. The monitor used
 * to keep the browser default 300×150 buffer, so the live camera feed and every
 * clip were composited into a thumbnail and stretched to fit the preview — which
 * reads as a broken camera — and the video export captured that thumbnail as
 * its "master". Capped so a 4K preset does not make every frame a full-
 * resolution repaint.
 */
const PREVIEW_MAX_EDGE = 1920;

interface PlayheadDragState {
  pointerId: number;
  originLeft: number;
}

interface ClipDragState {
  pointerId: number;
  clipId: string;
  originX: number;
  originStartTime: number;
  moved: boolean;
}

@Component({
  selector: 'app-image-video-lab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './image-video-lab.component.html',
  styleUrls: ['./image-video-lab.component.css'],
})
export class ImageVideoLabComponent implements OnDestroy, AfterViewInit {
  private logger = inject(LoggingService);
  private aiService = inject(AiService);
  private userContext = inject(UserContextService);
  public videoEngine = inject(VideoEngineService);
  private exportService = inject(ExportService);
  public camera = inject(CameraCaptureService);
  public director = inject(CinemaDirectorService);
  private speechRecognition = inject(SpeechRecognitionService);
  public liveStream = inject(LiveStreamService);
  public cinemaProjects = inject(CinemaProjectService);

  @ViewChild('previewCanvas') previewCanvas!: ElementRef<HTMLCanvasElement>;
  /** Live camera sink kept decoding behind the monitor (see the CSS note). */
  @ViewChild('cameraFeed') cameraFeed?: ElementRef<HTMLVideoElement>;
  /** Scroll container that owns the timeline viewport window. */
  @ViewChild('timelineScroller') timelineScroller?: ElementRef<HTMLElement>;

  imagePrompt = signal('');
  // probe
  isGenerating = signal(false);
  isExporting = signal(false);
  generatedImageUrl = signal<string | null>(null);
  highQualityEnhancer = signal(false);
  selectedFilter = signal<ClipFilter>('cinematic');
  selectedTransition = signal<ClipTransition>('fade');
  transitionDuration = signal(0.5);
  trimAmount = signal(0);
  /** Seconds of real-time timeline captured per video export. */
  exportWindow = signal(DEFAULT_EXPORT_WINDOW);
  exportProgress = signal(0);
  cameraTakeCount = signal(0);
  /** Clip under edit — the target of split / duplicate / delete / lane moves. */
  selectedClipId = signal<string | null>(null);
  /** Voice direction: the transcript is matched against cinema commands. */
  voiceEnabled = signal(false);
  voiceTranscript = signal<string | null>(null);
  /** Fallback command line for browsers without speech recognition. */
  commandInput = signal('');
  livePlatform = signal<LiveStreamPlatform>('youtube');
  markerDraft = signal('');
  readonly livePlatforms = LIVE_STREAM_PLATFORMS;
  readonly exportWindowOptions = EXPORT_WINDOW_OPTIONS;

  /** Visible window of the timeline, tracked from the scroll container. */
  private readonly timelineViewport = signal({ start: 0, span: 60 });
  private playheadDrag: PlayheadDragState | null = null;
  private clipDrag: ClipDragState | null = null;

  activeDirectorTab = signal<'assets' | 'effects' | 'ai'>('assets');
  zoomLevel = signal(1.0);
  productionModes: {
    id: ProductionMode;
    label: string;
    description: string;
  }[] = [
    {
      id: 'movie',
      label: 'Full-Length Movies',
      description:
        'Long-form cinematic timelines, score layers, and theatrical framing.',
    },
    {
      id: 'music',
      label: 'Music Videos',
      description:
        'Beat-locked cuts on the session tempo with section markers and performance coverage.',
    },
    {
      id: 'stream',
      label: 'Social Streaming',
      description:
        'Live overlays, audience-safe framing, and marathon broadcast sessions.',
    },
    {
      id: 'vlog',
      label: 'Vlogs',
      description:
        'Fast creator edits, story pacing, and mobile-first delivery presets.',
    },
  ];

  aiFeedback = signal(
    'S.M.U.V.E 2.0 Cinema Engine Offline. Initialize for executive visual capture.'
  );

  private canvasCtx: CanvasRenderingContext2D | null = null;
  private animFrame: number | null = null;
  /**
   * Decoded <img>/<video> elements keyed by clip url so the preview paints the
   * clip's real media instead of an abstract gradient.
   */
  private readonly mediaCache = new Map<
    string,
    HTMLImageElement | HTMLVideoElement
  >();
  /** Object URLs minted by this component (camera takes) — revoked on destroy. */
  private readonly ownedObjectUrls = new Set<string>();
  /**
   * Footage that arrived with a project opened this session, keyed by the id on
   * the clip. Clips made in this session are not listed here: their bytes are
   * still reachable through their own object url, and are read at save time.
   */
  private readonly mediaBlobs = new Map<string, Blob>();
  private mediaCounter = 0;
  activePreset = computed(() => this.videoEngine.deliveryPreset());
  productionBlueprint = computed(() => {
    const preset = this.activePreset();
    const clipCount = this.videoEngine
      .tracks()
      .reduce((total, track) => total + track.clips.length, 0);
    const workflow =
      preset.mode === 'movie'
        ? 'feature narrative'
        : preset.mode === 'music'
          ? 'beat-locked music video'
          : preset.mode === 'stream'
            ? 'live social broadcast'
            : 'creator vlog session';

    return {
      runtimeLabel: this.formatRuntime(preset.duration),
      targetLabel: preset.target,
      formatLabel: `${preset.aspectRatio} · ${preset.width}×${preset.height}`,
      laneLabel: `${this.videoEngine.tracks().length} lanes · ${clipCount} active clip${clipCount === 1 ? '' : 's'}`,
      summary: `S.M.U.V.E is staging a ${workflow} workflow with ${preset.name} as the active delivery master.`,
    };
  });
  productionDirectives = computed<ProductionDirective[]>(() => {
    const preset = this.activePreset();
    const directivesByMode: Record<ProductionMode, ProductionDirective[]> = {
      movie: [
        {
          title: 'Scene coverage',
          detail:
            'Map hero shots, inserts, and transition plates so the long-form story never loses continuity.',
        },
        {
          title: 'Score discipline',
          detail:
            'Use the global score lane for emotional arcs while dialogue and effects stay clean.',
        },
        {
          title: 'Delivery master',
          detail: `Protect ${preset.aspectRatio} framing and render for ${preset.target}.`,
        },
      ],
      music: [
        {
          title: 'Cut to the bar',
          detail: `The grid is locked to ${this.videoEngine.bpm().toFixed(1)} BPM — land scene changes on bar lines so the edit breathes with the song.`,
        },
        {
          title: 'Section coverage',
          detail:
            'Mark intro, verse, chorus and bridge, then give each section its own visual language.',
        },
        {
          title: 'Performance + B-roll',
          detail: `Alternate straight-to-camera takes with inserts and cut them for ${preset.target}.`,
        },
      ],
      stream: [
        {
          title: 'Overlay safe zone',
          detail:
            'Keep host framing inside the guide area so chat, widgets, and titles never cover key visuals.',
        },
        {
          title: 'Segment pacing',
          detail:
            'Structure the timeline into cold open, live core, and replay-ready cutdown sections.',
        },
        {
          title: 'Multi-platform cut',
          detail: `Capture a stream master and clip trims for ${preset.target}.`,
        },
      ],
      vlog: [
        {
          title: 'Hook early',
          detail:
            'Lead with the strongest visual moment in the first 5–10 seconds to improve retention.',
        },
        {
          title: 'B-roll rhythm',
          detail:
            'Alternate talking head clips with inserts, captions, and overlays to keep energy up.',
        },
        {
          title: 'Fast publish',
          detail: `Use ${preset.name} to keep edit-to-upload turnaround tight for ${preset.target}.`,
        },
      ],
    };

    return directivesByMode[preset.mode];
  });

  /** Single honest transport readout for the preview HUD. */
  transportLabel = computed(() => {
    if (this.camera.isRecording()) {
      return `REC ${this.camera.recordingSeconds()}s`;
    }
    if (this.camera.isLive()) return 'Camera Live';
    return this.videoEngine.isPlaying() ? 'Playing' : 'Standby';
  });
  transportActive = computed(
    () =>
      this.camera.isRecording() ||
      this.camera.isLive() ||
      this.videoEngine.isPlaying()
  );

  // ── Timeline geometry ──────────────────────────────────────────────────

  /** Real zoom: pixel density changes, the visible window follows the scroll. */
  pxPerSecond = computed(
    () => TIMELINE_BASE_PX_PER_SECOND * this.zoomLevel()
  );
  timelineWidthPx = computed(() =>
    Math.max(600, this.videoEngine.duration() * this.pxPerSecond())
  );

  /** Beat/bar lines for the visible window, thinned so the DOM stays light. */
  rulerTicks = computed<BeatTick[]>(() => {
    const { start, span } = this.timelineViewport();
    const ticks = this.videoEngine.beatTicks(start, start + span, MAX_RULER_TICKS);
    if (ticks.length > 0) return ticks;
    // Too dense (or zoomed far out): fall back to whole bars only.
    const bar = this.videoEngine.barSeconds();
    if (!Number.isFinite(bar) || bar <= 0) return [];
    const from = Math.max(0, start);
    const to = start + span;
    const lines: BeatTick[] = [];
    for (let barIndex = Math.ceil(from / bar); barIndex * bar <= to; barIndex += 1) {
      lines.push({ time: barIndex * bar, index: barIndex * 4, isBar: true });
      if (lines.length >= MAX_RULER_TICKS) break;
    }
    return lines;
  });

  /** Markers inside the visible window (a 2-hour film can hold hundreds). */
  visibleMarkers = computed<SceneMarker[]>(() => {
    const { start, span } = this.timelineViewport();
    const end = start + span;
    return this.videoEngine
      .sortedMarkers()
      .filter((marker) => marker.time >= start && marker.time <= end);
  });

  /** The clip currently under edit, re-read from the engine so it stays live. */
  selectedClip = computed<VideoClip | null>(() => {
    const id = this.selectedClipId();
    if (!id) return null;
    return this.videoEngine.findClip(id);
  });
  selectedClipLane = computed(
    () => this.selectedClip()?.trackId ?? null
  );
  /**
   * Shot length in bars.
   *
   * Bars are the unit a music-video cut is actually planned in, and the engine
   * already derived this with nothing asking for it — the toolbar reported
   * seconds only, which is the right unit for a film and the wrong one for a
   * cut that has to land on the song.
   */
  selectedClipBars = computed(() => {
    const clip = this.selectedClip();
    if (!clip) return '';
    const bars = this.videoEngine.barsForDuration(clip.duration);
    return `${bars} ${bars === 1 ? 'bar' : 'bars'}`;
  });
  clipCount = computed(() =>
    this.videoEngine.tracks().reduce((total, track) => total + track.clips.length, 0)
  );
  /** Total clips in a lane that no longer has room for the current playhead. */
  trackOptions = computed(() =>
    this.videoEngine.tracks().map((track) => ({
      id: track.id,
      name: track.name,
      locked: track.locked,
    }))
  );
  lowerThird = computed(() => this.videoEngine.lowerThird());
  countdownLabel = computed(() => this.videoEngine.countdownLabel());
  broadcastStream = computed(() => this.liveStream.currentStream());
  templates = [
    {
      name: 'Cinematic Noir',
      prompt: 'film noir style, high contrast, dramatic shadows',
    },
    {
      name: 'Vaporwave Dreams',
      prompt: '80s aesthetic, refined-glow pink and teal, lo-fi textures',
    },
    {
      name: 'pro-gradepunk Grit',
      prompt: 'futuristic city, rain-slicked streets, refined-glow lights',
    },
    {
      name: 'Ethereal Clouds',
      prompt: 'soft lighting, dreamlike atmosphere, pastel colors',
    },
  ];

  constructor() {
    effect(() => {
      const isPlaying = this.videoEngine.isPlaying();
      if (isPlaying) {
        this.aiFeedback.set('BROADCAST LIVE. Dominating the digital airwaves.');
      }
    });

    // Keep the video sink bound to whatever stream the camera service holds.
    effect(() => {
      void this.camera.stream();
      this.syncCameraElement();
    });

    // Switching delivery preset changes the aspect ratio, so the program
    // monitor's backing store has to follow it.
    effect(() => {
      void this.activePreset();
      this.syncPreviewResolution();
    });

    // Broadcast cue reaching zero is the one moment the transport rolls without
    // the operator touching anything — say so instead of rolling silently.
    effect(() => {
      const fired = this.videoEngine.cueFired();
      if (fired === 0) return;
      this.aiFeedback.set(
        'CUE FIRED. TRANSPORT ROLLING — BROADCAST IS LIVE, HOLD THE FRAME.'
      );
    });
  }

  ngAfterViewInit() {
    // Size the backing store before the context is created: assigning
    // `canvas.width` resets the 2D context.
    this.syncPreviewResolution();
    this.canvasCtx = this.previewCanvas.nativeElement.getContext('2d');
    this.syncCameraElement();
    this.syncTimelineViewport();
    this.startCanvasLoop();
  }

  /**
   * Give the program monitor a real resolution derived from the active delivery
   * preset. Without this the canvas keeps the default 300×150 backing store, so
   * the camera feed is composited into a thumbnail, the HUD/lower thirds are
   * scaled up until they are illegible, and the export master is 300×150.
   */
  private syncPreviewResolution(): void {
    const canvas = this.previewCanvas?.nativeElement;
    if (!canvas) return;
    const preset = this.activePreset();
    const ratio = this.resolveAspectRatio(preset);
    const width = Math.max(
      2,
      Math.min(PREVIEW_MAX_EDGE, preset.width || PREVIEW_MAX_EDGE)
    );
    const height = Math.max(2, Math.round(width / ratio));
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    // Re-acquiring is a no-op, but keeps the reference valid on hosts that
    // return a fresh context after a resize.
    this.canvasCtx = canvas.getContext('2d');
  }

  /** Numeric width:height for a preset, falling back to its declared pixels. */
  private resolveAspectRatio(preset: DeliveryPreset): number {
    const [rawWidth, rawHeight] = (preset.aspectRatio ?? '').split(':');
    const width = Number(rawWidth);
    const height = Number(rawHeight);
    if (width > 0 && height > 0) return width / height;
    if (preset.width > 0 && preset.height > 0) return preset.width / preset.height;
    return 16 / 9;
  }

  // ── Timeline viewport (zoom + scroll) ─────────────────────────────────

  /** Recompute the visible window from the scroll container's own geometry. */
  onTimelineScroll(event: Event): void {
    this.syncTimelineViewport(event.target as HTMLElement | null);
  }

  private syncTimelineViewport(el?: HTMLElement | null): void {
    const scroller = el ?? this.timelineScroller?.nativeElement;
    if (!scroller) return;
    const pxPerSecond = this.pxPerSecond();
    if (pxPerSecond <= 0) return;
    this.timelineViewport.set({
      start: scroller.scrollLeft / pxPerSecond,
      span: Math.max(1, scroller.clientWidth) / pxPerSecond,
    });
  }

  private timeAtClientX(clientX: number, rect: { left: number }): number {
    const pxPerSecond = this.pxPerSecond();
    if (pxPerSecond <= 0) return 0;
    return Math.max(
      0,
      Math.min(this.videoEngine.duration(), (clientX - rect.left) / pxPerSecond)
    );
  }

  /**
   * Click anywhere on a lane to move the playhead. The time comes from the
   * lane's own pixel density, so the mapping stays exact while scrolled or
   * zoomed instead of assuming the whole timeline fits the viewport.
   */
  seekFromTimelineEvent(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0) return;
    this.videoEngine.seek(this.timeAtClientX(event.clientX, rect));
  }

  /** Press-and-drag on the ruler scrubs the playhead continuously. */
  onRulerPointerDown(event: PointerEvent): void {
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;
    this.playheadDrag = {
      pointerId: event.pointerId,
      originLeft: target.getBoundingClientRect().left,
    };
    target.setPointerCapture?.(event.pointerId);
    this.videoEngine.seek(this.timeAtClientX(event.clientX, { left: this.playheadDrag.originLeft }));
  }

  onRulerPointerMove(event: PointerEvent): void {
    const drag = this.playheadDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this.videoEngine.seek(this.timeAtClientX(event.clientX, { left: drag.originLeft }));
  }

  onRulerPointerUp(event: PointerEvent): void {
    if (!this.playheadDrag || this.playheadDrag.pointerId !== event.pointerId) return;
    const target = event.currentTarget as HTMLElement | null;
    target?.releasePointerCapture?.(event.pointerId);
    this.playheadDrag = null;
  }

  /** Zoom out, keeping the visible window anchored on the playhead. */
  zoomOut(): void {
    this.applyZoom(Math.max(0.25, +(this.zoomLevel() * 0.8).toFixed(2)));
  }

  /** Zoom in, keeping the visible window anchored on the playhead. */
  zoomIn(): void {
    this.applyZoom(Math.min(4, +(this.zoomLevel() * 1.25).toFixed(2)));
  }

  private applyZoom(next: number): void {
    const anchor = this.videoEngine.currentTime();
    this.zoomLevel.set(next);
    // The lane re-lays out at the new scale on the next tick, so re-anchor then.
    setTimeout(() => {
      const scroller = this.timelineScroller?.nativeElement;
      if (!scroller) return;
      scroller.scrollLeft = Math.max(
        0,
        anchor * this.pxPerSecond() - scroller.clientWidth / 2
      );
      this.syncTimelineViewport(scroller);
    });
  }

  /** Centre the viewport on the playhead (used after big timeline jumps). */
  centerOnPlayhead(): void {
    const scroller = this.timelineScroller?.nativeElement;
    if (!scroller) return;
    scroller.scrollLeft = Math.max(
      0,
      this.videoEngine.currentTime() * this.pxPerSecond() - scroller.clientWidth / 2
    );
    this.syncTimelineViewport(scroller);
  }

  // ── Clip editing ──────────────────────────────────────────────────────

  selectClip(clipId: string): void {
    this.selectedClipId.set(clipId);
    const clip = this.videoEngine.findClip(clipId);
    if (clip) {
      this.aiFeedback.set(
        `CLIP SELECTED: ${clip.name.toUpperCase()} · ${clip.duration.toFixed(2)}s (SPLIT [S] · DUPLICATE [D] · DELETE)`
      );
    }
  }

  clearSelection(): void {
    this.selectedClipId.set(null);
  }

  onClipPointerDown(event: PointerEvent, clip: VideoClip): void {
    // Keep the lane's click-to-seek from firing under the clip drag.
    event.stopPropagation();
    this.selectClip(clip.id);
    const track = this.videoEngine.trackOfClip(clip.id);
    if (track?.locked) {
      this.aiFeedback.set(`LANE LOCKED: ${track.name.toUpperCase()} WILL NOT MOVE.`);
      return;
    }
    const target = event.currentTarget as HTMLElement | null;
    this.clipDrag = {
      pointerId: event.pointerId,
      clipId: clip.id,
      originX: event.clientX,
      originStartTime: clip.startTime,
      moved: false,
    };
    target?.setPointerCapture?.(event.pointerId);
  }

  onClipPointerMove(event: PointerEvent): void {
    const drag = this.clipDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.originX;
    if (Math.abs(deltaX) > 3) drag.moved = true;
    if (!drag.moved) return;
    const deltaSeconds = deltaX / this.pxPerSecond();
    this.videoEngine.moveClip(drag.clipId, {
      startTime: drag.originStartTime + deltaSeconds,
    });
  }

  onClipPointerUp(event: PointerEvent): void {
    const drag = this.clipDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const target = event.currentTarget as HTMLElement | null;
    target?.releasePointerCapture?.(event.pointerId);
    this.clipDrag = null;
    if (!drag.moved) return;
    const clip = this.videoEngine.findClip(drag.clipId);
    if (clip) {
      const snapped = this.videoEngine.snapToBeat() ? ' (SNAPPED TO BEAT)' : '';
      this.aiFeedback.set(
        `${clip.name.toUpperCase()} MOVED TO ${this.formatSeconds(clip.startTime)}${snapped}.`
      );
    }
  }

  /** Cut every unlocked clip under the playhead in two. */
  splitAtPlayhead(): void {
    const time = this.videoEngine.currentTime();
    const created = this.videoEngine.splitClipsAt(time);
    if (created.length === 0) {
      this.aiFeedback.set(
        'NOTHING TO CUT — PARK THE PLAYHEAD INSIDE A CLIP, NOT ON ITS EDGE.'
      );
      return;
    }
    this.selectedClipId.set(created[created.length - 1]);
    this.aiFeedback.set(
      `SPLIT: ${created.length} CLIP${created.length === 1 ? '' : 'S'} CUT AT ${this.formatSeconds(time)}.`
    );
  }

  duplicateSelectedClip(): void {
    const id = this.selectedClipId();
    if (!id) {
      this.aiFeedback.set('SELECT A CLIP FIRST, THEN DUPLICATE IT.');
      return;
    }
    const created = this.videoEngine.duplicateClip(id);
    if (!created) {
      this.aiFeedback.set('THAT CLIP CANNOT BE DUPLICATED (LOCKED LANE).');
      return;
    }
    this.selectedClipId.set(created);
    this.aiFeedback.set('CLIP DUPLICATED AND PLACED DIRECTLY AFTER THE ORIGINAL.');
  }

  deleteSelectedClip(): void {
    const id = this.selectedClipId();
    if (!id) {
      this.aiFeedback.set('SELECT A CLIP FIRST, THEN DELETE IT.');
      return;
    }
    this.videoEngine.removeClip(id);
    this.selectedClipId.set(null);
    this.aiFeedback.set('CLIP REMOVED FROM THE TIMELINE.');
  }

  /** Move the selected clip to another lane (overlays, voiceover, score…). */
  moveSelectedClipToLane(trackId: string): void {
    const id = this.selectedClipId();
    if (!id) return;
    const moved = this.videoEngine.moveClip(id, { trackId });
    const track = this.trackOptions().find((candidate) => candidate.id === trackId);
    this.aiFeedback.set(
      moved
        ? `CLIP MOVED TO THE ${(track?.name ?? trackId).toUpperCase()} LANE.`
        : 'THAT LANE IS LOCKED — CLIP STAYED PUT.'
    );
  }

  nudgeSelectedClip(offsetSeconds: number): void {
    const clip = this.selectedClip();
    if (!clip) return;
    this.videoEngine.moveClip(clip.id, {
      startTime: Math.max(0, clip.startTime + offsetSeconds),
    });
    const updated = this.videoEngine.findClip(clip.id);
    this.aiFeedback.set(
      `CLIP NUDGED TO ${this.formatSeconds(updated?.startTime ?? clip.startTime)}.`
    );
  }

  // ── Markers ──────────────────────────────────────────────────────────

  addMarkerAtPlayhead(): void {
    const label = this.markerDraft().trim();
    const kind = this.markerKindForMode();
    const id = this.videoEngine.addMarker(
      label || `${this.videoEngine.sortedMarkers().length + 1}`,
      this.videoEngine.currentTime(),
      kind
    );
    this.markerDraft.set('');
    const marker = this.videoEngine.markers().find((m) => m.id === id);
    this.aiFeedback.set(
      `MARKER DROPPED AT ${this.formatSeconds(marker?.time ?? 0)} — "${(marker?.label ?? '').toUpperCase()}".`
    );
  }

  removeMarker(markerId: string): void {
    this.videoEngine.removeMarker(markerId);
    this.aiFeedback.set('MARKER REMOVED.');
  }

  renameMarker(markerId: string, label: string): void {
    if (this.videoEngine.renameMarker(markerId, label)) {
      this.aiFeedback.set(`MARKER RENAMED TO "${label.toUpperCase()}".`);
    }
  }

  seekToMarker(markerId: string): void {
    if (!this.videoEngine.seekToMarker(markerId)) return;
    const marker = this.videoEngine.markers().find((m) => m.id === markerId);
    this.centerOnPlayhead();
    this.aiFeedback.set(
      `JUMPED TO "${(marker?.label ?? '').toUpperCase()}" AT ${this.formatSeconds(marker?.time ?? 0)}.`
    );
  }

  /** Step to the next/previous marker relative to the playhead. */
  seekRelativeMarker(direction: 1 | -1): void {
    const markers = this.videoEngine.sortedMarkers();
    if (markers.length === 0) {
      this.aiFeedback.set('NO MARKERS YET — DROP ONE AT THE PLAYHEAD FIRST.');
      return;
    }
    const time = this.videoEngine.currentTime();
    const tolerance = 0.05;
    const target =
      direction === 1
        ? markers.find((marker) => marker.time > time + tolerance)
        : [...markers].reverse().find((marker) => marker.time < time - tolerance);
    const fallback = direction === 1 ? markers[0] : markers[markers.length - 1];
    const next = target ?? fallback;
    this.videoEngine.seek(next.time);
    this.centerOnPlayhead();
    this.aiFeedback.set(
      `${direction === 1 ? 'NEXT' : 'PREVIOUS'} MARKER: "${next.label.toUpperCase()}" AT ${this.formatSeconds(next.time)}.`
    );
  }

  /**
   * Structure the whole timeline from the mode's skeleton: song sections for a
   * music video, acts for a feature, run-of-show for a broadcast. Existing
   * structure markers are replaced, hand-dropped scene markers are kept.
   */
  autoStructureTimeline(): void {
    const kind = this.markerKindForMode();
    const structure = this.director.sectionMap(
      this.videoEngine.productionMode(),
      this.videoEngine.duration(),
      this.videoEngine.bpm()
    );
    if (structure.length === 0) {
      this.aiFeedback.set('NO STRUCTURE TEMPLATE FOR THIS MODE.');
      return;
    }
    this.videoEngine.clearMarkers(kind);
    structure.forEach((marker) =>
      this.videoEngine.addMarker(marker.label, marker.time, marker.kind)
    );
    this.aiFeedback.set(
      `STRUCTURE LOCKED: ${structure.length} ${kind.toUpperCase()} MARKERS SPANNING ${this.formatRuntime(this.videoEngine.duration())}.`
    );
  }

  /** Re-lay every visuals clip onto consecutive bar boundaries. */
  autoCutToBeat(): void {
    const visuals = this.videoEngine.tracks().find((track) => track.id === 't1');
    if (!visuals || visuals.clips.length === 0) {
      this.aiFeedback.set('NOTHING ON THE VISUALS LANE TO CUT.');
      return;
    }
    const clips = [...visuals.clips].sort((a, b) => a.startTime - b.startTime);
    const cut = this.director.beatCutPlan(clips, {
      bpm: this.videoEngine.bpm(),
      startTime: 0,
      barsPerShot: 2,
    });
    let moved = 0;
    cut.forEach((entry) => {
      if (this.videoEngine.moveClip(entry.id, { startTime: entry.startTime })) {
        moved += 1;
      }
    });
    this.aiFeedback.set(
      moved > 0
        ? `BEAT CUT DEPLOYED: ${moved} CLIPS LOCKED TO ${this.videoEngine.bpm().toFixed(1)} BPM, TWO BARS PER SHOT.`
        : 'BEAT CUT BLOCKED — THE VISUALS LANE IS LOCKED.'
    );
  }

  private markerKindForMode(): 'scene' | 'act' | 'section' {
    return this.videoEngine.productionMode() === 'movie' ? 'act' : 'section';
  }

  // ── Capture recovery ───────────────────────────────────────────────────

  /**
   * Re-attempt a capture that failed while the operator was watching.
   *
   * Denials are frequently soft — a dismissed prompt, another app holding the
   * device, a permission re-enabled in settings a moment ago — so the failure
   * state gets its own one-tap way back instead of making the operator find
   * Start Camera and hope the blockage was not permanent. A sticky denial comes
   * back with the exact setting that has to change rather than another silent
   * failed attempt.
   */
  async retryCamera(): Promise<void> {
    if (this.camera.isRetrying()) return;

    this.aiFeedback.set('RE-REQUESTING CAPTURE ACCESS...');
    const restarted = await this.camera.retry();
    this.aiFeedback.set(
      restarted
        ? `CAPTURE RESTORED: ${this.camera.deviceName().toUpperCase()}. ${this.camera.statusDetail()}`
        : (this.camera.lastError() ?? 'CAPTURE COULD NOT RESTART.').toUpperCase()
    );
  }

  /**
   * Escape hatch for an embedded session.
   *
   * Permissions Policy is inherited from the embedding frame, so a module shown
   * inside one that was not granted `camera` / `display-capture` can never open a
   * capture device — no prompt appears and no retry can help. Opening the same
   * route as a top-level document is the one action that actually recovers it.
   */
  openCaptureInNewTab(): void {
    if (typeof window === 'undefined') return;

    const opened = window.open(window.location.href, '_blank', 'noopener');
    this.aiFeedback.set(
      opened
        ? 'CINEMAENGINE OPENED IN A NEW TAB — START CAPTURE THERE, WHERE THE FRAME CANNOT BLOCK IT.'
        : 'ALLOW POP-UPS FOR THIS SITE TO OPEN THE CAPTURE SURFACE IN ITS OWN TAB.'
    );
  }

  // ── Projects (long-form persistence) ──────────────────────────────────

  /**
   * Name used for the next save. Seeded from the active project so re-saving a
   * film does not silently fork a second copy of it under a blank title.
   */
  projectName = signal('');

  /** Save the current edit, creating a project the first time. */
  async saveProject(): Promise<void> {
    const footage = await this.collectTimelineMedia();
    const outcome = await this.cinemaProjects.save(
      this.projectName(),
      this.cinemaProjects.activeProjectId(),
      footage
    );
    if (outcome.ok) {
      const saved = this.cinemaProjects.activeProject();
      if (saved) this.projectName.set(saved.name);
      this.aiFeedback.set(outcome.message);
      return;
    }
    this.aiFeedback.set(outcome.message.toUpperCase());
  }

  /** Replace the current edit with a stored project. */
  async openProject(id: string): Promise<void> {
    const outcome = await this.cinemaProjects.open(id);
    if (outcome.ok) {
      const opened = this.cinemaProjects.activeProject();
      if (opened) this.projectName.set(opened.name);
      // Opening a project replaces the entire timeline, so everything decoded
      // for the project being closed is now dead weight.
      this.evictUnusedMedia();
      this.adoptStoredMedia(outcome.media);
    }
    this.aiFeedback.set(outcome.message.toUpperCase());
  }

  /**
   * Reattach footage that came back with a project.
   *
   * `restore()` leaves a clip whose url was a session-only `blob:` without one,
   * because the url died with the document that minted it. Stored bytes are what
   * survives, so the url is minted again here — for the clip that owns those
   * bytes, and only that clip, so two cuts of one take do not fight over a
   * single element's playback position later.
   */
  private adoptStoredMedia(media?: Map<string, Blob>): void {
    if (!media || media.size === 0) return;

    this.mediaBlobs.clear();
    media.forEach((blob, mediaId) => this.mediaBlobs.set(mediaId, blob));

    const urls = new Map<string, string>();
    this.videoEngine.tracks().forEach((track) =>
      track.clips.forEach((clip) => {
        if (clip.url || !clip.mediaId) return;
        const blob = media.get(clip.mediaId);
        if (!blob) return;
        let url = urls.get(clip.mediaId);
        if (!url) {
          url = URL.createObjectURL(blob);
          urls.set(clip.mediaId, url);
          this.ownedObjectUrls.add(url);
        }
        this.videoEngine.updateClip(clip.id, { url });
      })
    );
  }

  async deleteProject(id: string, event?: Event): Promise<void> {
    // The card itself opens the project; deleting must not also open it.
    event?.stopPropagation();
    const target = this.cinemaProjects
      .projects()
      .find((project) => project.id === id);
    const removed = await this.cinemaProjects.remove(id);
    this.aiFeedback.set(
      removed
        ? `PROJECT DELETED: ${(target?.name ?? 'PROJECT').toUpperCase()}.`
        : (
            this.cinemaProjects.lastError() ?? 'PROJECT COULD NOT BE DELETED.'
          ).toUpperCase()
    );
  }

  /**
   * Detach from the stored project. The timeline is left exactly as it is, so
   * this is "save as new", never a destructive reset.
   */
  startNewProject(): void {
    this.cinemaProjects.startNew();
    this.projectName.set('');
    this.aiFeedback.set(
      'NEW PROJECT. THE CURRENT EDIT STAYS ON THE TIMELINE UNTIL YOU SAVE IT.'
    );
  }

  // ── S.M.U.V.E director console ────────────────────────────────────────

  async generateShotPlan(): Promise<void> {
    const plan = await this.director.generateShotPlan({
      brief: this.director.brief(),
      mode: this.videoEngine.productionMode(),
      bpm: this.videoEngine.bpm(),
      durationSeconds: this.videoEngine.duration(),
      existingClipCount: this.clipCount(),
    });
    this.aiFeedback.set(this.director.plannerNote().toUpperCase());
    if (plan.origin === 'local') {
      this.logger.info('Cinema director produced a local shot plan', plan.title);
    }
  }

  /**
   * Cut the director's plan into the timeline as shot cards. Cards carry the
   * shot size and description, so the visuals lane shows what has to be shot
   * until real footage replaces each card.
   */
  stageShotPlan(): void {
    const plan = this.director.plan();
    if (!plan || plan.shots.length === 0) {
      this.aiFeedback.set('NO SHOT PLAN YET — ASK S.M.U.V.E FOR ONE FIRST.');
      return;
    }
    const replaced = this.videoEngine.clearTrack('t1');
    plan.shots.forEach((shot) => this.videoEngine.addClip('t1', this.shotClip(shot)));
    const runtime = this.formatSeconds(
      plan.shots[plan.shots.length - 1].startTime +
        plan.shots[plan.shots.length - 1].durationSeconds
    );
    this.aiFeedback.set(
      `SHOT LIST STAGED: ${plan.shots.length} SHOT CARDS ON THE VISUALS LANE (${runtime})${replaced ? ` · ${replaced} PREVIOUS CLIPS REPLACED` : ''}.`
    );
  }

  /** Assemble a timeline clip from a planned shot. */
  private shotClip(shot: ShotPlanShot): Omit<VideoClip, 'id' | 'trackId'> {
    return {
      name: `${String(shot.index).padStart(2, '0')} · ${shot.title}`,
      url: '',
      startTime: shot.startTime,
      duration: shot.durationSeconds,
      offset: 0,
      // No media yet: an overlay clip renders as a shot card, which is exactly
      // what a staged storyboard frame should look like.
      type: 'overlay',
      source: 'ai',
      note: shot.description,
      shotType: shot.size,
      effects: {
        upscale: this.highQualityEnhancer(),
        bgRemoval: false,
        noiseReduction: false,
        brightness: 1,
        contrast: 1,
        filter: this.selectedFilter(),
        transition: this.selectedTransition(),
        transitionDuration: this.transitionDuration(),
        trimStart: 0,
        trimEnd: 0,
      },
    };
  }

  clearShotPlan(): void {
    this.director.clearPlan();
    this.aiFeedback.set(this.director.plannerNote().toUpperCase());
  }

  // ── Broadcast kit (streamers) ─────────────────────────────────────────

  fireBroadcastCue(): void {
    if (this.videoEngine.countdownRemaining() !== null) {
      this.videoEngine.stopCountdown();
      this.aiFeedback.set('BROADCAST CUE CANCELLED.');
      return;
    }
    this.videoEngine.startCountdown(BROADCAST_CUE_SECONDS);
    this.aiFeedback.set(
      `CUE ROLLING: ${BROADCAST_CUE_SECONDS} SECONDS TO TRANSPORT. HOLD YOUR MARK.`
    );
  }

  toggleLowerThird(): void {
    const enabled = this.videoEngine.toggleLowerThird();
    this.aiFeedback.set(
      enabled
        ? `LOWER THIRD LIVE: "${this.videoEngine.lowerThird().title.toUpperCase()}".`
        : 'LOWER THIRD CLEARED FROM THE PROGRAM FEED.'
    );
  }

  /** Go live on the selected platform, carrying the current delivery preset. */
  async goLive(): Promise<void> {
    const platform = this.livePlatform();
    const issued = await this.liveStream.golive({
      platform,
      payload: {
        source: 'cinema-engine',
        preset: this.videoEngine.deliveryPreset().id,
        aspectRatio: this.videoEngine.deliveryPreset().aspectRatio,
        mode: this.videoEngine.productionMode(),
      },
    });
    this.aiFeedback.set(
      issued
        ? `${platform.toUpperCase()} BROADCAST NEGOTIATED. COMPLETE THE AUTHORIZATION WINDOW TO AIR.`
        : 'BROADCAST COULD NOT START — SIGN IN AND TRY AGAIN.'
    );
  }

  async endLive(): Promise<void> {
    const ended = await this.liveStream.endStream();
    this.aiFeedback.set(
      ended ? 'BROADCAST ENDED. TRANSMISSION CLOSED.' : 'NO ACTIVE BROADCAST TO END.'
    );
  }

  async copyShareUrl(): Promise<void> {
    const copied = await this.liveStream.copyShareUrl();
    if (copied) this.aiFeedback.set('VIEWER LINK COPIED TO THE CLIPBOARD.');
  }

  // ── Voice direction + keyboard ────────────────────────────────────────

  toggleVoiceControl(): void {
    if (this.voiceEnabled()) {
      this.speechRecognition.stopListening();
      this.voiceEnabled.set(false);
      this.aiFeedback.set('VOICE DIRECTION OFF.');
      return;
    }
    this.voiceEnabled.set(true);
    this.aiFeedback.set('VOICE DIRECTION ARMED — SAY "ROLL", "CUT", "MARK", "GO LIVE".');
    this.speechRecognition.startListening((text) => {
      this.voiceTranscript.set(text);
      this.runVoiceTranscript(text);
    });
  }

  /** Route a transcript through the director's command parser. */
  runVoiceTranscript(text: string): void {
    const command = this.director.parseVoiceCommand(text);
    if (!command) {
      this.aiFeedback.set(
        `HEARD "${text.toUpperCase()}" — NO CINEMA COMMAND MATCHED. TRY "ROLL", "CUT", "MARK" OR "GO LIVE".`
      );
      return;
    }
    this.runCinemaCommand(command);
  }

  /** Text fallback for the same command path (no microphone required). */
  runTypedCommand(): void {
    const text = this.commandInput().trim();
    if (!text) return;
    this.commandInput.set('');
    this.runVoiceTranscript(text);
  }

  runCinemaCommand(command: CinemaCommand): void {
    const confirm = (message: string) =>
      this.aiFeedback.set(`COMMAND · ${message}`);
    switch (command.id) {
      case 'play':
        this.videoEngine.play();
        confirm('ROLLING.');
        break;
      case 'pause':
        this.videoEngine.pause();
        confirm('HELD.');
        break;
      case 'take':
        void this.toggleCameraTake();
        break;
      case 'split':
        this.splitAtPlayhead();
        break;
      case 'marker':
        this.addMarkerAtPlayhead();
        break;
      case 'next-marker':
        this.seekRelativeMarker(1);
        break;
      case 'previous-marker':
        this.seekRelativeMarker(-1);
        break;
      case 'auto-cut':
        this.autoCutToBeat();
        break;
      case 'export':
        void this.exportVideo();
        break;
      case 'snap-on':
        this.videoEngine.snapToBeat.set(true);
        confirm('BEAT SNAP ARMED.');
        break;
      case 'snap-off':
        this.videoEngine.snapToBeat.set(false);
        confirm('BEAT SNAP RELEASED.');
        break;
      case 'camera':
        void this.toggleCamera();
        break;
      case 'screen':
        void this.captureScreen();
        break;
      case 'go-live':
        void this.goLive();
        break;
      case 'end-stream':
        void this.endLive();
        break;
      case 'lower-third':
        this.toggleLowerThird();
        break;
      case 'cue':
        this.fireBroadcastCue();
        break;
    }
  }

  /**
   * Editor keyboard map. Deliberately ignored while a field has focus so typing
   * a shot description never toggles the transport.
   */
  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent): void {
    if (this.isTypingTarget(event.target)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    switch (event.key) {
      case ' ':
        event.preventDefault();
        this.videoEngine.togglePlay();
        return;
      case 'ArrowLeft':
        event.preventDefault();
        this.stepPlayhead(event.shiftKey ? -1 : -FRAME_STEP_SECONDS);
        return;
      case 'ArrowRight':
        event.preventDefault();
        this.stepPlayhead(event.shiftKey ? 1 : FRAME_STEP_SECONDS);
        return;
      case 'Home':
        event.preventDefault();
        this.videoEngine.seek(0);
        this.centerOnPlayhead();
        return;
      case 'End':
        event.preventDefault();
        this.videoEngine.seek(this.videoEngine.duration());
        this.centerOnPlayhead();
        return;
      case 'Escape':
        this.clearSelection();
        return;
      default:
        break;
    }

    switch (event.key.toLowerCase()) {
      case 's':
        this.splitAtPlayhead();
        break;
      case 'd':
        this.duplicateSelectedClip();
        break;
      case 'm':
        this.addMarkerAtPlayhead();
        break;
      case 'b':
        this.videoEngine.snapToBeat.update((armed) => !armed);
        this.aiFeedback.set(
          `BEAT SNAP ${this.videoEngine.snapToBeat() ? 'ARMED' : 'RELEASED'}.`
        );
        break;
      case 'n':
        this.seekRelativeMarker(1);
        break;
      case 'p':
        this.seekRelativeMarker(-1);
        break;
      case 'delete':
      case 'backspace':
        event.preventDefault();
        this.deleteSelectedClip();
        break;
      default:
        break;
    }
  }

  /** Frame-accurate playhead step used by the arrow keys. */
  private stepPlayhead(deltaSeconds: number): void {
    this.videoEngine.seek(this.videoEngine.currentTime() + deltaSeconds);
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return el.isContentEditable === true;
  }

  /**
   * Bind or release the live camera stream on the preview's video sink.
   *
   * A sink that holds a stream but is not playing paints nothing, which is
   * indistinguishable from a failed capture, so a bound sink is always kept
   * rolling instead of being attached once and trusted.
   */
  private syncCameraElement(): void {
    const video = this.cameraFeed?.nativeElement;
    if (!video) return;
    const stream = this.camera.stream();
    if (stream && video.srcObject !== stream) {
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      this.playQuietly(video);
      return;
    }
    if (stream) {
      if (video.paused) this.playQuietly(video);
      return;
    }
    if (video.srcObject) video.srcObject = null;
  }

  private startCanvasLoop() {
    const render = () => {
      if (this.canvasCtx) {
        this.renderPreview();
      }
      this.animFrame = requestAnimationFrame(render);
    };
    render();
  }

  private renderPreview() {
    if (!this.canvasCtx) return;
    const ctx = this.canvasCtx;
    const canvas = this.previewCanvas.nativeElement;

    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const time = this.videoEngine.currentTime();
    const activeClips = this.videoEngine.getActiveClips(time);
    const liveFeed = this.cameraFeed?.nativeElement;
    const liveCamera = this.camera.isLive() && !!liveFeed;

    // The live camera is the viewfinder: it sits under every timeline clip.
    if (liveCamera && liveFeed) {
      this.drawCameraFeed(ctx, canvas, liveFeed);
    }

    if (activeClips.length > 0) {
      activeClips.forEach((clip) => {
        const trimStart = Math.max(0, clip.effects.trimStart || 0);
        const trimEnd = Math.max(0, clip.effects.trimEnd || 0);
        const activeDuration = Math.max(
          MIN_ACTIVE_CLIP_DURATION,
          clip.duration - trimStart - trimEnd
        );
        const clipStart = clip.startTime + trimStart;
        const clipLocalTime = Math.max(0, time - clipStart);
        const alpha = this.resolveTransitionAlpha(
          clipLocalTime,
          activeDuration,
          clip.effects.transition,
          clip.effects.transitionDuration
        );

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.filter = this.resolveCanvasFilter(clip.effects);

        const media = this.resolveMediaElement(clip);
        const painted = media
          ? this.drawMediaContain(ctx, canvas, media, clip, clipLocalTime)
          : false;
        if (!painted) this.drawSignalPlaceholder(ctx, canvas, clip);

        ctx.font = '10px "Public Sans"';
        ctx.fillStyle = '#10b981';
        ctx.fillText(`UPLINK: ${clip.name.toUpperCase()}`, 20, 30);
        ctx.fillText(`TIMESTAMP: ${time.toFixed(3)}s`, 20, 45);
        ctx.fillText(
          `FX: ${clip.effects.filter.toUpperCase()} · ${clip.effects.transition.toUpperCase()} · TRIM ${trimStart.toFixed(1)}s/${trimEnd.toFixed(1)}s`,
          20,
          HUD_FX_LINE_Y
        );
        ctx.restore();
      });
    } else if (!liveCamera) {
      ctx.font = '12px "Public Sans"';
      ctx.fillStyle = '#1e293b';
      ctx.textAlign = 'center';
      ctx.fillText(
        'WAITING FOR MEDIA SIGNAL...',
        canvas.width / 2,
        canvas.height / 2
      );
    }

    this.pauseIdleMedia(activeClips);
    this.drawHUD(ctx, canvas);
    this.drawCameraDiagnostic(ctx, canvas, liveFeed);
  }

  /**
   * Explain the capture state on the program monitor itself.
   *
   * A blocked permission and a live feed that never decodes a frame both used to
   * look identical from the preview — a black rectangle — while the only
   * explanation lived in the sidebar. "The camera is broken" is almost always
   * one of these two states, so name it where the operator is looking.
   */
  private drawCameraDiagnostic(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    feed?: HTMLVideoElement
  ): void {
    const status = this.camera.status();
    const live = this.camera.isLive();
    const decoding = !!feed && feed.videoWidth > 0 && feed.videoHeight > 0;
    if (live && decoding) return;
    if (!live && status === 'off') return;

    const message = live
      ? 'LIVE FEED AUTHORIZED BUT NO FRAMES YET'
      : this.camera.statusLabel();
    const detail =
      this.camera.previewWarning() ??
      this.camera.lastError() ??
      this.camera.statusDetail();

    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.74)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 22px "Public Sans"';
    ctx.fillText(message, canvas.width / 2, canvas.height / 2 - 10);
    ctx.fillStyle = 'rgba(226, 232, 240, 0.78)';
    ctx.font = '14px "Public Sans"';
    this.wrapText(ctx, detail.toUpperCase(), canvas.width * 0.8)
      .slice(0, 3)
      .forEach((line, index) => {
        ctx.fillText(line, canvas.width / 2, canvas.height / 2 + 22 + index * 20);
      });
    ctx.restore();
  }

  /** Paint the live camera feed as the base preview layer (contain-fit). */
  private drawCameraFeed(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement
  ): void {
    if (!video.videoWidth || !video.videoHeight) return;
    const rect = this.containRect(video.videoWidth, video.videoHeight, canvas);
    ctx.save();
    if (this.camera.mirrored()) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    try {
      ctx.drawImage(video, rect.x, rect.y, rect.width, rect.height);
      this.camera.markPreviewReady();
    } catch {
      // A video element with no decoded frame throws on draw — skip the pass.
    }
    ctx.restore();
  }

  /** Letterbox helper — the canvas equivalent of `object-fit: contain`. */
  private containRect(
    sourceWidth: number,
    sourceHeight: number,
    canvas: HTMLCanvasElement
  ): { x: number; y: number; width: number; height: number } {
    const scale = Math.min(
      canvas.width / sourceWidth,
      canvas.height / sourceHeight
    );
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    return {
      x: (canvas.width - width) / 2,
      y: (canvas.height - height) / 2,
      width,
      height,
    };
  }

  /**
   * Resolve (and lazily decode) a clip's real media element. Only same-origin
   * `blob:`/`data:` sources are used so the preview canvas stays untainted for
   * the `captureStream()` video export.
   */
  private resolveMediaElement(
    clip: VideoClip
  ): HTMLImageElement | HTMLVideoElement | null {
    const url = clip.url;
    if (!url || !/^(blob:|data:)/.test(url)) return null;
    if (clip.type === 'overlay') return null;

    const cached = this.mediaCache.get(url);
    if (cached) return cached;

    if (clip.type === 'image') {
      const image = new Image();
      image.src = url;
      this.mediaCache.set(url, image);
      return image;
    }

    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    this.playQuietly(video);
    this.mediaCache.set(url, video);
    return video;
  }

  /**
   * Paint a decoded image/video frame into the preview. Returns false when the
   * element has nothing to show yet so the signal placeholder can take over.
   */
  private drawMediaContain(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    media: HTMLImageElement | HTMLVideoElement,
    clip: VideoClip,
    clipLocalTime: number
  ): boolean {
    if (media instanceof HTMLVideoElement) {
      this.syncVideoPlayback(media, clip, clipLocalTime);
    }

    const width = this.mediaWidth(media);
    const height = this.mediaHeight(media);
    if (!width || !height) return false;

    const rect = this.containRect(width, height, canvas);
    ctx.save();
    if (clip.source === 'camera' && this.camera.mirrored()) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    try {
      ctx.drawImage(media, rect.x, rect.y, rect.width, rect.height);
    } catch {
      ctx.restore();
      return false;
    }
    ctx.restore();
    return true;
  }

  private mediaWidth(media: HTMLImageElement | HTMLVideoElement): number {
    if (media instanceof HTMLVideoElement) return media.videoWidth;
    return media.complete ? media.naturalWidth : 0;
  }

  private mediaHeight(media: HTMLImageElement | HTMLVideoElement): number {
    if (media instanceof HTMLVideoElement) return media.videoHeight;
    return media.complete ? media.naturalHeight : 0;
  }

  /**
   * Keep an ingested video matched to the playhead.
   *
   * While the transport is paused every rendered frame lands on the exact
   * source time, so dragging the playhead scrubs frame by frame. While playing,
   * the element runs on its own clock and is only corrected past a small drift
   * tolerance — re-seeking every frame would fight the decoder and stutter.
   */
  private syncVideoPlayback(
    video: HTMLVideoElement,
    clip: VideoClip,
    clipLocalTime: number
  ): void {
    if (video.readyState < 2) return;

    const sourceTime = this.resolveClipSourceTime(clip, clipLocalTime);
    if (sourceTime === null) return;

    if (!this.videoEngine.isPlaying()) {
      if (!video.paused) this.pauseQuietly(video);
      this.seekVideoExact(video, sourceTime);
      return;
    }

    if (video.paused) this.playQuietly(video);
    if (
      Math.abs(video.currentTime - sourceTime) > PLAYING_DRIFT_TOLERANCE_SECONDS
    ) {
      this.seekVideoExact(video, sourceTime);
    }
  }

  /** Map a timeline position onto the clip's source file. */
  private resolveClipSourceTime(
    clip: VideoClip,
    clipLocalTime: number
  ): number | null {
    const target = Math.max(0, (clip.offset || 0) + clipLocalTime);
    return Number.isFinite(target) ? target : null;
  }

  /**
   * Land on the exact requested time. `fastSeek()` is deliberately avoided — it
   * snaps to the nearest keyframe, which is the opposite of frame accuracy.
   */
  private seekVideoExact(video: HTMLVideoElement, seconds: number): void {
    const safe = this.clampToMediaDuration(video, seconds);
    if (Math.abs(video.currentTime - safe) < EXACT_SEEK_EPSILON_SECONDS) return;
    try {
      video.currentTime = safe;
    } catch {
      /* seeking before metadata is ready — ignore this pass */
    }
  }

  /** Keep a seek inside the decodable range of the element's own duration. */
  private clampToMediaDuration(
    video: HTMLVideoElement,
    seconds: number
  ): number {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration <= 0) return seconds;
    return Math.max(0, Math.min(seconds, duration - EXACT_SEEK_EPSILON_SECONDS));
  }

  /**
   * Park every cached video that is not on the playhead. Off-screen clips were
   * left decoding in the background, which burns battery on phones.
   */
  private pauseIdleMedia(activeClips: VideoClip[]): void {
    const activeUrls = new Set(activeClips.map((clip) => clip.url));
    this.mediaCache.forEach((media, url) => {
      if (!(media instanceof HTMLVideoElement) || activeUrls.has(url)) return;
      if (!media.paused) this.pauseQuietly(media);
    });
  }

  /**
   * Drop decoded media for clips that are no longer on the timeline.
   *
   * The cache is keyed by url and, until now, survived until `ngOnDestroy`. That
   * was fine while a timeline only grew by ingesting files, but opening a
   * project now replaces every lane at once: each open left the previous
   * project's decoded takes resident, and a decoded video is far larger than the
   * file it came from, so a few project switches added up to a real leak.
   *
   * The object urls are deliberately *not* revoked. A project reopened later in
   * the same session must still find its media, and the bytes are released on
   * destroy exactly as before — this only drops the decoding.
   */
  /**
   * Hold a source file for saving, and return the id its clip will carry.
   *
   * Without this the clip only ever has a `blob:` url, which is why saving used
   * to store a timeline whose every clip needed re-ingesting on reopen.
   *
   * The bytes are read back through the clip's own object url rather than
   * captured where the file was ingested. An object url keeps its blob alive for
   * as long as the document does, and reading it here means *any* path that puts
   * footage on the timeline is covered — including ones added later, which would
   * otherwise have to remember to register themselves and would fail silently if
   * they did not. A `data:` url already carries its own bytes in the snapshot and
   * is skipped. So is anything already known from a project opened this session,
   * which is what stops a reopen-and-resave from copying footage a second time.
   */
  private async collectTimelineMedia(): Promise<Map<string, Blob>> {
    const footage = new Map<string, Blob>();
    const clips = this.videoEngine.tracks().flatMap((track) => track.clips);

    for (const clip of clips) {
      if (!clip.mediaId) {
        // Stamped here so the saved snapshot can name its own footage; the
        // service stores media under `projectId::mediaId`.
        const id = `m${++this.mediaCounter}`;
        this.videoEngine.updateClip(clip.id, { mediaId: id });
        clip.mediaId = id;
      }

      const known = this.mediaBlobs.get(clip.mediaId);
      if (known) {
        footage.set(clip.mediaId, known);
        continue;
      }

      if (!clip.url?.startsWith('blob:')) continue;
      try {
        const blob = await (await fetch(clip.url)).blob();
        if (blob.size > 0) footage.set(clip.mediaId, blob);
      } catch (error) {
        // A url whose bytes are gone leaves the clip unstored, and the save
        // reports it as needing footage rather than failing outright.
        this.logger.warn('CinemaEngine: footage could not be read for save', error);
      }
    }

    return footage;
  }

  private evictUnusedMedia(): void {
    const liveUrls = new Set(
      this.videoEngine
        .tracks()
        .flatMap((track) => track.clips.map((clip) => clip.url))
    );

    this.mediaCache.forEach((media, url) => {
      if (liveUrls.has(url)) return;
      if (media instanceof HTMLVideoElement) {
        if (!media.paused) this.pauseQuietly(media);
        // Detach the source so the decoder stops holding buffers, rather than
        // waiting for the element to be collected.
        media.removeAttribute('src');
      }
      this.mediaCache.delete(url);
    });
  }

  /**
   * `HTMLMediaElement.play()` is not implemented in every host (headless
   * test environments) and autoplay can be rejected outright — neither may
   * ever break the render loop.
   */
  private playQuietly(media: HTMLMediaElement): void {
    try {
      const started = media.play();
      if (started && typeof started.catch === 'function') {
        void started.catch(() => {
          /* autoplay rejected — the element still decodes once seeked */
        });
      }
    } catch {
      /* play() unavailable in this host */
    }
  }

  /**
   * Counterpart to {@link playQuietly}: tearing an element down must never
   * throw out of the render loop or out of `ngOnDestroy` on hosts with a
   * partial media implementation.
   */
  private pauseQuietly(media: HTMLMediaElement): void {
    try {
      media.pause();
    } catch {
      /* pause() unavailable in this host */
    }
  }

  /** Fallback visual for clips whose media has not decoded yet. */
  private drawSignalPlaceholder(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    clip: VideoClip
  ): void {
    const grad = ctx.createLinearGradient(
      0,
      0,
      canvas.width,
      canvas.height
    );
    if (clip.type === 'video') {
      grad.addColorStop(0, '#10b98122');
      grad.addColorStop(0.5, '#064e3b44');
      grad.addColorStop(1, '#10b98122');
    } else {
      grad.addColorStop(0, '#8b5cf622');
      grad.addColorStop(0.5, '#4c1d9544');
      grad.addColorStop(1, '#8b5cf622');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#10b98111';
    ctx.beginPath();
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    ctx.stroke();

    this.drawShotCard(ctx, canvas, clip);
  }

  /**
   * Storyboard card for a clip that has no media yet — how a S.M.U.V.E-staged
   * shot presents itself on the program monitor until it is actually shot.
   */
  private drawShotCard(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    clip: VideoClip
  ): void {
    if (!clip.note) return;
    const padding = 28;
    const maxWidth = canvas.width - padding * 2;
    const baseY = canvas.height - 96;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = 'bold 11px "Public Sans"';
    ctx.fillStyle = '#10b981';
    ctx.fillText((clip.shotType ?? 'shot').toUpperCase(), padding, baseY - 24);

    ctx.font = 'bold 15px "Public Sans"';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(this.ellipsize(ctx, clip.name, maxWidth), padding, baseY);

    ctx.font = '12px "Public Sans"';
    ctx.fillStyle = 'rgba(226, 232, 240, 0.72)';
    this.wrapText(ctx, clip.note, maxWidth)
      .slice(0, 3)
      .forEach((line, index) => {
        ctx.fillText(line, padding, baseY + 20 + index * 16);
      });
    ctx.restore();
  }

  /** Greedy word wrap against the measured width of the canvas context. */
  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
  ): string[] {
    const lines: string[] = [];
    let line = '';
    text.split(/\s+/).forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
        return;
      }
      line = candidate;
    });
    if (line) lines.push(line);
    return lines;
  }

  private ellipsize(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
  ): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let trimmed = text;
    while (
      trimmed.length > 1 &&
      ctx.measureText(`${trimmed}…`).width > maxWidth
    ) {
      trimmed = trimmed.slice(0, -1);
    }
    return `${trimmed}…`;
  }

  applyEnhancementsToActiveClips() {
    const activeClips = this.videoEngine.getActiveClips(
      this.videoEngine.currentTime()
    );
    if (!activeClips.length) {
      this.aiFeedback.set(
        'NO ACTIVE CLIPS ON THE PLAYHEAD. MOVE THE PLAYHEAD OVER A CLIP TO APPLY FILTER/TRANSITION/TRIM.'
      );
      return;
    }

    activeClips.forEach((clip) => {
      const trim = this.resolveTrimAmount(clip.duration);
      this.videoEngine.updateClip(clip.id, {
        effects: {
          ...clip.effects,
          filter: this.selectedFilter(),
          transition: this.selectedTransition(),
          transitionDuration: this.transitionDuration(),
          trimStart: trim,
          trimEnd: trim,
        },
      });
    });
    this.aiFeedback.set(
      `ENHANCEMENTS DEPLOYED: ${this.selectedFilter().toUpperCase()} FILTER, ${this.selectedTransition().toUpperCase()} TRANSITION, ${this.transitionDuration().toFixed(1)}s BLEND, ${this.trimAmount().toFixed(1)}s EDGE TRIM.`
    );
  }

  private drawHUD(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    ctx.strokeStyle = '#10b98144';
    ctx.lineWidth = 1;
    const size = 30;
    const p = 10;
    ctx.beginPath();
    ctx.moveTo(p, p + size);
    ctx.lineTo(p, p);
    ctx.lineTo(p + size, p);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(canvas.width - p, canvas.height - p - size);
    ctx.lineTo(canvas.width - p, canvas.height - p);
    ctx.lineTo(canvas.width - p - size, canvas.height - p);
    ctx.stroke();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.03)';
    for (let i = 0; i < canvas.height; i += 4) {
      ctx.fillRect(0, i, canvas.width, 1);
    }
    ctx.fillStyle = '#10b981';
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(this.resolveTransportBadge(), canvas.width - 96, 25);
    ctx.fillText(this.activePreset().aspectRatio, 20, canvas.height - 20);
    if (this.camera.isLive()) {
      ctx.fillText(
        `CAM: ${this.camera.deviceName().toUpperCase()}`,
        20,
        canvas.height - 32
      );
    }

    if (this.videoEngine.safeZoneEnabled()) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(
        canvas.width * 0.12,
        canvas.height * 0.1,
        canvas.width * 0.76,
        canvas.height * 0.8
      );
      ctx.setLineDash([]);
    }

    // Broadcast graphics live in the program feed, so whatever the host sees on
    // the monitor is exactly what the export and the stream carry.
    this.drawLowerThird(ctx, canvas);
    this.drawCountdown(ctx, canvas);
  }

  /** Streamer lower third — name plate, topic, or sponsor strap. */
  private drawLowerThird(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement
  ): void {
    const { enabled, title, subtitle } = this.videoEngine.lowerThird();
    if (!enabled || !title.trim()) return;

    const padding = 24;
    const width = Math.min(canvas.width * 0.66, 520);
    const height = subtitle.trim() ? 74 : 52;
    const y = canvas.height - height - padding;

    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.78)';
    ctx.fillRect(padding, y, width, height);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(padding, y, 4, height);
    ctx.textAlign = 'left';
    ctx.font = 'bold 16px "Public Sans"';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(
      this.ellipsize(ctx, title.toUpperCase(), width - 28),
      padding + 16,
      y + 26
    );
    if (subtitle.trim()) {
      ctx.font = '12px "Public Sans"';
      ctx.fillStyle = 'rgba(248, 250, 252, 0.66)';
      ctx.fillText(
        this.ellipsize(ctx, subtitle, width - 28),
        padding + 16,
        y + 50
      );
    }
    ctx.restore();
  }

  /** Go-live cue: a full-frame countdown the whole room can read. */
  private drawCountdown(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement
  ): void {
    const label = this.countdownLabel();
    if (!label) return;

    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 96px "Public Sans"';
    ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 20);
    ctx.font = 'bold 13px "Public Sans"';
    ctx.fillStyle = 'rgba(248, 250, 252, 0.8)';
    ctx.fillText(
      'BROADCAST CUE — HOLD YOUR MARK',
      canvas.width / 2,
      canvas.height / 2 + 60
    );
    ctx.restore();
  }

  /**
   * Capture a real video master straight off the preview canvas. The renderer
   * runs in real time (`canvas.captureStream`), so the window is an explicit,
   * user-selected number of seconds instead of an invisible constant.
   */
  async exportVideo() {
    if (this.isExporting()) return;
    const seconds = this.exportWindow();
    const canvas = this.previewCanvas.nativeElement;

    this.isExporting.set(true);
    this.exportProgress.set(0);
    this.aiFeedback.set(
      `INITIALIZING ${seconds}s MULTI-STREAM EXPORT. STAND BY FOR ELITE CAPTURE.`
    );

    const wasPlaying = this.videoEngine.isPlaying();
    let session: {
      recorder: { stop: () => void };
      result: Promise<Blob>;
    };
    try {
      session = await this.exportService.startVideoExport(canvas, {
        fps: 30,
        withAudio: true,
      });
    } catch (error: any) {
      this.isExporting.set(false);
      this.logger.error('Video export failed to start', error);
      this.aiFeedback.set(
        error?.message
          ? String(error.message).toUpperCase()
          : 'VIDEO EXPORT COULD NOT START ON THIS BROWSER.'
      );
      return;
    }

    // Capture from the top of the timeline so the master always starts at 0.
    this.videoEngine.pause();
    this.videoEngine.seek(0);
    this.videoEngine.play();

    const startedAt = Date.now();
    const ticker = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      this.exportProgress.set(Math.min(99, Math.round((elapsed / seconds) * 100)));
    }, 250);

    const stopTimer = setTimeout(() => {
      session.recorder.stop();
      clearInterval(ticker);
      this.videoEngine.pause();
      if (wasPlaying) this.videoEngine.play();
    }, seconds * 1000);

    try {
      const blob = await session.result;
      clearTimeout(stopTimer);
      clearInterval(ticker);

      if (blob.size === 0) {
        this.exportProgress.set(0);
        this.aiFeedback.set(
          'EXPORT PRODUCED NO VIDEO FRAMES. KEEP THIS TAB VISIBLE AND RETRY.'
        );
        return;
      }

      this.exportProgress.set(100);
      this.exportService.downloadBlob(
        blob,
        `smuve_${this.videoEngine.productionMode()}_${this.activePreset().id}_${Date.now()}.webm`
      );
      this.aiFeedback.set(
        `VIDEO EXPORT CAPTURE COMPLETE. ${this.activePreset().target.toUpperCase()} MASTER IS READY FOR DEPLOYMENT.`
      );
    } catch (error: any) {
      clearTimeout(stopTimer);
      clearInterval(ticker);
      this.exportProgress.set(0);
      this.logger.error('Video export failed', error);
      this.aiFeedback.set(
        'VIDEO EXPORT FAILED. TRY A SHORTER CAPTURE WINDOW.'
      );
    } finally {
      this.isExporting.set(false);
    }
  }

  async onFileUpload(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    this.ownedObjectUrls.add(url);
    const targetTrackId = file.type.startsWith('image/') ? 't2' : 't1';
    const clipType: VideoClip['type'] = file.type.startsWith('image/')
      ? 'image'
      : 'video';
    const duration = this.resolveIngestDuration();

    this.videoEngine.addClip(targetTrackId, {
      name: file.name,
      url: url,
      startTime: this.videoEngine.currentTime(),
      duration,
      offset: 0,
      type: clipType,
      source: 'upload',
      effects: {
        upscale: this.highQualityEnhancer(),
        bgRemoval: false,
        noiseReduction: false,
        brightness: 1,
        contrast: 1,
        filter: this.selectedFilter(),
        transition: this.selectedTransition(),
        transitionDuration: this.transitionDuration(),
        trimStart: this.resolveTrimAmount(duration),
        trimEnd: this.resolveTrimAmount(duration),
      },
    });
    this.aiFeedback.set(
      `UPLOAD SUCCESS: ${file.name} mapped into the ${this.activePreset().name} workflow.`
    );
  }

  // ── Camera uplink (live capture into the timeline) ─────────────────────

  /**
   * Open or close the camera uplink. Failures are surfaced verbatim — a camera
   * that cannot start is a state worth naming, not a silent no-op.
   */
  async toggleCamera(): Promise<void> {
    if (this.camera.isLive()) {
      this.camera.stop();
      this.aiFeedback.set('CAMERA UPLINK CLOSED. DEVICE RELEASED.');
      return;
    }

    this.aiFeedback.set('REQUESTING CAMERA ACCESS...');
    const started = await this.camera.start();
    this.aiFeedback.set(
      started
        ? `CAMERA LIVE: ${this.camera.deviceName().toUpperCase()}. ${this.camera.statusDetail()}`
        : (this.camera.lastError() ?? 'CAMERA COULD NOT START.').toUpperCase()
    );
  }

  /**
   * Share a screen or window as the capture source. Screen captures land in the
   * same lanes as camera media but are never mirrored (a flipped screen share
   * would be unreadable).
   */
  async captureScreen(): Promise<void> {
    if (this.camera.isLive() && this.camera.sourceType() === 'screen') {
      this.camera.stop();
      this.aiFeedback.set('SCREEN SHARE STOPPED. DISPLAY RELEASED.');
      return;
    }

    this.aiFeedback.set('REQUESTING SCREEN SHARE...');
    const started = await this.camera.startScreenShare();
    this.aiFeedback.set(
      started
        ? 'SCREEN LIVE: DISPLAY FEED ROUTED INTO THE CINEMA PREVIEW.'
        : (this.camera.lastError() ?? 'SCREEN CAPTURE COULD NOT START.').toUpperCase()
    );
  }

  async selectCameraDevice(deviceId: string): Promise<void> {
    if (!this.camera.canSwitchDevice()) {
      this.aiFeedback.set(
        'FINISH THE CURRENT CAMERA TAKE BEFORE SWITCHING INPUTS.'
      );
      return;
    }
    const switched = await this.camera.setDevice(deviceId);
    if (!switched) return;
    this.aiFeedback.set(
      `CAMERA INPUT: ${this.camera.deviceName().toUpperCase()}.`
    );
  }

  async switchCameraFacing(): Promise<void> {
    if (!this.camera.canSwitchDevice()) {
      this.aiFeedback.set(
        'FINISH THE CURRENT CAMERA TAKE BEFORE FLIPPING SENSORS.'
      );
      return;
    }
    await this.camera.switchFacing();
    this.aiFeedback.set(
      `CAMERA SENSOR: ${this.camera.facingMode() === 'user' ? 'FRONT' : 'REAR'}.`
    );
  }

  toggleCameraMirror(): void {
    this.camera.mirrored.update((value) => !value);
    this.aiFeedback.set(
      `CAMERA MIRROR ${this.camera.mirrored() ? 'ON (SELFIE VIEW)' : 'OFF (AS-RECORDED)'}.`
    );
  }

  /** Freeze the current camera frame into the overlays lane as a still clip. */
  captureCameraFrame(): void {
    if (!this.camera.isLive()) {
      this.aiFeedback.set('START THE CAMERA BEFORE CAPTURING A FRAME.');
      return;
    }

    const dataUrl = this.camera.captureFrame(this.cameraFeed?.nativeElement, {
      maxWidth: CAMERA_STILL_MAX_WIDTH,
    });
    if (!dataUrl) {
      this.aiFeedback.set(
        'NO CAMERA FRAME YET — WAIT FOR THE LIVE FEED TO WARM UP AND RETRY.'
      );
      return;
    }

    this.cameraTakeCount.update((count) => count + 1);
    const isScreenShare = this.camera.sourceType() === 'screen';
    const stillName = `${isScreenShare ? 'Screen' : 'Camera'} Frame ${this.cameraTakeCount()}`;
    const duration = this.resolveIngestDuration();
    this.videoEngine.addClip('t2', {
      name: stillName,
      url: dataUrl,
      startTime: this.videoEngine.currentTime(),
      duration,
      offset: 0,
      type: 'image',
      source: isScreenShare ? 'screen' : 'camera',
      effects: {
        upscale: this.highQualityEnhancer(),
        bgRemoval: false,
        noiseReduction: false,
        brightness: 1,
        contrast: 1,
        filter: this.selectedFilter(),
        transition: this.selectedTransition(),
        transitionDuration: this.transitionDuration(),
        trimStart: this.resolveTrimAmount(duration),
        trimEnd: this.resolveTrimAmount(duration),
      },
    });
    this.aiFeedback.set(
      `${stillName.toUpperCase()} CUT INTO THE OVERLAYS LANE (${duration}s).`
    );
  }

  /** Start or finish a camera take, landing the recording in the visuals lane. */
  async toggleCameraTake(): Promise<void> {
    if (this.camera.isRecording()) {
      const blob = await this.camera.stopRecording();
      const recordedSeconds = Math.max(1, this.camera.recordingSeconds());
      if (!blob) {
        this.aiFeedback.set(
          'CAMERA TAKE DISCARDED — NO RECORDABLE FRAMES LANDED.'
        );
        return;
      }

      const url = URL.createObjectURL(blob);
      this.ownedObjectUrls.add(url);
      this.cameraTakeCount.update((count) => count + 1);
      const takeName = `Camera Take ${this.cameraTakeCount()}`;
      this.videoEngine.addClip('t1', {
        name: takeName,
        url,
        startTime: this.videoEngine.currentTime(),
        duration: recordedSeconds,
        offset: 0,
        type: 'video',
        source: this.camera.sourceType() === 'screen' ? 'screen' : 'camera',
        effects: {
          upscale: this.highQualityEnhancer(),
          bgRemoval: false,
          noiseReduction: false,
          brightness: 1,
          contrast: 1,
          filter: this.selectedFilter(),
          transition: this.selectedTransition(),
          transitionDuration: this.transitionDuration(),
          trimStart: this.resolveTrimAmount(recordedSeconds),
          trimEnd: this.resolveTrimAmount(recordedSeconds),
        },
      });
      this.aiFeedback.set(
        `${takeName.toUpperCase()} RECORDED (${this.formatSeconds(recordedSeconds)}) INTO THE VISUALS LANE.`
      );
      return;
    }

    if (this.camera.startRecording()) {
      this.aiFeedback.set(
        'CAMERA TAKE ROLLING. HIT STOP TO CUT IT INTO THE TIMELINE.'
      );
    } else {
      this.aiFeedback.set(
        (this.camera.lastError() ?? 'CAMERA TAKE COULD NOT START.').toUpperCase()
      );
    }
  }

  async generateImage() {
    if (!this.imagePrompt()) return;
    this.isGenerating.set(true);
    const fullPrompt = `Tech-noir aesthetic for ${this.activePreset().target}, ${this.imagePrompt()}`;
    try {
      const url = await this.aiService.generateImage(fullPrompt);
      this.generatedImageUrl.set(url);
      const aiClipDuration =
        this.videoEngine.productionMode() === 'movie'
          ? AI_CLIP_DURATION_MOVIE
          : AI_CLIP_DURATION_OTHER;
      this.videoEngine.addClip('t2', {
        name: 'AI Concept Overlay',
        url: url,
        startTime: this.videoEngine.currentTime(),
        duration: aiClipDuration,
        offset: 0,
        type: 'image',
        source: 'ai',
        effects: {
          upscale: true,
          bgRemoval: false,
          noiseReduction: false,
          brightness: 1,
          contrast: 1,
          filter: this.selectedFilter(),
          transition: this.selectedTransition(),
          transitionDuration: this.transitionDuration(),
          trimStart: this.resolveTrimAmount(aiClipDuration),
          trimEnd: this.resolveTrimAmount(aiClipDuration),
        },
      });
    } catch (error: any) {
      this.logger.error('Image Generation Error:', error);
      this.aiFeedback.set(
        error?.message
          ? error.message.toUpperCase()
          : 'IMAGE GENERATION FAILED. VERIFY AI PROVIDER CONFIGURATION.'
      );
    } finally {
      this.isGenerating.set(false);
    }
  }

  applyTemplate(templatePrompt: string) {
    this.imagePrompt.set(templatePrompt);
  }

  selectProductionMode(mode: ProductionMode) {
    this.videoEngine.setProductionMode(mode);
    this.aiFeedback.set(
      `${mode.toUpperCase()} PRODUCTION MODE ACTIVE. ${this.videoEngine.deliveryPreset().description}`
    );
  }

  selectDeliveryPreset(presetId: string) {
    this.videoEngine.applyDeliveryPreset(presetId);
    this.aiFeedback.set(
      `${this.activePreset().name.toUpperCase()} loaded for ${this.activePreset().target.toUpperCase()}.`
    );
  }

  getPresetsForMode(mode: ProductionMode): DeliveryPreset[] {
    return this.videoEngine
      .getAllDeliveryPresets()
      .filter((preset) => preset.mode === mode);
  }

  private formatRuntime(durationSeconds: number): string {
    const totalMinutes = Math.floor(durationSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  private resolveIngestDuration(): number {
    const mode = this.videoEngine.productionMode();
    return mode === 'movie' ? 18 : mode === 'stream' ? 12 : 8;
  }

  /**
   * Honest transport badge: only claims REC while a take is genuinely rolling,
   * and CAM LIVE while the viewfinder is actually feeding the canvas.
   */
  private resolveTransportBadge(): string {
    if (this.camera.isRecording()) {
      return `REC ● ${this.formatSeconds(this.camera.recordingSeconds())}`;
    }
    if (this.camera.isLive()) return 'CAM ● LIVE';
    return this.videoEngine.isPlaying() ? 'PLAY ▶' : 'STANDBY';
  }

  private formatSeconds(totalSeconds: number): string {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  private resolveTrimAmount(duration: number): number {
    return Math.min(
      this.trimAmount(),
      Math.max(0, (duration - MIN_ACTIVE_CLIP_DURATION) / 2)
    );
  }

  private resolveCanvasFilter(effects: VideoClip['effects']): string {
    const styleByFilter: Record<ClipFilter, string> = {
      none: 'saturate(1)',
      cinematic: 'saturate(0.82) contrast(1.12)',
      vivid: 'saturate(1.28) contrast(1.06)',
      mono: 'grayscale(1) contrast(1.08)',
    };
    return `${styleByFilter[effects.filter]} brightness(${effects.brightness}) contrast(${effects.contrast})`;
  }

  private resolveTransitionAlpha(
    clipLocalTime: number,
    activeDuration: number,
    transition: ClipTransition,
    transitionDuration: number
  ): number {
    if (transition === 'cut' || transitionDuration <= 0) {
      return 1;
    }

    const edgeWindow = Math.min(transitionDuration, activeDuration / 2);
    if (edgeWindow <= 0) return 1;

    const fadeIn = Math.min(1, clipLocalTime / edgeWindow);
    const fadeOut = Math.min(1, (activeDuration - clipLocalTime) / edgeWindow);
    const edgeAlpha = Math.min(fadeIn, fadeOut);
    const transitionAlpha =
      transition === 'dissolve' ? Math.sqrt(edgeAlpha) : edgeAlpha;
    return Math.max(MIN_TRANSITION_ALPHA, Math.min(1, transitionAlpha));
  }

  ngOnDestroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    // Never leave the device light on: releasing the stream is the only way the
    // OS hands the camera back to other apps.
    this.camera.stop();
    this.mediaCache.forEach((media) => {
      if (media instanceof HTMLVideoElement) {
        if (!media.paused) this.pauseQuietly(media);
        media.src = '';
      }
    });
    this.mediaCache.clear();
    this.ownedObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.ownedObjectUrls.clear();
  }
}
