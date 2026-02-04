import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MixerComponent } from './mixer/mixer.component';
import { SessionViewComponent } from './session-view/session-view.component';
import { TransportBarComponent } from './transport-bar/transport-bar.component';
import { MasterControlsComponent } from './master-controls/master-controls.component';
import { PerformanceModeComponent } from './performance-mode/performance-mode.component';
import { AudioSessionService } from './audio-session.service';

@Component({
  selector: 'app-studio',
  standalone: true,
  imports: [
    CommonModule,
    MixerComponent,
    SessionViewComponent,
    TransportBarComponent,
    MasterControlsComponent,
    PerformanceModeComponent,
  ],
  templateUrl: './studio.component.html',
  styleUrls: ['./studio.component.css'],
})
export class StudioComponent {
  audioSession = inject(AudioSessionService);
  isPerformanceMode = false;

  togglePerformanceMode() {
    this.isPerformanceMode = !this.isPerformanceMode;
  }
}
