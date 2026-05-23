import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { LiveEngineService } from '../../services/live-engine.service';
import { HapticService } from '../../services/haptic.service';

@Component({
  selector: 'app-performer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './performer.component.html',
  styleUrls: ['./performer.component.css'],
})
export class PerformerComponent {
  private musicManager = inject(MusicManagerService);
  private audioEngine = inject(AudioEngineService);
  private liveEngine = inject(LiveEngineService);
  private haptic = inject(HapticService);


  layout = signal<'keyboard' | 'pads' | 'matrix'>('keyboard');
  scenes = signal<any[]>(new Array(8).fill(null).map((_, i) => ({ id: i, name: `SCENE ${i+1}`, color: '#af25f4' })));

  smartChords = signal(false);
  velocity = 0.8;
  octave = signal(0);
  activeKeys = signal<Set<number>>(new Set());

  keyboardKeys = this.generateKeyboardKeys();
  performerPads = this.generatePads();

  generateKeyboardKeys() {
    const keys = [];
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    for (let i = 0; i < 24; i++) {
      const midi = 48 + i; // Start from C3
      keys.push({
        midi,
        name: notes[midi % 12],
      });
    }
    return keys;
  }

  generatePads() {
    const pads = [];
    const colors = ['#ec5b13', '#a855f7', '#38bdf8', '#10b981'];
    for (let i = 0; i < 16; i++) {
      pads.push({
        midi: 36 + i,
        name: `PAD ${i + 1}`,
        color: colors[i % 4],
      });
    }
    return pads;
  }

  isBlackKey(midi: number): boolean {
    const note = midi % 12;
    return [1, 3, 6, 8, 10].includes(note);
  }


  setLayout(mode: 'keyboard' | 'pads' | 'matrix') {
    this.layout.set(mode);
  }

  launchPattern(trackId: number, slotId: string) {
    this.musicManager.setActivePatternSlot(trackId, slotId);
    this.haptic.medium();
  }

  launchScene(sceneIndex: number) {
    this.musicManager.tracks().forEach(track => {
      if (track.patternSlots && track.patternSlots[sceneIndex]) {
        this.musicManager.setActivePatternSlot(track.id, track.patternSlots[sceneIndex].id);
      }
    });
    this.haptic.success();
  }


  toggleSmartChords() {
    this.smartChords.update((v) => !v);
  }

  nudgeOctave(delta: number) {
    this.octave.update((v) => Math.min(2, Math.max(-2, v + delta)));
  }

  onKeyDown(midi: number) {
    const shiftedMidi = midi + this.octave() * 12;
    this.activeKeys.update((set) => {
      set.add(midi);
      return new Set(set);
    });
    this.liveEngine.triggerAttack(`${shiftedMidi}`, this.velocity);

    // Record if transport is recording
    const noteName = this.getNoteName(shiftedMidi);
    this.musicManager.recordLiveNote(noteName, this.velocity);
  }

  onKeyUp(midi: number) {
    const shiftedMidi = midi + this.octave() * 12;
    this.activeKeys.update((set) => {
      set.delete(midi);
      return new Set(set);
    });
    this.liveEngine.triggerRelease(`${shiftedMidi}`);
  }

  private getNoteName(midi: number): string {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const name = notes[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    return `${name}${octave}`;
  }
}
