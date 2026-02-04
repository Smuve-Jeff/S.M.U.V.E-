import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MusicManagerService, TrackNote } from '../../services/music-manager.service';

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './timeline.component.html',
  styleUrls: ['./timeline.component.css'],
})
export class TimelineComponent {
  private music = inject(MusicManagerService);

  tracks = this.music.tracks;
  currentStep = this.music.currentStep;
  steps = Array.from({ length: 32 }, (_, i) => i);

  toggleNote(trackId: number, step: number) {
    const track = this.tracks().find(t => t.id === trackId);
    if (!track) return;

    const existingNote = track.notes.find(n => n.step === step);
    if (existingNote) {
      this.music.removeNote(trackId, existingNote.midi, step);
    } else {
      this.music.addNote(trackId, 60, step);
    }
  }

  hasNote(trackId: number, step: number): boolean {
    const track = this.tracks().find(t => t.id === trackId);
    return !!track?.notes.some(n => n.step === step);
  }
}
