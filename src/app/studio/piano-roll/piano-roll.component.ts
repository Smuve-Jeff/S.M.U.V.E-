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

@Component({
  selector: 'app-piano-roll',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './piano-roll.component.html',
  styleUrls: ['./piano-roll.component.css'],
})
export class PianoRollComponent implements OnInit, AfterViewInit {
  public readonly musicManager = inject(MusicManagerService);
  public readonly audioSession = inject(AudioSessionService);
  public readonly touchGestures = inject(EnhancedTouchGestureService);
  private readonly haptic = inject(HapticService);

  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('keysSidebar') keysSidebar!: ElementRef<HTMLDivElement>;
  @ViewChild('velocityViewport') velocityViewport!: ElementRef<HTMLDivElement>;

  @Output() close = new EventEmitter<void>();

  editMode = signal<'draw' | 'select' | 'erase'>('draw');
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

  /** Cross-link target range — null when none active. */
  highlightedRange = computed(() =>
    this.musicManager.crossLinkRequest()?.noteRange ?? null
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

  /** Smoothly scroll the grid to the highlighted range. Guarded so
   *  scrollContainer being null (pre-viewInit) is safe. */
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

  /** Drop the cross-link highlight when the user starts editing. */
  dismissCrossLink() {
    if (this.musicManager.crossLinkRequest()) {
      this.musicManager.clearCrossLink();
    }
  }

  private lastHandledTimestamp = 0;

  constructor() {
    // React to a newly-arriving cross-link request by scrolling the
    // grid to it. The timestamp guard prevents duplicate scrolls and
    //   the `scrollContainer` null check protects pre-viewInit.
    effect(() => {
      const req = this.musicManager.crossLinkRequest();
      if (!req?.noteRange) return;
      if (req.timestamp === this.lastHandledTimestamp) return;
      if (req.timestamp <= this.lastHandledTimestamp) return;
      this.lastHandledTimestamp = req.timestamp;
      if (this.scrollContainer) {
        this.scrollToHighlight(req.noteRange);
      }
    });
  }

  ngOnInit() {
    try {
      const c = (this.musicManager as any).editorZoomLevel;
      if (typeof c === 'function') void c();
    } catch { /* harmless */ }
  }

  ngAfterViewInit() {
    // Default vertical scroll to mid-keyboard view.
    if (this.scrollContainer) {
      const top = (96) * this.rowHeight() - 200;
      this.scrollContainer.nativeElement.scrollTop = Math.max(0, top);
    }
    // If we mounted with an active cross-link (e.g. user navigated
    //   via deep-link or post-render), honor it by scrolling to the
    //   range AFTER the default vertical scroll.
    const req = this.musicManager.crossLinkRequest();
    if (req && req.noteRange) {
      this.lastHandledTimestamp = req.timestamp;
      this.scrollToHighlight(req.noteRange);
    }
  }

  setEditMode(mode: 'draw' | 'select' | 'erase') {
    this.editMode.set(mode);
    this.haptic.light();
  }

  setKey(key: string) { this.selectedKey.set(key); this.haptic.light(); }
  setScale(scale: string) { this.selectedScale.set(scale); this.haptic.light(); }
  toggleScaleLock() { this.scaleLockEnabled.update(v => !v); this.haptic.light(); }

  zoomPercent = computed(() => Math.round(this.zoomLevel() * 100));

  zoomIn() { this.zoomLevel.update(v => Math.min(3.0, v + 0.25)); this.haptic.light(); }
  zoomOut() { this.zoomLevel.update(v => Math.max(0.25, v - 0.25)); this.haptic.light(); }

  expandGrid() { this.gridSteps.update(v => Math.min(256, v + 16)); }

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

  setSnap(snap: '1/4' | '1/8' | '1/16' | '1/32' | 'off') {
    this.snap.set(snap);
    this.haptic.light();
  }

  setSelectedVelocity(value: number) {
    const track = this.selectedTrack();
    if (!track) return;
    const ids = Array.from(this.selectedNoteIds());
    ids.forEach((id) => this.musicManager.updateNote(track.id, id, { velocity: value }));
  }

  setSelectedProbability(value: number) {
    const track = this.selectedTrack();
    if (!track) return;
    const ids = Array.from(this.selectedNoteIds());
    ids.forEach((id) => this.musicManager.updateNote(track.id, id, { probability: value }));
  }

  // ---- Coordinate helpers ----
  gridWidth = computed(() => this.gridSteps() * this.cellWidth());
  canvasHeight = computed(() => 96 * this.rowHeight());

  rowTopPx(midi: number): number {
    return (95 - (midi - 24)) * this.rowHeight();
  }

  noteTopPx(midi: number): number {
    return (95 - (midi - 24)) * this.rowHeight();
  }

  playheadPx(): number {
    const step = this.musicManager.engine?.visualStep?.() ?? 0;
    return (step % this.gridSteps()) * this.cellWidth();
  }

  syncKeyScroll() {
    if (this.scrollContainer && this.keysSidebar) {
      this.keysSidebar.nativeElement.scrollTop =
        this.scrollContainer.nativeElement.scrollTop;
    }
    if (this.scrollContainer && this.velocityViewport) {
      this.velocityViewport.nativeElement.scrollLeft =
        this.scrollContainer.nativeElement.scrollLeft;
    }
  }

  onVelocityScroll(event: Event) {
    if (this.scrollContainer) {
      this.scrollContainer.nativeElement.scrollLeft =
        (event.target as HTMLElement).scrollLeft;
    }
  }

  // ---- Pointer interactions ----
  onGridPointerDown(event: PointerEvent) {
    // Local interaction — clear any stale cross-link highlight so
    // the focus doesn't outlive its useful context.
    this.dismissCrossLink();
    const container = event.currentTarget as HTMLElement;
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left + container.scrollLeft;
    const y = event.clientY - rect.top + container.scrollTop;
    const step = Math.max(0, Math.floor(x / this.cellWidth()));
    const rowIndex = Math.floor(y / this.rowHeight());
    const midi = 24 + (95 - rowIndex);

    if (this.editMode() === 'draw') {
      this.createNoteAt(step, midi);
    }
  }

  onGridTouchStart(event: TouchEvent) {
    if (event.touches.length === 2) {
      try { this.touchGestures.handlePinch(event); } catch { /* swallow */ }
    }
  }

  onGridTouchMove(event: TouchEvent) {
    if (event.touches.length === 2) {
      event.preventDefault();
      try { this.touchGestures.handlePinch(event); } catch { /* swallow */ }
    }
  }

  private createNoteAt(step: number, midi: number) {
    const track = this.selectedTrack();
    if (!track) return;
    const snappedStep = this.applySnap(step);
    this.musicManager.addNoteToTrack(track.id, {
      id: 'note-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      midi,
      step: snappedStep,
      length: this.lengthFromSnap(),
      velocity: 0.8,
    });
    this.haptic.light();
  }

  private applySnap(step: number): number {
    switch (this.snap()) {
      case '1/4': return Math.round(step / 4) * 4;
      case '1/8': return Math.round(step / 2) * 2;
      case '1/16': return step;
      case '1/32': return step; // half steps represented finer in audio engine
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

  onNotePointerDown(event: PointerEvent, note: TrackNote) {
    event.stopPropagation();
    // Editing an explicit note also dismisses the cross-link shimmer.
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

    if (this.editMode() === 'erase') {
      this.musicManager.removeNotes(track.id, [note.id]);
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
    }
  }

  @HostListener('pointerup')
  onPointerUp() {
    this.draggingNotes = null;
  }

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
      this.haptic.light();
    }
  }

  // ---- Keyboard / utility ----
  @HostListener('window:keydown', ['$event'])
  onKey(ev: KeyboardEvent) {
    if (ev.target instanceof HTMLInputElement) return;
    if (ev.key === 'd' || ev.key === 'D') this.setEditMode('draw');
    if (ev.key === 's' || ev.key === 'S') this.setEditMode('select');
    if (ev.key === 'e' || ev.key === 'E') this.setEditMode('erase');
  }

  humanizeNotes() {
    const track = this.selectedTrack();
    if (!track) return;
    this.haptic.medium();
    this.musicManager.humanizeTrack(track.id);
  }

  isBlackKey(midi: number): boolean {
    return [1, 3, 6, 8, 10].includes(midi % 12);
  }
  isInScale(midi: number): boolean {
    return [0, 2, 4, 5, 7, 9, 11].includes(midi % 12);
  }
  getKeyName(midi: number): string {
    return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][
      midi % 12
    ];
  }
  getOctaveLabel(midi: number): string {
    return Math.floor(midi / 12 - 1).toString();
  }
}
