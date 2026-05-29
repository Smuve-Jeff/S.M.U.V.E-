import { Component, inject, signal, computed, OnInit, AfterViewInit, ViewChild, ElementRef, HostListener, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import { KnobComponent } from '../shared/knob/knob.component';
import { MusicManagerService, TrackNote, TrackModel } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { InstrumentsService } from '../../services/instruments.service';
import { HistoryService } from '../../services/history.service';
import { AiService } from '../../services/ai.service';
import { Router } from '@angular/router';
import { TouchGestureService } from '../../services/touch-gesture.service';

@Component({
  selector: 'app-piano-roll',
  standalone: true,
  imports: [CommonModule, FormsModule, KnobComponent],
  templateUrl: './piano-roll.component.html',
  styleUrls: ['./piano-roll.component.css'],
})
export class PianoRollComponent implements OnInit, AfterViewInit {
  public readonly musicManager = inject(MusicManagerService);
  public readonly audioSession = inject(AudioSessionService);
  private readonly audioEngine = inject(AudioEngineService);
  public readonly instrumentsService = inject(InstrumentsService);
  private readonly history = inject(HistoryService);
  private readonly aiService = inject(AiService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly touchGestures = inject(TouchGestureService);

  @Output() close = new EventEmitter<void>();
  @Output() closeOverlay = new EventEmitter<void>();
  @ViewChild('scrollContainer') scrollContainer!: ElementRef;

  selectedTrack = computed(() => this.musicManager.tracks().find((t) => t.id === this.musicManager.selectedTrackId()) || null);
  editMode = signal<'draw' | 'select' | 'erase'>('draw');
  selectedNoteIds = signal<Set<string>>(new Set());

  isLocalPlayback = signal(false);
  isLocalPlaying = signal(false);
  isLocalRecording = signal(false);

  windowWidth = signal(typeof window !== 'undefined' ? window.innerWidth : 1280);
  rowHeight = computed(() => (this.isMobile() ? 40 : 24) * this.touchGestures.zoomLevel());
  cellWidth = computed(() => (this.windowWidth() < 1201 ? 32 : 40) * this.touchGestures.zoomLevel());

  numMeasures = 4;
  cells: any[] = new Array(64).fill(0);
  showGhostNotes = signal(true);
  gridWidth = 1600;
  snapToScale = signal(false);
  isMobile = signal(false);

  ghostNotes = computed(() => {
    if (!this.showGhostNotes()) return [];
    const currentId = this.musicManager.selectedTrackId();
    return this.musicManager.tracks()
      .filter(t => t.id !== currentId)
      .flatMap(t => t.notes.map(n => ({ ...n, trackColor: t.color })));
  });

  viewportNotes = computed(() => this.selectedTrack()?.notes || []);

  ngOnInit() { this.checkMobile(); }

  ngAfterViewInit() {
    if (this.scrollContainer) {
      const top = (127 - 60) * this.rowHeight() - 100;
      this.scrollContainer.nativeElement.scrollTop = Math.max(0, top);
    }
    this.cdr.detectChanges();
  }

  @HostListener('window:resize')
  checkMobile() {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1280;
    this.windowWidth.set(width);
    this.isMobile.set(width < 768);
  }

  onGridMouseDown(e: MouseEvent) {
    if (this.editMode() === 'draw' && this.selectedTrack()) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const step = Math.floor(x / this.cellWidth());
      const midi = 127 - Math.floor(y / this.rowHeight());

      this.musicManager.addNoteToTrack(this.selectedTrack()!.id, {
        midi,
        step,
        length: 1,
        velocity: 0.8
      });
    }
  }

  onNoteMouseDown(e: MouseEvent, note: TrackNote) {
    e.stopPropagation();
    if (this.editMode() === 'select') {
      const next = new Set(this.selectedNoteIds());
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        next.has(note.id) ? next.delete(note.id) : next.add(note.id);
      } else {
        next.clear();
        next.add(note.id);
      }
      this.selectedNoteIds.set(next);
    } else if (this.editMode() === 'erase') {
      this.musicManager.removeNotes(this.selectedTrack()!.id, [note.id]);
    }
  }

  isBlackKey(midi: number) { return [1, 3, 6, 8, 10].includes(midi % 12); }
  getKeyName(midi: number) { return ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][midi % 12]; }
  getDisplayKeys() { return Array.from({ length: 128 }, (_, i) => 127 - i); }

  setEditMode(mode: 'draw' | 'select' | 'erase') { this.editMode.set(mode); }

  quantizeNotes() {
    if (this.selectedTrack()) this.musicManager.quantizeTrack(this.selectedTrack()!.id);
  }

  deleteSelected() {
    if (this.selectedTrack() && this.selectedNoteIds().size > 0) {
      this.musicManager.removeNotes(this.selectedTrack()!.id, Array.from(this.selectedNoteIds()));
      this.selectedNoteIds.set(new Set());
    }
  }

  duplicateSelected() {
    if (this.selectedTrack() && this.selectedNoteIds().size > 0) {
      this.musicManager.duplicateNotes(this.selectedTrack()!.id, Array.from(this.selectedNoteIds()), 1);
    }
  }

  adjustSelectedVelocity(delta: number) {
    const trackId = this.musicManager.selectedTrackId();
    if (!trackId) return;
    this.selectedNoteIds().forEach(noteId => {
      const note = this.selectedTrack()?.notes.find(n => n.id === noteId);
      if (note) {
        const newVel = Math.max(0.1, Math.min(1.5, note.velocity + delta));
        this.musicManager.setNoteParam(trackId, noteId, 'velocity', newVel);
      }
    });
  }

  setSelectedNoteProbability(e: any) {
    const trackId = this.musicManager.selectedTrackId();
    if (!trackId) return;
    const value = e.target ? e.target.value : e;
    this.selectedNoteIds().forEach(noteId => {
      this.musicManager.setNoteParam(trackId, noteId, 'probability', value);
    });
  }

  toggleSelectedSlide() {
    const trackId = this.musicManager.selectedTrackId();
    if (!trackId) return;
    this.selectedNoteIds().forEach(noteId => {
      const note = this.selectedTrack()?.notes.find(n => n.id === noteId);
      if (note) {
        this.musicManager.setNoteParam(trackId, noteId, 'isSlide', !note.isSlide);
      }
    });
  }

  hasSelectedSlide(): boolean {
    const ids = Array.from(this.selectedNoteIds());
    if (ids.length === 0) return false;
    const note = this.selectedTrack()?.notes.find(n => n.id === ids[0]);
    return !!note?.isSlide;
  }

  strumNotes() {
    if (this.selectedTrack()) this.musicManager.strumTrack(this.selectedTrack()!.id);
  }

  humanizeNotes() {
    if (this.selectedTrack()) this.musicManager.humanizeTrack(this.selectedTrack()!.id);
  }

  arpeggiateNotes() {
    if (this.selectedTrack()) this.musicManager.arpeggiateTrack(this.selectedTrack()!.id);
  }

  toggleLocalPlay() { this.isLocalPlaying.update(v => !v); }
  toggleLocalRecord() { this.isLocalRecording.update(v => !v); }
  localSkip() { console.log('skip'); }
}
