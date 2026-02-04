import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../services/ai.service';
import { UserContextService } from '../../services/user-context.service';

@Component({
  selector: 'app-image-video-lab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './image-video-lab.component.html',
  styleUrls: ['./image-video-lab.component.css'],
})
export class ImageVideoLabComponent {
  private aiService = inject(AiService);
  private userContext = inject(UserContextService);

  imagePrompt = signal('');
  isGenerating = signal(false);
  generatedImageUrl = signal<string | null>(null);
  highQualityEnhancer = signal(false);

  templates = [
    { name: 'Cinematic Noir', prompt: 'film noir style, high contrast, dramatic shadows' },
    { name: 'Vaporwave Dreams', prompt: '80s aesthetic, neon pink and teal, lo-fi textures' },
    { name: 'Cyberpunk Grit', prompt: 'futuristic city, rain-slicked streets, neon lights' },
    { name: 'Ethereal Clouds', prompt: 'soft lighting, dreamlike atmosphere, pastel colors' },
  ];

  streamingSettings = signal({
    platform: 'Twitch',
    resolution: '1080p',
    bitrate: 6000,
    isLive: false
  });

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
      this.userContext.setLastImageUrl(url);
    } catch (error) {
      console.error('Image Generation Error:', error);
    } finally {
      this.isGenerating.set(false);
    }
  }

  applyTemplate(templatePrompt: string) {
    this.imagePrompt.set(templatePrompt);
  }

  toggleLive() {
    this.streamingSettings.update(s => ({ ...s, isLive: !s.isLive }));
  }
}
