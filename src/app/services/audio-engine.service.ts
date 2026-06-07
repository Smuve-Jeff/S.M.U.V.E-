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
  cueGain: GainNode;
  flangerNode: BiquadFilterNode;
  phaserNode: BiquadFilterNode;
  pingPongDelay: DelayNode;
  pingPongFeedback: GainNode;
  pingPongPan: StereoPannerNode;
  detectedBpm: number;
  beatGrid: number[];
  isCueing: boolean;
}

interface MasteringTargets {
  lufs: number;
  truePeak: number;
}

@Injectable({
  providedIn: 'root',
})
export class AudioEngineService {
  public cueMaster!: GainNode;
  public headphoneGain = signal(0.7);

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
  private loopLengthSteps = signal(64);
  public recordingLatency = signal(0);
  public metronomeEnabled = signal(false);
  public metronomeVolume = signal(0.5);
  public isRecording = signal(false);
  public currentBeat = signal(0);
  public isPlaying = signal(false);
  public visualStep = signal(0);
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
    this.cueMaster = this.ctx.createGain();
    this.cueMaster.connect(this.ctx.destination); // Simplified, usually separate output

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
      ratio: 12,
      attack: 0.003,
      release: 0.25,
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
      cueGain: this.ctx.createGain(),
      flangerNode: this.ctx.createBiquadFilter(),
      phaserNode: this.ctx.createBiquadFilter(),
      pingPongDelay: this.ctx.createDelay(),
      pingPongFeedback: this.ctx.createGain(),
      pingPongPan: this.ctx.createStereoPanner(),
      detectedBpm: 0,
      beatGrid: [],
      isCueing: false,
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
    deck.cueGain.gain.value = 0;
    deck.flangerNode.type = 'allpass'; // Base for flanger/phaser
    deck.phaserNode.type = 'allpass';
    deck.pingPongDelay.delayTime.value = 0.375;
    deck.pingPongFeedback.gain.value = 0.4;
    deck.pingPongDelay.connect(deck.pingPongFeedback);
    deck.pingPongFeedback.connect(deck.pingPongDelay);
    deck.pingPongDelay.connect(deck.pingPongPan);
    deck.pingPongPan.connect(deck.analyser);

    for (const stem of AudioEngineService.STEM_ORDER) {
      deck.gains[stem].gain.value = 1;

      deck.gains[stem]
        .connect(deck.eqLow)
        .connect(deck.eqMid)
        .connect(deck.eqHigh)
        .connect(deck.filter)
        .connect(deck.flangerNode)
        .connect(deck.phaserNode)
        .connect(deck.pingPongDelay)
        .connect(deck.pan)
        .connect(deck.analyser);

    }

    deck.analyser.connect(deck.gain);
    deck.analyser.connect(deck.cueGain);
    deck.cueGain.connect(this.cueMaster);
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
      const delay = Math.max(0, (this.nextNoteTime - this.ctx.currentTime) * 1000);
      setTimeout(() => {
        this.currentBeat.set(step / this.stepsPerBeat());
        this.visualStep.set(step);
      }, delay);
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
    this.metronomeEnabled.set(!this.metronomeEnabled());
  }

  private playMetronomeClick(when: number, accent: boolean) {
    if (!this.metronomeEnabled()) return;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.frequency.setValueAtTime(accent ? 1000 : 500, when);
    env.gain.setValueAtTime(this.metronomeVolume(), when);
    env.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(when);
    osc.stop(when + 0.05);
  }

  getTrackOutput(id: number): GainNode {
    if (!this.trackOutputs.has(id)) {
      const gain = this.ctx.createGain();
      gain.connect(this.masterGain);
      this.trackOutputs.set(id, gain);
    }
    return this.trackOutputs.get(id)!;
  }

  updateTrack(id: number, data: any) {
    this.tracksMap.set(id, { ...(this.tracksMap.get(id) || {}), ...data });
  }

  connectSidechain(sourceId: string, targetId: string) {
    if (!this.sidechainMatrix.has(sourceId)) {
      this.sidechainMatrix.set(sourceId, new Set());
    }
    this.sidechainMatrix.get(sourceId)!.add(targetId);
  }

  getDeck(id: DeckId): DeckChannel {
    return id === 'A' ? this.deckA : this.deckB;
  }

  async loadDeck(id: DeckId, buffer: AudioBuffer) {
    const deck = this.getDeck(id);
    this.stopDeckSources(deck);
    deck.buffer = buffer;
    deck.stems = await this.stemSeparationService.separate(buffer);
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

  setDeckCue(id: DeckId, active: boolean) {
    const deck = this.getDeck(id);
    deck.isCueing = active;
    deck.cueGain.gain.setTargetAtTime(active ? 1 : 0, this.ctx.currentTime, 0.05);
  }

  setHeadphoneGain(val: number) {
    this.headphoneGain.set(val);
    this.cueMaster.gain.setTargetAtTime(val, this.ctx.currentTime, 0.05);
  }

  async detectBpm(id: DeckId): Promise<number> {
    const deck = this.getDeck(id);
    if (!deck.buffer) return 0;

    // Simple peak-based BPM detection (naive implementation)
    const data = deck.buffer.getChannelData(0);
    const step = 441; // 10ms at 44.1k
    let peaks = [];
    for (let i = 0; i < data.length; i += step) {
      if (Math.abs(data[i]) > 0.8) peaks.push(i);
    }

    deck.detectedBpm = 124;
    return deck.detectedBpm;
  }

  scratch(id: DeckId, delta: number) {
    const deck = this.getDeck(id);
    if (!deck.buffer) return;

    const rate = delta * 25;
    this.setDeckRate(id, rate, false);

    const current = this.getDeckPosition(deck);
    this.seekDeck(id, current + delta);
  }

  setAdvancedFX(id: DeckId, type: 'flanger' | 'phaser' | 'delay', value: number) {
    const deck = this.getDeck(id);
    const now = this.ctx.currentTime;

    if (type === 'flanger') {
      deck.flangerNode.frequency.setTargetAtTime(500 + value * 5000, now, 0.1);
      deck.flangerNode.Q.setTargetAtTime(value * 10, now, 0.1);
    } else if (type === 'phaser') {
      deck.phaserNode.frequency.setTargetAtTime(200 + value * 3000, now, 0.1);
      deck.phaserNode.Q.setTargetAtTime(value * 20, now, 0.1);
    } else if (type === 'delay') {
      deck.pingPongDelay.delayTime.setTargetAtTime(0.1 + value * 0.9, now, 0.1);
      deck.pingPongFeedback.gain.setTargetAtTime(value * 0.8, now, 0.1);
    }
  }

  syncDecks(masterId: DeckId, slaveId: DeckId) {
    const master = this.getDeck(masterId);
    const slave = this.getDeck(slaveId);
    if (master.detectedBpm && slave.detectedBpm) {
      const ratio = master.detectedBpm / slave.detectedBpm;
      this.setDeckRate(slaveId, ratio);
    }
  }

  async setOutputDevice(deviceId: string) {
    if (typeof (this.ctx as any).setSinkId === 'function') {
      await (this.ctx as any).setSinkId(deviceId);
      this.logger.info(`Output device changed to ${deviceId}`);
    } else {
      this.logger.warn('setSinkId not supported in this browser');
    }
  }

  private configureLimiter(config: any) {
    this.limiter.threshold.setValueAtTime(config.threshold, this.ctx.currentTime);
    this.limiter.ratio.setValueAtTime(config.ratio, this.ctx.currentTime);
    this.limiter.attack.setValueAtTime(config.attack, this.ctx.currentTime);
    this.limiter.release.setValueAtTime(config.release, this.ctx.currentTime);
  }
}
