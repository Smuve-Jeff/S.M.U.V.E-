export class Sampler {
  private readonly output: GainNode;
  private readonly buffers: Map<number, AudioBuffer> = new Map();

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
}
