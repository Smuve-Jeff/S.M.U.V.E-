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
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../services/ai.service';
import { UserContextService } from '../../services/user-context.service';
import {
  ClipFilter,
  ClipTransition,
  DeliveryPreset,
  MIN_ACTIVE_CLIP_DURATION,
  ProductionMode,
  VideoEngineService,
  VideoClip,
} from '../../services/video-engine.service';
import { ExportService } from '../../services/export.service';
import { CameraCaptureService } from '../../services/camera-capture.service';

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

  @ViewChild('previewCanvas') previewCanvas!: ElementRef<HTMLCanvasElement>;
  /** 1px off-screen sink for the live camera stream (see the CSS note). */
  @ViewChild('cameraFeed') cameraFeed?: ElementRef<HTMLVideoElement>;

  imagePrompt = signal('');
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
  readonly exportWindowOptions = EXPORT_WINDOW_OPTIONS;

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
  activePreset = computed(() => this.videoEngine.deliveryPreset());
  productionBlueprint = computed(() => {
    const preset = this.activePreset();
    const clipCount = this.videoEngine
      .tracks()
      .reduce((total, track) => total + track.clips.length, 0);
    const workflow =
      preset.mode === 'movie'
        ? 'feature narrative'
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
  }

  ngAfterViewInit() {
    this.canvasCtx = this.previewCanvas.nativeElement.getContext('2d');
    this.syncCameraElement();
    this.startCanvasLoop();
  }

  /** Bind or release the live camera stream on the preview's video sink. */
  private syncCameraElement(): void {
    const video = this.cameraFeed?.nativeElement;
    if (!video) return;
    const stream = this.camera.stream();
    if (stream && video.srcObject !== stream) {
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      this.playQuietly(video);
    } else if (!stream && video.srcObject) {
      video.srcObject = null;
    }
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
          ? this.drawMediaContain(ctx, canvas, media, clip)
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

    this.drawHUD(ctx, canvas);
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
    clip: VideoClip
  ): boolean {
    const width = this.mediaWidth(media);
    const height = this.mediaHeight(media);
    if (!width || !height) return false;

    if (media instanceof HTMLVideoElement) {
      this.syncVideoPlayback(media, clip);
    }

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
   * Keep an ingested video roughly aligned with the playhead. Frame-accurate
   * scrubbing is deliberately out of scope — the element is only nudged once it
   * has drifted more than a quarter second.
   */
  private syncVideoPlayback(video: HTMLVideoElement, clip: VideoClip): void {
    if (video.readyState < 2) return;
    const trimStart = Math.max(0, clip.effects.trimStart || 0);
    const target = Math.max(
      0,
      (clip.offset || 0) +
        (this.videoEngine.currentTime() - clip.startTime - trimStart)
    );
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const clamped =
      duration > 0 ? Math.min(target, Math.max(0, duration - 0.05)) : target;
    if (Math.abs(video.currentTime - clamped) > 0.25) {
      try {
        video.currentTime = clamped;
      } catch {
        /* seeking before metadata is ready — ignore this pass */
      }
    }

    if (this.videoEngine.isPlaying() && video.paused) {
      this.playQuietly(video);
    } else if (!this.videoEngine.isPlaying() && !video.paused) {
      video.pause();
    }
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
  }

  /**
   * Click-to-seek on the master timeline: maps the click x-position onto
   * the full timeline duration and moves the playhead there.
   */
  seekFromTimelineEvent(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / rect.width)
    );
    this.videoEngine.seek(ratio * this.videoEngine.duration());
  }

  /** Zoom the timeline out, clamped so the lane layout never collapses. */
  zoomOut(): void {
    this.zoomLevel.update((v) => Math.max(0.25, +(v * 0.9).toFixed(2)));
  }

  /** Zoom the timeline in, clamped so the playhead never leaves the lane. */
  zoomIn(): void {
    this.zoomLevel.update((v) => Math.min(4, +(v * 1.1).toFixed(2)));
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
    const stillName = `Camera Frame ${this.cameraTakeCount()}`;
    const duration = this.resolveIngestDuration();
    this.videoEngine.addClip('t2', {
      name: stillName,
      url: dataUrl,
      startTime: this.videoEngine.currentTime(),
      duration,
      offset: 0,
      type: 'image',
      source: 'camera',
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
        source: 'camera',
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
        media.pause();
        media.src = '';
      }
    });
    this.mediaCache.clear();
    this.ownedObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.ownedObjectUrls.clear();
  }
}
