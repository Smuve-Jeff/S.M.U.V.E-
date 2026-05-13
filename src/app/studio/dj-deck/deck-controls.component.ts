import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-deck-controls',
  standalone: true,
  imports: [CommonModule],
  template: '<div>Deck Controls {{deckId}}</div>',
})
export class DeckControlsComponent {
  @Input() deckId: string = '';
}
