import { Component, ChangeDetectionStrategy, signal, ElementRef, viewChild, OnDestroy, input, effect, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
// FIX: Corrected import path for AiService. It was '../../services/ai.service' which is incorrect.
import { AiService, GenerateVideosOperation } from '../services/ai.service';
// FIX: Update AppTheme import to break circular dependency
import { AppTheme } from '../services/user-context.service';

@Component({
  selector: 'app-video-editor',
  standalone: true,
  templateUrl: './video-editor.component.html',
  styleUrls: ['./video-editor.component.css'],
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoEditorComponent implements OnDestroy {
  imageForVideoGeneration = input<string | null>(null);
  initialPrompt = input<string | null>(null);
  theme = input.required<AppTheme>();
  
  mediaStream = signal<MediaStream | null>(null);
  isRecording = signal(false);
  recordedVideoUrl = signal<string | null>(null);
  videoPrompt = signal('');
  generatedVideoUrl = signal<string | null>(null);
  isGeneratingVideo = signal(false);
  generationProgressMessage = signal<string | null>(null);
  aspectRatio = signal<'16:9' | '9:16'>('16:9');
  error = signal<string | null>(null);
  
  private aiService = inject(AiService);
  // FIX: A computed signal's value must be read by calling it as a function.
  isAiAvailable = computed(() => this.aiService.isAiAvailable());
  liveVideoPreviewRef = viewChild<ElementRef<HTMLVideoElement>>('liveVideoPreview');

  constructor() {
    effect(() => {
      const prompt = this.initialPrompt();
      if (prompt) this.videoPrompt.set(prompt);
    });
  }

  ngOnDestroy(): void {
    this.stopMediaStream();
  }

  async toggleCamera(): Promise<void> {
    if (this.mediaStream()) {
      this.stopMediaStream();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        this.mediaStream.set(stream);
        const videoEl = this.liveVideoPreviewRef()?.nativeElement;
        if(videoEl) videoEl.srcObject = stream;
      } catch (err: any) { this.error.set(`Camera access denied: ${err.message}`); }
    }
  }

  stopMediaStream(): void {
    this.mediaStream()?.getTracks().forEach(track => track.stop());
    this.mediaStream.set(null);
    const videoEl = this.liveVideoPreviewRef()?.nativeElement;
    if(videoEl) videoEl.srcObject = null;
  }

  async generateVideo(fromImage: boolean): Promise<void> {
    if (!this.isAiAvailable() || !this.aiService.genAI) {
      this.error.set('AI features are unavailable.'); return;
    }
    const prompt = this.videoPrompt().trim();
    if (!prompt) { this.error.set('Please enter a prompt.'); return; }

    this.isGeneratingVideo.set(true);
    this.error.set(null);
    this.generationProgressMessage.set('Starting video generation...');
    
    try {
      let operation: GenerateVideosOperation;
      const config = { numberOfVideos: 1, aspectRatio: this.aspectRatio() };
      
      if (fromImage && this.imageForVideoGeneration()) {
        const mimeType = this.imageForVideoGeneration()!.split(';')[0].split(':')[1];
        const data = this.imageForVideoGeneration()!.split(',')[1];
        operation = await this.aiService.genAI.models.generateVideos({
          // FIX: Use approved model name
          model: 'veo-2.0-generate-001', prompt,
          image: { imageBytes: data, mimeType }, config,
        });
      } else {
        operation = await this.aiService.genAI.models.generateVideos({
          // FIX: Use approved model name
          model: 'veo-2.0-generate-001', prompt, config,
        });
      }

      this.generationProgressMessage.set('Video generation in progress...');
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await this.aiService.genAI.operations.getVideosOperation({ operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        this.generatedVideoUrl.set(this.aiService.signUrl(downloadLink));
        this.generationProgressMessage.set('Video generation complete!');
      } else { throw new Error('No download link in response.'); }
    } catch (err: any) {
      this.error.set(`Video generation failed: ${err.message}`);
      this.generationProgressMessage.set(null);
    } finally {
      this.isGeneratingVideo.set(false);
    }
  }
}
