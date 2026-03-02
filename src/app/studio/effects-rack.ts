export interface EffectNode {
  name: string;
  type: 'eq' | 'delay' | 'reverb' | 'distortion';
  node: AudioNode;
  params: any;
  enabled: boolean;
}

export class EffectsRack {
  private effects: EffectNode[] = [];
  private input: GainNode;
  private output: GainNode;

  constructor(private readonly audioContext: AudioContext) {
    this.input = this.audioContext.createGain();
    this.output = this.audioContext.createGain();
    this.input.connect(this.output);
  }

  getInput(): GainNode {
    return this.input;
  }

  getOutput(): GainNode {
    return this.output;
  }

  addEffect(type: 'eq' | 'delay' | 'reverb' | 'distortion', name: string) {
    let node: AudioNode;
    switch (type) {
      case 'eq':
        const eq = this.audioContext.createBiquadFilter();
        eq.type = 'peaking';
        eq.frequency.value = 1000;
        eq.gain.value = 0;
        node = eq;
        break;
      case 'delay':
        const delay = this.audioContext.createDelay();
        delay.delayTime.value = 0.5;
        node = delay;
        break;
      case 'reverb':
        const reverb = this.audioContext.createConvolver();
        node = reverb;
        break;
      case 'distortion':
        const distortion = this.audioContext.createWaveShaper();
        node = distortion;
        break;
      default:
        throw new Error('Unknown effect type');
    }

    const effect: EffectNode = { name, type, node, params: {}, enabled: true };
    this.effects.push(effect);
    this.rebuildChain();
  }

  private rebuildChain() {
    this.input.disconnect();
    let current: AudioNode = this.input;

    for (const effect of this.effects) {
      if (effect.enabled) {
        current.connect(effect.node);
        current = effect.node;
      }
    }
    current.connect(this.output);
  }

  toggleEffect(index: number) {
    if (this.effects[index]) {
      this.effects[index].enabled = !this.effects[index].enabled;
      this.rebuildChain();
    }
  }

  getEffects() {
    return this.effects;
  }
}
