import { Equalizer } from './equalizer';
import { Delay } from './delay';
import { Saturation } from './saturation';
import { SidechainCompressor } from './sidechain-compressor';
import { Reverb } from './reverb';
import { Compressor } from './compressor';

export interface EffectNode {
  id: string;
  name: string;
  type: 'eq' | 'delay' | 'reverb' | 'distortion' | 'compressor' | 'sidechain';
  instance: any; // The class instance (Equalizer, Delay, etc.)
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

  addEffect(type: EffectNode['type'], name: string) {
    let instance: any;
    switch (type) {
      case 'eq':
        instance = new Equalizer(this.audioContext);
        break;
      case 'delay':
        instance = new Delay(this.audioContext);
        break;
      case 'reverb':
        instance = new Reverb(this.audioContext);
        break;
      case 'distortion':
        instance = new Saturation(this.audioContext);
        break;
      case 'compressor':
        instance = new Compressor(this.audioContext);
        break;
      case 'sidechain':
        instance = new SidechainCompressor(this.audioContext);
        break;
      default:
        throw new Error(`Unknown effect type: ${type}`);
    }

    const effect: EffectNode = {
      id: Math.random().toString(36).substring(7),
      name,
      type,
      instance,
      enabled: true
    };
    this.effects.push(effect);
    this.rebuildChain();
    return effect;
  }

  removeEffect(id: string) {
    this.effects = this.effects.filter(e => e.id !== id);
    this.rebuildChain();
  }

  private rebuildChain() {
    this.input.disconnect();
    let current: AudioNode = this.input;

    for (const effect of this.effects) {
      if (effect.enabled) {
        current.connect(effect.instance.input);
        current = effect.instance.output;
      }
    }
    current.connect(this.output);
  }

  toggleEffect(id: string) {
    const effect = this.effects.find(e => e.id === id);
    if (effect) {
      effect.enabled = !effect.enabled;
      this.rebuildChain();
    }
  }

  getEffects() {
    return this.effects;
  }
}
