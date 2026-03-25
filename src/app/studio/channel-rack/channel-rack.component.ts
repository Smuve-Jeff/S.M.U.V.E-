import { LoggingService } from '../../services/logging.service';
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MusicManagerService,
  TrackModel,
} from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { InstrumentsService } from '../../services/instruments.service';

@Component({
  selector: 'app-channel-rack',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './channel-rack.component.html',
  styleUrls: ['./channel-rack.component.css'],
})
export class ChannelRackComponent {
  private logger = inject(LoggingService);
  public musicManager = inject(MusicManagerService);
  private engine = inject(AudioEngineService);
  private instruments = inject(InstrumentsService);

  tracks = this.musicManager.tracks;
  currentStep = this.engine.currentBeat;
  availablePresets = this.instruments.getPresets();

  steps = new Array(16).fill(0);

  toggleStep(track: TrackModel, index: number) {
    this.musicManager.toggleStep(track.id, index);
  }

  selectTrack(track: TrackModel) {
    this.logger.info('ChannelRack: Selecting track:', track.name, track.id);
    this.musicManager.selectedTrackId.set(track.id);
  }

  addTrack() {
    this.musicManager.ensureTrack('synth-lead');
  }

  removeTrack(id: number) {
    this.musicManager.removeTrack(id);
  }

  updateVolume(track: TrackModel, event: any) {
    this.musicManager.tracks.update((ts) =>
      ts.map((t) =>
        t.id === track.id ? { ...t, gain: +event.target.value / 100 } : t
      )
    );
  }

  updatePan(track: TrackModel, event: any) {
    this.musicManager.tracks.update((ts) =>
      ts.map((t) =>
        t.id === track.id ? { ...t, pan: +event.target.value / 100 } : t
      )
    );
  }

  toggleMute(track: TrackModel) {
    this.musicManager.toggleMute(track.id);
  }

  updateInstrument(track: TrackModel, presetId: string) {
    this.musicManager.setInstrument(track.id, presetId);
  }
}
