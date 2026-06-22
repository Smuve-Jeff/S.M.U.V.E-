import { Instrument } from './instrument';
import { Sampler } from './sampler';

export interface PadFX {
  saturation: number;
  cutoff: number;
  resonance: number;
  bitCrush: number;
}

export interface DrumPad {
  id: string;
  name: string;
  pitch: number;
  fx: PadFX;
  gain: GainNode;
  filter: BiquadFilterNode;
}

export class DrumMachine extends Instrument {
  private sampler: Sampler;
  private pads: DrumPad[] = [];
  private connectedPads = new Set<number>();

  private rollIntervals: Map<string, any> = new Map();

  constructor(context: AudioContext) {
    super(context, 32); // Higher polyphony for drums
    this.sampler = new Sampler(this.audioContext);

    const padNames = [
      'Kick', 'Snare', 'Clap', 'Hi-Hat (C)',
      'Hi-Hat (O)', 'Tom', 'Rim', 'Crash',
    ];

    padNames.forEach((name, i) => {
      const gain = this.audioContext.createGain();
      const filter = this.audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 20000;

      // Wire per-pad FX chain into the main output
      gain.connect(filter);
      filter.connect(this.output);

      const pad: DrumPad = {
        id: `pad-${36 + i}`,
        name,
        pitch: 36 + i,
        fx: { saturation: 0, cutoff: 20000, resonance: 1, bitCrush: 0 },
        gain,
        filter
      };
      this.pads.push(pad);
    });
  }

  play(note: number, velocity: number): void {
    this.triggerPad(note, velocity / 127);
  }

  stop(note: number): void {
    // Drums usually don't stop, but we can implement choke groups here
  }

  loadSample(pitch: number, buffer: AudioBuffer, velocityThreshold: number = 127) {
    this.sampler.loadSample(pitch, buffer, velocityThreshold);
  }

  triggerPad(
    pitch: number,
    velocity: number,
    when: number = this.audioContext.currentTime
  ) {
    const pad = this.pads.find((p) => p.pitch === pitch);
    if (pad) {
      // Apply pad FX settings to the filter
      pad.filter.frequency.setValueAtTime(pad.fx.cutoff, when);
      pad.filter.Q.setValueAtTime(pad.fx.resonance, when);

      // Route sampler through this pad's FX chain on first use
      if (!this.connectedPads.has(pitch)) {
        this.sampler.connect(pad.gain);
        this.connectedPads.add(pitch);
      }

      this.sampler.play(pitch, velocity, when);
    }
  }

  startRoll(pitch: number, velocity: number, rateHz: number = 10) {
    if (this.rollIntervals.has(pitch.toString())) return;

    const interval = setInterval(() => {
      this.triggerPad(pitch, velocity);
    }, 1000 / rateHz);

    this.rollIntervals.set(pitch.toString(), interval);
  }

  stopRoll(pitch: number) {
    const interval = this.rollIntervals.get(pitch.toString());
    if (interval) {
      clearInterval(interval);
      this.rollIntervals.delete(pitch.toString());
    }
  }

  getPads() {
    return this.pads;
  }
}
