import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MusicManagerService, TrackModel } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { InstrumentsService } from '../../services/instruments.service';

@Component({
  selector: 'app-channel-rack',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './channel-rack.component.html',
  styleUrls: ['./channel-rack.component.css']
})
export class ChannelRackComponent {
  public musicManager = inject(MusicManagerService);
  public engine = inject(AudioEngineService);
  private instruments = inject(InstrumentsService);

  tracks = this.musicManager.tracks;
  selectedTrackId = this.musicManager.selectedTrackId;

  toggleStep(track: TrackModel, index: number) {
    this.musicManager.toggleStep(track.id, index);
  }

  selectTrack(track: any) {
    this.musicManager.selectedTrackId.set(track.id);
  }

  updateGain(track: TrackModel, val: number) {
    this.musicManager.tracks.update(ts => ts.map(t => t.id === track.id ? { ...t, gain: val } : t));
  addTrack() {
    this.musicManager.ensureTrack('cyber-lead');
  }

  removeTrack(id: string) {
    this.musicManager.removeTrack(id);
  }

  updateVolume(track: TrackModel, val: number) {
    this.musicManager.tracks.update((ts) =>
      ts.map((t) => (t.id === track.id ? { ...t, gain: val } : t))
    );
    this.engine.updateTrack(track.id, { gain: val });
  }

  updatePan(track: TrackModel, val: number) {
    this.musicManager.tracks.update(ts => ts.map(t => t.id === track.id ? { ...t, pan: val } : t));
    this.engine.updateTrack(track.id, { pan: val });
  }

  toggleMute(track: TrackModel) {
    this.musicManager.toggleMute(track.id);
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
