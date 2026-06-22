import { VoiceManager } from './performance-utils';

export abstract class Instrument {
  protected readonly output: GainNode;
  protected voiceManager: VoiceManager;

  constructor(protected readonly audioContext: AudioContext, maxVoices: number = 16) {
    this.output = this.audioContext.createGain();
    this.voiceManager = new VoiceManager(maxVoices);
  }

  abstract play(note: number, velocity: number): void;
  abstract stop(note: number): void;

  connect(destination: AudioNode) {
    this.output.connect(destination);
  }

  disconnect() {
    this.output.disconnect();
  }
}
