import { LoggingService } from './logging.service';
import { Injectable, signal, inject, Injector } from '@angular/core';
import { StudioRecordingEngineService } from '../studio/studio-recording-engine.service';
import { StemSeparationService, Stems } from './stem-separation.service';

export type DeckId = 'A' | 'B';

interface DeckChannel {
  id: DeckId;
  buffer: AudioBuffer | null;
  sources: { [K in keyof Stems]?: AudioBufferSourceNode | null };
  gains: { [K in keyof Stems]: GainNode };
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  filter: BiquadFilterNode;
  pan: StereoPannerNode;
  gain: GainNode;
  sendA: GainNode;
  sendB: GainNode;
  analyser: AnalyserNode;
  isPlaying: boolean;
  startTime: number;
  pauseOffset: number;
  rate: number;
  stems: Stems | null;
  loopEnabled: boolean;
  slipEnabled: boolean;
  slipActive: boolean;
  slipStartTime: number;
  slipStartOffset: number;
  hotCues: (number | null)[];
}

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
  public isRecording = signal(false);
  public currentBeat = signal(0);
  public isPlaying = signal(false);

  public logger = inject(LoggingService);
  private injector = inject(Injector);
  private stemSeparationService = inject(StemSeparationService);
  public ctx: AudioContext;

  public masterGain!: GainNode;
  public compressor!: DynamicsCompressorNode;
  public limiter!: DynamicsCompressorNode;
  private masterEQ!: BiquadFilterNode;
  public saturationNode!: WaveShaperNode;
  public reverbWet!: GainNode;
  private reverbConvolver!: ConvolverNode;
  private delayNode!: DelayNode;

  private trackOutputs = new Map<number, GainNode>();
  private sidechainMatrix = new Map<string, Set<string>>();
  private tracksMap = new Map<number, any>();
  private busses = new Map<string, GainNode>();

  private deckA!: DeckChannel;
  private deckB!: DeckChannel;

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
      latencyHint: 'interactive',
    });
    this.setupMasterChain();
    this.initDeck('A');
    this.initDeck('B');
  }

  public get recorder(): StudioRecordingEngineService {
    return this.injector.get(StudioRecordingEngineService);
  }

  private setupMasterChain() {
    this.masterGain = this.ctx.createGain();
    this.compressor = this.ctx.createDynamicsCompressor();
    this.limiter = this.ctx.createDynamicsCompressor();
    this.masterEQ = this.ctx.createBiquadFilter();
    this.saturationNode = this.ctx.createWaveShaper();
    this.reverbWet = this.ctx.createGain();
    this.reverbConvolver = this.ctx.createConvolver();

    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.saturationNode);
    this.saturationNode.connect(this.masterEQ);
    this.masterEQ.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);

    this.reverbConvolver.connect(this.reverbWet);
    this.reverbWet.connect(this.masterGain);
  }

  private initDeck(id: DeckId) {
    const deck: DeckChannel = {
      id,
      buffer: null,
      sources: {},
      gains: {
        vocals: this.ctx.createGain(),
        drums: this.ctx.createGain(),
        bass: this.ctx.createGain(),
        instrumental: this.ctx.createGain(),
        other: this.ctx.createGain(),
      },
      eqLow: this.ctx.createBiquadFilter(),
      eqMid: this.ctx.createBiquadFilter(),
      eqHigh: this.ctx.createBiquadFilter(),
      filter: this.ctx.createBiquadFilter(),
      pan: this.ctx.createStereoPanner(),
      gain: this.ctx.createGain(),
      sendA: this.ctx.createGain(),
      sendB: this.ctx.createGain(),
      analyser: this.ctx.createAnalyser(),
      isPlaying: false,
      startTime: 0,
      pauseOffset: 0,
      rate: 1,
      stems: null,
      loopEnabled: false,
      slipEnabled: false,
      slipActive: false,
      slipStartTime: 0,
      slipStartOffset: 0,
      hotCues: new Array(8).fill(null),
    };
    deck.gain.connect(this.masterGain);
    if (id === 'A') this.deckA = deck;
    else this.deckB = deck;
  }

  getContext() {
    return this.ctx;
  }
  resume() {
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  isPlayingStatus() {
    return this.isPlaying();
  }
  start() {
    this.resume();
    this.isPlaying.set(true);
  }
  stop() {
    this.isPlaying.set(false);
  }

  stepsPerBeat() {
    return 4;
  }
  loopEnd() {
    return 64;
  }

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
    vca.gain.linearRampToValueAtTime(2, when + attack);
    vca.gain.setValueAtTime(actualVel * gain, when + duration);
    vca.gain.exponentialRampToValueAtTime(0.001, when + duration + release);

    panner.pan.setValueAtTime(pan, when);

    const trackOut = this.getTrackOutput(id);
    const dest = customCtx ? (customCtx as any).destination : trackOut;

    osc.connect(filter).connect(vca).connect(panner).connect(dest);

    osc.start(when);
    osc.stop(when + duration + release + 0.1);
  }

  playSynth(
    time: number,
    freq: number,
    duration: number,
    velocity: number,
    pan: number = 0,
    synthParams: any = { type: 'sine' }
  ) {
    this.triggerAttack(
      0,
      freq,
      time,
      velocity,
      duration,
      0.8,
      pan,
      0,
      0,
      synthParams
    );
  }

  getTrackOutput(id: number): GainNode {
    if (!this.trackOutputs.has(id)) {
      const g = this.ctx.createGain();
      g.connect(this.masterGain);
      this.trackOutputs.set(id, g);
    }
    return this.trackOutputs.get(id)!;
  }

  ensureTrack(track: any) {
    this.tracksMap.set(track.id, track);
  }
  updateTrack(id: number, patch: any) {
    const t = this.tracksMap.get(id);
    if (t) Object.assign(t, patch);
  }
  removeTrack(id: number) {
    this.trackOutputs.get(id)?.disconnect();
    this.trackOutputs.delete(id);
    this.tracksMap.delete(id);
  }

  setMasterOutputLevel(val: number) {
    this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.01);
  }
  setMetronomeVolume(val: number) {
    this.metronomeVolume.set(val);
  }
  toggleMetronome() {
    this.metronomeEnabled.update((v) => !v);
  }
  setOutputMode(mode: any) {
    this.outputMode.set(mode);
  }

  setSaturation(amount: number) {}
  getMasteringTargets() {
    return { lufs: -13, truePeak: -0.2 };
  }
  setMasteringTargets(params: any) {}
  getMasterAnalyser() {
    return null;
  }
  getAnalyser() {
    return null;
  }
  configureCompressor(params: any) {}
  configureLimiter(params: any) {}

  connectSidechain(triggerId: string, targetId: string) {
    this.sidechainEnabled.set(true);
    if (!this.sidechainMatrix.has(triggerId))
      this.sidechainMatrix.set(triggerId, new Set());
    this.sidechainMatrix.get(triggerId)!.add(targetId);
  }
  disconnectSidechain(triggerId: string, targetId: string) {
    this.sidechainMatrix.get(triggerId)?.delete(targetId);
  }

  getMasterStream() {
    const dest = this.ctx.createMediaStreamDestination();
    this.masterGain.connect(dest);
    return dest;
  }

  // DJ Deck Methods
  getDeck(id: DeckId) {
    return id === 'A' ? this.deckA : this.deckB;
  }
  async loadDeck(id: DeckId, buffer: AudioBuffer) {
    const deck = this.getDeck(id);
    deck.buffer = buffer;
    deck.stems = await this.stemSeparationService.separate(buffer);
  }
  transformDeck(id: DeckId) {}
  getDeckProgress(id: DeckId) {
    return { duration: 0, position: 0, isPlaying: false, slipPosition: 0 };
  }
  seekDeck(id: DeckId, pos: number) {}
  playDeck(id: DeckId) {}
  pauseDeck(id: DeckId) {}
  setDeckGain(id: DeckId, gain: number) {}
  setCrossfader(val: number, curve?: any, hamster?: boolean) {}
  brakeDeck(id: DeckId) {}
  spinbackDeck(id: DeckId) {}
  getDeckWaveformData(id: DeckId) {
    return new Float32Array(0);
  }
  getDeckLevel(id: DeckId) {
    return 0;
  }
  setDeckRate(id: DeckId, rate: number, param?: any) {}
  setDeckLoop(id: DeckId, state: boolean) {}
  setSlipMode(id: DeckId, state: boolean) {}
  setDeckStemGain(id: DeckId, stem: any, gain: number) {}
  setHotCue(id: DeckId, slot: number) {}
  clearHotCue(id: DeckId, slot: number) {}
  jumpToHotCue(id: DeckId, slot: number) {}
  setDeckEq(id: DeckId, high: number, mid: number, low: number) {}
  setDeckFilter(id: DeckId, freq: number) {}
  setDeckSend(id: DeckId, send: any, gain: number) {}

  applyProductionParameter(
    trackId: string,
    parameter: string,
    value: number,
    duration = 0.01,
    scheduledTime?: number
  ) {
    this.logger.info(`Applying param ${parameter} to ${trackId}`);
  }
}
