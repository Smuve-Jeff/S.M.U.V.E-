import {
  Component,
  inject,
  signal,
  computed,
  ElementRef,
  ViewChild,
  HostListener,
  AfterViewInit,
  OnDestroy,
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
import {
  StemSeparationService,
  Stems,
} from '../../services/stem-separation.service';
import { SnackbarService } from '../../services/snackbar.service';
import { WebGLRenderer } from '../webgl/webgl-renderer';
import {
  TimelineRenderer,
  TimelineClip,
  TimelineTrack,
  clipColorFromId,
} from '../webgl/timeline-renderer';

@Component({
  selector: 'app-arrangement-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './arrangement-view.component.html',
  styleUrls: ['./arrangement-view.component.css'],
})
export class ArrangementViewComponent implements AfterViewInit, OnDestroy {
  public readonly musicManager = inject(MusicManagerService);
  public readonly audioSession = inject(AudioSessionService);
  public readonly history = inject(HistoryService);
  private readonly haptic = inject(HapticService);
  private readonly enhancedGestures = inject(EnhancedTouchGestureService);
  private readonly stemSvc = inject(StemSeparationService);
  private readonly snackbar = inject(SnackbarService);

  // ── WebGL renderer ───────────────────────────────────────
  private glRenderer!: WebGLRenderer;
  private timelineRenderer!: TimelineRenderer;
  private renderRafId: number | null = null;
  private isGlInitialized = false;

  // ── Stem-Splitter UI state ───────────────────────────────
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
  @ViewChild('glCanvas') glCanvas!: ElementRef<HTMLCanvasElement>;

  bars = computed(() => Array.from({ length: 64 }, (_, i) => i));
  playheadPos = computed(
    () => (this.musicManager.currentStep() / 16) * this.barWidth()
  );

  markers = signal<any[]>([]);
  showAutomation = signal(false);

  // ── Lifecycle ────────────────────────────────────────────

  ngAfterViewInit(): void {
    this.initWebGL();
    this.scheduleRender();
  }

  ngOnDestroy(): void {
    if (this.renderRafId !== null) {
      cancelAnimationFrame(this.renderRafId);
      this.renderRafId = null;
    }
    this.glRenderer?.destroy();
  }

  private initWebGL(): void {
    try {
      this.glRenderer = new WebGLRenderer();
      this.glRenderer.initialize(this.glCanvas.nativeElement);
      this.timelineRenderer = new TimelineRenderer(this.glRenderer);
      this.isGlInitialized = true;
      this.markDirty();
    } catch (e) {
      console.warn('WebGL init failed — arrangement view will fall back to DOM', e);
    }
  }

  // ── Render loop ──────────────────────────────────────────

  private scheduleRender(): void {
    const tick = () => {
      this.renderRafId = requestAnimationFrame(tick);
      if (this.isGlInitialized) {
        const isPlaying = this.audioSession.isPlaying();
        if (isPlaying || this.glRenderer.isDirty) {
          this.renderTimeline();
        }
      }
    };
    this.renderRafId = requestAnimationFrame(tick);
  }

  private markDirty(): void {
    this.glRenderer?.markDirty();
  }

  private renderTimeline(): void {
    const canvas = this.glCanvas?.nativeElement;
    const viewport = this.gridViewport?.nativeElement;
    if (!canvas || !viewport || !this.isGlInitialized) return;

    const dpr = window.devicePixelRatio || 1;
    const vpW = viewport.clientWidth;
    const vpH = viewport.clientHeight;
    const scrollX = viewport.scrollLeft;
    const scrollY = viewport.scrollTop;

    // Resize if needed
    if (canvas.width !== Math.round(vpW * dpr) || canvas.height !== Math.round(vpH * dpr)) {
      this.glRenderer.resize();
    }

    const ppb = this.barWidth();
    this.timelineRenderer.setPixelsPerBar(ppb);

    const camera = {
      scrollX: scrollX / dpr,
      scrollY: scrollY / dpr,
      zoom: 1.0,
    };

    // Build timeline tracks from MusicManager tracks
    const visibleTracks = this.tracks().filter(
      (t) => !t.parentId || !this.tracks().find((p) => p.id === t.parentId)?.collapsed
    );

    const tlTracks: TimelineTrack[] = [];
    const tlClips: TimelineClip[] = [];
    let y = this.rulerHeight;

    for (const track of visibleTracks) {
      const th = this.laneHeight();
      tlTracks.push({
        id: track.id,
        name: track.name,
        y,
        height: th,
        muted: !!track.muted,
        soloed: !!track.soloed,
      });

      for (const clip of track.clips) {
        const color = clipColorFromId(clip.id);
        tlClips.push({
          id: clip.id,
          x: clip.start || 0,
          y,
          width: clip.length || 4,
          height: th,
          color,
          label: clip.name || track.name,
          selected: this.selectedClipIds().has(clip.id),
          isCrosslinked: this.isClipCrosslinked(track, clip),
          type: (clip.type as TimelineClip['type']) || 'midi',
        });
      }
      y += th;
    }

    const totalBars = 64;
    const playheadBar = (this.musicManager.currentStep() || 0) / 16;

    this.glRenderer.clear(0.02, 0.04, 0.09, 1.0);
    this.timelineRenderer.render(
      tlClips,
      tlTracks,
      playheadBar,
      totalBars,
      camera,
      this.rulerHeight
    );
  }

  // ── Pointer / interaction handlers (WebGL-aware) ─────────

  /** Handle pointer down on the WebGL grid */
  onGridPointerDown(e: PointerEvent): void {
    if (!this.isGlInitialized) return;
    const canvas = this.glCanvas.nativeElement;
    const viewport = this.gridViewport.nativeElement;
    const rect = canvas.getBoundingClientRect();

    const world = this.glRenderer.screenToWorld(e.clientX, e.clientY, rect);

    // Account for viewport scroll
    const barX = world.x / this.barWidth();
    const rulerH = this.rulerHeight;

    if (world.y < rulerH) {
      // Clicked on ruler area — seek playhead
      const seekBar = Math.max(0, barX);
      const seekStep = Math.round(seekBar * 16);
      this.musicManager.currentStep.set(seekStep);
      return;
    }

    // Determine which track lane was clicked
    const visibleTracks = this.tracks().filter(
      (t) => !t.parentId || !this.tracks().find((p) => p.id === t.parentId)?.collapsed
    );
    let y = rulerH;
    let hitTrack: TrackModel | null = null;

    for (const track of visibleTracks) {
      const th = this.laneHeight();
      if (world.y >= y && world.y < y + th) {
        hitTrack = track;
        break;
      }
      y += th;
    }

    if (!hitTrack) return;

    // Check if we hit a clip in the track
    const hitClip = hitTrack.clips.find((clip) => {
      const cs = clip.start || 0;
      const cl = clip.length || 4;
      return barX >= cs && barX < cs + cl;
    });

    if (hitClip) {
      this.onClipPointerDown(e, hitTrack.id, hitClip);
    } else {
      this.onLanePointerDownWorld(hitTrack, barX);
    }
  }

  /** Handle scroll wheel for zoom */
  onGridWheel(e: WheelEvent): void {
    if (!e.ctrlKey && !e.metaKey) return; // Only zoom with Ctrl+wheel
    e.preventDefault();
    // Zoom via barWidth adjustment
    const delta = e.deltaY > 0 ? -20 : 20;
    this.barWidth.update((v) => Math.max(40, Math.min(600, v + delta)));
    this.markDirty();
  }

  /** Clip click from WebGL hit test */
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
    this.markDirty();
  }

  /** Lane click to create clips from WebGL */
  onLanePointerDownWorld(track: TrackModel, barX: number) {
    this.selectTrack(track.id);

    if (this.activeTool() === 'select') {
      let bar = barX;
      if (this.snapEnabled()) bar = Math.floor(bar * 4) / 4;

      this.musicManager.addClipToTrack(track.id, {
        start: bar,
        length: 4,
        type: track.type === 'midi' || track.type === 'drum' ? 'midi' : 'audio',
      });
      this.haptic.light();
      this.markDirty();
    }
  }

  // Legacy DOM lane handler (kept for backwards compat)
  onLanePointerDown(e: PointerEvent, track: TrackModel) {
    // Deprecated — canvas handles this now
    this.onGridPointerDown(e);
  }

  // ── Existing methods (unchanged behavior) ────────────────

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
    this.markDirty();
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
    this.markDirty();
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

  findFirstSelectedTrack(): TrackModel | null {
    const ids = this.selectedClipIds();
    if (ids.size === 0) {
      const id = this.musicManager.selectedTrackId();
      return id ? (this.tracks().find((t) => t.id === id) ?? null) : null;
    }
    return this.findClipOwner(ids.values().next().value ?? '')?.track ?? null;
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
    this.markDirty();
  }

  async bounceSelected() {
    const tid = this.musicManager.selectedTrackId();
    if (tid) await this.musicManager.bounceTrack(tid);
  }

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

  isClipCrosslinked(track: TrackModel, clip: StudioClip): boolean {
    const req = this.musicManager.crossLinkRequest();
    if (!req || req.trackId !== track.id) return false;
    if (!req.noteRange) return false;
    const startStep = (clip.start || 0) * 16;
    const endStep = ((clip.start || 0) + (clip.length || 4)) * 16;
    return (
      startStep <= req.noteRange.endStep && endStep >= req.noteRange.startStep
    );
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
    this.markDirty();
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
    this.markDirty();
  }

  // ── Stem Splitter ────────────────────────────────────────

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
