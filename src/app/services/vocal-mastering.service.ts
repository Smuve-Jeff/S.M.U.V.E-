import { Injectable, signal, inject } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';
import { LoggingService } from './logging.service';

export interface MasteringParameters {
  deesser: { threshold: number; frequency: number; bypass: boolean };
  multiband: {
    low: { threshold: number; ratio: number; bypass: boolean };
    mid: { threshold: number; ratio: number; bypass: boolean };
    high: { threshold: number; ratio: number; bypass: boolean };
  };
  exciter: { amount: number; frequency: number; bypass: boolean };
  eq: { low: number; mid: number; high: number; bypass: boolean };
  limiter: { ceiling: number; release: number; bypass: boolean };
}

@Injectable({
  providedIn: 'root',
})
export class VocalMasteringService {
  private logger = inject(LoggingService);
  private audioEngine = inject(AudioEngineService);

  private ctx = this.audioEngine.ctx;
  private inputNode = this.ctx.createGain();
  private outputNode = this.ctx.createGain();

  // Mastering Chain Nodes
  private deesserFilter: BiquadFilterNode = this.ctx.createBiquadFilter();
  private deesserGain: GainNode = this.ctx.createGain(); // Sidechain simulation

  private multibandSplitLow: BiquadFilterNode = this.ctx.createBiquadFilter();
  private multibandSplitMid: BiquadFilterNode = this.ctx.createBiquadFilter();
  private multibandSplitHigh: BiquadFilterNode = this.ctx.createBiquadFilter();

  private compLow: DynamicsCompressorNode = this.ctx.createDynamicsCompressor();
  private compMid: DynamicsCompressorNode = this.ctx.createDynamicsCompressor();
  private compHigh: DynamicsCompressorNode =
    this.ctx.createDynamicsCompressor();

  private harmonicExciter: WaveShaperNode = this.ctx.createWaveShaper();

  private eqLow: BiquadFilterNode = this.ctx.createBiquadFilter();
  private eqMid: BiquadFilterNode = this.ctx.createBiquadFilter();
  private eqHigh: BiquadFilterNode = this.ctx.createBiquadFilter();

  private masterLimiter: DynamicsCompressorNode =
    this.ctx.createDynamicsCompressor();

  params = signal<MasteringParameters>({
    deesser: { threshold: -24, frequency: 6500, bypass: false },
    multiband: {
      low: { threshold: -20, ratio: 4, bypass: false },
      mid: { threshold: -18, ratio: 2.5, bypass: false },
      high: { threshold: -16, ratio: 2, bypass: false },
    },
    exciter: { amount: 0.1, frequency: 8000, bypass: false },
    eq: { low: 0, mid: 0, high: 0, bypass: false },
    limiter: { ceiling: -0.1, release: 0.1, bypass: false },
  });

  constructor() {
    this.buildChain();
  }

  private buildChain() {
    // Basic linear chain for simulation:
    // Input -> Deesser -> Multiband -> Exciter -> EQ -> Limiter -> Output

    this.inputNode.connect(this.deesserFilter);
    this.deesserFilter.connect(this.compMid); // Simplified split routing
    this.compMid.connect(this.harmonicExciter);
    this.harmonicExciter.connect(this.eqLow);
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);
    this.eqHigh.connect(this.masterLimiter);
    this.masterLimiter.connect(this.outputNode);

    // Initial config
    this.updateNodes();
  }

  updateNodes() {
    const p = this.params();
    const now = this.ctx.currentTime;

    // EQ
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 250;
    this.eqLow.gain.setTargetAtTime(p.eq.bypass ? 0 : p.eq.low, now, 0.05);

    this.eqMid.type = 'peaking';
    this.eqMid.frequency.value = 1000;
    this.eqMid.gain.setTargetAtTime(p.eq.bypass ? 0 : p.eq.mid, now, 0.05);

    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 8000;
    this.eqHigh.gain.setTargetAtTime(p.eq.bypass ? 0 : p.eq.high, now, 0.05);

    // Limiter
    this.masterLimiter.threshold.setTargetAtTime(p.limiter.ceiling, now, 0.05);
    this.masterLimiter.ratio.value = 20; // Hard limiting
    this.masterLimiter.attack.value = 0.003;
    this.masterLimiter.release.setTargetAtTime(p.limiter.release, now, 0.05);

    // Exciter (Saturation curve)
    if (!p.exciter.bypass) {
      this.harmonicExciter.curve = this.makeDistortionCurve(
        p.exciter.amount * 100
      );
    } else {
      this.harmonicExciter.curve = null;
    }
  }

  private makeDistortionCurve(amount: number) {
    const k = amount;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  getInputNode() {
    return this.inputNode;
  }
  getOutputNode() {
    return this.outputNode;
  }

  applyToSource(source: AudioNode) {
    source.connect(this.inputNode);
  }

  updateParams(newParams: Partial<MasteringParameters>) {
    this.params.update((p) => ({ ...p, ...newParams }));
    this.updateNodes();
  }
}
