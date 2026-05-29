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
  showAudioDock = signal(false);
  audioDockView = signal<'mixer' | 'mastering' | 'drum-machine'>('mixer');
  showTrackSidebar = signal(false);
  newTrackPresetId = signal('grand-piano-v2');

  isLocalPlayback = signal(false);
  isLocalPlaying = signal(false);
  isLocalRecording = signal(false);

  windowWidth = signal(
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );
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
    const currentId = this.musicManager.selectedTrackId();
    return this.musicManager
      .tracks()
      .filter((track) => track.id !== currentId)
      .flatMap((track) =>
        track.notes.map((note) => ({ ...note, trackColor: track.color }))
      );
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

    this.keysSidebar.nativeElement.scrollTop =
      this.scrollContainer.nativeElement.scrollTop;
  }

  onGridPointerDown(event: PointerEvent) {
    if (this.editMode() !== 'draw') {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest('.note-block')) {
      return;
    }

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

  onNotePointerDown(event: MouseEvent | PointerEvent, note: TrackNote) {
    event.stopPropagation();
    if (this.editMode() === 'select') {
      const next = new Set(this.selectedNoteIds());
      if (
        (event as MouseEvent).shiftKey ||
        (event as MouseEvent).ctrlKey ||
        (event as MouseEvent).metaKey
      ) {
        if (next.has(note.id)) {
          next.delete(note.id);
        } else {
          next.add(note.id);
        }
      } else {
        next.clear();
        next.add(note.id);
      }
      this.selectedNoteIds.set(next);
    } else if (this.editMode() === 'erase' && this.selectedTrack()) {
      this.musicManager.removeNotes(this.selectedTrack()!.id, [note.id]);
    }
  }

  private createNoteAtPoint(
    clientX: number,
    clientY: number,
    container: HTMLElement
  ) {
    const track = this.selectedTrack();
    if (!track) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const scrollLeft = this.scrollContainer?.nativeElement.scrollLeft || 0;
    const scrollTop = this.scrollContainer?.nativeElement.scrollTop || 0;
    const x = clientX - rect.left + scrollLeft;
    const y = clientY - rect.top + scrollTop;
    const step = Math.max(0, Math.min(63, Math.floor(x / this.cellWidth())));
    const midi = Math.max(
      0,
      Math.min(127, 127 - Math.floor(y / this.rowHeight()))
    );

    const existingNote = track.notes.find(
      (note) => Math.floor(note.step) === step && note.midi === midi
    );
    if (existingNote) {
      return;
    }

    this.musicManager.addNoteToTrack(track.id, {
      midi,
      step,
      length: 1,
      velocity: 0.8,
    });
  }

  isBlackKey(midi: number) {
    return [1, 3, 6, 8, 10].includes(midi % 12);
  }

  getKeyName(midi: number) {
    return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][
      midi % 12
    ];
  }

  getOctaveLabel(midi: number) {
    return Math.floor(midi / 12) - 1;
  }

  setEditMode(mode: 'draw' | 'select' | 'erase') {
    this.editMode.set(mode);
  }

  togglePlay() {
    this.audioSession.togglePlay();
  }

  isRecording() {
    const session = this.audioSession as AudioSessionService & {
      isRecording?: () => boolean;
    };
    return typeof session.isRecording === 'function'
      ? session.isRecording()
      : false;
  }

  toggleAudioDock() {
    this.showAudioDock.update((value) => !value);
  }

  setAudioDockView(view: 'mixer' | 'mastering' | 'drum-machine') {
    this.audioDockView.set(view);
    this.showAudioDock.set(true);
  }

  setPatternLength(measures: number) {
    this.numMeasures = Math.max(1, Math.min(16, Math.round(measures)));
    this.cells = new Array(this.numMeasures * 16).fill(0);
    this.gridColumns = Array.from(
      { length: this.cells.length },
      (_, index) => index
    );
  }

  arrangementBars() {
    const notes = this.selectedTrack()?.notes || [];
    return Array.from({ length: this.numMeasures }, (_, index) => ({
      index,
      noteCount: notes.filter((note) => Math.floor(note.step / 16) === index)
        .length,
    }));
  }

  addTrack() {
    const presetId = this.newTrackPresetId();
    const manager = this.musicManager as MusicManagerService & {
      addTrack?: (name: string, instrumentId: string) => void;
    };
    if (typeof manager.addTrack === 'function') {
      manager.addTrack('New Track', presetId);
      return;
    }
    this.musicManager.ensureTrack(presetId);
  }

  replaceTrackInstrument(track: { id: number }, instrumentId: string) {
    this.musicManager.setInstrument(track.id, instrumentId);
  }

  removeTrack(trackId: number) {
    this.musicManager.removeTrack(trackId);
    this.selectedNoteIds.set(new Set());
  }

  transposeSelected(delta: number) {
    const track = this.selectedTrack();
    if (!track) {
      return;
    }

    this.selectedNoteIds().forEach((noteId) => {
      const note = track.notes.find((candidate) => candidate.id === noteId);
      if (!note) {
        return;
      }

      const midi = Math.max(0, Math.min(127, note.midi + delta));
      this.applyNotePatch(track.id, note.id, { midi });
    });
  }

  setSelectedNoteLength(length: number) {
    const track = this.selectedTrack();
    if (!track) {
      return;
    }

    this.selectedNoteIds().forEach((noteId) => {
      this.applyNotePatch(track.id, noteId, {
        length: Math.max(1, Math.round(length)),
      });
    });
  }

  zoomIn() {
    this.touchGestures.adjustZoom(0.15);
  }

  zoomOut() {
    this.touchGestures.adjustZoom(-0.15);
  }

  resetZoom() {
    this.touchGestures.resetZoom();
  }

  quantizeNotes() {
    if (this.selectedTrack())
      this.musicManager.quantizeTrack(this.selectedTrack()!.id);
  }

  deleteSelected() {
    if (this.selectedTrack() && this.selectedNoteIds().size > 0) {
      this.musicManager.removeNotes(
        this.selectedTrack()!.id,
        Array.from(this.selectedNoteIds())
      );
      this.selectedNoteIds.set(new Set());
    }
  }

  duplicateSelected() {
    if (this.selectedTrack() && this.selectedNoteIds().size > 0) {
      this.musicManager.duplicateNotes(
        this.selectedTrack()!.id,
        Array.from(this.selectedNoteIds()),
        1
      );
    }
  }

  adjustSelectedVelocity(delta: number) {
    const trackId = this.musicManager.selectedTrackId();
    if (!trackId) return;
    this.selectedNoteIds().forEach((noteId) => {
      const note = this.selectedTrack()?.notes.find(
        (candidate) => candidate.id === noteId
      );
      if (note) {
        const newVelocity = Math.max(0.1, Math.min(1.5, note.velocity + delta));
        this.musicManager.setNoteParam(
          trackId,
          noteId,
          'velocity',
          newVelocity
        );
      }
    });
  }

  setSelectedNoteProbability(event: any) {
    const trackId = this.musicManager.selectedTrackId();
    if (!trackId) return;
    const value = event.target ? event.target.value : event;
    this.selectedNoteIds().forEach((noteId) => {
      this.musicManager.setNoteParam(trackId, noteId, 'probability', value);
    });
  }

  toggleSelectedSlide() {
    const trackId = this.musicManager.selectedTrackId();
    if (!trackId) return;
    this.selectedNoteIds().forEach((noteId) => {
      const note = this.selectedTrack()?.notes.find(
        (candidate) => candidate.id === noteId
      );
      if (note) {
        this.musicManager.setNoteParam(
          trackId,
          noteId,
          'isSlide',
          !note.isSlide
        );
      }
    });
  }

  hasSelectedSlide(): boolean {
    const ids = Array.from(this.selectedNoteIds());
    if (ids.length === 0) return false;
    const note = this.selectedTrack()?.notes.find(
      (candidate) => candidate.id === ids[0]
    );
    return !!note?.isSlide;
  }

  strumNotes() {
    if (this.selectedTrack())
      this.musicManager.strumTrack(this.selectedTrack()!.id);
  }

  humanizeNotes() {
    if (this.selectedTrack())
      this.musicManager.humanizeTrack(this.selectedTrack()!.id);
  }

  arpeggiateNotes() {
    if (this.selectedTrack())
      this.musicManager.arpeggiateTrack(this.selectedTrack()!.id);
  }

  toggleLocalPlay() {
    this.isLocalPlaying.update((value) => !value);
  }

  toggleLocalRecord() {
    this.isLocalRecording.update((value) => !value);
  }

  localSkip() {
    console.log('skip');
  }

  private applyNotePatch(
    trackId: number,
    noteId: string,
    patch: Partial<TrackNote>
  ) {
    const manager = this.musicManager as MusicManagerService & {
      updateNote?: (
        targetTrackId: number,
        targetNoteId: string,
        nextPatch: Partial<TrackNote>
      ) => void;
    };
    if (typeof manager.updateNote === 'function') {
      manager.updateNote(trackId, noteId, patch);
      return;
    }

    Object.entries(patch).forEach(([key, value]) => {
      this.musicManager.setNoteParam(trackId, noteId, key, value);
    });
  }
}
