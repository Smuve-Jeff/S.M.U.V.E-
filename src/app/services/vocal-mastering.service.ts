import { Injectable, signal, inject } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';
import { LoggingService } from './logging.service';
import { PitchCorrectionService } from '../studio/pitch-correction.service';\n
export interface MasteringParameters {
  deesser: { threshold: number; frequency: number; bypass: boolean };
  multiband: {
    low: {
      threshold: number;
      ratio: number;
      bypass: boolean;
      frequency: number;
    };
    mid: { threshold: number; ratio: number; bypass: boolean };
    high: {
      threshold: number;
      ratio: number;
      bypass: boolean;
      frequency: number;
    };
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
  private pitchCorrection = inject(PitchCorrectionService);

  private ctx = this.audioEngine.ctx;
  private inputNode = this.ctx.createGain();
  private outputNode = this.ctx.createGain();

  // Mastering Chain Nodes
  private deesserFilter: BiquadFilterNode = this.ctx.createBiquadFilter();

  // 3-Band Spectral Split (Crossover)
  private lowPass: BiquadFilterNode = this.ctx.createBiquadFilter();
  private midPassLow: BiquadFilterNode = this.ctx.createBiquadFilter();
  private midPassHigh: BiquadFilterNode = this.ctx.createBiquadFilter();
  private highPass: BiquadFilterNode = this.ctx.createBiquadFilter();

  private compLow: DynamicsCompressorNode = this.ctx.createDynamicsCompressor();
  private compMid: DynamicsCompressorNode = this.ctx.createDynamicsCompressor();
  private compHigh: DynamicsCompressorNode =
    this.ctx.createDynamicsCompressor();

  private bandSum: GainNode = this.ctx.createGain();

  private harmonicExciter: WaveShaperNode = this.ctx.createWaveShaper();

  private eqLow: BiquadFilterNode = this.ctx.createBiquadFilter();
  private eqMid: BiquadFilterNode = this.ctx.createBiquadFilter();
  private eqHigh: BiquadFilterNode = this.ctx.createBiquadFilter();

  private masterLimiter: DynamicsCompressorNode =
    this.ctx.createDynamicsCompressor();

  params = signal<MasteringParameters>({
    deesser: { threshold: -24, frequency: 6500, bypass: false },
    multiband: {
      low: { threshold: -20, ratio: 4, bypass: false, frequency: 320 },
      mid: { threshold: -18, ratio: 2.5, bypass: false },
      high: { threshold: -16, ratio: 2, bypass: false, frequency: 2500 },
    },
    exciter: { amount: 0.1, frequency: 8000, bypass: false },
    eq: { low: 0, mid: 0, high: 0, bypass: false },
    limiter: { ceiling: -0.1, release: 0.1, bypass: false },
  });

  constructor() {
    this.buildChain();
  }

  private buildChain() {
    // Input -> Deesser
    this.inputNode.connect(this.deesserFilter);

    // Deesser -> 3-Band Crossover
    // Low Band
    this.deesserFilter.connect(this.lowPass);
    this.lowPass.connect(this.compLow);
    this.compLow.connect(this.bandSum);

    // Mid Band
    this.deesserFilter.connect(this.midPassLow);
    this.midPassLow.connect(this.midPassHigh);
    this.midPassHigh.connect(this.compMid);
    this.compMid.connect(this.bandSum);

    // High Band
    this.deesserFilter.connect(this.highPass);
    this.highPass.connect(this.compHigh);
    this.compHigh.connect(this.bandSum);

    // Sum -> Exciter -> EQ -> Limiter -> Output
    this.bandSum.connect(this.harmonicExciter);
    this.harmonicExciter.connect(this.eqLow);
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);
    this.eqHigh.connect(this.masterLimiter);
    this.masterLimiter.connect(this.outputNode);

    this.updateNodes();
  }

  updateNodes() {
    const p = this.params();
    const now = this.ctx.currentTime;

    // De-esser
    this.deesserFilter.type = 'peaking';
    this.deesserFilter.Q.value = 3.5;
    this.deesserFilter.frequency.setTargetAtTime(
      p.deesser.frequency,
      now,
      0.05
    );
    this.deesserFilter.gain.setTargetAtTime(
      p.deesser.bypass ? 0 : Math.min(0, p.deesser.threshold / 4),
      now,
      0.05
    );

    // Crossover Points
    this.lowPass.type = 'lowpass';
    this.lowPass.frequency.setTargetAtTime(
      p.multiband.low.frequency,
      now,
      0.05
    );

    this.midPassLow.type = 'highpass';
    this.midPassLow.frequency.setTargetAtTime(
      p.multiband.low.frequency,
      now,
      0.05
    );
    this.midPassHigh.type = 'lowpass';
    this.midPassHigh.frequency.setTargetAtTime(
      p.multiband.high.frequency,
      now,
      0.05
    );

    this.highPass.type = 'highpass';
    this.highPass.frequency.setTargetAtTime(
      p.multiband.high.frequency,
      now,
      0.05
    );

    // Multiband Compressors
    this.applyCompParams(this.compLow, p.multiband.low, now);
    this.applyCompParams(this.compMid, p.multiband.mid, now);
    this.applyCompParams(this.compHigh, p.multiband.high, now);

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
    this.masterLimiter.ratio.value = 20;
    this.masterLimiter.attack.value = 0.003;
    this.masterLimiter.release.setTargetAtTime(p.limiter.release, now, 0.05);

    // Exciter
    if (!p.exciter.bypass) {
      this.harmonicExciter.curve = this.makeDistortionCurve(
        p.exciter.amount * 100
      );
    } else {
      this.harmonicExciter.curve = null;
    }
  }

  private applyCompParams(
    comp: DynamicsCompressorNode,
    band: any,
    time: number
  ) {
    comp.threshold.setTargetAtTime(
      band.bypass ? 0 : band.threshold,
      time,
      0.05
    );
    comp.ratio.setTargetAtTime(band.bypass ? 1 : band.ratio, time, 0.05);
    comp.attack.setTargetAtTime(0.01, time, 0.05);
    comp.release.setTargetAtTime(0.14, time, 0.05);
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
