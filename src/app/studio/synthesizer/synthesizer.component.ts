import { Component, inject } from '@angular/core';
import { InstrumentService } from '../instrument.service';
import { OscillatorType } from '../subtractive-synth';

@Component({
  selector: 'app-synthesizer',
  standalone: true,
  imports: [],
  templateUrl: './synthesizer.component.html',
  styleUrls: ['./synthesizer.component.css'],
})
export class SynthesizerComponent {
  private readonly instrumentService = inject(InstrumentService);

  playNote(note: number): void {
    this.instrumentService.play(0, note, 127);
  }

  stopNote(note: number): void {
    this.instrumentService.stop(0, note);
  }

  updateFilterCutoff(event: Event): void {
    const cutoff = (event.target as HTMLInputElement).valueAsNumber;
    this.instrumentService.setFilterCutoff(0, cutoff);
  }

  updateOscillatorType(event: Event): void {
    const type = (event.target as HTMLSelectElement).value as OscillatorType;
    this.instrumentService.setOscillatorType(0, type);
  }
}
