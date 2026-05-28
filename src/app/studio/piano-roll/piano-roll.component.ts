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
  rowHeight = computed(() => (this.isMobile() ? 48 : 24) * this.touchGestures.zoomLevel());
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
    return this.musicManager.tracks().filter(t => t.id !== currentId).flatMap(t => t.notes.map(n => ({ ...n, trackColor: t.color })));
  });

  viewportNotes = computed(() => this.selectedTrack()?.notes || []);

  ngOnInit() { this.checkMobile(); }

  ngAfterViewInit() {
    if (this.scrollContainer) {
      this.scrollContainer.nativeElement.scrollTop = (127 - 60) * this.rowHeight() - 200;
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
      this.musicManager.addNoteToTrack(this.selectedTrack()!.id, { midi, step, length: 1, velocity: 0.8 });
    }
  }

  onNoteMouseDown(e: MouseEvent, note: TrackNote) {
    e.stopPropagation();
    if (this.editMode() === 'select') {
      const next = new Set(this.selectedNoteIds());
      if (e.shiftKey) { next.has(note.id) ? next.delete(note.id) : next.add(note.id); }
      else { next.clear(); next.add(note.id); }
      this.selectedNoteIds.set(next);
    } else if (this.editMode() === 'erase') {
      this.musicManager.removeNotes(this.selectedTrack()!.id, [note.id]);
    }
  }

  isBlackKey(midi: number) { return [1, 3, 6, 8, 10].includes(midi % 12); }
  getKeyName(midi: number) { return ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][midi % 12]; }
  getDisplayKeys() { return Array.from({ length: 128 }, (_, i) => 127 - i); }
  setEditMode(mode: 'draw' | 'select' | 'erase') { this.editMode.set(mode); }
  quantizeNotes() { if (this.selectedTrack()) this.musicManager.quantizeTrack(this.selectedTrack()!.id); }
  deleteSelected() { if (this.selectedTrack()) this.musicManager.removeNotes(this.selectedTrack()!.id, Array.from(this.selectedNoteIds())); }
  duplicateSelected() { if (this.selectedTrack()) this.musicManager.duplicateNotes(this.selectedTrack()!.id, Array.from(this.selectedNoteIds()), 1); }
  adjustSelectedVelocity(delta: number) { /* logic */ }
  setSelectedNoteProbability(e: any) { /* logic */ }
  toggleLocalPlay() { this.isLocalPlaying.update(v => !v); }
  toggleLocalRecord() { this.isLocalRecording.update(v => !v); }
  localSkip() { console.log('skip'); }
  localUpload() { console.log('upload'); }
}
