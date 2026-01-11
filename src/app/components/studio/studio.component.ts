import { Component, ChangeDetectionStrategy, signal, computed, inject } from '@angular/core';
import { NgFor } from '@angular/common';
import { SessionViewComponent } from '../../studio/session-view/session-view.component';
import { MixerComponent } from '../../studio/mixer/mixer.component';
import { SynthesizerComponent } from '../../studio/synthesizer/synthesizer.component';
import { PerformanceModeComponent } from '../../studio/performance-mode/performance-mode.component';
import { AudioSessionService } from '../../studio/audio-session.service';

@Component({
  selector: 'app-studio',
  standalone: true,
  imports: [NgFor, SessionViewComponent, MixerComponent, SynthesizerComponent, PerformanceModeComponent],
  templateUrl: './studio.component.html',
  styleUrls: ['./studio.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioComponent {
  private readonly audioSession = inject(AudioSessionService);

  isRecording = this.audioSession.isRecording;

  recordingStatus = computed(() =>
    this.isRecording() ? 'RECORDING' : 'STANDBY'
  );

  toggleRecording(): void {
    this.isRecording.update((rec) => !rec);
  }
}
