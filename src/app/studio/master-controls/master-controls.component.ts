import { Component, inject } from '@angular/core';
import { InstrumentService } from '../instrument.service';
import { GainReductionMeterComponent } from './gain-reduction-meter.component';
import { AudioEngineService } from '../../services/audio-engine.service';

@Component({
  selector: 'app-master-controls',
  standalone: true,
  imports: [GainReductionMeterComponent],
  templateUrl: './master-controls.component.html',
  styleUrls: ['./master-controls.component.css']
})
export class MasterControlsComponent {
  private readonly instrumentService = inject(InstrumentService);
  private readonly engine = inject(AudioEngineService);
  readonly compressor = this.instrumentService.getCompressor();
  isLimiterActive = false;
  isSoftClipActive = false;

  toggleLimiter(): void {
    this.isLimiterActive = !this.isLimiterActive;
    this.engine.configureLimiter({
      enabled: this.isLimiterActive,
      ceiling: -0.1,
      release: 0.1
    });
  }

  toggleSoftClip(): void {
    this.isSoftClipActive = !this.isSoftClipActive;
    this.engine.setSaturation(this.isSoftClipActive ? 400 : 0);
  }

  updateMasterVolume(event: Event): void {
    const volume = (event.target as HTMLInputElement).valueAsNumber;
    this.instrumentService.setMasterVolume(volume);
     this.engine.recordAutomation('master-volume', volume / 100);
  }

  updateReverb(event: Event): void {
    const mix = (event.target as HTMLInputElement).valueAsNumber;
    this.instrumentService.setReverbMix(mix);
  }
}
