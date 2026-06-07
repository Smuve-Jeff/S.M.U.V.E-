export interface Slice {
  id: string;
  start: number; // in seconds
  end: number; // in seconds
  midi: number; // mapped midi note
}

export class Sampler {
  private readonly output: GainNode;
  private readonly buffers: Map<number, AudioBuffer> = new Map();
  public slices: Slice[] = [];

  constructor(private readonly context: AudioContext) {
    this.output = this.context.createGain();
  }

  loadSample(pitch: number, buffer: AudioBuffer) {
    this.buffers.set(pitch, buffer);
  }

  play(
    pitch: number,
    velocity: number,
    when: number = this.context.currentTime
  ) {
    const buffer = this.buffers.get(pitch);
    if (!buffer) return;

    const source = this.context.createBufferSource();
    source.buffer = buffer;

    const gainNode = this.context.createGain();
    gainNode.gain.setValueAtTime(velocity, when);

    source.connect(gainNode);
    gainNode.connect(this.output);

    source.start(when);
  }

  connect(destination: AudioNode) {
    this.output.connect(destination);
  }

  disconnect() {
    this.output.disconnect();
  }

  /**
   * Advanced Slicing Capability
   * Detects transients and creates slices
   */
  autoSlice(buffer: AudioBuffer, threshold: number = 0.5) {
    const data = buffer.getChannelData(0);
    const slices: Slice[] = [];
    let sliceStart = 0;

    const step = Math.floor(buffer.sampleRate * 0.01); // 10ms
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
