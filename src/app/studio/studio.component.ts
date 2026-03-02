import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TransportBarComponent } from './transport-bar/transport-bar.component';
import { SessionViewComponent } from './session-view/session-view.component';
import { MixerComponent } from './mixer/mixer.component';
import { MasterControlsComponent } from './master-controls/master-controls.component';
import { PerformanceModeComponent } from './performance-mode/performance-mode.component';
import { SynthesizerComponent } from './synthesizer/synthesizer.component';
import { SoundPadComponent } from './sound-pad/sound-pad.component';
import { DjDeckComponent } from '../components/dj-deck/dj-deck.component';
import { ChannelRackComponent } from './channel-rack/channel-rack.component';
import { ArrangementViewComponent } from './arrangement-view/arrangement-view.component';
import { PianoRollComponent } from './piano-roll/piano-roll.component';
import { WaveformRendererComponent } from './waveform-renderer/waveform-renderer.component';
import { AudioSessionService } from './audio-session.service';
import { SequencerService } from './sequencer.service';

@Component({
  selector: 'app-studio',
  standalone: true,
  imports: [
    CommonModule,
    TransportBarComponent,
    SessionViewComponent,
    MixerComponent,
    MasterControlsComponent,
    PerformanceModeComponent,
    SynthesizerComponent,
    SoundPadComponent,
    DjDeckComponent,
    ChannelRackComponent,
    ArrangementViewComponent,
    PianoRollComponent,
    WaveformRendererComponent
  ],
  templateUrl: './studio.component.html',
  styleUrls: ['./studio.component.css']
})
export class StudioComponent {
  private readonly audioSession = inject(AudioSessionService);
  public readonly sequencer = inject(SequencerService);

  isPerformanceMode = false;
  activeView = signal<'daw' | 'rack' | 'mixer' | 'dj'>('daw');
  showPianoRoll = signal(false);
  isRecording = this.audioSession.isRecording;

  constructor() {
    effect(() => {
      const selectedId = this.sequencer.selectedTrackId();
      console.log('StudioComponent: selectedTrackId changed:', selectedId);
      this.showPianoRoll.set(!!selectedId);
    });
  }

  togglePerformanceMode() {
    this.isPerformanceMode = !this.isPerformanceMode;
  }
}
