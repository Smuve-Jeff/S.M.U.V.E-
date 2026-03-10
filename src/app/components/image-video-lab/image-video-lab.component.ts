import { Component, signal, inject, ViewChild, ElementRef, OnDestroy, effect, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../services/ai.service';
import { UserContextService } from '../../services/user-context.service';
import { ReputationService } from '../../services/reputation.service';
import { VideoEngineService, VideoClip } from '../../services/video-engine.service';

@Component({
  selector: 'app-image-video-lab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './image-video-lab.component.html',
  styleUrls: ['./image-video-lab.component.css'],
})
export class ImageVideoLabComponent implements OnDestroy, AfterViewInit {
  private aiService = inject(AiService);
  private userContext = inject(UserContextService);
  private reputationService = inject(ReputationService);
  public videoEngine = inject(VideoEngineService);

  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('previewCanvas') previewCanvas!: ElementRef<HTMLCanvasElement>;

  imagePrompt = signal('');
  isGenerating = signal(false);
  generatedImageUrl = signal<string | null>(null);
  highQualityEnhancer = signal(false);

  // Cinema Engine State
  activeDirectorTab = signal<'assets' | 'effects' | 'ai'>('assets');
  zoomLevel = signal(1.0);

  aiFeedback = signal('S.M.U.V.E. Cinema Engine Offline. Initialize for tactical visual capture.');

  private stream: MediaStream | null = null;
  private canvasCtx: CanvasRenderingContext2D | null = null;

  templates = [
    { name: 'Cinematic Noir', prompt: 'film noir style, high contrast, dramatic shadows' },
    { name: 'Vaporwave Dreams', prompt: '80s aesthetic, neon pink and teal, lo-fi textures' },
    { name: 'Cyberpunk Grit', prompt: 'futuristic city, rain-slicked streets, neon lights' },
    { name: 'Ethereal Clouds', prompt: 'soft lighting, dreamlike atmosphere, pastel colors' },
  ];

  constructor() {
    // Dynamic Feedback based on status
    effect(() => {
      const isPlaying = this.videoEngine.isPlaying();
      if (isPlaying) {
        this.aiFeedback.set('BROADCAST LIVE. Dominating the digital airwaves.');
      }
    }, { allowSignalWrites: true });
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
      requestAnimationFrame(render);
    };
    render();
  }

  private renderPreview() {
    if (!this.canvasCtx) return;
    const ctx = this.canvasCtx;
    const canvas = this.previewCanvas.nativeElement;

    // Clear canvas
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const time = this.videoEngine.currentTime();
    const activeClips = this.videoEngine.getActiveClips(time);

    activeClips.forEach(clip => {
      // For simplicity, we just draw a placeholder for now
      // In a real implementation, we would draw the video/image frame
      ctx.fillStyle = clip.type === 'video' ? '#10b98122' : '#8b5cf622';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = '20px monospace';
      ctx.fillStyle = '#10b981';
      ctx.fillText(`PLAYING: ${clip.name}`, 50, 50);

      // Apply "Strategic Commander" HUD
      this.drawHUD(ctx, canvas);
    });

    if (activeClips.length === 0) {
      ctx.font = '14px monospace';
      ctx.fillStyle = '#475569';
      ctx.fillText('NO ACTIVE DATA STREAM', canvas.width/2 - 80, canvas.height/2);
    }
  }

  private drawHUD(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    ctx.strokeStyle = '#10b98144';
    ctx.lineWidth = 1;

    // Corners
    ctx.beginPath();
    ctx.moveTo(20, 40); ctx.lineTo(20, 20); ctx.lineTo(40, 20);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(canvas.width - 40, 20); ctx.lineTo(canvas.width - 20, 20); ctx.lineTo(canvas.width - 20, 40);
    ctx.stroke();

    // Scanlines
    ctx.fillStyle = 'rgba(16, 185, 129, 0.05)';
    for (let i = 0; i < canvas.height; i += 4) {
      ctx.fillRect(0, i, canvas.width, 1);
    }
  }

  async onFileUpload(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    this.videoEngine.addClip('t1', {
      name: file.name,
      url: url,
      startTime: this.videoEngine.currentTime(),
      duration: 10, // Default 10s for upload, should be dynamic
      offset: 0,
      type: 'video',
      effects: { upscale: false, bgRemoval: false, noiseReduction: false, brightness: 1, contrast: 1 }
    });

    this.aiFeedback.set(`UPLOAD SUCCESS: ${file.name} integrated into the visual vault.`);
  }

  async generateImage() {
    if (!this.imagePrompt()) return;

    this.isGenerating.set(true);
    this.generatedImageUrl.set(null);

    const fullPrompt = this.highQualityEnhancer()
      ? `${this.imagePrompt()}, high definition, professional lighting, 4k`
      : this.imagePrompt();

    try {
      const url = await this.aiService.generateImage(fullPrompt);
      this.generatedImageUrl.set(url);

      // Also add as a clip to the overlay track
      this.videoEngine.addClip('t2', {
        name: 'AI Concept Overlay',
        url: url,
        startTime: this.videoEngine.currentTime(),
        duration: 5,
        offset: 0,
        type: 'image',
        effects: { upscale: true, bgRemoval: false, noiseReduction: false, brightness: 1, contrast: 1 }
      });

    } catch (error) {
      console.error('Image Generation Error:', error);
    } finally {
      this.isGenerating.set(false);
    }
  }

  applyTemplate(templatePrompt: string) {
    this.imagePrompt.set(templatePrompt);
  }

  ngOnDestroy() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
  }
}
