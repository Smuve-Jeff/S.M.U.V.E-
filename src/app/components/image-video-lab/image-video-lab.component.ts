import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-image-video-lab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-video-lab.component.html',
  styleUrls: ['./image-video-lab.component.css']
})
export class ImageVideoLabComponent {
  hqEnhancer = signal(true);
  selectedTemplate = signal('Cinematic Narrative');

  toggleEnhancer() {
    this.hqEnhancer.update(v => !v);
  }
}
