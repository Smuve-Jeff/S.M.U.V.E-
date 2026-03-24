import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReleasePipelineService } from '../../services/release-pipeline.service';

@Component({
  selector: 'app-lyric-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lyric-editor.component.html',
  styleUrls: ['./lyric-editor.component.css'],
})
export class LyricEditorComponent {
  private releaseService = inject(ReleasePipelineService);

  lyrics = signal<string>('');
  trackTitle = signal<string>('Untitled Track');

  aiSuggestions = signal<string[]>([
    'Try a more aggressive metaphor for the second verse.',
    'Rhyme suggestion: "Velocity" with "Atrocity"',
    'The hook could use a more rhythmic syncopation.',
  ]);

  saveLyrics() {
    // In a real app, this would save to the specific track in the release pipeline
    console.log('Lyrics saved:', this.lyrics());
  }
}
