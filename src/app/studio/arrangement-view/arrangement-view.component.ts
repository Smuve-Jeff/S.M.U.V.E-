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
  TrackClip,
  TrackModel,
} from '../../services/music-manager.service';
import { HistoryService } from '../../services/history.service';

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
  public readonly history = inject(HistoryService);

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
  private draggingClip: { trackId: string; clipId: string; startX: number; startY: number; originalStart: number; offsetBars: number; clipData: TrackClip } | null = null;
  private resizingClip: { trackId: string; clipId: string; startX: number; originalLength: number } | null = null;

  readonly bars = computed(() =>
    Array.from({ length: 128 }, (_, index) => index)
  );
  readonly gridWidth = computed(() => this.bars().length * this.barWidth);
  readonly playheadPos = computed(
    () => (this.musicManager.currentStep() / 16) * this.barWidth
  );
  readonly canvasHeight = computed(() => {
     let h = this.rulerHeight;
     this.tracks().forEach(t => {
       h += this.laneHeight;
       if (this.musicManager.takesExpanded()[t.id]) {
         const clipWithTakes = t.clips.find(c => c.takes && c.takes.length > 0);
         const takeCount = clipWithTakes?.takes?.length || 0;
         h += takeCount * (this.laneHeight * 0.6);
       }
     });
     return h;
  });

  addTrack() {
    this.musicManager.addTrack('Lead Synth', 'grand-piano-v2');
  }

  toggleMute(id: string, event: Event) {
    event.stopPropagation();
    this.musicManager.toggleMute(id);
  }

  toggleSolo(id: string, event: Event) {
    event.stopPropagation();
    this.musicManager.toggleSolo(id);
  }

  removeTrack(trackId: string, event: Event) {
    event.stopPropagation();
    if (confirm("Delete this track?")) {
      this.musicManager.removeTrack(trackId);
    }
  }

  removeClip(event: Event, trackId: string, clipId: string) {
    event.stopPropagation();
    this.musicManager.removeClip(trackId, clipId);
  }

  selectTrack(id: string) {
    this.musicManager.selectedTrackId.set(id);
  }

  isTrackSelected(id: string) {
    return this.musicManager.selectedTrackId() === id;
  }

  toggleSnap() {
    this.snapEnabled.update(v => !v);
  }

  toggleLoop(trackId: string, clipId: string, event: Event) {
    event.stopPropagation();
    const track = this.tracks().find(t => t.id === trackId);
    const clip = track?.clips.find(c => c.id === clipId);
    if (clip) {
      this.musicManager.updateClip(trackId, clipId, { loop: !clip.loop });
    }
  }

  toggleTakes(trackId: string, event: Event) {
    event.stopPropagation();
    this.musicManager.takesExpanded.update(v => ({
      ...v,
      [trackId]: !v[trackId]
    }));
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') {
        if (e.shiftKey) this.history.redo();
        else this.history.undo();
      }
    }
    if (e.key === 'v') this.activeTool.set('select');
    if (e.key === 'b') this.activeTool.set('blade');
    if (e.key === 'g') this.activeTool.set('glue');
  }

  // --- Pointer Handlers ---

  onClipPointerDown(e: PointerEvent, trackId: string, clip: TrackClip) {
    if (this.activeTool() === 'blade') {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const bar = clip.start + (x / this.barWidth);
      this.musicManager.splitClip(trackId, clip.id, bar);
      return;
    }

    if ((e.target as HTMLElement).classList.contains('resize-handle')) {
      this.resizingClip = { trackId, clipId: clip.id, startX: e.clientX, originalLength: clip.length };
    } else {
      this.draggingClip = { trackId, clipId: clip.id, startX: e.clientX, startY: e.clientY, originalStart: clip.start, offsetBars: 0, clipData: clip };
      if (!e.shiftKey) this.selectedClipIds().clear();
      this.selectedClipIds().add(clip.id);
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  @HostListener('pointermove', ['$event'])
  onPointerMove(e: PointerEvent) {
    if (this.draggingClip) {
      const dx = e.clientX - this.draggingClip.startX;
      let dbars = dx / this.barWidth;
      if (this.snapEnabled()) dbars = Math.round(dbars * 4) / 4;
      this.draggingClip.offsetBars = dbars;
      this.musicManager.updateClip(this.draggingClip.trackId, this.draggingClip.clipId, { start: this.draggingClip.originalStart + dbars });
    } else if (this.resizingClip) {
      const dx = e.clientX - this.resizingClip.startX;
      let dlen = dx / this.barWidth;
      if (this.snapEnabled()) dlen = Math.round(dlen * 4) / 4;
      this.musicManager.updateClip(this.resizingClip.trackId, this.resizingClip.clipId, { length: Math.max(0.25, this.resizingClip.originalLength + dlen) });
    }
  }

  @HostListener('pointerup', [''])
  onPointerUp(e: PointerEvent) {
    this.draggingClip = null;
    this.resizingClip = null;
  }

  onLanePointerDown(e: PointerEvent, track: TrackModel) {
    if (e.button !== 0 || (e.target as HTMLElement).classList.contains('clip-item')) return;
    this.selectTrack(track.id);
  }

  // --- Template Utilities ---

  clipLabel(track: TrackModel, clip: TrackClip): string {
    return clip.name || track.name;
  }

  calculateGhostNotes(clip: TrackClip): any[] {
    if (!clip.notes) return [];
    return clip.notes.map(n => ({
      left: (n.step / 16 * 100) + '%',
      top: (100 - (n.midi % 12) * 8) + '%',
      width: (n.length / 16 * 100) + '%'
    }));
  }

  promoteTake(trackId: string, clipId: string, takeId: string) {
     this.musicManager.promoteTakeRegion(trackId, clipId, {
       takeId,
       start: 0, // Simplified: promote entire take
       end: 100
     });
  }

  splitAtPlayhead() {
    const bar = this.musicManager.currentStep() / 16;
    this.selectedClipIds().forEach(id => {
      this.tracks().forEach(t => {
        if (t.clips.find(c => c.id === id)) this.musicManager.splitClip(t.id, id, bar);
      });
    });
  }

  async bounceSelected() {
     const tid = this.musicManager.selectedTrackId();
     if (tid) await this.musicManager.bounceTrack(tid);
  }

  duplicateSelected() {}
  aiVariation() {}
  aiSuggestArrangement() {}
  aiMixTransition() {}
}
