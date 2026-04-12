import {
  Component,
  inject,
  signal,
  computed,
  effect,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MusicManagerService,
  TrackModel,
  TrackNote,
} from '../../services/music-manager.service';
import { MixerComponent } from '../mixer/mixer.component';
import { DrumMachineComponent } from '../drum-machine/drum-machine.component';
import { MasteringSuiteComponent } from '../mastering-suite/mastering-suite.component';
import { fromEvent } from 'rxjs';
import { SoundBrowserComponent } from '../sound-browser/sound-browser.component';
import { AudioSessionService } from '../audio-session.service';
import { AiService } from '../../services/ai.service';
import { UIService } from '../../services/ui.service';
import { Router } from '@angular/router';
import { HistoryService } from '../../services/history.service';
import { InstrumentsService } from '../../services/instruments.service';

@Component({
  selector: 'app-piano-roll',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MixerComponent,
    DrumMachineComponent,
    MasteringSuiteComponent,
    SoundBrowserComponent,
  ],
  templateUrl: './piano-roll.component.html',
  styleUrls: ['./piano-roll.component.css'],
})
export class PianoRollComponent implements AfterViewInit, OnDestroy {
  musicManager = inject(MusicManagerService);
  audioSession = inject(AudioSessionService);
  aiService = inject(AiService);
  uiService = inject(UIService);
  router = inject(Router);
  historyService = inject(HistoryService);
  instrumentsService = inject(InstrumentsService);

  showTrackSidebar = signal(true);
  soundBrowserOpen = signal(false);
  newTrackPresetId = signal('synth-lead');

  @ViewChild('scrollContainer') scrollContainer!: ElementRef;

  selectedTrack = computed(() =>
    this.musicManager
      .tracks()
      .find((t) => t.id === this.musicManager.selectedTrackId())
  );
  availablePresets = this.instrumentsService.getPresets();

  scales = [
    { name: 'C Major', notes: [0, 2, 4, 5, 7, 9, 11] },
    { name: 'C Minor', notes: [0, 2, 3, 5, 7, 8, 10] },
    { name: 'G Major', notes: [7, 9, 11, 0, 2, 4, 6] },
    { name: 'A Minor', notes: [9, 11, 0, 2, 4, 5, 7] },
    { name: 'D Phrygian', notes: [2, 3, 5, 7, 9, 10, 0] },
    { name: 'E Lydian', notes: [4, 6, 8, 9, 11, 1, 3] },
  ];

  selectedScale = signal(this.scales[0]);
  snapToScale = signal(false);
  editMode = signal<'draw' | 'select' | 'brush' | 'chord'>('draw');
  quantizeStrength = signal(1);
  microNudge = signal(0.5);
  snapOptions = [
    { label: '1/4', steps: 4 },
    { label: '1/8', steps: 2 },
    { label: '1/16', steps: 1 },
    { label: '1/32', steps: 0.5 },
  ];
  selectedSnap = signal(1);

  rowHeight = 24;
  cellWidth = 32;
  numOctaves = 4;
  numMeasures = 8;
  stepsPerMeasure = 16;
  gridWidth = 8 * 16 * 32; // initial grid width
  cells = Array.from({ length: 8 * 16 }, (_, i) => i);
  patternLengthOptions = [1, 2, 4, 8, 16];

  selectedNoteIds = signal<Set<string>>(new Set());
  isAiGenerating = signal(false);
  showAutomation = signal(true);
  isCompactMobile = signal(false);
  showAudioDock = signal(false);
  audioDockView = signal<'mixer' | 'drum-machine' | 'mastering'>(
    'drum-machine'
  );

  readonly arrangementBars = computed(() => {
    const bars: { index: number; noteCount: number }[] = [];
    const track = this.selectedTrack();
    for (let i = 0; i < this.numMeasures; i++) {
      const start = i * this.stepsPerMeasure;
      const end = start + this.stepsPerMeasure;
      const count = track
        ? track.notes.filter((n) => n.step >= start && n.step < end).length
        : 0;
      bars.push({ index: i, noteCount: count });
    }
    return bars;
  });

  selectionBox = signal({ active: false, x: 0, y: 0, w: 0, h: 0 });
  isStandalone = computed(() => this.router.url === '/piano-roll');

  constructor() {
    effect(() => {
      void this.uiService.performanceMode();
      this.isCompactMobile.set(window.innerWidth < 768);
    });
  }

  ngAfterViewInit() {
    this.checkMobile();
    // Scroll to C4 center
    if (this.scrollContainer) {
      const pianoHeight = this.getDisplayKeys().length * this.rowHeight;
      this.scrollContainer.nativeElement.scrollTop = pianoHeight / 2 - 200;
    }
  }

  ngOnDestroy() {}

  @HostListener('window:resize')
  onResize() {
    this.checkMobile();
  }

  checkMobile() {
    this.isCompactMobile.set(window.innerWidth < 768);
  }

  getDisplayKeys() {
    const keys = [];
    for (let i = 127; i >= 0; i--) {
      keys.push(i);
    }
    return keys;
  }

  getKeyName(pitch: number) {
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
    return names[pitch % 12];
  }

  isBlackKey(pitch: number) {
    const p = pitch % 12;
    return [1, 3, 6, 8, 10].includes(p);
  }

  isInScale(pitch: number) {
    const p = pitch % 12;
    return this.selectedScale().notes.includes(p);
  }

  isStrongBeat(step: number) {
    return step % this.stepsPerBeat === 0;
  }

  get stepsPerBeat() {
    return 4;
  }

  isDrumTrack() {
    const track = this.selectedTrack();
    return track?.instrumentId.toLowerCase().includes('kit');
  }

  onGridMouseDown(event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const step = Math.floor(x / this.cellWidth);
    const row = Math.floor(y / this.rowHeight);
    const midi = 127 - row;

    if (this.editMode() === 'draw') {
      const track = this.selectedTrack();
      if (!track) return;

      const existingNote = track.notes.find(
        (n) => n.midi === midi && n.step === step
      );
      if (existingNote) {
        this.musicManager.removeNote(track.id, midi, step);
      } else {
        const snappedMidi = this.constrainMidiToScale(midi);
        this.musicManager.addNote(track.id, snappedMidi, step);
      }
    } else if (this.editMode() === 'select') {
      this.selectionBox.set({
        active: true,
        x: event.clientX,
        y: event.clientY,
        w: 0,
        h: 0,
      });
      this.selectedNoteIds.set(new Set());

      const moveSub = fromEvent<MouseEvent>(window, 'mousemove').subscribe(
        (move) => {
          this.selectionBox.update((box) => ({
            ...box,
            w: move.clientX - box.x,
            h: move.clientY - box.y,
          }));
          this.updateSelectionFromBox();
        }
      );

      const upSub = fromEvent<MouseEvent>(window, 'mouseup').subscribe(() => {
        this.selectionBox.set({ active: false, x: 0, y: 0, w: 0, h: 0 });
        moveSub.unsubscribe();
        upSub.unsubscribe();
      });
    }
  }

  updateSelectionFromBox() {
    const box = this.selectionBox();
    const track = this.selectedTrack();
    if (!track || !box.active) return;

    const gridRect = this.scrollContainer.nativeElement.getBoundingClientRect();
    const scrollLeft = this.scrollContainer.nativeElement.scrollLeft;
    const scrollTop = this.scrollContainer.nativeElement.scrollTop;

    const selX = Math.min(box.x, box.x + box.w);
    const selY = Math.min(box.y, box.y + box.h);
    const selW = Math.abs(box.w);
    const selH = Math.abs(box.h);

    const newSelection = new Set<string>();

    track.notes.forEach((note) => {
      const noteX =
        gridRect.left + note.step * this.cellWidth - scrollLeft + 64; // Adjust for piano keys
      const noteY =
        gridRect.top +
        this.getDisplayKeys().indexOf(note.midi) * this.rowHeight -
        scrollTop;
      const noteW = note.length * this.cellWidth;
      const noteH = this.rowHeight;

      if (
        noteX < selX + selW &&
        noteX + noteW > selX &&
        noteY < selY + selH &&
        noteY + noteH > selY
      ) {
        newSelection.add(note.id);
      }
    });

    this.selectedNoteIds.set(newSelection);
  }

  onNoteMouseDown(event: MouseEvent, note: TrackNote) {
    event.stopPropagation();
    const track = this.selectedTrack();
    if (!track) return;

    if (event.ctrlKey || event.metaKey) {
      const current = new Set(this.selectedNoteIds());
      if (current.has(note.id)) current.delete(note.id);
      else current.add(note.id);
      this.selectedNoteIds.set(current);
    } else {
      if (!this.selectedNoteIds().has(note.id)) {
        this.selectedNoteIds.set(new Set([note.id]));
      }

      // Drag Logic
      const startX = event.clientX;
      const startY = event.clientY;
      const initialNotes = track.notes
        .filter((n) => this.selectedNoteIds().has(n.id))
        .map((n) => ({ ...n }));

      const moveSub = fromEvent<MouseEvent>(window, 'mousemove').subscribe(
        (move) => {
          const deltaX = Math.round((move.clientX - startX) / this.cellWidth);
          const deltaY = Math.round((move.clientY - startY) / this.rowHeight);

          if (deltaX !== 0 || deltaY !== 0) {
            initialNotes.forEach((initial) => {
              const newStep = this.clamp(
                initial.step + deltaX,
                0,
                this.cells.length - 1
              );
              const newMidi = this.clamp(initial.midi - deltaY, 0, 127);
              this.musicManager.updateNote(track.id, initial.id, {
                step: this.snapStep(newStep),
                midi: this.constrainMidiToScale(newMidi),
              });
            });
          }
        }
      );

      const upSub = fromEvent<MouseEvent>(window, 'mouseup').subscribe(() => {
        moveSub.unsubscribe();
        upSub.unsubscribe();
      });
    }
  }

  quantizeNotes() {
    const track = this.selectedTrack();
    if (!track) return;
    track.notes.forEach((n) => {
      if (
        this.selectedNoteIds().size === 0 ||
        this.selectedNoteIds().has(n.id)
      ) {
        this.musicManager.updateNote(track.id, n.id, {
          step: this.snapStep(n.step),
        });
      }
    });
  }

  transposeSelected(semitones: number) {
    const track = this.selectedTrack();
    if (!track) return;
    track.notes.forEach((n) => {
      if (this.selectedNoteIds().has(n.id)) {
        this.musicManager.updateNote(track.id, n.id, {
          midi: this.clamp(n.midi + semitones, 0, 127),
        });
      }
    });
  }

  deleteSelected() {
    const track = this.selectedTrack();
    if (!track) return;
    const ids = Array.from(this.selectedNoteIds());
    ids.forEach((id) => this.musicManager.deleteNoteById(track.id, id));
    this.selectedNoteIds.set(new Set());
  }

  duplicateSelected() {
    const track = this.selectedTrack();
    if (!track) return;
    this.selectedNoteIds().forEach((id) => {
      const n = track.notes.find((x) => x.id === id);
      if (n) {
        this.musicManager.addNote(
          track.id,
          n.midi,
          n.step + 16,
          n.length,
          n.velocity
        );
      }
    });
  }

  setSelectedNoteLength(length: number) {
    const track = this.selectedTrack();
    if (!track) return;
    track.notes.forEach((n) => {
      if (
        this.selectedNoteIds().size === 0 ||
        this.selectedNoteIds().has(n.id)
      ) {
        this.musicManager.updateNote(track.id, n.id, {
          length: this.clamp(length, 1, this.cells.length),
        });
      }
    });
  }

  humanizeSelected() {
    const track = this.selectedTrack();
    if (!track) return;
    const stepNudge = Math.max(1, Math.round(this.selectedSnap()));
    track.notes.forEach((n) => {
      if (
        this.selectedNoteIds().size === 0 ||
        this.selectedNoteIds().has(n.id)
      ) {
        const stepOffset = Math.random() > 0.5 ? stepNudge : -stepNudge;
        this.musicManager.updateNote(track.id, n.id, {
          step: this.snapStep(
            this.clamp(n.step + stepOffset, 0, this.cells.length - 1)
          ),
          velocity: this.clamp(
            n.velocity + (Math.random() - 0.5) * 0.2,
            0.2,
            1
          ),
        });
      }
    });
  }

  duplicateNextBar() {
    const track = this.selectedTrack();
    if (!track) return;
    const selectedIds = this.selectedNoteIds();
    const sourceNotes = selectedIds.size
      ? track.notes.filter((n) => selectedIds.has(n.id))
      : track.notes;

    sourceNotes.forEach((n) => {
      const nextStep = n.step + this.stepsPerMeasure;
      if (nextStep < this.cells.length) {
        this.musicManager.addNote(
          track.id,
          n.midi,
          nextStep,
          this.clamp(n.length, 1, this.cells.length),
          this.clamp(n.velocity, 0.2, 1)
        );
      }
    });
  }

  nudgeSelectedSteps(delta: number) {
    const track = this.selectedTrack();
    if (!track) return;
    const scaledDelta = delta * this.microNudge();
    track.notes.forEach((n) => {
      if (this.selectedNoteIds().has(n.id)) {
        this.musicManager.updateNote(track.id, n.id, {
          step: this.clamp(n.step + scaledDelta, 0, this.cells.length - 1),
        });
      }
    });
  }

  nudgeSelectedOctave(direction: 1 | -1) {
    this.transposeSelected(12 * direction);
  }

  adjustSelectedVelocity(delta: number) {
    const track = this.selectedTrack();
    if (!track) return;
    track.notes.forEach((n) => {
      if (
        this.selectedNoteIds().size === 0 ||
        this.selectedNoteIds().has(n.id)
      ) {
        this.musicManager.updateNote(track.id, n.id, {
          velocity: this.clamp(n.velocity + delta, 0.1, 1),
        });
      }
    });
  }

  adjustSelectedLength(delta: number) {
    const track = this.selectedTrack();
    if (!track) return;
    track.notes.forEach((n) => {
      if (
        this.selectedNoteIds().size === 0 ||
        this.selectedNoteIds().has(n.id)
      ) {
        this.musicManager.updateNote(track.id, n.id, {
          length: this.clamp(n.length + delta, 1, this.cells.length),
        });
      }
    });
  }

  invertSelectedChord() {
    const track = this.selectedTrack();
    if (!track) return;
    const selected = track.notes
      .filter((note) => this.selectedNoteIds().has(note.id))
      .sort((left, right) => left.midi - right.midi);
    if (selected.length < 2) return;
    const lowest = selected[0];
    this.musicManager.updateNote(track.id, lowest.id, {
      midi: this.clamp(lowest.midi + 12, 0, 127),
    });
  }

  spreadSelectedChord() {
    const track = this.selectedTrack();
    if (!track) return;
    const selected = track.notes
      .filter((note) => this.selectedNoteIds().has(note.id))
      .sort((left, right) => left.midi - right.midi);
    selected.forEach((note, idx) => {
      this.musicManager.updateNote(track.id, note.id, {
        midi: this.clamp(note.midi + idx, 0, 127),
      });
    });
  }

  selectTrack(track: TrackModel) {
    this.musicManager.selectedTrackId.set(track.id);
    this.selectedNoteIds.set(new Set());
  }

  addTrack() {
    const trackId = this.musicManager.ensureTrack(this.newTrackPresetId());
    this.musicManager.selectedTrackId.set(trackId);
    this.selectedNoteIds.set(new Set());
  }

  replaceTrackInstrument(track: TrackModel, presetId: string) {
    this.musicManager.setInstrument(track.id, presetId);
  }

  removeTrack(trackId: number) {
    this.musicManager.removeTrack(trackId);
    this.selectedNoteIds.set(new Set());
  }

  getVisibleNotes(track: TrackModel): TrackNote[] {
    const displayKeys = this.getDisplayKeys();
    return track.notes.filter((n) => displayKeys.includes(n.midi));
  }

  goToStudio() {
    this.router.navigate(['/studio']);
  }

  getVelocityAt(cell: number): number {
    const track = this.selectedTrack();
    if (!track) return 0;
    const note = track.notes.find(
      (n) => cell >= n.step && cell < n.step + n.length
    );
    return note ? note.velocity * 100 : 0;
  }

  hasNoteOverlap(note: TrackNote, track: TrackModel): boolean {
    const noteEnd = note.step + note.length;
    return track.notes.some((candidate) => {
      if (candidate.id === note.id || candidate.midi !== note.midi)
        return false;
      const candidateEnd = candidate.step + candidate.length;
      return note.step < candidateEnd && noteEnd > candidate.step;
    });
  }

  getGhostNotes(trackId: number): TrackNote[] {
    return this.musicManager
      .tracks()
      .filter((track) => track.id !== trackId)
      .flatMap((track) => track.notes.map((note) => ({ ...note })));
  }

  goStandalone() {
    this.router.navigate(['/piano-roll']);
  }

  getHumanizeStatusLabel(): string {
    return this.selectedTrack() ? 'Humanization Ready' : 'No Track Selected';
  }

  setEditMode(mode: 'draw' | 'select' | 'brush' | 'chord') {
    this.editMode.set(mode);
  }

  togglePlay() {
    this.audioSession.togglePlay();
  }

  toggleAudioDock() {
    this.showAudioDock.update((value) => !value);
  }

  setAudioDockView(view: 'mixer' | 'drum-machine' | 'mastering') {
    this.audioDockView.set(view);
    this.showAudioDock.set(true);
  }

  setPatternLength(measures: number) {
    this.numMeasures = this.clamp(measures, 1, 16);
    this.cells = Array.from(
      { length: this.numMeasures * this.stepsPerMeasure },
      (_, i) => i
    );
    this.gridWidth = this.cells.length * this.cellWidth;
  }

  toggleTrackSidebar() {
    this.showTrackSidebar.update((v) => !v);
  }

  toggleSoundBrowser() {
    this.soundBrowserOpen.update((v) => !v);
  }

  @HostListener('window:keydown', [''])
  handleKeyboardEvent(event: KeyboardEvent) {
    const track = this.selectedTrack();
    if (!track) return;

    // Don't intercept if typing in an input field
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    // Undo/Redo
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key === 'z' &&
      !event.shiftKey
    ) {
      event.preventDefault();
      this.historyService.undo();
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      (event.key === 'y' || (event.key === 'z' && event.shiftKey))
    ) {
      event.preventDefault();
      this.historyService.redo();
      return;
    }

    // Delete selected notes
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (this.selectedNoteIds().size > 0) {
        event.preventDefault();
        this.deleteSelectedWithHistory();
      }
      return;
    }

    // Select all notes (Ctrl+A)
    if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
      event.preventDefault();
      const allNoteIds = new Set(track.notes.map((n) => n.id));
      this.selectedNoteIds.set(allNoteIds);
      return;
    }

    // Duplicate selected (Ctrl+D)
    if ((event.ctrlKey || event.metaKey) && event.key === 'd') {
      event.preventDefault();
      if (this.selectedNoteIds().size > 0) {
        this.duplicateSelectedWithHistory();
      }
      return;
    }

    // Copy/Paste could be added here in the future

    // Arrow key transposition
    if (event.key === 'ArrowUp' && this.selectedNoteIds().size > 0) {
      event.preventDefault();
      this.transposeSelectedWithHistory(1);
      return;
    }
    if (event.key === 'ArrowDown' && this.selectedNoteIds().size > 0) {
      event.preventDefault();
      this.transposeSelectedWithHistory(-1);
      return;
    }

    // Quantize (Q key)
    if (event.key === 'q' || event.key === 'Q') {
      event.preventDefault();
      this.quantizeNotesWithHistory();
      return;
    }
  }

  private deleteSelectedWithHistory() {
    const track = this.selectedTrack();
    if (!track) return;

    const notesToDelete = track.notes.filter((n) =>
      this.selectedNoteIds().has(n.id)
    );
    const deletedNotes = notesToDelete.map((n) => ({ ...n })); // Deep copy

    this.historyService.pushAction({
      description: `Delete ${deletedNotes.length} note(s)`,
      undo: () => {
        deletedNotes.forEach((note) => {
          this.musicManager.addNoteToTrack(track.id, {
            midi: note.midi,
            step: note.step,
            length: note.length,
            velocity: note.velocity,
          });
        });
      },
      redo: () => {
        notesToDelete.forEach((n) => {
          this.musicManager.deleteNoteById(track.id, n.id);
        });
      },
    });

    this.deleteSelected();
  }

  private transposeSelectedWithHistory(semitones: number) {
    const track = this.selectedTrack();
    if (!track) return;

    const affectedNotes = track.notes
      .filter((n) => this.selectedNoteIds().has(n.id))
      .map((n) => ({
        id: n.id,
        oldMidi: n.midi,
        newMidi: this.clamp(n.midi + semitones, 0, 127),
      }));

    this.historyService.pushAction({
      description: `Transpose ${affectedNotes.length} note(s) ${semitones > 0 ? 'up' : 'down'}`,
      undo: () => {
        affectedNotes.forEach(({ id, oldMidi }) => {
          this.musicManager.updateNote(track.id, id, { midi: oldMidi });
        });
      },
      redo: () => {
        affectedNotes.forEach(({ id, newMidi }) => {
          this.musicManager.updateNote(track.id, id, { midi: newMidi });
        });
      },
    });

    this.transposeSelected(semitones);
  }

  private duplicateSelectedWithHistory() {
    const track = this.selectedTrack();
    if (!track) return;

    const notesToDup = track.notes.filter((n) =>
      this.selectedNoteIds().has(n.id)
    );
    const beforeCount = track.notes.length;

    this.historyService.pushAction({
      description: `Duplicate ${notesToDup.length} note(s)`,
      undo: () => {
        // Remove the duplicated notes by removing the last N notes added
        const currentTrack = this.musicManager
          .tracks()
          .find((t) => t.id === track.id);
        if (currentTrack) {
          const addedNoteIds = currentTrack.notes
            .slice(beforeCount)
            .map((n) => n.id);
          addedNoteIds.forEach((id) => {
            this.musicManager.deleteNoteById(track.id, id);
          });
        }
      },
      redo: () => {
        notesToDup.forEach((n) => {
          this.musicManager.addNote(
            track.id,
            n.midi,
            n.step + 16,
            n.length,
            n.velocity
          );
        });
      },
    });

    this.duplicateSelected();
  }

  private quantizeNotesWithHistory() {
    const track = this.selectedTrack();
    if (!track) return;

    const strength = this.clamp(this.quantizeStrength(), 0, 1);
    const affectedNotes = track.notes
      .filter(
        (n) =>
          this.selectedNoteIds().size === 0 || this.selectedNoteIds().has(n.id)
      )
      .map((n) => {
        const snapped = this.snapStep(n.step);
        const blended = n.step + (snapped - n.step) * strength;
        return {
          id: n.id,
          oldStep: n.step,
          newStep: this.clamp(blended, 0, this.cells.length - 1),
        };
      });

    this.historyService.pushAction({
      description: `Quantize ${affectedNotes.length} note(s)`,
      undo: () => {
        affectedNotes.forEach(({ id, oldStep }) => {
          this.musicManager.updateNote(track.id, id, { step: oldStep });
        });
      },
      redo: () => {
        affectedNotes.forEach(({ id, newStep }) => {
          this.musicManager.updateNote(track.id, id, { step: newStep });
        });
      },
    });

    this.quantizeNotes();
  }

  private snapStep(step: number): number {
    const snapValue = this.selectedSnap();
    return this.clamp(
      Math.round(step / snapValue) * snapValue,
      0,
      this.cells.length - 1
    );
  }

  private constrainMidiToScale(midi: number): number {
    const clampedMidi = this.clamp(midi, 0, 127);
    if (!this.snapToScale()) {
      return clampedMidi;
    }

    const octave = Math.floor(clampedMidi / 12);
    const candidates = Array.from(
      new Set(
        [-1, 0, 1].flatMap((octaveOffset) =>
          this.selectedScale().notes.map((scaleNote) =>
            this.clamp((octave + octaveOffset) * 12 + scaleNote, 0, 127)
          )
        )
      )
    ).sort((left, right) => {
      const distanceDelta =
        Math.abs(left - clampedMidi) - Math.abs(right - clampedMidi);
      return distanceDelta === 0 ? left - right : distanceDelta;
    });

    return candidates[0] ?? clampedMidi;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
