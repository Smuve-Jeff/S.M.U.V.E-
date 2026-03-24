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
import { AiService } from '../../services/ai.service';
import { UIService } from '../../services/ui.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-piano-roll',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './piano-roll.component.html',
  styleUrls: ['./piano-roll.component.css'],
})
export class PianoRollComponent implements AfterViewInit, OnDestroy {
  musicManager = inject(MusicManagerService);
  aiService = inject(AiService);
  uiService = inject(UIService);
  router = inject(Router);

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

  selectionBox = signal({ active: false, x: 0, y: 0, w: 0, h: 0 });
  isStandalone = computed(() => this.router.url === '/piano-roll');

  constructor() {
    effect(() => {
      if (this.isStandalone()) {
        this.uiService.performanceMode.set(true);
      }
    });
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

    const step = Math.floor(x / this.cellWidth);
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
          step: Math.round(n.step),
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
          midi: n.midi + semitones,
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

  setEditMode(mode: string) {
    this.editMode.set(mode as any);
  }
}
