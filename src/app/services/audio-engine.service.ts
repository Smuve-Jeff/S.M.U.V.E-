import { AudioRecorderService } from '../studio/audio-recorder.service';
import { LoggingService } from './logging.service';
import { Injectable, signal, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
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
  private logger = inject(LoggingService);
  private stemSeparationService = inject(StemSeparationService);
  public recorder = inject(AudioRecorderService);
  public ctx: AudioContext;
  public masterGain: GainNode;
  public compressor: DynamicsCompressorNode;
  public saturationNode: WaveShaperNode;
  public limiter: DynamicsCompressorNode;
  public masterEQ: BiquadFilterNode;
  public masterShelf: BiquadFilterNode;
  public masterWidener: StereoPannerNode;
  private reverbConvolver: ConvolverNode;
  public reverbWet: GainNode;
  private delayNode: DelayNode;
  public delayWet: GainNode;
  private recordingDestination: MediaStreamAudioDestinationNode | null = null;
  public masterAnalyser: AnalyserNode;
  public getLufs(): number {
    const data = new Float32Array(this.masterAnalyser.frequencyBinCount);
    this.masterAnalyser.getFloatTimeDomainData(data);
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
      sumSquares += data[i] * data[i];
    }
    const rms = Math.sqrt(sumSquares / data.length);
    // Rough LUFS estimation (integrated over window)
    return 20 * Math.log10(rms + 1e-9);
  }

  getMasterAnalyser() {
    return this.masterAnalyser;
  }

  private deckA!: DeckChannel;
  private deckB!: DeckChannel;

  public isPlaying = signal(false);
  public isRecording = signal(false);
  public countInEnabled = signal(false);
  public countInBars = signal(1);
  public tempo = signal(124);
  public currentBeat = signal(0);
  public stepsPerBeat = signal(4);
  public loopEnd = signal(64);
  public loopStart = signal(0);
  public metronomeEnabled = signal(false);
  public metronomeVolume = signal(0.5);

  private timerId: any = null;
  private nextNoteTime = 0;
  private lookahead = 0.1;
  private scheduleAheadTime = 0.2;

  private crossfaderValue = 0;
  private crossfaderCurve: 'linear' | 'power' | 'exp' | 'cut' = 'linear';
  private crossfaderHamster = false;

  private tracks = new Map<number, any>();
  private busses = new Map<string, GainNode>();
  private sidechainMatrix = new Map<string, Set<string>>();
  private masteringTargets = {
    lufs: -14,
    truePeak: -0.1,
  };


  processAutomation(step: number, time: number) {
    this.tracks.forEach((track, id) => {
      if (track.automationLanes) {
        track.automationLanes.forEach((lane: any) => {
          if (!lane.enabled) return;
          const point = lane.points.find((p: any) => Math.floor(p.step) === step);
          if (point) {
            this.applyProductionParameter(id.toString(), lane.parameter, point.value, 0.05, time);
          }
        });
      }
    });
  }
  onScheduleStep?: (step: number, time: number, duration: number) => void;

  constructor() {
    this.ctx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    this.masterGain = this.ctx.createGain();
    this.compressor = this.ctx.createDynamicsCompressor();
    this.saturationNode = this.ctx.createWaveShaper();
    this.limiter = this.ctx.createDynamicsCompressor();
    this.masterEQ = this.ctx.createBiquadFilter();
    this.masterShelf = this.ctx.createBiquadFilter();
    this.masterWidener = this.ctx.createStereoPanner();
    this.reverbConvolver = this.ctx.createConvolver();
    this.reverbWet = this.ctx.createGain();
    this.delayNode = this.ctx.createDelay(2.0);
    this.delayWet = this.ctx.createGain();
    this.masterAnalyser = this.ctx.createAnalyser();

    this.masterGain.connect(this.compressor);
    // Professional signal flow upgrade: Saturation before compression often provides a warmer character
    // but we will keep it for now and focus on enhancing the individual components.
    this.compressor.connect(this.saturationNode);
    this.saturationNode.connect(this.masterEQ);
    this.masterEQ.connect(this.masterShelf);
    this.masterShelf.connect(this.limiter);
    this.limiter.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);

    this.reverbConvolver.connect(this.reverbWet);
    this.reverbWet.connect(this.masterGain);

    this.delayNode.connect(this.delayWet);
    this.delayWet.connect(this.masterGain);

    this.compressor.threshold.value = -24;
    this.compressor.ratio.value = 4;
    this.limiter.threshold.value = -0.5;
    this.limiter.ratio.value = 20;
    this.setSoftClip(0.5);

    this.setupSaturation(0);
    this.initDeck('A');
    this.initDeck('B');
    this.loadDefaultImpulse();
  }

  getContext() {
    return this.ctx;
  }
  get compressorNode() {
    return this.compressor;
  }
  get limiterNode() {
    return this.limiter;
  }
  getAnalyser() {
    return this.masterAnalyser;
  }

  setOutputMode(mode: 'speakers' | 'headphones') {
    this.outputMode.set(mode);
  }
  setPerformanceTier(tier: 'ultra' | 'performance') {
    this.performanceTier.set(tier);
    if (tier === 'performance') {
      this.lookahead = 0.16;
      this.scheduleAheadTime = 0.28;
      this.masterAnalyser.fftSize = 1024;
      return;
    }
    this.lookahead = 0.1;
    this.scheduleAheadTime = 0.2;
    this.masterAnalyser.fftSize = 2048;
  }

  updateAdaptivePerformance(cpuLoadPercent: number) {
    if (cpuLoadPercent > 75 && this.performanceTier() !== 'performance') {
      this.setPerformanceTier('performance');
      return;
    }
    if (cpuLoadPercent < 45 && this.performanceTier() !== 'ultra') {
      this.setPerformanceTier('ultra');
    }
  }
  resume() {
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  private setupSaturation(amount: number) {
    if (amount <= 0) {
      this.saturationNode.curve = null;
      this.saturationNode.oversample = 'none';
      return;
    }
    const k = amount * 100;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      const absX = Math.abs(x);
      if (absX < 0.33) {
        curve[i] = 2 * x;
      } else if (absX < 0.66) {
        curve[i] = (3 - (2 - 3 * x) ** 2) / 3 * (x > 0 ? 1 : -1);
      } else {
        curve[i] = x > 0 ? 1 : -1;
      }
      curve[i] *= amount;
    }
    this.saturationNode.curve = curve;
    this.saturationNode.oversample = '4x';
  }

  public setSaturation(amount: number) {
    this.setupSaturation(amount);
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

    deck.eqLow.type = 'lowshelf';
    deck.eqLow.frequency.value = 250;
    deck.eqMid.type = 'peaking';
    deck.eqMid.frequency.value = 1000;
    deck.eqHigh.type = 'highshelf';
    deck.eqHigh.frequency.value = 4000;

    deck.filter.type = 'lowpass';
    deck.filter.frequency.value = 20000;

    Object.values(deck.gains).forEach((g) => {
      g.connect(deck.eqLow);
    });

    deck.eqLow.connect(deck.eqMid);
    deck.eqMid.connect(deck.eqHigh);
    deck.eqHigh.connect(deck.filter);
    deck.filter.connect(deck.pan);
    deck.pan.connect(deck.gain);
    deck.gain.connect(deck.analyser);
    deck.gain.connect(this.masterGain);

    if (id === 'A') this.deckA = deck;
    else this.deckB = deck;
  }

  private loadDefaultImpulse() {}

  async loadDeck(id: DeckId, buffer: AudioBuffer) {
    const deck = this.getDeck(id);
    deck.buffer = buffer;
    deck.stems = await this.stemSeparationService.separate(buffer);
  }

  start() {
    if (this.timerId) return;
    this.resume();
    this.isPlaying.set(true);
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.timerId = setInterval(() => this.scheduler(), 25);

    if (this.isRecording()) {
      this.recorder.startRecording(this.getMasterStream().stream);
    }
  }

  stop() {
    this.isPlaying.set(false);
    this.isRecording.set(false);
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.recorder.isRecording()) {
      this.recorder.stopRecording();
    }
  }

  private scheduler() {
    const tempo = this.tempo();
    const stepDur = 60 / tempo / this.stepsPerBeat();

    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      const stepIndex =
        Math.floor(this.nextNoteTime / stepDur) % this.loopEnd();
      const beatInBar = Math.floor(stepIndex / this.stepsPerBeat()) % 4;

      if (stepIndex % this.stepsPerBeat() === 0) {
        this.playMetronomeClick(this.nextNoteTime, beatInBar === 0);
      }

      this.processAutomation(stepIndex, this.nextNoteTime);
      this.onScheduleStep?.(stepIndex, this.nextNoteTime, stepDur);
      this.currentBeat.set(stepIndex / this.stepsPerBeat());
      this.nextNoteTime += stepDur;
    }
  }

  getDeck(id: DeckId): DeckChannel {
    return id === 'A' ? this.deckA : this.deckB;
  }

  startDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (deck.isPlaying) return;
    this.startDeckSource(deck, deck.pauseOffset);
    deck.isPlaying = true;
  }

  playDeck(id: DeckId) {
    this.startDeck(id);
  }

  private startDeckSource(deck: DeckChannel, offset: number) {
    if (!deck.stems) return;
    deck.startTime = this.ctx.currentTime - offset / deck.rate;
    Object.entries(deck.stems).forEach(([key, buffer]) => {
      if (!buffer) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = deck.rate;
      src.loop = deck.loopEnabled;
      src.connect(deck.gains[key as keyof Stems]);
      src.start(0, offset);
      deck.sources[key as keyof Stems] = src;
    });
  }

  stopDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck.isPlaying) return;
    this.stopDeckSource(deck);
    deck.isPlaying = false;
    deck.pauseOffset = this.ctx.currentTime - deck.startTime;
  }

  pauseDeck(id: DeckId) {
    this.stopDeck(id);
  }

  private stopDeckSource(deck: DeckChannel) {
    Object.values(deck.sources).forEach((src) => {
      if (src) {
        src.stop();
        src.disconnect();
      }
    });
    deck.sources = {};
  }

  setDeckGain(id: DeckId, val: number) {
    this.getDeck(id).gain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.01);
  }

  setDeckStemGain(id: DeckId, stem: keyof Stems, val: number) {
    this.getDeck(id).gains[stem].gain.setTargetAtTime(
      val,
      this.ctx.currentTime,
      0.01
    );
  }

  setDeckRate(id: DeckId, rate: number, setBaseRate = true) {
    const deck = this.getDeck(id);
    const now = this.ctx.currentTime;
    if (setBaseRate) deck.rate = rate;
    Object.values(deck.sources).forEach((src) => {
      if (src) src.playbackRate.setTargetAtTime(rate, now, 0.05);
    });
  }

  setDeckFilter(id: DeckId, freq: number) {
    const deck = this.getDeck(id);
    if (freq < 1000) {
      deck.filter.type = 'lowpass';
      deck.filter.frequency.setTargetAtTime(
        Math.max(20, freq * 20),
        this.ctx.currentTime,
        0.01
      );
    } else if (freq > 1000) {
      deck.filter.type = 'highpass';
      deck.filter.frequency.setTargetAtTime(
        Math.max(20, (freq - 1000) * 20),
        this.ctx.currentTime,
        0.01
      );
    } else {
      deck.filter.frequency.setTargetAtTime(20000, this.ctx.currentTime, 0.01);
    }
  }

  setDeckEq(id: DeckId, high: number, mid: number, low: number) {
    const deck = this.getDeck(id);
    const now = this.ctx.currentTime;
    deck.eqHigh.gain.setTargetAtTime(high, now, 0.01);
    deck.eqMid.gain.setTargetAtTime(mid, now, 0.01);
    deck.eqLow.gain.setTargetAtTime(low, now, 0.01);
  }

  setDeckSend(id: DeckId, send: 'A' | 'B', gain: number) {
    const deck = this.getDeck(id);
    const target = send === 'A' ? deck.sendA : deck.sendB;
    target.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.01);
  }

  getDeckProgress(id: DeckId) {
    const deck = this.getDeck(id);
    const duration = deck.buffer?.duration || 0;
    if (!deck.buffer)
      return {
        position: 0,
        percent: 0,
        duration: 0,
        isPlaying: false,
        slipPosition: 0,
      };
    const pos = deck.isPlaying
      ? (this.ctx.currentTime - deck.startTime) * deck.rate
      : deck.pauseOffset;
    return {
      position: pos,
      percent: (pos / duration) * 100,
      duration,
      isPlaying: deck.isPlaying,
      slipPosition: deck.isPlaying ? pos : deck.pauseOffset,
    };
  }

  triggerPad(
    trackId: number,
    freq: number,
    when: number,
    velocity: number,
    pan: number = 0,
    sendA: number = 0,
    sendB: number = 0
  ) {
    this.resume();
    const osc = this.ctx.createOscillator();
    const vca = this.ctx.createGain();
    const panner = this.ctx.createStereoPanner();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, when);

    vca.gain.setValueAtTime(0, when);
    vca.gain.linearRampToValueAtTime(velocity, when + 0.01);
    vca.gain.exponentialRampToValueAtTime(0.001, when + 0.2);

    panner.pan.setValueAtTime(pan, when);

    osc.connect(vca).connect(panner).connect(this.masterGain);

    if (sendA > 0 && this.reverbConvolver) {
      const sA = this.ctx.createGain();
      sA.gain.value = sendA;
      vca.connect(sA).connect(this.reverbConvolver);
    }

    if (sendB > 0 && this.delayNode) {
      const sB = this.ctx.createGain();
      sB.gain.value = sendB;
      vca.connect(sB).connect(this.delayNode);
    }

    osc.start(when);
    osc.stop(when + 0.25);
  }

  triggerSampler(
    trackId: number,
    buffer: AudioBuffer,
    when: number,
    velocity: number,
    pan: number = 0,
    duration: number = 1
  ) {
    this.resume();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const vca = this.ctx.createGain();
    const stopAt = when + duration;

    vca.gain.setValueAtTime(0, when);
    vca.gain.linearRampToValueAtTime(velocity, when + 0.005);
    vca.gain.exponentialRampToValueAtTime(0.001, stopAt);

    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(vca).connect(p).connect(this.masterGain);
    src.start(when);
    src.stop(stopAt);
  }

  triggerAttack(
    trackId: number,
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
    const ctx = customCtx || this.ctx;
    this.resume();
    const osc = this.ctx.createOscillator();
    const vca = this.ctx.createGain();
    const panner = this.ctx.createStereoPanner();
    const filter = this.ctx.createBiquadFilter();

    osc.type = synthParams.type || "sine";
    osc.frequency.setValueAtTime(freq, when);
    if (synthParams.detune) osc.detune.setValueAtTime(synthParams.detune, when);

    filter.type = "lowpass";
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

    // Add Sub-Oscillator for extra fidelity/weight if requested or for specific types
    let subOsc: OscillatorNode | null = null;
    if (this.performanceTier() === 'ultra' && (osc.type === 'sawtooth' || osc.type === 'square')) {
      subOsc = this.ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(freq / 2, when);
      const subGain = this.ctx.createGain();
      subGain.gain.setValueAtTime(actualVel * gain * 0.3, when);
      subOsc.connect(subGain).connect(vca);
      subOsc.start(when);
      subOsc.stop(when + duration + release + 0.1);
    }

        const dest = customCtx ? (customCtx as any).destination : this.masterGain;
    osc.connect(filter).connect(vca).connect(panner).connect(dest);

    if (sendA > 0 && this.reverbConvolver) {
      const sA = this.ctx.createGain();
      sA.gain.value = sendA;
      vca.connect(sA).connect(this.reverbConvolver);
    }

    if (sendB > 0 && this.delayNode) {
      const sB = this.ctx.createGain();
      sB.gain.value = sendB;
      vca.connect(sB).connect(this.delayNode);
    }
    osc.start(when);
    osc.stop(when + duration + release + 0.1);
  }
  setMasterOutputLevel(normalized: number) {
    this.masterGain.gain.setTargetAtTime(
      normalized,
      this.ctx.currentTime,
      0.01
    );
  }

  playMetronomeClick(when: number, isDownbeat: boolean = false) {
    if (!this.metronomeEnabled()) return;
    this.resume();

    const osc = this.ctx.createOscillator();
    const vca = this.ctx.createGain();

    const frequency = isDownbeat ? 1200 : 800;
    const duration = 0.03;
    const volume = this.metronomeVolume();

    osc.type = 'sine';
    osc.frequency.value = frequency;

    vca.gain.setValueAtTime(0, when);
    vca.gain.linearRampToValueAtTime(volume, when + 0.002);
    vca.gain.exponentialRampToValueAtTime(0.001, when + duration);

    osc.connect(vca).connect(this.masterGain);
    osc.start(when);
    osc.stop(when + duration + 0.01);
  }

  toggleMetronome(): boolean {
    const newState = !this.metronomeEnabled();
    this.metronomeEnabled.set(newState);
    return newState;
  }

  setMetronomeVolume(volume: number) {
    this.metronomeVolume.set(Math.max(0, Math.min(1, volume)));
  }

  getBus(busId: string): GainNode {
    if (!this.busses.has(busId)) {
      const bus = this.ctx.createGain();
      bus.connect(this.masterGain);
      this.busses.set(busId, bus);
    }
    return this.busses.get(busId)!;
  }

  applyFx(source: AudioNode, fxSlots: any[]): AudioNode {
    let lastNode = source;
    fxSlots
      .filter((s) => s.enabled)
      .forEach((slot) => {
        const fx = this.createFxNode(slot.type, slot.params);
        if (fx) {
          lastNode.connect(fx);
          lastNode = fx;
        }
      });
    return lastNode;
  }

  private createFxNode(type: string, params: any): AudioNode | null {
    switch (type) {
      case 'filter':
        const f = this.ctx.createBiquadFilter();
        f.type = params.type || 'lowpass';
        f.frequency.value = params.frequency || 1000;
        return f;
      case 'delay':
        const d = this.ctx.createDelay();
        d.delayTime.value = params.delayTime || 0.3;
        return d;
      case 'compressor':
        const c = this.ctx.createDynamicsCompressor();
        c.threshold.value = params.threshold || -24;
        return c;
      default:
        return null;
    }
  }

  ensureTrack(track: any) {
    this.tracks.set(track.id, track);
  }
  updateTrack(id: number, patch: any) {
    const t = this.tracks.get(id);
    if (t) Object.assign(t, patch);
  }
  removeTrack(id: number) {
    this.tracks.delete(id);
  }

  configureCompressor(params: any) {
    const { threshold, ratio, attack, release } = params;
    if (threshold !== undefined)
      this.compressor.threshold.setTargetAtTime(
        threshold,
        this.ctx.currentTime,
        0.01
      );
    if (ratio !== undefined)
      this.compressor.ratio.setTargetAtTime(ratio, this.ctx.currentTime, 0.01);
    if (attack !== undefined)
      this.compressor.attack.setTargetAtTime(
        attack,
        this.ctx.currentTime,
        0.01
      );
    if (release !== undefined)
      this.compressor.release.setTargetAtTime(
        release,
        this.ctx.currentTime,
        0.01
      );
  }

  configureLimiter(params: any) {
    const { ceiling, release } = params;
    if (ceiling !== undefined)
      this.limiter.threshold.setTargetAtTime(
        ceiling,
        this.ctx.currentTime,
        0.01
      );
    if (release !== undefined)
      this.limiter.release.setTargetAtTime(release, this.ctx.currentTime, 0.01);
  }

  setMasteringTargets(params: { lufs?: number; truePeak?: number }) {
    if (typeof params.lufs === 'number')
      this.masteringTargets.lufs = params.lufs;
    if (typeof params.truePeak === 'number') {
      this.masteringTargets.truePeak = params.truePeak;
      this.configureLimiter({ ceiling: params.truePeak });
    }
  }

  getMasteringTargets() {
    return { ...this.masteringTargets };
  }

  setSidechainEnabled(enabled: boolean) {
    this.sidechainEnabled.set(enabled);
  }

  connectSidechain(triggerTrackId: string, targetTrackId: string) {
    const key = `${triggerTrackId}`;
    if (!this.sidechainMatrix.has(key)) {
      this.sidechainMatrix.set(key, new Set<string>());
    }
    this.sidechainMatrix.get(key)!.add(`${targetTrackId}`);
    this.sidechainEnabled.set(true);
  }

  disconnectSidechain(triggerTrackId: string, targetTrackId: string) {
    const key = `${triggerTrackId}`;
    const set = this.sidechainMatrix.get(key);
    if (!set) return;
    set.delete(`${targetTrackId}`);
    if (set.size === 0) this.sidechainMatrix.delete(key);
  }

  getSidechainRouting() {
    return Array.from(this.sidechainMatrix.entries()).map(
      ([trigger, targets]) => ({
        triggerTrackId: trigger,
        targetTrackIds: Array.from(targets),
      })
    );
  }

  applyProductionParameter(
    trackId: string,
    parameter: string,
    value: number,
    duration = 0.01,
    scheduledTime?: number
  ) {
    const now = scheduledTime || this.ctx.currentTime;
    const trimmedTrackId = `${trackId}`.trim();
    const isNumericTrackId =
      AudioEngineService.INTEGER_TRACK_ID_PATTERN.test(trimmedTrackId);
    const numericTrackId = isNumericTrackId ? Number(trimmedTrackId) : NaN;
    const track = isNumericTrackId
      ? this.tracks.get(numericTrackId)
      : undefined;
    const tau = Math.max(0.001, duration);

    if (parameter === 'masterGain') {
      this.masterGain.gain.setTargetAtTime(value, now, tau);
      return;
    }
    if (parameter === 'compressor.threshold') {
      this.compressor.threshold.setTargetAtTime(value, now, tau);
      return;
    }
    if (parameter === 'limiter.ceiling') {
      this.limiter.threshold.setTargetAtTime(value, now, tau);
      return;
    }
    if (parameter === 'tempo') {
      this.tempo.set(Math.max(30, Math.min(300, value)));
      return;
    }
    if (parameter === 'qualityMode') {
      const normalized = value >= 0.5 ? 'ultra' : 'performance';
      if (isNumericTrackId && !Number.isNaN(numericTrackId)) {
        this.updateTrack(numericTrackId, { qualityMode: normalized });
      }
      return;
    }

    if (!track) return;

    const patch: any = {};
    if (parameter === 'gain' || parameter === 'volume') {
      patch.gain = Math.max(0, Math.min(1.5, value));
    } else if (parameter === 'pan') {
      patch.pan = Math.max(-1, Math.min(1, value));
    } else if (parameter === 'sendA') {
      patch.sendA = Math.max(0, Math.min(1, value));
    } else if (parameter === 'sendB') {
      patch.sendB = Math.max(0, Math.min(1, value));
    } else if (parameter === 'filter.cutoff') {
      patch.cutoff = Math.max(20, Math.min(22000, value));
    } else if (parameter === 'velocity') {
      patch.velocityScale = Math.max(0, Math.min(2, value));
    } else {
      patch[parameter] = value;
    }
    const resolvedId = typeof track.id === 'number' ? track.id : numericTrackId;
    if (!Number.isNaN(resolvedId)) {
      this.updateTrack(resolvedId, patch);
    }
  }

  setCrossfader(val: number, curve?: string, hamster?: boolean) {
    this.crossfaderValue = val;
    this.crossfaderHamster = !!hamster;
    let actualVal = val;
    if (this.crossfaderHamster) actualVal = 1 - val;

    const left = Math.cos(actualVal * 0.5 * Math.PI);
    const right = Math.sin(actualVal * 0.5 * Math.PI);
    this.deckA.gain.gain.setTargetAtTime(left, this.ctx.currentTime, 0.01);
    this.deckB.gain.gain.setTargetAtTime(right, this.ctx.currentTime, 0.01);
  }

  brakeDeck(id: DeckId) {
    this.setDeckRate(id, 0.001, false);
    setTimeout(() => this.stopDeck(id), 500);
  }

  spinbackDeck(id: DeckId) {
    this.setDeckRate(id, -2, false);
    setTimeout(() => this.stopDeck(id), 500);
  }

  transformDeck(id: DeckId) {
    const deck = this.getDeck(id);
    const now = this.ctx.currentTime;
    for (let i = 0; i < 8; i++) {
      deck.gain.gain.setValueAtTime(0, now + i * 0.1);
      deck.gain.gain.setValueAtTime(1, now + i * 0.1 + 0.05);
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
      time || this.ctx.currentTime,
      velocity,
      duration,
      1,
      pan,
      0,
      0,
      synthParams
    );
    if (this.isRecording()) {
      const midi = Math.round(12 * Math.log2(freq / 440) + 69);
      this.recorder.pendingMidi.push({
        pitch: midi,
        startTime: time,
        duration: duration,
        velocity: velocity,
      });
    }
  }

  setStemGain(id: DeckId, stem: keyof Stems, gain: number) {
    this.setDeckStemGain(id, stem, gain);
  }
  loadDeckBuffer(id: DeckId, buffer: AudioBuffer) {
    this.loadDeck(id, buffer);
  }
  setDeckFilterFreq(id: DeckId, freq: number) {
    this.setDeckFilter(id, freq);
  }
  getDeckLevel(id: DeckId): number {
    const deck = this.getDeck(id);
    const data = new Uint8Array(deck.analyser.frequencyBinCount);
    deck.analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return sum / data.length / 255;
  }
  setSlipMode(id: DeckId, enabled: boolean) {
    const deck = this.getDeck(id);
    deck.slipEnabled = enabled;
    if (!enabled) deck.slipActive = false;
  }

  getSlipActive(id: DeckId): boolean {
    return this.getDeck(id).slipActive;
  }

  getDeckWaveformData(id: DeckId): Float32Array {
    const deck = this.getDeck(id);
    return deck.buffer ? deck.buffer.getChannelData(0) : new Float32Array(0);
  }
  setHotCue(id: DeckId, slot: number) {
    const pos = this.getDeckProgress(id).position;
    this.getDeck(id).hotCues[slot] = pos;
  }
  clearHotCue(id: DeckId, slot: number) {
    this.getDeck(id).hotCues[slot] = null;
  }
  jumpToHotCue(id: DeckId, slot: number) {
    const pos = this.getDeck(id).hotCues[slot];
    if (pos !== null) this.seekDeck(id, pos);
  }
  setDeckLoop(id: DeckId, enabled: boolean) {
    const deck = this.getDeck(id);
    deck.loopEnabled = enabled;
    if (deck.isPlaying) {
      Object.values(deck.sources).forEach((src) => {
        if (src) src.loop = enabled;
      });
    }
  }

  seekDeck(id: DeckId, seconds: number) {
    const deck = this.getDeck(id);
    const dur = deck.buffer?.duration || 0;
    const clamped = Math.max(0, Math.min(seconds, dur));
    const wasPlaying = deck.isPlaying;
    this.stopDeckSource(deck);
    deck.pauseOffset = clamped;
    if (wasPlaying) this.startDeckSource(deck, clamped);
  }
  getMasterStream(): MediaStreamAudioDestinationNode {
    if (!this.recordingDestination) {
      this.recordingDestination = this.ctx.createMediaStreamDestination();
      this.limiter.connect(this.recordingDestination);
    }
    return this.recordingDestination;
  }

  setSoftClip(amount: number) {
    const k = amount * 100;
    const n = 256;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    this.saturationNode.curve = curve;
  }

  bitcrushDeck(id: DeckId, bits: number = 8) {
    const deck = this.getDeck(id);
    const filter = deck.filter;
    filter.type = 'lowpass';
    filter.Q.value = 15;
    filter.frequency.setValueAtTime(400, this.ctx.currentTime);
    setTimeout(() => {
      filter.Q.value = 1;
      filter.frequency.setValueAtTime(15000, this.ctx.currentTime);
    }, 500);
  }
}
