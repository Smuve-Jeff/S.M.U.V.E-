import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AudioSessionService } from '../audio-session.service';
import { ChannelStripComponent } from '../channel-strip/channel-strip.component';
import {
  MusicManagerService,
  TrackModel,
} from '../../services/music-manager.service';
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

  updateTrackGain(id: number, value: number) {
    const gain = Math.max(0, Math.min(1, value / 100));
    this.musicManager.tracks.update((tracks) =>
      tracks.map((track) => (track.id === id ? { ...track, gain } : track))
    );
    this.musicManager.engine.updateTrack(id, { gain });
  }

  updateTrackPan(id: number, value: number) {
    const pan = Math.max(-1, Math.min(1, value / 100));
    this.musicManager.tracks.update((tracks) =>
      tracks.map((track) => (track.id === id ? { ...track, pan } : track))
    );
    this.musicManager.engine.updateTrack(id, { pan });
  }

  gainPercent(track: TrackModel): number {
    return Math.round(Math.max(0, Math.min(1, track.gain)) * 100);
  }

  panPercent(track: TrackModel): number {
    return Math.round(Math.max(-1, Math.min(1, track.pan)) * 100);
  }
}
