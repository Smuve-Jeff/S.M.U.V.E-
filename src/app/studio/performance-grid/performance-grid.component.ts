import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MusicManagerService,
  TrackModel,
} from '../../services/music-manager.service';
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
  rows = Array.from({ length: 8 }, (_, index) => index);

  toggleClip(trackId: number, clipIndex: number) {
    this.haptic.light();
    this.musicManager.setActivePatternSlot(trackId, `slot-${clipIndex}`);
  }

  isActive(track: TrackModel, row: number) {
    return track.activePatternSlotId === `slot-${row}`;
  }

  slotName(track: TrackModel, row: number) {
    return (
      track.patternSlots?.find((slot) => slot.id === `slot-${row}`)?.name ||
      `Slot ${row + 1}`
    );
  }
}
