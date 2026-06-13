import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  AfterViewInit,
  ViewChild,
  ElementRef,
  HostListener,
  Output,
  EventEmitter,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import {
  MusicManagerService,
  TrackNote,
} from '../../services/music-manager.service';
import { TouchGestureService } from '../../services/touch-gesture.service';

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
  private readonly cdr = inject(ChangeDetectorRef);
  public readonly touchGestures = inject(TouchGestureService);

  @Output() close = new EventEmitter<void>();
  @Output() closeOverlay = new EventEmitter<void>();
  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('keysSidebar') keysSidebar!: ElementRef<HTMLDivElement>;

  selectedTrack = computed(
    () =>
      this.musicManager
        .tracks()
        .find((track) => track.id === this.musicManager.selectedTrackId()) ||
      null
  );
  editMode = signal<'draw' | 'select' | 'erase'>('draw');
  selectedNoteIds = signal<Set<string>>(new Set());
  windowWidth = signal(typeof window !== 'undefined' ? window.innerWidth : 1280);

  rowHeight = computed(
    () => (this.isMobile() ? 48 : 24) * this.touchGestures.zoomLevel()
  );
  cellWidth = computed(
    () => (this.windowWidth() < 1201 ? 32 : 40) * this.touchGestures.zoomLevel()
  );

  numMeasures = 4;
  cells = new Array(64).fill(0);
  gridColumns = Array.from({ length: 64 }, (_, index) => index);
  showGhostNotes = signal(true);
  snapToScale = signal(false);
  isMobile = signal(false);
  displayKeys = Array.from({ length: 128 }, (_, index) => 127 - index);
  gridWidth = computed(() => this.cellWidth() * this.cells.length);
  canvasHeight = computed(() => 128 * this.rowHeight());

  private pinchDistance: number | null = null;

  ghostNotes = computed(() => {
    if (!this.showGhostNotes()) return [];
    const currentTrackId = this.musicManager.selectedTrackId();
    const otherTracks = this.musicManager
      .tracks()
      .filter((t) => t.id !== currentTrackId);
    const notes: any[] = [];
    otherTracks.forEach((t) => {
      t.notes.forEach((n) => {
        notes.push({ ...n, trackColor: t.color });
      });
    });
    return notes;
  });

  viewportNotes = computed(() => this.selectedTrack()?.notes || []);

  ngOnInit() {
    this.checkMobile();
  }

  ngAfterViewInit() {
    if (this.scrollContainer) {
      const top = (127 - 60) * this.rowHeight() - 100;
      this.scrollContainer.nativeElement.scrollTop = Math.max(0, top);
      this.syncKeyScroll();
    }
    this.cdr.detectChanges();
  }

  @HostListener('window:resize')
  checkMobile() {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1280;
    this.windowWidth.set(width);
    this.isMobile.set(width < 768);
  }

  syncKeyScroll() {
    if (!this.scrollContainer || !this.keysSidebar) {
      return;
    }
    this.keysSidebar.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollTop;
    if (this.isMobile()) {
      this.keysSidebar.nativeElement.scrollLeft = this.scrollContainer.nativeElement.scrollLeft;
    }
  }

  fitToPage() {
    const notes = this.selectedTrack()?.notes || [];
    if (notes.length === 0) return;
    const midis = notes.map(n => n.midi);
    const minMidi = Math.min(...midis);
    const maxMidi = Math.max(...midis);
    const noteRange = maxMidi - minMidi + 1;
    const viewportHeight = this.scrollContainer.nativeElement.clientHeight;
    const idealRowHeight = Math.floor(viewportHeight / (noteRange + 4));
    const baseRowHeight = this.isMobile() ? 48 : 24;
    const newZoom = Math.max(0.5, Math.min(2, idealRowHeight / baseRowHeight));
    this.touchGestures.zoomLevel.set(newZoom);
    setTimeout(() => {
      const targetScrollTop = (127 - maxMidi - 2) * this.rowHeight();
      this.scrollContainer.nativeElement.scrollTop = Math.max(0, targetScrollTop);
      this.syncKeyScroll();
    }, 50);
  }

  onGridPointerDown(event: PointerEvent) {
    if (this.editMode() !== "draw") return;
    const target = event.target as HTMLElement;
    if (target.closest(".note-block")) return;

    event.preventDefault();
    this.createNoteAtPoint(
      event.clientX,
      event.clientY,
      event.currentTarget as HTMLElement
    );
  }

  onGridTouchStart(event: TouchEvent) {
    if (event.touches.length === 2) {
      this.pinchDistance = this.touchGestures.handlePinch(event);
      return;
    }

    if (event.touches.length !== 1 || this.editMode() !== 'draw') {
      return;
    }

    event.preventDefault();
    const touch = event.touches[0];
    this.createNoteAtPoint(
      touch.clientX,
      touch.clientY,
      event.currentTarget as HTMLElement
    );
  }

  onGridTouchMove(event: TouchEvent) {
    if (event.touches.length !== 2) {
      return;
    }

    const nextDistance = this.touchGestures.handlePinch(event);
    if (!this.pinchDistance || !nextDistance) {
      this.pinchDistance = nextDistance;
      return;
    }

    event.preventDefault();
    this.touchGestures.applyPinch(this.pinchDistance, nextDistance);
    this.pinchDistance = nextDistance;
  }

  onGridTouchEnd() {
    this.pinchDistance = null;
  }

  onNotePointerDownTouch(event: TouchEvent, note: TrackNote) {
    event.stopPropagation();
    const touch = event.touches[0];
    const now = Date.now();
    if (this.lastTap && (now - this.lastTap < 300)) {
      this.musicManager.removeNotes(this.selectedTrack()?.id!, [note.id]);
      this.lastTap = 0;
      return;
    }
    this.lastTap = now;
  }
  private lastTap = 0;

  onNotePointerDown(event: MouseEvent | PointerEvent, note: TrackNote) {
    event.stopPropagation();
    if (this.editMode() === 'select') {
      const next = new Set(this.selectedNoteIds());
      if (event.shiftKey) {
        if (next.has(note.id)) next.delete(note.id);
        else next.add(note.id);
      } else {
        next.clear();
        next.add(note.id);
      }
      this.selectedNoteIds.set(next);
    } else if (this.editMode() === 'erase') {
      this.musicManager.removeNotes(this.selectedTrack()?.id!, [note.id]);
    }
  }

  createNoteAtPoint(x: number, y: number, container: HTMLElement) {
    const rect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;

    const relX = x - rect.left + scrollLeft;
    const relY = y - rect.top + scrollTop;

    const step = Math.max(0, Math.min(63, Math.floor(relX / this.cellWidth())));
    const midi = Math.max(
      0,
      Math.min(127, 127 - Math.floor(relY / this.rowHeight()))
    );

    this.musicManager.addNoteToTrack(this.selectedTrack()?.id!, {
      id: 'note-' + Date.now(),
      midi,
      step,
      length: 1,
      velocity: 0.8,
    });
  }

  updateNotePosition(note: TrackNote, step: number, midi: number) {
    this.musicManager.updateNote(this.selectedTrack()?.id!, note.id, {
      step,
      midi,
    });
  }

  applyNotePatch(trackId: number, noteId: string, patch: Partial<TrackNote>) {
    this.musicManager.updateNote(trackId, noteId, patch);
  }

  quantizeNotes() {
    const track = this.selectedTrack();
    if (!track) return;
    this.musicManager.quantizeTrack(track.id);
  }

  duplicateSelected() {
    const track = this.selectedTrack();
    if (!track || this.selectedNoteIds().size === 0) return;
    this.musicManager.duplicateNotes(
      track.id,
      Array.from(this.selectedNoteIds()),
      1
    );
  }

  isBlackKey(midi: number): boolean {
    const note = midi % 12;
    return [1, 3, 6, 8, 10].includes(note);
  }

  getKeyName(midi: number): string {
    const names = [
      'C',
      'C#',
      'D',
      'D#',
      'E',
      'F',
      'F#',
      'G',
      'G#',
      'A',
      'A#',
      'B',
    ];
    return names[midi % 12];
  }

  getOctaveLabel(midi: number): string {
    return Math.floor(midi / 12 - 1).toString();
  }

  toggleSelectedSlide() {
    const track = this.selectedTrack();
    if (!track) return;
    const hasSlide = this.hasSelectedSlide();
    this.selectedNoteIds().forEach((id) => {
      this.applyNotePatch(track.id, id, { isSlide: !hasSlide });
    });
  }

  hasSelectedSlide(): boolean {
    const track = this.selectedTrack();
    if (!track) return false;
    return Array.from(this.selectedNoteIds()).some((id) => {
      const note = track.notes.find((n) => n.id === id);
      return note?.isSlide;
    });
  }

  adjustSelectedVelocity(delta: number) {
    const track = this.selectedTrack();
    if (!track) return;
    this.selectedNoteIds().forEach((id) => {
      const note = track.notes.find((n) => n.id === id);
      if (note) {
        const velocity = Math.max(0.1, Math.min(1.5, note.velocity + delta));
        this.applyNotePatch(track.id, id, { velocity });
      }
    });
  }

  setSelectedNoteProbability(event: any) {
    const track = this.selectedTrack();
    if (!track) return;
    const prob = parseFloat(event.target.value);
    this.selectedNoteIds().forEach((id) => {
      this.applyNotePatch(track.id, id, { probability: prob });
    });
  }

  clearNotes() {
    const track = this.selectedTrack();
    if (track && confirm('Clear all notes in this pattern?')) {
      this.musicManager.removeNotes(
        track.id,
        track.notes.map((n) => n.id)
      );
      this.selectedNoteIds.set(new Set());
    }
  }

  setEditMode(mode: 'draw' | 'select' | 'erase') {
    this.editMode.set(mode);
  }

  strumNotes() {
    const track = this.selectedTrack();
    if (track) this.musicManager.strumTrack(track.id);
  }

  humanizeNotes() {
    const track = this.selectedTrack();
    if (track) this.musicManager.humanizeTrack(track.id);
  }

  arpeggiateNotes() {
    const track = this.selectedTrack();
    if (track) this.musicManager.arpeggiateTrack(track.id);
  }

  zoomIn() {
    this.touchGestures.zoomLevel.update((z) => Math.min(2, z + 0.1));
  }

  zoomOut() {
    this.touchGestures.zoomLevel.update((z) => Math.max(0.5, z - 0.1));
  }

  closePianoRoll() {
    this.close.emit();
    this.closeOverlay.emit();
  }
}
