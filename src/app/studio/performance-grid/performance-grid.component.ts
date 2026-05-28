import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MusicManagerService } from '../../services/music-manager.service';
import { HapticService } from '../../services/haptic.service';

@Component({
  selector: 'app-performance-grid',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './performance-grid.component.html',
  styleUrls: ['./performance-grid.component.css'],
})
export class PerformanceGridComponent {
  private musicManager = inject(MusicManagerService);
  private haptic = inject(HapticService);

  tracks = this.musicManager.tracks;
  activeClips = signal<Set<string>>(new Set());

  toggleClip(trackId: number, clipIndex: number) {
    this.haptic.light();
    const clipKey = `${trackId}-${clipIndex}`;
    this.activeClips.update((prev) => {
      const next = new Set(prev);
      if (next.has(clipKey)) {
        next.delete(clipKey);
      } else {
        next.add(clipKey);
      }
      return next;
    });
    // In a real impl, this would trigger playback in MusicManager/AudioEngine
  }
}
