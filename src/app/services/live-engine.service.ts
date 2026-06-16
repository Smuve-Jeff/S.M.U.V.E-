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
  private filterNode: Tone.Filter | null = null;

  activeInstrument = signal<LiveInstrumentType>('grand-piano');
  isInitialized = signal(false);
  midiEnabled = signal(false);
  availableMidiInputs = signal<string[]>([]);

  // AI Assisted Performance State
  scaleLock = signal(true);
  currentScale = signal<number[]>([0, 2, 4, 5, 7, 9, 11]); // C Major
  scaleMode = signal<'major' | 'minor' | 'blues' | 'pentatonic'>('major');
  smartChords = signal(false);

  // Arpeggiator State
  arpeggiatorEnabled = signal(false);
  arpeggiatorRate = signal('8n');
  arpeggiatorPattern = signal<'up' | 'down' | 'upDown' | 'random'>('up');
  private arpLoop: Tone.Loop | null = null;
  private arpNotes: number[] = [];

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
    if (
      typeof navigator !== 'undefined' &&
      (navigator as any).requestMIDIAccess
    ) {
      (navigator as any).requestMIDIAccess().then(
        (access: any) => {
          this.midiEnabled.set(true);
          const inputs = Array.from(access.inputs.values()) as any[];
          this.availableMidiInputs.set(
            inputs.map((i) => i.name || 'Unknown Device')
          );

          inputs.forEach((input) => {
            input.onmidimessage = (msg: any) => this.handleMidiMessage(msg);
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
      this.triggerNoteStart(note, velocity / 127);
    } else if (cmd === 8 || (cmd === 9 && velocity === 0)) {
      this.triggerNoteEnd(note);
    } else if (cmd === 14) {
      const bendValue = (data2 << 7) | data1;
      const normalizedBend = (bendValue - 8192) / 8192;
      this.setPitchBend(normalizedBend);
    } else if (cmd === 11 && data1 === 1) {
      this.setModulation(data2 / 127);
    }
  }

  public midiToNote(midi: number): string {
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

    if (this.currentInstrumentNode) {
      this.currentInstrumentNode.dispose();
    }
    if (this.filterNode) {
      this.filterNode.dispose();
      this.filterNode = null;
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
      });

      this.filterNode = new Tone.Filter({
        frequency: config.cutoff || 20000,
        type: 'lowpass',
        Q: config.q || 1,
      }).toDestination();
      this.currentInstrumentNode.connect(this.filterNode);
    } else if (
      preset.type === 'sample' &&
      preset.zones &&
      preset.zones.length > 0
    ) {
      const sampleMap: { [key: string]: string } = {};
      preset.zones.forEach((zone) => {
        const note = this.midiToNote(zone.midiRange[0]);
        sampleMap[note] = zone.url;
      });

      this.currentInstrumentNode = new Tone.Sampler({
        urls: sampleMap,
        onload: () => this.logger.info(`Samples loaded for ${preset.name}`),
        release: 1,
      });

      this.filterNode = new Tone.Filter({
        frequency: preset.synth?.cutoff || 2000,
        type: 'lowpass',
        Q: preset.synth?.q || 1,
      }).toDestination();

      this.currentInstrumentNode.connect(this.filterNode);
    }
  }

  triggerNoteStart(midi: number, velocity: number = 0.8) {
    if (!this.isInitialized()) this.initialize();
    if (!this.currentInstrumentNode) return;

    if (this.scaleLock()) {
      const noteInOctave = midi % 12;
      if (!this.currentScale().includes(noteInOctave)) {
        const nearest = this.currentScale().reduce((prev, curr) =>
          Math.abs(curr - noteInOctave) < Math.abs(prev - noteInOctave) ? curr : prev
        );
        midi = Math.floor(midi / 12) * 12 + nearest;
      }
    }

    if (this.arpeggiatorEnabled()) {
      if (!this.arpNotes.includes(midi)) {
        this.arpNotes.push(midi);
        this.arpNotes.sort((a, b) => a - b);
        this.startArpLoop();
      }
      return;
    }

    const note = this.midiToNote(midi);
    let notesToPlay = [note];
    if (this.smartChords() && this.activePreset?.category !== 'drum') {
      notesToPlay = this.generateSmartChord(note);
    }

    const time = Tone.now();
    notesToPlay.forEach((n) => {
      const humanVelocity = Math.max(0.1, Math.min(1, velocity + (Math.random() - 0.5) * 0.1));
      const humanTime = time + (Math.random() * 0.01);
      this.currentInstrumentNode?.triggerAttack(n, humanTime, humanVelocity);
    });

    if (this.activePreset?.category !== 'drum') {
       this.triggerAiMimic(midi, time);
    }
  }

  triggerNoteEnd(midi: number) {
    if (!this.isInitialized() || !this.currentInstrumentNode) return;

    if (this.arpeggiatorEnabled()) {
      this.arpNotes = this.arpNotes.filter(n => n !== midi);
      if (this.arpNotes.length === 0) {
        this.stopArpLoop();
      }
      return;
    }

    const note = this.midiToNote(midi);
    let notesToRelease = [note];
    if (this.smartChords() && this.activePreset?.category !== 'drum') {
      notesToRelease = this.generateSmartChord(note);
    }

    const time = Tone.now();
    notesToRelease.forEach((n) => {
      this.currentInstrumentNode?.triggerRelease(n, time);
    });
  }

  setModWheel(value: number) {
    if (this.currentInstrumentNode && (this.currentInstrumentNode as any).modulationIndex) {
      (this.currentInstrumentNode as any).modulationIndex.value = value * 10;
    }
  }

  setPitchBend(value: number) {
    if (!this.currentInstrumentNode) return;
    const detune = value * 200;
    if (
      this.currentInstrumentNode instanceof Tone.PolySynth ||
      this.currentInstrumentNode instanceof Tone.Sampler
    ) {
      this.currentInstrumentNode.set({ detune });
    }
  }

  setModulation(value: number) {
    if (!this.filterNode) return;
    const baseFreq = this.activePreset?.synth?.cutoff || 2000;
    const targetFreq = baseFreq + value * 8000;
    this.filterNode.frequency.rampTo(targetFreq, 0.05);
  }

  updateParameter(param: string, value: number) {
    if (!this.currentInstrumentNode) return;
    if (['attack', 'decay', 'sustain', 'release'].includes(param)) {
      if (this.currentInstrumentNode instanceof Tone.PolySynth) {
        this.currentInstrumentNode.set({ envelope: { [param]: value } });
      } else if (this.currentInstrumentNode instanceof Tone.Sampler) {
        this.currentInstrumentNode.set({ [param]: value });
      }
    } else if (param === 'cutoff' && this.filterNode) {
      this.filterNode.frequency.rampTo(value, 0.1);
    } else if (param === 'resonance' && this.filterNode) {
      this.filterNode.Q.rampTo(value, 0.1);
    }
  }

  setScale(mode: 'major' | 'minor' | 'blues' | 'pentatonic') {
    this.scaleMode.set(mode);
    const scales = {
      major: [0, 2, 4, 5, 7, 9, 11],
      minor: [0, 2, 3, 5, 7, 8, 10],
      blues: [0, 3, 5, 6, 7, 10],
      pentatonic: [0, 2, 4, 7, 9]
    };
    this.currentScale.set(scales[mode]);
  }

  triggerAiMimic(midi: number, time: number) {
     const intervals = [3, 4, 7, 12, -5, -12];
     const randomInterval = intervals[Math.floor(Math.random() * intervals.length)];
     const responseMidi = midi + randomInterval;
     const note = this.midiToNote(responseMidi);
     this.currentInstrumentNode?.triggerAttackRelease(note, '8n', time + Tone.Time('4n').toSeconds(), 0.4);
  }

  private startArpLoop() {
    if (this.arpLoop) return;
    let index = 0;
    this.arpLoop = new Tone.Loop(time => {
      if (this.arpNotes.length === 0) return;
      let midi;
      const pattern = this.arpeggiatorPattern();
      if (pattern === 'up') {
        midi = this.arpNotes[index % this.arpNotes.length];
        index++;
      } else if (pattern === 'down') {
        midi = this.arpNotes[(this.arpNotes.length - 1 - index) % this.arpNotes.length];
        index++;
      } else {
        midi = this.arpNotes[Math.floor(Math.random() * this.arpNotes.length)];
      }
      const note = this.midiToNote(midi);
      this.currentInstrumentNode?.triggerAttackRelease(note, '16n', time);
    }, this.arpeggiatorRate()).start(0);
    Tone.getTransport().start();
  }

  private stopArpLoop() {
    if (this.arpLoop) {
      this.arpLoop.dispose();
      this.arpLoop = null;
    }
  }

  private generateSmartChord(rootNote: string): string[] {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octaveMatch = rootNote.match(/\d+$/);
    if (!octaveMatch) return [rootNote];
    const octave = parseInt(octaveMatch[0]);
    const name = rootNote.replace(/\d+$/, '');
    const rootMidi = (octave + 1) * 12 + names.indexOf(name);
    const noteInScale = names.indexOf(name) % 12;

    if (noteInScale === 0) return [rootMidi, rootMidi + 4, rootMidi + 7, rootMidi + 11, rootMidi + 14].map(m => this.midiToNote(m));
    if (noteInScale === 2) return [rootMidi, rootMidi + 3, rootMidi + 7, rootMidi + 10, rootMidi + 14].map(m => this.midiToNote(m));
    if (noteInScale === 4) return [rootMidi, rootMidi + 3, rootMidi + 7, rootMidi + 10].map(m => this.midiToNote(m));
    if (noteInScale === 5) return [rootMidi, rootMidi + 4, rootMidi + 7, rootMidi + 11, rootMidi + 14].map(m => this.midiToNote(m));
    if (noteInScale === 7) return [rootMidi, rootMidi + 4, rootMidi + 7, rootMidi + 10, rootMidi + 14].map(m => this.midiToNote(m));
    if (noteInScale === 9) return [rootMidi, rootMidi + 3, rootMidi + 7, rootMidi + 10, rootMidi + 14].map(m => this.midiToNote(m));
    if (noteInScale === 11) return [rootMidi, rootMidi + 3, rootMidi + 6, rootMidi + 10].map(m => this.midiToNote(m));

    const isMinor = ![0, 5, 7].includes(noteInScale);
    return isMinor
      ? [rootMidi, rootMidi + 3, rootMidi + 7].map(m => this.midiToNote(m))
      : [rootMidi, rootMidi + 4, rootMidi + 7].map(m => this.midiToNote(m));
  }
}
