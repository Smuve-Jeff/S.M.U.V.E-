import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AudioEngineService } from '../../services/audio-engine.service';

@Injectable({
  providedIn: 'root'
})
export class ConvolutionReverbService {
  private readonly http = inject(HttpClient);
  private readonly audioEngine = inject(AudioEngineService);

  async loadImpulseResponse(url: string): Promise<AudioBuffer> {
    const response = await firstValueFrom(this.http.get(url, { responseType: 'arraybuffer' }));
    return this.audioEngine.ctx.decodeAudioData(response);
  }

  createReverb(impulseResponse: AudioBuffer) {
    return new ConvolutionReverb(this.audioEngine.ctx, impulseResponse);
  }
}

class ConvolutionReverb {
  private readonly convolver: ConvolverNode;
  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;

  constructor(private readonly context: AudioContext, impulseResponse: AudioBuffer) {
    this.convolver = this.context.createConvolver();
    this.convolver.buffer = impulseResponse;
    this.wetGain = this.context.createGain();
    this.dryGain = this.context.createGain();
  }

  connect(node: AudioNode) {
    node.connect(this.dryGain);
    node.connect(this.convolver);
    this.convolver.connect(this.wetGain);

    this.dryGain.connect(this.context.destination);
    this.wetGain.connect(this.context.destination);
  }

  disconnect() {
    this.dryGain.disconnect();
    this.wetGain.disconnect();
    this.convolver.disconnect();
  }

  set(options: { wet?: number, dry?: number }) {
    if (options.wet !== undefined) {
      this.wetGain.gain.setTargetAtTime(options.wet, this.context.currentTime, 0.01);
    }
    if (options.dry !== undefined) {
      this.dryGain.gain.setTargetAtTime(options.dry, this.context.currentTime, 0.01);
    }
  }
}
