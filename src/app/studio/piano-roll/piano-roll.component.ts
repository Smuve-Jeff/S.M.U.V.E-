import {
  Component,
  inject,
  signal,
  computed,
  HostListener,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnInit,
  EventEmitter,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MusicManagerService,
  TrackNote,
} from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { AudioSessionService } from '../audio-session.service';
import { InstrumentsService } from '../../services/instruments.service';
import { HistoryService } from '../../services/history.service';
import { AiService } from '../../services/ai.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-piano-roll',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './piano-roll.component.html',
  styleUrls: ['./piano-roll.component.css']
})
export class PianoRollComponent implements OnInit, AfterViewInit {
  public readonly musicManager = inject(MusicManagerService);
  private readonly audioEngine = inject(AudioEngineService);
  public readonly audioSession = inject(AudioSessionService);
  public readonly instrumentsService = inject(InstrumentsService);
  private readonly historyService = inject(HistoryService);
  private readonly aiService = inject(AiService);
  private readonly router = inject(Router);

  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLDivElement>;
  @Output() closeOverlay = new EventEmitter<void>();

  selectedTrackId = this.musicManager.selectedTrackId;
  selectedTrack = computed(() =>
    this.musicManager.tracks().find(t => t.id === this.selectedTrackId())
  );

  rowHeight = 24;
  cellWidth = 32;
  numMeasures = 4;
  stepsPerMeasure = 16;
  availablePresets = this.instrumentsService.getPresets();

  editMode = signal<'draw' | 'select' | 'erase'>('draw');
  selectedNoteIds = signal<Set<string>>(new Set());
  snapToScale = signal(false);
  isCompactMobile = signal(false);
  isAiGenerating = signal(false);
  showAudioDock = signal(false);
  audioDockView = signal<string>('fx');
  newTrackPresetId = signal('poly-synth');
  isStudioOverlay = false;
  isStandalone = false;

  // AI Params
  aiStyle = 'Electronic';
  aiComplexity = 0.5;
  aiTemperature = 1.0;

  scales = [
    { name: 'C Major', notes: [0, 2, 4, 5, 7, 9, 11] },
    { name: 'C Minor', notes: [0, 2, 3, 5, 7, 8, 10] },
    { name: 'G Major', notes: [7, 9, 11, 0, 2, 4, 6] },
  ];
  selectedScale = signal(this.scales[0]);

  selectionBox = signal({
    active: false,
    startX: 0,
    startY: 0,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  gridWidth = 2048;

  ngOnInit() {
    this.checkMobile();
    this.isStandalone = this.router.url.includes('piano-roll');
  }

  ngAfterViewInit() {
    if (this.scrollContainer) {
      this.scrollContainer.nativeElement.scrollTop = (127 - 60) * this.rowHeight - 200;
    }
  }

  @HostListener('window:resize')
  onResize() {
    this.checkMobile();
  }

  checkMobile() {
    if (typeof window !== 'undefined') {
      this.isCompactMobile.set(window.innerWidth < 1024);
    }
  }

  showTrackSidebar() {
      return !this.isCompactMobile();
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

  setEditMode(mode: 'draw' | 'select' | 'erase') {
    this.editMode.set(mode);
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
      this.startSelectionBox(x, y);
    }
  }

  addNoteLocal(midi: number, step: number) {
    const trackId = this.selectedTrackId();
    if (trackId === null) return;
    this.musicManager.addNoteToTrack(trackId, {
      midi,
      step,
      length: 1,
      velocity: 0.8
    });
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
      this.selectedNoteIds.set(new Set([note.id]));
    }
  }

  deleteNote(noteId: string) {
    const trackId = this.selectedTrackId();
    if (trackId === null) return;
    this.musicManager.tracks.update(tracks =>
      tracks.map(t => t.id === trackId ? { ...t, notes: t.notes.filter(n => n.id !== noteId) } : t)
    );
  }

  deleteSelected() {
    this.selectedNoteIds().forEach(id => this.deleteNote(id));
    this.selectedNoteIds.set(new Set());
  }

  transposeSelected(semi: number) {
    const trackId = this.selectedTrackId();
    if (trackId === null) return;
    this.musicManager.tracks.update(tracks =>
      tracks.map(t => {
        if (t.id === trackId) {
          return {
            ...t,
            notes: t.notes.map(n => this.selectedNoteIds().has(n.id) ? { ...n, midi: Math.max(0, Math.min(127, n.midi + semi)) } : n)
          };
        }
        return t;
      })
    );
  }

  quantizeNotes() {
    const trackId = this.selectedTrackId();
    if (trackId === null) return;
    this.musicManager.tracks.update(tracks =>
      tracks.map(t => {
        if (t.id === trackId) {
          return {
            ...t,
            notes: t.notes.map(n => {
              if (this.selectedNoteIds().has(n.id) || this.selectedNoteIds().size === 0) {
                return { ...n, step: Math.round(n.step) };
              }
              return n;
            })
          };
        }
        return t;
      })
    );
  }

  humanizeSelected() {
    const trackId = this.selectedTrackId();
    if (trackId === null) return;
    this.musicManager.tracks.update(tracks =>
      tracks.map(t => {
        if (t.id === trackId) {
          return {
            ...t,
            notes: t.notes.map(n => {
              if (this.selectedNoteIds().has(n.id)) {
                return {
                  ...n,
                  velocity: Math.max(0.1, Math.min(1, n.velocity + (Math.random() * 0.2 - 0.1))),
                  step: Math.max(0, n.step + (Math.random() * 0.1 - 0.05)),
                };
              }
              return n;
            })
          };
        }
        return t;
      })
    );
  }

  duplicateSelected() {
    const trackId = this.selectedTrackId();
    if (trackId === null) return;
    this.musicManager.tracks.update(tracks =>
      tracks.map(t => {
        if (t.id === trackId) {
          const selectedNotes = t.notes.filter(n => this.selectedNoteIds().has(n.id));
          const newNotes = selectedNotes.map(n => ({
            ...n,
            id: Math.random().toString(36).substring(7),
            step: n.step + 1,
          }));
          return { ...t, notes: [...t.notes, ...newNotes] };
        }
        return t;
      })
    );
  }

  duplicateNextBar() {
    const trackId = this.selectedTrackId();
    if (trackId === null) return;
    this.musicManager.tracks.update(tracks =>
      tracks.map(t => {
        if (t.id === trackId) {
          const newNotes = t.notes.map(n => ({
            ...n,
            id: Math.random().toString(36).substring(7),
            step: n.step + 16,
          }));
          return { ...t, notes: [...t.notes, ...newNotes] };
        }
        return t;
      })
    );
  }

  adjustSelectedVelocity(delta: number) {
    const trackId = this.selectedTrackId();
    if (trackId === null) return;
    this.musicManager.tracks.update(tracks =>
      tracks.map(t => {
        if (t.id === trackId) {
          return {
            ...t,
            notes: t.notes.map(n => this.selectedNoteIds().has(n.id) ? { ...n, velocity: Math.max(0, Math.min(1, n.velocity + delta)) } : n)
          };
        }
        return t;
      })
    );
  }

  adjustSelectedLength(delta: number) {
    const trackId = this.selectedTrackId();
    if (trackId === null) return;
    this.musicManager.tracks.update(tracks =>
      tracks.map(t => {
        if (t.id === trackId) {
          return {
            ...t,
            notes: t.notes.map(n => this.selectedNoteIds().has(n.id) ? { ...n, length: Math.max(0.25, n.length + delta) } : n)
          };
        }
        return t;
      })
    );
  }

  nudgeSelectedOctave(delta: number) {
    this.transposeSelected(delta * 12);
  }

  applyVelocityCurve(type: string) {}
  setSelectedNoteProbability(event: any) {}

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

      this.selectionBox.update(b => ({
        ...b,
        x: Math.min(currentX, b.startX),
        y: Math.min(currentY, b.startY),
        width: Math.abs(currentX - b.startX),
        height: Math.abs(currentY - b.startY)
      }));
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
      if (noteX < box.x + box.width && noteX + this.cellWidth > box.x &&
          noteY < box.y + box.height && noteY + this.rowHeight > box.y) {
        newSelection.add(note.id);
      }
    });
    this.selectedNoteIds.set(newSelection);
  }

  getSelectionBoxTransform() {
    const box = this.selectionBox();
    return `translate(${box.x}px, ${box.y}px)`;
  }

  togglePlay() {
    this.audioSession.togglePlay();
  }

  goStandalone() {
    this.router.navigate(['/piano-roll']);
  }

  generateSequence(type: string) {
    this.isAiGenerating.set(true);
    setTimeout(() => this.isAiGenerating.set(false), 1500);
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

  getVisibleNotes(track: any) {
    return track.notes || [];
  }

  isInScale(midi: number) {
    return this.selectedScale().notes.includes(midi % 12);
  }
}
