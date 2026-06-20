import { LoggingService } from '../../services/logging.service';
import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MusicManagerService,
  TrackModel,
} from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { InstrumentsService } from '../../services/instruments.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-channel-rack',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './channel-rack.component.html',
  styleUrls: ['./channel-rack.component.css'],
})
export class ChannelRackComponent {
  private logger = inject(LoggingService);
  public musicManager = inject(MusicManagerService);
  private engine = inject(AudioEngineService);
  private instruments = inject(InstrumentsService);

  tracks = this.musicManager.tracks;
  currentStep = this.musicManager.currentStep;

  steps = new Array(16).fill(0);
  selectedTrackId = this.musicManager.selectedTrackId;

  toggleStep(track: TrackModel, index: number) {
    this.musicManager.toggleStep(track.id, index);
  }

  selectTrack(track: any) {
    this.musicManager.selectedTrackId.set(track.id);
  }

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
    this.musicManager.tracks.update((ts) =>
      ts.map((t) => (t.id === track.id ? { ...t, pan: val } : t))
    );
    this.engine.updateTrack(track.id, { pan: val });
  }

  toggleMute(track: TrackModel) {
    this.musicManager.toggleMute(track.id);
  }

  onDrop(event: DragEvent, track: TrackModel) {
    event.preventDefault();
    const data = event.dataTransfer?.getData('application/json');
    if (data) {
      const { presetId } = JSON.parse(data);
      this.musicManager.setInstrument(track.id, presetId);
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
  }
}
