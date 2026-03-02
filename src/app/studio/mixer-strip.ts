import { EffectsRack } from './effects-rack';

export class MixerStrip {
  private input: GainNode;
  private panner: StereoPannerNode;
  private effectsRack: EffectsRack;
  private output: GainNode;

  constructor(private readonly audioContext: AudioContext) {
    this.input = this.audioContext.createGain();
    this.panner = this.audioContext.createStereoPanner();
    this.effectsRack = new EffectsRack(this.audioContext);
    this.output = this.audioContext.createGain();

    this.input.connect(this.effectsRack.getInput());
    this.effectsRack.getOutput().connect(this.panner);
    this.panner.connect(this.output);
  }

  getInput(): GainNode {
    return this.input;
  }

  getOutput(): GainNode {
    return this.output;
  }

  setVolume(volume: number) {
    this.output.gain.setValueAtTime(volume / 100, this.audioContext.currentTime);
  }

  setPan(pan: number) {
    this.panner.pan.setValueAtTime(pan / 100, this.audioContext.currentTime);
  }

  getEffectsRack(): EffectsRack {
    return this.effectsRack;
  }
}
