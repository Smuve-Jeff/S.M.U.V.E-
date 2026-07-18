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
    const channel = status & 0xf;
    const velocity = data2;

    switch (cmd) {
      case 9: // Note On
        if (velocity > 0) this.triggerNoteStart(data1, velocity / 127);
        else this.triggerNoteEnd(data1);
        break;
      case 8: // Note Off
        this.triggerNoteEnd(data1);
        break;
      case 11: // Control Change (CC)
        this.handleMidiCC(data1, data2);
        break;
      case 14: // Pitch Bend
        this.handlePitchBend(data1, data2);
        break;
      case 12: // Program Change (instrument select)
        break;
    }
  }

  private sustainActive = false;
  private sustainedNotes = new Set<number>();

  private handleMidiCC(cc: number, value: number) {
    const normalized = value / 127;
    switch (cc) {
      case 1: // Mod Wheel
        this.setModWheel(normalized);
        break;
      case 7: // Volume
        this.updateParameter('volume', normalized);
        break;
      case 10: // Pan
        break;
      case 11: // Expression
        if (this.currentInstrumentNode instanceof Tone.PolySynth) {
          this.currentInstrumentNode.set({ volume: (normalized - 1) * 40 });
        }
        break;
      case 64: // Sustain Pedal
        this.handleSustainPedal(value >= 64);
        break;
      case 71: // Resonance / Filter Q
        this.updateParameter('resonance', normalized * 20);
        break;
      case 74: // Filter Cutoff (brightness)
        this.updateParameter('cutoff', 100 + normalized * 19900);
        break;
      case 72: // Release
        this.updateParameter('release', 0.01 + normalized * 4);
        break;
      case 73: // Attack
        this.updateParameter('attack', 0.001 + normalized * 2);
        break;
      case 75: // Decay
        this.updateParameter('decay', 0.01 + normalized * 3);
        break;
      case 70: // Sound Controller (mapped to cutoff)
        this.updateParameter('cutoff', 100 + normalized * 19900);
        break;
    }
  }

  private handleSustainPedal(down: boolean) {
    this.sustainActive = down;
    if (!down && this.sustainedNotes.size > 0) {
      this.sustainedNotes.forEach((midi) => this.triggerNoteEnd(midi));
      this.sustainedNotes.clear();
    }
  }

  private handlePitchBend(lsb: number, msb: number) {
    const value = (msb << 7) | lsb;
    const normalized = (value - 8192) / 8192; // -1 to +1
    this.setPitchBend(normalized);
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
    return `${names[midi % 12]}${octave}`;
  }

  private connectToFilter(node: Tone.PolySynth | Tone.Sampler, cutoff: number) {
    this.filterNode = new Tone.Filter(cutoff, 'lowpass').connect(
      Tone.getDestination()
    );
    node.connect(this.filterNode);
  }

  async setInstrument(presetId: string) {
    if (!this.isInitialized()) await this.initialize();

    const preset = this.instrumentsService
      .getPresets()
      .find((p) => p.id === presetId);
    if (!preset) return;

    this.activeInstrument.set(presetId);
    this.activePreset = preset;

    if (this.currentInstrumentNode) this.currentInstrumentNode.dispose();
    if (this.filterNode) this.filterNode.dispose();

    if (preset.type === 'synth' && preset.synth) {
      const config = preset.synth;
      this.currentInstrumentNode = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: config.type as any },
        envelope: {
          attack: config.attack,
          decay: config.decay,
          sustain: config.sustain,
          release: config.release,
        },
      });
      this.connectToFilter(this.currentInstrumentNode, config.cutoff || 2000);
    } else if (preset.type === 'sample' && preset.zones?.length) {
      const sampleMap: any = {};
      preset.zones.forEach(
        (z) => (sampleMap[this.midiToNote(z.midiRange[0])] = z.url)
      );
      this.currentInstrumentNode = new Tone.Sampler({
        urls: sampleMap,
        release: 1,
      });
      this.connectToFilter(this.currentInstrumentNode, 2000);
    }
  }

  triggerNoteStart(midi: number, velocity: number = 0.8) {
    if (!this.currentInstrumentNode) return;
    const note = this.midiToNote(midi);
    const time = Tone.now();
    this.currentInstrumentNode.triggerAttack(note, time, velocity);
  }

  triggerNoteEnd(midi: number) {
    if (!this.currentInstrumentNode) return;
    const note = this.midiToNote(midi);
    this.currentInstrumentNode.triggerRelease(note, Tone.now());
  }

  updateParameter(param: string, value: number) {
    if (!this.currentInstrumentNode) return;
    if (param === 'cutoff' && this.filterNode)
      this.filterNode.frequency.value = value;
    if (param === 'resonance' && this.filterNode)
      this.filterNode.Q.value = value;

    if (
      param === 'attack' ||
      param === 'release' ||
      param === 'decay' ||
      param === 'sustain'
    ) {
      if (this.currentInstrumentNode instanceof Tone.PolySynth) {
        this.currentInstrumentNode.set({
          envelope: { [param]: value },
        });
      }
    }
  }

  setScale(mode: any) {
    this.scaleMode.set(mode);
  }
  setPitchBend(val: number) {
    if (this.currentInstrumentNode)
      (this.currentInstrumentNode as any).set({ detune: val * 200 });
  }
  setModWheel(val: number) {
    if (!this.currentInstrumentNode || !this.filterNode) return;
    // Mod wheel sweeps filter cutoff from preset cutoff to max
    const baseCutoff = this.activePreset?.synth?.cutoff || 2000;
    const maxCutoff = 20000;
    const cutoff = baseCutoff + val * (maxCutoff - baseCutoff);
    this.filterNode.frequency.rampTo(cutoff, 0.05);
  }
}
