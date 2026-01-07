import { Component, ChangeDetectionStrategy, signal, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppTheme, DeckState, initialDeckState } from '../../services/user-context.service';
import { SampleLibraryComponent } from '../sample-library/sample-library.component';

@Component({
  selector: 'app-dj-deck',
  standalone: true,
  imports: [CommonModule, FormsModule, SampleLibraryComponent],
  templateUrl: './dj-deck.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DjDeckComponent {
  theme = input.required<AppTheme>();

  deckA = signal<DeckState>({ ...initialDeckState, playbackRate: 1 });
  deckB = signal<DeckState>({ ...initialDeckState, playbackRate: 1 });
  crossfade = signal(0);

  midiEnabled = signal(false);
  phantomPowerEnabled = signal(false);
  showSampleLibrary = signal(false);

  pitchAPercentage = computed(() => `${(this.deckA().playbackRate * 100).toFixed(1)}%`);
  pitchBPercentage = computed(() => `${(this.deckB().playbackRate * 100).toFixed(1)}%`);
}