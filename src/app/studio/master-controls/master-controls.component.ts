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
  isLimiterActive = false;
  isSoftClipActive = false;

  toggleLimiter(): void {
    this.isLimiterActive = !this.isLimiterActive;
    if (this.isLimiterActive) {
      this.compressor.threshold.value = -0.1;
      this.compressor.ratio.value = 20;
    } else {
      this.compressor.threshold.value = -24;
      this.compressor.ratio.value = 12;
    }
  }

  toggleSoftClip(): void {
    this.isSoftClipActive = !this.isSoftClipActive;
    // Logic for soft-clipping would ideally be a WaveShaperNode
    // For this upgrade, we represent it as a state change in the UI
    console.log('Soft Clip toggled:', this.isSoftClipActive);
  }

  updateMasterVolume(event: Event): void {
    const volume = (event.target as HTMLInputElement).valueAsNumber;
    this.instrumentService.setMasterVolume(volume);
  }

  updateReverb(event: Event): void {
    const mix = (event.target as HTMLInputElement).valueAsNumber;
    this.instrumentService.setReverbMix(mix);
  }
}
