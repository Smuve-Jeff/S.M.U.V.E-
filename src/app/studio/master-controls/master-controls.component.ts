import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InstrumentService } from '../instrument.service';
import { ReputationService } from '../../services/reputation.service';
import { ExportService } from '../../services/export.service';
import { GainReductionMeterComponent } from './gain-reduction-meter.component';
import { NotificationService } from '../../services/notification.service';

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
  private readonly exportService = inject(ExportService);
  private readonly notificationService = inject(NotificationService);

  readonly compressor = this.instrumentService.getCompressor();
  isLimiterActive = signal(false);
  isSoftClipActive = signal(false);
  isFinishing = signal(false);
  isRecording = signal(false);

  private activeRecorder: any = null;

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
  }

  updateMasterVolume(event: Event): void {
    const volume = (event.target as HTMLInputElement).valueAsNumber;
    this.instrumentService.setMasterVolume(volume * 100);
  }

  updateReverb(event: Event): void {
    const mix = (event.target as HTMLInputElement).valueAsNumber;
    this.instrumentService.setReverbMix(mix);
  }

  toggleRecording() {
    if (this.isRecording()) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  private startRecording() {
    const { recorder, result } = this.exportService.startLiveRecording();
    this.activeRecorder = recorder;
    this.isRecording.set(true);
    this.notificationService.show('Recording Started...', 'success');

    result.then(blob => {
      this.exportService.downloadBlob(blob, `SMUVE_Session_${Date.now()}.webm`);
      this.notificationService.show('Recording Saved to Device', 'success');
    });
  }

  private stopRecording() {
    if (this.activeRecorder) {
      this.activeRecorder.stop();
      this.activeRecorder = null;
      this.isRecording.set(false);
    }
  }

  finishTrack() {
    this.isFinishing.set(true);
    setTimeout(() => {
      this.reputationService.addXp(200);
      this.isFinishing.set(false);
      this.notificationService.show('Track Exported & XP Awarded!', 'success');
    }, 3000);
  }
}
