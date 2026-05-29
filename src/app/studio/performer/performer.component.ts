import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import { KnobComponent } from '../shared/knob/knob.component';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { LiveEngineService } from '../../services/live-engine.service';
import { HapticService } from '../../services/haptic.service';
import { InstrumentsService, InstrumentPreset } from '../../services/instruments.service';

@Component({
  selector: 'app-performer',
  standalone: true,
  imports: [CommonModule, FormsModule, KnobComponent],
  templateUrl: './performer.component.html',
  styleUrls: ['./performer.component.css']
})
export class PerformerComponent {
  public readonly audioSession = inject(AudioSessionService);
  public readonly musicManager = inject(MusicManagerService);
  public readonly liveEngine = inject(LiveEngineService);
  private readonly haptic = inject(HapticService);
  private readonly instrumentsService = inject(InstrumentsService);

  layout = signal<'keyboard' | 'pads' | 'matrix'>('keyboard');
  scenes = signal<any[]>(new Array(8).fill(null).map((_, i) => ({ id: i, name: `SCENE ${i + 1}`, color: '#af25f4' })));
  smartChords = signal(false);
  velocity = 0.8;
  octave = signal(0);
  activeKeys = signal<Set<number>>(new Set());
  availableInstruments = signal<InstrumentPreset[]>([]);
  activeInstrumentId = this.liveEngine.activeInstrument;

  keyboardKeys = this.generateKeyboardKeys();
  performerPads = this.generatePads();

  constructor() {
    this.availableInstruments.set(this.instrumentsService.getPresets());
  }

  generateKeyboardKeys() {
    const keys = [];
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    for (let i = 0; i < 24; i++) {
      keys.push({
        midi: 60 + i,
        name: names[i % 12]
      });
    }
    return keys;
  }

  generatePads() {
    const pads = [];
    const padNames = ['KICK', 'SNARE', 'CLAP', 'HAT', 'CYM', 'TOM', 'PERC', 'FX', 'BASS', 'LEAD', 'PAD', 'VOX', 'HIT', 'LOOP', 'STAB', 'SUB'];
    const colors = ['#ff4d4d', '#ff944d', '#ffdb4d', '#4dff88', '#4dffff', '#4d88ff', '#944dff', '#ff4dff'];
    for (let i = 0; i < 16; i++) {
      pads.push({
        id: i,
        name: padNames[i],
        midi: 36 + i,
        color: colors[i % 8]
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
    await this.liveEngine.setInstrument(presetId);
    this.haptic.impact('light');
  }

  onKeyDown(midi: number) {
    const actualMidi = midi + (this.octave() * 12);
    this.liveEngine.triggerNoteStart(actualMidi, this.velocity);

    // MIDI Recording integration
    if (this.audioSession.isRecording()) {
       this.musicManager.recordLiveNote(actualMidi, this.velocity);
    }

    this.activeKeys.update(set => {
       const next = new Set(set);
       next.add(midi);
       return next;
    });
  }

  onKeyUp(midi: number) {
    const actualMidi = midi + (this.octave() * 12);
    this.liveEngine.triggerNoteEnd(actualMidi);
    this.activeKeys.update(set => {
       const next = new Set(set);
       next.delete(midi);
       return next;
    });
  }

  launchScene(index: number) {
    console.log('Launching scene', index);
    this.haptic.impact('medium');
  }

  launchPattern(trackId: number, slotId: string) {
    this.musicManager.setActivePatternSlot(trackId, slotId);
    this.haptic.impact('light');
  }

  getInstrumentIcon(category: string): string {
    switch (category) {
      case 'drum': return 'drum';
      case 'bass': return 'speaker';
      case 'lead': return 'music_note';
      case 'pad': return 'waves';
      default: return 'piano';
    }
  }
}
