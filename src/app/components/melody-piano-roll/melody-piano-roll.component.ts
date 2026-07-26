import { Component, input, output, signal, computed, effect, ElementRef, viewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PianoRollNote } from '../../services/cowrite.service';

@Component({
  selector: 'app-melody-piano-roll',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="piano-roll-container">
      <!-- Toolbar -->
      <div class="flex items-center justify-between mb-3 shrink-0">
        <div class="flex items-center gap-3">
          <h3 class="text-[10px] font-black uppercase tracking-widest text-violet-400">Piano Roll</h3>
          <span class="text-[8px] text-slate-500 font-mono">
            {{ melodyNotes().length }} melody · {{ harmonyNotes().length }} harmony · {{ totalBeats() }} beats
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button
            (click)="zoomIn()"
            class="px-2 py-1 bg-white/5 border border-white/10 rounded text-[8px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
          >+</button>
          <span class="text-[8px] text-slate-500 font-mono w-8 text-center">{{ zoomLevel() }}x</span>
          <button
            (click)="zoomOut()"
            class="px-2 py-1 bg-white/5 border border-white/10 rounded text-[8px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
          >−</button>
          <button
            (click)="togglePlayback()"
            class="px-3 py-1 rounded text-[8px] font-black uppercase tracking-widest transition-all"
            [class.bg-emerald-500/20]="isPlaying()"
            [class.text-emerald-400]="isPlaying()"
            [class.border-emerald-500/30]="isPlaying()"
            [class.bg-violet-500/10]="!isPlaying()"
            [class.text-violet-400]="!isPlaying()"
            [class.border-violet-500/30]="!isPlaying()"
            class="px-3 py-1 rounded text-[8px] font-black uppercase tracking-widest transition-all border"
          >
            {{ isPlaying() ? '■ Stop' : '▶ Play' }}
          </button>
        </div>
      </div>

      <!-- Legend -->
      <div class="flex items-center gap-4 mb-2 shrink-0 text-[7px] uppercase tracking-widest font-bold">
        <div class="flex items-center gap-1.5">
          <div class="size-2.5 rounded-sm bg-violet-400"></div>
          <span class="text-slate-500">Melody</span>
        </div>
        @for (h of harmonyTypes(); track h) {
          <div class="flex items-center gap-1.5">
            <div class="size-2.5 rounded-sm" [style.background]="harmonyColor(h)"></div>
            <span class="text-slate-500">{{ h }}</span>
          </div>
        }
        <div class="flex items-center gap-1.5 ml-auto">
          <div class="size-2.5 rounded-sm bg-emerald-500/50"></div>
          <span class="text-slate-500">Playhead</span>
        </div>
      </div>

      <!-- Canvas Piano Roll Grid -->
      <div class="piano-roll-scroll overflow-auto custom-scrollbar flex-1 border border-white/5 rounded-xl bg-brand-dark/50">
        <canvas
          #pianoCanvas
          class="block"
          (mousedown)="onCanvasClick($event)"
        ></canvas>
      </div>

      <!-- Controls Row -->
      <div class="flex items-center gap-3 mt-2 shrink-0">
        <div class="flex items-center gap-2">
          <span class="text-[7px] text-slate-600 uppercase tracking-widest font-bold">Velocity:</span>
          <input
            type="range"
            min="20"
            max="127"
            [value]="selectedVelocity()"
            (input)="selectedVelocity.set(+$any($event.target).value)"
            class="w-20 h-1 accent-violet-500"
          />
          <span class="text-[8px] text-slate-400 font-mono w-8">{{ selectedVelocity() }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[7px] text-slate-600 uppercase tracking-widest font-bold">Grid:</span>
          <span class="text-[8px] text-slate-400 font-mono">{{ gridResolution() }}</span>
        </div>
        <button
          (click)="resetView()"
          class="ml-auto px-3 py-1 bg-white/5 border border-white/10 rounded text-[7px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
        >
          Reset View
        </button>
      </div>

      <!-- Note Info Popup -->
      @if (selectedNote(); as note) {
        <div class="mt-2 p-3 bg-brand-dark border border-violet-500/20 rounded-xl shrink-0">
          <div class="flex items-center justify-between mb-1">
            <span class="text-[9px] font-black uppercase tracking-widest text-violet-400">{{ note.noteName }}</span>
            <span class="text-[7px] text-slate-500 font-mono">MIDI {{ note.pitch }}</span>
          </div>
          <div class="grid grid-cols-3 gap-2 text-[8px]">
            <div>
              <span class="text-slate-600 uppercase tracking-widest block">Beat</span>
              <span class="text-slate-300 font-mono">{{ note.startBeat.toFixed(1) }}</span>
            </div>
            <div>
              <span class="text-slate-600 uppercase tracking-widest block">Type</span>
              <span class="text-slate-300">{{ note.type }}</span>
            </div>
            <div>
              <span class="text-slate-600 uppercase tracking-widest block">Word</span>
              <span class="text-slate-300">{{ note.word || '—' }}</span>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .piano-roll-container {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(168,85,247,0.2); border-radius: 2px; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(168,85,247,0.4); }
  `],
})
export class MelodyPianoRollComponent implements AfterViewInit, OnDestroy {
  melodyNotes = input<PianoRollNote[]>([]);
  harmonyNotes = input<PianoRollNote[]>([]);
  harmonyTypes = input<string[]>([]);
  isPlaying = signal(false);
  selectedNote = signal<PianoRollNote | null>(null);
  selectedVelocity = signal(90);
  zoomLevel = signal(1);
  gridResolution = signal('1/4');
  private playheadPosition = signal(0);
  private animationFrame: number | null = null;
  private lastFrameTime = 0;

  pianoCanvas = viewChild<ElementRef<HTMLCanvasElement>>('pianoCanvas');

  totalBeats = computed(() => {
    const allNotes = [...this.melodyNotes(), ...this.harmonyNotes()];
    if (allNotes.length === 0) return 16;
    return Math.max(16, Math.ceil(Math.max(...allNotes.map(n => n.startBeat + n.duration)) / 4) * 4);
  });

  readonly NOTE_COLORS: Record<string, string> = {
    '3rd': '#10b981',
    '5th': '#f59e0b',
    '7th': '#ef4444',
    'octave': '#8b5cf6',
    'unison': '#6b7280',
  };

  readonly NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  harmonyColor(type: string): string {
    return this.NOTE_COLORS[type] || '#a855f7';
  }

  ngAfterViewInit() {
    this.drawCanvas();
  }

  ngOnDestroy() {
    this.stopPlayback();
  }

  private drawCanvas() {
    const canvas = this.pianoCanvas()?.nativeElement;
    if (!canvas) {
      requestAnimationFrame(() => this.drawCanvas());
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const notes = this.melodyNotes();
    const harmony = this.harmonyNotes();
    const allNotes = [...notes, ...harmony];
    if (allNotes.length === 0) {
      canvas.width = 400;
      canvas.height = 200;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, 400, 200);
      ctx.fillStyle = '#475569';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Generate melody to see piano roll', 200, 100);
      return;
    }

    const zoom = this.zoomLevel();
    const CELL_W = 28 * zoom;
    const CELL_H = 18;
    const KEY_W = 40;
    const PADDING = 8;
    const beats = this.totalBeats();
    const playhead = this.playheadPosition();

    // Determine note range
    const minPitch = Math.min(...allNotes.map(n => n.pitch));
    const maxPitch = Math.max(...allNotes.map(n => n.pitch));
    const pitchRange = Math.max(7, maxPitch - minPitch + 3);
    const numRows = pitchRange;

    const canvasW = KEY_W + beats * CELL_W + PADDING;
    const canvasH = numRows * CELL_H + PADDING * 2;

    // Set canvas size with device pixel ratio
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = canvasW + 'px';
    canvas.style.height = canvasH + 'px';
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Draw grid
    for (let beat = 0; beat < beats; beat++) {
      const x = KEY_W + beat * CELL_W;
      ctx.fillStyle = beat % 4 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.015)';
      ctx.fillRect(x, 0, CELL_W, canvasH);

      ctx.strokeStyle = beat % 4 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasH);
      ctx.stroke();

      // Beat numbers
      if (beat % 4 === 0) {
        ctx.fillStyle = 'rgba(148,163,184,0.3)';
        ctx.font = '8px monospace';
        ctx.fillText(`${beat / 4 + 1}`, x + 2, PADDING - 2);
      }
    }

    // Draw piano keys (note labels)
    for (let row = 0; row < numRows; row++) {
      const y = PADDING + row * CELL_H;
      const midiNote = maxPitch - row;
      const noteName = this.midiToNoteName(midiNote);
      const isBlackKey = noteName.includes('#');

      ctx.fillStyle = isBlackKey ? 'rgba(30,41,59,0.4)' : 'rgba(30,41,59,0.2)';
      ctx.fillRect(0, y, KEY_W - 1, CELL_H - 1);

      ctx.fillStyle = isBlackKey ? 'rgba(148,163,184,0.3)' : 'rgba(148,163,184,0.5)';
      ctx.font = '7px monospace';
      ctx.fillText(noteName, 2, y + CELL_H - 4);
    }

    // Draw melody notes
    for (const note of notes) {
      const row = maxPitch - note.pitch;
      if (row < 0 || row >= numRows) continue;
      const x = KEY_W + note.startBeat * CELL_W;
      const y = PADDING + row * CELL_H;
      const w = Math.max(CELL_W * 0.8, note.duration * CELL_W - 2);
      const h = CELL_H - 2;

      const alpha = note.velocity / 127;
      ctx.fillStyle = `rgba(168,85,247,${alpha * 0.8})`;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(168,85,247,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);

      // Velocity bar
      const velBarW = Math.max(2, w * (note.velocity / 127));
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x, y + h - 2, velBarW, 2);
    }

    // Draw harmony notes
    const harmonyColorMap: Record<string, string> = this.NOTE_COLORS;
    for (const note of harmony) {
      const row = maxPitch - note.pitch;
      if (row < 0 || row >= numRows) continue;
      const x = KEY_W + note.startBeat * CELL_W;
      const y = PADDING + row * CELL_H;
      const w = Math.max(CELL_W * 0.8, note.duration * CELL_W - 2);
      const h = CELL_H - 2;

      const color = harmonyColorMap[note.harmonyType || '3rd'] || '#6b7280';
      const alpha = note.velocity / 127;
      ctx.fillStyle = color + Math.round(alpha * 180).toString(16).padStart(2, '0');
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = color + '66';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
    }

    // Draw playhead if playing
    if (this.isPlaying()) {
      const phx = KEY_W + playhead * CELL_W;
      ctx.strokeStyle = 'rgba(16,185,129,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(phx, 0);
      ctx.lineTo(phx, canvasH);
      ctx.stroke();

      // Glow effect
      const gradient = ctx.createLinearGradient(phx - 10, 0, phx + 10, 0);
      gradient.addColorStop(0, 'rgba(16,185,129,0)');
      gradient.addColorStop(0.5, 'rgba(16,185,129,0.15)');
      gradient.addColorStop(1, 'rgba(16,185,129,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(phx - 10, 0, 20, canvasH);
    }
  }

  onCanvasClick(event: MouseEvent) {
    const canvas = this.pianoCanvas()?.nativeElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const zoom = this.zoomLevel();
    const CELL_W = 28 * zoom;
    const CELL_H = 18;
    const KEY_W = 40;
    const PADDING = 8;

    const allNotes = [...this.melodyNotes(), ...this.harmonyNotes()];
    const maxPitch = Math.max(...allNotes.map(n => n.pitch));

    const beat = (x - KEY_W) / CELL_W;
    const row = Math.floor((y - PADDING) / CELL_H);
    const pitch = maxPitch - row;

    // Find the nearest note
    const clicked = allNotes.find(n =>
      Math.abs(n.pitch - pitch) <= 1 &&
      Math.abs(n.startBeat - beat) < 0.5
    );

    this.selectedNote.set(clicked || null);
  }

  togglePlayback() {
    if (this.isPlaying()) {
      this.stopPlayback();
    } else {
      this.startPlayback();
    }
  }

  private startPlayback() {
    this.isPlaying.set(true);
    this.playheadPosition.set(0);
    this.lastFrameTime = performance.now();
    this.animatePlayback();
  }

  private animatePlayback() {
    if (!this.isPlaying()) return;

    const now = performance.now();
    const dt = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;

    const beatsPerSecond = 2; // 120 BPM
    this.playheadPosition.update(p => p + dt * beatsPerSecond);

    if (this.playheadPosition() > this.totalBeats()) {
      this.playheadPosition.set(0);
    }

    this.drawCanvas();

    this.animationFrame = requestAnimationFrame(() => this.animatePlayback());
  }

  private stopPlayback() {
    this.isPlaying.set(false);
    this.playheadPosition.set(0);
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.drawCanvas();
  }

  zoomIn() {
    this.zoomLevel.update(z => Math.min(4, z + 0.5));
    setTimeout(() => this.drawCanvas());
  }

  zoomOut() {
    this.zoomLevel.update(z => Math.max(0.5, z - 0.5));
    setTimeout(() => this.drawCanvas());
  }

  resetView() {
    this.zoomLevel.set(1);
    this.playheadPosition.set(0);
    this.selectedNote.set(null);
    setTimeout(() => this.drawCanvas());
  }

  private midiToNoteName(midi: number): string {
    const octave = Math.floor(midi / 12) - 1;
    const noteIndex = midi % 12;
    return `${this.NOTE_NAMES[noteIndex]}${octave}`;
  }
}
