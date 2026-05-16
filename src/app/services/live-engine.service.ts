import { Injectable, signal, inject } from '@angular/core';
import * as Tone from 'tone';
import { LoggingService } from './logging.service';

export type LiveInstrumentType = 'poly-synth' | 'mono-lead' | 'fm-bell';

@Injectable({
  providedIn: 'root'
})
export class LiveEngineService {
  private logger = inject(LoggingService);
  private polySynth: Tone.PolySynth;
  private monoLead: Tone.MonoSynth;
  private fmBell: Tone.FMSynth;

  activeInstrument = signal<LiveInstrumentType>('poly-synth');
  isInitialized = signal(false);
  midiEnabled = signal(false);
  availableMidiInputs = signal<string[]>([]);

  // AI Assisted Performance State
  scaleLock = signal(true);
  currentScale = signal<number[]>([0, 2, 4, 5, 7, 9, 11]); // C Major
  smartChords = signal(false);

  constructor() {
    this.polySynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.5, release: 1 }
    }).toDestination();

    this.monoLead = new Tone.MonoSynth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.1 },
      filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.1, baseFrequency: 200, octaves: 4 }
    }).toDestination();

    this.fmBell = new Tone.FMSynth({
      harmonicity: 3.01,
      modulationIndex: 14,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0.1, release: 1 },
      modulation: { type: 'square' },
      modulationEnvelope: { attack: 0.01, decay: 0.5, sustain: 0.2, release: 0.1 }
    }).toDestination();
  }

  async initialize() {
    if (this.isInitialized()) return;
    await Tone.start();
    this.isInitialized.set(true);
    this.setupMidi();
    this.logger.info('Live Engine Initialized');
  }

  private setupMidi() {
    if (navigator.requestMIDIAccess) {
      navigator.requestMIDIAccess().then(
        (access) => {
          this.midiEnabled.set(true);
          const inputs = Array.from(access.inputs.values());
          this.availableMidiInputs.set(inputs.map(i => i.name || 'Unknown Device'));

          inputs.forEach(input => {
            input.onmidimessage = (msg) => this.handleMidiMessage(msg);
          });
        },
        () => this.logger.warn('MIDI Access Denied')
      );
    }
  }

  private handleMidiMessage(message: any) {
    const [status, data1, data2] = message.data;
    const cmd = status >> 4;
    const channel = status & 0xf;
    const note = data1;
    const velocity = data2;

    if (cmd === 9 && velocity > 0) { // Note On
        this.triggerAttack(this.midiToNote(note), velocity / 127);
    } else if (cmd === 8 || (cmd === 9 && velocity === 0)) { // Note Off
        this.triggerRelease(this.midiToNote(note));
    }
  }

  private midiToNote(midi: number): string {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    const name = names[midi % 12];
    return `${name}${octave}`;
  }

  setInstrument(type: LiveInstrumentType) {
    this.activeInstrument.set(type);
  }

  triggerAttack(note: string, velocity: number = 0.8) {
    if (!this.isInitialized()) return;

    let notesToPlay = [note];

    // AI: Smart Chords logic
    if (this.smartChords() && this.activeInstrument() === 'poly-synth') {
        notesToPlay = this.generateSmartChord(note);
    }

    const time = Tone.now();
    notesToPlay.forEach(n => {
        switch (this.activeInstrument()) {
            case 'poly-synth':
              this.polySynth.triggerAttack(n, time, velocity);
              break;
            case 'mono-lead':
              this.monoLead.triggerAttack(n, time, velocity);
              break;
            case 'fm-bell':
              this.fmBell.triggerAttack(n, time, velocity);
              break;
        }
    });
  }

  triggerRelease(note: string) {
    if (!this.isInitialized()) return;

    const time = Tone.now();
    let notesToRelease = [note];
    if (this.smartChords()) {
        notesToRelease = this.generateSmartChord(note);
    }

    notesToRelease.forEach(n => {
        switch (this.activeInstrument()) {
            case 'poly-synth':
              this.polySynth.triggerRelease(n, time);
              break;
            case 'mono-lead':
              this.monoLead.triggerRelease(time);
              break;
            case 'fm-bell':
              this.fmBell.triggerRelease(time);
              break;
        }
    });
  }

  private generateSmartChord(rootNote: string): string[] {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = parseInt(rootNote.slice(-1));
    const name = rootNote.slice(0, -1);
    const rootMidi = (octave + 1) * 12 + names.indexOf(name);

    // Basic Major/Minor detection based on C Major scale for now
    const scale = this.currentScale();
    const isMinor = ![0, 5, 7].includes(names.indexOf(name) % 12);

    if (isMinor) {
        return [this.midiToNote(rootMidi), this.midiToNote(rootMidi + 3), this.midiToNote(rootMidi + 7)];
    }
    return [this.midiToNote(rootMidi), this.midiToNote(rootMidi + 4), this.midiToNote(rootMidi + 7)];
  }
}
