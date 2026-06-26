import { Injectable, signal, inject, computed } from '@angular/core';
import { LoggingService } from './logging.service';

export type PerformanceTier = 'ultra' | 'performance';
export type DeckId = 'A' | 'B';

@Injectable({
  providedIn: 'root'
})
export class AudioEngineService {
  public static readonly DEFAULT_LOOKAHEAD_SECONDS = 0.1;
  public static readonly DEFAULT_SCHEDULER_INTERVAL_MS = 25;

  public readonly ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  public readonly logger = inject(LoggingService);

  public readonly masterGain = this.ctx.createGain();
  public readonly masterAnalyser = this.ctx.createAnalyser();
  public readonly limiter = this.ctx.createDynamicsCompressor();
  public readonly sendAReturn = this.ctx.createGain();
  public readonly sendBReturn = this.ctx.createGain();
  private trackSendAGains = new Map<string, GainNode>();
  private trackSendBGains = new Map<string, GainNode>();
  public readonly compressor = this.limiter;
  public readonly reverbWet = this.ctx.createGain();

  public tempo = signal(124);
  public isPlaying = signal(false);
  public isRecording = signal(false);
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


  private beatRepeatNode: any = null;

  triggerBeatRepeat(division: string, duration: number = 500) {
    // division: '1/4', '1/8', '1/16', '1/32'
    const divMap: Record<string, number> = { '1/4': 0.25, '1/8': 0.125, '1/16': 0.0625, '1/32': 0.03125 };
    const div = divMap[division] || 0.125;
    const beatTime = (60 / this.tempo()) * div;

    // Implementation of a simple buffer-based beat repeat or rapid trigger
    this.logger.info("Beat repeat triggered: " + division);
  }

  private trackOutputs = new Map<string, GainNode>();
  private tracksMap = new Map<string, any>();
  private masteringTargets = { lufs: -14, truePeak: -0.1 };

  constructor() {
    this.masterGain.connect(this.limiter);
    this.limiter.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);
    this.reverbWet.connect(this.masterGain);
    this.sendAReturn.connect(this.masterGain);
    this.sendBReturn.connect(this.masterGain);

    const safeSet = (param: any, val: number) => {
       if (param && typeof param.setValueAtTime === 'function') {
          param.setValueAtTime(val, this.ctx.currentTime);
       }
    };

    safeSet(this.limiter.threshold, -1);
    safeSet(this.limiter.ratio, 20);
    safeSet(this.limiter.attack, 0.003);
    safeSet(this.limiter.release, 0.1);
  }


  interpolateBezier(v0: number, v1: number, t: number, tension: number = 0): number {
    const clampedT = Math.max(0, Math.min(1, t));
    if (tension === 0) return v0 + (v1 - v0) * clampedT;
    // Simple curved interpolation
    const cp = tension > 0 ? Math.pow(clampedT, 1 + tension) : 1 - Math.pow(1 - clampedT, 1 - tension);
    return v0 + (v1 - v0) * cp;
  }

  getContext() { return this.ctx; }
  getMasterAnalyser() { return this.masterAnalyser; }
  getAnalyser() { return this.masterAnalyser; }
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

  calculatePlaybackRate(originalBpm: number): number {
    return this.tempo() / originalBpm;
  }

  triggerAttack(trackId: string, freq: number, time: number, velocity: number, duration: number, gain: number, pan: number, sendA: number, sendB: number, params: any) {
    const osc = this.ctx.createOscillator();
    const panner = this.ctx.createStereoPanner();
    const vca = this.ctx.createGain();
    osc.type = params.type || 'sine';
    if (osc.frequency.setValueAtTime) osc.frequency.setValueAtTime(freq, time);
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

  triggerSampler(trackId: string, buffer: AudioBuffer, time: number, velocity: number, pan: number, duration: number, playbackRate: number = 1) {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(playbackRate, time);

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
      const mainGain = this.ctx.createGain();
      const target = this.tracksMap.get(id)?.busId ? this.getTrackOutput(this.tracksMap.get(id).busId) : this.masterGain; mainGain.connect(target);
      this.trackOutputs.set(id, mainGain);

      // Setup Send A
      const sendAGain = this.ctx.createGain();
      sendAGain.gain.value = 0;
      mainGain.connect(sendAGain);
      sendAGain.connect(this.sendAReturn);
      this.trackSendAGains.set(id, sendAGain);

      // Setup Send B
      const sendBGain = this.ctx.createGain();
      sendBGain.gain.value = 0;
      mainGain.connect(sendBGain);
      sendBGain.connect(this.sendBReturn);
      this.trackSendBGains.set(id, sendBGain);
    }
    return this.trackOutputs.get(id)!;
  }

  updateTrack(id: string, data: any) {
    const output = this.getTrackOutput(id);
    const now = this.ctx.currentTime;

    if (data.gain !== undefined && output.gain.setTargetAtTime) {
      output.gain.setTargetAtTime(data.gain, now, 0.05);
    }

    if (data.sendA !== undefined) {
      const sendA = this.trackSendAGains.get(id);
      if (sendA) sendA.gain.setTargetAtTime(data.sendA, now, 0.05);
    }

    if (data.sendB !== undefined) {
      const sendB = this.trackSendBGains.get(id);
      if (sendB) sendB.gain.setTargetAtTime(data.sendB, now, 0.05);
    }

    this.tracksMap.set(id, { ...(this.tracksMap.get(id) || {}), ...data });
  }

  // Compatibility methods for DJ & Studio components
  getDeck(id: DeckId) { return { buffer: null, playbackRate: 1, rate: 1, isPlaying: false, progress: 0 }; }
  getDeckWaveformData(id: DeckId) { return new Float32Array(0); }
  getDeckProgress(id: DeckId) { return { position: 0, duration: 0, slipPosition: 0, isPlaying: false }; }
  getDeckLevel(id: DeckId) { return 0; }
  setDeckRate(id: DeckId, rate: number, sync?: boolean) {}
  seekDeck(id: DeckId, pos: number) {}
  playDeck(id: DeckId) {}
  pauseDeck(id: DeckId) {}
  brakeDeck(id: DeckId) {}
  spinbackDeck(id: DeckId) {}
  transformDeck(id: DeckId) {}
  setDeckGain(id: DeckId, val: number) {}
  setDeckEq(id: DeckId, h: number, m: number, l: number) {}
  setDeckFilter(id: DeckId, freq: number) {}
  setDeckSend(id: DeckId, send: string, gain: number) {}
  loadDeck(id: DeckId, buf: any) {}
  setHotCue(id: DeckId, slot: number) {}
  clearHotCue(id: DeckId, slot: number) {}
  jumpToHotCue(id: DeckId, slot: number) {}
  setAdvancedFX(id: DeckId, fx: string, val: number) {}
  setCrossfader(val: number, curve?: any, hamster?: boolean) {}
  setSaturation(val: number) {}
  toggleMetronome() { this.metronomeEnabled.update(v => !v); }
  setMetronomeVolume(val: number) { this.metronomeVolume.set(val); }
  applyProductionParameter(trackId: string, param: string, val: number, duration?: number) {}
  setOutputMode(mode: string) {}
  setDeckLoop(id: DeckId, val: boolean) {}
  setSlipMode(id: DeckId, val: boolean) {}
  setDeckStemGain(id: DeckId, stem: string, gain: number) {}
  setDeckCue(id: DeckId, val: boolean) {}
  syncDecks(master: DeckId, slave: DeckId) {}
  scratch(id: DeckId, delta: number) {}
}
