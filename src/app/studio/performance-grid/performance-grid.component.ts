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
export class PerformanceGridComponent implements OnInit, OnDestroy {
  private musicManager = inject(MusicManagerService);
  private haptic = inject(HapticService);
  private audioSession = inject(AudioSessionService);

  trackLevels = signal<Record<string, number>>({});
  private analysers = new Map<string, AnalyserNode>();
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
      const levels: Record<string, number> = {};
      this.tracks().forEach((track) => {
        let analyser = this.analysers.get(track.id);
        if (!analyser) {
          analyser = this.audioSession.engine.ctx.createAnalyser();
          analyser.fftSize = 32;
          this.audioSession.engine.getTrackOutput(track.id).connect(analyser);
          this.analysers.set(track.id, analyser);
        }
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        levels[track.id] = data.reduce((a, b) => a + b, 0) / data.length / 255;
      });
      this.trackLevels.set(levels);
      this.animationFrame = requestAnimationFrame(update);
    };
    this.animationFrame = requestAnimationFrame(update);
  }

  getTrackLevel(id: string) {
    return this.trackLevels()[id] || 0;
  }

  private slotId(row: number): string {
    return `slot-${row}`;
  }

  /** Latest captured notes for a scene (empty scene = never captured). */
  hasContent(track: TrackModel, row: number): boolean {
    const slot = track.patternSlots?.find((s) => s.id === this.slotId(row));
    const version = slot?.versions[slot.versions.length - 1];
    if (!version) return false;
    return version.notes.length > 0 || version.steps.some(Boolean);
  }

  /**
   * Scene trigger: empty scenes CAPTURE the track's current pattern,
   * filled scenes LAUNCH their captured pattern. The header promise
   * ("tap slot to trigger") now holds — notes/steps actually switch.
   */
  toggleClip(trackId: string, clipIndex: number) {
    const track = this.tracks().find((t) => t.id === trackId);
    if (!track) return;
    const slotId = this.slotId(clipIndex);
    this.haptic.light();
    if (this.hasContent(track, clipIndex)) {
      this.musicManager.recallPatternSlot(trackId, slotId);
    } else {
      this.musicManager.capturePatternSlot(
        trackId,
        slotId,
        `Scene ${clipIndex + 1}`
      );
    }
  }

  /** Right-click a filled scene to overwrite it with the current pattern. */
  recaptureClip(track: TrackModel, clipIndex: number) {
    this.haptic.medium();
    this.musicManager.capturePatternSlot(
      track.id,
      this.slotId(clipIndex),
      `Scene ${clipIndex + 1}`
    );
  }

  isActive(track: TrackModel, row: number) {
    return track.activePatternSlotId === this.slotId(row);
  }

  slotName(track: TrackModel, row: number) {
    return (
      track.patternSlots?.find((slot) => slot.id === this.slotId(row))?.name ||
      `Slot ${row + 1}`
    );
  }
}
