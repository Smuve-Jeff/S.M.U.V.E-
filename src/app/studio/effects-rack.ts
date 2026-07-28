import { DynamicEffectsRack, PluginSlot } from './effects/dynamic-effects-rack';

export type { PluginSlot };

export interface EffectNode {
  id: string;
  name: string;
  type: 'eq' | 'delay' | 'reverb' | 'distortion' | 'compressor' | 'sidechain';
  instance: any;
  enabled: boolean;
}

const TYPE_TO_PLUGIN: Record<string, string> = {
  eq: 'smuve.eq.v1',
  delay: 'smuve.delay.v1',
  reverb: 'smuve.reverb.v1',
  distortion: 'smuve.distortion.v1',
  compressor: 'smuve.compressor.v1',
  sidechain: 'smuve.sidechain.v1',
};

/**
 * Backward-compatible EffectsRack that delegates to DynamicEffectsRack.
 * Existing code using addEffect(type, name) continues to work,
 * while new code can use the full dynamic plugin architecture.
 */
export class EffectsRack {
  private readonly _rack: DynamicEffectsRack;
  private readonly _slotMap = new Map<string, PluginSlot>();

  constructor(private readonly audioContext: AudioContext) {
    this._rack = new DynamicEffectsRack(audioContext);
  }

  get input(): AudioNode { return this._rack.input; }
  get output(): AudioNode { return this._rack.output; }

  getInput(): GainNode {
    return this._rack.input as GainNode;
  }

  getOutput(): GainNode {
    return this._rack.output as GainNode;
  }

  addEffect(type: EffectNode['type'], name: string): EffectNode {
    const pluginId = TYPE_TO_PLUGIN[type];
    if (!pluginId) throw new Error(`Unknown effect type: ${type}`);

    const slot = this._rack.addInsert(pluginId);
    if (!slot) throw new Error(`Failed to create plugin: ${pluginId}`);

    this._slotMap.set(slot.id, slot);

    return {
      id: slot.id,
      name,
      type,
      instance: slot.plugin,
      enabled: true,
    };
  }

  removeEffect(id: string): void {
    this._rack.removeInsert(id);
    this._slotMap.delete(id);
  }

  toggleEffect(id: string): void {
    this._rack.toggleInsert(id);
  }

  getEffects(): EffectNode[] {
    return this._rack.inserts.map((slot) => {
      // Reverse-map plugin id to EffectNode type
      const typeEntry = Object.entries(TYPE_TO_PLUGIN).find(
        ([, pid]) => pid === slot.plugin.id
      );
      return {
        id: slot.id,
        name: slot.plugin.name,
        type: (typeEntry?.[0] ?? 'eq') as EffectNode['type'],
        instance: slot.plugin,
        enabled: slot.plugin.enabled,
      };
    });
  }

  /** Access the underlying dynamic rack for advanced usage */
  get dynamicRack(): DynamicEffectsRack {
    return this._rack;
  }

  dispose(): void {
    this._rack.dispose();
    this._slotMap.clear();
  }
}
