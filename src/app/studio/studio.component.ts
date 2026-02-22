import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TransportBarComponent } from './transport-bar/transport-bar.component';
import { SessionViewComponent } from './session-view/session-view.component';
import { MixerComponent } from './mixer/mixer.component';
import { MasterControlsComponent } from './master-controls/master-controls.component';
import { PerformanceModeComponent } from './performance-mode/performance-mode.component';
import { Clip } from './instrument.service';
import { SynthesizerComponent } from './synthesizer/synthesizer.component';
import { SoundPadComponent } from './sound-pad/sound-pad.component';

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
    SoundPadComponent
  ],
  templateUrl: './studio.component.html',
  styleUrls: ['./studio.component.css']
})
export class StudioComponent {
  isPerformanceMode = false;
  selectedClip: Clip | null = null;
  performancePads = [
    { name: 'Pad 1', isPlaying: false },
    { name: 'Pad 2', isPlaying: true },
    { name: 'Pad 3', isPlaying: false },
    { name: 'Pad 4', isPlaying: false },
    { name: 'Pad 5', isPlaying: false },
    { name: 'Pad 6', isPlaying: false },
    { name: 'Pad 7', isPlaying: false },
    { name: 'Pad 8', isPlaying: false },
  ];

  soundPads = [
    { id: 1, name: 'Kick', isPlaying: false },
    { id: 2, name: 'Snare', isPlaying: false },
    { id: 3, name: 'Hi-Hat', isPlaying: false },
    { id: 4, name: 'Tom 1', isPlaying: false },
    { id: 5, name: 'Tom 2', isPlaying: false },
    { id: 6, name: 'Crash', isPlaying: false },
    { id: 7, name: 'Ride', isPlaying: false },
    { id: 8, name: 'FX', isPlaying: false },
  ];


  togglePerformanceMode() {
    this.isPerformanceMode = !this.isPerformanceMode;
  }

  onPadClicked(pad: any) {
    console.log('Pad clicked:', pad);
    // Add logic to handle pad clicks in performance mode
  }

  onSoundPadTriggered(pad: any) {
    console.log('Sound pad triggered:', pad);
    pad.isPlaying = !pad.isPlaying;
    // Here you would typically trigger the sound associated with the pad
  }
}
