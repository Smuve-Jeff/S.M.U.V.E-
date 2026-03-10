import { Component, Input, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AudioSessionService } from '../audio-session.service';
import { ChannelStripComponent } from '../channel-strip/channel-strip.component';
import { MusicManagerService } from '../../services/music-manager.service';
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
  public readonly musicManager = inject(MusicManagerService);

  @Input() activeClip: Clip | null = null;

  micChannels = this.audioSession.micChannels;
  masterVolume = this.audioSession.masterVolume;

  // Dynamic tracks from MusicManager
  tracks = this.musicManager.tracks;

  updateMasterVolume(newVolume: number): void {
    this.audioSession.updateMasterVolume(newVolume);
  }

  toggleMute(id: number) {
    this.musicManager.toggleMute(id);
  }

  toggleSolo(id: number) {
    this.musicManager.toggleSolo(id);
  }
}
