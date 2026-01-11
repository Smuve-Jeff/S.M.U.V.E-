import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-stem-controls',
  templateUrl: './stem-controls.component.html',
  styleUrls: ['./stem-controls.component.scss'],
  standalone: true,
  imports: [CommonModule],
})
export class StemControlsComponent {
  @Input() deckId!: 'A' | 'B';
  @Output() gainChange = new EventEmitter<{ stem: string; gain: number }>();

  stems = ['vocals', 'drums', 'bass', 'melody'];
  gainValues: { [key: string]: number } = {
    vocals: 1,
    drums: 1,
    bass: 1,
    melody: 1,
  };

  onGainChange(stem: string, event: Event) {
    const gain = parseFloat((event.target as HTMLInputElement).value);
    this.gainValues[stem] = gain;
    this.gainChange.emit({ stem, gain });
  }
}
