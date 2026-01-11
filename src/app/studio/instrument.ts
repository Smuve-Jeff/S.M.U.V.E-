export abstract class Instrument {
  protected readonly output: GainNode;
  constructor(protected readonly audioContext: AudioContext) {
    this.output = this.audioContext.createGain();
  }

  abstract play(note: number, velocity: number): void;
  abstract stop(note: number): void;

  connect(destination: AudioNode) {
    this.output.connect(destination);
  }
}
