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
  readonly activeTool = signal<'select' | 'blade' | 'glue'>('select');

  // Interaction State
  private draggingClip: { trackId: number; clipId: string; startX: number; startY: number; originalStart: number; offsetBars: number; clipData: ArrangementClip } | null = null;
  private resizingClip: { trackId: number; clipId: string; startX: number; originalLength: number } | null = null;
  private longPressTimeout: any;

  readonly bars = computed(() =>
    Array.from({ length: 128 }, (_, index) => index)
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
       this.tracks().forEach(track => {
         const clip = track.clips.find(c => c.id === id);
         if (clip) {
           this.musicManager.addClipToTrack(track.id, {
             ...clip,
             id: crypto.randomUUID(),
             start: clip.start + clip.length,
             name: clip.name + ' (COPY)'
           });
         }
       });
     });
  }

  onLanePointerDown(e: PointerEvent, track: TrackModel) {
    const rect = this.gridViewport.nativeElement.getBoundingClientRect();
    const offsetX = (e.clientX - rect.left + this.gridViewport.nativeElement.scrollLeft);
    const startBar = this.snapEnabled() ? Math.floor(offsetX / this.barWidth) : offsetX / this.barWidth;

    if (this.activeTool() !== 'select') return;

    if (e.pointerType === 'touch') {
      this.longPressTimeout = setTimeout(() => {
        this.musicManager.addClipToTrack(track.id, {
          id: crypto.randomUUID(),
          start: startBar,
          length: 4,
          name: 'New Pattern',
          type: 'midi'
        });
      }, 500);
    }
  }

  onClipPointerDown(e: PointerEvent, trackId: number, clip: ArrangementClip) {
    e.stopPropagation();

    if (this.activeTool() === 'blade') {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      let splitBar = clip.start + (offsetX / this.barWidth);
      if (this.snapEnabled()) {
        splitBar = Math.round(splitBar * 4) / 4;
      }
      this.musicManager.splitClip(trackId, clip.id, splitBar);
      return;
    }

    if (this.activeTool() === 'glue') {
      const track = this.tracks().find(t => t.id === trackId);
      if (track) {
        const nextClip = track.clips.find(c => c.type === clip.type && Math.abs(c.start - (clip.start + clip.length)) < 0.1);
        if (nextClip) {
          this.musicManager.updateClip(trackId, clip.id, { length: clip.length + nextClip.length });
          this.musicManager.removeClip(trackId, nextClip.id);
        }
      }
      return;
    }

    const isResize = (e.target as HTMLElement).classList.contains('resize-handle');
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetX = e.clientX - rect.left;

    if (isResize) {
      this.resizingClip = {
        trackId,
        clipId: clip.id,
        startX: e.clientX,
        originalLength: clip.length
      };
    } else {
      this.draggingClip = {
        trackId,
        clipId: clip.id,
        startX: e.clientX,
        startY: e.clientY,
        originalStart: clip.start,
        offsetBars: offsetX / this.barWidth,
        clipData: { ...clip }
      };

      const isMultiSelect = e.shiftKey;
      this.selectedClipIds.update(current => {
        const next = isMultiSelect ? new Set(current) : new Set<string>();
        if (!next.has(clip.id)) next.add(clip.id);
        return next;
      });
    }

    if (e.pointerType === 'touch') {
       this.longPressTimeout = setTimeout(() => {
         this.splitAtPlayhead();
       }, 800);
    }
  }

  @HostListener('pointermove', ['$event'])
  onPointerMove(e: PointerEvent) {
    if (this.resizingClip) {
      const deltaX = e.clientX - this.resizingClip.startX;
      let newLength = this.resizingClip.originalLength + (deltaX / this.barWidth);
      if (this.snapEnabled()) {
        newLength = Math.max(0.25, Math.round(newLength * 4) / 4);
      } else {
        newLength = Math.max(0.1, newLength);
      }
      this.musicManager.updateClip(this.resizingClip.trackId, this.resizingClip.clipId, { length: newLength });
    } else if (this.draggingClip) {
      const rect = this.gridViewport.nativeElement.getBoundingClientRect();
      const offsetX = (e.clientX - rect.left + this.gridViewport.nativeElement.scrollLeft);
      const offsetY = (e.clientY - rect.top + this.gridViewport.nativeElement.scrollTop) - this.rulerHeight;

      let newStart = (offsetX / this.barWidth) - this.draggingClip.offsetBars;
      let targetTrackIdx = Math.floor(offsetY / this.laneHeight);
      targetTrackIdx = Math.max(0, Math.min(this.tracks().length - 1, targetTrackIdx));
      const targetTrack = this.tracks()[targetTrackIdx];

      if (this.snapEnabled()) {
        newStart = Math.max(0, Math.round(newStart * 4) / 4);
      } else {
        newStart = Math.max(0, newStart);
      }

      if (targetTrack && targetTrack.id !== this.draggingClip.trackId) {
        this.musicManager.removeClip(this.draggingClip.trackId, this.draggingClip.clipId);
        this.draggingClip.trackId = targetTrack.id;
        this.musicManager.addClipToTrack(targetTrack.id, { ...this.draggingClip.clipData, start: newStart });
      } else {
        this.musicManager.updateClip(this.draggingClip.trackId, this.draggingClip.clipId, { start: newStart });
      }
    }
  }

  @HostListener('pointerup')
  onPointerUp() {
    clearTimeout(this.longPressTimeout);
    this.draggingClip = null;
    this.resizingClip = null;
  }

  // AI & Advanced Features
  aiVariation() {
    for (const id of this.selectedClipIds()) {
      for (const track of this.tracks()) {
        const clip = track.clips.find(c => c.id === id);
        if (clip) {
          const varId = crypto.randomUUID();
          this.musicManager.addClipToTrack(track.id, {
            ...clip,
            id: varId,
            name: (clip.name || 'Pattern') + ' (AI VAR)',
            start: clip.start + clip.length,
            color: '#f59e0b'
          });
          this.selectedClipIds.update(s => new Set(s).add(varId));
          break;
        }
      }
    }
  }

  aiSuggestArrangement() {
    const structure = [
      { name: 'INTRO', len: 4 },
      { name: 'VERSE 1', len: 8 },
      { name: 'CHORUS 1', len: 8 },
      { name: 'VERSE 2', len: 8 },
      { name: 'CHORUS 2', len: 8 },
      { name: 'BRIDGE', len: 4 },
      { name: 'OUTRO', len: 4 }
    ];

    let currentBar = 0;
    const firstTrack = this.tracks()[0];
    if (!firstTrack) return;

    structure.forEach(section => {
      this.musicManager.addClipToTrack(firstTrack.id, {
        id: crypto.randomUUID(),
        name: `[ ${section.name} ]`,
        start: currentBar,
        length: section.len,
        type: 'midi',
        color: '#38bdf8'
      });
      currentBar += section.len;
    });
  }

  aiMixTransition() {
    if (this.selectedClipIds().size < 2) return;
    // Implementation for AI transition logic (e.g., volume ramps or filter sweeps)
    console.log("AI Transition Logic Triggered between selected clips");
    // This could add automation lanes or FX nodes in a real implementation
  }

  generateGhostNotes(clip: ArrangementClip) {
    return Array.from({ length: 8 }, (_, i) => ({
      left: (i * 12.5) + '%',
      top: (Math.sin(i) * 30 + 50) + '%',
      width: '10%'
    }));
  }

  toggleLoop(trackId: number, clipId: string, event: Event) {
    event.stopPropagation();
    this.tracks().forEach(t => {
      if (t.id === trackId) {
        const clip = t.clips.find(c => c.id === clipId);
        if (clip) {
          this.musicManager.updateClip(trackId, clipId, { loop: !clip.loop });
        }
      }
    });
  }
}
