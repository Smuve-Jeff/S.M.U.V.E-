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
import { EnhancedTouchGestureService } from '../../services/enhanced-touch-gesture.service';
import { HapticService } from '../../services/haptic.service';
import { AiService } from '../../services/ai.service';

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
  public readonly enhancedGestures = inject(EnhancedTouchGestureService);
  private readonly haptic = inject(HapticService);
  private readonly aiService = inject(AiService);

  @ViewChild('gridViewport') gridViewport!: ElementRef<HTMLDivElement>;

  readonly isMobile = window.innerWidth <= 1024;
  readonly laneHeight = computed(() => (this.isMobile ? 110 : 80) * this.enhancedGestures.verticalZoomLevel());
  readonly rulerHeight = 35;
  readonly snapEnabled = signal(true);
  readonly tracks = this.musicManager.tracks;
  readonly selectedClipIds = signal<Set<string>>(new Set());
  readonly activeTool = signal<'select' | 'blade' | 'glue'>('select');
  readonly isRecordingAutomation = signal(false);

  private draggingClip: { trackId: string; clipId: string; startX: number; startY: number; originalStarts: Map<string, number>; offsetBars: number; clipData: TrackClip } | null = null;
  private resizingClip: { trackId: string; clipId: string; startX: number; originalLength: number } | null = null;

  readonly barWidth = computed(() => 100 * this.enhancedGestures.zoomLevel());

  readonly bars = computed(() => Array.from({ length: 128 }, (_, index) => index));
  readonly gridWidth = computed(() => this.bars().length * this.barWidth());
  readonly playheadPos = computed(() => (this.musicManager.currentStep() / 16) * this.barWidth());
  readonly canvasHeight = computed(() => {
     let h = this.rulerHeight;
     this.tracks().forEach(t => {
       h += this.laneHeight();
       if (this.musicManager.takesExpanded()[t.id]) {
         const clipWithTakes = t.clips.find(c => c.takes && c.takes.length > 0);
         const takeCount = clipWithTakes?.takes?.length || 0;
         h += takeCount * (this.laneHeight() * 0.6);
       }
     });
     return h;
  });

  addTrack() { this.musicManager.addTrack('Lead Synth', 'grand-piano-v2'); }
  toggleMute(id: string, event: Event) { event.stopPropagation(); this.musicManager.toggleMute(id); }
  toggleSolo(id: string, event: Event) { event.stopPropagation(); this.musicManager.toggleSolo(id); }
  removeTrack(trackId: string, event: Event) { event.stopPropagation(); if (confirm("Delete track?")) this.musicManager.removeTrack(trackId); }
  removeClip(event: Event, trackId: string, clipId: string) { event.stopPropagation(); this.musicManager.removeClip(trackId, clipId); }
  selectTrack(id: string) { this.musicManager.selectedTrackId.set(id); }
  isTrackSelected(id: string) { return this.musicManager.selectedTrackId() === id; }
  toggleSnap() { this.haptic.medium(); this.snapEnabled.update(v => !v); }
  toggleLoop(trackId: string, clipId: string, event: Event) {
    event.stopPropagation();
    const track = this.tracks().find(t => t.id === trackId);
    const clip = track?.clips.find(c => c.id === clipId);
    if (clip) this.musicManager.updateClip(trackId, clipId, { loop: !clip.loop });
  }
  toggleTakes(trackId: string, event: Event) {
    event.stopPropagation();
    this.musicManager.takesExpanded.update(v => ({ ...v, [trackId]: !v[trackId] }));
  }

  @HostListener('window:keydown', [''])
  onKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') { if (e.shiftKey) this.history.redo(); else this.history.undo(); }
      if (e.key === 'd') { e.preventDefault(); this.duplicateSelected(); }
    }
        if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.selectedClipIds().size > 0) {
        this.selectedClipIds().forEach(id => {
          this.tracks().forEach(t => {
            if (t.clips.find(c => c.id === id)) this.musicManager.removeClip(t.id, id);
          });
        });
        this.selectedClipIds().clear();
        this.haptic.medium();
      }
    }
    if (e.key === 'v') this.activeTool.set('select');
    if (e.key === 'b') this.activeTool.set('blade');
    if (e.key === 'g') this.activeTool.set('glue');
  }

  onClipPointerDown(e: PointerEvent, trackId: string, clip: TrackClip) {
    this.haptic.light();
    if (this.activeTool() === 'blade') {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const bar = clip.start + (x / this.barWidth());
      this.musicManager.splitClip(trackId, clip.id, bar);
      return;
    }
    if ((e.target as HTMLElement).classList.contains('resize-handle')) {
      this.resizingClip = { trackId, clipId: clip.id, startX: e.clientX, originalLength: clip.length };
    } else {
      if (!e.shiftKey && !this.selectedClipIds().has(clip.id)) this.selectedClipIds().clear();
      this.selectedClipIds().add(clip.id);

      const originalStarts = new Map<string, number>();
      this.selectedClipIds().forEach(id => {
        this.tracks().forEach(t => {
          const c = t.clips.find(clip => clip.id === id);
          if (c) originalStarts.set(id, c.start);
        });
      });

      this.draggingClip = { trackId, clipId: clip.id, startX: e.clientX, startY: e.clientY, originalStarts, offsetBars: 0, clipData: clip };
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  @HostListener('pointermove', [''])
  onPointerMove(e: PointerEvent) {
    if (this.draggingClip) {
      const dx = e.clientX - this.draggingClip.startX;
      let dbars = dx / this.barWidth();
      if (this.snapEnabled()) dbars = Math.round(dbars * 4) / 4;

      this.selectedClipIds().forEach(id => {
         this.tracks().forEach(t => {
            const clip = t.clips.find(c => c.id === id);
            if (clip && this.draggingClip?.originalStarts.has(id)) {
               const original = this.draggingClip.originalStarts.get(id)!;
               this.musicManager.updateClip(t.id, clip.id, { start: Math.max(0, original + dbars) });
            }
         });
      });
    } else if (this.resizingClip) {
      const dx = e.clientX - this.resizingClip.startX;
      let dlen = dx / this.barWidth();
      if (this.snapEnabled()) dlen = Math.round(dlen * 4) / 4;
      this.musicManager.updateClip(this.resizingClip.trackId, this.resizingClip.clipId, { length: Math.max(0.25, this.resizingClip.originalLength + dlen) });
    }
  }

  @HostListener('pointerup', [''])
  onPointerUp(e: PointerEvent) { this.draggingClip = null; this.resizingClip = null; }

  onLanePointerDown(e: PointerEvent, track: TrackModel) {
    if (e.button !== 0 || (e.target as HTMLElement).classList.contains('clip-item')) return;
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

  clipLabel(track: TrackModel, clip: TrackClip): string { return clip.name || track.name; }
  calculateGhostNotes(clip: TrackClip): any[] {
    if (!clip.notes) return [];
    return clip.notes.map(n => ({ left: (n.step / 16 * 100) + '%', top: (100 - (n.midi % 12) * 8) + '%', width: (n.length / 16 * 100) + '%' }));
  }
  promoteTake(trackId: string, clipId: string, takeId: string) {
     this.musicManager.promoteTakeRegion(trackId, clipId, { takeId, start: 0, end: 100 });
  }
  splitAtPlayhead() {
    const bar = this.musicManager.currentStep() / 16;
    this.selectedClipIds().forEach(id => {
      this.tracks().forEach(t => { if (t.clips.find(c => c.id === id)) this.musicManager.splitClip(t.id, id, bar); });
    });
  }
  async bounceSelected() { const tid = this.musicManager.selectedTrackId(); if (tid) await this.musicManager.bounceTrack(tid); }
  onGridTouchStart(event: TouchEvent) { if (event.touches.length === 2) this.enhancedGestures.handlePinch(event); }
  onGridTouchMove(event: TouchEvent) { if (event.touches.length === 2) { event.preventDefault(); this.enhancedGestures.handlePinch(event); } }
  onGridTouchEnd() {}

  duplicateSelected() {
    const newSelection = new Set<string>();
    this.selectedClipIds().forEach(id => {
       this.tracks().forEach(t => {
         const clip = t.clips.find(c => c.id === id);
         if (clip) {
           const newId = 'clip_' + Date.now() + Math.random();
           const newClip = { ...clip, id: newId, start: clip.start + clip.length };
           this.musicManager.addClipToTrack(t.id, newClip);
           newSelection.add(newId);
         }
       });
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
}
