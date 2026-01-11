import { Component, inject } from '@angular/core';
import { AudioSessionService } from '../audio-session.service';
import { GainReductionMeterComponent } from './gain-reduction-meter.component';

@Component({
  selector: 'app-master-controls',
  standalone: true,
  imports: [GainReductionMeterComponent],
  templateUrl: './master-controls.component.html',
  styleUrls: ['./master-controls.component.css']
})
export class MasterControlsComponent {
  private readonly audioSession = inject(AudioSessionService);
  readonly compressor = this.audioSession.compressor;

  updateMasterVolume(event: Event): void {
    const volume = (event.target as HTMLInputElement).valueAsNumber;
    this.audioSession.updateMasterVolume(volume);
  }

  updateReverb(event: Event): void {
    const mix = (event.target as HTMLInputElement).valueAsNumber;
    this.audioSession.setReverbMix(mix);
  }
}
