import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import { KnobComponent } from '../shared/knob/knob.component';
import {
  MusicManagerService,
  PerformerScene,
  TrackModel,
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
  scenes = this.musicManager.performerScenes;
  smartChords = signal(false);
  velocity = 0.8;
  octave = signal(0);
  activeKeys = signal<Set<number>>(new Set());
  availableInstruments = signal<InstrumentPreset[]>([]);
  activeInstrumentId = this.liveEngine.activeInstrument;
  pitchBend = signal(0);
  modWheel = signal(0);

  private readonly activePointers = new Map<number, number>();

  keyboardKeys = this.generateKeyboardKeys();
  performerPads = this.generatePads();

  constructor() {
    this.availableInstruments.set(this.instrumentsService.getPresets());
  }

  generateKeyboardKeys() {
    const keys = [];
    const names = [
      'C',
      'C#',
      'D',
      'D#',
      'E',
      'F',
      'F#',
      'G',
      'G#',
      'A',
      'A#',
      'B',
    ];
    for (let i = 0; i < 25; i++) {
      const midi = 48 + i;
      keys.push({
        midi,
        name: `${names[midi % 12]}${Math.floor(midi / 12) - 1}`,
      });
    }
    return keys;
  }

  generatePads() {
    const pads = [];
    const colors = [
      '#f43f5e',
      '#ec4899',
      '#d946ef',
      '#a855f7',
      '#8b5cf6',
      '#6366f1',
      '#3b82f6',
      '#0ea5e9',
    ];
    for (let i = 0; i < 16; i++) {
      pads.push({
        midi: 36 + i,
        name: `Pad ${i + 1}`,
        color: colors[i % colors.length],
      });
    }
    return pads;
  }

  isBlackKey(midi: number): boolean {
    return [1, 3, 6, 8, 10].includes(midi % 12);
  }

  setLayout(mode: 'keyboard' | 'pads' | 'matrix') {
    this.layout.set(mode);
  }

  toggleSmartChords() {
    this.smartChords.update((value) => !value);
    this.liveEngine.smartChords.set(this.smartChords());
  }

  nudgeOctave(delta: number) {
    this.octave.update((value) => Math.min(2, Math.max(-2, value + delta)));
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
      this.musicManager.recordLiveNote(actualMidi, this.velocity);
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
    this.activeKeys.update((keys) => {
      const next = new Set(keys);
      next.delete(midi);
      return next;
    });
  }

  onPadPointerDown(event: PointerEvent, midi: number) {
    event.preventDefault();
    event.stopPropagation();
    const currentMidi = this.activePointers.get(event.pointerId);
    if (currentMidi !== undefined && currentMidi !== midi) {
      this.onKeyUp(currentMidi);
    }
    this.activePointers.set(event.pointerId, midi);
    void this.onKeyDown(midi);
  }

  onPadPointerEnter(event: PointerEvent, midi: number) {
    if (!this.activePointers.has(event.pointerId) && event.buttons === 0) {
      return;
    }

    const currentMidi = this.activePointers.get(event.pointerId);
    if (currentMidi === midi) {
      return;
    }

    if (currentMidi !== undefined) {
      this.onKeyUp(currentMidi);
    }
    this.activePointers.set(event.pointerId, midi);
    void this.onKeyDown(midi);
  }

  onPadPointerUp(event: PointerEvent, midi: number) {
    event.preventDefault();
    if (this.activePointers.get(event.pointerId) === midi) {
      this.activePointers.delete(event.pointerId);
    }
    this.onKeyUp(midi);
  }

  onPitchBend(event: Event) {
    const value = parseFloat((event.target as HTMLInputElement).value);
    this.pitchBend.set(value);
    this.liveEngine.setPitchBend(value);
  }

  onModWheel(event: Event) {
    const value = parseFloat((event.target as HTMLInputElement).value);
    this.modWheel.set(value);
    this.liveEngine.setModulation(value);
  }

  launchScene(scene: PerformerScene) {
    this.musicManager.tracks().forEach((track) => {
      this.musicManager.setActivePatternSlot(track.id, scene.slotId);
    });
    this.haptic.medium();
  }

  launchPattern(trackId: number, slotId: string) {
    this.musicManager.setActivePatternSlot(trackId, slotId);
    this.haptic.light();
  }

  isSceneActive(scene: PerformerScene) {
    return this.musicManager
      .tracks()
      .every((track) => track.activePatternSlotId === scene.slotId);
  }

  trackSlots(track: TrackModel) {
    return track.patternSlots || [];
  }

  isSlotActive(track: TrackModel, slotId: string) {
    return track.activePatternSlotId === slotId;
  }

  getInstrumentIcon(category: string): string {
    switch (category) {
      case 'piano':
        return 'piano';
      case 'guitar':
        return 'reorder';
      case 'strings':
        return 'layers';
      case 'bass':
        return 'vertical_align_bottom';
      case 'drum':
        return 'grid_view';
      case 'synth':
      case 'lead':
        return 'tune';
      case 'brass':
        return 'campaign';
      default:
        return 'music_note';
    }
  }
}
