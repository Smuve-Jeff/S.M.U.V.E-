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
import { ChannelRackComponent } from '../channel-rack/channel-rack.component';
import { MixerComponent } from '../mixer/mixer.component';
import { DrumMachineComponent } from '../drum-machine/drum-machine.component';
import { MasteringSuiteComponent } from '../mastering-suite/mastering-suite.component';
import { AudioSessionService } from '../audio-session.service';
import { AiService } from '../../services/ai.service';
import { UIService } from '../../services/ui.service';
import { Router } from '@angular/router';
import { HistoryService } from '../../services/history.service';

@Component({
  selector: 'app-piano-roll',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ChannelRackComponent,
    MixerComponent,
    DrumMachineComponent,
    MasteringSuiteComponent,
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

  @ViewChild('scrollContainer') scrollContainer!: ElementRef;

  selectedTrack = computed(() =>
    this.musicManager
      .tracks()
      .find((t) => t.id === this.musicManager.selectedTrackId())
  );

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

  cells = Array.from(
    { length: this.numMeasures * this.stepsPerMeasure },
    (_, i) => i
  );
  gridWidth = this.cells.length * this.cellWidth;

  selectedNoteIds = signal<Set<string>>(new Set());
  isAiGenerating = signal(false);
  showAutomation = signal(true);
  isCompactMobile = signal(false);
  showAudioDock = signal(false);
  audioDockView = signal<'mixer' | 'drum-machine' | 'mastering'>('mixer');
  isPlaying = this.audioSession.isPlaying;
  readonly defaultTrackPresetId = 'synth-lead';

  selectionBox = signal({ active: false, x: 0, y: 0, w: 0, h: 0 });
  isStandalone = computed(() => this.router.url === '/piano-roll');

  constructor() {
    effect(() => {
      if (this.isStandalone()) {
        this.uiService.performanceMode.set(true);
        this.showAudioDock.set(true);
      }
    });
    this.updateViewportFlags();
  }

  ngAfterViewInit() {
    if (this.scrollContainer) {
      this.scrollContainer.nativeElement.scrollTop = this.rowHeight * 12 * 2;
    }
  }

  ngOnDestroy() {
    if (this.isStandalone()) {
      this.uiService.performanceMode.set(false);
    }
  }

  @HostListener('window:resize')
  onResize() {
    this.updateViewportFlags();
  }

  private updateViewportFlags() {
    if (typeof window !== 'undefined') {
      const width = window.innerWidth;
      const isCompact = width < 768;
      this.isCompactMobile.set(isCompact);

      const isNarrowViewport = width <= 540;
      if (isCompact) {
        this.rowHeight = isNarrowViewport ? 30 : 28;
        this.cellWidth = isNarrowViewport ? 38 : 34;
      } else {
        this.rowHeight = 24;
        this.cellWidth = 32;
      }
      this.gridWidth = this.cells.length * this.cellWidth;
    }
  }

  getDisplayKeys(): number[] {
    const keys = [];
    for (let i = 127; i >= 0; i--) keys.push(i);
    return keys;
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

  isBlackKey(midi: number): boolean {
    return [1, 3, 6, 8, 10].includes(midi % 12);
  }

  isInScale(midi: number): boolean {
    return this.selectedScale().notes.includes(midi % 12);
  }

  isStrongBeat(step: number): boolean {
    return step % 4 === 0;
  }

  isDrumTrack(): boolean {
    return (
      this.selectedTrack()?.instrumentId.toLowerCase().includes('kit') || false
    );
  }

  onGridMouseDown(event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const step = this.snapStep(Math.floor(x / this.cellWidth));
    const midi = this.getDisplayKeys()[Math.floor(y / this.rowHeight)];

    const track = this.selectedTrack();
    if (!track) return;

    if (this.editMode() === 'chord') {
      this.addChordAt(track.id, midi, step);
      return;
    }

    const existingNote = track.notes.find(
      (n) => n.step === step && n.midi === midi
    );
    if (existingNote) {
      this.musicManager.deleteNoteById(track.id, existingNote.id);
    } else {
      this.musicManager.addNoteToTrack(track.id, {
        midi,
        step,
        length: 1,
        velocity: 0.8,
      });
    }
  }

  private addChordAt(trackId: number, rootMidi: number, step: number) {
    const isMajor = this.selectedScale().name.includes('Major');
    const chordOffsets = isMajor ? [0, 4, 7] : [0, 3, 7]; // Basic triad
    chordOffsets.forEach((offset) => {
      this.musicManager.addNoteToTrack(trackId, {
        midi: rootMidi + offset,
        step,
        length: 4,
        velocity: 0.7,
      });
    });
  }

  onNoteMouseDown(event: MouseEvent, note: TrackNote) {
    event.stopPropagation();
    if (event.shiftKey) {
      this.selectedNoteIds.update((ids) => {
        const next = new Set(ids);
        if (next.has(note.id)) next.delete(note.id);
        else next.add(note.id);
        return next;
      });
    } else {
      this.selectedNoteIds.set(new Set([note.id]));
    }
  }

  async generateAiPattern() {
    const track = this.selectedTrack();
    if (!track) return;

    this.isAiGenerating.set(true);
    try {
      const prompt = `Generate a professional ${this.selectedScale().name} ${track.name} pattern that sounds like a top-tier industry production. Provide high-voltage energy. Return JSON: { notes: [{midi, step, length, velocity}] }`;
      const response = await this.aiService.generateAiResponse(prompt);

      try {
        const data = JSON.parse(
          response.substring(
            response.indexOf('{'),
            response.lastIndexOf('}') + 1
          )
        );
        if (data.notes) {
          this.musicManager.clearTrack(track.id);
          data.notes.forEach((n: any) =>
            this.musicManager.addNoteToTrack(track.id, n)
          );
        }
      } catch (e) {
        console.error('AI Generation failed', e);
      }
    } finally {
      this.isAiGenerating.set(false);
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

  randomizeVelocity() {
    const track = this.selectedTrack();
    if (!track) return;
    track.notes.forEach((n) => {
      if (
        this.selectedNoteIds().size === 0 ||
        this.selectedNoteIds().has(n.id)
      ) {
        this.musicManager.updateNote(track.id, n.id, {
          velocity: 0.5 + Math.random() * 0.5,
        });
      }
    });
  }

  deleteSelected() {
    const track = this.selectedTrack();
    if (!track) return;
    this.selectedNoteIds().forEach((id) =>
      this.musicManager.deleteNoteById(track.id, id)
    );
    this.selectedNoteIds.set(new Set());
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

  legatoSelected() {
    const track = this.selectedTrack();
    if (!track) return;
    const sortedNotes = [...track.notes].sort((a, b) => a.step - b.step);
    sortedNotes.forEach((n, i) => {
      if (this.selectedNoteIds().has(n.id) && i < sortedNotes.length - 1) {
        const next = sortedNotes[i + 1];
        this.musicManager.updateNote(track.id, n.id, {
          length: next.step - n.step,
        });
      }
    });
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

  selectTrack(track: TrackModel) {
    this.musicManager.selectedTrackId.set(track.id);
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

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    const track = this.selectedTrack();
    if (!track) return;

    // Don't intercept if typing in an input field
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    // Undo/Redo
    if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
      event.preventDefault();
      this.historyService.undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
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
      const allNoteIds = new Set(track.notes.map(n => n.id));
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

    const notesToDelete = track.notes.filter(n => this.selectedNoteIds().has(n.id));
    const deletedNotes = notesToDelete.map(n => ({ ...n })); // Deep copy

    this.historyService.pushAction({
      description: `Delete ${deletedNotes.length} note(s)`,
      undo: () => {
        deletedNotes.forEach(note => {
          this.musicManager.addNoteToTrack(track.id, {
            midi: note.midi,
            step: note.step,
            length: note.length,
            velocity: note.velocity,
          });
        });
      },
      redo: () => {
        notesToDelete.forEach(n => {
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
      .filter(n => this.selectedNoteIds().has(n.id))
      .map(n => ({ id: n.id, oldMidi: n.midi, newMidi: this.clamp(n.midi + semitones, 0, 127) }));

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

    const notesToDup = track.notes.filter(n => this.selectedNoteIds().has(n.id));
    const beforeCount = track.notes.length;

    this.historyService.pushAction({
      description: `Duplicate ${notesToDup.length} note(s)`,
      undo: () => {
        // Remove the duplicated notes by removing the last N notes added
        const currentTrack = this.musicManager.tracks().find(t => t.id === track.id);
        if (currentTrack) {
          const addedNoteIds = currentTrack.notes.slice(beforeCount).map(n => n.id);
          addedNoteIds.forEach(id => {
            this.musicManager.deleteNoteById(track.id, id);
          });
        }
      },
      redo: () => {
        notesToDup.forEach(n => {
          this.musicManager.addNote(track.id, n.midi, n.step + 16, n.length, n.velocity);
        });
      },
    });

    this.duplicateSelected();
  }

  private quantizeNotesWithHistory() {
    const track = this.selectedTrack();
    if (!track) return;

    const affectedNotes = track.notes
      .filter(n => this.selectedNoteIds().size === 0 || this.selectedNoteIds().has(n.id))
      .map(n => ({ id: n.id, oldStep: n.step, newStep: this.snapStep(n.step) }));

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

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
