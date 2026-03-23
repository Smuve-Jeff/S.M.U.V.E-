import { Component, inject, HostListener, computed, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MusicManagerService, TrackNote } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { AiService } from '../../services/ai.service';

interface Scale {
  name: string;
  intervals: number[];
}

const SCALES: Scale[] = [
  { name: 'Chromatic', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { name: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'Minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10] },
  { name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11] },
  { name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] },
  { name: 'Pentatonic Major', intervals: [0, 2, 4, 7, 9] },
  { name: 'Pentatonic Minor', intervals: [0, 3, 5, 7, 10] },
];

@Component({
  selector: 'app-piano-roll',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './piano-roll.component.html',
  styleUrls: ['./piano-roll.component.css']
})
export class PianoRollComponent {
  public musicManager = inject(MusicManagerService);
  public aiService = inject(AiService);
  private engine = inject(AudioEngineService);

  keys = Array.from({ length: 88 }, (_, i) => 108 - i);
  cells = Array.from({ length: 64 }, (_, i) => i);
  cellWidth = 40;
  rowHeight = 32;
  gridWidth = 64 * 40;

  selectedTrack = computed(() => this.musicManager.tracks().find(t => t.id === this.musicManager.selectedTrackId()));
  currentStep = this.engine.currentBeat;

  // UI State
  selectedScale = signal(SCALES[1]); // Default to Major
  selectedRoot = signal(0); // C
  snapToScale = signal(true);
  showAutomation = signal(false);
  isAiGenerating = signal(false);

  // Selection & Editing
  selectedNoteIds = signal<Set<string>>(new Set());
  isSelecting = false;
  selectionBox = signal({ x: 0, y: 0, w: 0, h: 0, active: false });

  isDragging = false;
  draggedNote: TrackNote | null = null;
  dragType: 'move' | 'resize' = 'move';
  startX = 0;
  startY = 0;
  initialNoteStart = 0;
  initialNotePitch = 0;
  initialNoteDuration = 0;

  scales = SCALES;
  noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  isBlackKey(pitch: number): boolean {
    const note = pitch % 12;
    return [1, 3, 6, 8, 10].includes(note);
  }

  isInScale(pitch: number): boolean {
    const note = (pitch - this.selectedRoot()) % 12;
    const normalizedNote = note < 0 ? note + 12 : note;
    return this.selectedScale().intervals.includes(normalizedNote);
  }

  getKeyName(pitch: number): string {
    const octave = Math.floor(pitch / 12) - 1;
    return `${this.noteNames[pitch % 12]}${octave}`;
  }

  isStrongBeat(cell: number): boolean {
    return cell % 16 === 0;
  }

  onGridMouseDown(event: MouseEvent) {
    if (event.button !== 0) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Check if clicking on empty space for selection or note creation
    const target = event.target as HTMLElement;
    if (target.classList.contains('grid-background') || target.classList.contains('grid-cell')) {
       if (event.shiftKey) {
         this.isSelecting = true;
         this.selectionBox.set({ x, y, w: 0, h: 0, active: true });
         this.startX = event.clientX;
         this.startY = event.clientY;
       } else {
         this.selectedNoteIds.set(new Set());
         const step = Math.floor(x / this.cellWidth);
         let pitch = 108 - Math.floor(y / this.rowHeight);

         if (this.snapToScale() && !this.isInScale(pitch)) {
            // Find nearest in scale
            const scaleNotes = this.selectedScale().intervals.map(i => (i + this.selectedRoot()) % 12);
            let minDist = 12;
            let targetPitch = pitch;
            for (let i = -6; i <= 6; i++) {
               const p = pitch + i;
               if (scaleNotes.includes(p % 12 < 0 ? p % 12 + 12 : p % 12)) {
                  if (Math.abs(i) < minDist) {
                    minDist = Math.abs(i);
                    targetPitch = p;
                  }
               }
            }
            pitch = targetPitch;
         }

         const track = this.selectedTrack();
         if (track) {
           this.musicManager.addNoteToTrack(track.id, { midi: pitch, step, length: 1, velocity: 0.8 });
         }
       }
    }
  }

  onNoteMouseDown(event: MouseEvent, note: TrackNote) {
    event.stopPropagation();
    if (!this.selectedNoteIds().has(note.id)) {
       if (event.ctrlKey || event.metaKey) {
         this.selectedNoteIds.update(s => { s.add(note.id); return new Set(s); });
       } else {
         this.selectedNoteIds.set(new Set([note.id]));
       }
    }

    this.isDragging = true;
    this.draggedNote = note;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.initialNoteStart = note.step;
    this.initialNotePitch = note.midi;
    this.initialNoteDuration = note.length;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (event.clientX > rect.right - 10) this.dragType = 'resize';
    else this.dragType = 'move';
  }

  @HostListener('window:mousemove', [''])
  onMouseMove(event: MouseEvent) {
    if (this.isSelecting) {
      const dx = event.clientX - this.startX;
      const dy = event.clientY - this.startY;
      this.selectionBox.update(b => ({ ...b, w: dx, h: dy }));
      this.updateSelection();
    }

    if (!this.isDragging || !this.draggedNote) return;
    const dx = event.clientX - this.startX;
    const dy = event.clientY - this.startY;
    const dStep = Math.round(dx / this.cellWidth);
    const dPitch = -Math.round(dy / this.rowHeight);

    const track = this.selectedTrack();
    if (!track) return;

    if (this.dragType === 'move') {
      const notesToMove = track.notes.filter(n => this.selectedNoteIds().has(n.id));
      notesToMove.forEach(n => {
         // Logic for moving multiple notes would go here, for now simplify to the single dragged one
         // but we keep the logic structure for future batching
      });

      this.musicManager.updateNote(track.id, this.draggedNote.id, {
        step: Math.max(0, this.initialNoteStart + dStep),
        midi: Math.max(21, Math.min(108, this.initialNotePitch + dPitch))
      });
    } else {
      this.musicManager.updateNote(track.id, this.draggedNote.id, {
        length: Math.max(0.5, this.initialNoteDuration + dStep)
      });
    }
  }

  @HostListener('window:mouseup')
  onMouseUp() {
    this.isDragging = false;
    this.draggedNote = null;
    this.isSelecting = false;
    this.selectionBox.set({ x: 0, y: 0, w: 0, h: 0, active: false });
  }

  updateSelection() {
    const box = this.selectionBox();
    if (!box.active) return;

    // Selection logic would calculate intersection with note rectangles
  }

  async generateAiPattern() {
    this.isAiGenerating.set(true);
    const track = this.selectedTrack();
    if (!track) return;

    const prompt = `Generate a professional ${this.selectedScale().name} ${track.name} pattern. Return JSON: { notes: [{midi, step, length, velocity}] }`;
    const response = await this.aiService.generateAiResponse(prompt);

    try {
      const data = JSON.parse(response.substring(response.indexOf('{'), response.lastIndexOf('}') + 1));
      if (data.notes) {
        this.musicManager.clearTrack(track.id);
        data.notes.forEach((n: any) => this.musicManager.addNoteToTrack(track.id, n));
      }
    } catch (e) {
      console.error("AI Generation failed", e);
    }
    this.isAiGenerating.set(false);
  }

  quantizeNotes() {
    const track = this.selectedTrack();
    if (!track) return;
    track.notes.forEach(n => {
       if (this.selectedNoteIds().size === 0 || this.selectedNoteIds().has(n.id)) {
          this.musicManager.updateNote(track.id, n.id, { step: Math.round(n.step) });
       }
    });
  }

  randomizeVelocity() {
    const track = this.selectedTrack();
    if (!track) return;
    track.notes.forEach(n => {
       if (this.selectedNoteIds().size === 0 || this.selectedNoteIds().has(n.id)) {
          this.musicManager.updateNote(track.id, n.id, { velocity: 0.5 + Math.random() * 0.5 });
       }
    });
  }

  deleteSelected() {
    const track = this.selectedTrack();
    if (!track) return;
    this.selectedNoteIds().forEach(id => this.musicManager.deleteNoteById(track.id, id));
    this.selectedNoteIds.set(new Set());
  }

  getVelocityAt(cell: number): number {
    const track = this.selectedTrack();
    if (!track) return 0;
    const note = track.notes.find(n => cell >= n.step && cell < n.step + n.length);
    return note ? note.velocity * 100 : 0;
  }
}
