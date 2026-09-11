import { Injectable, signal, inject } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';
import { LoggingService } from './logging.service';

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
    // Vocal monitoring/rendering should use the same master bus as the rest
    // of Studio, preserving output metering and the safety limiter.
    this.outputNode.connect(this.audioEngine.masterGain);
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

  /**
   * Flattened, schedule-free view of the chain. The realtime graph ramps to
   * these values with `setTargetAtTime`; the offline renderer (used to give
   * uploaded takes the same treatment as live ones) assigns them directly, so
   * both paths are guaranteed to describe the same chain.
   */
  private chainTargets(p: MasteringParameters) {
    return {
      deesserFrequency: p.deesser.frequency,
      deesserGain: p.deesser.bypass ? 0 : Math.min(0, p.deesser.threshold / 4),
      lowCrossover: p.multiband.low.frequency,
      highCrossover: p.multiband.high.frequency,
      compLow: {
        threshold: p.multiband.low.bypass ? 0 : p.multiband.low.threshold,
        ratio: p.multiband.low.bypass ? 1 : p.multiband.low.ratio,
      },
      compMid: {
        threshold: p.multiband.mid.bypass ? 0 : p.multiband.mid.threshold,
        ratio: p.multiband.mid.bypass ? 1 : p.multiband.mid.ratio,
      },
      compHigh: {
        threshold: p.multiband.high.bypass ? 0 : p.multiband.high.threshold,
        ratio: p.multiband.high.bypass ? 1 : p.multiband.high.ratio,
      },
      eqLow: p.eq.bypass ? 0 : p.eq.low,
      eqMid: p.eq.bypass ? 0 : p.eq.mid,
      eqHigh: p.eq.bypass ? 0 : p.eq.high,
      limiterCeiling: p.limiter.ceiling,
      limiterRelease: p.limiter.release,
      exciterAmount: p.exciter.bypass ? 0 : p.exciter.amount,
    };
  }

  updateNodes() {
    const now = this.ctx.currentTime;
    const t = this.chainTargets(this.params());

    // De-esser
    this.deesserFilter.type = 'peaking';
    this.deesserFilter.Q.value = 3.5;
    this.deesserFilter.frequency.setTargetAtTime(
      t.deesserFrequency,
      now,
      0.05
    );
    this.deesserFilter.gain.setTargetAtTime(t.deesserGain, now, 0.05);

    // Crossover Points
    this.lowPass.type = 'lowpass';
    this.lowPass.frequency.setTargetAtTime(t.lowCrossover, now, 0.05);

    this.midPassLow.type = 'highpass';
    this.midPassLow.frequency.setTargetAtTime(t.lowCrossover, now, 0.05);
    this.midPassHigh.type = 'lowpass';
    this.midPassHigh.frequency.setTargetAtTime(t.highCrossover, now, 0.05);

    this.highPass.type = 'highpass';
    this.highPass.frequency.setTargetAtTime(t.highCrossover, now, 0.05);

    // Multiband Compressors
    this.applyCompParams(this.compLow, t.compLow, now);
    this.applyCompParams(this.compMid, t.compMid, now);
    this.applyCompParams(this.compHigh, t.compHigh, now);

    // EQ
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 250;
    this.eqLow.gain.setTargetAtTime(t.eqLow, now, 0.05);

    this.eqMid.type = 'peaking';
    this.eqMid.frequency.value = 1000;
    this.eqMid.gain.setTargetAtTime(t.eqMid, now, 0.05);

    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 8000;
    this.eqHigh.gain.setTargetAtTime(t.eqHigh, now, 0.05);

    // Limiter
    this.masterLimiter.threshold.setTargetAtTime(
      t.limiterCeiling,
      now,
      0.05
    );
    this.masterLimiter.ratio.value = 20;
    this.masterLimiter.attack.value = 0.003;
    this.masterLimiter.release.setTargetAtTime(t.limiterRelease, now, 0.05);

    // Exciter
    const p = this.params();
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
    band: { threshold: number; ratio: number },
    time: number
  ) {
    comp.threshold.setTargetAtTime(band.threshold, time, 0.05);
    comp.ratio.setTargetAtTime(band.ratio, time, 0.05);
    comp.attack.setTargetAtTime(0.01, time, 0.05);
    comp.release.setTargetAtTime(0.14, time, 0.05);
  }

  /**
   * Render a decoded audio buffer through an offline copy of this exact vocal
   * chain, using the current parameters. Uploaded takes get the same de-esser,
   * multiband compression, exciter, EQ and limiting as a live performance.
   */
  async renderOffline(buffer: AudioBuffer): Promise<AudioBuffer> {
    const OfflineCtor: any =
      (globalThis as any).OfflineAudioContext ??
      (globalThis as any).webkitOfflineAudioContext;
    if (typeof OfflineCtor !== 'function') {
      throw new Error('Offline rendering is unavailable in this environment');
    }

    const t = this.chainTargets(this.params());
    const offline: OfflineAudioContext = new OfflineCtor(
      buffer.numberOfChannels,
      Math.max(1, buffer.length),
      buffer.sampleRate
    );

    const source = offline.createBufferSource();
    source.buffer = buffer;

    // Same topology as buildChain(), with the targets applied directly.
    const deesser = offline.createBiquadFilter();
    deesser.type = 'peaking';
    deesser.Q.value = 3.5;
    deesser.frequency.value = t.deesserFrequency;
    deesser.gain.value = t.deesserGain;

    const lowPass = offline.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.value = t.lowCrossover;

    const midPassLow = offline.createBiquadFilter();
    midPassLow.type = 'highpass';
    midPassLow.frequency.value = t.lowCrossover;

    const midPassHigh = offline.createBiquadFilter();
    midPassHigh.type = 'lowpass';
    midPassHigh.frequency.value = t.highCrossover;

    const highPass = offline.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = t.highCrossover;

    const compLow = offline.createDynamicsCompressor();
    const compMid = offline.createDynamicsCompressor();
    const compHigh = offline.createDynamicsCompressor();
    this.assignComp(compLow, t.compLow);
    this.assignComp(compMid, t.compMid);
    this.assignComp(compHigh, t.compHigh);

    const bandSum = offline.createGain();
    const exciter = offline.createWaveShaper();
    exciter.curve = this.makeDistortionCurve(t.exciterAmount * 100);

    const eqLow = offline.createBiquadFilter();
    eqLow.type = 'lowshelf';
    eqLow.frequency.value = 250;
    eqLow.gain.value = t.eqLow;

    const eqMid = offline.createBiquadFilter();
    eqMid.type = 'peaking';
    eqMid.frequency.value = 1000;
    eqMid.gain.value = t.eqMid;

    const eqHigh = offline.createBiquadFilter();
    eqHigh.type = 'highshelf';
    eqHigh.frequency.value = 8000;
    eqHigh.gain.value = t.eqHigh;

    const limiter = offline.createDynamicsCompressor();
    limiter.threshold.value = t.limiterCeiling;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = t.limiterRelease;

    source.connect(deesser);
    deesser.connect(lowPass);
    lowPass.connect(compLow);
    compLow.connect(bandSum);
    deesser.connect(midPassLow);
    midPassLow.connect(midPassHigh);
    midPassHigh.connect(compMid);
    compMid.connect(bandSum);
    deesser.connect(highPass);
    highPass.connect(compHigh);
    compHigh.connect(bandSum);
    bandSum.connect(exciter);
    exciter.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(limiter);
    limiter.connect(offline.destination);

    source.start();
    this.logger.info('VocalMastering: rendering uploaded take offline');
    return offline.startRendering();
  }

  /** Mirrors `applyCompParams` without ramps. Knee is left at the browser
   *  default so the offline render matches the live chain exactly. */
  private assignComp(
    comp: DynamicsCompressorNode,
    band: { threshold: number; ratio: number }
  ) {
    comp.threshold.value = band.threshold;
    comp.ratio.value = band.ratio;
    comp.attack.value = 0.01;
    comp.release.value = 0.14;
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
    if (source.context && source.context !== this.ctx) {
      this.logger.warn('Vocal mastering source belongs to another AudioContext');
      return false;
    }
    try {
      source.disconnect();
    } catch {
      /* source may already be disconnected */
    }
    source.connect(this.inputNode);
    return true;
  }

  updateParams(newParams: Partial<MasteringParameters>) {
    this.params.update((p) => ({ ...p, ...newParams }));
    this.updateNodes();
  }
}
