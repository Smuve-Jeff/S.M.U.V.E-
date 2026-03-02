import { Component, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SequencerService, SequencerNote } from '../sequencer.service';
import { AudioEngineService } from '../../services/audio-engine.service';

@Component({
  selector: 'app-piano-roll',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './piano-roll.component.html',
  styleUrls: ['./piano-roll.component.css']
})
export class PianoRollComponent {
  public sequencer = inject(SequencerService);
  private engine = inject(AudioEngineService);

  keys = Array.from({ length: 88 }, (_, i) => 108 - i);
  cells = Array.from({ length: 64 }, (_, i) => i);
  cellWidth = 40;
  rowHeight = 32;
  gridWidth = 64 * 40;

  selectedTrack = this.sequencer.selectedTrack;
  currentStep = this.engine.currentBeat;

  isDragging = false;
  draggedNote: SequencerNote | null = null;
  dragType: 'move' | 'resize' = 'move';
  startX = 0;
  startY = 0;
  initialNoteStart = 0;
  initialNotePitch = 0;
  initialNoteDuration = 0;

  isBlackKey(pitch: number): boolean {
    const note = pitch % 12;
    return [1, 3, 6, 8, 10].includes(note);
  }

  getKeyName(pitch: number): string {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(pitch / 12) - 1;
    return `${names[pitch % 12]}${octave}`;
  }

  isStrongBeat(cell: number): boolean {
    return cell % 16 === 0;
  }

  onGridClick(event: MouseEvent) {
    if (this.isDragging) return;
    const track = this.selectedTrack();
    if (!track) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const step = Math.floor(x / this.cellWidth);
    const pitch = 108 - Math.floor(y / this.rowHeight);
    this.sequencer.addNote(track.id, { pitch, startTime: step, duration: 1, velocity: 0.8 });
  }

  onNoteMouseDown(event: MouseEvent, note: SequencerNote) {
    event.stopPropagation();
    this.isDragging = true;
    this.draggedNote = note;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.initialNoteStart = note.startTime;
    this.initialNotePitch = note.pitch;
    this.initialNoteDuration = note.duration;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (event.clientX > rect.right - 10) this.dragType = 'resize';
    else this.dragType = 'move';
  }

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (!this.isDragging || !this.draggedNote) return;
    const dx = event.clientX - this.startX;
    const dy = event.clientY - this.startY;
    const dStep = Math.round(dx / this.cellWidth);
    const dPitch = -Math.round(dy / this.rowHeight);
    const track = this.selectedTrack();
    if (!track) return;
    if (this.dragType === 'move') {
      this.sequencer.updateNote(track.id, this.draggedNote.id, {
        startTime: Math.max(0, this.initialNoteStart + dStep),
        pitch: Math.max(21, Math.min(108, this.initialNotePitch + dPitch))
      });
    } else {
      this.sequencer.updateNote(track.id, this.draggedNote.id, {
        duration: Math.max(0.5, this.initialNoteDuration + dStep)
      });
    }
  }

  @HostListener('window:mouseup')
  onMouseUp() {
    this.isDragging = false;
    this.draggedNote = null;
  }

  deleteNote(event: MouseEvent, noteId: string) {
    event.stopPropagation();
    const track = this.selectedTrack();
    if (track) this.sequencer.deleteNote(track.id, noteId);
  }

  getVelocityAt(cell: number): number {
    const track = this.selectedTrack();
    if (!track) return 0;
    const note = track.notes.find(n => cell >= n.startTime && cell < n.startTime + n.duration);
    return note ? note.velocity * 100 : 0;
  }
}
