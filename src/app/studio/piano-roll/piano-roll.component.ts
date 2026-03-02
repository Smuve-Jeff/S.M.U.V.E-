import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface MidiNote {
  pitch: number;
  startTime: number;
  duration: number;
  velocity: number;
}

@Component({
  selector: 'app-piano-roll',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './piano-roll.component.html',
  styleUrls: ['./piano-roll.component.css']
})
export class PianoRollComponent {
  keys = Array.from({ length: 88 }, (_, i) => i + 21); // MIDI 21 to 108
  cells = Array.from({ length: 64 }, (_, i) => i); // 64 steps
  cellWidth = 40;
  gridWidth = 64 * 40;

  notes: MidiNote[] = [
    { pitch: 60, startTime: 0, duration: 4, velocity: 0.8 },
    { pitch: 64, startTime: 4, duration: 4, velocity: 0.7 },
    { pitch: 67, startTime: 8, duration: 8, velocity: 0.9 },
    { pitch: 72, startTime: 16, duration: 4, velocity: 0.85 }
  ];

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

  getVelocityAt(cell: number): number {
    const note = this.notes.find(n => cell >= n.startTime && cell < n.startTime + n.duration);
    return note ? note.velocity * 100 : 0;
  }
}
