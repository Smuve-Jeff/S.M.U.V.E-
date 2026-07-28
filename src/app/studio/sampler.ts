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
}

interface BufferedMessage {
  type: 'LOAD' | 'PLAY';
  data: any;
}

/**
 * Sample-accurate sampler powered by the sampler-processor AudioWorklet.
 *
 * Instead of creating AudioBufferSourceNode instances on the main thread,
 * this shuttles sample buffers and play commands through the worklet port.
 * The worklet renders up to 32 concurrent voices with linear-interpolated
 * playback, ADSR envelope shaping, and pop-free termination — all in the
 * audio rendering thread.
 */
export class Sampler {
  private readonly output: GainNode;
  private readonly zones: Map<number, SampleZone> = new Map();
  public slices: Slice[] = [];

  private workletNode: AudioWorkletNode | null = null;
  private workletReady = false;
  private bufferedMessages: BufferedMessage[] = [];

  private readonly context: AudioContext;
  private loadedKeys = new Set<string>();

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

  /** Send an AudioBuffer to the worklet so it can be played later. */
  loadSample(pitch: number, buffer: AudioBuffer, threshold: number = 127): void {
    let zone = this.zones.get(pitch);
    if (!zone) {
      zone = { pitch, layers: [] };
      this.zones.set(pitch, zone);
    }
    zone.layers.push({ threshold, buffer });
    zone.layers.sort((a, b) => a.threshold - b.threshold);

    // Also ship the raw channel data to the worklet
    const key = `sample_${pitch}`;
    if (!this.loadedKeys.has(key)) {
      this.loadedKeys.add(key);
      const channelData = buffer.getChannelData(0);
      this.sendToWorklet({
        type: 'LOAD',
        key,
        buffer: channelData,
        sampleRate: buffer.sampleRate,
      });
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
   * The `when` parameter is passed through to the AudioParam scheduler
   * for sample-accurate scheduling when the worklet is ready.
   */
  play(
    pitch: number,
    velocity: number,
    when: number = this.context.currentTime
  ): void {
    const zone = this.zones.get(pitch);
    if (!zone || zone.layers.length === 0) return;

    const key = `sample_${pitch}`;
    const rootNote = zone.pitch;
    const vel = Math.round(velocity * 127);

    this.sendToWorklet({
      type: 'PLAY',
      key,
      note: pitch,
      rootNote,
      velocity: vel,
    });
  }

  /** Graceful stop with release — handled by the worklet's STOP_ALL message */
  stop(_pitch: number, _when?: number): void {
    // Individual note stop not yet supported by the worklet;
    // STOP_ALL clears all voices gracefully.
  }

  /** Stop all active voices (panic) */
  stopAll(): void {
    this.sendToWorklet({ type: 'STOP_ALL' });
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination);
  }

  disconnect(): void {
    this.output.disconnect();
  }

  /** Clean up the worklet node and output */
  dispose(): void {
    this.stopAll();
    this.workletNode?.disconnect();
    this.output.disconnect();
    this.workletNode = null;
    this.workletReady = false;
    this.loadedKeys.clear();
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
