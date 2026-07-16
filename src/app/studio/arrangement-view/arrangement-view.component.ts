import {
  Component,
  inject,
  signal,
  computed,
  ElementRef,
  ViewChild,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MusicManagerService,
  TrackModel,
} from '../../services/music-manager.service';
import { AudioSessionService } from '../audio-session.service';
import { HistoryService } from '../../services/history.service';
import { HapticService } from '../../services/haptic.service';
import { EnhancedTouchGestureService } from '../../services/enhanced-touch-gesture.service';
import { StudioTrack, StudioClip } from '../../types/studio.types';
import { StemSeparationService, Stems } from '../../services/stem-separation.service';
import { SnackbarService } from '../../services/snackbar.service';

@Component({
  selector: 'app-arrangement-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './arrangement-view.component.html',
  styleUrls: ['./arrangement-view.component.css'],
})
export class ArrangementViewComponent {
  public readonly musicManager = inject(MusicManagerService);
  public readonly audioSession = inject(AudioSessionService);
  public readonly history = inject(HistoryService);
  private readonly haptic = inject(HapticService);
  private readonly enhancedGestures = inject(EnhancedTouchGestureService);
  private readonly stemSvc = inject(StemSeparationService);
  private readonly snackbar = inject(SnackbarService);

  // ── Stem-Splitter UI state ───────────────────────────────────────
  stemOpen = signal(false);
  stemProgress = signal(0);
  stemStems = signal<Stems | null>(null);
  stemFileName = signal<string | null>(null);
  stemBusy = signal(false);

  readonly tracks = this.musicManager.tracks;
  activeTool = signal<'select' | 'blade' | 'glue'>('select');
  selectedClipIds = signal<Set<string>>(new Set());
  snapEnabled = signal(true);
  isRecordingAutomation = signal(false);

  laneHeight = signal(80);
  barWidth = signal(200);
  rulerHeight = 32;

  @ViewChild('gridViewport') gridViewport!: ElementRef<HTMLDivElement>;

  bars = computed(() => Array.from({ length: 64 }, (_, i) => i));
  playheadPos = computed(
    () => (this.musicManager.currentStep() / 16) * this.barWidth()
  );

  markers = signal<any[]>([]);
  showAutomation = signal(false);

  addMarker(name: string) {
    const time = this.musicManager.currentStep() / 16;
    this.markers.update((ms) => [
      ...ms,
      { id: 'marker_' + Date.now(), name, time, color: '#facc15' },
    ]);
  }

  removeMarker(id: string) {
    this.markers.update((ms) => ms.filter((m) => m.id !== id));
  }

  toggleAutomationView() {
    this.showAutomation.update((v) => !v);
  }

  createGroup() {
    this.musicManager.addTrack('New Group', 'none', 'bus');
  }

  selectTrack(id: string) {
    this.musicManager.selectedTrackId.set(id);
  }
  isTrackSelected(id: string) {
    return this.musicManager.selectedTrackId() === id;
  }

  toggleMute(id: string, e: Event) {
    e.stopPropagation();
    this.musicManager.toggleMute(id);
  }
  toggleSolo(id: string, e: Event) {
    e.stopPropagation();
    this.musicManager.toggleSolo(id);
  }
  removeTrack(id: string, e: Event) {
    e.stopPropagation();
    if (confirm('Delete track?')) this.musicManager.removeTrack(id);
  }
  toggleTakes(id: string, e: Event) {
    e.stopPropagation();
    this.musicManager.takesExpanded.update((v) => ({ ...v, [id]: !v[id] }));
  }
  toggleSnap() {
    this.snapEnabled.update((v) => !v);
  }
  addTrack() {
    this.musicManager.addTrack('New Track', 'grand-piano');
  }

  onClipPointerDown(e: PointerEvent, trackId: string, clip: StudioClip) {
    e.stopPropagation();
    this.selectTrack(trackId);
    if (!e.shiftKey) this.selectedClipIds.set(new Set([clip.id]));
    else {
      const next = new Set(this.selectedClipIds());
      if (next.has(clip.id)) next.delete(clip.id);
      else next.add(clip.id);
      this.selectedClipIds.set(next);
    }
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
        type: track.type === 'midi' || track.type === 'drum' ? 'midi' : 'audio',
      });
      this.haptic.light();
    }
  }

  clipLabel(track: StudioTrack, clip: StudioClip): string {
    return clip.name || track.name;
  }

  private findClipOwner(
    clipId: string
  ): { track: TrackModel; clip: StudioClip } | null {
    for (const track of this.tracks()) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) return { track, clip };
    }
    return null;
  }

  /** Toolbar cross-link helper: first selected clip's parent track. */
  findFirstSelectedTrack(): TrackModel | null {
    const ids = this.selectedClipIds();
    if (ids.size === 0) {
      const id = this.musicManager.selectedTrackId();
      return id ? this.tracks().find((t) => t.id === id) ?? null : null;
    }
    return (
      this.findClipOwner(ids.values().next().value ?? '')?.track ?? null
    );
  }
  findFirstSelectedClip(): StudioClip | null {
    const ids = this.selectedClipIds();
    if (ids.size === 0) return null;
    return this.findClipOwner(ids.values().next().value ?? '')?.clip ?? null;
  }

  splitAtPlayhead() {
    const bar = this.musicManager.currentStep() / 16;
    this.selectedClipIds().forEach((id) => {
      const found = this.findClipOwner(id);
      if (found) this.musicManager.splitClip(found.track.id, id, bar);
    });
  }

  async bounceSelected() {
    const tid = this.musicManager.selectedTrackId();
    if (tid) await this.musicManager.bounceTrack(tid);
  }
  onGridTouchStart(event: TouchEvent) {
    if (event.touches.length === 2) this.enhancedGestures.handlePinch(event);
  }
  onGridTouchMove(event: TouchEvent) {
    if (event.touches.length === 2) {
      event.preventDefault();
      this.enhancedGestures.handlePinch(event);
    }
  }
  onGridTouchEnd() {}

  duplicateSelected() {
    const newSelection = new Set<string>();
    this.selectedClipIds().forEach((id) => {
      const found = this.findClipOwner(id);
      if (found) {
        const newId = 'clip_' + Date.now() + Math.random();
        this.musicManager.addClipToTrack(found.track.id, {
          ...found.clip,
          id: newId,
          start: found.clip.start + found.clip.length,
        });
        newSelection.add(newId);
      }
    });
    this.selectedClipIds.set(newSelection);
    this.haptic.medium();
  }

  /**
   * Cross-link to Piano Roll — switches the Studio view to
   * piano-roll, ensures the parent track is selected, and tells
   * the roll which step range to spotlight.
   */
  crossLinkToPianoRoll(track: TrackModel, clip: StudioClip) {
    this.selectTrack(track.id);
    const selectedIds = new Set(this.selectedClipIds());
    selectedIds.add(clip.id);
    this.selectedClipIds.set(selectedIds);
    const startStep = Math.max(0, Math.floor((clip.start || 0) * 16));
    const endStep = Math.max(
      startStep + 1,
      Math.floor(((clip.start || 0) + (clip.length || 4)) * 16)
    );
    this.musicManager.requestCrossLink({
      view: 'piano-roll',
      trackId: track.id,
      noteRange: { startStep, endStep },
      label: clip.name || track.name,
    });
    this.haptic.medium();
  }

  /** True when the renderer should show this clip highlighted
   *  because it is the source of an active cross-link request. */
  isClipCrosslinked(track: TrackModel, clip: StudioClip): boolean {
    const req = this.musicManager.crossLinkRequest();
    if (!req || req.trackId !== track.id) return false;
    if (!req.noteRange) return false;
    const startStep = (clip.start || 0) * 16;
    const endStep = ((clip.start || 0) + (clip.length || 4)) * 16;
    return startStep <= req.noteRange.endStep && endStep >= req.noteRange.startStep;
  }

  aiVariation() {
    this.haptic.impact('heavy');
    const track = this.tracks().find(
      (t) => t.id === this.musicManager.selectedTrackId()
    );
    if (track && track.notes.length > 0) {
      this.musicManager.humanizeTrack(track.id);
      this.musicManager.addAutomationLane(track.id, 'cutoff');
    }
  }
  aiSuggestArrangement() {
    this.haptic.impact('heavy');
    this.duplicateSelected();
    this.musicManager.addTrack('AI Pad', 'glass-pad', 'midi');
  }
  aiMixTransition() {
    this.haptic.impact('heavy');
    const tid = this.musicManager.selectedTrackId();
    if (tid) {
      this.musicManager.updateVolume(tid, 0);
      setTimeout(() => this.musicManager.updateVolume(tid, 0.8), 2000);
    }
  }
  toggleAutomation() {
    this.haptic.medium();
    this.isRecordingAutomation.update((v) => !v);
  }

  toggleGroup(trackId: string) {
    this.musicManager.tracks.update((ts) =>
      ts.map((t) => {
        if (t.id === trackId || t.parentId === trackId) {
          return { ...t, collapsed: !t.collapsed };
        }
        return t;
      })
    );
  }

  // ── Stem Splitter handlers ───────────────────────────────────────

  openStemSplit(): void {
    this.stemOpen.set(true);
    this.stemProgress.set(0);
    this.stemStems.set(null);
    this.stemFileName.set(null);
  }

  closeStemSplit(): void {
    this.stemOpen.set(false);
  }

  async onStemFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.stemBusy.set(true);
    this.stemFileName.set(file.name);
    this.stemProgress.set(15);
    this.snackbar.show('🎚 Stem Split · decoding ' + file.name);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = this.musicManager.engine.ctx;
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      this.stemProgress.set(45);
      this.snackbar.show('🎚 Stem Split · spectral decomposition');
      const stems = await this.stemSvc.separate(audioBuffer);
      this.stemStems.set(stems);
      this.stemProgress.set(100);
      this.snackbar.show('🎚 Stem Split · 4 stems ready');
    } catch (err: any) {
      console.error('Stem split failed', err);
      this.snackbar.show('🎚 Stem Split failed: ' + (err?.message ?? 'unknown'));
    } finally {
      this.stemBusy.set(false);
      // Reset file input so the same file can be re-uploaded.
      input.value = '';
    }
  }

  applyStems(): void {
    const stems = this.stemStems();
    if (!stems) return;
    this.musicManager.addStemsAsAudioTracks(stems as any);
    this.snackbar.show('🎚 4 Stem Tracks added');
    this.closeStemSplit();
  }

  canvasHeight() {
    return this.tracks().length * this.laneHeight() + this.rulerHeight;
  }
  gridWidth() {
    return 64 * this.barWidth();
  }
}
