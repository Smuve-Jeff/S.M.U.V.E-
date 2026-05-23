import {
  Component,
  OnInit,
  AfterViewInit,
  inject,
  signal,
  computed,
  ViewChild,
  ElementRef,
  HostListener,
  Output,
  EventEmitter,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  MusicManagerService,
  TrackModel,
  TrackNote,
} from '../../services/music-manager.service';
import { AudioSessionService } from '../audio-session.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { InstrumentsService } from '../../services/instruments.service';
import { HistoryService } from '../../services/history.service';
import { AiService } from '../../services/ai.service';
import { FormsModule } from '@angular/forms';
import { TouchGestureService } from '../../services/touch-gesture.service';

@Component({
  selector: 'app-piano-roll',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './piano-roll.component.html',
  styleUrls: ['./piano-roll.component.css'],
})
export class PianoRollComponent implements OnInit, AfterViewInit {
  private lastPinchDistance: number | null = null;

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent) {
    if (event.touches.length === 2) {
      this.lastPinchDistance = this.touchGestures.handlePinch(event);
    }
  }

  @HostListener('touchmove', ['$event'])
  onTouchMove(event: TouchEvent) {
    if (event.touches.length === 2 && this.lastPinchDistance) {
      const distance = this.touchGestures.handlePinch(event);
      if (distance) {
        const delta = distance / this.lastPinchDistance;
        this.touchGestures.zoomLevel.update(z => Math.max(0.5, Math.min(2.0, z * delta)));
        this.lastPinchDistance = distance;
      }
    }
  }
  public musicManager = inject(MusicManagerService);
  public audioSession = inject(AudioSessionService);
  private audioEngine = inject(AudioEngineService);
  public instrumentsService = inject(InstrumentsService);
  private history = inject(HistoryService);
  private aiService = inject(AiService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private touchGestures = inject(TouchGestureService);

  @Output() close = new EventEmitter<void>();
  @Output() closeOverlay = new EventEmitter<void>();
  @ViewChild('scrollContainer') scrollContainer!: ElementRef;

  selectedTrack = computed(
    () =>
      this.musicManager
        .tracks()
        .find((t) => t.id === this.musicManager.selectedTrackId()) || null
  );
  editMode = signal<'draw' | 'select' | 'erase'>('draw');
  selectedNoteIds = signal<Set<string>>(new Set());

  windowWidth = signal(
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );

  rowHeight = computed(() => (this.isMobile() ? 48 : 24) * this.touchGestures.zoomLevel());
  cellWidth = computed(() => (this.windowWidth() < 1201 ? 32 : 40) * this.touchGestures.zoomLevel());

  numMeasures = 4;
  cells: any[] = new Array(64).fill(0);

  viewportNotes = computed(() => {
    const track = this.selectedTrack();
    return track ? track.notes : [];
  });

  selectionBox = signal({ x: 0, y: 0, width: 0, height: 0, active: false });
  selectedScale = signal({ name: 'C Major', notes: [0, 2, 4, 5, 7, 9, 11] });

  isMobile = signal(false);
  isCompactMobile = signal(false);
  isStudioOverlay = signal(false);
  isStandalone = signal(true);
  showTrackSidebar = signal(false);
  showAudioDock = signal(false);
  audioDockView = signal<'mastering' | 'mixer' | 'ai'>('mixer');
  gridWidth = 1600;

  Math = Math;

  newTrackPresetId = signal('piano-1');
  availablePresets = this.instrumentsService.getPresets();
  aiStyle = 'Electronic';
  aiComplexity = 0.5;
  aiTemperature = 1.0;
  isAiGenerating = signal(false);
  snapToScale = signal(false);

  ngOnInit() {
    this.checkMobile();
  }

  ngAfterViewInit() {
    if (this.scrollContainer) {
      this.scrollContainer.nativeElement.scrollTop =
        (127 - 60) * this.rowHeight() - 200;
    }
    this.cdr.detectChanges();
  }

  @HostListener('window:resize')
  checkMobile() {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1280;
    this.windowWidth.set(width);
    const compact = width < 768;
    this.isMobile.set(compact);
    this.isCompactMobile.set(compact);
  }

  togglePlay() {
    this.audioSession.togglePlay();
  }

  selectTrack(track: TrackModel) {
    this.musicManager.selectedTrackId.set(track.id);
  }

  removeTrack(id: number) {
    this.musicManager.removeTrack(id);
    this.selectedNoteIds.set(new Set());
  }

  addTrack() {
    this.musicManager.addTrack('New Track', 'grand-piano');
  }

  getVisibleNotes(track: TrackModel) {
    return track.notes;
  }

  quantizeNotes() {
    const track = this.selectedTrack();
    if (!track) return;
    this.musicManager.quantizeTrack(track.id);
  }

  humanizeSelected() {
    const track = this.selectedTrack();
    if (!track) return;
    this.musicManager.humanizeTrack(track.id);
  }

  deleteSelected() {
    const ids = this.selectedNoteIds();
    const track = this.selectedTrack();
    if (ids.size === 0 || !track) return;
    this.musicManager.removeNotes(track.id, Array.from(ids));
    this.selectedNoteIds.set(new Set());
  }

  duplicateSelected() {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return;

    const notesToDup = track.notes.filter((n) => ids.has(n.id));
    const maxStep = Math.max(...notesToDup.map((n) => n.step + n.length));
    const minStep = Math.min(...notesToDup.map((n) => n.step));
    const offset = maxStep - minStep || 1;

    this.musicManager.duplicateNotes(track.id, Array.from(ids), offset);
  }

  duplicateNextBar() {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return;
    this.musicManager.duplicateNotes(track.id, Array.from(ids), 16);
  }

  onGridMouseDown(e: MouseEvent) {
    if (this.editMode() === 'draw' && this.selectedTrack()) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const step = Math.floor(x / this.cellWidth());
      const midi = 127 - Math.floor(y / this.rowHeight());

      this.musicManager.addNoteToTrack(this.selectedTrack()!.id, {
        midi,
        step,
        length: 1,
        velocity: 0.8,
      });
    }
  }

  onNoteMouseDown(e: MouseEvent, note: TrackNote) {
    e.stopPropagation();
    if (this.editMode() === 'select') {
      const next = new Set(this.selectedNoteIds());
      if (e.shiftKey) {
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
    } else if (this.editMode() === 'draw') {
      this.selectedNoteIds.set(new Set([note.id]));
    } else if (this.editMode() === 'erase') {
      this.musicManager.removeNotes(this.selectedTrack()!.id, [note.id]);
    }
  }

  isBlackKey(midi: number) {
    const n = midi % 12;
    return [1, 3, 6, 8, 10].includes(n);
  }

  getKeyName(midi: number) {
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

  getDisplayKeys() {
    return Array.from({ length: 128 }, (_, i) => 127 - i);
  }

  isInScale(midi: number) {
    return this.selectedScale().notes.includes(midi % 12);
  }

  getSelectionBoxTransform() {
    const b = this.selectionBox();
    return `translate(${b.x}px, ${b.y}px)`;
  }

  transposeSelected(semitones: number) {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return;

    ids.forEach((id) => {
      const n = track.notes.find((note) => note.id === id);
      if (n) {
        const nextMidi = Math.min(127, Math.max(0, n.midi + semitones));
        this.musicManager.updateNote(track.id, id, { midi: nextMidi });
      }
    });
  }

  adjustSelectedVelocity(delta: number) {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return;

    ids.forEach((id) => {
      const n = track.notes.find((note) => note.id === id);
      if (n) {
        this.musicManager.updateNote(track.id, id, {
          velocity: Math.min(1, Math.max(0.1, n.velocity + delta)),
        });
      }
    });
  }

  adjustSelectedLength(delta: number) {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return;

    ids.forEach((id) => {
      const n = track.notes.find((note) => note.id === id);
      if (n) {
        this.musicManager.updateNote(track.id, id, {
          length: Math.max(0.25, n.length + delta),
        });
      }
    });
  }

  nudgeSelectedOctave(delta: number) {
    this.transposeSelected(delta * 12);
  }

  setSelectedNoteProbability(e: any) {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return;
    const prob = parseFloat(e.target.value);
    ids.forEach((id) => {
      this.musicManager.updateNote(track.id, id, { probability: prob });
    });
  }

  applyVelocityCurve(type: string) {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return;

    const notes = track.notes
      .filter((n) => ids.has(n.id))
      .sort((a, b) => a.step - b.step);
    if (notes.length < 2) return;

    const first = notes[0].step;
    const last = notes[notes.length - 1].step;
    const span = last - first || 1;

    notes.forEach((n) => {
      let v = 0.8;
      const progress = (n.step - first) / span;
      if (type === 'fade-in') v = 0.2 + progress * 0.8;
      else if (type === 'fade-out') v = 1.0 - progress * 0.8;
      else if (type === 'random') v = 0.3 + Math.random() * 0.7;

      this.musicManager.updateNote(track.id, n.id, { velocity: v });
    });
  }

  goStandalone() {
    this.router.navigate(['/studio/piano-roll']);
  }

  isBlackKeyById(midi: number) {
    return this.isBlackKey(midi);
  }

  getKeyNameById(midi: number) {
    return this.getKeyName(midi);
  }

  setEditMode(mode: 'draw' | 'select' | 'erase') {
    this.editMode.set(mode);
  }

  generateSequence(type: string) {
    this.isAiGenerating.set(true);
    setTimeout(() => {
      this.isAiGenerating.set(false);
      // In a real app, this would call AI service
    }, 2000);
  }

  setSelectedNoteLength(len: number) {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return;
    const finalLen = Math.max(1, len);
    ids.forEach((id) => {
      this.musicManager.updateNote(track.id, id, { length: finalLen });
    });
  }

  setAudioDockView(view: 'mastering' | 'mixer' | 'ai') {
    this.audioDockView.set(view);
    this.showAudioDock.set(true);
  }

  toggleAudioDock() {
    this.showAudioDock.update((v) => !v);
  }

  setPatternLength(measures: number) {
    this.numMeasures = Math.max(1, Math.min(16, measures));
    this.cells = new Array(this.numMeasures * 16).fill(0);
  }

  arrangementBars = computed(() => {
    const track = this.selectedTrack();
    const bars = [];
    for (let i = 0; i < this.numMeasures; i++) {
      bars.push({
        index: i,
        noteCount: track
          ? track.notes.filter((n) => n.step >= i * 16 && n.step < (i + 1) * 16)
              .length
          : 0,
      });
    }
    return bars;
  });

  replaceTrackInstrument(track: TrackModel, presetId: string) {
    this.musicManager.setInstrument(track.id, presetId);
  }
}
