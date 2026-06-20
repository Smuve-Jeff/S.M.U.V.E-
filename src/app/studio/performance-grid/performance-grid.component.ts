import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { AudioSessionService } from '../audio-session.service';
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
  private audioSession = inject(AudioSessionService);

  trackLevels = signal<Record<number, number>>({});
  private analysers = new Map<number, AnalyserNode>();
  private animationFrame: number | null = null;

  tracks = this.musicManager.tracks;
  rows = Array.from({ length: 8 }, (_, index) => index);

  ngOnInit() {
    this.startMetering();
  }

  ngOnDestroy() {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
  }

  private startMetering() {
    const update = () => {
      const levels: Record<number, number> = {};
      this.tracks().forEach(track => {
        let analyser = this.analysers.get(track.id);
        if (!analyser) {
          analyser = this.audioSession.engine.ctx.createAnalyser();
          analyser.fftSize = 32;
          this.audioSession.engine.getTrackOutput(track.id).connect(analyser);
          this.analysers.set(track.id, analyser);
        }
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        levels[track.id] = (data.reduce((a,b) => a+b, 0) / data.length) / 255;
      });
      this.trackLevels.set(levels);
      this.animationFrame = requestAnimationFrame(update);
    };
    this.animationFrame = requestAnimationFrame(update);
  }

  getTrackLevel(id: number) { return this.trackLevels()[id] || 0; }

  toggleClip(trackId: string, clipIndex: number) {
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
