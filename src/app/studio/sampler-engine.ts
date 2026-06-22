import { FileLoaderService, SampleMap } from '../services/file-loader.service';

export class SamplerEngine {
  constructor(
    private readonly context: BaseAudioContext,
    private readonly fileLoader: FileLoaderService
  ) {}

  playNote(sampleMap: SampleMap, midi: number, velocity: number, output: AudioNode, when: number = this.context.currentTime): () => void {
    const zone = sampleMap.zones.find(z => midi >= z.midiRange[0] && midi <= z.midiRange[1]);
    if (!zone) return () => {};

    const layer =
      zone.layers.find(
        (l) => velocity >= l.minVelocity && velocity <= l.maxVelocity
      ) ?? zone.layers[0];
    if (!layer) return () => {};
    const buffer = this.fileLoader.getBuffer(layer.url);
    if (!buffer) return () => {};

    const source = this.context.createBufferSource();
    source.buffer = buffer;

    // Pitch shift based on root note
    const playbackRate = Math.pow(2, (midi - zone.rootNote) / 12);
    source.playbackRate.setValueAtTime(playbackRate, when);

    const gainNode = this.context.createGain();
    gainNode.gain.setValueAtTime(velocity / 127, when);

    source.connect(gainNode);
    gainNode.connect(output);

    const cleanup = () => {
      source.disconnect();
      gainNode.disconnect();
    };
    source.onended = cleanup;

    source.start(when);

    return () => {
      try {
        source.stop(this.context.currentTime + 0.1);
      } catch (e) {}
      cleanup();
    };
  }
}
