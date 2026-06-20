import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MusicManagerService, TrackModel } from '../../services/music-manager.service';

@Component({
  selector: 'app-track-inspector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './track-inspector.component.html',
  styleUrls: ['./track-inspector.component.css'],
})
export class TrackInspectorComponent {
  public musicManager = inject(MusicManagerService);
  showAdvanced = signal(false);

  toggleAdvanced() {
    this.showAdvanced.update(v => !v);
  }

  selectedTrack = computed<TrackModel | null>(() => {
    const id = this.musicManager.selectedTrackId();
    if (!id) return null;
    return this.musicManager.tracks().find((t) => t.id === id) || null;
  });

  updateParam(key: string, value: any) {
    const track = this.selectedTrack();
    if (!track) return;
    this.musicManager.updateSynthParams(track.id, { [key]: value });
  }

  getParam(key: string): any {
    return this.selectedTrack()?.synthParams?.[key] || 0;
  }
}
