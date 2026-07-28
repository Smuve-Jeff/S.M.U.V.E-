import {
  Component,
  inject,
  signal,
  computed,
  ElementRef,
  ViewChild,
  AfterViewInit,
  HostListener,
  Output,
  EventEmitter,
  OnInit,
  effect,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MusicManagerService,
  TrackNote,
} from '../../services/music-manager.service';
import { AudioSessionService } from '../audio-session.service';
import { EnhancedTouchGestureService } from '../../services/enhanced-touch-gesture.service';
import { HapticService } from '../../services/haptic.service';
import { DjMidiService } from '../../services/dj-midi.service';
import { WebGLRenderer } from '../webgl/webgl-renderer';
import {
  PianoRollRenderer,
  PianoRollNote,
} from '../webgl/piano-roll-renderer';

const VELOCITY_LANE_HEIGHT = 80;
const MAX_MIDI = 96;

@Component({
  selector: 'app-piano-roll',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './piano-roll.component.html',
  styleUrls: ['./piano-roll.component.css'],
})
export class PianoRollComponent implements OnInit, AfterViewInit, OnDestroy {
  public readonly musicManager = inject(MusicManagerService);
  public readonly audioSession = inject(AudioSessionService);
  public readonly touchGestures = inject(EnhancedTouchGestureService);
  private readonly haptic = inject(HapticService);
  private readonly djMidi = inject(DjMidiService);

  // ── WebGL renderers ──────────────────────────────────────
  private glRenderer!: WebGLRenderer;
  private prRenderer!: PianoRollRenderer;
  private glVelRenderer!: WebGLRenderer;
  private renderRafId: number | null = null;
  private isGlInitialized = false;

  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('keysSidebar') keysSidebar!: ElementRef<HTMLDivElement>;
  @ViewChild('velocityViewport') velocityViewport!: ElementRef<HTMLDivElement>;
  @ViewChild('glCanvas') glCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('glVelocityCanvas') glVelocityCanvas!: ElementRef<HTMLCanvasElement>;

  @Output() close = new EventEmitter<void>();
  @Output() openBezierEditor = new EventEmitter<string>();

  editMode = signal<'draw' | 'select' | 'erase' | 'chord'>('draw');

  // ── Chord Stamp Tool ──────────────────────────────────────
  selectedChordType = signal<
    'major' | 'minor' | 'min7' | 'maj7' | 'dom7' | 'sus4' | 'dim'
  >('minor');
  chordTypes = [
    { label: 'Maj', value: 'major' as const, intervals: [0, 4, 7] },
    { label: 'Min', value: 'minor' as const, intervals: [0, 3, 7] },
    { label: 'm7', value: 'min7' as const, intervals: [0, 3, 7, 10] },
    { label: 'M7', value: 'maj7' as const, intervals: [0, 4, 7, 11] },
    { label: '7', value: 'dom7' as const, intervals: [0, 4, 7, 10] },
    { label: 'sus4', value: 'sus4' as const, intervals: [0, 5, 7] },
    { label: 'dim', value: 'dim' as const, intervals: [0, 3, 6] },
  ];
  getChordIntervals(): number[] {
    return (
      this.chordTypes.find((c) => c.value === this.selectedChordType())
        ?.intervals ?? [0, 3, 7]
    );
  }

  // ── Ghost Notes ───────────────────────────────────────────
  ghostNotes = computed(() => {
    const selectedId = this.selectedTrack()?.id;
    return this.musicManager
      .tracks()
      .filter((t) => t.id !== selectedId)
      .flatMap((t) => t.notes);
  });

  ghostNoteSet = computed(() => new Set(this.ghostNotes().map((n) => n.id)));
  isGhost(note: TrackNote): boolean {
    return this.ghostNoteSet().has(note.id);
  }

  snap = signal<'1/4' | '1/8' | '1/16' | '1/32' | 'off'>('1/16');
  zoomLevel = signal(1.0);
  gridSteps = signal(64);
  selectedKey = signal('C');
  selectedScale = signal('major');
  scaleLockEnabled = signal(false);
  snapOptions = [
    { label: '1/4', value: '1/4' as const },
    { label: '1/8', value: '1/8' as const },
    { label: '1/16', value: '1/16' as const },
    { label: '1/32', value: '1/32' as const },
    { label: 'Off', value: 'off' as const },
  ];

  selectedNoteIds = signal<Set<string>>(new Set());
  private draggingNotes: {
    startX: number;
    startY: number;
    originalPositions: Map<string, { step: number; midi: number }>;
  } | null = null;

  selectedTrack = this.musicManager.selectedTrack;

  rowHeight = computed(() =>
    Math.max(18, 22 * this.touchGestures.verticalZoomLevel())
  );
  cellWidth = computed(() => Math.max(20, 32 * this.touchGestures.zoomLevel()));
  columns = computed(() => Array.from({ length: 64 }, (_, i) => i));

  viewportNotes = computed(() => this.selectedTrack()?.notes || []);

  displayKeys = computed(() => {
    return Array.from({ length: 96 }, (_, i) => 24 + i);
  });

  selectionCount = computed(() => this.selectedNoteIds().size);
  selectedNoteVelocity = computed(() => {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return 0.8;
    const first = track.notes.find((n) => ids.has(n.id));
    return Number((first?.velocity ?? 0.8).toFixed(2));
  });
  selectedNoteProbability = computed(() => {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return 1.0;
    const first = track.notes.find((n) => ids.has(n.id));
    return Number((first?.probability ?? 1.0).toFixed(2));
  });
  selectedNoteMicroOffset = computed(() => {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return 0;
    const first = track.notes.find((n) => ids.has(n.id));
    return Number((first?.microOffset ?? 0).toFixed(3));
  });
  selectedNotePitchBend = computed(() => {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return 0;
    const first = track.notes.find((n) => ids.has(n.id));
    return Number((first?.pitchBend ?? 0).toFixed(2));
  });
  selectedNoteArticulation = computed(() => {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return 'normal';
    const first = track.notes.find((n) => ids.has(n.id));
    return first?.articulation ?? 'normal';
  });
  selectedNoteLength = computed(() => {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return 1;
    const first = track.notes.find((n) => ids.has(n.id));
    return first?.length ?? 1;
  });
  articulationOptions = [
    { label: 'Normal', value: 'normal' as const },
    { label: 'Staccato', value: 'staccato' as const },
    { label: 'Legato', value: 'legato' as const },
    { label: 'Portamento', value: 'portamento' as const },
    { label: 'Pizzicato', value: 'pizzicato' as const },
    { label: 'Accent', value: 'accent' as const },
  ];

  showPrecisionPanel = signal(false);

  // ── Bezier / Automation ──────────────────────────────────
  showAutomationMenu = signal(false);
  automationParam = signal<'velocity' | 'cutoff' | 'pan' | 'volume'>('velocity');

  openBezierForCurrentLane(): void {
    const trackId = this.selectedTrack()?.id || 'main';
    const laneId = `${trackId}_${this.automationParam()}`;
    this.openBezierEditor.emit(laneId);
    this.showAutomationMenu.set(false);
  }

  toggleAutomationMenu(): void {
    this.showAutomationMenu.update((v) => !v);
  }

  setAutomationParam(param: string): void {
    this.automationParam.set(param as any);
    this.openBezierForCurrentLane();
  }

  // ── CC Lane Strip (4 lanes: Mod, Expression, Pan, Cutoff) ──
  ccLanes = [
    { id: 'mod', label: 'Mod', cc: 1, color: '#A855F7', param: 'modulation' },
    { id: 'expr', label: 'Expr', cc: 11, color: '#EC4899', param: 'expression' },
    { id: 'pan', label: 'Pan', cc: 10, color: '#2BA09C', param: 'pan' },
    { id: 'cut', label: 'Cut', cc: 74, color: '#D97706', param: 'cutoff' },
  ] as const;

  showCcLane = signal(false);
  activeCcLane = signal<string | null>(null);

  /** Track the current value (0-127) for each CC lane for draw interaction */
  ccLaneValues = signal<Record<string, number>>({
    mod: 0,
    expr: 64,
    pan: 64,
    cut: 127,
  });

  /** CC lane draw interaction — same pattern as velocity lane */
  onCcPointerDown(event: PointerEvent, laneId: string): void {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const height = rect.height || 24;
    const value = Math.max(0, Math.min(127, Math.round((1 - y / height) * 127)));
    this.updateCcLaneValue(laneId, value);
  }

  onCcPointerMove(event: PointerEvent, laneId: string): void {
    if (event.buttons !== 1) return;
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const height = rect.height || 24;
    const value = Math.max(0, Math.min(127, Math.round((1 - y / height) * 127)));
    this.updateCcLaneValue(laneId, value);
  }

  private updateCcLaneValue(laneId: string, value: number): void {
    this.ccLaneValues.update((v) => ({ ...v, [laneId]: value }));
    this.haptic.light();
    // Find the CC number for this lane and send MIDI CC
    const lane = this.ccLanes.find((l) => l.id === laneId);
    if (lane) {
      this.djMidi.sendCC(lane.cc, value, 0);
    }
  }

  toggleCcLane(laneId: string): void {
    if (this.activeCcLane() === laneId) {
      this.activeCcLane.set(null);
      this.showCcLane.set(false);
    } else {
      this.activeCcLane.set(laneId);
      this.showCcLane.set(true);
    }
    this.haptic.light();
  }

  openBezierForCcLane(laneId: string): void {
    const trackId = this.selectedTrack()?.id || 'main';
    const fullLaneId = `${trackId}_cc_${laneId}`;
    this.openBezierEditor.emit(fullLaneId);
    this.haptic.light();
  }

  highlightedRange = computed(
    () => this.musicManager.crossLinkRequest()?.noteRange ?? null
  );
  highlightedNoteIds = computed(() => {
    const r = this.highlightedRange();
    if (!r) return new Set<string>();
    const ids = new Set<string>();
    (this.selectedTrack()?.notes ?? []).forEach((n) => {
      if (n.step >= r.startStep && n.step <= r.endStep) ids.add(n.id);
    });
    return ids;
  });
  isHighlighted(note: TrackNote): boolean {
    return this.highlightedNoteIds().has(note.id);
  }

  private lastHandledTimestamp = 0;

  constructor() {
    effect(() => {
      const req = this.musicManager.crossLinkRequest?.();
      if (!req || !req.noteRange) return;
      if (req.timestamp === this.lastHandledTimestamp) return;
      if (req.timestamp <= this.lastHandledTimestamp) return;
      this.lastHandledTimestamp = req.timestamp;
      if (this.scrollContainer) {
        this.scrollToHighlight(req.noteRange);
      }
    });
  }

  // ── Lifecycle ────────────────────────────────────────────

  ngOnInit() {
    // no-op init
  }

  ngAfterViewInit() {
    this.initWebGL();
    this.scheduleRender();
  }

  ngOnDestroy() {
    if (this.renderRafId !== null) {
      cancelAnimationFrame(this.renderRafId);
      this.renderRafId = null;
    }
    this.glRenderer?.destroy();
    this.glVelRenderer?.destroy();
  }

  private initWebGL(): void {
    try {
      this.glRenderer = new WebGLRenderer();
      this.glRenderer.initialize(this.glCanvas.nativeElement);
      this.prRenderer = new PianoRollRenderer(this.glRenderer);

      this.glVelRenderer = new WebGLRenderer();
      this.glVelRenderer.initialize(this.glVelocityCanvas.nativeElement);

      this.isGlInitialized = true;
      this.markDirty();
    } catch (e) {
      console.warn('WebGL init failed for piano roll', e);
    }
  }

  // ── Render loop ──────────────────────────────────────────

  private scheduleRender(): void {
    const tick = () => {
      this.renderRafId = requestAnimationFrame(tick);
      if (this.isGlInitialized) {
        const isPlaying = this.audioSession.isPlaying();
        if (isPlaying || this.glRenderer.isDirty) {
          this.renderPianoRoll();
        }
      }
    };
    this.renderRafId = requestAnimationFrame(tick);
  }

  private markDirty(): void {
    this.glRenderer?.markDirty();
    this.glVelRenderer?.markDirty();
  }

  private renderPianoRoll(): void {
    const gridCanvas = this.glCanvas?.nativeElement;
    const container = this.scrollContainer?.nativeElement;
    if (!gridCanvas || !container || !this.isGlInitialized) return;

    const dpr = window.devicePixelRatio || 1;
    const cw = container.clientWidth;
    const ch = container.clientHeight;

    // Resize
    if (gridCanvas.width !== Math.round(cw * dpr) || gridCanvas.height !== Math.round(ch * dpr)) {
      this.glRenderer.resize();
    }

    const pps = this.cellWidth();
    const rh = this.rowHeight();
    this.prRenderer.setPixelsPerStep(pps);
    this.prRenderer.setRowHeight(rh);
    this.prRenderer.setMidiRange(24, 24 + MAX_MIDI - 1);

    const camera = {
      scrollX: container.scrollLeft / dpr,
      scrollY: container.scrollTop / dpr,
      zoom: 1.0,
    };

    // Build note data
    const prNotes: PianoRollNote[] = [];
    const mainNotes = this.selectedTrack()?.notes ?? [];
    const ghostNotes = this.ghostNotes();
    const selIds = this.selectedNoteIds();
    const hlIds = this.highlightedNoteIds();

    for (const note of ghostNotes) {
      prNotes.push({
        id: note.id,
        midi: note.midi,
        step: note.step,
        length: note.length,
        velocity: note.velocity,
        selected: false,
        isGhost: true,
        isHighlighted: false,
      });
    }

    for (const note of mainNotes) {
      prNotes.push({
        id: note.id,
        midi: note.midi,
        step: note.step,
        length: note.length,
        velocity: note.velocity,
        selected: selIds.has(note.id),
        isGhost: false,
        isHighlighted: hlIds.has(note.id),
      });
    }

    const playheadStep = this.musicManager.engine?.visualStep?.() ?? 0;
    const totalSteps = this.gridSteps();

    this.glRenderer.clear(0.03, 0.05, 0.10, 1.0);
    this.prRenderer.render(prNotes, playheadStep, totalSteps, camera, MAX_MIDI);

    // Velocity lane
    const velCanvas = this.glVelocityCanvas?.nativeElement;
    const velViewport = this.velocityViewport?.nativeElement;
    if (velCanvas && velViewport) {
      const vw = velViewport.clientWidth;
      if (velCanvas.width !== Math.round(vw * dpr) || velCanvas.height !== Math.round(VELOCITY_LANE_HEIGHT * dpr)) {
        this.glVelRenderer.resize();
      }

      const velCamera = {
        scrollX: velViewport.scrollLeft / dpr,
        scrollY: 0,
        zoom: 1.0,
      };

      const selVelMap = new Map<string, number>();
      selIds.forEach((id) => {
        const n = mainNotes.find((nn) => nn.id === id);
        if (n) selVelMap.set(id, n.velocity);
      });

      this.glVelRenderer.clear(0.04, 0.06, 0.11, 1.0);
      this.prRenderer.renderVelocityLane(
        prNotes.filter((n) => !n.isGhost),
        selVelMap,
        playheadStep,
        totalSteps,
        velCamera,
        VELOCITY_LANE_HEIGHT,
        0
      );
    }
  }

  // ── Scroll helpers ───────────────────────────────────────

  scrollToHighlight(range: { startStep: number; endStep: number }) {
    setTimeout(() => {
      if (!this.scrollContainer) return;
      const target = Math.max(0, range.startStep - 4) * this.cellWidth();
      this.scrollContainer.nativeElement.scrollTo({
        left: target,
        behavior: 'smooth',
      });
    }, 60);
  }

  dismissCrossLink() {
    if (this.musicManager.crossLinkRequest()) {
      this.musicManager.clearCrossLink();
    }
  }

  // ── Wheel zoom ───────────────────────────────────────────

  onGridWheel(e: WheelEvent): void {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    this.zoomLevel.update((v) => Math.max(0.25, Math.min(3.0, v + delta)));
    this.markDirty();
  }

  // ── Touch interactions ───────────────────────────────────
  private touchStartTime = 0;
  private touchStartX = 0;
  private touchStartY = 0;
  private isSwiping = false;
  private lastPinchZoom = 1;
  private drawFromTouch = false;

  onGridTouchStart(event: TouchEvent) {
    this.touchStartTime = Date.now();
    if (event.touches.length === 1) {
      this.touchStartX = event.touches[0].clientX;
      this.touchStartY = event.touches[0].clientY;
      this.isSwiping = false;
      this.drawFromTouch = false;
    }
    if (event.touches.length === 2) {
      this.lastPinchZoom = this.touchGestures.zoomLevel();
      try { this.touchGestures.handlePinch(event); } catch {}
    }
  }

  onGridTouchMove(event: TouchEvent) {
    if (event.touches.length === 2) {
      event.preventDefault();
      try {
        this.touchGestures.handlePinch(event);
        const newZoom = this.touchGestures.zoomLevel();
        if (Math.abs(newZoom - this.lastPinchZoom) > 0.15) {
          this.haptic.preset('tick');
          this.lastPinchZoom = newZoom;
        }
      } catch {}
    }
    if (event.touches.length === 1 && this.editMode() === 'draw') {
      const dx = event.touches[0].clientX - this.touchStartX;
      const dy = event.touches[0].clientY - this.touchStartY;
      if (Math.hypot(dx, dy) > 15 && !this.drawFromTouch) {
        this.isSwiping = true;
      }
    }
  }

  onGridTouchEnd(event: TouchEvent) {
    if (
      event.changedTouches.length === 1 &&
      !this.isSwiping &&
      this.editMode() === 'draw'
    ) {
      const touch = event.changedTouches[0];
      const container = this.scrollContainer?.nativeElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = touch.clientX - rect.left + container.scrollLeft;
      const y = touch.clientY - rect.top + container.scrollTop;
      const step = Math.max(0, Math.floor(x / this.cellWidth()));
      const rowIndex = Math.floor(y / this.rowHeight());
      const midi = 24 + (MAX_MIDI - 1 - rowIndex);
      const snappedStep = this.applySnap(step);
      const rowFraction = (y % this.rowHeight()) / this.rowHeight();
      const velocity = Math.max(0.15, Math.min(1.0, 1.0 - rowFraction * 0.6));

      const track = this.selectedTrack();
      if (track) {
        this.musicManager.addNoteToTrack(track.id, {
          id: 'note-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          midi,
          step: snappedStep,
          length: this.lengthFromSnap(),
          velocity: Number(velocity.toFixed(2)),
        });
        this.haptic.velocity(velocity);
        this.drawFromTouch = true;
        this.markDirty();
      }
    }
    this.isSwiping = false;
  }

  // ── Pointer interaction on grid canvas ───────────────────

  onGridPointerDown(event: PointerEvent) {
    this.dismissCrossLink();
    const container = event.currentTarget as HTMLElement;
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left + container.scrollLeft;
    const y = event.clientY - rect.top + container.scrollTop;
    const step = Math.max(0, Math.floor(x / this.cellWidth()));
    const rowIndex = Math.floor(y / this.rowHeight());
    const midi = 24 + (MAX_MIDI - 1 - rowIndex);

    if (this.editMode() === 'draw') {
      this.createNoteAt(step, midi);
    }
  }

  onNotePointerDown(event: PointerEvent, note: TrackNote) {
    event.stopPropagation();
    this.dismissCrossLink();
    const track = this.selectedTrack();
    if (!track) return;
    if (!event.shiftKey && !this.selectedNoteIds().has(note.id)) {
      this.selectedNoteIds.set(new Set([note.id]));
    } else if (event.shiftKey) {
      const next = new Set(this.selectedNoteIds());
      if (next.has(note.id)) next.delete(note.id);
      else next.add(note.id);
      this.selectedNoteIds.set(next);
    }
    this.markDirty();

    if (this.editMode() === 'erase') {
      this.musicManager.removeNotes(track.id, [note.id]);
      this.markDirty();
      return;
    }

    const originalPositions = new Map<string, { step: number; midi: number }>();
    this.selectedNoteIds().forEach((id) => {
      const n = this.musicManager.selectedTrack()?.notes.find((nn) => nn.id === id);
      if (n) originalPositions.set(id, { step: n.step, midi: n.midi });
    });
    this.draggingNotes = {
      startX: event.clientX,
      startY: event.clientY,
      originalPositions,
    };
  }

  @HostListener('pointermove', ['$event'])
  onPointerMove(e: PointerEvent) {
    if (this.draggingNotes) {
      const dx = e.clientX - this.draggingNotes.startX;
      const dy = e.clientY - this.draggingNotes.startY;
      const dSteps = dx / this.cellWidth();
      const dMidi = -Math.round(dy / this.rowHeight());
      const track = this.musicManager.selectedTrack();
      if (!track) return;
      this.draggingNotes.originalPositions.forEach((pos, id) => {
        this.musicManager.updateNote(track.id, id, {
          step: Math.max(0, pos.step + dSteps),
          midi: Math.max(0, Math.min(127, pos.midi + dMidi)),
        });
      });
      this.markDirty();
    }
  }

  @HostListener('pointerup')
  onPointerUp() {
    this.draggingNotes = null;
  }

  // ── Velocity lane interaction ────────────────────────────

  onVelocityPointerDown(event: PointerEvent) {
    this.dismissCrossLink();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left + (event.currentTarget as HTMLElement).scrollLeft;
    const y = event.clientY - rect.top;
    const step = Math.max(0, Math.floor(x / this.cellWidth()));
    const velocity = Math.max(0.1, Math.min(1.5, 1 - y / 60));
    const track = this.selectedTrack();
    if (!track) return;
    const note = track.notes.find((n) => Math.floor(n.step) === step);
    if (note) {
      this.musicManager.updateNote(track.id, note.id, { velocity });
      this.haptic.velocity(velocity);
      this.markDirty();
    }
  }

  onVelocityPointerMove(event: PointerEvent) {
    if (event.buttons !== 1) return;
    this.onVelocityPointerDown(event);
  }

  // ── Note creation ────────────────────────────────────────

  private createNoteAt(step: number, midi: number) {
    const track = this.selectedTrack();
    if (!track) return;
    const snappedStep = this.applySnap(step);
    if (this.editMode() === 'chord') {
      const intervals = this.getChordIntervals();
      intervals.forEach((interval, idx) => {
        const noteMidi = midi + interval;
        if (noteMidi >= 0 && noteMidi <= 127) {
          this.musicManager.addNoteToTrack(track.id, {
            id: 'chord-' + Date.now() + '-' + idx + '-' + Math.floor(Math.random() * 1000),
            midi: noteMidi,
            step: snappedStep,
            length: this.lengthFromSnap(),
            velocity: idx === 0 ? 0.9 : 0.75,
          });
        }
      });
      this.haptic.medium();
    } else {
      this.musicManager.addNoteToTrack(track.id, {
        id: 'note-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        midi,
        step: snappedStep,
        length: this.lengthFromSnap(),
        velocity: 0.8,
      });
      this.haptic.light();
    }
    this.markDirty();
  }

  private applySnap(step: number): number {
    switch (this.snap()) {
      case '1/4': return Math.round(step / 4) * 4;
      case '1/8': return Math.round(step / 2) * 2;
      case '1/16': return step;
      case '1/32': return step;
      default: return step;
    }
  }

  private lengthFromSnap(): number {
    switch (this.snap()) {
      case '1/4': return 4;
      case '1/8': return 2;
      case '1/16': return 1;
      case '1/32': return 0.5;
      default: return 1;
    }
  }

  // ── Existing utility methods ─────────────────────────────

  setEditMode(mode: 'draw' | 'select' | 'erase' | 'chord') {
    this.editMode.set(mode);
    this.haptic.light();
  }

  setKey(key: string) { this.selectedKey.set(key); this.haptic.light(); }
  setScale(scale: string) { this.selectedScale.set(scale); this.haptic.light(); }
  toggleScaleLock() { this.scaleLockEnabled.update((v) => !v); this.haptic.light(); }

  zoomPercent = computed(() => Math.round(this.zoomLevel() * 100));
  zoomIn() { this.zoomLevel.update((v) => Math.min(3.0, v + 0.25)); this.haptic.light(); this.markDirty(); }
  zoomOut() { this.zoomLevel.update((v) => Math.max(0.25, v - 0.25)); this.haptic.light(); this.markDirty(); }

  fitToPage(): void {
    const totalSteps = this.musicManager.tracks().reduce((max, track: any) => {
      const length = (track.notes ?? []).reduce(
        (m: number, n: any) => Math.max(m, (n.start ?? 0) + (n.duration ?? 0)), 0
      );
      return Math.max(max, length);
    }, 0) + 16;
    const targetZoom = Math.max(0.25, Math.min(3, 96 / Math.max(1, totalSteps)));
    this.zoomLevel.set(targetZoom);
    this.markDirty();
  }

  expandGrid() { this.gridSteps.update((v) => Math.min(256, v + 16)); this.markDirty(); }

  beatLabels = computed(() => {
    const cw = this.cellWidth();
    const steps = this.gridSteps();
    const labels: { label: string; pos: number }[] = [];
    for (let i = 0; i < steps; i += 4) {
      labels.push({ label: String(Math.floor(i / 16) + 1) + '.' + ((i % 16) / 4 + 1), pos: i * cw });
    }
    return labels;
  });

  keyOptions = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  scaleOptions = [
    { label: 'Major', value: 'major' },
    { label: 'Minor', value: 'minor' },
    { label: 'Blues', value: 'blues' },
    { label: 'Penta', value: 'pentatonic' },
    { label: 'Chromatic', value: 'chromatic' },
  ];

  setSnap(snap: '1/4' | '1/8' | '1/16' | '1/32' | 'off') { this.snap.set(snap); this.haptic.light(); }

  setSelectedVelocity(value: number) {
    const track = this.selectedTrack(); if (!track) return;
    Array.from(this.selectedNoteIds()).forEach((id) => this.musicManager.updateNote(track.id, id, { velocity: value }));
    this.markDirty();
  }
  setSelectedProbability(value: number) {
    const track = this.selectedTrack(); if (!track) return;
    Array.from(this.selectedNoteIds()).forEach((id) => this.musicManager.updateNote(track.id, id, { probability: value }));
  }
  setSelectedMicroOffset(value: number) {
    const track = this.selectedTrack(); if (!track) return;
    Array.from(this.selectedNoteIds()).forEach((id) => this.musicManager.updateNote(track.id, id, { microOffset: Number(value.toFixed(3)) }));
  }
  setSelectedPitchBend(value: number) {
    const track = this.selectedTrack(); if (!track) return;
    Array.from(this.selectedNoteIds()).forEach((id) => this.musicManager.updateNote(track.id, id, { pitchBend: Number(value.toFixed(2)) }));
  }
  setSelectedArticulation(value: string) {
    const track = this.selectedTrack(); if (!track) return;
    Array.from(this.selectedNoteIds()).forEach((id) => this.musicManager.updateNote(track.id, id, { articulation: value as any }));
    this.haptic.light();
  }
  setSelectedLength(value: number) {
    const track = this.selectedTrack(); if (!track) return;
    Array.from(this.selectedNoteIds()).forEach((id) => this.musicManager.updateNote(track.id, id, { length: Math.max(0.125, value) }));
  }
  togglePrecisionPanel() { this.showPrecisionPanel.update((v) => !v); this.haptic.light(); }

  gridWidth = computed(() => this.gridSteps() * this.cellWidth());
  canvasHeight = computed(() => MAX_MIDI * this.rowHeight());
  rowTopPx(midi: number): number { return (MAX_MIDI - 1 - (midi - 24)) * this.rowHeight(); }
  noteTopPx(midi: number): number { return (MAX_MIDI - 1 - (midi - 24)) * this.rowHeight(); }

  playheadPx(): number {
    const step = this.musicManager.engine?.visualStep?.() ?? 0;
    return (step % this.gridSteps()) * this.cellWidth();
  }

  syncKeyScroll() {
    if (this.scrollContainer && this.keysSidebar) {
      this.keysSidebar.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollTop;
    }
    if (this.scrollContainer && this.velocityViewport) {
      this.velocityViewport.nativeElement.scrollLeft = this.scrollContainer.nativeElement.scrollLeft;
    }
  }

  onVelocityScroll(event: Event) {
    if (this.scrollContainer) {
      this.scrollContainer.nativeElement.scrollLeft = (event.target as HTMLElement).scrollLeft;
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKey(ev: KeyboardEvent) {
    if (ev.target instanceof HTMLInputElement) return;
    if (ev.key === 'd' || ev.key === 'D') this.setEditMode('draw');
    if (ev.key === 's' || ev.key === 'S') this.setEditMode('select');
    if (ev.key === 'e' || ev.key === 'E') this.setEditMode('erase');
    if (ev.key === 'c' || ev.key === 'C') this.setEditMode('chord');
  }

  humanizeNotes() {
    const track = this.selectedTrack(); if (!track) return;
    this.haptic.medium();
    this.musicManager.humanizeTrack(track.id);
    this.markDirty();
  }

  isBlackKey(midi: number): boolean { return [1, 3, 6, 8, 10].includes(midi % 12); }
  isInScale(midi: number): boolean { return [0, 2, 4, 5, 7, 9, 11].includes(midi % 12); }
  getKeyName(midi: number): string { return ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][midi % 12]; }
  getOctaveLabel(midi: number): string { return Math.floor(midi / 12 - 1).toString(); }
}
