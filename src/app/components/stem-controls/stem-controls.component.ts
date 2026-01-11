import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-stem-controls',
  templateUrl: './stem-controls.component.html',
  styleUrls: ['./stem-controls.component.scss']
})
export class StemControlsComponent {
  @Input() deckId!: 'A' | 'B';
  @Output() gainChange = new EventEmitter<{ stem: string, gain: number }>();

  stems = ['vocals', 'drums', 'bass', 'melody'];
  gainValues = {
    vocals: 1,
    drums: 1,
    bass: 1,
    melody: 1
  };

  onGainChange(stem: string, event: any) {
    const gain = parseFloat(event.target.value);
    // @ts-ignore
    this.gainValues[stem] = gain;
    this.gainChange.emit({ stem, gain });
  }
}
