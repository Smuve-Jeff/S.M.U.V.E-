import { Sampler } from './sampler';

export interface DrumPad {
  id: string;
  name: string;
  pitch: number;
  buffer?: AudioBuffer;
}

export class DrumMachine {
  private sampler: Sampler;
  private pads: DrumPad[] = [];

  constructor(private readonly context: AudioContext) {
    this.sampler = new Sampler(this.context);

    const padNames = ['Kick', 'Snare', 'Clap', 'Hi-Hat (C)', 'Hi-Hat (O)', 'Tom', 'Rim', 'Crash'];
    padNames.forEach((name, i) => {
      this.pads.push({ id: `pad-${i}`, name, pitch: 36 + i });
    });
  }

  loadSample(padId: string, buffer: AudioBuffer) {
    const pad = this.pads.find(p => p.id === padId);
    if (pad) {
      pad.buffer = buffer;
      this.sampler.loadSample(pad.pitch, buffer);
    }
  }

  triggerPad(padId: string, velocity: number, when: number = this.context.currentTime) {
    const pad = this.pads.find(p => p.id === padId);
    if (pad) {
      this.sampler.play(pad.pitch, velocity, when);
    }
  }

  getPads() {
    return this.pads;
  }

  connect(destination: AudioNode) {
    this.sampler.connect(destination);
  }

  disconnect() {
    this.sampler.disconnect();
  }
}
