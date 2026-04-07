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

interface ProductionDirective {
  title: string;
  detail: string;
}

const MIN_TRANSITION_ALPHA = 0.15;
const HUD_FX_LINE_Y = 60;
const AI_CLIP_DURATION_MOVIE = 10;
const AI_CLIP_DURATION_OTHER = 6;

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

  @ViewChild('previewCanvas') previewCanvas!: ElementRef<HTMLCanvasElement>;

  imagePrompt = signal('');
  isGenerating = signal(false);
  isExporting = signal(false);
  generatedImageUrl = signal<string | null>(null);
  highQualityEnhancer = signal(false);
  selectedFilter = signal<ClipFilter>('cinematic');
  selectedTransition = signal<ClipTransition>('fade');
  transitionDuration = signal(0.5);
  trimAmount = signal(0);

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
    'S.M.U.V.E 4.2 Cinema Engine Offline. Initialize for executive visual capture.'
  );

  private canvasCtx: CanvasRenderingContext2D | null = null;
  private animFrame: number | null = null;
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
  }

  ngAfterViewInit() {
    this.canvasCtx = this.previewCanvas.nativeElement.getContext('2d');
    this.startCanvasLoop();
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
    } else {
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
    ctx.fillText('REC ●', canvas.width - 50, 25);
    ctx.fillText(this.activePreset().aspectRatio, 20, canvas.height - 20);

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

  async exportVideo() {
    if (this.isExporting()) return;
    this.isExporting.set(true);
    this.aiFeedback.set(
      'INITIALIZING MULTI-STREAM EXPORT. STAND BY FOR ELITE CAPTURE.'
    );
    const { recorder, result } = await this.exportService.startVideoExport(
      this.previewCanvas.nativeElement
    );
    this.videoEngine.currentTime.set(0);
    this.videoEngine.togglePlay();
    setTimeout(() => {
      recorder.stop();
      this.videoEngine.togglePlay();
      result.then((blob) => {
        this.exportService.downloadBlob(
          blob,
          `smuve_${this.videoEngine.productionMode()}_${this.activePreset().id}_${Date.now()}.webm`
        );
        this.isExporting.set(false);
        this.aiFeedback.set(
          `VIDEO EXPORT CAPTURE COMPLETE. ${this.activePreset().target.toUpperCase()} MASTER IS READY FOR DEPLOYMENT.`
        );
      });
    }, 10000);
  }

  async onFileUpload(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const targetTrackId = file.type.startsWith('image/') ? 't2' : 't1';
    const clipType: VideoClip['type'] = file.type.startsWith('image/')
      ? 'image'
      : 'video';
    const duration =
      this.videoEngine.productionMode() === 'movie'
        ? 18
        : this.videoEngine.productionMode() === 'stream'
          ? 12
          : 8;

    this.videoEngine.addClip(targetTrackId, {
      name: file.name,
      url: url,
      startTime: this.videoEngine.currentTime(),
      duration,
      offset: 0,
      type: clipType,
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
    } catch (error) {
      this.logger.error('Image Generation Error:', error);
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
  }
}
