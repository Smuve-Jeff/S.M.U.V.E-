import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AudioSessionService } from '../audio-session.service';
import { ChannelStripComponent } from '../channel-strip/channel-strip.component';
import { Clip } from '../instrument.service';

@Component({
  selector: 'app-mixer',
  standalone: true,
  imports: [CommonModule, ChannelStripComponent],
  templateUrl: './mixer.component.html',
  styleUrls: ['./mixer.component.css'],
})
export class MixerComponent {
  private readonly audioSession = inject(AudioSessionService);

  @Input() activeClip: Clip | null = null;
  micChannels = this.audioSession.micChannels;
  masterVolume = this.audioSession.masterVolume;

  updateMasterVolume(newVolume: number): void {
    this.audioSession.updateMasterVolume(newVolume);
  }
}
