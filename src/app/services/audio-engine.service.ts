import { LoggingService } from './logging.service';
import { Injectable, signal, inject, Injector } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { StudioRecordingEngineService } from '../studio/studio-recording-engine.service';
import { StemSeparationService, Stems } from './stem-separation.service';

@Injectable({
  providedIn: 'root',
})
export class AudioEngineService {
  private static readonly INTEGER_TRACK_ID_PATTERN = /^-?\d+$/;
  public outputMode = signal<'speakers' | 'headphones'>('speakers');
  public performanceTier = signal<'ultra' | 'performance'>('ultra');
  public sidechainEnabled = signal(false);
  public tempo = signal(124);
  public recordingLatency = signal(0);
  public metronomeEnabled = signal(false);
  public metronomeVolume = signal(0.5);

  public logger = inject(LoggingService);
  private injector = inject(Injector);
  public ctx: AudioContext;

  public masterGain!: GainNode;
  public compressor!: DynamicsCompressorNode;
  private masterEQ!: BiquadFilterNode;
  public saturationNode!: WaveShaperNode;
  public reverbWet!: GainNode;
  private reverbConvolver!: ConvolverNode;
  private delayNode!: DelayNode;

  private trackOutputs = new Map<number, GainNode>();
  private sidechainMatrix = new Map<string, Set<string>>();
  private tracksMap = new Map<number, any>();
  private busses = new Map<string, GainNode>();

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.setupMasterChain();
  }

  public get recorder(): StudioRecordingEngineService {
    return this.injector.get(StudioRecordingEngineService);
  }

  private setupMasterChain() {
    this.masterGain = this.ctx.createGain();
    this.compressor = this.ctx.createDynamicsCompressor();
    this.masterEQ = this.ctx.createBiquadFilter();
    this.saturationNode = this.ctx.createWaveShaper();
    this.reverbWet = this.ctx.createGain();
    this.reverbConvolver = this.ctx.createConvolver();

    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.saturationNode);
    this.saturationNode.connect(this.masterEQ);
    this.masterEQ.connect(this.ctx.destination);

    this.reverbConvolver.connect(this.reverbWet);
    this.reverbWet.connect(this.masterGain);
  }

  getContext() { return this.ctx; }
  resume() { if (this.ctx.state === 'suspended') this.ctx.resume(); }
  isPlaying() { return this.ctx.state === 'running'; }
  start() { this.resume(); }
  stop() { }

  currentBeat() { return 0; }
  stepsPerBeat() { return 4; }
  loopEnd() { return 64; }

  triggerAttack(
    id: number,
    freq: number,
    when: number,
    velocity: number,
    duration: number,
    gain: number,
    pan: number,
    sendA: number,
    sendB: number,
    synthParams: any,
    velocityScale: number = 1,
    customCtx?: BaseAudioContext
  ) {
    const context = customCtx || this.ctx;
    this.resume();
    const osc = context.createOscillator();
    const vca = context.createGain();
    const panner = context.createStereoPanner();
    const filter = context.createBiquadFilter();

    osc.type = synthParams.type || 'sine';
    osc.frequency.setValueAtTime(freq, when);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(synthParams.cutoff || 20000, when);
    filter.Q.setValueAtTime(synthParams.q || 1, when);

    const actualVel = velocity * velocityScale;
    const attack = synthParams.attack || 0.005;
    const release = synthParams.release || 0.1;

    vca.gain.setValueAtTime(0, when);
    vca.gain.linearRampToValueAtTime(actualVel * gain, when + attack);
    vca.gain.setValueAtTime(actualVel * gain, when + duration);
    vca.gain.exponentialRampToValueAtTime(0.001, when + duration + release);

    panner.pan.setValueAtTime(pan, when);

    const trackOut = this.getTrackOutput(id);
    const dest = customCtx ? (customCtx as any).destination : trackOut;

    osc.connect(filter).connect(vca).connect(panner).connect(dest);

    osc.start(when);
    osc.stop(when + duration + release + 0.1);
  }

  playSynth(time: number, freq: number, duration: number, velocity: number) {
     this.triggerAttack(0, freq, time, velocity, duration, 0.8, 0, 0, 0, { type: 'sine' });
  }

  getTrackOutput(id: number): GainNode {
    if (!this.trackOutputs.has(id)) {
      const g = this.ctx.createGain();
      g.connect(this.masterGain);
      this.trackOutputs.set(id, g);
    }
    return this.trackOutputs.get(id)!;
  }

  ensureTrack(track: any) { this.tracksMap.set(track.id, track); }
  updateTrack(id: number, patch: any) {
    const t = this.tracksMap.get(id);
    if (t) Object.assign(t, patch);
  }
  removeTrack(id: number) {
    this.trackOutputs.get(id)?.disconnect();
    this.trackOutputs.delete(id);
    this.tracksMap.delete(id);
  }

  setMasterOutputLevel(val: number) { this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.01); }
  setMetronomeVolume(val: number) { this.metronomeVolume.set(val); }
  toggleMetronome() { this.metronomeEnabled.update(v => !v); }

  setSaturation(amount: number) {}
  getMasteringTargets() { return { lufs: -14, truePeak: -0.1 }; }
  setMasteringTargets(params: any) {}
  getMasterAnalyser() { return null; }
  configureCompressor(params: any) {}
  configureLimiter(params: any) {}

  connectSidechain(triggerId: string, targetId: string) {
     this.sidechainEnabled.set(true);
     if (!this.sidechainMatrix.has(triggerId)) this.sidechainMatrix.set(triggerId, new Set());
     this.sidechainMatrix.get(triggerId)!.add(targetId);
  }
  disconnectSidechain(triggerId: string, targetId: string) {
     this.sidechainMatrix.get(triggerId)?.delete(targetId);
  }

  getMasterStream() {
     const dest = this.ctx.createMediaStreamDestination();
     this.masterEQ.connect(dest);
     return dest;
  }

  // DJ Deck Methods
  transformDeck(deck: any) {}
  getDeckProgress(deck: any) { return { duration: 0, position: 0, isPlaying: false, slipPosition: 0 }; }
  seekDeck(deck: any, pos: number) {}
  playDeck(deck: any) {}
  pauseDeck(deck: any) {}
  setDeckGain(deck: any, gain: number) {}
  setCrossfader(val: number) {}
  brakeDeck(deck: any) {}
  spinbackDeck(deck: any) {}
  getDeckWaveformData(id: any) { return new Float32Array(0); }
  getDeckLevel(id: any) { return 0; }
  setDeckRate(deck: any, rate: number, param?: any) {}
  getDeck(id: any) { return { buffer: null }; }

  applyProductionParameter(trackId: string, parameter: string, value: number, duration = 0.01, scheduledTime?: number) {
     this.logger.info(`Applying param ${parameter} to ${trackId}`);
  }
}
