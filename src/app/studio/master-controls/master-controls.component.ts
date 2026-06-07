import {
  Component,
  inject,
  signal,
  computed,
  HostListener,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { InstrumentService } from '../instrument.service';
import { AudioEngineService } from '../../services/audio-engine.service';
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
  private readonly exportService = inject(ExportService);
  private readonly notificationService = inject(NotificationService);
  private readonly elementRef = inject(ElementRef);
  public readonly audioEngine = inject(AudioEngineService);

  readonly compressor = this.instrumentService.getCompressor();
  isLimiterActive = signal(false);
  isSoftClipActive = signal(false);
  isFinishing = signal(false);
  isRecording = signal(false);
  isOfflineRendering = signal(false);
  selectedFormat = signal<'wav' | 'mp3' | 'aac'>('wav');
  isDropdownOpen = signal(false);

  masterVolume = signal(0.8);
  reverbMix = signal(0.1);

  masterVolumePercent = computed(() => Math.round(this.masterVolume() * 100));
  reverbMixPercent = computed(() => Math.round(this.reverbMix() * 100));

  private activeRecorder: any = null;

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isDropdownOpen.set(false);
    }
  }

  toggleDropdown(): void {
    this.isDropdownOpen.update((v) => !v);
  }

  toggleLimiter(): void {
    this.isLimiterActive.update((v) => !v);
    if (this.isLimiterActive()) {
      this.compressor.threshold.value = -0.1;
      this.compressor.ratio.value = 20;
    } else {
      this.compressor.threshold.value = -24;
      this.compressor.ratio.value = 12;
    }
  }

  toggleSoftClip(): void {
    this.isSoftClipActive.update((v) => {
      const next = !v;
      this.audioEngine.setSaturation(next ? 0.2 : 0);
      return next;
    });
  }

  updateMasterVolume(event: Event): void {
    const volume = (event.target as HTMLInputElement).valueAsNumber;
    this.masterVolume.set(volume);
    this.instrumentService.setMasterVolume(volume * 100);
  }

  updateReverb(event: Event): void {
    const mix = (event.target as HTMLInputElement).valueAsNumber;
    this.reverbMix.set(mix);
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

    result.then((blob) => {
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

  async finishTrack() {
    this.isFinishing.set(true);
    try {
      this.notificationService.show(
        'Neural Offline Render: Initializing...',
        'info'
      );

      // Step 1: Render the project offline
      const rawBuffer = await this.exportService.renderProjectOffline();

      // Step 2: Apply S.M.U.V.E. Polish (Mastering)
      const polishedBuffer =
        await this.exportService.applySmuvePolish(rawBuffer);

      // Step 3: Convert to desired format
      const blob = await this.exportService.exportToFormat(
        polishedBuffer,
        this.selectedFormat(),
        24
      );

      // Step 4: Download
      const extension =
        this.selectedFormat() === 'wav'
          ? 'wav'
          : this.selectedFormat() === 'mp3'
            ? 'mp3'
            : 'm4a';
      await this.exportService.downloadBlob(
        blob,
        `SMUVE_Mastered_Track_${Date.now()}.${extension}`
      );

      this.notificationService.show(
        'Mastering Complete: Track Exported & XP Awarded!',
        'success'
      );
    } catch (err) {
      this.notificationService.show(
        'Mastering Pipeline Failed: Sonic Link Severed.',
        'error'
      );
    } finally {
      this.isFinishing.set(false);
    }
  }
}
