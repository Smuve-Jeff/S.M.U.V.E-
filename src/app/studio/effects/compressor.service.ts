import { Injectable, inject } from '@angular/core';
import { AudioEngineService } from '../../services/audio-engine.service';

@Injectable({
  providedIn: 'root',
})
export class CompressorService {
  private readonly audioEngine = inject(AudioEngineService);

  createCompressor(type: 'vca' | 'fet' | 'optical' = 'vca') {
    switch (type) {
      case 'fet':
        return new FetCompressor(this.audioEngine.ctx);
      case 'optical':
        return new OpticalCompressor(this.audioEngine.ctx);
      default:
        return new VcaCompressor(this.audioEngine.ctx);
    }
  }
}

class Compressor {
  protected readonly compressor: DynamicsCompressorNode;

  constructor(protected readonly context: AudioContext) {
    this.compressor = this.context.createDynamicsCompressor();
  }

  connect(node: AudioNode) {
    node.connect(this.compressor);
    this.compressor.connect(this.context.destination);
  }

  disconnect() {
    this.compressor.disconnect();
  }

  set(options: any) {
    for (const key in options) {
      const target = this.compressor[key as keyof DynamicsCompressorNode];
      if (target instanceof AudioParam) {
        target.setTargetAtTime(options[key], this.context.currentTime, 0.01);
      } else {
        try {
          (this.compressor as any)[key] = options[key];
        } catch (e) {
          // Ignore read-only properties
        }
      }
    }
  }
}

class VcaCompressor extends Compressor {
  constructor(context: AudioContext) {
    super(context);
    this.compressor.attack.value = 0.01;
    this.compressor.release.value = 0.1;
  }
}

class FetCompressor extends Compressor {
  constructor(context: AudioContext) {
    super(context);
    this.compressor.attack.value = 0.001;
    this.compressor.release.value = 0.2;
  }
}

class OpticalCompressor extends Compressor {
  constructor(context: AudioContext) {
    super(context);
    this.compressor.attack.value = 0.02;
    this.compressor.release.value = 0.05;
  }
}
