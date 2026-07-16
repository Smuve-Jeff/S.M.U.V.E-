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

  ngOnInit() {
    try {
      const c = (this.musicManager as any).editorZoomLevel;
      if (typeof c === 'function') void c();
    } catch { /* harmless */ }
  }

  ngAfterViewInit() {
    if (this.scrollContainer) {
      const top = (96) * this.rowHeight() - 200;
      this.scrollContainer.nativeElement.scrollTop = Math.max(0, top);
    }
  }

  setEditMode(mode: 'draw' | 'select' | 'erase') {
    this.editMode.set(mode);
    this.haptic.light();
  }

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
  gridWidth = computed(() => 64 * this.cellWidth());
  canvasHeight = computed(() => 96 * this.rowHeight());

  rowTopPx(midi: number): number {
    return (95 - (midi - 24)) * this.rowHeight();
  }

  noteTopPx(midi: number): number {
    return (95 - (midi - 24)) * this.rowHeight();
  }

  playheadPx(): number {
    const step = this.musicManager.engine?.visualStep?.() ?? 0;
    return (step % 64) * this.cellWidth();
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
