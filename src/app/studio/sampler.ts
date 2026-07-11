import { NodePool } from './performance-utils';

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

export class Sampler {
  private readonly output: GainNode;
  private readonly bufferLayers: Map<number, VelocityLayer[]> = new Map();
  public slices: Slice[] = [];

  private sourcePool: NodePool<AudioBufferSourceNode>;
  private gainPool: NodePool<GainNode>;

  constructor(private readonly context: AudioContext) {
    this.output = this.context.createGain();
    this.sourcePool = new NodePool(this.context, (ctx) =>
      ctx.createBufferSource()
    );
    this.gainPool = new NodePool(this.context, (ctx) => ctx.createGain());
  }

  loadSample(pitch: number, buffer: AudioBuffer, threshold: number = 127) {
    const layers = this.bufferLayers.get(pitch) || [];
    layers.push({ threshold, buffer });
    layers.sort((a, b) => a.threshold - b.threshold);
    this.bufferLayers.set(pitch, layers);
  }

  play(
    pitch: number,
    velocity: number,
    when: number = this.context.currentTime
  ) {
    const layers = this.bufferLayers.get(pitch);
    if (!layers || layers.length === 0) return;

    // Find correct velocity layer
    const layer =
      layers.find((l) => velocity * 127 <= l.threshold) ||
      layers[layers.length - 1];
    const buffer = layer.buffer;

    const source = this.sourcePool.get();
    source.buffer = buffer;

    const gainNode = this.gainPool.get();
    gainNode.gain.setValueAtTime(velocity, when);

    source.connect(gainNode);
    gainNode.connect(this.output);

    source.start(when);

    source.onended = () => {
      this.sourcePool.release(source);
      this.gainPool.release(gainNode);
    };
  }

  connect(destination: AudioNode) {
    this.output.connect(destination);
  }

  disconnect() {
    this.output.disconnect();
  }

  autoSlice(buffer: AudioBuffer, threshold: number = 0.5) {
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
}
