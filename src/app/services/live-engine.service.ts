import { Injectable, signal, inject } from '@angular/core';
import * as Tone from 'tone';
import { LoggingService } from './logging.service';
import { InstrumentsService, InstrumentPreset } from './instruments.service';
import { AudioEngineService } from './audio-engine.service';
import { HardwareService } from './hardware.service';

export type LiveInstrumentType = string;

@Injectable({
  providedIn: 'root',
})
export class LiveEngineService {
  private logger = inject(LoggingService);
  private instrumentsService = inject(InstrumentsService);
  private audioEngine = inject(AudioEngineService);
  private hardwareService = inject(HardwareService);

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

  // Live note tracking
  private activeNotes = new Set<string>();

  // Arpeggiator State
  arpeggiatorEnabled = signal(false);
  arpeggiatorRate = signal('8n');
  arpeggiatorPattern = signal<'up' | 'down' | 'upDown' | 'random'>('up');
  private arpLoop: Tone.Loop | null = null;
  private arpNotes: number[] = [];

  async initialize() {
    if (this.isInitialized()) return;

    // Crucial: Sync Tone with our core Audio Engine context
    if (Tone.getContext().rawContext !== this.audioEngine.ctx) {
       Tone.setContext(this.audioEngine.ctx);
    }

    await Tone.start();
    this.isInitialized.set(true);
    this.setupMidi();
  }

  private setupMidi() {
    if (typeof navigator !== 'undefined' && (navigator as any).requestMIDIAccess) {
      (navigator as any).requestMIDIAccess().then(
        (access: any) => {
          this.midiEnabled.set(true);
          const inputs = Array.from(access.inputs.values()) as any[];
          this.availableMidiInputs.set(inputs.map((i) => i.name || 'Unknown Device'));
          this.hardwareService.updateMidiCount(inputs.length);
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
    const velocity = data2;
    if (cmd === 9 && velocity > 0) this.triggerNoteStart(data1, velocity / 127);
    else if (cmd === 8 || (cmd === 9 && velocity === 0)) this.triggerNoteEnd(data1);
  }

  public midiToNote(midi: number): string {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    return `${names[midi % 12]}${octave}`;
  }

  private quantizeToScale(midi: number): number {
    const octave = Math.floor(midi / 12) * 12;
    const degree = midi % 12;
    const scale = this.currentScale();
    if (scale.length === 0) return midi;
    let nearest = scale[0];
    let nearestDiff = Math.abs(degree - nearest);
    for (const step of scale) {
      const diff = Math.abs(degree - step);
      if (diff < nearestDiff) {
        nearest = step;
        nearestDiff = diff;
      }
    }
    return octave + nearest;
  }

  private connectToFilter(node: Tone.PolySynth | Tone.Sampler, cutoff: number) {
    this.filterNode = new Tone.Filter(cutoff, 'lowpass').connect(Tone.getDestination());
    node.connect(this.filterNode);
  }

  async setInstrument(presetId: string) {
    if (!this.isInitialized()) await this.initialize();

    const preset = this.instrumentsService.getPresets().find((p) => p.id === presetId);
    if (!preset) return;

    this.activeInstrument.set(presetId);
    this.activePreset = preset;

    if (this.currentInstrumentNode) this.currentInstrumentNode.dispose();
    if (this.filterNode) this.filterNode.dispose();

    if (preset.type === 'synth' && preset.synth) {
      const config = preset.synth;
      this.currentInstrumentNode = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: config.type as any },
        envelope: { attack: config.attack, decay: config.decay, sustain: config.sustain, release: config.release },
      });
      this.connectToFilter(this.currentInstrumentNode, config.cutoff || 2000);
    } else if (preset.type === 'sample' && preset.zones?.length) {
      const sampleMap: any = {};
      preset.zones.forEach(z => sampleMap[this.midiToNote(z.midiRange[0])] = z.url);
      this.currentInstrumentNode = new Tone.Sampler({ urls: sampleMap, release: 1 });
      this.connectToFilter(this.currentInstrumentNode, 2000);
    }
  }

  triggerNoteStart(midi: number, velocity: number = 0.8) {
    if (!this.currentInstrumentNode) return;
    const pitch = this.scaleLock() ? this.quantizeToScale(midi) : midi;
    const note = this.midiToNote(pitch);
    const time = Tone.now();
    this.currentInstrumentNode.triggerAttack(note, time, velocity);
    this.activeNotes.add(note);
  }

  triggerNoteEnd(midi: number) {
    if (!this.currentInstrumentNode) return;
    const note = this.midiToNote(midi);
    this.currentInstrumentNode.triggerRelease(note, Tone.now());
    this.activeNotes.delete(note);
  }

  stopAllNotes() {
    if (!this.currentInstrumentNode) return;
    for (const note of Array.from(this.activeNotes)) {
      this.currentInstrumentNode.triggerRelease(note, Tone.now());
    }
    this.activeNotes.clear();
  }

  updateParameter(param: string, value: number) {
    if (!this.currentInstrumentNode) return;
    if (param === 'cutoff' && this.filterNode) this.filterNode.frequency.value = value;
    if (param === 'resonance' && this.filterNode) this.filterNode.Q.value = value;

    if (param === 'attack' || param === 'release' || param === 'decay' || param === 'sustain') {
      if (this.currentInstrumentNode instanceof Tone.PolySynth) {
        this.currentInstrumentNode.set({
          envelope: { [param]: value }
        });
      }
    }
  }

  setScale(mode: any) {
    this.scaleMode.set(mode);
    const scales: Record<string, number[]> = {
      major: [0, 2, 4, 5, 7, 9, 11],
      minor: [0, 2, 3, 5, 7, 8, 10],
      blues: [0, 3, 5, 6, 7, 10],
      pentatonic: [0, 2, 4, 7, 9],
    };
    this.currentScale.set(scales[mode] || [0, 2, 4, 5, 7, 9, 11]);
  }

  setPitchBend(val: number) {
    if (!this.currentInstrumentNode) return;
    const detuneVal = val * 200;
    (this.currentInstrumentNode as any).set({ detune: detuneVal });
  }

  setModWheel(val: number) {
    if (!this.currentInstrumentNode) return;
    if (this.filterNode) {
      this.filterNode.Q.value = 1 + val * 20;
      this.filterNode.frequency.value = 250 + val * 5000;
    }
    if ((this.currentInstrumentNode as any).volume) {
      (this.currentInstrumentNode as any).volume.value = -12 + val * 12;
    }
  }

  setModulation(val: number) {
    this.setModWheel(val);
  }
}
