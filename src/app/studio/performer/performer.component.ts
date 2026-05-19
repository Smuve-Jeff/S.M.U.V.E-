import {
  Component,
  inject,
  signal,
  computed,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LiveEngineService,
  LiveInstrumentType,
} from '../../services/live-engine.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { UIService } from '../../services/ui.service';

interface KeyConfig {
  midi: number;
  name: string;
}

@Component({
  selector: 'app-performer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './performer.component.html',
  styleUrls: ['./performer.component.css'],
})
export class PerformerComponent {
  public readonly liveEngine = inject(LiveEngineService);
  private readonly musicManager = inject(MusicManagerService);
  public readonly uiService = inject(UIService);

  layout = signal<'keyboard' | 'pads'>('keyboard');
  activeKeys = signal<Set<number>>(new Set());
  octave = signal(4);
  velocity = 0.8;
  smartChords = this.liveEngine.smartChords;

  keyboardKeys: KeyConfig[] = Array.from({ length: 13 }, (_, i) => {
    const midi = 60 + i; // Starts from C4
    return {
      midi,
      name: this.getNoteName(midi),
    };
  });

  performerPads = [
    { midi: 36, name: 'KICK', color: '#ff4d4d' },
    { midi: 38, name: 'SNARE', color: '#ff944d' },
    { midi: 42, name: 'HAT', color: '#4dff88' },
    { midi: 46, name: 'OPEN', color: '#4dffff' },
    { midi: 48, name: 'TOM 1', color: '#4d88ff' },
    { midi: 45, name: 'TOM 2', color: '#944dff' },
    { midi: 41, name: 'TOM 3', color: '#ff4dff' },
    { midi: 39, name: 'CLAP', color: '#ffdb4d' },
  ];

  private getNoteName(midi: number): string {
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
    return names[midi % 12];
  }

  private midiToNote(midi: number): string {
    const name = this.getNoteName(midi);
    const oct = Math.floor(midi / 12) - 1;
    return `${name}${oct}`;
  }

  isBlackKey(midi: number): boolean {
    const n = midi % 12;
    return [1, 3, 6, 8, 10].includes(n);
  }

  setLayout(mode: 'keyboard' | 'pads') {
    this.layout.set(mode);
  }

  toggleSmartChords() {
    this.liveEngine.smartChords.update((v) => !v);
  }

  nudgeOctave(delta: number) {
    this.octave.update((v) => Math.max(0, Math.min(8, v + delta)));
  }

  async onKeyDown(midi: number) {
    if (!this.liveEngine.isInitialized()) {
      await this.liveEngine.initialize();
    }

    const adjustedMidi =
      this.layout() === 'keyboard' ? midi + (this.octave() - 4) * 12 : midi;

    const note = this.midiToNote(adjustedMidi);

    this.activeKeys.update((set) => {
      const next = new Set(set);
      next.add(midi);
      return next;
    });

    this.liveEngine.triggerAttack(note, this.velocity);
    this.musicManager.recordLiveNote(note, this.velocity);
  }

  onKeyUp(midi: number) {
    const adjustedMidi =
      this.layout() === 'keyboard' ? midi + (this.octave() - 4) * 12 : midi;

    const note = this.midiToNote(adjustedMidi);

    this.activeKeys.update((set) => {
      const next = new Set(set);
      next.delete(midi);
      return next;
    });

    this.liveEngine.triggerRelease(note);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    const keyMap: Record<string, number> = {
      a: 60,
      w: 61,
      s: 62,
      e: 63,
      d: 64,
      f: 65,
      t: 66,
      g: 67,
      y: 68,
      h: 69,
      u: 70,
      j: 71,
      k: 72,
    };
    const midi = keyMap[event.key.toLowerCase()];
    if (midi && !this.activeKeys().has(midi)) {
      this.onKeyDown(midi);
    }
  }

  @HostListener('window:keyup', ['$event'])
  handleKeyUp(event: KeyboardEvent) {
    const keyMap: Record<string, number> = {
      a: 60,
      w: 61,
      s: 62,
      e: 63,
      d: 64,
      f: 65,
      t: 66,
      g: 67,
      y: 68,
      h: 69,
      u: 70,
      j: 71,
      k: 72,
    };
    const midi = keyMap[event.key.toLowerCase()];
    if (midi) {
      this.onKeyUp(midi);
    }
  }
}
