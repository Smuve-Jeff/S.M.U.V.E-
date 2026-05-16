import {
  AfterViewInit,
  Component,
  computed,
  ElementRef,
  EventEmitter,
  HostListener,
  OnInit,
  Output,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MusicManagerService,
  TrackModel,
  TrackNote,
} from '../../services/music-manager.service';
import { AudioSessionService } from '../audio-session.service';
import { InstrumentsService } from '../../services/instruments.service';
import { Router } from '@angular/router';

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
  public readonly instrumentsService = inject(InstrumentsService);
  private readonly router = inject(Router);

  @Output() closeOverlay = new EventEmitter<void>();
  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLDivElement>;

  readonly Math = Math;
  readonly stepsPerMeasure = 16;

  selectedTrackId = this.musicManager.selectedTrackId;
  selectedTrack = computed<TrackModel | null>(
    () =>
      this.musicManager
        .tracks()
        .find((track) => track.id === this.selectedTrackId()) ?? null
  );

  editMode = signal<'draw' | 'select' | 'erase'>('draw');
  selectedNoteIds = signal<Set<string>>(new Set());
  selectionBox = signal({ x: 0, y: 0, width: 0, height: 0, active: false });
  selectedScale = signal({
    name: 'C Major',
    notes: [0, 2, 4, 5, 7, 9, 11],
  });
  isMobile = signal(false);
  isCompactMobile = signal(false);
  showTrackSidebar = signal(true);
  showAudioDock = signal(false);
  audioDockView = signal<'mastering' | 'mixer' | 'ai'>('mixer');
  isAiGenerating = signal(false);
  snapToScale = signal(false);

  rowHeight = 24;
  cellWidth = 40;
  numMeasures = 4;
  cells: number[] = new Array(64).fill(0);
  gridWidth = this.numMeasures * this.stepsPerMeasure * this.cellWidth;

  isStudioOverlay = false;
  isStandalone = false;
  newTrackPresetId = signal('piano-1');
  availablePresets = this.instrumentsService.getPresets();
  aiStyle = 'Electronic';
  aiComplexity = 0.5;
  aiTemperature = 1.0;

  ngOnInit() {
    this.isStandalone = this.router.url.includes('piano-roll');
    this.checkMobile();
  }

  ngAfterViewInit() {
    if (this.scrollContainer) {
      this.scrollContainer.nativeElement.scrollTop =
        (127 - 60) * this.rowHeight - 200;
    }
    this.checkMobile();
  }

  @HostListener('window:resize')
  checkMobile() {
    if (typeof window === 'undefined') return;

    const compact = window.innerWidth < 768;
    this.isMobile.set(compact);
    this.isCompactMobile.set(compact);
    this.showTrackSidebar.set(!compact);
    this.cellWidth = window.innerWidth < 1201 ? 32 : 40;
    this.gridWidth = this.numMeasures * this.stepsPerMeasure * this.cellWidth;
  }

  togglePlay() {
    this.audioSession.togglePlay();
  }

  selectTrack(track: TrackModel) {
    this.musicManager.selectedTrackId.set(track.id);
    this.selectedNoteIds.set(new Set());
  }

  removeTrack(id: number) {
    this.musicManager.removeTrack(id);
    this.selectedNoteIds.set(new Set());
  }

  addTrack() {
    this.musicManager.addTrack('New Track', this.newTrackPresetId());
  }

  getVisibleNotes(track: TrackModel) {
    return track.notes;
  }

  quantizeNotes() {
    const track = this.selectedTrack();
    if (!track) return;

    this.musicManager.tracks.update((tracks) =>
      tracks.map((existingTrack) =>
        existingTrack.id === track.id
          ? {
              ...existingTrack,
              notes: existingTrack.notes.map((note) => ({
                ...note,
                step: Math.round(note.step),
              })),
            }
          : existingTrack
      )
    );
  }

  humanizeSelected() {
    const track = this.selectedTrack();
    if (!track) return;

    this.musicManager.tracks.update((tracks) =>
      tracks.map((existingTrack) =>
        existingTrack.id === track.id
          ? {
              ...existingTrack,
              notes: existingTrack.notes.map((note) =>
                this.selectedNoteIds().size === 0 ||
                this.selectedNoteIds().has(note.id)
                  ? {
                      ...note,
                      velocity: Math.min(
                        1,
                        Math.max(
                          0.1,
                          note.velocity + (Math.random() - 0.5) * 0.1
                        )
                      ),
                      step: Math.max(
                        0,
                        note.step + (Math.random() - 0.5) * 0.05
                      ),
                    }
                  : note
              ),
            }
          : existingTrack
      )
    );
  }

  deleteSelected() {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return;

    this.musicManager.tracks.update((tracks) =>
      tracks.map((existingTrack) =>
        existingTrack.id === track.id
          ? {
              ...existingTrack,
              notes: existingTrack.notes.filter((note) => !ids.has(note.id)),
            }
          : existingTrack
      )
    );
    this.selectedNoteIds.set(new Set());
  }

  duplicateSelected() {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return;

    const notesToDuplicate = track.notes.filter((note) => ids.has(note.id));
    const maxStep = Math.max(
      ...notesToDuplicate.map((note) => note.step + note.length)
    );
    const minStep = Math.min(...notesToDuplicate.map((note) => note.step));
    const offset = maxStep - minStep || 1;
    const newNotes = notesToDuplicate.map((note) => ({
      ...note,
      id: `note-${Math.random().toString(36).slice(2, 11)}`,
      step: note.step + offset,
    }));

    this.musicManager.tracks.update((tracks) =>
      tracks.map((existingTrack) =>
        existingTrack.id === track.id
          ? {
              ...existingTrack,
              notes: [...existingTrack.notes, ...newNotes],
            }
          : existingTrack
      )
    );
    this.selectedNoteIds.set(new Set(newNotes.map((note) => note.id)));
  }

  duplicateNextBar() {
    const track = this.selectedTrack();
    if (!track) return;

    const sourceNotes =
      this.selectedNoteIds().size === 0
        ? track.notes
        : track.notes.filter((note) => this.selectedNoteIds().has(note.id));
    const duplicatedNotes = sourceNotes.map((note) => ({
      ...note,
      id: `note-${Math.random().toString(36).slice(2, 11)}`,
      step: note.step + this.stepsPerMeasure,
    }));

    this.musicManager.tracks.update((tracks) =>
      tracks.map((existingTrack) =>
        existingTrack.id === track.id
          ? {
              ...existingTrack,
              notes: [...existingTrack.notes, ...duplicatedNotes],
            }
          : existingTrack
      )
    );
  }

  onGridMouseDown(event: MouseEvent) {
    const track = this.selectedTrack();
    if (!track) return;

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const step = Math.floor(x / this.cellWidth);
    let midi = 127 - Math.floor(y / this.rowHeight);

    if (this.snapToScale()) {
      const scale = this.selectedScale().notes;
      while (midi > 0 && !scale.includes(midi % 12)) {
        midi--;
      }
    }

    if (this.editMode() === 'select') {
      this.selectionBox.set({ x, y, width: 0, height: 0, active: true });
      return;
    }

    if (this.editMode() !== 'draw') return;

    this.musicManager.addNoteToTrack(track.id, {
      midi,
      step,
      length: 1,
      velocity: 0.8,
    });
  }

  onNoteMouseDown(event: MouseEvent, note: TrackNote) {
    event.stopPropagation();

    if (this.editMode() === 'erase') {
      const track = this.selectedTrack();
      if (!track) return;

      this.musicManager.tracks.update((tracks) =>
        tracks.map((existingTrack) =>
          existingTrack.id === track.id
            ? {
                ...existingTrack,
                notes: existingTrack.notes.filter(
                  (existingNote) => existingNote.id !== note.id
                ),
              }
            : existingTrack
        )
      );
      return;
    }

    if (this.editMode() === 'select' && event.shiftKey) {
      const next = new Set(this.selectedNoteIds());
      if (next.has(note.id)) {
        next.delete(note.id);
      } else {
        next.add(note.id);
      }
      this.selectedNoteIds.set(next);
      return;
    }

    this.selectedNoteIds.set(new Set([note.id]));
  }

  isBlackKey(midi: number) {
    return [1, 3, 6, 8, 10].includes(midi % 12);
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
    return Array.from({ length: 128 }, (_, index) => 127 - index);
  }

  isInScale(midi: number) {
    return this.selectedScale().notes.includes(midi % 12);
  }

  getSelectionBoxTransform() {
    const box = this.selectionBox();
    return `translate(${box.x}px, ${box.y}px)`;
  }

  transposeSelected(semitones: number) {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return;

    track.notes.forEach((note) => {
      if (!ids.has(note.id)) return;

      const midi = Math.max(0, Math.min(127, note.midi + semitones));
      this.musicManager.updateNote(track.id, note.id, { midi });
    });
  }

  adjustSelectedVelocity(delta: number) {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return;

    this.musicManager.tracks.update((tracks) =>
      tracks.map((existingTrack) =>
        existingTrack.id === track.id
          ? {
              ...existingTrack,
              notes: existingTrack.notes.map((note) =>
                ids.has(note.id)
                  ? {
                      ...note,
                      velocity: Math.min(
                        1,
                        Math.max(0.1, note.velocity + delta)
                      ),
                    }
                  : note
              ),
            }
          : existingTrack
      )
    );
  }

  adjustSelectedLength(delta: number) {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return;

    this.musicManager.tracks.update((tracks) =>
      tracks.map((existingTrack) =>
        existingTrack.id === track.id
          ? {
              ...existingTrack,
              notes: existingTrack.notes.map((note) =>
                ids.has(note.id)
                  ? {
                      ...note,
                      length: Math.max(0.25, note.length + delta),
                    }
                  : note
              ),
            }
          : existingTrack
      )
    );
  }

  nudgeSelectedOctave(delta: number) {
    this.transposeSelected(delta * 12);
  }

  setSelectedNoteProbability(_event: Event) {}

  applyVelocityCurve(_type: string) {}

  goStandalone() {
    this.router.navigate(['/piano-roll']);
  }

  setEditMode(mode: 'draw' | 'select' | 'erase') {
    this.editMode.set(mode);
  }

  generateSequence(_type: string) {
    this.isAiGenerating.set(true);
    setTimeout(() => this.isAiGenerating.set(false), 2000);
  }

  setSelectedNoteLength(length: number) {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return;

    const nextLength = Math.max(1, length);
    ids.forEach((id) => {
      this.musicManager.updateNote(track.id, id, { length: nextLength });
    });
  }

  setAudioDockView(view: 'mastering' | 'mixer' | 'ai') {
    this.audioDockView.set(view);
    this.showAudioDock.set(true);
  }

  toggleAudioDock() {
    this.showAudioDock.update((value) => !value);
  }

  setPatternLength(measures: number) {
    this.numMeasures = Math.max(1, Math.min(16, measures));
    this.cells = new Array(this.numMeasures * this.stepsPerMeasure).fill(0);
    this.gridWidth = this.numMeasures * this.stepsPerMeasure * this.cellWidth;
  }

  arrangementBars() {
    const track = this.selectedTrack();
    return Array.from({ length: this.numMeasures }, (_, index) => ({
      index,
      noteCount: track
        ? track.notes.filter(
            (note) =>
              note.step >= index * this.stepsPerMeasure &&
              note.step < (index + 1) * this.stepsPerMeasure
          ).length
        : 0,
    }));
  }

  replaceTrackInstrument(track: TrackModel, presetId: string) {
    this.musicManager.setInstrument(track.id, presetId);
  }
}
