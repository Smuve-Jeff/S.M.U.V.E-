import { Component, inject, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LiveEngineService, LiveInstrumentType } from '../../services/live-engine.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { UIService } from '../../services/ui.service';

interface KeyConfig {
  note: string;
  label: string;
  isBlack: boolean;
}

@Component({
  selector: 'app-performer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './performer.component.html',
  styleUrls: ['./performer.component.css']
})
export class PerformerComponent {
  public readonly liveEngine = inject(LiveEngineService);
  private readonly musicManager = inject(MusicManagerService);
  public readonly uiService = inject(UIService);

  viewMode = signal<'keyboard' | 'pads'>('keyboard');
  activeNotes = new Set<string>();

  keys: KeyConfig[] = [
    { note: 'C4', label: 'C', isBlack: false },
    { note: 'C#4', label: 'C#', isBlack: true },
    { note: 'D4', label: 'D', isBlack: false },
    { note: 'D#4', label: 'D#', isBlack: true },
    { note: 'E4', label: 'E', isBlack: false },
    { note: 'F4', label: 'F', isBlack: false },
    { note: 'F#4', label: 'F#', isBlack: true },
    { note: 'G4', label: 'G', isBlack: false },
    { note: 'G#4', label: 'G#', isBlack: true },
    { note: 'A4', label: 'A', isBlack: false },
    { note: 'A#4', label: 'A#', isBlack: true },
    { note: 'B4', label: 'B', isBlack: false },
    { note: 'C5', label: 'C', isBlack: false }
  ];

  pads = [
    { note: 'C3', label: 'Kick' },
    { note: 'D3', label: 'Snare' },
    { note: 'F#3', label: 'Hat' },
    { note: 'A#3', label: 'Open' },
    { note: 'C4', label: 'Lead 1' },
    { note: 'E4', label: 'Lead 2' },
    { note: 'G4', label: 'Lead 3' },
    { note: 'B4', label: 'Lead 4' }
  ];

  async initializeEngine() {
    await this.liveEngine.initialize();
  }

  setInstrument(type: LiveInstrumentType) {
    this.liveEngine.setInstrument(type);
  }

  toggleSmartChords() {
    this.liveEngine.smartChords.update(v => !v);
  }

  playNote(note: string, event: MouseEvent | TouchEvent) {
    event.preventDefault();
    if (!this.liveEngine.isInitialized()) {
        this.initializeEngine();
    }

    let velocity = 0.8;
    if (event instanceof MouseEvent) {
        // Simple velocity simulation based on click height
        const rect = (event.target as HTMLElement).getBoundingClientRect();
        velocity = 1 - (event.clientY - rect.top) / rect.height;
    } else if (event instanceof TouchEvent && event.touches.length > 0) {
        const rect = (event.target as HTMLElement).getBoundingClientRect();
        velocity = 1 - (event.touches[0].clientY - rect.top) / rect.height;
    }

    this.activeNotes.add(note);
    this.liveEngine.triggerAttack(note, velocity);
    this.musicManager.recordLiveNote(note, velocity);
  }

  stopNote(note: string, event: MouseEvent | TouchEvent) {
    event.preventDefault();
    this.activeNotes.delete(note);
    this.liveEngine.triggerRelease(note);
  }

  @HostListener('window:keydown', [''])
  handleKeyDown(event: KeyboardEvent) {
    const keyMap: Record<string, string> = {
        'a': 'C4', 'w': 'C#4', 's': 'D4', 'e': 'D#4', 'd': 'E4', 'f': 'F4', 't': 'F#4', 'g': 'G4', 'y': 'G#4', 'h': 'A4', 'u': 'A#4', 'j': 'B4', 'k': 'C5'
    };
    const note = keyMap[event.key.toLowerCase()];
    if (note && !this.activeNotes.has(note)) {
        this.playNote(note, event as any);
    }
  }

  @HostListener('window:keyup', [''])
  handleKeyUp(event: KeyboardEvent) {
    const keyMap: Record<string, string> = {
        'a': 'C4', 'w': 'C#4', 's': 'D4', 'e': 'D#4', 'd': 'E4', 'f': 'F4', 't': 'F#4', 'g': 'G4', 'y': 'G#4', 'h': 'A4', 'u': 'A#4', 'j': 'B4', 'k': 'C5'
    };
    const note = keyMap[event.key.toLowerCase()];
    if (note) {
        this.stopNote(note, event as any);
    }
  }
}
