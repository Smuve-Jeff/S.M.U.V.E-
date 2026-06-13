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
  readonly isMobile = window.innerWidth <= 1024;
  readonly laneHeight = this.isMobile ? 110 : 80;
  readonly rulerHeight = 35;
  readonly snapEnabled = signal(true);
  readonly tracks = this.musicManager.tracks;
  readonly selectedClipIds = signal<Set<string>>(new Set());

  readonly bars = computed(() =>
    Array.from({ length: 64 }, (_, index) => index)
  );
  readonly gridWidth = computed(() => this.bars().length * this.barWidth);
  readonly playheadPos = computed(
    () => (this.musicManager.currentStep() / 16) * this.barWidth
  );
  readonly canvasHeight = computed(
    () => this.rulerHeight + this.tracks().length * this.laneHeight
  );

  addTrack() {
    this.musicManager.ensureTrack('grand-piano-v2');
  }

  toggleMute(id: number, event: Event) {
    event.stopPropagation();
    this.musicManager.toggleMute(id);
  }

  toggleSolo(id: number, event: Event) {
    event.stopPropagation();
    this.musicManager.toggleSolo(id);
  }

  removeTrack(trackId: number, event: Event) {
    event.stopPropagation();
    if (confirm("Delete this track?")) {
      this.musicManager.removeTrack(trackId);
    }
  }

  removeClip(event: Event, trackId: number, clipId: string) {
    event.stopPropagation();
    this.musicManager.removeClip(trackId, clipId);
  }

  selectTrack(id: number) {
    this.musicManager.selectedTrackId.set(id);
  }

  isTrackSelected(id: number) {
    return this.musicManager.selectedTrackId() === id;
  }

  clipLabel(track: TrackModel, clip: ArrangementClip) {
    return clip.name || track.name;
  }

  toggleSnap() {
    this.snapEnabled.update(v => !v);
  }

  splitAtPlayhead() {}
  duplicateSelected() {}
  onLanePointerDown(e: any, t: any) {}
  onClipPointerDown(e: any, tid: any, c: any) {}
}
