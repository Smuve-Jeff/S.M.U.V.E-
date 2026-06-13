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

  private longPressTimeout: any;

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

  splitAtPlayhead() {
    if (this.selectedClipIds().size === 0) return;
    const playheadStep = this.musicManager.currentStep();

    this.tracks().forEach(track => {
      const selectedClip = track.clips.find(c => this.selectedClipIds().has(c.id));
      if (selectedClip) {
        const clipStartStep = selectedClip.start * 16;
        const clipEndStep = (selectedClip.start + selectedClip.length) * 16;

        if (playheadStep > clipStartStep && playheadStep < clipEndStep) {
           this.musicManager.splitClip(track.id, selectedClip.id, playheadStep / 16);
        }
      }
    });
  }

  duplicateSelected() {
     this.selectedClipIds().forEach(id => {
       // Logic to duplicate clips would go here
     });
  }

  onLanePointerDown(e: any, track: TrackModel) {
    if (e.pointerType === 'touch') {
      this.longPressTimeout = setTimeout(() => {
        const rect = this.gridViewport.nativeElement.getBoundingClientRect();
        const offsetX = (e.clientX - rect.left + this.gridViewport.nativeElement.scrollLeft);
        const startBar = Math.floor(offsetX / this.barWidth);
        this.musicManager.addClipToTrack(track.id, {
          id: crypto.randomUUID(),
          start: startBar,
          length: 2,
          name: 'New Clip'
        });
      }, 500);
    }
  }

  @HostListener('pointerup')
  onPointerUp() {
    clearTimeout(this.longPressTimeout);
  }

  onClipPointerDown(e: PointerEvent, trackId: number, clip: ArrangementClip) {
    e.stopPropagation();
    const isMultiSelect = e.shiftKey;

    this.selectedClipIds.update(current => {
      const next = isMultiSelect ? new Set(current) : new Set<string>();
      if (next.has(clip.id)) {
        next.delete(clip.id);
      } else {
        next.add(clip.id);
      }
      return next;
    });

    if (e.pointerType === 'touch') {
       this.longPressTimeout = setTimeout(() => {
         this.splitAtPlayhead();
       }, 800);
    }
  }
}
