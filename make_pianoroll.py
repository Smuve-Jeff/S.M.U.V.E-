import os

dir_path = "src/app/components/piano-roll"
os.makedirs(dir_path, exist_ok=True)

# 1. Component TypeScript Logic
ts_code = r"""import { Component, ElementRef, HostListener, Input, OnInit, ViewChild } from '@angular/core';
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
"""

# 2. Component HTML Template
html_code = r"""<div class="piano-roll-container">
  <div class="toolbar">
    <span class="title">S.M.U.V.E- Piano Roll</span>
    <div class="controls">
      <label>Snap Grid: 
        <select [(ngModel)]="snapGrid" (change)="draw()">
          <option [value]="1">1/16</option>
          <option [value]="4">1/4 (Beat)</option>
          <option [value]="8">1/2</option>
          <option [value]="16">1 Bar</option>
        </select>
      </label>
      <button class="btn-danger" (click)="deleteSelectedNote()" [disabled]="!selectedNote">Delete Note</button>
    </div>
  </div>

  <div class="canvas-viewport">
    <canvas 
      #canvasRef 
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)">
    </canvas>
  </div>
</div>
"""

# 3. Component Styles
css_code = r""".piano-roll-container {
  display: flex;
  flex-direction: column;
  background: #111;
  color: #eee;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #333;
  width: 100%;
  font-family: monospace;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #1e1e1e;
  padding: 8px 16px;
  border-bottom: 1px solid #333;
}

.title {
  font-weight: bold;
  color: #4cc9f0;
  letter-spacing: 1px;
}

.controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

select {
  background: #2a2a2a;
  color: #fff;
  border: 1px solid #444;
  padding: 4px 8px;
  border-radius: 4px;
}

.btn-danger {
  background: #ef4444;
  color: white;
  border: none;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
}

.btn-danger:disabled {
  background: #444;
  color: #888;
  cursor: not-allowed;
}

.canvas-viewport {
  overflow-x: auto;
  overflow-y: auto;
  max-height: 500px;
  background: #181818;
  position: relative;
  touch-action: none;
}

canvas {
  display: block;
  cursor: crosshair;
}
"""

with open(f"{dir_path}/piano-roll.component.ts", "w") as f:
    f.write(ts_code)

with open(f"{dir_path}/piano-roll.component.html", "w") as f:
    f.write(html_code)

with open(f"{dir_path}/piano-roll.component.css", "w") as f:
    f.write(css_code)

print("[+] Piano Roll component files generated successfully!")
