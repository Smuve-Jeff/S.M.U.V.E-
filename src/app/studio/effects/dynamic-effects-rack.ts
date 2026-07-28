import { IAudioPlugin, PluginRegistry, PluginCategory, PluginParam } from './plugin-interface';
import { Equalizer } from '../equalizer';
import { Delay } from '../delay';
import { Saturation } from '../saturation';
import { SidechainCompressor } from '../sidechain-compressor';
import { Reverb } from '../reverb';
import { Compressor } from '../compressor';

/** A single slot in the effects rack — insert or send */
export interface PluginSlot {
  id: string;
  plugin: IAudioPlugin;
  /** insert = inline processing, send = parallel aux */
  mode: 'insert' | 'send';
  /** Send level (0-1) — only relevant for send mode */
  sendLevel: number;
  /** Which aux bus this send routes to */
  auxBus?: string;
}

/** Signal chain insert point — pre-fader, post-fader, or on an aux bus */
export type InsertPoint = 'pre-fader' | 'post-fader' | 'master';

/**
 * Professional Dynamic Effects Rack
 * 
 * Supports unlimited insert plugins in series, parallel aux sends to
 * named buses, master bus processing, and dynamic slot reordering.
 * Each plugin adheres to IAudioPlugin for VST-style interoperability.
 */
export class DynamicEffectsRack {
  /** Ordered insert slots (processed in series) */
  private _inserts: PluginSlot[] = [];

  /** Send slots (parallel routing to aux buses) */
  private _sends: PluginSlot[] = [];

  /** Master bus processing (post everything) */
  private _masterSlots: PluginSlot[] = [];

  /** Named aux buses: busName → { gainNode, slots } */
  private _auxBuses = new Map<string, { gain: GainNode; slots: PluginSlot[] }>();

  // Audio routing nodes
  private readonly _input: GainNode;
  private readonly _output: GainNode;
  private readonly _sendBus: GainNode; // Dry+processed → sends split
  private readonly _dryBus: GainNode; // Bypass path
  private readonly _masterInput: GainNode; // Pre-master node

  constructor(private readonly ctx: AudioContext) {
    this._input = ctx.createGain();
    this._output = ctx.createGain();
    this._sendBus = ctx.createGain();
    this._dryBus = ctx.createGain();
    this._masterInput = ctx.createGain();

    // Default routing: input → dryBus → output (bypass)
    this._input.connect(this._dryBus);
    this._dryBus.connect(this._output);
  }

  get input(): AudioNode {
    return this._input;
  }

  get output(): AudioNode {
    return this._output;
  }

  // ---- Insert Slots ----

  get inserts(): readonly PluginSlot[] {
    return this._inserts;
  }

  /** Add an insert plugin at the end of the chain */
  addInsert(pluginId: string, name?: string): PluginSlot | null {
    const plugin = PluginRegistry.create(pluginId, this.ctx);
    if (!plugin) return null;

    const slot: PluginSlot = {
      id: `ins_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      plugin,
      mode: 'insert',
      sendLevel: 0,
    };

    this._inserts.push(slot);
    this.rebuildChain();
    return slot;
  }

  /** Remove an insert slot by id */
  removeInsert(slotId: string): void {
    const idx = this._inserts.findIndex((s) => s.id === slotId);
    if (idx >= 0) {
      this._inserts[idx].plugin.dispose();
      this._inserts.splice(idx, 1);
      this.rebuildChain();
    }
  }

  /** Move an insert slot to a new position (0-indexed) */
  moveInsert(slotId: string, newIndex: number): void {
    const idx = this._inserts.findIndex((s) => s.id === slotId);
    if (idx < 0) return;
    const [slot] = this._inserts.splice(idx, 1);
    this._inserts.splice(Math.max(0, Math.min(newIndex, this._inserts.length)), 0, slot);
    this.rebuildChain();
  }

  /** Toggle an insert plugin on/off */
  toggleInsert(slotId: string): void {
    const slot = this._inserts.find((s) => s.id === slotId);
    if (slot) {
      slot.plugin.enabled = !slot.plugin.enabled;
      this.rebuildChain();
    }
  }

  // ---- Send Slots ----

  get sends(): readonly PluginSlot[] {
    return this._sends;
  }

  /** Add a parallel send to an aux bus */
  addSend(pluginId: string, auxBus: string, sendLevel = 0.5): PluginSlot | null {
    const plugin = PluginRegistry.create(pluginId, this.ctx);
    if (!plugin) return null;

    // Ensure aux bus exists
    if (!this._auxBuses.has(auxBus)) {
      const busGain = this.ctx.createGain();
      busGain.gain.value = 1;
      this._auxBuses.set(auxBus, { gain: busGain, slots: [] });
      // Connect bus return to output
      busGain.connect(this._output);
    }

    const slot: PluginSlot = {
      id: `snd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      plugin,
      mode: 'send',
      sendLevel: Math.max(0, Math.min(1, sendLevel)),
      auxBus,
    };

    this._sends.push(slot);
    this.rebuildChain();
    return slot;
  }

  /** Remove a send slot */
  removeSend(slotId: string): void {
    const idx = this._sends.findIndex((s) => s.id === slotId);
    if (idx >= 0) {
      this._sends[idx].plugin.dispose();
      this._sends.splice(idx, 1);
      this.rebuildChain();
    }
  }

  /** Update send level for a send slot */
  setSendLevel(slotId: string, level: number): void {
    const slot = this._sends.find((s) => s.id === slotId);
    if (slot) {
      slot.sendLevel = Math.max(0, Math.min(1, level));
      this.rebuildChain();
    }
  }

  // ---- Master Bus ----

  get masterSlots(): readonly PluginSlot[] {
    return this._masterSlots;
  }

  /** Add a master bus processor (limiter, exciter, etc.) */
  addMaster(pluginId: string): PluginSlot | null {
    const plugin = PluginRegistry.create(pluginId, this.ctx);
    if (!plugin) return null;

    const slot: PluginSlot = {
      id: `mst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      plugin,
      mode: 'insert',
      sendLevel: 0,
    };

    this._masterSlots.push(slot);
    this.rebuildChain();
    return slot;
  }

  removeMaster(slotId: string): void {
    const idx = this._masterSlots.findIndex((s) => s.id === slotId);
    if (idx >= 0) {
      this._masterSlots[idx].plugin.dispose();
      this._masterSlots.splice(idx, 1);
      this.rebuildChain();
    }
  }

  // ---- Aux Buses ----

  getAuxBusLevel(busName: string): number {
    return this._auxBuses.get(busName)?.gain.gain.value ?? 1;
  }

  setAuxBusLevel(busName: string, level: number): void {
    const bus = this._auxBuses.get(busName);
    if (bus) {
      bus.gain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.05);
    }
  }

  listAuxBuses(): string[] {
    return Array.from(this._auxBuses.keys());
  }

  // ---- Query ----

  getAllSlots(): PluginSlot[] {
    return [...this._inserts, ...this._sends, ...this._masterSlots];
  }

  findSlot(slotId: string): PluginSlot | undefined {
    return this.getAllSlots().find((s) => s.id === slotId);
  }

  // ---- Chain Rebuild (the core routing engine) ----

  private rebuildChain(): void {
    // Disconnect everything
    this._input.disconnect();
    this._dryBus.disconnect();
    this._sendBus.disconnect();
    this._masterInput.disconnect();

    // Reconnect dry path
    this._input.connect(this._dryBus);

    // If worklet is active, route input → worklet → sendBus (bypassing per-node chain)
    if (this._useWorklet && this._workletNode) {
      this._input.connect(this._workletNode);
      this._workletNode.connect(this._sendBus);
      // Still route sends to aux buses from the worklet output
    } else {
      // Build insert chain: input → [inserts] → sendBus
      let current: AudioNode = this._input;

      for (const slot of this._inserts) {
        if (!slot.plugin.enabled) continue;
        current.connect(slot.plugin.input);
        current = slot.plugin.output;
      }

      current.connect(this._sendBus);
    }

    // Route sends: sendBus → send plugins → aux bus gains
    for (const slot of this._sends) {
      if (!slot.plugin.enabled || !slot.auxBus) continue;
      const bus = this._auxBuses.get(slot.auxBus);
      if (!bus) continue;

      const sendGain = this.ctx.createGain();
      sendGain.gain.value = slot.sendLevel;
      this._sendBus.connect(sendGain);
      sendGain.connect(slot.plugin.input);
      slot.plugin.output.connect(bus.gain);
    }

    // Master chain: sendBus → [masterSlots] → output
    this._sendBus.connect(this._masterInput);
    let masterCurrent: AudioNode = this._masterInput;

    for (const slot of this._masterSlots) {
      if (!slot.plugin.enabled) continue;
      masterCurrent.connect(slot.plugin.input);
      masterCurrent = slot.plugin.output;
    }

    masterCurrent.connect(this._output);

    // Dry bypass: if no inserts and no sends, sendBus → output directly
    if (this._inserts.length === 0 && this._sends.length === 0 && this._masterSlots.length === 0) {
      this._input.connect(this._output);
    }
  }

  // ── Worklet-based processing (Phase 1 latency offload) ──

  private _workletNode: AudioWorkletNode | null = null;
  private _workletLoaded = false;
  private _useWorklet = false;

  get useWorklet(): boolean {
    return this._useWorklet;
  }

  /**
   * Enable worklet-based processing.
   * Loads the effects-processor AudioWorklet and routes audio through it
   * instead of chaining individual WebAudio plugin nodes on the main thread.
   * Falls back gracefully to main-thread mode if the worklet fails to load.
   */
  async enableWorklet(): Promise<boolean> {
    if (this._workletLoaded && this._workletNode) return true;

    try {
      await this.ctx.audioWorklet.addModule(
        'assets/worklets/effects-processor.worklet.js'
      );
    } catch (err: any) {
      if (!err?.message?.includes('already')) {
        console.warn('DynamicEffectsRack: Worklet load failed, using main-thread fallback.', err?.message);
        return false;
      }
    }

    try {
      this._workletNode = new AudioWorkletNode(this.ctx, 'effects-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
      });
      this._workletLoaded = true;
      this._useWorklet = true;
      this._syncWorkletState();
      this.rebuildChain();
      return true;
    } catch (err: any) {
      console.warn('DynamicEffectsRack: Worklet node creation failed.', err?.message);
      return false;
    }
  }

  /** Disable worklet and revert to main-thread plugin nodes */
  disableWorklet(): void {
    this._useWorklet = false;
    this._workletNode?.disconnect();
    this._workletNode?.port.postMessage({ slot: 'reset' });
    this._workletNode = null;
    this._workletLoaded = false;
    this.rebuildChain();
  }

  /** Push the current plugin state to the worklet processor */
  private _syncWorkletState(): void {
    if (!this._workletNode) return;
    const port = this._workletNode.port;

    // Sync inserts (currently only full-chain sync — individual slot config would be richer)
    for (const slot of this._inserts) {
      if (!slot.plugin.enabled) continue;
      // Map plugin types to worklet slot names
      this._syncSlotToWorklet(port, slot);
    }
    for (const slot of this._masterSlots) {
      if (!slot.plugin.enabled) continue;
      this._syncSlotToWorklet(port, slot);
    }
  }

  private _syncSlotToWorklet(port: MessagePort, slot: PluginSlot): void {
    const pid = slot.plugin.id;
    if (pid === 'smuve.eq.v1') {
      port.postMessage({ slot: 'eq', action: 'enable', payload: true });
      const bands = (slot.plugin as any)._eq?.getBands?.();
      if (bands) {
        bands.forEach((b: any, i: number) => {
          port.postMessage({ slot: 'eq', action: 'configure', payload: { band: i, gain: b.gain || 0 } });
        });
      }
    } else if (pid === 'smuve.compressor.v1') {
      port.postMessage({ slot: 'compressor', action: 'enable', payload: true });
      const comp = (slot.plugin as any)._comp;
      if (comp) {
        port.postMessage({
          slot: 'compressor',
          action: 'configure',
          payload: {
            thresholdDb: comp.compressor?.threshold?.value ?? -24,
            ratio: comp.compressor?.ratio?.value ?? 4,
            attack: comp.compressor?.attack?.value ?? 0.003,
            release: comp.compressor?.release?.value ?? 0.1,
          },
        });
      }
    } else if (pid === 'smuve.distortion.v1') {
      port.postMessage({ slot: 'saturation', action: 'enable', payload: true });
      port.postMessage({
        slot: 'saturation',
        action: 'configure',
        payload: { amount: slot.plugin.getParam('amount') },
      });
    } else if (pid === 'smuve.delay.v1') {
      port.postMessage({ slot: 'delay', action: 'enable', payload: true });
      port.postMessage({
        slot: 'delay',
        action: 'configure',
        payload: {
          time: slot.plugin.getParam('time'),
          feedback: slot.plugin.getParam('feedback'),
        },
      });
    } else if (pid === 'smuve.reverb.v1') {
      port.postMessage({ slot: 'reverb', action: 'enable', payload: true });
      port.postMessage({
        slot: 'reverb',
        action: 'configure',
        payload: { mix: slot.plugin.getParam('mix') },
      });
    }
  }

  /** Clean up all plugins and audio nodes */
  dispose(): void {
    for (const slot of this.getAllSlots()) {
      slot.plugin.dispose();
    }
    this._inserts = [];
    this._sends = [];
    this._masterSlots = [];
    this._auxBuses.clear();
    this._input.disconnect();
    this._output.disconnect();
    this._sendBus.disconnect();
    this._dryBus.disconnect();
    this._masterInput.disconnect();
    this._workletNode?.disconnect();
    this._workletNode?.port.postMessage({ slot: 'reset' });
    this._workletNode = null;
    this._useWorklet = false;
  }

  // ---- Serialization ----

  /** Export the rack state for project saving */
  getSnapshot(): {
    inserts: Array<{ pluginId: string; enabled: boolean }>;
    sends: Array<{ pluginId: string; auxBus: string; sendLevel: number }>;
    master: Array<{ pluginId: string; enabled: boolean }>;
  } {
    return {
      inserts: this._inserts.map((s) => ({
        pluginId: s.plugin.id,
        enabled: s.plugin.enabled,
      })),
      sends: this._sends.map((s) => ({
        pluginId: s.plugin.id,
        auxBus: s.auxBus ?? 'A',
        sendLevel: s.sendLevel,
      })),
      master: this._masterSlots.map((s) => ({
        pluginId: s.plugin.id,
        enabled: s.plugin.enabled,
      })),
    };
  }

  /** Restore from a saved snapshot */
  hydrateSnapshot(snapshot: {
    inserts?: Array<{ pluginId: string }>;
    sends?: Array<{ pluginId: string; auxBus: string; sendLevel: number }>;
    master?: Array<{ pluginId: string }>;
  }): void {
    // Clear existing
    this.dispose();
    this._inserts = [];
    this._sends = [];
    this._masterSlots = [];
    this._auxBuses.clear();

    // Rebuild from snapshot
    if (snapshot.inserts) {
      for (const ins of snapshot.inserts) {
        this.addInsert(ins.pluginId);
      }
    }
    if (snapshot.sends) {
      for (const snd of snapshot.sends) {
        this.addSend(snd.pluginId, snd.auxBus, snd.sendLevel);
      }
    }
    if (snapshot.master) {
      for (const mst of snapshot.master) {
        this.addMaster(mst.pluginId);
      }
    }
  }
}

// ---- Register built-in plugins on import ----
// This auto-registers the existing effect classes so they can be
// instantiated dynamically via PluginRegistry.create()

function registerBuiltins(): void {
  PluginRegistry.register('smuve.eq.v1', class EqPlugin implements IAudioPlugin {
    readonly id = 'smuve.eq.v1';
    readonly name = '7-Band EQ';
    readonly category: PluginCategory = 'eq';
    readonly params: PluginParam[] = [];
    enabled = true;
    private readonly _eq: Equalizer;
    readonly input: AudioNode;
    readonly output: AudioNode;
    constructor(ctx: AudioContext) {
      this._eq = new Equalizer(ctx);
      this.input = this._eq.input;
      this.output = this._eq.output;
    }
    getParam(paramId: string): number {
      const band = parseInt(paramId.replace('band', ''), 10);
      const bands = this._eq.getBands();
      return bands[band]?.gain ?? 0;
    }
    setParam(paramId: string, value: number): void {
      const band = parseInt(paramId.replace('band', ''), 10);
      this._eq.setGain(band, value);
    }
    reset(): void {}
    dispose(): void {
      this._eq.disconnect();
    }
  });

  PluginRegistry.register('smuve.compressor.v1', class CompPlugin implements IAudioPlugin {
    readonly id = 'smuve.compressor.v1';
    readonly name = 'Compressor';
    readonly category: PluginCategory = 'dynamics';
    readonly params: PluginParam[] = [
      { id: 'threshold', name: 'Threshold', value: -24, defaultValue: -24, min: -60, max: 0, unit: 'dB' },
      { id: 'ratio', name: 'Ratio', value: 12, defaultValue: 12, min: 1, max: 20, step: 0.5, unit: ':1' },
    ];
    enabled = true;
    input: AudioNode;
    output: AudioNode;
    private readonly _comp: Compressor;
    constructor(ctx: AudioContext) {
      this._comp = new Compressor(ctx);
      this.input = this._comp.input;
      this.output = this._comp.output;
    }
    getParam(id: string): number {
      if (id === 'threshold') return this._comp.compressor.threshold.value;
      if (id === 'ratio') return this._comp.compressor.ratio.value;
      return 0;
    }
    setParam(id: string, value: number): void {
      if (id === 'threshold') this._comp.setThreshold(value);
      if (id === 'ratio') this._comp.setRatio(value);
    }
    reset(): void {}
    dispose(): void {
      this._comp.disconnect();
    }
  });

  PluginRegistry.register('smuve.reverb.v1', class ReverbPlugin implements IAudioPlugin {
    readonly id = 'smuve.reverb.v1';
    readonly name = 'Reverb';
    readonly category: PluginCategory = 'delay-reverb';
    readonly params: PluginParam[] = [
      { id: 'mix', name: 'Mix', value: 0.5, defaultValue: 0.5, min: 0, max: 1, unit: '%' },
    ];
    enabled = true;
    input: AudioNode;
    output: AudioNode;
    private readonly _rev: Reverb;
    constructor(ctx: AudioContext) {
      this._rev = new Reverb(ctx);
      this.input = this._rev.input;
      this.output = this._rev.output;
    }
    getParam(id: string): number {
      return id === 'mix' ? 0.5 : 0;
    }
    setParam(id: string, value: number): void {
      if (id === 'mix') this._rev.setMix(value);
    }
    reset(): void {}
    dispose(): void {
      this._rev.disconnect();
    }
  });

  PluginRegistry.register('smuve.delay.v1', class DelayPlugin implements IAudioPlugin {
    readonly id = 'smuve.delay.v1';
    readonly name = 'Delay';
    readonly category: PluginCategory = 'delay-reverb';
    readonly params: PluginParam[] = [
      { id: 'time', name: 'Time', value: 0.5, defaultValue: 0.5, min: 0.01, max: 2, unit: 's' },
      { id: 'feedback', name: 'Feedback', value: 0.5, defaultValue: 0.5, min: 0, max: 0.95, unit: '%' },
    ];
    enabled = true;
    input: AudioNode;
    output: AudioNode;
    private readonly _dly: Delay;
    constructor(ctx: AudioContext) {
      this._dly = new Delay(ctx);
      this.input = this._dly.input;
      this.output = this._dly.output;
    }
    getParam(id: string): number {
      if (id === 'time') return this._dly.delayNode.delayTime.value;
      if (id === 'feedback') return this._dly.feedbackGain.gain.value;
      return 0;
    }
    setParam(id: string, value: number): void {
      if (id === 'time') this._dly.setDelayTime(value);
      if (id === 'feedback') this._dly.setFeedback(value);
    }
    reset(): void {}
    dispose(): void {
      this._dly.disconnect();
    }
  });

  PluginRegistry.register('smuve.distortion.v1', class DistPlugin implements IAudioPlugin {
    readonly id = 'smuve.distortion.v1';
    readonly name = 'Distortion';
    readonly category: PluginCategory = 'distortion';
    enabled = true;
    input: AudioNode;
    output: AudioNode;
    private readonly _sat: Saturation;
    constructor(ctx: AudioContext) {
      this._sat = new Saturation(ctx);
      this.input = this._sat.input;
      this.output = this._sat.output;
    }
    getParam(id: string): number { return 0.5; }
    setParam(id: string, value: number): void { this._sat.setAmount(value); }
    reset(): void {}
    dispose(): void { this._sat.disconnect(); }
    params: PluginParam[] = [
      { id: 'amount', name: 'Amount', value: 0.5, defaultValue: 0.5, min: 0, max: 1, unit: '%' },
    ];
  });

  PluginRegistry.register('smuve.sidechain.v1', class SidechainPlugin implements IAudioPlugin {
    readonly id = 'smuve.sidechain.v1';
    readonly name = 'Sidechain Comp';
    readonly category: PluginCategory = 'dynamics';
    enabled = true;
    input: AudioNode;
    output: AudioNode;
    private readonly _sc: SidechainCompressor;
    constructor(ctx: AudioContext) {
      this._sc = new SidechainCompressor(ctx);
      this.input = this._sc.input;
      this.output = this._sc.output;
    }
    getParam(id: string): number { return id === 'threshold' ? -30 : 12; }
    setParam(id: string, value: number): void {
      this._sc.configure(
        id === 'threshold' ? value : -30,
        id === 'ratio' ? value : 12
      );
    }
    reset(): void {}
    dispose(): void { this._sc.disconnect(); }
    params: PluginParam[] = [
      { id: 'threshold', name: 'Threshold', value: -30, defaultValue: -30, min: -60, max: 0, unit: 'dB' },
      { id: 'ratio', name: 'Ratio', value: 12, defaultValue: 12, min: 1, max: 20, unit: ':1' },
    ];
  });
}

registerBuiltins();
