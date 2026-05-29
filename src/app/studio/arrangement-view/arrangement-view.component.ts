import {
  Component,
  signal,
  computed,
  inject,
  ElementRef,
  ViewChild,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import {
  MusicManagerService,
  ArrangementClip,
  TrackModel,
} from '../../services/music-manager.service';

@Component({
  selector: 'app-arrangement-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './arrangement-view.component.html',
  styleUrls: ['./arrangement-view.component.css'],
})
export class ArrangementViewComponent {
  public readonly audioSession = inject(AudioSessionService);
  public readonly musicManager = inject(MusicManagerService);

  @ViewChild('gridViewport') gridViewport!: ElementRef<HTMLDivElement>;

  readonly barWidth = 100;
  readonly laneHeight = 80;
  readonly rulerHeight = 35;
  readonly snapEnabled = signal(true);
  readonly tracks = this.musicManager.tracks;
  readonly bars = computed(() =>
    Array.from({ length: this.getLoopBarCount() }, (_, index) => index)
  );
  readonly gridWidth = computed(() => this.bars().length * this.barWidth);
  readonly playheadPos = computed(
    () => (this.musicManager.currentStep() / 16) * this.barWidth
  );
  readonly canvasHeight = computed(
    () => this.rulerHeight + this.tracks().length * this.laneHeight
  );

  private draggingClip: {
    trackId: number;
    clipId: string;
    startX: number;
    initialStart: number;
  } | null = null;

  private getLoopBarCount() {
    const activeLoopBars = (
      this.musicManager as MusicManagerService & {
        activeLoopBars: number | (() => number);
      }
    ).activeLoopBars;
    return typeof activeLoopBars === 'function'
      ? activeLoopBars()
      : activeLoopBars || 64;
  }

  addTrack(): void {
    this.musicManager.ensureTrack('grand-piano-v2');
  }

  selectTrack(trackId: number): void {
    this.musicManager.selectedTrackId.set(trackId);
  }

  isTrackSelected(trackId: number): boolean {
    return this.musicManager.selectedTrackId() === trackId;
  }

  toggleMute(trackId: number, event?: Event): void {
    event?.stopPropagation();
    this.musicManager.toggleMute(trackId);
  }

  toggleSolo(trackId: number, event?: Event): void {
    event?.stopPropagation();
    this.musicManager.toggleSolo(trackId);
  }

  toggleSnap() {
    this.snapEnabled.update((value) => !value);
  }

  onLanePointerDown(event: PointerEvent, track: TrackModel) {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest('.clip-item') || target.closest('.clip-remove')) {
      return;
    }

    const start = this.resolveBarFromEvent(event);
    const slotId =
      track.activePatternSlotId || track.patternSlots?.[0]?.id || 'slot-0';
    const slotName =
      track.patternSlots?.find((slot) => slot.id === slotId)?.name || 'Pattern';
    this.selectTrack(track.id);
    this.musicManager.addClipToTrack(track.id, {
      start,
      length: 4,
      slotId,
      name: slotName,
      color: track.color,
    });
  }

  onClipPointerDown(
    event: PointerEvent,
    trackId: number,
    clip: ArrangementClip
  ) {
    event.preventDefault();
    event.stopPropagation();
    this.draggingClip = {
      trackId,
      clipId: clip.id,
      startX: event.clientX,
      initialStart: clip.start,
    };
  }

  removeClip(event: Event, trackId: number, clipId: string) {
    event.stopPropagation();
    this.musicManager.tracks.update((tracks) =>
      tracks.map((track) =>
        track.id === trackId
          ? {
              ...track,
              clips: track.clips.filter((clip) => clip.id !== clipId),
            }
          : track
      )
    );
  }

  clipLabel(track: TrackModel, clip: ArrangementClip) {
    if (clip.name) {
      return clip.name;
    }

    return (
      track.patternSlots?.find((slot) => slot.id === clip.slotId)?.name ||
      'Pattern'
    );
  }

  @HostListener('window:pointermove', ['$event'])
  onPointerMove(event: PointerEvent) {
    if (!this.draggingClip) {
      return;
    }

    const deltaBars =
      (event.clientX - this.draggingClip.startX) / this.barWidth;
    const nextStart = this.quantizeBar(
      this.draggingClip.initialStart + deltaBars
    );
    this.musicManager.updateClip(
      this.draggingClip.trackId,
      this.draggingClip.clipId,
      {
        start: nextStart,
      }
    );
  }

  @HostListener('window:pointerup')
  @HostListener('window:pointercancel')
  stopDragging() {
    this.draggingClip = null;
  }

  private resolveBarFromEvent(event: PointerEvent) {
    const viewport = this.gridViewport?.nativeElement;
    const rect = viewport.getBoundingClientRect();
    const scrollLeft = viewport.scrollLeft;
    const rawBar = (event.clientX - rect.left + scrollLeft) / this.barWidth;
    return this.quantizeBar(rawBar);
  }

  private quantizeBar(value: number) {
    const increment = this.snapEnabled() ? 1 : 0.25;
    const quantized = Math.round(value / increment) * increment;
    const maxStart = Math.max(0, this.getLoopBarCount() - 0.25);
    return Math.max(0, Math.min(maxStart, quantized));
  }
}
