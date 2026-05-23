import { Injectable, signal, inject } from '@angular/core';
import * as Tone from 'tone';
import { LoggingService } from './logging.service';
import { InstrumentsService, InstrumentPreset } from './instruments.service';

export type LiveInstrumentType = string;

@Injectable({
  providedIn: 'root',
})
export class LiveEngineService {
  private logger = inject(LoggingService);
  private instrumentsService = inject(InstrumentsService);

  private currentInstrumentNode:
    | Tone.PolySynth
    | Tone.Sampler
    | Tone.MonoSynth
    | Tone.FMSynth
    | null = null;
  private activePreset: InstrumentPreset | null = null;

  activeInstrument = signal<LiveInstrumentType>('cyber-lead');
  isInitialized = signal(false);
  midiEnabled = signal(false);
  availableMidiInputs = signal<string[]>([]);

  // AI Assisted Performance State
  scaleLock = signal(true);
  currentScale = signal<number[]>([0, 2, 4, 5, 7, 9, 11]); // C Major
  smartChords = signal(false);

  constructor() {
    // Default initialization happens in setInstrument
  }

  async initialize() {
    if (this.isInitialized()) return;
    await Tone.start();
    this.isInitialized.set(true);
    this.setupMidi();

    // Set initial instrument
    await this.setInstrument(this.activeInstrument());
    this.logger.info('Live Engine Initialized with ' + this.activeInstrument());
  }

  private setupMidi() {
    if (navigator.requestMIDIAccess) {
      navigator.requestMIDIAccess().then(
        (access) => {
          this.midiEnabled.set(true);
          const inputs = Array.from(access.inputs.values());
          this.availableMidiInputs.set(
            inputs.map((i) => i.name || 'Unknown Device')
          );

          inputs.forEach((input) => {
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
    const note = data1;
    const velocity = data2;

    if (cmd === 9 && velocity > 0) {
      this.triggerAttack(this.midiToNote(note), velocity / 127);
    } else if (cmd === 8 || (cmd === 9 && velocity === 0)) {
      this.triggerRelease(this.midiToNote(note));
    }
  }

  private midiToNote(midi: number): string {
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
    const octave = Math.floor(midi / 12) - 1;
    const name = names[midi % 12];
    return `${name}${octave}`;
  }

  async setInstrument(presetId: string) {
    const preset = this.instrumentsService
      .getPresets()
      .find((p) => p.id === presetId);
    if (!preset) {
      this.logger.error(`Preset ${presetId} not found`);
      return;
    }

    this.activeInstrument.set(presetId);
    this.activePreset = preset;

    // Dispose old instrument
    if (this.currentInstrumentNode) {
      this.currentInstrumentNode.dispose();
    }

    if (preset.type === 'synth' && preset.synth) {
      const config = preset.synth;
      this.currentInstrumentNode = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: config.type },
        envelope: {
          attack: config.attack,
          decay: config.decay,
          sustain: config.sustain,
          release: config.release,
        },
      }).toDestination();

      // Apply filter if specified
      if (config.cutoff) {
        const filter = new Tone.Filter({
          frequency: config.cutoff,
          type: 'lowpass',
          Q: config.q || 1,
        }).toDestination();
        this.currentInstrumentNode.connect(filter);
      }
    } else if (
      preset.type === 'sample' &&
      preset.zones &&
      preset.zones.length > 0
    ) {
      const sampleMap: { [key: string]: string } = {};
      preset.zones.forEach((zone) => {
        // Map the center of the range for now or just the URL
        const note = this.midiToNote(zone.midiRange[0]);
        sampleMap[note] = zone.url;
      });

      this.currentInstrumentNode = new Tone.Sampler({
        urls: sampleMap,
        onload: () => this.logger.info(`Samples loaded for ${preset.name}`),
        release: 1,
      }).toDestination();
    }
  }

  triggerAttack(note: string, velocity: number = 0.8) {
    if (!this.isInitialized() || !this.currentInstrumentNode) return;

    let notesToPlay = [note];
    if (this.smartChords() && this.activePreset?.category !== 'drum') {
      notesToPlay = this.generateSmartChord(note);
    }

    const time = Tone.now();
    notesToPlay.forEach((n) => {
      if (this.currentInstrumentNode instanceof Tone.Sampler) {
        this.currentInstrumentNode.triggerAttack(n, time, velocity);
      } else if (this.currentInstrumentNode instanceof Tone.PolySynth) {
        this.currentInstrumentNode.triggerAttack(n, time, velocity);
      }
    });
  }

  triggerRelease(note: string) {
    if (!this.isInitialized() || !this.currentInstrumentNode) return;

    const time = Tone.now();
    let notesToRelease = [note];
    if (this.smartChords() && this.activePreset?.category !== 'drum') {
      notesToRelease = this.generateSmartChord(note);
    }

    notesToRelease.forEach((n) => {
      if (this.currentInstrumentNode instanceof Tone.Sampler) {
        this.currentInstrumentNode.triggerRelease(n, time);
      } else if (this.currentInstrumentNode instanceof Tone.PolySynth) {
        this.currentInstrumentNode.triggerRelease(n, time);
      }
    });
  }

  private generateSmartChord(rootNote: string): string[] {
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
    const octaveMatch = rootNote.match(/\d+$/);
    if (!octaveMatch) return [rootNote];

    const octave = parseInt(octaveMatch[0]);
    const name = rootNote.replace(/\d+$/, '');
    const rootMidi = (octave + 1) * 12 + names.indexOf(name);

    const isMinor = ![0, 5, 7].includes(names.indexOf(name) % 12);

    if (isMinor) {
      return [
        this.midiToNote(rootMidi),
        this.midiToNote(rootMidi + 3),
        this.midiToNote(rootMidi + 7),
      ];
    }
    return [
      this.midiToNote(rootMidi),
      this.midiToNote(rootMidi + 4),
      this.midiToNote(rootMidi + 7),
    ];
  }
}
