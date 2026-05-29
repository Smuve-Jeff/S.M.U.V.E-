import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import { KnobComponent } from '../shared/knob/knob.component';
import { MusicManagerService } from '../../services/music-manager.service';
import { LiveEngineService } from '../../services/live-engine.service';
import { HapticService } from '../../services/haptic.service';
import {
  InstrumentsService,
  InstrumentPreset,
} from '../../services/instruments.service';

@Component({
  selector: 'app-performer',
  standalone: true,
  imports: [CommonModule, FormsModule, KnobComponent],
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
  scenes = signal<any[]>(
    new Array(8)
      .fill(null)
      .map((_, i) => ({ id: i, name: `SCENE ${i + 1}`, color: '#af25f4' }))
  );
  smartChords = signal(false);
  velocity = 0.8;
  octave = signal(0);
  activeKeys = signal<Set<number>>(new Set());
  availableInstruments = signal<InstrumentPreset[]>([]);
  activeInstrumentId = this.liveEngine.activeInstrument;

  pitchBend = signal(0); // -1 to 1
  modWheel = signal(0); // 0 to 1

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
      const midi = 48 + i; // Start from C3
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
        name: `PAD ${i + 1}`,
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
    this.smartChords.update((v) => !v);
    this.liveEngine.smartChords.set(this.smartChords());
  }

  nudgeOctave(delta: number) {
    this.octave.update((v) => Math.min(2, Math.max(-2, v + delta)));
  }

  async setInstrument(presetId: string) {
    await this.liveEngine.initialize();
    await this.liveEngine.setInstrument(presetId);
    this.haptic.impact('light');
  }

  async onKeyDown(midi: number) {
    await this.liveEngine.initialize();
    const actualMidi = midi + this.octave() * 12;
    this.liveEngine.triggerNoteStart(actualMidi, this.velocity);
    this.haptic.light();

    if (this.audioSession.isRecording()) {
      this.musicManager.recordLiveNote(actualMidi, this.velocity);
    }

    this.activeKeys.update((set) => {
      const next = new Set(set);
      next.add(midi);
      return next;
    });
  }

  onKeyUp(midi: number) {
    const actualMidi = midi + this.octave() * 12;
    this.liveEngine.triggerNoteEnd(actualMidi);
    this.activeKeys.update((set) => {
      const next = new Set(set);
      next.delete(midi);
      return next;
    });
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

  launchScene(index: number) {
    this.musicManager.tracks().forEach((track) => {
      this.musicManager.setActivePatternSlot(track.id, `slot-${index}`);
    });
    this.haptic.impact('medium');
  }

  launchPattern(trackId: number, slotId: string) {
    this.musicManager.setActivePatternSlot(trackId, slotId);
    this.haptic.impact('light');
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
      default:
        return 'music_note';
    }
  }
}
