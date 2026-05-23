import { Component, signal, computed, inject, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MusicManagerService,
  ArrangementClip,
} from '../../services/music-manager.service';

const TRACK_COLORS = [
  '#10b981',
  '#8b5cf6',
  '#f59e0b',
  '#3b82f6',
  '#ef4444',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
];

@Component({
  selector: 'app-arrangement-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './arrangement-view.component.html',
  styleUrls: ['./arrangement-view.component.css'],
})
export class ArrangementViewComponent {
  private musicManager = inject(MusicManagerService);

  @ViewChild('gridCanvas') gridCanvas!: ElementRef;

  bars = Array.from({ length: 64 }, (_, i) => i);
  barWidth = 100;
  gridWidth = 64 * 100;
  snapEnabled = signal(true);

  playheadPos = computed(() => {
    const step = this.musicManager.currentStep();
    if (step < 0) return 0;
    return (step / 16) * this.barWidth;
  });

  selectedTrackId = computed(() => this.musicManager.selectedTrackId());
  selectedClipId = signal<string | null>(null);
  isDragging = signal(false);


  showAutomation = signal(false);

  toggleAutomation() {
    this.showAutomation.update(v => !v);
  }

  addLane(trackId: number, parameter: string) {
    this.musicManager.addAutomationLane(trackId, parameter);
  }

  addPoint(event: MouseEvent, trackId: number, lane: any) {
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const step = (x / this.barWidth) * 16; // 16 steps per bar
    const value = 1 - (y / rect.height);
    this.musicManager.addAutomationPoint(trackId, lane.id, step, value);
  }
  getLanePoints(lane: any): string {
    if (!lane.points || lane.points.length === 0) return '';
    return lane.points.map((pt: any) => `${(pt.step / 16) * this.barWidth},${(1 - pt.value) * 48}`).join(' ');
  }

tracks = this.musicManager.tracks;

  isAltPressed = false;
  trackHeaderHeight = computed(() => this.showAutomation() ? 160 : 80);

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.altKey) this.isAltPressed = true;
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent) {
    if (!event.altKey) this.isAltPressed = false;
  trackHeaderHeight = computed(() => this.showAutomation() ? 160 : 80);
  }

  addTrack(): void {
    this.musicManager.ensureTrack('grand-piano');
  }

  removeTrack(trackId: number): void {
    this.musicManager.removeTrack(trackId);
  }

  selectTrack(trackId: number): void {
    this.musicManager.selectedTrackId.set(trackId);
  }

  toggleMute(trackId: number): void {
    this.musicManager.toggleMute(trackId);
  }

  toggleSolo(trackId: number): void {
    this.musicManager.toggleSolo(trackId);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  onDrop(event: DragEvent, trackId: number) {
    event.preventDefault();
    const data = event.dataTransfer?.getData('application/json');
    if (data) {
      const payload = JSON.parse(data);
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      let startBar = offsetX / this.barWidth;

      if (this.snapEnabled()) {
        startBar = Math.floor(startBar);
      }

      if (payload.type === 'arrangement-clip') {
         if (this.isAltPressed) {
            this.duplicateClip(payload.clipId, payload.sourceTrackId, trackId, startBar);
         } else {
            this.moveClip(payload.clipId, payload.sourceTrackId, trackId, startBar);
         }
      }
    }
  }

  onClipDragStart(event: DragEvent, trackId: number, clip: ArrangementClip) {
    event.dataTransfer?.setData('application/json', JSON.stringify({
      type: 'arrangement-clip',
      clipId: clip.id,
      sourceTrackId: trackId
    }));
    this.isDragging.set(true);
  }

  onClipDragEnd() {
    this.isDragging.set(false);
  }

  moveClip(clipId: string, fromTrackId: number, toTrackId: number, newStart: number) {
    this.musicManager.tracks.update(tracks => {
      let clipToMove: ArrangementClip | undefined;
      const nextTracks = tracks.map(t => {
        if (t.id === fromTrackId) {
          const clips = t.clips || [];
          clipToMove = clips.find(c => c.id === clipId);
          return { ...t, clips: clips.filter(c => c.id !== clipId) };
        }
        return t;
      });
      if (!clipToMove) return tracks;
      return nextTracks.map(t => {
        if (t.id === toTrackId) {
          return { ...t, clips: [...(t.clips || []), { ...clipToMove!, start: newStart }] };
        }
        return t;
      });
    });
  }

  duplicateClip(clipId: string, fromTrackId: number, toTrackId: number, newStart: number) {
     this.musicManager.tracks.update(tracks => {
        const sourceTrack = tracks.find(t => t.id === fromTrackId);
        const clipToDup = sourceTrack?.clips?.find(c => c.id === clipId);
        if (!clipToDup) return tracks;

        const newClip = { ...clipToDup, id: `clip-${Date.now()}`, start: newStart };
        return tracks.map(t => t.id === toTrackId ? { ...t, clips: [...(t.clips || []), newClip] } : t);
     });
  }

  resizeClip(trackId: number, clipId: string, delta: number) {
    this.musicManager.tracks.update(tracks => tracks.map(t => {
      if (t.id === trackId) {
        return {
          ...t,
          clips: (t.clips || []).map(c => c.id === clipId ? { ...c, length: Math.max(0.5, c.length + delta) } : c)
        };
      }
      return t;
    }));
  }

  selectClip(clipId: string, event: Event): void {
    event.stopPropagation();
    this.selectedClipId.set(clipId);
  }

  isTrackSelected(trackId: number): boolean {
    return this.selectedTrackId() === trackId;
  }

  toggleSnap() {
    this.snapEnabled.update(v => !v);
  }
}
