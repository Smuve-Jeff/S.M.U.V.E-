import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MusicManagerService } from '../../services/music-manager.service';

@Component({
  selector: 'app-track-inspector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './track-inspector.component.html',
  styleUrls: ['./track-inspector.component.css'],
})
export class TrackInspectorComponent {
  public musicManager = inject(MusicManagerService);

  selectedTrack = computed(() =>
    this.musicManager.tracks().find((t) => t.id === this.musicManager.selectedTrackId())
  );

  updateParam(key: string, value: any) {
    const track = this.selectedTrack();
    if (!track) return;
    this.musicManager.updateSynthParams(track.id, { [key]: value });
  }

  getParam(key: string): any {
    return this.selectedTrack()?.synthParams?.[key] || 0;
  }
}
