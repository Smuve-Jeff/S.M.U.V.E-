import { Component } from '@angular/core';
import { MixerComponent } from './mixer/mixer.component';
import { SessionViewComponent } from './session-view/session-view.component';
import { TransportBarComponent } from './transport-bar/transport-bar.component';
import { MasterControlsComponent } from './master-controls/master-controls.component';

@Component({
  selector: 'app-studio',
  standalone: true,
  imports: [
    MixerComponent,
    SessionViewComponent,
    TransportBarComponent,
    MasterControlsComponent,
  ],
  templateUrl: './studio.component.html',
  styleUrls: ['./studio.component.css'],
})
export class StudioComponent {}
