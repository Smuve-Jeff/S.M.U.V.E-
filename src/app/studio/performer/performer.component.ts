import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import { KnobComponent } from '../shared/knob/knob.component';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { LiveEngineService } from '../../services/live-engine.service';
import { HapticService } from '../../services/haptic.service';
import { InstrumentsService, InstrumentPreset } from '../../services/instruments.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-performer',
  standalone: true,
  imports: [CommonModule, FormsModule, KnobComponent],
  templateUrl: './performer.component.html',
  styleUrls: ['./performer.component.css']
})
export class PerformerComponent implements OnInit, OnDestroy {
  public readonly audioSession = inject(AudioSessionService);
  public readonly musicManager = inject(MusicManagerService);
  public readonly liveEngine = inject(LiveEngineService);
  private readonly haptic = inject(HapticService);
  private readonly instrumentsService = inject(InstrumentsService);
  private readonly audioEngine = inject(AudioEngineService);

  private destroy$ = new Subject<void>();

  layout = signal<'keyboard' | 'pads' | 'matrix'>('keyboard');
  scenes = signal<any[]>(new Array(8).fill(null).map((_, i) => ({ id: i, name: `SCENE ${i + 1}`, color: '#af25f4' })));
  smartChords = signal(false);
  velocity = 0.8;
  octave = signal(0);
  activeKeys = signal<Set<number>>(new Set());
  availableInstruments = signal<InstrumentPreset[]>([]);
  activeInstrumentId = this.liveEngine.activeInstrument;

  pitchBend = signal(0); // -1 to 1
  modWheel = signal(0); // 0 to 1

  keyboardKeys: any[] = [];
  performerPads: any[] = [];

  constructor() {
    this.availableInstruments.set(this.instrumentsService.getPresets());
    this.keyboardKeys = this.generateKeyboardKeys();
    this.performerPads = this.generatePads();
  }

  ngOnInit() {
    this.liveEngine.initialize();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  generateKeyboardKeys() {
    const keys = [];
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    for (let i = 0; i < 25; i++) {
      const midi = 48 + i; // Start from C3
      keys.push({
        midi,
        name: `${names[midi % 12]}${Math.floor(midi / 12) - 1}`
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
        name: `PAD ${i + 1}`,
        color: colors[i % colors.length]
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
  }

  onKeyDown(midi: number) {
    const adjustedMidi = midi + (this.octave() * 12);
    const noteName = this.midiToNote(adjustedMidi);

    this.activeKeys.update(keys => {
      const newKeys = new Set(keys);
      newKeys.add(midi);
      return newKeys;
    });

    this.liveEngine.triggerAttack(noteName, this.velocity);
    this.haptic.light();

    // Live Recording Integration
    if (this.audioSession.isRecording()) {
      this.musicManager.recordLiveNote(noteName, this.velocity);
    }
  }

  onKeyUp(midi: number) {
    const adjustedMidi = midi + (this.octave() * 12);
    const noteName = this.midiToNote(adjustedMidi);

    this.activeKeys.update(keys => {
      const newKeys = new Set(keys);
      newKeys.delete(midi);
      return newKeys;
    });

    this.liveEngine.triggerRelease(noteName);
  }

  private midiToNote(midi: number): string {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    const name = names[midi % 12];
    return `${name}${octave}`;
  }

  getInstrumentIcon(category: string): string {
    switch (category) {
      case 'piano': return 'piano';
      case 'guitar': return 'reorder';
      case 'strings': return 'layers';
      case 'bass': return 'vertical_align_bottom';
      case 'drum': return 'grid_view';
      default: return 'music_note';
    }
  }

  // Expressive Controls
  onPitchBend(event: any) {
    const value = parseFloat(event.target.value);
    this.pitchBend.set(value);
    this.liveEngine.setPitchBend(value);
  }

  onModWheel(event: any) {
    const value = parseFloat(event.target.value);
    this.modWheel.set(value);
    this.liveEngine.setModulation(value);
  }

  launchScene(index: number) {
    this.musicManager.tracks().forEach(track => {
      this.musicManager.setActivePatternSlot(track.id, `slot-${index}`);
    });
  }

  launchPattern(trackId: number, slotId: string) {
    this.musicManager.setActivePatternSlot(trackId, slotId);
  }
}
