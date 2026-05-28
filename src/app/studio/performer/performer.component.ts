import { Component, inject, signal } from '@angular/core';
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

  constructor() { this.availableInstruments.set(this.instrumentsService.getPresets()); }
  generateKeyboardKeys() { /* logic */ return []; }
  generatePads() { /* logic */ return []; }
  isBlackKey(midi: number): boolean { return [1, 3, 6, 8, 10].includes(midi % 12); }
  setLayout(mode: 'keyboard' | 'pads' | 'matrix') { this.layout.set(mode); }
  toggleSmartChords() { this.smartChords.update((v) => !v); this.liveEngine.smartChords.set(this.smartChords()); }
  nudgeOctave(delta: number) { this.octave.update((v) => Math.min(2, Math.max(-2, v + delta))); }
  async setInstrument(presetId: string) { await this.liveEngine.setInstrument(presetId); }
  onKeyDown(midi: number) { /* logic */ }
  onKeyUp(midi: number) { /* logic */ }
  getInstrumentIcon(category: string): string { return 'piano'; }
}
