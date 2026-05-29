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
  channelGain: number;
  crossfadeGain: number;
}

interface MasteringTargets {
  lufs: number;
  truePeak: number;
}

@Injectable({
  providedIn: 'root',
})
export class AudioEngineService {
  private static readonly INTEGER_TRACK_ID_PATTERN = /^-?\d+$/;
  private static readonly STEM_ORDER: (keyof Stems)[] = [
    'vocals',
    'drums',
    'bass',
    'instrumental',
    'other',
  ];
  private static readonly DEFAULT_LOOKAHEAD_SECONDS = 0.2;
  private static readonly DEFAULT_SCHEDULER_INTERVAL_MS = 25;
  private static readonly MIN_ENVELOPE_GAIN = 0.0001;

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
  public onScheduleStep:
    | ((step: number, when: number, stepDuration: number) => void)
    | null = null;

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
  private schedulerHandle: ReturnType<typeof setInterval> | null = null;
  private nextNoteTime = 0;
  private currentStep = 0;
  private masteringTargets: MasteringTargets = { lufs: -13, truePeak: -0.2 };

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
    this.delayNode = this.ctx.createDelay();

    this.masterGain.gain.value = 0.85;
    this.masterEQ.type = 'highshelf';
    this.masterEQ.frequency.value = 12000;
    this.masterEQ.gain.value = 0;
    this.reverbWet.gain.value = 0;
    this.delayNode.delayTime.value = 0.18;

    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.saturationNode);
    this.saturationNode.connect(this.masterEQ);
    this.masterEQ.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);

    this.reverbConvolver.connect(this.reverbWet);
    this.reverbWet.connect(this.masterGain);
    this.delayNode.connect(this.masterGain);

    this.configureLimiter({
      threshold: this.masteringTargets.truePeak,
      ratio: 20,
      attack: 0.001,
      release: 0.1,
    });
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
      channelGain: 1,
      crossfadeGain: id === 'A' ? 1 : 0,
    };

    deck.eqLow.type = 'lowshelf';
    deck.eqLow.frequency.value = 320;
    deck.eqMid.type = 'peaking';
    deck.eqMid.frequency.value = 1200;
    deck.eqMid.Q.value = 0.9;
    deck.eqHigh.type = 'highshelf';
    deck.eqHigh.frequency.value = 3200;
    deck.filter.type = 'lowpass';
    deck.filter.frequency.value = 20000;
    deck.filter.Q.value = 0.707;
    deck.analyser.fftSize = 1024;
    deck.sendA.gain.value = 0;
    deck.sendB.gain.value = 0;

    for (const stem of AudioEngineService.STEM_ORDER) {
      deck.gains[stem].gain.value = 1;
      deck.gains[stem]
        .connect(deck.eqLow)
        .connect(deck.eqMid)
        .connect(deck.eqHigh)
        .connect(deck.filter)
        .connect(deck.pan)
        .connect(deck.analyser);
    }

    deck.analyser.connect(deck.gain);
    deck.gain.connect(this.masterGain);
    deck.gain.connect(deck.sendA);
    deck.gain.connect(deck.sendB);
    deck.sendA.connect(this.reverbConvolver);
    deck.sendB.connect(this.delayNode);

    if (id === 'A') {
      this.deckA = deck;
    } else {
      this.deckB = deck;
    }

    this.applyDeckOutputGain(deck);
  }

  getContext() {
    return this.ctx;
  }

  resume() {
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  isPlayingStatus() {
    return this.isPlaying();
  }

  start() {
    this.resume();
    this.isPlaying.set(true);
    if (this.nextNoteTime <= this.ctx.currentTime) {
      this.nextNoteTime = this.ctx.currentTime + 0.05;
    }
    if (!this.schedulerHandle) {
      this.schedulerHandle = setInterval(
        () => this.scheduler(),
        AudioEngineService.DEFAULT_SCHEDULER_INTERVAL_MS
      );
    }
  }

  stop() {
    this.isPlaying.set(false);
    if (this.schedulerHandle) {
      clearInterval(this.schedulerHandle);
      this.schedulerHandle = null;
    }
  }

  stepsPerBeat() {
    return 4;
  }

  loopEnd() {
    return this.loopLengthSteps();
  }

  setLoopLengthBars(bars: number) {
    const normalizedBars = Math.max(1, Math.round(bars));
    const nextLength = normalizedBars * this.stepsPerBeat() * 4;
    this.loopLengthSteps.set(nextLength);
    if (this.currentStep >= nextLength) {
      this.currentStep = this.currentStep % nextLength;
      this.currentBeat.set(this.currentStep / this.stepsPerBeat());
    }
  }

  private scheduler() {
    const stepDuration = 60 / this.tempo() / this.stepsPerBeat();
    while (
      this.nextNoteTime <
      this.ctx.currentTime + AudioEngineService.DEFAULT_LOOKAHEAD_SECONDS
    ) {
      const step = this.currentStep;
      this.onScheduleStep?.(step, this.nextNoteTime, stepDuration);
      this.currentBeat.set(step / this.stepsPerBeat());
      this.playMetronomeClick(
        this.nextNoteTime,
        step % this.stepsPerBeat() === 0
      );
      this.nextNoteTime += stepDuration;
      this.currentStep = (this.currentStep + 1) % this.loopEnd();
    }
  }

  setMetronomeVolume(val: number) {
    this.metronomeVolume.set(this.clamp(val, 0, 1));
  }

  toggleMetronome() {
    const next = !this.metronomeEnabled();
    this.metronomeEnabled.set(next);
    return next;
  }

  playMetronomeClick(when: number, isDownbeat: boolean) {
    if (!this.metronomeEnabled()) {
      return;
    }

    this.resume();
    const osc = this.ctx.createOscillator();
    const vca = this.ctx.createGain();
    const frequency = isDownbeat ? 1200 : 800;
    osc.type = 'square';
    osc.frequency.value = frequency;
    osc.frequency.setValueAtTime(frequency, when);
    vca.gain.setValueAtTime(AudioEngineService.MIN_ENVELOPE_GAIN, when);
    vca.gain.linearRampToValueAtTime(this.metronomeVolume(), when + 0.002);
    vca.gain.exponentialRampToValueAtTime(
      AudioEngineService.MIN_ENVELOPE_GAIN,
      when + 0.05
    );
    osc.connect(vca).connect(this.masterGain);
    osc.start(when);
    osc.stop(when + 0.06);
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

    const actualVel = Math.max(0, velocity * velocityScale);
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

    if (sendA > 0 || sendB > 0) {
      vca.connect(this.masterGain);
    }

    if (this.isRecording()) {
      this.recorder.pendingMidi.push({
        pitch: this.frequencyToMidi(freq),
        startTime: when,
        duration,
        velocity,
      });
    }
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
      1,
      pan,
      0,
      0,
      synthParams
    );
  }

  triggerSampler(
    id: number,
    buffer: AudioBuffer,
    when: number,
    gain: number,
    pan: number,
    velocityScale = 1
  ) {
    this.resume();
    const source = this.ctx.createBufferSource();
    const vca = this.ctx.createGain();
    const panner = this.ctx.createStereoPanner();

    source.buffer = buffer;
    panner.pan.value = this.clamp(pan, -1, 1);
    vca.gain.setValueAtTime(0, when);
    vca.gain.linearRampToValueAtTime(
      this.clamp(gain * velocityScale, 0, 1),
      when + 0.005
    );
    vca.gain.exponentialRampToValueAtTime(
      AudioEngineService.MIN_ENVELOPE_GAIN,
      when + 0.25
    );

    source.connect(vca).connect(panner).connect(this.getTrackOutput(id));
    source.start(when);
    source.stop(when + 0.35);
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
    const track = this.tracksMap.get(id);
    if (track) {
      Object.assign(track, patch);
    }
  }

  removeTrack(id: number) {
    this.trackOutputs.get(id)?.disconnect();
    this.trackOutputs.delete(id);
    this.tracksMap.delete(id);
  }

  setMasterOutputLevel(val: number) {
    this.masterGain.gain.setTargetAtTime(
      this.clamp(val, 0, 1.5),
      this.ctx.currentTime,
      0.01
    );
  }

  setOutputMode(mode: any) {
    this.outputMode.set(mode);
  }

  setSaturation(amount: number) {
    const safeAmount = this.clamp(amount, 0, 1);
    if (safeAmount === 0) {
      this.saturationNode.curve = null;
      this.saturationNode.oversample = 'none';
      return;
    }

    const curve = new Float32Array(512);
    for (let index = 0; index < curve.length; index++) {
      const x = (index / (curve.length - 1)) * 2 - 1;
      curve[index] = Math.tanh(x * (1 + safeAmount * 20));
    }

    this.saturationNode.curve = curve;
    this.saturationNode.oversample = '4x';
  }

  getMasteringTargets() {
    return { ...this.masteringTargets };
  }

  setMasteringTargets(params: Partial<MasteringTargets>) {
    this.masteringTargets = {
      ...this.masteringTargets,
      ...params,
    };
    this.configureCompressor({
      threshold: this.masteringTargets.truePeak,
      ratio: 4,
    });
  }

  getMasterAnalyser() {
    return this.deckA.analyser;
  }

  getAnalyser() {
    return this.deckA.analyser;
  }

  configureCompressor(params: {
    threshold?: number;
    ratio?: number;
    attack?: number;
    release?: number;
  }) {
    if (typeof params.threshold === 'number') {
      this.compressor.threshold.setTargetAtTime(
        params.threshold,
        this.ctx.currentTime,
        0.01
      );
    }
    if (typeof params.ratio === 'number') {
      this.compressor.ratio.setTargetAtTime(
        params.ratio,
        this.ctx.currentTime,
        0.01
      );
    }
    if (typeof params.attack === 'number') {
      this.compressor.attack.setTargetAtTime(
        params.attack,
        this.ctx.currentTime,
        0.01
      );
    }
    if (typeof params.release === 'number') {
      this.compressor.release.setTargetAtTime(
        params.release,
        this.ctx.currentTime,
        0.01
      );
    }
  }

  configureLimiter(params: {
    threshold?: number;
    ratio?: number;
    attack?: number;
    release?: number;
  }) {
    if (typeof params.threshold === 'number') {
      this.limiter.threshold.setTargetAtTime(
        params.threshold,
        this.ctx.currentTime,
        0.01
      );
    }
    if (typeof params.ratio === 'number') {
      this.limiter.ratio.setTargetAtTime(
        params.ratio,
        this.ctx.currentTime,
        0.01
      );
    }
    if (typeof params.attack === 'number') {
      this.limiter.attack.setTargetAtTime(
        params.attack,
        this.ctx.currentTime,
        0.01
      );
    }
    if (typeof params.release === 'number') {
      this.limiter.release.setTargetAtTime(
        params.release,
        this.ctx.currentTime,
        0.01
      );
    }
  }

  connectSidechain(triggerId: string, targetId: string) {
    this.sidechainEnabled.set(true);
    if (!this.sidechainMatrix.has(triggerId)) {
      this.sidechainMatrix.set(triggerId, new Set());
    }
    this.sidechainMatrix.get(triggerId)!.add(targetId);
  }

  disconnectSidechain(triggerId: string, targetId: string) {
    this.sidechainMatrix.get(triggerId)?.delete(targetId);
  }

  getSidechainRouting() {
    return Array.from(this.sidechainMatrix.entries()).map(
      ([triggerTrackId, targets]) => ({
        triggerTrackId,
        targetTrackIds: Array.from(targets),
      })
    );
  }

  updateAdaptivePerformance(cpuLoad: number) {
    this.performanceTier.set(cpuLoad >= 70 ? 'performance' : 'ultra');
  }

  getMasterStream() {
    const dest = this.ctx.createMediaStreamDestination();
    this.masterGain.connect(dest);
    return dest.stream;
  }

  // DJ Deck Methods
  getDeck(id: DeckId) {
    return id === 'A' ? this.deckA : this.deckB;
  }

  async loadDeck(id: DeckId, buffer: AudioBuffer) {
    const deck = this.getDeck(id);
    this.stopDeckSources(deck);
    deck.buffer = buffer;
    deck.stems = await Promise.resolve(
      this.stemSeparationService.separate(buffer)
    );
    deck.pauseOffset = 0;
    deck.startTime = this.ctx.currentTime;
    deck.rate = 1;
    deck.isPlaying = false;
    deck.slipActive = false;
    deck.hotCues = new Array(8).fill(null);
  }

  transformDeck(id: DeckId) {
    const deck = this.getDeck(id);
    const currentGain = deck.channelGain;
    this.setDeckGain(id, 0);
    setTimeout(() => this.setDeckGain(id, currentGain), 80);
  }

  getDeckProgress(id: DeckId) {
    const deck = this.getDeck(id);
    const duration = deck.buffer?.duration || 0;
    const position = this.getDeckPosition(deck);
    const slipPosition = deck.slipActive
      ? this.getSlipPosition(deck)
      : position;

    return {
      duration,
      position,
      isPlaying: deck.isPlaying,
      slipPosition,
    };
  }

  seekDeck(id: DeckId, pos: number) {
    const deck = this.getDeck(id);
    const duration = deck.buffer?.duration || 0;
    if (!duration) {
      deck.pauseOffset = 0;
      return;
    }

    const clamped = this.clamp(pos, 0, duration);
    deck.pauseOffset = clamped;
    if (deck.isPlaying) {
      this.restartDeckPlayback(deck, clamped);
    }
  }

  playDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck.buffer || deck.isPlaying) {
      return;
    }

    this.resume();
    const startOffset =
      deck.buffer.duration && deck.pauseOffset >= deck.buffer.duration
        ? 0
        : deck.pauseOffset;
    deck.pauseOffset = startOffset;
    deck.startTime =
      this.ctx.currentTime - startOffset / Math.max(0.05, Math.abs(deck.rate));
    deck.slipActive = false;
    deck.isPlaying = true;
    this.stopDeckSources(deck);
    this.startDeckSources(deck, startOffset);
  }

  pauseDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck.isPlaying) {
      return;
    }

    const position = this.getDeckPosition(deck);
    deck.pauseOffset = position;
    deck.isPlaying = false;
    this.stopDeckSources(deck);

    if (deck.slipEnabled) {
      deck.slipActive = true;
      deck.slipStartTime = this.ctx.currentTime;
      deck.slipStartOffset = position;
    } else {
      deck.slipActive = false;
    }
  }

  setDeckGain(id: DeckId, gain: number) {
    const deck = this.getDeck(id);
    deck.channelGain = this.clamp(gain, 0, 2);
    this.applyDeckOutputGain(deck);
  }

  setCrossfader(
    val: number,
    curve: 'linear' | 'power' | 'exp' | 'cut' = 'linear',
    hamster = false
  ) {
    const position = this.clamp(hamster ? -val : val, -1, 1);
    this.deckA.crossfadeGain = this.getCrossfadeGain(position, curve, 'A');
    this.deckB.crossfadeGain = this.getCrossfadeGain(position, curve, 'B');
    this.applyDeckOutputGain(this.deckA);
    this.applyDeckOutputGain(this.deckB);
  }

  brakeDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck.isPlaying) {
      return;
    }
    this.setDeckRate(id, 0.1);
    setTimeout(() => {
      this.pauseDeck(id);
      this.setDeckRate(id, 1);
    }, 220);
  }

  spinbackDeck(id: DeckId) {
    const progress = this.getDeckProgress(id);
    this.seekDeck(id, Math.max(0, progress.position - 1.5));
    this.setDeckRate(id, 1.75, false);
    setTimeout(() => this.setDeckRate(id, 1), 160);
  }

  getDeckWaveformData(id: DeckId) {
    const buffer = this.getDeck(id).buffer;
    if (!buffer) {
      return new Float32Array(0);
    }

    const channel = buffer.getChannelData(0);
    const buckets = 256;
    const segmentLength = Math.max(1, Math.floor(channel.length / buckets));
    const waveform = new Float32Array(buckets);

    for (let bucket = 0; bucket < buckets; bucket++) {
      const start = bucket * segmentLength;
      const end = Math.min(channel.length, start + segmentLength);
      let peak = 0;
      for (let index = start; index < end; index++) {
        peak = Math.max(peak, Math.abs(channel[index]));
      }
      waveform[bucket] = peak;
    }

    return waveform;
  }

  getDeckLevel(id: DeckId) {
    const deck = this.getDeck(id);
    const analyser = deck.analyser as AnalyserNode & {
      getByteTimeDomainData?: (array: Uint8Array) => void;
    };

    if (typeof analyser.getByteTimeDomainData === 'function') {
      const values = new Uint8Array(deck.analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(values);
      let sum = 0;
      for (const value of values) {
        const centered = (value - 128) / 128;
        sum += centered * centered;
      }
      return Math.min(1, Math.sqrt(sum / values.length) * 2.5);
    }

    return deck.isPlaying
      ? this.clamp(deck.channelGain * deck.crossfadeGain * 0.85, 0, 1)
      : 0;
  }

  setDeckRate(id: DeckId, rate: number, smooth = true) {
    const deck = this.getDeck(id);
    const currentPosition = this.getDeckPosition(deck);
    // Reverse playback is not supported by AudioBufferSourceNode playbackRate,
    // so platter motion uses seekDeck() for direction and rate only controls speed.
    const safeRate = this.clamp(Math.abs(rate) || 0.05, 0.05, 3);
    deck.rate = safeRate;

    if (deck.isPlaying) {
      deck.startTime =
        this.ctx.currentTime - currentPosition / Math.max(0.05, safeRate);
    }

    for (const stem of AudioEngineService.STEM_ORDER) {
      const source = deck.sources[stem];
      if (!source) {
        continue;
      }
      if (smooth) {
        source.playbackRate.cancelScheduledValues(this.ctx.currentTime);
        source.playbackRate.setTargetAtTime(
          safeRate,
          this.ctx.currentTime,
          0.01
        );
      } else {
        source.playbackRate.setValueAtTime(safeRate, this.ctx.currentTime);
      }
    }
  }

  setDeckLoop(id: DeckId, state: boolean) {
    const deck = this.getDeck(id);
    deck.loopEnabled = state;
    for (const stem of AudioEngineService.STEM_ORDER) {
      const source = deck.sources[stem];
      if (source) {
        source.loop = state;
      }
    }
  }

  setSlipMode(id: DeckId, state: boolean) {
    const deck = this.getDeck(id);
    deck.slipEnabled = state;
    if (!state) {
      deck.slipActive = false;
    }
  }

  setDeckStemGain(id: DeckId, stem: keyof Stems, gain: number) {
    const deck = this.getDeck(id);
    deck.gains[stem].gain.setTargetAtTime(
      this.clamp(gain, 0, 2),
      this.ctx.currentTime,
      0.01
    );
  }

  setHotCue(id: DeckId, slot: number) {
    const deck = this.getDeck(id);
    deck.hotCues[slot] = this.getDeckPosition(deck);
  }

  clearHotCue(id: DeckId, slot: number) {
    const deck = this.getDeck(id);
    deck.hotCues[slot] = null;
  }

  jumpToHotCue(id: DeckId, slot: number) {
    const cue = this.getDeck(id).hotCues[slot];
    if (cue !== null) {
      this.seekDeck(id, cue);
    }
  }

  setDeckEq(id: DeckId, high: number, mid: number, low: number) {
    const deck = this.getDeck(id);
    deck.eqHigh.gain.setTargetAtTime(
      this.eqValueToDb(high),
      this.ctx.currentTime,
      0.01
    );
    deck.eqMid.gain.setTargetAtTime(
      this.eqValueToDb(mid),
      this.ctx.currentTime,
      0.01
    );
    deck.eqLow.gain.setTargetAtTime(
      this.eqValueToDb(low),
      this.ctx.currentTime,
      0.01
    );
  }

  setDeckFilter(id: DeckId, freq: number) {
    const deck = this.getDeck(id);
    deck.filter.frequency.setTargetAtTime(
      this.clamp(freq, 20, 20000),
      this.ctx.currentTime,
      0.01
    );
  }

  setDeckSend(id: DeckId, send: 'A' | 'B', gain: number) {
    const deck = this.getDeck(id);
    const target = send === 'A' ? deck.sendA : deck.sendB;
    target.gain.setTargetAtTime(
      this.clamp(gain, 0, 1),
      this.ctx.currentTime,
      0.01
    );
  }

  applyProductionParameter(
    trackId: string,
    parameter: string,
    value: number,
    duration = 0.01,
    scheduledTime?: number
  ) {
    this.logger.info(`Applying param ${parameter} to ${trackId}`);

    if (trackId === '0' && parameter === 'tempo') {
      this.tempo.set(value);
      return;
    }

    if (!AudioEngineService.INTEGER_TRACK_ID_PATTERN.test(trackId)) {
      return;
    }

    const id = Number(trackId);
    this.updateTrack(id, { [parameter]: value });

    if (parameter === 'gain') {
      this.getTrackOutput(id).gain.setTargetAtTime(
        value,
        scheduledTime ?? this.ctx.currentTime,
        duration
      );
    }
  }

  private applyDeckOutputGain(deck: DeckChannel) {
    deck.gain.gain.setTargetAtTime(
      deck.channelGain * deck.crossfadeGain,
      this.ctx.currentTime,
      0.01
    );
  }

  private getDeckPosition(deck: DeckChannel) {
    const duration = deck.buffer?.duration || 0;
    if (!deck.isPlaying) {
      return this.clamp(deck.pauseOffset, 0, duration || deck.pauseOffset);
    }

    const elapsed =
      (this.ctx.currentTime - deck.startTime) *
      Math.max(0.05, Math.abs(deck.rate));
    if (deck.loopEnabled && duration > 0) {
      return this.wrapPosition(deck.pauseOffset + elapsed, duration);
    }
    return this.clamp(deck.pauseOffset + elapsed, 0, duration || elapsed);
  }

  private getSlipPosition(deck: DeckChannel) {
    const duration = deck.buffer?.duration || 0;
    const elapsed =
      (this.ctx.currentTime - deck.slipStartTime) *
      Math.max(0.05, Math.abs(deck.rate));
    if (deck.loopEnabled && duration > 0) {
      return this.wrapPosition(deck.slipStartOffset + elapsed, duration);
    }
    return this.clamp(deck.slipStartOffset + elapsed, 0, duration || elapsed);
  }

  private wrapPosition(position: number, duration: number) {
    // Normalize wrapped positions into the positive 0..duration range.
    return ((position % duration) + duration) % duration;
  }

  private startDeckSources(deck: DeckChannel, offset: number) {
    for (const stem of AudioEngineService.STEM_ORDER) {
      const sourceBuffer =
        deck.stems?.[stem] ?? (stem === 'instrumental' ? deck.buffer : null);
      if (!sourceBuffer) {
        continue;
      }

      const source = this.ctx.createBufferSource();
      source.buffer = sourceBuffer;
      source.loop = deck.loopEnabled;
      source.playbackRate.value = deck.rate;
      source.connect(deck.gains[stem]);
      source.start(0, offset);
      deck.sources[stem] = source;
    }
  }

  private stopDeckSources(deck: DeckChannel) {
    for (const stem of AudioEngineService.STEM_ORDER) {
      const source = deck.sources[stem];
      if (!source) {
        continue;
      }
      try {
        source.stop();
      } catch {
        // AudioBufferSourceNodes are single-shot and may already be stopped.
      }
      source.disconnect();
      deck.sources[stem] = null;
    }
  }

  private restartDeckPlayback(deck: DeckChannel, offset: number) {
    this.stopDeckSources(deck);
    deck.pauseOffset = offset;
    deck.startTime =
      this.ctx.currentTime - offset / Math.max(0.05, Math.abs(deck.rate));
    this.startDeckSources(deck, offset);
  }

  private getCrossfadeGain(
    value: number,
    curve: 'linear' | 'power' | 'exp' | 'cut',
    deckId: DeckId
  ) {
    const normalized = (value + 1) / 2;
    const a = 1 - normalized;
    const b = normalized;

    if (curve === 'power') {
      return deckId === 'A'
        ? Math.cos(normalized * Math.PI * 0.5)
        : Math.sin(normalized * Math.PI * 0.5);
    }

    if (curve === 'exp') {
      return deckId === 'A' ? a * a : b * b;
    }

    if (curve === 'cut') {
      if (deckId === 'A') {
        return normalized < 0.45 ? 1 : normalized > 0.55 ? 0 : 0.5;
      }
      return normalized > 0.55 ? 1 : normalized < 0.45 ? 0 : 0.5;
    }

    return deckId === 'A' ? a : b;
  }

  private eqValueToDb(value: number) {
    return (this.clamp(value, 0, 2) - 1) * 18;
  }

  private frequencyToMidi(freq: number) {
    return Math.round(69 + 12 * Math.log2(freq / 440));
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }
}
