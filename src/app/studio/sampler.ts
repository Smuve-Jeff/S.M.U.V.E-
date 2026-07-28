export interface Slice {
  id: string;
  start: number; // in seconds
  end: number; // in seconds
  midi: number; // mapped midi note
}

export interface VelocityLayer {
  threshold: number;
  buffer: AudioBuffer;
}

export interface LoopRegion {
  start: number; // seconds
  end: number; // seconds
  crossfade: number; // crossfade duration in seconds
}

export interface SampleZone {
  pitch: number;
  layers: VelocityLayer[];
  loop?: LoopRegion;
  adsr?: { attack: number; decay: number; sustain: number; release: number };
  /** Round-robin: cycle through samples in this zone */
  roundRobin: boolean;
  /** Round-robin counter */
  roundRobinIndex: number;
  /** Multiple sample buffers for round-robin / velocity layers */
  sampleBuffers: AudioBuffer[];
  /** Target output channel index (-1 = master, 0+ = mixer channel) */
  outputChannel: number;
}

interface BufferedMessage {
  type: 'LOAD' | 'PLAY' | 'STOP_NOTE' | 'STOP_ALL' | 'PITCH_BEND' | 'MODULATION';
  data: any;
}

/**
 * Sampler v2 — sample-accurate worklet-powered sampler with:
 * - Round-robin per zone
 * - Individual note stop
 * - Multi-out routing (per-zone output channel)
 * - Pitch bend + modulation support
 * - Up to 32 concurrent voices
 */
export class Sampler {
  private readonly output: GainNode;
  private readonly zoneOutputs: Map<number, GainNode> = new Map();
  private readonly zones: Map<number, SampleZone> = new Map();
  public slices: Slice[] = [];

  private workletNode: AudioWorkletNode | null = null;
  private workletReady = false;
  private bufferedMessages: BufferedMessage[] = [];

  private readonly context: AudioContext;
  private loadedKeys = new Set<string>();

  /** Active note -> voice info for per-note stop */
  private activeNotes: Map<number, Set<number>> = new Map();

  constructor(context: AudioContext) {
    this.context = context;
    this.output = this.context.createGain();
  }

  /** Must be called before first play(). Loads the worklet and connects the output. */
  async init(): Promise<void> {
    if (this.workletReady) return;

    try {
      await this.context.audioWorklet.addModule(
        'assets/worklets/sampler-processor.worklet.js'
      );
    } catch (e) {
      // May already be loaded by another Sampler instance
    }

    this.workletNode = new AudioWorkletNode(this.context, 'sampler-processor');
    this.workletNode.connect(this.output);
    this.workletReady = true;

    // Flush any buffered messages
    for (const msg of this.bufferedMessages) {
      this.workletNode.port.postMessage(msg.data);
    }
    this.bufferedMessages = [];
  }

  /**
   * Send an AudioBuffer to the worklet so it can be played later.
   * Supports round-robin: multiple buffers per pitch.
   */
  loadSample(pitch: number, buffer: AudioBuffer, threshold: number = 127): void {
    let zone = this.zones.get(pitch);
    if (!zone) {
      zone = {
        pitch,
        layers: [],
        roundRobin: false,
        roundRobinIndex: 0,
        sampleBuffers: [],
        outputChannel: -1,
      };
      this.zones.set(pitch, zone);
    }

    // Add to velocity layers
    zone.layers.push({ threshold, buffer });
    zone.layers.sort((a, b) => a.threshold - b.threshold);

    // Add to sample buffers for round-robin
    zone.sampleBuffers.push(buffer);

    // Ship to worklet
    const key = `sample_${pitch}_${zone.sampleBuffers.length - 1}`;
    this.loadedKeys.add(key);
    const channelData = buffer.getChannelData(0);
    this.sendToWorklet({
      type: 'LOAD',
      key,
      buffer: channelData,
      sampleRate: buffer.sampleRate,
    });
  }

  /**
   * Load a sample buffer into a specific round-robin slot.
   */
  loadSampleToSlot(pitch: number, buffer: AudioBuffer, slotIndex: number): void {
    let zone = this.zones.get(pitch);
    if (!zone) {
      zone = {
        pitch,
        layers: [],
        roundRobin: false,
        roundRobinIndex: 0,
        sampleBuffers: [],
        outputChannel: -1,
      };
      this.zones.set(pitch, zone);
    }

    // Expand sampleBuffers array if needed
    while (zone.sampleBuffers.length <= slotIndex) {
      zone.sampleBuffers.push(buffer);
    }
    zone.sampleBuffers[slotIndex] = buffer;

    const key = `sample_${pitch}_${slotIndex}`;
    this.loadedKeys.add(key);
    const channelData = buffer.getChannelData(0);
    this.sendToWorklet({
      type: 'LOAD',
      key,
      buffer: channelData,
      sampleRate: buffer.sampleRate,
    });
  }

  /** Enable or disable round-robin for a pitch zone */
  setRoundRobin(pitch: number, enabled: boolean): void {
    const zone = this.zones.get(pitch);
    if (zone) {
      zone.roundRobin = enabled;
    }
  }

  /** Set the output channel for a pitch zone */
  setOutputChannel(pitch: number, channel: number): void {
    const zone = this.zones.get(pitch);
    if (zone) {
      zone.outputChannel = channel;
    }
  }

  /** Set loop points for a pitch zone (smooth crossfade looping) */
  setLoop(
    pitch: number,
    loopStart: number,
    loopEnd: number,
    crossfade: number = 0.02
  ): void {
    const zone = this.zones.get(pitch);
    if (zone) {
      zone.loop = { start: loopStart, end: loopEnd, crossfade };
    }
  }

  /** Set ADSR envelope per pitch zone */
  setAdsr(
    pitch: number,
    adsr: { attack: number; decay: number; sustain: number; release: number }
  ): void {
    const zone = this.zones.get(pitch);
    if (zone) {
      zone.adsr = adsr;
    }
  }

  /**
   * Play a sample at the given pitch with the given velocity.
   * Supports round-robin cycling if enabled for the zone.
   */
  play(
    pitch: number,
    velocity: number,
    when: number = this.context.currentTime
  ): void {
    const zone = this.zones.get(pitch);
    if (!zone || zone.sampleBuffers.length === 0) return;

    // Round-robin: cycle through sample buffers
    let slotIndex = 0;
    if (zone.roundRobin && zone.sampleBuffers.length > 1) {
      slotIndex = zone.roundRobinIndex % zone.sampleBuffers.length;
      zone.roundRobinIndex = (zone.roundRobinIndex + 1) % zone.sampleBuffers.length;
    }

    const key = `sample_${pitch}_${slotIndex}`;
    const rootNote = zone.pitch;
    const vel = Math.round(velocity * 127);
    const adsr = zone.adsr;

    this.sendToWorklet({
      type: 'PLAY',
      key,
      note: pitch,
      rootNote,
      velocity: vel,
      attack: adsr?.attack ?? 0.005,
      decay: adsr?.decay ?? 0.1,
      sustain: adsr?.sustain ?? 0.8,
      release: adsr?.release ?? 0.2,
    });
  }

  /** Stop an individual note (MIDI note-off) */
  stop(pitch: number, _when?: number): void {
    this.sendToWorklet({
      type: 'STOP_NOTE',
      note: pitch,
    });
  }

  /** Apply pitch bend (-1 to +1, semitones range) */
  setPitchBend(value: number, semitones: number = 2): void {
    this.sendToWorklet({
      type: 'PITCH_BEND',
      value: Math.max(-1, Math.min(1, value)),
      semitones,
    });
  }

  /** Apply modulation (0 to 1) */
  setModulation(value: number): void {
    this.sendToWorklet({
      type: 'MODULATION',
      value: Math.max(0, Math.min(1, value)),
    });
  }

  /** Stop all active voices (panic) */
  stopAll(): void {
    this.sendToWorklet({ type: 'STOP_ALL' });
  }

  /** Get the number of sample buffers loaded for a pitch */
  getSampleCount(pitch: number): number {
    const zone = this.zones.get(pitch);
    return zone ? zone.sampleBuffers.length : 0;
  }

  /** Get all pitch numbers that have loaded samples */
  getLoadedPitches(): number[] {
    return Array.from(this.zones.keys());
  }

  /** Get zone info for a pitch */
  getZone(pitch: number): SampleZone | undefined {
    return this.zones.get(pitch);
  }

  /** Get all zones */
  getAllZones(): SampleZone[] {
    return Array.from(this.zones.values());
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination);
  }

  /**
   * Connect a zone's output to a specific destination (multi-out).
   * Each zone can have its own GainNode feeding a different mixer channel.
   */
  connectZoneOutput(pitch: number, destination: AudioNode): void {
    const zone = this.zones.get(pitch);
    if (!zone) return;

    let zoneGain = this.zoneOutputs.get(pitch);
    if (!zoneGain) {
      zoneGain = this.context.createGain();
      this.zoneOutputs.set(pitch, zoneGain);
    }
    zoneGain.connect(destination);
  }

  /** Get the master output node */
  getOutput(): GainNode {
    return this.output;
  }

  disconnect(): void {
    this.output.disconnect();
    this.zoneOutputs.forEach((gain) => gain.disconnect());
    this.zoneOutputs.clear();
  }

  /** Clean up the worklet node and output */
  dispose(): void {
    this.stopAll();
    this.workletNode?.disconnect();
    this.output.disconnect();
    this.zoneOutputs.forEach((gain) => gain.disconnect());
    this.zoneOutputs.clear();
    this.workletNode = null;
    this.workletReady = false;
    this.loadedKeys.clear();
    this.activeNotes.clear();
  }

  /** Auto-slice an AudioBuffer into onset-based slices */
  autoSlice(buffer: AudioBuffer, threshold: number = 0.5): Slice[] {
    const data = buffer.getChannelData(0);
    const slices: Slice[] = [];
    let sliceStart = 0;

    const step = Math.floor(buffer.sampleRate * 0.01);
    for (let i = 0; i < data.length; i += step) {
      if (Math.abs(data[i]) > threshold) {
        const time = i / buffer.sampleRate;
        if (time - sliceStart > 0.1) {
          slices.push({
            id: Math.random().toString(36).substr(2, 9),
            start: sliceStart,
            end: time,
            midi: 60 + slices.length,
          });
          sliceStart = time;
        }
      }
    }
    this.slices = slices;
    return slices;
  }

  // ---- Private ----

  private sendToWorklet(data: any): void {
    if (this.workletReady && this.workletNode) {
      this.workletNode.port.postMessage(data);
    } else {
      this.bufferedMessages.push({ type: data.type, data });
    }
  }
}
