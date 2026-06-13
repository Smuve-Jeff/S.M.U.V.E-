import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import { KnobComponent } from '../shared/knob/knob.component';
import {
  MusicManagerService,
  PerformerScene,
  TrackModel,
  TrackNote,
} from '../../services/music-manager.service';
import { LiveEngineService } from '../../services/live-engine.service';
import { HapticService } from '../../services/haptic.service';
import {
  InstrumentsService,
  InstrumentPreset,
} from '../../services/instruments.service';
import { PerformanceGridComponent } from '../performance-grid/performance-grid.component';

@Component({
  selector: 'app-performer',
  standalone: true,
  imports: [CommonModule, FormsModule, KnobComponent, PerformanceGridComponent],
  templateUrl: './performer.component.html',
  styleUrls: ['./performer.component.css'],
})
export class PerformerComponent {
  public readonly audioSession = inject(AudioSessionService);
  public readonly musicManager = inject(MusicManagerService);
  public readonly liveEngine = inject(LiveEngineService);
  private readonly haptic = inject(HapticService);
  private readonly instrumentsService = inject(InstrumentsService);

  layout = signal<'keyboard' | 'pads' | 'matrix'>('keyboard');
  private readonly PATTERN_STEPS = 64;
  scenes = this.musicManager.performerScenes;
  smartChords = signal(false);
  velocity = 0.8;
  octave = signal(0);
  activeKeys = signal<Set<number>>(new Set());
  availableInstruments = signal<InstrumentPreset[]>([]);
  activeInstrumentId = this.liveEngine.activeInstrument;
  pitchBend = signal(0);
  selectedTrack = computed(() => this.musicManager.tracks().find(t => t.id === this.musicManager.selectedTrackId()));
  modWheel = signal(0);

  private readonly activePointers = new Map<number, number>();
  private readonly recordingNotes = new Map<number, { id: string, startStep: number }>();

  keyboardKeys = this.generateKeyboardKeys();
  performerPads = this.generatePads();

  constructor() {
    this.availableInstruments.set(this.instrumentsService.getPresets());
  }

  generateKeyboardKeys() {
    const keys = [];
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    // 2 octaves + 1 note
    for (let i = 0; i < 25; i++) {
      const midi = 48 + i;
      keys.push({
        midi,
        name: "" + names[midi % 12] + (Math.floor(midi / 12) - 1),
      });
    }
    return keys;
  }

  generatePads() {
    const pads = [];
    const colors = ['#f43f5e', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9'];
    for (let i = 0; i < 16; i++) {
      pads.push({
        midi: 36 + i,
        name: 'Pad ' + (i + 1),
        color: colors[i % colors.length],
      });
    }
    return pads;
  }

  isBlackKey(midi: number): boolean { return [1, 3, 6, 8, 10].includes(midi % 12); }
  setLayout(mode: 'keyboard' | 'pads' | 'matrix') { this.layout.set(mode); }
  toggleSmartChords() { this.smartChords.update((value) => !value); this.liveEngine.smartChords.set(this.smartChords()); }
  nudgeOctave(delta: number) { this.octave.update((value) => Math.min(2, Math.max(-2, value + delta))); }

  updateTrackVolume(val: number) {
    const trackId = this.musicManager.selectedTrackId();
    if (trackId !== null) {
      this.musicManager.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, gain: val / 100 } : t));
      this.musicManager.engine.updateTrack(trackId, { gain: val / 100 });
    }
  }

  updateTrackPan(val: number) {
    const trackId = this.musicManager.selectedTrackId();
    if (trackId !== null) {
      this.musicManager.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, pan: val / 100 } : t));
      this.musicManager.engine.updateTrack(trackId, { pan: val / 100 });
    }
  }

  async setInstrument(presetId: string) {
    await this.liveEngine.initialize();
    await this.liveEngine.setInstrument(presetId);
    this.haptic.light();
  }

  async onKeyDown(midi: number) {
    await this.liveEngine.initialize();
    const actualMidi = midi + this.octave() * 12;
    this.liveEngine.triggerNoteStart(actualMidi, this.velocity);
    this.haptic.light();

    if (this.audioSession.isRecording()) {
      const noteId = this.musicManager.recordLiveNote(actualMidi, this.velocity);
      if (noteId) {
        const beat = this.musicManager.engine.currentBeat();
        const stepsPerBeat = this.musicManager.engine.stepsPerBeat();
        const startStep = Math.floor(beat * stepsPerBeat) % this.PATTERN_STEPS;
        this.recordingNotes.set(midi, { id: noteId, startStep });
      }
    }

    this.activeKeys.update((keys) => {
      const next = new Set(keys);
      next.add(midi);
      return next;
    });
  }

  onKeyUp(midi: number) {
    const actualMidi = midi + this.octave() * 12;
    this.liveEngine.triggerNoteEnd(actualMidi);
    
    if (this.audioSession.isRecording()) {
      const recNote = this.recordingNotes.get(midi);
      const selectedId = this.musicManager.selectedTrackId();
      if (recNote && selectedId) {
        const beat = this.musicManager.engine.currentBeat();
        const stepsPerBeat = this.musicManager.engine.stepsPerBeat();
        const currentStep = Math.floor(beat * stepsPerBeat);
        let length = (currentStep - recNote.startStep + 1024) % 1024;
        if (length <= 0) length = 1;
        this.musicManager.setNoteParam(selectedId, recNote.id, 'length', length);
      }
      this.recordingNotes.delete(midi);
    }

    this.activeKeys.update((keys) => {
      const next = new Set(keys);
      next.delete(midi);
      return next;
    });
  }

  onPadPointerDown(event: PointerEvent, midi: number) {
    event.preventDefault();
    event.stopPropagation();
    this.onKeyDown(midi);
  }

  onPadPointerEnter(event: PointerEvent, midi: number) {
    if (event.buttons === 1) {
      this.onKeyDown(midi);
    }
  }

  onPadPointerUp(event: PointerEvent, midi: number) {
    this.onKeyUp(midi);
  }

  onPitchBend(event: any) {
    const val = parseFloat(event.target.value);
    this.pitchBend.set(val);
    this.liveEngine.setPitchBend(val);
  }

  onModWheel(event: any) {
    const val = parseFloat(event.target.value);
    this.modWheel.set(val);
    this.liveEngine.setModWheel(val);
  }

  launchScene(scene: PerformerScene) {
    this.musicManager.launchScene(scene.id);
    this.haptic.medium();
  }

  isSceneActive(scene: PerformerScene): boolean {
    return this.musicManager.activeSceneId() === scene.id;
  }
}
