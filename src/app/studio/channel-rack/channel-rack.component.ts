import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MusicManagerService,
  TrackModel,
} from '../../services/music-manager.service';

@Component({
  selector: 'app-channel-rack',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './channel-rack.component.html',
  styleUrls: ['./channel-rack.component.css'],
})
export class ChannelRackComponent {
  public musicManager = inject(MusicManagerService);
  tracks = this.musicManager.tracks;
  selectedTrackId = this.musicManager.selectedTrackId;
  currentStep = this.musicManager.engine.visualStep;
  steps = new Array(16).fill(0);

  selectTrack(track: TrackModel) {
    this.musicManager.selectedTrackId.set(track.id);
  }

  removeTrack(id: string) {
    this.musicManager.removeTrack(id);
  }

  addTrack() {
    this.musicManager.ensureTrack('cyber-lead');
  }

  setInstrument(track: any, presetId: string) {
    this.musicManager.setInstrument(track.id, presetId);
  }

  toggleMute(track: TrackModel) {
    this.musicManager.toggleMute(track.id);
  }

  toggleSolo(track: TrackModel) {
    this.musicManager.toggleSolo(track.id);
  }

  updateVolume(track: TrackModel, val: number) {
    this.musicManager.updateVolume(track.id, val);
  }

  updatePan(track: TrackModel, val: number) {
    this.musicManager.updateTrackPan(track.id, val * 100);
  }

  toggleStep(track: TrackModel, stepIdx: number) {
    const existing = track.notes.find((n) => Math.floor(n.step) === stepIdx);
    if (existing) {
      this.musicManager.removeNotes(track.id, [existing.id]);
    } else {
      this.musicManager.addNoteToTrack(track.id, {
        id: 'step_' + Date.now(),
        midi: track.type === 'drum' ? 36 : 60,
        step: stepIdx,
        length: 1,
        velocity: 0.8,
      });
    }
  }

  onDrop(event: DragEvent, track: TrackModel) {
    event.preventDefault();
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  cloneTrack(track: TrackModel) {
    this.musicManager.addTrack(
      track.name + ' (Copy)',
      track.instrumentId,
      track.type
    );
  }

  reorderTrack(index: number, direction: 'up' | 'down') {
    const newTracks = [...this.tracks()];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex >= 0 && targetIndex < newTracks.length) {
      [newTracks[index], newTracks[targetIndex]] = [
        newTracks[targetIndex],
        newTracks[index],
      ];
      this.musicManager.tracks.set(newTracks);
    }
  }

  openPianoRoll(track: TrackModel) {
    this.musicManager.selectedTrackId.set(track.id);
  }
}
