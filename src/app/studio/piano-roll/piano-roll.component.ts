import {
  Component,
  signal,
  computed,
  inject,
  ElementRef,
  ViewChild,
  HostListener,
  AfterViewInit,
  OnInit,
  ChangeDetectorRef,
  Output,
  EventEmitter
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import {
  MusicManagerService,
  TrackNote,
} from '../../services/music-manager.service';
import { HapticService } from '../../services/haptic.service';
import { EnhancedTouchGestureService } from '../../services/enhanced-touch-gesture.service';

@Component({
  selector: 'app-piano-roll',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './piano-roll.component.html',
  styleUrls: ['./piano-roll.component.css'],
})
export class PianoRollComponent implements OnInit, AfterViewInit {
  public readonly audioSession = inject(AudioSessionService);
  public readonly musicManager = inject(MusicManagerService);
  private readonly haptic = inject(HapticService);
  public readonly touchGestures = inject(EnhancedTouchGestureService);
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('keysSidebar') keysSidebar!: ElementRef<HTMLDivElement>;
  @ViewChild('velocityViewport') velocityViewport!: ElementRef<HTMLDivElement>;

  @Output() close = new EventEmitter<void>();

  isMobile = signal(window.innerWidth < 768);
  editMode = signal<'draw' | 'select' | 'erase'>('draw');
  selectedNoteIds = signal<Set<string>>(new Set());
  selectionBox = signal<{ x: number; y: number; w: number; h: number } | null>(null);
  isSelecting = false;
  isRecordingAutomation = signal(false);

  private startX = 0;
  private startY = 0;
  private draggingNotes: { startX: number; startY: number; originalPositions: Map<string, { step: number; midi: number }> } | null = null;

  selectedTrack = this.musicManager.selectedTrack;

  rowHeight = computed(() => (this.isMobile() ? 48 : 24) * this.touchGestures.verticalZoomLevel());
  cellWidth = computed(() => 40 * this.touchGestures.zoomLevel());

  viewportNotes = computed(() => this.selectedTrack()?.notes || []);

  displayKeys = Array.from({ length: 128 }, (_, i) => 127 - i);
  gridColumns = Array.from({ length: 64 }, (_, i) => i);
  cells = this.gridColumns;

  selectedNoteVelocity = computed(() => {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return 0.8;
    const first = track.notes.find(n => ids.has(n.id));
    return first?.velocity || 0.8;
  });

  selectedNoteProbability = computed(() => {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return 1.0;
    const first = track.notes.find(n => ids.has(n.id));
    return first?.probability ?? 1.0;
  });

  ngOnInit() { this.checkMobile(); }

  ngAfterViewInit() {
    if (this.scrollContainer) {
      const top = (127 - 60) * this.rowHeight() - 100;
      this.scrollContainer.nativeElement.scrollTop = Math.max(0, top);
      this.syncKeyScroll();
    }
  }

  @HostListener('window:resize')
  checkMobile() {
    this.isMobile.set(window.innerWidth < 768);
  }

  syncKeyScroll() {
    if (!this.scrollContainer || !this.keysSidebar) return;
    this.keysSidebar.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollTop;
    if (this.velocityViewport) {
       this.velocityViewport.nativeElement.scrollLeft = this.scrollContainer.nativeElement.scrollLeft;
    }
  }

  onVelocityScroll(event: Event) {
    if (this.scrollContainer) {
       this.scrollContainer.nativeElement.scrollLeft = (event.target as HTMLElement).scrollLeft;
    }
  }

  onGridPointerDown(event: PointerEvent) {
    if (this.editMode() === 'select') {
      const container = event.currentTarget as HTMLElement;
      const rect = container.getBoundingClientRect();
      this.isSelecting = true;
      this.startX = event.clientX - rect.left + container.scrollLeft;
      this.startY = event.clientY - rect.top + container.scrollTop;
      return;
    }
    if (this.editMode() === "draw") {
      this.createNoteAtPoint(event.clientX, event.clientY, event.currentTarget as HTMLElement);
    }
  }

  onVelocityPointerDown(event: PointerEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left + (event.currentTarget as HTMLElement).scrollLeft;
    const y = event.clientY - rect.top;
    const step = Math.floor(x / this.cellWidth());
    const velocity = Math.max(0.1, Math.min(1.5, (96 - y) / 60));

    const track = this.selectedTrack();
    if (!track) return;
    const note = track.notes.find(n => Math.floor(n.step) === step);
    if (note) {
       this.musicManager.updateNote(track.id, note.id, { velocity });
       this.haptic.light();
    }
  }

  onGridTouchStart(event: TouchEvent) {
    if (event.touches.length === 2) this.touchGestures.handlePinch(event);
  }

  onGridTouchMove(event: TouchEvent) {
    if (event.touches.length === 2) {
      event.preventDefault();
      this.touchGestures.handlePinch(event);
    }
  }

  onGridTouchEnd() {}

  onNotePointerDown(event: PointerEvent, note: TrackNote) {
    event.stopPropagation();
    if (this.editMode() === 'select') {
      if (!event.shiftKey && !this.selectedNoteIds().has(note.id)) {
        this.selectedNoteIds.set(new Set([note.id]));
      } else if (event.shiftKey) {
        const next = new Set(this.selectedNoteIds());
        if (next.has(note.id)) next.delete(note.id);
        else next.add(note.id);
        this.selectedNoteIds.set(next);
      }

      const originalPositions = new Map<string, { step: number; midi: number }>();
      this.selectedNoteIds().forEach(id => {
        const n = this.selectedTrack()?.notes.find(note => note.id === id);
        if (n) originalPositions.set(id, { step: n.step, midi: n.midi });
      });

      this.draggingNotes = { startX: event.clientX, startY: event.clientY, originalPositions };
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } else if (this.editMode() === 'erase') {
      this.musicManager.removeNotes(this.selectedTrack()?.id!, [note.id]);
    }
  }

  @HostListener('pointermove', [''])
  onPointerMove(e: PointerEvent) {
    if (this.draggingNotes) {
      const dx = e.clientX - this.draggingNotes.startX;
      const dy = e.clientY - this.draggingNotes.startY;
      let dSteps = dx / this.cellWidth();
      let dMidi = -Math.round(dy / this.rowHeight());

      if (this.selectedTrack()) {
        this.draggingNotes.originalPositions.forEach((pos, id) => {
          this.musicManager.updateNote(this.selectedTrack()!.id, id, {
            step: Math.max(0, pos.step + dSteps),
            midi: Math.max(0, Math.min(127, pos.midi + dMidi))
          });
        });
      }
      return;
    }
    if (this.isSelecting) {
      const container = this.scrollContainer.nativeElement;
      const rect = container.getBoundingClientRect();
      const currentX = e.clientX - rect.left + container.scrollLeft;
      const currentY = e.clientY - rect.top + container.scrollTop;
      const x = Math.min(this.startX, currentX);
      const y = Math.min(this.startY, currentY);
      const w = Math.abs(this.startX - currentX);
      const h = Math.abs(this.startY - currentY);
      this.selectionBox.set({ x, y, w, h });
      this.updateSelectionFromBox(x, y, w, h);
    }
  }

  private updateSelectionFromBox(x: number, y: number, w: number, h: number) {
    const track = this.selectedTrack();
    if (!track) return;
    const newSelection = new Set<string>();
    track.notes.forEach(note => {
      const noteX = note.step * this.cellWidth();
      const noteY = (127 - note.midi) * this.rowHeight();
      const noteW = note.length * this.cellWidth();
      const noteH = this.rowHeight();
      if (noteX < x + w && noteX + noteW > x && noteY < y + h && noteY + noteH > y) newSelection.add(note.id);
    });
    this.selectedNoteIds.set(newSelection);
  }

  @HostListener('pointerup')
  onPointerUp() {
    this.isSelecting = false;
    this.draggingNotes = null;
    this.selectionBox.set(null);
  }

  createNoteAtPoint(x: number, y: number, container: HTMLElement) {
    const rect = container.getBoundingClientRect();
    const relX = x - rect.left + container.scrollLeft;
    const relY = y - rect.top + container.scrollTop;
    const step = Math.floor(relX / this.cellWidth());
    const midi = 127 - Math.floor(relY / this.rowHeight());
    this.musicManager.addNoteToTrack(this.selectedTrack()?.id!, {
      id: 'note-' + Date.now(), midi, step, length: 1, velocity: 0.8
    });
  }

  quantizeNotes() {
    const ids = Array.from(this.selectedNoteIds());
    this.musicManager.quantizeTrack(this.selectedTrack()?.id!, ids.length > 0 ? ids : undefined);
  }
  duplicateSelected() { this.musicManager.duplicateNotes(this.selectedTrack()?.id!, Array.from(this.selectedNoteIds()), 4); }
  isBlackKey(midi: number): boolean { return [1, 3, 6, 8, 10].includes(midi % 12); }
  getKeyName(midi: number): string { return ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][midi % 12]; }
  getOctaveLabel(midi: number): string { return Math.floor(midi / 12 - 1).toString(); }

  updateSelectedNoteParam(param: 'velocity' | 'probability', event: any) {
    const val = parseFloat(event.target.value);
    const trackId = this.selectedTrack()?.id;
    if (!trackId) return;
    this.selectedNoteIds().forEach(id => {
      this.musicManager.updateNote(trackId, id, { [param]: val });
    });
  }

  clearNotes() { if (confirm('Clear pattern?')) this.musicManager.removeNotes(this.selectedTrack()?.id!, this.selectedTrack()?.notes.map(n => n.id)!); }
  setEditMode(mode: any) { this.editMode.set(mode); }
  humanizeNotes() {
    const ids = Array.from(this.selectedNoteIds());
    this.musicManager.humanizeTrack(this.selectedTrack()?.id!, ids.length > 0 ? ids : undefined);
  }
  strumNotes() {
    const ids = Array.from(this.selectedNoteIds());
    this.musicManager.strumTrack(this.selectedTrack()?.id!, ids.length > 0 ? ids : undefined);
  }
  arpeggiateNotes() {
    const ids = Array.from(this.selectedNoteIds());
    this.musicManager.arpeggiateTrack(this.selectedTrack()?.id!, ids.length > 0 ? ids : undefined);
  }

  toggleSelectedSlide() {
     const track = this.selectedTrack();
     if (!track) return;
     const hasSlide = this.hasSelectedSlide();
     this.selectedNoteIds().forEach(id => {
        this.musicManager.updateNote(track.id, id, { isSlide: !hasSlide });
     });
  }

  hasSelectedSlide() {
    const track = this.selectedTrack();
    if (!track) return false;
    return Array.from(this.selectedNoteIds()).some(id => track.notes.find(n => n.id === id)?.isSlide);
  }

  zoomIn() { this.touchGestures.adjustZoom(0.1); }
  zoomOut() { this.touchGestures.adjustZoom(-0.1); }
  fitToPage() { this.touchGestures.resetZoom(); }

  closePianoRoll() { this.close.emit(); }
  toggleAutomation() { this.isRecordingAutomation.update(v => !v); }

  gridWidth = computed(() => 64 * this.cellWidth());
  canvasHeight = computed(() => 128 * this.rowHeight());
}
