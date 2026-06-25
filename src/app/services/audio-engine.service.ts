import { Injectable, signal, computed } from '@angular/core';

export type PerformanceTier = 'ultra' | 'performance';
export type DeckId = 'A' | 'B';

@Injectable({
  providedIn: 'root'
})
export class AudioEngineService {
  public static readonly DEFAULT_LOOKAHEAD_SECONDS = 0.1;
  public static readonly DEFAULT_SCHEDULER_INTERVAL_MS = 25;

  public readonly ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  public readonly masterGain = this.ctx.createGain();
  public readonly masterAnalyser = this.ctx.createAnalyser();
  public readonly limiter = this.ctx.createDynamicsCompressor();

  public tempo = signal(124);
  public isPlaying = signal(false);
  public metronomeEnabled = signal(false);
  public metronomeVolume = signal(0.5);
  public performanceTier = signal<PerformanceTier>('ultra');

  public loopLengthSteps = signal(64);
  public currentBeat = signal(0);
  public visualStep = signal(0);

  private nextNoteTime = 0;
  private schedulerHandle: any = null;
  private currentStep = 0;

  public onScheduleStep?: (step: number, time: number, duration: number) => void;

  private trackOutputs = new Map<string, GainNode>();
  private tracksMap = new Map<string, any>();
  private masteringTargets = { lufs: -14, truePeak: -0.1 };

  constructor() {
    this.masterGain.connect(this.limiter);
    this.limiter.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);

    // Extra safety for test environments
    const safeSet = (param: any, val: number) => {
       if (param && typeof param.setValueAtTime === 'function') {
          param.setValueAtTime(val, this.ctx.currentTime);
       }
    };

    safeSet(this.limiter.threshold, -1);
    safeSet(this.limiter.knee, 0);
    safeSet(this.limiter.ratio, 20);
    safeSet(this.limiter.attack, 0.003);
    safeSet(this.limiter.release, 0.1);
  }

  getContext() { return this.ctx; }
  getMasterAnalyser() { return this.masterAnalyser; }
  getMasteringTargets() { return this.masteringTargets; }
  setMasteringTargets(targets: any) { this.masteringTargets = { ...this.masteringTargets, ...targets }; }

  configureCompressor(config: any) {
     if (this.limiter.threshold && this.limiter.threshold.setTargetAtTime) {
        this.limiter.threshold.setTargetAtTime(config.threshold || -1, this.ctx.currentTime, 0.01);
     }
  }

  configureLimiter(config: any) {
     if (config.ceiling !== undefined && this.limiter.threshold && this.limiter.threshold.setTargetAtTime) {
        this.limiter.threshold.setTargetAtTime(config.ceiling, this.ctx.currentTime, 0.01);
     }
  }

  setMasterOutputLevel(val: number) {
    if (this.masterGain.gain.setTargetAtTime) {
       this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.05);
    }
  }

  resume() {
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  start() {
    this.resume();
    if (this.isPlaying()) return;
    this.isPlaying.set(true);
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.schedulerHandle = setInterval(() => this.scheduler(), AudioEngineService.DEFAULT_SCHEDULER_INTERVAL_MS);
  }

  stop() {
    this.isPlaying.set(false);
    if (this.schedulerHandle) {
      clearInterval(this.schedulerHandle);
      this.schedulerHandle = null;
    }
    this.currentStep = 0;
    this.currentBeat.set(0);
    this.visualStep.set(0);
  }

  private scheduler() {
    const stepDuration = 60 / this.tempo() / this.stepsPerBeat();
    while (this.nextNoteTime < this.ctx.currentTime + AudioEngineService.DEFAULT_LOOKAHEAD_SECONDS) {
      const step = this.currentStep;
      this.onScheduleStep?.(step, this.nextNoteTime, stepDuration);
      if (this.metronomeEnabled() && step % this.stepsPerBeat() === 0) {
        this.playMetronomeClick(this.nextNoteTime, step % (this.stepsPerBeat() * 4) === 0);
      }
      const visualDelay = (this.nextNoteTime - this.ctx.currentTime) * 1000;
      setTimeout(() => {
        this.visualStep.set(step);
        this.currentBeat.set(step / this.stepsPerBeat());
      }, Math.max(0, visualDelay));

      this.nextNoteTime += stepDuration;
      this.currentStep = (this.currentStep + 1) % this.loopLengthSteps();
    }
  }

  private playMetronomeClick(time: number, isDownbeat: boolean) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.frequency.setValueAtTime(isDownbeat ? 1000 : 600, time);
    env.gain.setValueAtTime(0, time);
    if (env.gain.linearRampToValueAtTime) env.gain.linearRampToValueAtTime(this.metronomeVolume(), time + 0.005);
    if (env.gain.exponentialRampToValueAtTime) env.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.1);
  }

  stepsPerBeat() { return 4; }

  triggerAttack(trackId: string, freq: number, time: number, velocity: number, duration: number, gain: number, pan: number, sendA: number, sendB: number, params: any) {
    const osc = this.ctx.createOscillator();
    const panner = this.ctx.createStereoPanner();
    const vca = this.ctx.createGain();
    osc.type = params.type || 'sine';
    if (osc.frequency.setValueAtTime) osc.frequency.setValueAtTime(freq, time);
    if (params.vibratoRate > 0) {
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.setValueAtTime(params.vibratoRate, time);
      lfoGain.gain.setValueAtTime(params.vibratoAmount * 10, time);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(time);
      lfo.stop(time + duration + 0.1);
    }
    if (panner.pan.setValueAtTime) panner.pan.setValueAtTime(pan, time);
    vca.gain.setValueAtTime(0, time);
    if (vca.gain.linearRampToValueAtTime) vca.gain.linearRampToValueAtTime(velocity * gain, time + (params.attack || 0.01));
    if (vca.gain.exponentialRampToValueAtTime) vca.gain.exponentialRampToValueAtTime(0.001, time + duration + (params.release || 0.1));
    osc.connect(panner);
    panner.connect(vca);
    vca.connect(this.getTrackOutput(trackId));
    osc.start(time);
    osc.stop(time + duration + (params.release || 0.1) + 0.1);
  }

  triggerSampler(trackId: string, buffer: AudioBuffer, time: number, velocity: number, pan: number, duration: number) {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const panner = this.ctx.createStereoPanner();
    if (panner.pan.setValueAtTime) panner.pan.setValueAtTime(pan, time);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    if (gain.gain.linearRampToValueAtTime) gain.gain.linearRampToValueAtTime(velocity, time + 0.005);
    source.connect(panner);
    panner.connect(gain);
    gain.connect(this.getTrackOutput(trackId));
    source.start(time);
    source.stop(time + duration);
  }

  getTrackOutput(id: string): GainNode {
    if (!this.trackOutputs.has(id)) {
      const gain = this.ctx.createGain();
      gain.connect(this.masterGain);
      this.trackOutputs.set(id, gain);
    }
    return this.trackOutputs.get(id)!;
  }

  updateTrack(id: string, data: any) {
    const output = this.getTrackOutput(id);
    if (data.gain !== undefined && output.gain.setTargetAtTime) output.gain.setTargetAtTime(data.gain, this.ctx.currentTime, 0.05);
    this.tracksMap.set(id, { ...(this.tracksMap.get(id) || {}), ...data });
  }
}
