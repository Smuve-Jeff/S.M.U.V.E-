import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MusicManagerService } from '../../services/music-manager.service';
import { TrackModel } from '../../services/music-manager.service';

@Component({
  selector: 'app-channel-rack',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './channel-rack.component.html',
  styleUrls: ['./channel-rack.component.css']
})
export class ChannelRackComponent {
  private musicManager = inject(MusicManagerService);
  tracks = this.musicManager.tracks;

  selectTrack(id: string) {
    this.musicManager.selectedTrackId.set(id);
  }

  removeTrack(id: string) {
    this.musicManager.removeTrack(id);
  }

  addTrack() {
    this.musicManager.ensureTrack('cyber-lead');
  }

  setInstrument(track: TrackModel, presetId: string) {
    this.musicManager.setInstrument(track.id, presetId);
  }
}
