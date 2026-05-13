import { Component, inject, signal, EventEmitter, Output, OnInit, HostListener, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MusicManagerService, TrackNote } from '../../services/music-manager.service';
import { HistoryService } from '../../services/history.service';
import { AiService } from '../../services/ai.service';
import { AudioSessionService } from '../audio-session.service';
import { InstrumentsService } from '../../services/instruments.service';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-piano-roll',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './piano-roll.component.html',
  styleUrls: ['./piano-roll.component.css']
})
export class PianoRollComponent implements OnInit {
  musicManager = inject(MusicManagerService);
  historyService = inject(HistoryService);
  aiService = inject(AiService);
  audioSession = inject(AudioSessionService);
  instrumentsService = inject(InstrumentsService);
  router = inject(Router);

  @Output() closeOverlay = new EventEmitter<void>();
  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLDivElement>;

  selectedTrack = signal<any>(null);
  selectedNoteIds = signal<Set<string>>(new Set());
  editMode = signal('draw');
  showAudioDock = signal(false);
  audioDockView = signal('mixer');
  showTrackSidebar = signal(true);
  soundBrowserOpen = signal(false);
  quantizeStrength = signal(1);
  selectedSnap = signal(1);
  snapToScale = signal(false);
  selectedScale = signal({ notes: [0, 2, 4, 5, 7, 9, 11] });
  newTrackPresetId = signal('default');
  isStudioOverlay = signal(false);
  isStandalone = signal(false);
  selectionBox = signal({ active: false, x: 0, y: 0, w: 0, h: 0 });

  aiStyle = 'Electronic';
  aiComplexity = 0.5;
  aiTemperature = 1.0;
  isAiGenerating = signal(false);

  gridWidth = 1280;
  cellWidth = 40;
  rowHeight = 24;
  numMeasures = 4;
  stepsPerMeasure = 16;
  availablePresets: any[] = [];

  ngOnInit() {
    this.availablePresets = this.instrumentsService.getPresets();
    const tracks = this.musicManager.tracks();
    if (tracks.length > 0) {
      this.selectTrack(tracks[0]);
    }
  }

  selectTrack(track: any) {
    this.selectedTrack.set(track);
    this.musicManager.selectedTrackId.set(track.id);
  }

  addTrack() {
    const id = Date.now();
    const newTrack = {
      id,
      name: 'New Track ' + (this.musicManager.tracks().length + 1),
      instrumentId: this.newTrackPresetId(),
      type: 'midi' as const,
      color: '#10b981',
      notes: [],
      clips: [],
      gain: 0.8,
      pan: 0,
      sendA: 0,
      sendB: 0,
      fxSlots: [],
      mute: false,
      solo: false,
      steps: new Array(64).fill(false)
    };
    this.musicManager.tracks.update(ts => [...ts, newTrack]);
    this.selectTrack(newTrack);
  }

  removeTrack(id: number) {
    this.musicManager.tracks.update(ts => ts.filter(t => t.id !== id));
    if (this.selectedTrack()?.id === id) {
      this.selectedTrack.set(null);
    }
  }

  getVisibleNotes(track: any): TrackNote[] {
    return track.notes || [];
  }

  togglePlay() {
    this.audioSession.togglePlay();
  }

  toggleTrackSidebar() {
    this.showTrackSidebar.update(v => !v);
  }

  goStandalone() {
    this.isStandalone.set(true);
    this.router.navigate(['/piano-roll']);
  }

  setEditMode(mode: string) {
    this.editMode.set(mode);
  }

  async generateSequence(type: string) {
    if (!this.selectedTrack()) return;
    this.isAiGenerating.set(true);

    const prompt = `Generate a MIDI ${type} in ${this.aiStyle} style. Complexity: ${this.aiComplexity}. Return 4 bars of notes as JSON.`;
    const res = await this.aiService.getAIResponse(prompt);

    // Simulate applying AI notes
    const newNotes: TrackNote[] = [
      { id: 'n1', midi: 60, step: 0, length: 2, velocity: 0.8 },
      { id: 'n2', midi: 64, step: 4, length: 2, velocity: 0.7 },
      { id: 'n3', midi: 67, step: 8, length: 4, velocity: 0.9 },
    ];

    this.musicManager.tracks.update(ts => ts.map(t => {
      if (t.id === this.selectedTrack().id) {
        return { ...t, notes: [...t.notes, ...newNotes] };
      }
      return t;
    }));

    this.isAiGenerating.set(false);
  }

  quantizeNotes() {
    if (!this.selectedTrack()) return;
    this.musicManager.tracks.update(ts => ts.map(t => {
      if (t.id === this.selectedTrack().id) {
        const quantized = t.notes.map(n => ({ ...n, step: Math.round(n.step) }));
        return { ...t, notes: quantized };
      }
      return t;
    }));
  }

  humanizeSelected() {
    if (!this.selectedTrack()) return;
    this.musicManager.tracks.update(ts => ts.map(t => {
      if (t.id === this.selectedTrack().id) {
        const humanized = t.notes.map(n => ({
          ...n,
          velocity: Math.min(1, Math.max(0.1, n.velocity + (Math.random() - 0.5) * 0.1)),
          step: n.step + (Math.random() - 0.5) * 0.05
        }));
        return { ...t, notes: humanized };
      }
      return t;
    }));
  }

  deleteSelected() {
    const ids = this.selectedNoteIds();
    if (ids.size === 0 || !this.selectedTrack()) return;
    this.musicManager.tracks.update(ts => ts.map(t => {
      if (t.id === this.selectedTrack().id) {
        return { ...t, notes: t.notes.filter(n => !ids.has(n.id)) };
      }
      return t;
    }));
    this.selectedNoteIds.set(new Set());
  }

  duplicateSelected() {
    // Basic implementation
    this.selectedNoteIds.set(new Set());
  }

  duplicateNextBar() {}

  onGridMouseDown(e: MouseEvent) {
    if (this.editMode() === 'draw' && this.selectedTrack()) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const step = Math.floor(x / this.cellWidth);
      const midi = 127 - Math.floor(y / this.rowHeight);

      const newNote: TrackNote = {
        id: 'note-' + Date.now(),
        midi,
        step,
        length: 1,
        velocity: 0.8
      };

      this.musicManager.tracks.update(ts => ts.map(t => {
        if (t.id === this.selectedTrack().id) {
          return { ...t, notes: [...t.notes, newNote] };
        }
        return t;
      }));
    }
  }

  onNoteMouseDown(e: MouseEvent, note: TrackNote) {
    e.stopPropagation();
    if (this.editMode() === 'select') {
      const next = new Set(this.selectedNoteIds());
      if (e.shiftKey) {
        next.has(note.id) ? next.delete(note.id) : next.add(note.id);
      } else {
        next.clear();
        next.add(note.id);
      }
      this.selectedNoteIds.set(next);
    } else if (this.editMode() === 'draw') {
        // Delete note on click in draw mode if desired, or just select
        this.selectedNoteIds.set(new Set([note.id]));
    }
  }

  isBlackKey(midi: number) {
    const n = midi % 12;
    return [1, 3, 6, 8, 10].includes(n);
  }

  getKeyName(midi: number) {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return names[midi % 12];
  }

  getDisplayKeys() {
    return Array.from({ length: 128 }, (_, i) => 127 - i);
  }

  isInScale(midi: number) {
    return this.selectedScale().notes.includes(midi % 12);
  }

  getSelectionBoxTransform() {
    const b = this.selectionBox();
    return `translate(${b.x}px, ${b.y}px)`;
  }

  transposeSelected(semitones: number) {}
  adjustSelectedVelocity(delta: number) {}
  adjustSelectedLength(delta: number) {}
  nudgeSelectedOctave(delta: number) {}
  setSelectedNoteProbability(e: any) {}
  applyVelocityCurve(type: string) {}
}
