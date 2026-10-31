import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReleasePipelineService } from '../../services/release-pipeline.service';

const LYRIC_DRAFT_KEY = 'smuve_lyric_draft';

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

  /**
   * Fixed writing prompts, not generated lines: the editor has no model call,
   * so the panel must not present these as an analysis of the artist's lyrics.
   */
  rhymeStarters = signal<string[]>([
    'Try a more aggressive metaphor for the second verse.',
    'Rhyme pair: "velocity" with "atrocity"',
    'The hook could use a more rhythmic syncopation.',
  ]);

  savedAt = signal<number | null>(null);
  saveError = signal('');

  constructor() {
    try {
      const raw = localStorage.getItem(LYRIC_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        lyrics?: unknown;
        title?: unknown;
        savedAt?: unknown;
      };
      if (typeof draft.lyrics === 'string') this.lyrics.set(draft.lyrics);
      if (typeof draft.title === 'string') this.trackTitle.set(draft.title);
      if (typeof draft.savedAt === 'number') this.savedAt.set(draft.savedAt);
    } catch {
      // A blocked or corrupt draft store just means starting empty.
    }
  }

  /** Save the draft in this browser. This is not a release-pipeline commit. */
  saveLyrics() {
    try {
      const savedAt = Date.now();
      localStorage.setItem(
        LYRIC_DRAFT_KEY,
        JSON.stringify({
          lyrics: this.lyrics(),
          title: this.trackTitle(),
          savedAt,
        })
      );
      this.savedAt.set(savedAt);
      this.saveError.set('');
    } catch {
      this.saveError.set('Draft could not be saved in this browser.');
    }
  }
}
