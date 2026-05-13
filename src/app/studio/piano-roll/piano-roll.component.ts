import { Component, inject, signal, EventEmitter, Output, OnInit, HostListener, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MusicManagerService, TrackNote } from '../../services/music-manager.service';
import { Component, inject, signal, EventEmitter, Output, computed, HostListener, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MusicManagerService, TrackNote } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { AudioSessionService } from '../audio-session.service';
import { InstrumentsService } from '../../services/instruments.service';
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
  styleUrl: './piano-roll.component.css'
})
export class PianoRollComponent implements AfterViewInit {
  musicManager = inject(MusicManagerService);
  engine = inject(AudioEngineService);
  audioSession = inject(AudioSessionService);
  instrumentsService = inject(InstrumentsService);
  historyService = inject(HistoryService);
  aiService = inject(AiService);
  audioSession = inject(AudioSessionService);
  instrumentsService = inject(InstrumentsService);
  router = inject(Router);

  @Output() closeOverlay = new EventEmitter<void>();
  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLDivElement>;

  selectedTrackId = this.musicManager.selectedTrackId;
  selectedTrack = computed(() => this.musicManager.tracks().find(t => t.id === this.selectedTrackId()));

  selectedNoteIds = signal<Set<string>>(new Set());
  editMode = signal<'draw' | 'select' | 'erase'>('draw');

  // Grid Config
  rowHeight = 24;
  cellWidth = 32;
  numMeasures = 4;
  stepsPerMeasure = 16;
  totalSteps = computed(() => this.numMeasures * this.stepsPerMeasure);
  gridWidth = computed(() => this.totalSteps() * this.cellWidth);

  availablePresets = this.instrumentsService.getPresets();
  newTrackPresetId = signal('grand-piano');

  isAiGenerating = signal(false);
  aiStyle = signal('Electronic');
  aiComplexity = signal(0.7);
  aiTemperature = signal(1.0);

  selectionBox = signal({ active: false, startX: 0, startY: 0, x: 0, y: 0, width: 0, height: 0 });

  isCompactMobile = signal(false);
  snapToScale = signal(false);
  showAudioDock = signal(false);
  audioDockView = signal('mixer');
  isStudioOverlay = signal(false);
  isStandalone = signal(false);
  showTrackSidebar = signal(true);
  soundBrowserOpen = signal(false);
  quantizeStrength = signal(1);
  selectedSnap = signal(1);
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
  cells: any[] = new Array(64).fill(0);
  Math = Math;

  ngAfterViewInit() {
    if (this.scrollContainer) {
      this.scrollContainer.nativeElement.scrollTop = (127 - 60) * this.rowHeight - 200;
    }
    this.checkMobile();
  }

  getDisplayKeys() {
    return Array.from({ length: 128 }, (_, i) => 127 - i);
  }

  isBlackKey(midi: number) {
    const note = midi % 12;
    return [1, 3, 6, 8, 10].includes(note);
  }

  getKeyName(midi: number) {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return names[midi % 12];
  }

  getVisibleNotes(track: any) {
    return track.notes || [];
  }

  setEditMode(mode: 'draw' | 'select' | 'erase') {
    this.editMode.set(mode);
  }

  selectTrack(track: any) {
    this.musicManager.selectedTrackId.set(track.id);
    this.selectedNoteIds.set(new Set());
  }

  addTrack() {
    const id = this.musicManager.ensureTrack(this.newTrackPresetId());
    if (id) this.musicManager.selectedTrackId.set(id);
    return id;
  }

  removeTrack(id: number) {
    this.musicManager.removeTrack(id);
    this.selectedNoteIds.set(new Set());
  }

  onGridMouseDown(event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const step = Math.floor(x / this.cellWidth);
    let midi = 127 - Math.floor(y / this.rowHeight);

    if (this.snapToScale()) {
       const scale = this.selectedScale().notes;
       while (!scale.includes(midi % 12)) midi--;
    }

    if (this.editMode() === 'draw') {
      this.addNoteLocal(midi, step);
    } else if (this.editMode() === 'select') {
      if (!event.shiftKey) this.selectedNoteIds.set(new Set());
      this.startSelectionBox(x, y);
    }
  }

  addNoteLocal(midi: number, step: number) {
    const trackId = this.selectedTrackId();
    if (trackId === null) return;

    if ((this.musicManager as any).addNote) {
       (this.musicManager as any).addNote(trackId, midi, step);
       return;
    }

    const newNote: TrackNote = {
      id: Math.random().toString(36).substring(7),
      midi,
      step,
      length: 1,
      velocity: 0.8
    };
    this.musicManager.tracks.update(tracks => tracks.map(t => {
      if (t.id === trackId) return { ...t, notes: [...t.notes, newNote] };
      return t;
    }));
    this.engine.triggerAttack(trackId, this.musicManager.midiToFreq(midi), this.engine.getContext().currentTime, 0.8, 0.2, 1, 0, 0, 0, { type: 'sine' }, 1);
  }

  onNoteMouseDown(event: MouseEvent, note: TrackNote) {
    event.stopPropagation();
    if (this.editMode() === 'erase') {
      this.deleteNote(note.id);
      return;
    }
    if (event.shiftKey) {
      this.selectedNoteIds.update(ids => {
        const next = new Set(ids);
        if (next.has(note.id)) next.delete(note.id);
        else next.add(note.id);
        return next;
      });
    } else {
      if (!this.selectedNoteIds().has(note.id)) {
        this.selectedNoteIds.set(new Set([note.id]));
      }
    }
  }

  deleteNote(noteId: string) {
    const trackId = this.selectedTrackId();
    if (trackId === null) return;

    if ((this.musicManager as any).deleteNoteById) {
       (this.musicManager as any).deleteNoteById(noteId);
       return;
    }

    this.musicManager.tracks.update(tracks => tracks.map(t => {
      if (t.id === trackId) return { ...t, notes: t.notes.filter(n => n.id !== noteId) };
      return t;
    }));
    this.selectedNoteIds.update(ids => {
      const next = new Set(ids);
      next.delete(noteId);
      return next;
    });
  }

  deleteSelected() {
    this.selectedNoteIds().forEach(id => this.deleteNote(id));
  }

  transposeSelected(semi: number) {
    const trackId = this.selectedTrackId();
    if (trackId === null) return;

    this.musicManager.tracks.update(tracks => tracks.map(t => {
      if (t.id === trackId) {
        return {
          ...t,
          notes: t.notes.map(n => {
            if (this.selectedNoteIds().has(n.id)) {
              let newMidi = Math.max(0, Math.min(127, n.midi + semi));
              if (this.snapToScale()) {
                 const scale = this.selectedScale().notes;
                 while (!scale.includes(newMidi % 12)) newMidi--;
              }
              if ((this.musicManager as any).updateNote) {
                 (this.musicManager as any).updateNote(trackId, n.id, { midi: newMidi });
              }
              return { ...n, midi: newMidi };
            }
            return n;
          })
        };
      }
      return t;
    }));
  }

  quantizeNotes() {
    const trackId = this.selectedTrackId();
    if (trackId === null) return;
    this.musicManager.tracks.update(tracks => tracks.map(t => {
      if (t.id === trackId) {
        return {
          ...t,
          notes: t.notes.map(n => {
             if (this.selectedNoteIds().has(n.id) || this.selectedNoteIds().size === 0) {
               const newStep = Math.round(n.step);
               if ((this.musicManager as any).updateNote) {
                 (this.musicManager as any).updateNote(trackId, n.id, { step: newStep });
               }
               return { ...n, step: newStep };
             }
             return n;
          })
        };
      }
      return t;
    }));
  }

  startSelectionBox(x: number, y: number) {
    this.selectionBox.set({ active: true, startX: x, startY: y, x, y, width: 0, height: 0 });
  }

  @HostListener('window:mousemove', [''])
  onWindowMouseMove(event: MouseEvent) {
    if (this.selectionBox().active) {
      const container = document.querySelector('.grid-content');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const currentX = event.clientX - rect.left;
      const currentY = event.clientY - rect.top;
      const box = this.selectionBox();
      const x = Math.min(currentX, box.startX);
      const y = Math.min(currentY, box.startY);
      const width = Math.abs(currentX - box.startX);
      const height = Math.abs(currentY - box.startY);
      this.selectionBox.update(b => ({ ...b, x, y, width, height }));
      this.updateSelection();
    }
  }

  @HostListener('window:mouseup')
  onWindowMouseUp() {
    this.selectionBox.update(b => ({ ...b, active: false }));
  }

  updateSelection() {
    const track = this.selectedTrack();
    if (!track) return;
    const box = this.selectionBox();
    const newSelection = new Set<string>();
    track.notes.forEach(note => {
      const noteX = note.step * this.cellWidth;
      const noteY = (127 - note.midi) * this.rowHeight;
      const noteWidth = note.length * this.cellWidth;
      const noteHeight = this.rowHeight;
      if (noteX < box.x + box.width && noteX + noteWidth > box.x && noteY < box.y + box.height && noteY + noteHeight > box.y) {
        newSelection.add(note.id);
      }
    });
    this.selectedNoteIds.set(newSelection);
  }

  arrangementBars() {
    return Array.from({ length: this.numMeasures }, (_, i) => ({
      index: i,
      noteCount: this.selectedTrack()?.notes.filter(n => Math.floor(n.step / 16) === i).length || 0
    }));
  }

  setSelectedNoteLength(length: number) {
    const trackId = this.selectedTrackId();
    if (trackId === null) return;
    this.musicManager.tracks.update(ts => ts.map(t => {
      if (t.id === trackId) {
        return {
          ...t,
          notes: t.notes.map(n => {
            if (this.selectedNoteIds().has(n.id)) {
              const newLen = Math.max(1, length);
              if ((this.musicManager as any).updateNote) {
                (this.musicManager as any).updateNote(trackId, n.id, { length: newLen });
              }
              return { ...n, length: newLen };
            }
            return n;
          })
        };
      }
      return t;
    }));
  }

  setAudioDockView(view: string) {
    this.audioDockView.set(view);
    this.showAudioDock.set(true);
  }

  toggleAudioDock() {
    this.showAudioDock.update(v => !v);
  }

  setPatternLength(measures: number) {
    this.numMeasures = Math.max(1, Math.min(16, measures));
    this.cells = new Array(this.numMeasures * 16).fill(0);
  }

  replaceTrackInstrument(track: any, presetId: string) {
    this.musicManager.setInstrument(track.id, presetId);
  }

  checkMobile() {
    if (typeof window !== 'undefined') {
      if (window.innerWidth < 1024) {
        this.cellWidth = 32;
        this.isCompactMobile.set(true);
      } else {
        this.cellWidth = 32;
        this.isCompactMobile.set(false);
      }
    }
  }

  togglePlay() {
    this.audioSession.togglePlay();
  }

  generateSequence(type: string) {
    this.isAiGenerating.set(true);
    setTimeout(() => this.isAiGenerating.set(false), 1500);
  }

  humanizeSelected() {
    const trackId = this.selectedTrackId();
    if (trackId === null) return;
    this.musicManager.tracks.update(tracks => tracks.map(t => {
      if (t.id === trackId) {
        return {
          ...t,
          notes: t.notes.map(n => {
            if (this.selectedNoteIds().has(n.id)) {
              return {
                ...n,
                velocity: Math.max(0.1, Math.min(1, n.velocity + (Math.random() * 0.2 - 0.1))),
                step: Math.max(0, n.step + (Math.random() * 0.1 - 0.05))
              };
            }
            return n;
          })
        };
      }
      return t;
    }));
  }

  duplicateSelected() {
    const trackId = this.selectedTrackId();
    if (trackId === null) return;
    this.musicManager.tracks.update(tracks => tracks.map(t => {
      if (t.id === trackId) {
        const selectedNotes = t.notes.filter(n => this.selectedNoteIds().has(n.id));
        const newNotes = selectedNotes.map(n => ({
          ...n,
          id: Math.random().toString(36).substring(7),
          step: n.step + 1
        }));
        return { ...t, notes: [...t.notes, ...newNotes] };
      }
      return t;
    }));
  }

  duplicateNextBar() {
     const trackId = this.selectedTrackId();
     if (trackId === null) return;
     const track = this.selectedTrack();
     if (!track) return;
     const selectedNotes = track.notes.filter(n => this.selectedNoteIds().has(n.id));
     selectedNotes.forEach(n => {
        this.addNoteLocal(n.midi, n.step + 16);
     });
  }

  adjustSelectedVelocity(delta: number) {
    const trackId = this.selectedTrackId();
    if (trackId === null) return;
    this.musicManager.tracks.update(tracks => tracks.map(t => {
      if (t.id === trackId) {
        return {
          ...t,
          notes: t.notes.map(n => this.selectedNoteIds().has(n.id) ? { ...n, velocity: Math.max(0, Math.min(1, n.velocity + delta)) } : n)
        };
      }
      return t;
    }));
  }

  adjustSelectedLength(delta: number) {
    const trackId = this.selectedTrackId();
    if (trackId === null) return;
    this.musicManager.tracks.update(tracks => tracks.map(t => {
      if (t.id === trackId) {
        return {
          ...t,
          notes: t.notes.map(n => this.selectedNoteIds().has(n.id) ? { ...n, length: Math.max(0.25, n.length + delta) } : n)
        };
      }
      return t;
    }));
  }

  nudgeSelectedOctave(delta: number) { this.transposeSelected(delta * 12); }
  applyVelocityCurve(type: string) {}
  setSelectedNoteProbability(event: any) {}
  isInScale(midi: number) { return true; }
  goStandalone() {}
  getSelectionBoxTransform() {
    const box = this.selectionBox();
    return `translate(${box.x}px, ${box.y}px)`;
  }
  isBlackKeyById(midi: number) { return this.isBlackKey(midi); }
  getKeyNameById(midi: number) { return this.getKeyName(midi); }
}
