import { Component, inject, signal, computed, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MusicManagerService, TrackModel } from '../../services/music-manager.service';
import { AudioSessionService } from '../audio-session.service';
import { HistoryService } from '../../services/history.service';
import { HapticService } from '../../services/haptic.service';
import { EnhancedTouchGestureService } from '../../services/enhanced-touch-gesture.service';
import { StudioTrack, StudioClip } from '../../types/studio.types';

@Component({
  selector: 'app-arrangement-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './arrangement-view.component.html',
  styleUrls: ['./arrangement-view.component.css']
})
export class ArrangementViewComponent {
  public readonly musicManager = inject(MusicManagerService);
  public readonly audioSession = inject(AudioSessionService);
  public readonly history = inject(HistoryService);
  private readonly haptic = inject(HapticService);
  private readonly enhancedGestures = inject(EnhancedTouchGestureService);

  readonly tracks = this.musicManager.tracks;
  activeTool = signal<'select' | 'blade' | 'glue'>('select');
  selectedClipIds = signal<Set<string>>(new Set());
  snapEnabled = signal(true);
  isRecordingAutomation = signal(false);
  activeResize = signal<{
    trackId: string;
    clipId: string;
    edge: 'start' | 'end';
    anchorX: number;
    initialStart: number;
    initialLength: number;
  } | null>(null);
  activeDrag = signal<{
    trackId: string;
    clipId: string;
    anchorX: number;
    initialStart: number;
  } | null>(null);

  laneHeight = signal(80);
  barWidth = signal(200);
  rulerHeight = 32;

  @ViewChild('gridViewport') gridViewport!: ElementRef<HTMLDivElement>;

  bars = computed(() => Array.from({ length: 64 }, (_, i) => i));
  playheadPos = computed(() => (this.musicManager.currentStep() / 16) * this.barWidth());

  markers = signal<any[]>([]);
  showAutomation = signal(false);

  addMarker(name: string) {
    const time = this.musicManager.currentStep() / 16;
    this.markers.update(ms => [...ms, { id: 'marker_' + Date.now(), name, time, color: '#facc15' }]);
  }

  removeMarker(id: string) {
    this.markers.update(ms => ms.filter(m => m.id !== id));
  }

  toggleAutomationView() {
    this.showAutomation.update(v => !v);
  }

  createGroup() {
    this.musicManager.addTrack("New Group", "none", "bus");
  }

  selectTrack(id: string) { this.musicManager.selectedTrackId.set(id); }
  isTrackSelected(id: string) { return this.musicManager.selectedTrackId() === id; }

  toggleMute(id: string, e: Event) { e.stopPropagation(); this.musicManager.toggleMute(id); }
  toggleSolo(id: string, e: Event) { e.stopPropagation(); this.musicManager.toggleSolo(id); }
  removeTrack(id: string, e: Event) { e.stopPropagation(); if (confirm('Delete track?')) this.musicManager.removeTrack(id); }
  toggleTakes(id: string, e: Event) { e.stopPropagation(); this.musicManager.takesExpanded.update(v => ({ ...v, [id]: !v[id] })); }
  toggleSnap() { this.snapEnabled.update(v => !v); }
  addTrack() { this.musicManager.addTrack('New Track', 'grand-piano'); }

  onClipPointerDown(e: PointerEvent, trackId: string, clip: StudioClip) {
    e.stopPropagation();
    if (this.activeResize()) return;
    this.selectTrack(trackId);
    if (!e.shiftKey) this.selectedClipIds.set(new Set([clip.id]));
    else {
      const next = new Set(this.selectedClipIds());
      if (next.has(clip.id)) next.delete(clip.id);
      else next.add(clip.id);
      this.selectedClipIds.set(next);
    }

    if (this.activeTool() === 'select') {
      this.activeDrag.set({
        trackId,
        clipId: clip.id,
        anchorX: e.clientX,
        initialStart: clip.start,
      });
    }
  }

  onClipResizeStart(e: PointerEvent, track: TrackModel, clip: StudioClip, edge: 'start' | 'end') {
    e.stopPropagation();
    e.preventDefault();
    const target = e.target as HTMLElement;
    if (target.setPointerCapture) {
      target.setPointerCapture(e.pointerId);
    }
    this.activeResize.set({
      trackId: track.id,
      clipId: clip.id,
      edge,
      anchorX: e.clientX,
      initialStart: clip.start,
      initialLength: clip.length,
    });
  }

  @HostListener('window:pointermove', ['$event'])
  onWindowPointerMove(event: PointerEvent) {
    const resize = this.activeResize();
    const drag = this.activeDrag();
    if (!resize && !drag) return;
    event.preventDefault();

    if (resize) {
      const dx = event.clientX - resize.anchorX;
      let deltaBars = dx / this.barWidth();
      if (this.snapEnabled()) {
        deltaBars = Math.round(deltaBars * 4) / 4;
      }
      const found = this.findClipOwner(resize.clipId);
      if (!found || found.track.id !== resize.trackId) return;

      let newStart = resize.initialStart;
      let newLength = resize.initialLength;
      if (resize.edge === 'end') {
        newLength = Math.max(0.25, resize.initialLength + deltaBars);
      } else {
        newStart = Math.max(0, resize.initialStart + deltaBars);
        newLength = Math.max(0.25, resize.initialLength - (newStart - resize.initialStart));
        if (newLength <= 0.25) {
          newLength = 0.25;
          newStart = resize.initialStart + resize.initialLength - 0.25;
        }
      }

      this.musicManager.updateClip(found.track.id, found.clip.id, {
        start: parseFloat(newStart.toFixed(4)),
        length: parseFloat(newLength.toFixed(4)),
      });
      return;
    }

    if (drag) {
      const dx = event.clientX - drag.anchorX;
      let deltaBars = dx / this.barWidth();
      if (this.snapEnabled()) {
        deltaBars = Math.round(deltaBars * 4) / 4;
      }
      const found = this.findClipOwner(drag.clipId);
      if (!found || found.track.id !== drag.trackId) return;

      const newStart = Math.max(0, drag.initialStart + deltaBars);
      this.musicManager.updateClip(found.track.id, found.clip.id, {
        start: parseFloat(newStart.toFixed(4)),
      });
    }
  }

  @HostListener('window:pointerup', ['$event'])
  onWindowPointerUp(event: PointerEvent) {
    const target = event.target as HTMLElement;
    if (target && target.releasePointerCapture) {
      try {
        target.releasePointerCapture(event.pointerId);
      } catch {}
    }
    this.activeResize.set(null);
    this.activeDrag.set(null);
  }

  onLanePointerDown(e: PointerEvent, track: TrackModel) {
    if ((e.target as HTMLElement).classList.contains('resize-handle')) return;
    this.selectTrack(track.id);

    if (this.activeTool() === 'select') {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      let bar = x / this.barWidth();
      if (this.snapEnabled()) bar = Math.floor(bar * 4) / 4;

      this.musicManager.addClipToTrack(track.id, {
        start: bar,
        length: 4,
        type: track.type === 'midi' || track.type === 'drum' ? 'midi' : 'audio'
      });
      this.haptic.light();
    }
  }

  clipLabel(track: StudioTrack, clip: StudioClip): string { return clip.name || track.name; }

  private findClipOwner(clipId: string): { track: TrackModel; clip: StudioClip } | null {
    for (const track of this.tracks()) {
      const clip = track.clips.find(c => c.id === clipId);
      if (clip) return { track, clip };
    }
    return null;
  }

  splitAtPlayhead() {
    const bar = this.musicManager.currentStep() / 16;
    this.selectedClipIds().forEach(id => {
      const found = this.findClipOwner(id);
      if (found) this.musicManager.splitClip(found.track.id, id, bar);
    });
  }

  async bounceSelected() { const tid = this.musicManager.selectedTrackId(); if (tid) await this.musicManager.bounceTrack(tid); }
  onGridTouchStart(event: TouchEvent) { if (event.touches.length === 2) this.enhancedGestures.handlePinch(event); }
  onGridTouchMove(event: TouchEvent) { if (event.touches.length === 2) { event.preventDefault(); this.enhancedGestures.handlePinch(event); } }
  onGridTouchEnd() {}

  duplicateSelected() {
    const newSelection = new Set<string>();
    this.selectedClipIds().forEach(id => {
      const found = this.findClipOwner(id);
      if (found) {
        const newId = 'clip_' + Date.now() + Math.random();
        this.musicManager.addClipToTrack(found.track.id, { ...found.clip, id: newId, start: found.clip.start + found.clip.length });
        newSelection.add(newId);
      }
    });
    this.selectedClipIds.set(newSelection);
    this.haptic.medium();
  }

  aiVariation() {
    this.haptic.impact('heavy');
    const track = this.tracks().find(t => t.id === this.musicManager.selectedTrackId());
    if (track && track.notes.length > 0) {
       this.musicManager.humanizeTrack(track.id);
       this.musicManager.addAutomationLane(track.id, 'cutoff');
    }
  }
  aiSuggestArrangement() { this.haptic.impact('heavy'); this.duplicateSelected(); this.musicManager.addTrack('AI Pad', 'glass-pad', 'midi'); }
  aiMixTransition() { this.haptic.impact('heavy'); const tid = this.musicManager.selectedTrackId(); if (tid) { this.musicManager.updateVolume(tid, 0); setTimeout(() => this.musicManager.updateVolume(tid, 0.8), 2000); } }
  toggleAutomation() { this.haptic.medium(); this.isRecordingAutomation.update(v => !v); }

  toggleGroup(trackId: string) {
    this.musicManager.tracks.update(ts => ts.map(t => {
      if (t.id === trackId || t.parentId === trackId) {
        return { ...t, collapsed: !t.collapsed };
      }
      return t;
    }));
  }

  canvasHeight() { return this.tracks().length * this.laneHeight() + this.rulerHeight; }
  gridWidth() { return 64 * this.barWidth(); }
}
