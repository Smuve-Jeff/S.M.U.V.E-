import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AudioSessionService } from '../audio-session.service';
import { ClipComponent } from '../clip/clip.component';

@Component({
  selector: 'app-session-view',
  standalone: true,
  imports: [CommonModule, ClipComponent],
  templateUrl: './session-view.component.html',
  styleUrls: ['./session-view.component.css'],
})
export class SessionViewComponent {
  private readonly audioSession = inject(AudioSessionService);
  micChannels = this.audioSession.micChannels;
}
