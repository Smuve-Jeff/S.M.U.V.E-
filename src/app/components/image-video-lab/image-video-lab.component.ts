import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../services/ai.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-image-video-lab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './image-video-lab.component.html',
  styleUrls: ['./image-video-lab.component.css']
})
export class ImageVideoLabComponent {
  private aiService = inject(AiService);
  private notification = inject(NotificationService);

  activeTab = signal('image');
  imagePrompt = '';
  isGenerating = signal(false);
  generatedImageUrl = signal<string | null>(null);

  async generateImage() {
    if (!this.imagePrompt) return;

    this.isGenerating.set(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      this.generatedImageUrl.set('https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=2070&auto=format&fit=crop');
      this.notification.show('Cinematic Asset Synthesized', 'success');
    } catch (err) {
      this.notification.show('Neural Synthesis Failed', 'error');
    } finally {
      this.isGenerating.set(false);
    }
  }
}
