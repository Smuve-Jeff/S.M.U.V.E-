import { Component, ElementRef, HostListener, Input, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface Note {
  id: string;
  pitch: number;      // MIDI note number (e.g., 60 = C4)
  startStep: number;  // Grid step index
  duration: number;   // Duration in grid steps
  velocity: number;   // 1 to 127
}

@Component({
  // Distinct from the WebGL `app-piano-roll` in src/app/studio/piano-roll.
  selector: 'app-canvas-piano-roll',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './piano-roll.component.html',
  styleUrls: ['./piano-roll.component.css']
})
export class PianoRollComponent implements OnInit {
  @ViewChild('canvasRef', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;

  @Input() totalSteps: number = 64;
  @Input() minPitch: number = 48;
  @Input() maxPitch: number = 84;
  
  public cellWidth: number = 32;
  public cellHeight: number = 20;
  public velocityLaneHeight: number = 80;

  public notes: Note[] = [
    { id: '1', pitch: 60, startStep: 0, duration: 4, velocity: 100 },
    { id: '2', pitch: 64, startStep: 4, duration: 4, velocity: 90 },
    { id: '3', pitch: 67, startStep: 8, duration: 4, velocity: 110 }
  ];

  private isDrawing: boolean = false;
  private isEditingVelocity: boolean = false;
  private activePointerId: number | null = null;
  public selectedNote: Note | null = null;
  public snapGrid: number = 4;
  public defaultVelocity: number = 100;

  ngOnInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.resizeCanvas();
    this.draw();
  }

  private resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = this.totalSteps * this.cellWidth + 60;
    canvas.height = (this.maxPitch - this.minPitch + 1) * this.cellHeight + this.velocityLaneHeight;
  }

  public draw(): void {
    if (!this.ctx) return;
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pitchCount = this.maxPitch - this.minPitch + 1;
    const gridHeight = pitchCount * this.cellHeight;

    for (let i = 0; i < pitchCount; i++) {
      const pitch = this.maxPitch - i;
      const y = i * this.cellHeight;
      const isBlackKey = [1, 3, 6, 8, 10].includes(pitch % 12);

      this.ctx.fillStyle = isBlackKey ? '#1a1a1a' : '#262626';
      this.ctx.fillRect(60, y, this.totalSteps * this.cellWidth, this.cellHeight);

      this.ctx.fillStyle = isBlackKey ? '#0d0d0d' : '#3d3d3d';
      this.ctx.fillRect(0, y, 60, this.cellHeight);
      this.ctx.fillStyle = '#888';
      this.ctx.font = '10px monospace';
      this.ctx.fillText(this.getNoteName(pitch), 8, y + 14);

      this.ctx.strokeStyle = '#333';
      this.ctx.lineWidth = 0.5;
      this.ctx.beginPath();
      this.ctx.moveTo(60, y);
      this.ctx.lineTo(canvas.width, y);
      this.ctx.stroke();
    }

    for (let step = 0; step <= this.totalSteps; step++) {
      const x = 60 + step * this.cellWidth;
      this.ctx.strokeStyle = step % 16 === 0 ? '#555' : step % 4 === 0 ? '#3a3a3a' : '#2a2a2a';
      this.ctx.lineWidth = step % 16 === 0 ? 1.5 : 1;
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, gridHeight);
      this.ctx.stroke();
    }

    this.ctx.fillStyle = '#141414';
    this.ctx.fillRect(0, gridHeight, canvas.width, this.velocityLaneHeight);
    this.ctx.strokeStyle = '#444';
    this.ctx.beginPath();
    this.ctx.moveTo(0, gridHeight);
    this.ctx.lineTo(canvas.width, gridHeight);
    this.ctx.stroke();

    this.notes.forEach(note => {
      const pitchIndex = this.maxPitch - note.pitch;
      if (pitchIndex < 0 || pitchIndex >= pitchCount) return;

      const x = 60 + note.startStep * this.cellWidth;
      const y = pitchIndex * this.cellHeight;
      const w = note.duration * this.cellWidth;
      const h = this.cellHeight;

      const isSelected = this.selectedNote?.id === note.id;
      this.ctx.fillStyle = isSelected ? '#ffb703' : '#3a86ff';
      this.ctx.fillRect(x + 1, y + 1, w - 2, h - 2);

      this.ctx.strokeStyle = isSelected ? '#fff' : '#1d4ed8';
      this.ctx.lineWidth = isSelected ? 2 : 1;
      this.ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

      const velNormalized = note.velocity / 127;
      const velHeight = velNormalized * (this.velocityLaneHeight - 15);
      const velX = x + w / 2;
      const velYStart = canvas.height - 5;
      const velYEnd = velYStart - velHeight;

      this.ctx.strokeStyle = '#4cc9f0';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.moveTo(velX, velYStart);
      this.ctx.lineTo(velX, velYEnd);
      this.ctx.stroke();

      this.ctx.fillStyle = '#4cc9f0';
      this.ctx.beginPath();
      this.ctx.arc(velX, velYEnd, 3.5, 0, 2 * Math.PI);
      this.ctx.fill();
    });
  }

  public onPointerDown(event: PointerEvent): void {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const pitchCount = this.maxPitch - this.minPitch + 1;
    const gridHeight = pitchCount * this.cellHeight;

    if (x < 60) return;

    const step = Math.floor((x - 60) / this.cellWidth);
    const quantizedStep = Math.floor(step / this.snapGrid) * this.snapGrid;

    if (y > gridHeight) {
      const clickedNote = this.notes.find(n => 
        quantizedStep >= n.startStep && quantizedStep < n.startStep + n.duration
      );
      if (clickedNote) {
        this.selectedNote = clickedNote;
        this.isEditingVelocity = true;
        this.updateVelocityFromMouse(y, gridHeight);
      }
    } else {
      const pitchIndex = Math.floor(y / this.cellHeight);
      const clickedPitch = this.maxPitch - pitchIndex;

      const existingNote = this.notes.find(n => 
        n.pitch === clickedPitch && quantizedStep >= n.startStep && quantizedStep < n.startStep + n.duration
      );

      if (existingNote) {
        this.selectedNote = existingNote;
      } else {
        const newNote: Note = {
          id: Math.random().toString(36).substring(2, 9),
          pitch: clickedPitch,
          startStep: quantizedStep,
          duration: Math.max(this.snapGrid, 4),
          velocity: this.defaultVelocity
        };
        this.notes.push(newNote);
        this.selectedNote = newNote;
      }
      this.isDrawing = true;
    }

    this.activePointerId = event.pointerId;
    this.draw();
  }

  public onPointerMove(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) return;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const y = event.clientY - rect.top;

    const pitchCount = this.maxPitch - this.minPitch + 1;
    const gridHeight = pitchCount * this.cellHeight;

    if (this.isEditingVelocity && this.selectedNote) {
      this.updateVelocityFromMouse(y, gridHeight);
      this.draw();
    }
  }

  @HostListener('window:pointerup', ['$event'])
  public onPointerUp(event: PointerEvent): void {
    if (this.activePointerId === event.pointerId) {
      this.isDrawing = false;
      this.isEditingVelocity = false;
      this.activePointerId = null;
    }
  }

  private updateVelocityFromMouse(y: number, gridHeight: number): void {
    if (!this.selectedNote) return;
    const relY = y - gridHeight;
    const normalized = 1 - Math.max(0, Math.min(1, relY / (this.velocityLaneHeight - 15)));
    this.selectedNote.velocity = Math.round(normalized * 127);
  }

  private getNoteName(pitch: number): string {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return `${names[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
  }

  public deleteSelectedNote(): void {
    if (this.selectedNote) {
      this.notes = this.notes.filter(n => n.id !== this.selectedNote?.id);
      this.selectedNote = null;
      this.draw();
    }
  }
}
