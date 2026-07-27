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

export class Sampler {
  private readonly output: GainNode;
  private readonly zones: Map<number, SampleZone> = new Map();
  public slices: Slice[] = [];

  private sourcePool: NodePool<AudioBufferSourceNode>;
  private gainPool: NodePool<GainNode>;
  private defaultAdsr = { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 };

  constructor(private readonly context: AudioContext) {
    this.output = this.context.createGain();
    this.sourcePool = new NodePool(this.context, (ctx) =>
      ctx.createBufferSource()
    );
    this.gainPool = new NodePool(this.context, (ctx) => ctx.createGain());
  }

  loadSample(pitch: number, buffer: AudioBuffer, threshold: number = 127) {
    let zone = this.zones.get(pitch);
    if (!zone) {
      zone = { pitch, layers: [] };
      this.zones.set(pitch, zone);
    }
    zone.layers.push({ threshold, buffer });
    zone.layers.sort((a, b) => a.threshold - b.threshold);
  }

  /** Set loop points for a pitch zone (smooth crossfade looping) */
  setLoop(pitch: number, loopStart: number, loopEnd: number, crossfade: number = 0.02) {
    const zone = this.zones.get(pitch);
    if (zone) {
      zone.loop = { start: loopStart, end: loopEnd, crossfade };
    }
  }

  /** Set ADSR envelope per pitch zone */
  setAdsr(pitch: number, adsr: { attack: number; decay: number; sustain: number; release: number }) {
    const zone = this.zones.get(pitch);
    if (zone) {
      zone.adsr = adsr;
    }
  }

  play(
    pitch: number,
    velocity: number,
    when: number = this.context.currentTime
  ) {
    const zone = this.zones.get(pitch);
    if (!zone || zone.layers.length === 0) return;

    // Find correct velocity layer
    const layer =
      zone.layers.find((l) => velocity * 127 <= l.threshold) ||
      zone.layers[zone.layers.length - 1];
    const buffer = layer.buffer;
    const adsr = zone.adsr || this.defaultAdsr;

    const source = this.sourcePool.get();
    source.buffer = buffer;

    // Loop configuration with crossfade
    if (zone.loop) {
      source.loop = true;
      source.loopStart = zone.loop.start;
      source.loopEnd = zone.loop.end;
    }

    const gainNode = this.gainPool.get();
    const now = when;

    // ADSR envelope shaping
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(velocity, now + adsr.attack);
    if (adsr.decay > 0) {
      gainNode.gain.linearRampToValueAtTime(velocity * adsr.sustain, now + adsr.attack + adsr.decay);
    }

    source.connect(gainNode);
    gainNode.connect(this.output);

    source.start(when);

    source.onended = () => {
      // Apply release envelope on stop
      try {
        gainNode.gain.cancelScheduledValues(this.context.currentTime);
        gainNode.gain.setValueAtTime(gainNode.gain.value, this.context.currentTime);
        gainNode.gain.linearRampToValueAtTime(0, this.context.currentTime + adsr.release);
      } catch { /* node may be disconnected */ }
      setTimeout(() => {
        this.sourcePool.release(source);
        this.gainPool.release(gainNode);
      }, adsr.release * 1000 + 50);
    };
  }

  stop(pitch: number, when?: number) {
    // Graceful stop with release
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
