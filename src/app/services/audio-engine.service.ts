import { LoggingService } from './logging.service';
import { Injectable, signal, inject, Injector } from '@angular/core';
import { StudioRecordingEngineService } from '../studio/studio-recording-engine.service';
import { StemSeparationService, Stems } from './stem-separation.service';
import { SubtractiveSynth } from "../studio/subtractive-synth";

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
  public masterAnalyser!: AnalyserNode;
  public compressor!: DynamicsCompressorNode;
  public limiter!: DynamicsCompressorNode;
  private masterEQ!: BiquadFilterNode;
  public saturationNode!: WaveShaperNode;
  public reverbWet!: GainNode;
  private reverbConvolver!: ConvolverNode;
  private delayNode!: DelayNode;

  private trackOutputs = new Map<number, GainNode>();
  private trackInstruments = new Map<number, any>();
  private trackFilters = new Map<number, BiquadFilterNode>();
  private trackEQLow = new Map<number, BiquadFilterNode>();
  private trackEQHi = new Map<number, BiquadFilterNode>();
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
    this.cueMaster.connect(this.ctx.destination);

    this.masterGain = this.ctx.createGain();
    this.masterAnalyser = this.ctx.createAnalyser();
    this.compressor = this.ctx.createDynamicsCompressor();
    this.limiter = this.ctx.createDynamicsCompressor();
    this.masterEQ = this.ctx.createBiquadFilter();
    this.saturationNode = this.ctx.createWaveShaper();
    this.reverbWet = this.ctx.createGain();
    this.reverbConvolver = this.ctx.createConvolver();
    this.delayNode = this.ctx.createDelay();

    this.masterGain.gain.value = 1.0;
    this.masterEQ.type = 'highshelf';
    this.masterEQ.frequency.value = 12000;
    this.masterEQ.gain.value = 0;
    this.reverbWet.gain.value = 0;
    this.delayNode.delayTime.value = 0.18;

    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.saturationNode);
    this.saturationNode.connect(this.masterEQ);
    this.masterEQ.connect(this.limiter);
    this.limiter.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);

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
      crossfadeGain: 1,
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
    deck.eqMid.type = 'peaking';
    deck.eqHigh.type = 'highshelf';
    deck.filter.type = 'lowpass';
    deck.filter.frequency.value = 20000;

    for (const stem of AudioEngineService.STEM_ORDER) {
      deck.gains[stem].connect(deck.eqLow);
    }
    deck.eqLow.connect(deck.eqMid);
    deck.eqMid.connect(deck.eqHigh);
    deck.eqHigh.connect(deck.filter);
    deck.filter.connect(deck.pan);
    deck.pan.connect(deck.gain);
    deck.gain.connect(this.masterGain);

    if (id === 'A') this.deckA = deck;
    else this.deckB = deck;
  }

  getContext() {
    return this.ctx;
  }

  resume() {
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  isPlayingStatus() {
    return this.isPlaying();
  }

  start() {
    this.resume();
    if (this.isPlaying()) return;
    this.isPlaying.set(true);
    this.nextNoteTime = this.ctx.currentTime;
    this.schedulerHandle = setInterval(
      () => this.scheduler(),
      AudioEngineService.DEFAULT_SCHEDULER_INTERVAL_MS
    );
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

      this.currentBeat.set(step / this.stepsPerBeat());
      setTimeout(() => {
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

  updateTrack(id: number, data: any) {
    this.tracksMap.set(id, { ...(this.tracksMap.get(id) || {}), ...data });
  }

  getTrackOutput(id: number): GainNode {
    if (!this.trackOutputs.has(id)) {
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      const eqLow = this.ctx.createBiquadFilter();
      const eqHi = this.ctx.createBiquadFilter();

      filter.type = 'lowpass';
      filter.frequency.value = 20000;

      eqLow.type = 'lowshelf';
      eqLow.frequency.value = 180;
      eqLow.gain.value = 0;

      eqHi.type = 'highshelf';
      eqHi.frequency.value = 8000;
      eqHi.gain.value = 0;

      gain.connect(eqLow);
      eqLow.connect(eqHi);
      eqHi.connect(filter);
      const saturator = this.ctx.createWaveShaper();
      saturator.curve = this.makeDistortionCurve(5);
      filter.connect(saturator);
      saturator.connect(this.masterGain);


      this.trackOutputs.set(id, gain);
      this.trackFilters.set(id, filter);
      this.trackEQLow.set(id, eqLow);
      this.trackEQHi.set(id, eqHi);
    }
    return this.trackOutputs.get(id)!;
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
    const progress = this.getDeckProgress(id);
    this.seekDeck(id, Math.max(0, progress.position - 1.5));
    this.setDeckRate(id, 1.75, false);
    setTimeout(() => this.setDeckRate(id, 1), 160);
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

  getDeck(id: DeckId): DeckChannel {
    return id === 'A' ? this.deckA : this.deckB;
  }

  seekDeck(id: DeckId, position: number) {
    const deck = this.getDeck(id);
    const wasPlaying = deck.isPlaying;
    if (wasPlaying) this.stopDeckSources(deck);
    deck.pauseOffset = position;
    deck.startTime = this.ctx.currentTime - position / Math.max(0.05, Math.abs(deck.rate));
    if (wasPlaying) this.startDeckSources(deck, position);
  }

  playDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (deck.isPlaying) return;
    this.resume();
    deck.isPlaying = true;
    deck.startTime = this.ctx.currentTime - deck.pauseOffset / Math.max(0.05, Math.abs(deck.rate));
    this.startDeckSources(deck, deck.pauseOffset);
    this.applyDeckOutputGain(deck);
  }

  pauseDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck.isPlaying) return;
    deck.isPlaying = false;
    deck.pauseOffset = this.getDeckPosition(deck);
    this.stopDeckSources(deck);
    this.applyDeckOutputGain(deck);
  }

  setDeckGain(id: DeckId, val: number) {
    const deck = this.getDeck(id);
    deck.channelGain = this.clamp(val, 0, 1.5);
    this.applyDeckOutputGain(deck);
  }

  brakeDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck.isPlaying) return;
    const now = this.ctx.currentTime;
    for (const stem of AudioEngineService.STEM_ORDER) {
      const source = deck.sources[stem];
      if (source) {
        source.playbackRate.exponentialRampToValueAtTime(0.01, now + 1.5);
      }
    }
    setTimeout(() => this.pauseDeck(id), 1550);
  }

  spinbackDeck(id: DeckId) {
    const deck = this.getDeck(id);
    this.setDeckRate(id, -2, false);
    setTimeout(() => this.setDeckRate(id, 1, false), 800);
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
    for (let i = 0; i < buckets; i++) {
      let sum = 0;
      for (let j = 0; j < segmentLength; j++) {
        sum += Math.abs(channel[i * segmentLength + j]);
      }
      waveform[i] = sum / segmentLength;
    }
    return waveform;
  }

  getDeckLevel(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck.isPlaying) return 0;
    return deck.channelGain * (0.8 + Math.random() * 0.2);
  }

  setDeckRate(id: DeckId, rate: number, preservePitch = true) {
    const deck = this.getDeck(id);
    deck.rate = rate;
    const now = this.ctx.currentTime;
    for (const stem of AudioEngineService.STEM_ORDER) {
      const source = deck.sources[stem];
      if (source) {
        source.playbackRate.setTargetAtTime(Math.abs(rate), now, 0.05);
      }
    }
  }

  setDeckLoop(id: DeckId, enabled: boolean) {
    const deck = this.getDeck(id);
    deck.loopEnabled = enabled;
    for (const stem of AudioEngineService.STEM_ORDER) {
      const source = deck.sources[stem];
      if (source) source.loop = enabled;
    }
  }

  setSlipMode(id: DeckId, enabled: boolean) {
    const deck = this.getDeck(id);
    deck.slipEnabled = enabled;
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
    deck.eqHigh.gain.setTargetAtTime(this.eqValueToDb(high), this.ctx.currentTime, 0.01);
    deck.eqMid.gain.setTargetAtTime(this.eqValueToDb(mid), this.ctx.currentTime, 0.01);
    deck.eqLow.gain.setTargetAtTime(this.eqValueToDb(low), this.ctx.currentTime, 0.01);
  }

  setDeckFilter(id: DeckId, freq: number) {
    const deck = this.getDeck(id);
    deck.filter.frequency.setTargetAtTime(this.clamp(freq, 20, 20000), this.ctx.currentTime, 0.01);
  }

  setDeckSend(id: DeckId, send: 'A' | 'B', gain: number) {
    const deck = this.getDeck(id);
    const target = send === 'A' ? deck.sendA : deck.sendB;
    target.gain.setTargetAtTime(this.clamp(gain, 0, 1), this.ctx.currentTime, 0.01);
  }

  triggerAttack(trackId: number, freq: number, time: number, velocity: number, duration: number, gain: number, pan: number, sendA: number, sendB: number, synthParams: any, someVal?: number, customCtx?: any) {
    let inst = this.trackInstruments.get(trackId);
    if (!inst) {
      inst = new SubtractiveSynth(this.ctx);
      inst.connect(this.getTrackOutput(trackId));
      this.trackInstruments.set(trackId, inst);
    }

    if (synthParams) {
      if (synthParams.type) inst.setOscillatorType(synthParams.type);
      if (synthParams.cutoff) inst.setFilterCutoff(synthParams.cutoff);
      if (synthParams.q) inst.setFilterResonance(synthParams.q);
    }

    const midi = Math.round(69 + 12 * Math.log2(freq / 440));
    inst.play(midi, velocity);

    if (duration > 0) {
      setTimeout(() => {
        inst.stop(midi);
      }, duration * 1000);
    }
  }

  setMasterOutputLevel(val: number) {
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.01);
    }
  }

  setSaturation(val: number) {
    // Saturation logic
  }

  getAnalyser() {
    return this.masterAnalyser;
  }

  setOutputMode(mode: 'speakers' | 'headphones') {
    this.outputMode.set(mode);
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
    } else if (parameter === 'filter') {
      const freq = Math.pow(10, value * 3) * 20;
      const filter = this.trackFilters.get(id);
      if (filter) filter.frequency.setTargetAtTime(freq, scheduledTime ?? this.ctx.currentTime, duration);
    } else if (parameter === 'eq-low') {
      const dbGain = (value - 1.0) * 24;
      const eq = this.trackEQLow.get(id);
      if (eq) eq.gain.setTargetAtTime(dbGain, scheduledTime ?? this.ctx.currentTime, duration);
    } else if (parameter === 'eq-hi') {
      const dbGain = (value - 1.0) * 24;
      const eq = this.trackEQHi.get(id);
      if (eq) eq.gain.setTargetAtTime(dbGain, scheduledTime ?? this.ctx.currentTime, duration);
    } else if (parameter === 'attack') {
      const inst = this.trackInstruments.get(id);
      if (inst) inst.setAttack(value);
    } else if (parameter === 'release') {
      const inst = this.trackInstruments.get(id);
      if (inst) inst.setRelease(value);
    } else if (parameter === 'detune') {
      const inst = this.trackInstruments.get(id);
      if (inst) inst.setDetune(value * 100);
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

  private eqValueToDb(value: number) {
    return (this.clamp(value, 0, 2) - 1) * 18;
  }

  private frequencyToMidi(freq: number) {
    return Math.round(69 + 12 * Math.log2(freq / 440));
  }

  private makeDistortionCurve(amount: number) {
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
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

  configureCompressor(config: any) {
    if (this.compressor) {
      this.compressor.threshold.setTargetAtTime(config.threshold || -24, this.ctx.currentTime, 0.01);
      this.compressor.ratio.setTargetAtTime(config.ratio || 4, this.ctx.currentTime, 0.01);
    }
  }

  toggleMetronome() {
    this.metronomeEnabled.update(v => !v);
    return this.metronomeEnabled();
  }

  private playMetronomeClick(time: number, isDownbeat: boolean) {
    if (!this.metronomeEnabled()) return;
    this.ctx.resume();
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.frequency.setValueAtTime(isDownbeat ? 600 : 1200, time);
    osc.frequency.value = isDownbeat ? 600 : 1200;
    env.gain.setValueAtTime(this.metronomeVolume(), time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.05);
  }

  playSynth(time: number, freq: number, velocity: number, duration: number, pan: number, params: any) {
    const osc = this.ctx.createOscillator();
    osc.type = params.type || 'sine';
    osc.frequency.setValueAtTime(freq, time);
    const panner = this.ctx.createStereoPanner();
    if (panner.pan) panner.pan.setValueAtTime(pan, time);
    const vca = this.ctx.createGain();
    vca.gain.setValueAtTime(0, time);
    vca.gain.setTargetAtTime(velocity * 1.5, time, params.attack || 0.01);
    const releaseTime = time + (duration === 2 ? 0.5 : duration) + (params.release || 0.1);
    if (vca.gain.exponentialRampToValueAtTime) {
      vca.gain.exponentialRampToValueAtTime(0.001, releaseTime);
    }
    osc.connect(panner);
    panner.connect(vca);
    vca.connect(this.masterGain);
    osc.start(time);
    osc.stop(releaseTime + 0.1);
    if (this.isRecording()) {
       if (this.recorder && this.recorder.pendingMidi) {
         this.recorder.pendingMidi.push({
           pitch: Math.round(69 + 12 * Math.log2(freq / 440)),
           startTime: time,
           duration: (duration === 2 ? 0.5 : duration),
           velocity: velocity * 4
         });
       }
    }
  }

  triggerSampler(trackId: number, buffer: AudioBuffer, time: number, velocity: number, pan: number, duration: number) {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const panner = this.ctx.createStereoPanner();
    if (panner.pan) panner.pan.value = pan;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.setTargetAtTime(velocity, time, 0.005);
    source.connect(panner);
    panner.connect(gain);
    gain.connect(this.getTrackOutput(trackId));
    source.start(time);
    if (duration > 0) source.stop(time + duration);
  }

  updateAdaptivePerformance(load: number) {
    if (load > 70) this.performanceTier.set('performance');
    else this.performanceTier.set('ultra');
  }

  ensureTrack(config: any) {
    return this.getTrackOutput(config.id);
  }

  getMasteringTargets() {
    return this.masteringTargets;
  }

  connectSidechain(sourceId: string, targetId: string) {
    if (!this.sidechainMatrix.has(sourceId)) this.sidechainMatrix.set(sourceId, new Set());
    this.sidechainMatrix.get(sourceId)!.add(targetId);
    this.sidechainEnabled.set(true);
  }

  getSidechainRouting() {
    return Array.from(this.sidechainMatrix.entries()).map(([trigger, targets]) => ({
      triggerTrackId: trigger,
      targetTrackIds: Array.from(targets)
    }));
  }

  disconnectSidechain(trigger: string, target: string) {
    const targets = this.sidechainMatrix.get(trigger);
    if (targets) {
      targets.delete(target);
      if (targets.size === 0) this.sidechainMatrix.delete(trigger);
    }
    if (this.sidechainMatrix.size === 0) this.sidechainEnabled.set(false);
  }

  setMasteringTargets(targets: any) {
    this.masteringTargets = { ...this.masteringTargets, ...targets };
    if (this.compressor) {
      this.compressor.threshold.setTargetAtTime(this.masteringTargets.truePeak || -0.2, this.ctx.currentTime, 0.01);
    }
  }

  private configureLimiter(config: any) {
    this.limiter.threshold.setValueAtTime(config.threshold, this.ctx.currentTime);
    this.limiter.ratio.setValueAtTime(config.ratio, this.ctx.currentTime);
    this.limiter.attack.setValueAtTime(config.attack, this.ctx.currentTime);
    this.limiter.release.setValueAtTime(config.release, this.ctx.currentTime);
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
}
