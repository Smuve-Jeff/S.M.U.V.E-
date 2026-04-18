import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MusicManagerService,
  TrackModel,
  ArrangementClip,
} from '../../services/music-manager.service';
import { AutomationService } from '../automation.service';

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
  private automationService = inject(AutomationService);

  bars = Array.from({ length: 64 }, (_, i) => i);
  barWidth = 100;
  gridWidth = 64 * 100;

  playheadPos = computed(() => {
    const step = this.musicManager.currentStep();
    if (step < 0) return 0;
    return (step / 16) * this.barWidth;
  });

  selectedTrackId = computed(() => this.musicManager.selectedTrackId());
  selectedClipId = signal<string | null>(null);
  viewMode = signal<'arrangement' | 'automation'>('arrangement');

  tracks = this.musicManager.tracks;
  structure = this.musicManager.structure;
  chords = this.musicManager.chords;
  lanes = this.automationService.lanes;

  trackCount = computed(() => this.tracks().length);
  clipCount = computed(() =>
    this.tracks().reduce((sum, t) => sum + (t.clips?.length || 0), 0)
  );

  addTrack(): void {
    this.musicManager.ensureTrack('Piano');
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

  addClip(trackId: number): void {
    const track = this.tracks().find((t) => t.id === trackId);
    if (!track) return;

    const colorIndex = this.tracks().indexOf(track);
    const color = TRACK_COLORS[colorIndex % TRACK_COLORS.length];

    const newClip: ArrangementClip = {
      id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name: 'New Pattern',
      start: 0,
      length: 4,
      color,
      type: 'midi',
    };

    this.musicManager.tracks.update((ts) =>
      ts.map((t) =>
        t.id === trackId ? { ...t, clips: [...(t.clips || []), newClip] } : t
      )
    );
  }

  removeClip(trackId: number, clipId: string): void {
    this.musicManager.tracks.update((ts) =>
      ts.map((t) =>
        t.id === trackId
          ? { ...t, clips: (t.clips || []).filter((c) => c.id !== clipId) }
          : t
      )
    );
    if (this.selectedClipId() === clipId) {
      this.selectedClipId.set(null);
    }
  }

  getPointsPath(laneId: string): string {
    const lane = this.lanes().find(l => l.id === laneId);
    if (!lane || lane.points.length === 0) return "";
    const points = lane.points.map(p => `${p.time * this.barWidth},${(1 - p.value) * 112}`);
    return `M ${points.join(" L ")}`;
  }

  toggleViewMode(mode: 'arrangement' | 'automation') {
    this.viewMode.set(mode);
  }

  selectClip(clipId: string, event: Event): void {
    event.stopPropagation();
    this.selectedClipId.set(clipId);
  }

  onClipKeydown(clipId: string, event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.selectedClipId.set(clipId);
    }
  }

  isTrackSelected(trackId: number): boolean {
    return this.selectedTrackId() === trackId;
  }

  isClipSelected(clipId: string): boolean {
    return this.selectedClipId() === clipId;
  }
}
