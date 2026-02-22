import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InstrumentService } from '../instrument.service';
import { ReputationService } from '../../services/reputation.service';
import { GainReductionMeterComponent } from './gain-reduction-meter.component';

@Component({
  selector: 'app-master-controls',
  standalone: true,
  imports: [CommonModule, GainReductionMeterComponent],
  templateUrl: './master-controls.component.html',
  styleUrls: ['./master-controls.component.css'],
})
export class MasterControlsComponent {
  private readonly instrumentService = inject(InstrumentService);
  private readonly reputationService = inject(ReputationService);

  readonly compressor = this.instrumentService.getCompressor();
  isLimiterActive = signal(false);
  isSoftClipActive = signal(false);
  isFinishing = signal(false);

  toggleLimiter(): void {
    this.isLimiterActive.update(v => !v);
    if (this.isLimiterActive()) {
      this.compressor.threshold.value = -0.1;
      this.compressor.ratio.value = 20;
    } else {
      this.compressor.threshold.value = -24;
      this.compressor.ratio.value = 12;
    }
  }

  toggleSoftClip(): void {
    this.isSoftClipActive.update(v => !v);
    console.log('Soft Clip toggled:', this.isSoftClipActive());
  }

  updateMasterVolume(event: Event): void {
    const volume = (event.target as HTMLInputElement).valueAsNumber;
    this.instrumentService.setMasterVolume(volume);
  }

  updateReverb(event: Event): void {
    const mix = (event.target as HTMLInputElement).valueAsNumber;
    this.instrumentService.setReverbMix(mix);
  }

  finishTrack() {
    this.isFinishing.set(true);
    setTimeout(() => {
      this.reputationService.addXp(200);
      this.isFinishing.set(false);
      alert('Congratulations! Track Finished. +200 XP Awarded.');
    }, 3000);
  }
}
