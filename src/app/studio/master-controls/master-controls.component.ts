import { Component, inject } from '@angular/core';
import { InstrumentService } from '../instrument.service';
import { GainReductionMeterComponent } from './gain-reduction-meter.component';

@Component({
  selector: 'app-master-controls',
  standalone: true,
  imports: [GainReductionMeterComponent],
  templateUrl: './master-controls.component.html',
  styleUrls: ['./master-controls.component.css'],
})
export class MasterControlsComponent {
  private readonly instrumentService = inject(InstrumentService);
  readonly compressor = this.instrumentService.getCompressor();

  updateMasterVolume(event: Event): void {
    const volume = (event.target as HTMLInputElement).valueAsNumber;
    this.instrumentService.setMasterVolume(volume);
  }

  updateReverb(event: Event): void {
    const mix = (event.target as HTMLInputElement).valueAsNumber;
    this.instrumentService.setReverbMix(mix);
  }
}
