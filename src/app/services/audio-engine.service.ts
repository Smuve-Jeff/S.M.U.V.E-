import { AudioRecorderService } from '../studio/audio-recorder.service';
import { LoggingService } from './logging.service';
import { Injectable, signal, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { StemSeparationService } from './stem-separation.service';

export type DeckId = 'A' | 'B';
export type Stems = {
  vocals: AudioBuffer;
  drums: AudioBuffer;
  bass: AudioBuffer;
  melody: AudioBuffer;
};

interface DeckChannel {
  id: DeckId;
  buffer: AudioBuffer | null;
  sources: { [K in keyof Stems]: AudioBufferSourceNode | null };
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
  private reverbConvolver: ConvolverNode;
  public reverbWet: GainNode;
  private delayNode: DelayNode;
  public delayWet: GainNode;
  private recordingDestination: MediaStreamAudioDestinationNode | null = null;
  public masterAnalyser: AnalyserNode;
  public getMasterAnalyser() {
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

  constructor() {
    this.ctx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    this.masterGain = this.ctx.createGain();
    this.compressor = this.ctx.createDynamicsCompressor();
    this.saturationNode = this.ctx.createWaveShaper();
    this.limiter = this.ctx.createDynamicsCompressor();
    this.reverbConvolver = this.ctx.createConvolver();
    this.reverbWet = this.ctx.createGain();
    this.delayNode = this.ctx.createDelay(2.0);
    this.delayWet = this.ctx.createGain();
    this.masterAnalyser = this.ctx.createAnalyser();

    // Signal chain: ... -> masterGain -> compressor -> saturation -> limiter -> masterAnalyser -> destination
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.saturationNode);
    this.saturationNode.connect(this.limiter);
    this.limiter.connect(this.masterAnalyser);
    // Output Bus logic moved to setOutputMode behavior if needed
    this.masterAnalyser.connect(this.ctx.destination);

    // FX Chain
    this.reverbConvolver.connect(this.reverbWet);
    this.reverbWet.connect(this.masterGain);

    this.delayNode.connect(this.delayWet);
    this.delayWet.connect(this.masterGain);

    // Default FX setup
    this.compressor.threshold.value = -24;
    this.compressor.ratio.value = 4;
    this.limiter.threshold.value = -0.5;
    this.limiter.ratio.value = 20;

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
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
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
      sources: { vocals: null, drums: null, bass: null, melody: null },
      gains: {
        vocals: this.ctx.createGain(),
        drums: this.ctx.createGain(),
        bass: this.ctx.createGain(),
        melody: this.ctx.createGain(),
      },
      eqLow: this.ctx.createBiquadFilter(),
      eqMid: this.ctx.createBiquadFilter(),
      eqHigh: this.ctx.createBiquadFilter(),
      filter: this.ctx.createBiquadFilter(),
      pan: this.ctx.createStereoPanner(),
      gain: this.ctx.createGain(),
      analyser: this.ctx.createAnalyser(),
      isPlaying: false,
      startTime: 0,
      pauseOffset: 0,
      rate: 1.0,
      stems: null,
      loopEnabled: false,
      slipEnabled: false,
      slipActive: false,
      slipStartTime: 0,
      slipStartOffset: 0,
      hotCues: new Array(8).fill(null),
      sendA: this.ctx.createGain(),
      sendB: this.ctx.createGain(),
    };
    deck.sendA.gain.value = 0;
    deck.sendB.gain.value = 0;

    deck.eqLow.type = 'lowshelf';
    deck.eqLow.frequency.value = 250;
    deck.eqMid.type = 'peaking';
    deck.eqMid.frequency.value = 1000;
    deck.eqMid.Q.value = 1;
    deck.eqHigh.type = 'highshelf';
    deck.eqHigh.frequency.value = 4000;
    deck.filter.type = 'lowpass';
    deck.filter.frequency.value = 20000;

    deck.analyser.fftSize = 1024;

    // Routing: Stems -> EQ -> Filter -> Pan -> Gain -> Analyser -> Master
    Object.values(deck.gains).forEach((g) => g.connect(deck.eqLow));
    deck.eqLow.connect(deck.eqMid);
    deck.eqMid.connect(deck.eqHigh);
    deck.eqHigh.connect(deck.filter);
    deck.filter.connect(deck.pan);
    deck.pan.connect(deck.gain);

    // Sends
    deck.sendA.connect(this.reverbConvolver);
    deck.sendB.connect(this.delayNode);

    deck.gain.connect(deck.sendA);
    deck.gain.connect(deck.sendB);
    deck.gain.connect(deck.analyser);
    deck.analyser.connect(this.masterGain);

    if (id === 'A') this.deckA = deck;
    else this.deckB = deck;
  }

  async loadDeck(id: DeckId, buffer: AudioBuffer) {
    const deck = this.getDeck(id);
    this.stopDeck(id);
    deck.buffer = buffer;
    deck.pauseOffset = 0;
    try {
      deck.stems = await firstValueFrom(
        this.stemSeparationService.separate(buffer)
      );
    } catch (e) {
      this.logger.warn('Stem separation failed for deck', id, e);
    }
  }

  public getDeck(id: DeckId) {
    return id === 'A' ? this.deckA : this.deckB;
  }

  playDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (deck.isPlaying) return;
    if (deck.slipActive) {
      const elapsedSlip = this.ctx.currentTime - deck.slipStartTime;
      const newPos = Math.max(
        0,
        Math.min(
          deck.buffer?.duration || 0,
          deck.slipStartOffset + elapsedSlip * deck.rate
        )
      );
      deck.pauseOffset = newPos;
      deck.slipActive = false;
    }
    this.startDeckSource(deck, deck.pauseOffset);
    deck.isPlaying = true;
  }

  pauseDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck.isPlaying) return;
    const elapsed = this.ctx.currentTime - deck.startTime;
    deck.pauseOffset += elapsed * deck.rate;
    if (deck.slipEnabled) {
      deck.slipActive = true;
      deck.slipStartTime = this.ctx.currentTime;
      deck.slipStartOffset = deck.pauseOffset;
    }
    this.stopDeckSource(deck);
    deck.isPlaying = false;
  }

  stopDeck(id: DeckId) {
    const deck = this.getDeck(id);
    this.stopDeckSource(deck);
    deck.pauseOffset = 0;
  }

  private startDeckSource(deck: DeckChannel, offset: number) {
    const dur = deck.buffer?.duration || 0;
    if (offset >= dur && !deck.loopEnabled) return;
    deck.startTime = this.ctx.currentTime;
    deck.isPlaying = true;

    if (deck.stems) {
      ['vocals', 'drums', 'bass', 'melody'].forEach((k: any) => {
        const src = this.ctx.createBufferSource();
        src.buffer = (deck.stems as any)[k];
        src.playbackRate.value = deck.rate;
        src.loop = deck.loopEnabled;
        src.connect(deck.gains[k as keyof Stems]);
        src.start(0, offset % dur);
        (deck.sources as any)[k] = src;
      });
    } else if (deck.buffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = deck.buffer;
      src.playbackRate.value = deck.rate;
      src.loop = deck.loopEnabled;
      src.connect(deck.gains.vocals);
      src.start(0, offset % dur);
      deck.sources.vocals = src;
    }
  }

  private stopDeckSource(deck: DeckChannel) {
    ['vocals', 'drums', 'bass', 'melody'].forEach((k: any) => {
      if ((deck.sources as any)[k]) {
        try {
          (deck.sources as any)[k]!.stop();
        } catch (_e) {
          /* ignore */
        }
        (deck.sources as any)[k] = null;
      }
    });
    deck.isPlaying = false;
  }

  setDeckRate(id: DeckId, rate: number, smooth = true) {
    const deck = this.getDeck(id);
    deck.rate = rate;
    const rampTime = smooth ? 0.05 : 0.005;
    Object.values(deck.sources).forEach((s) => {
      if (s) {
        s.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, rampTime);
      }
    });
  }

  brakeDeck(id: DeckId) {
    const deck = this.getDeck(id);
    const now = this.ctx.currentTime;
    const duration = 0.8;
    Object.values(deck.sources).forEach((s) => {
      if (s) {
        s.playbackRate.cancelScheduledValues(now);
        s.playbackRate.setValueAtTime(deck.rate, now);
        s.playbackRate.linearRampToValueAtTime(0, now + duration);
      }
    });
    setTimeout(() => {
      this.pauseDeck(id);
      this.setDeckRate(id, 1.0, true);
    }, duration * 1000);
  }

  spinbackDeck(id: DeckId) {
    const deck = this.getDeck(id);
    const originalRate = deck.rate;
    this.setDeckRate(id, -4.0, false);
    setTimeout(() => {
      this.setDeckRate(id, originalRate);
    }, 600);
  }

  transformDeck(id: DeckId) {
    const deck = this.getDeck(id);
    const now = this.ctx.currentTime;
    const g = deck.gain.gain;
    const val = g.value || 1.0;
    g.cancelScheduledValues(now);
    for (let i = 0; i < 8; i++) {
      g.setValueAtTime(i % 2 === 0 ? 0 : val, now + i * 0.1);
    }
    g.setValueAtTime(val, now + 0.85);
  }
  setDeckSend(id: DeckId, send: 'A' | 'B', gain: number) {
    const deck = this.getDeck(id);
    const node = send === 'A' ? deck.sendA : deck.sendB;
    node.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.01);
  }

  setDeckGain(id: DeckId, gain: number) {
    this.getDeck(id).gain.gain.setTargetAtTime(
      gain,
      this.ctx.currentTime,
      0.01
    );
  }

  setDeckStemGain(id: DeckId, stem: keyof Stems, gain: number) {
    this.getDeck(id).gains[stem].gain.setTargetAtTime(
      gain,
      this.ctx.currentTime,
      0.01
    );
  }

  setDeckEq(id: DeckId, high: number, mid: number, low: number) {
    const deck = this.getDeck(id);
    deck.eqHigh.gain.setTargetAtTime(high, this.ctx.currentTime, 0.01);
    deck.eqMid.gain.setTargetAtTime(mid, this.ctx.currentTime, 0.01);
    deck.eqLow.gain.setTargetAtTime(low, this.ctx.currentTime, 0.01);
  }

  setDeckFilter(id: DeckId, freq: number, type: any = 'lowpass') {
    const deck = this.getDeck(id);
    deck.filter.type = type;
    deck.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.02);
  }

  setCrossfader(
    value: number,
    curve: 'linear' | 'power' | 'exp' | 'cut' = 'linear',
    hamster = false
  ) {
    this.crossfaderValue = Math.max(-1, Math.min(1, value));
    this.crossfaderCurve = curve;
    this.crossfaderHamster = hamster;
    this.applyCrossfader();
  }

  private applyCrossfader() {
    let a = 0,
      b = 0;
    const val = this.crossfaderHamster
      ? -this.crossfaderValue
      : this.crossfaderValue;
    switch (this.crossfaderCurve) {
      case 'linear':
        a = 0.5 * (1 - val);
        b = 0.5 * (1 + val);
        break;
      case 'power':
        a = Math.cos(0.25 * Math.PI * (val + 1));
        b = Math.sin(0.25 * Math.PI * (val + 1));
        break;
      case 'cut':
        a = val > -0.9 ? 1 : 0;
        b = val < 0.9 ? 1 : 0;
        break;
      default:
        a = 0.5 * (1 - val);
        b = 0.5 * (1 + val);
    }
    this.deckA.gain.gain.setTargetAtTime(a, this.ctx.currentTime, 0.01);
    this.deckB.gain.gain.setTargetAtTime(b, this.ctx.currentTime, 0.01);
  }

  getDeckProgress(id: DeckId) {
    const deck = this.getDeck(id);
    const dur = deck.buffer?.duration || 0;
    if (!deck.buffer)
      return { position: 0, duration: 0, isPlaying: false, slipPosition: 0 };

    let pos = deck.pauseOffset;
    let slipPos = deck.slipStartOffset;

    if (deck.isPlaying) {
      const elapsed = this.ctx.currentTime - deck.startTime;
      pos = Math.max(0, Math.min(dur, deck.pauseOffset + elapsed * deck.rate));
    }

    if (deck.slipActive) {
      const elapsedSlip = this.ctx.currentTime - deck.slipStartTime;
      slipPos = Math.max(
        0,
        Math.min(dur, deck.slipStartOffset + elapsedSlip * deck.rate)
      );
    } else {
      slipPos = pos;
    }

    return {
      position: pos,
      duration: dur,
      isPlaying: deck.isPlaying,
      slipPosition: slipPos,
    };
  }
  private async loadDefaultImpulse() {
    const rate = this.ctx.sampleRate;
    const len = rate * 1.2;
    const impulse = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const ch = impulse.getChannelData(c);
      for (let i = 0; i < len; i++) {
        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      }
    }
    this.reverbConvolver.buffer = impulse;
  }

  async startRecording() {
    this.resume();
    if (this.isPlaying()) return;

    this.isRecording.set(true);

    try {
      await this.recorder.startRecording(this.getMasterStream().stream);
      this.start();
    } catch (error) {
      this.isRecording.set(false);
      throw error;
    }
  }

  async toggleRecording() {
    if (this.isRecording()) {
      this.recorder.stopRecording();
      this.isRecording.set(false);
      this.stop();
      return;
    }

    await this.startRecording();
  }
  start() {
    this.resume();
    if (this.isPlaying()) return;
    this.isPlaying.set(true);
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.timerId = setInterval(
      () => this.scheduleTick(),
      this.lookahead * 1000
    );
  }

  stop() {
    if (!this.isPlaying()) return;
    this.isPlaying.set(false);
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private scheduleTick() {
    const spb = 60 / this.tempo();
    const stepDur = spb / this.stepsPerBeat();
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      const stepIndex = this.currentBeat();

      // Play metronome click on each beat (every stepsPerBeat steps)
      if (stepIndex % this.stepsPerBeat() === 0) {
        const beatInBar = Math.floor(stepIndex / this.stepsPerBeat()) % 4;
        this.playMetronomeClick(this.nextNoteTime, beatInBar === 0);
      }

      this.onScheduleStep?.(stepIndex, this.nextNoteTime, stepDur);
      const next = (stepIndex + 1) % this.loopEnd();
      this.currentBeat.set(next);
      this.nextNoteTime += stepDur;
    }
  }

  onScheduleStep?: (stepIndex: number, when: number, stepDur: number) => void;

  playSynth(
    when: number,
    freq: number,
    duration: number,
    velocity = 1,
    pan = 0,
    outGain = 0.6,
    _sendA = 0.1,
    _sendB = 0.05,
    params?: any,
    velocityScale = 1
  ) {
    this.resume();
    if (this.isRecording()) {
      this.recorder.pendingMidi.push({
        pitch: 69 + 12 * Math.log2(freq / 440),
        startTime: when,
        duration,
        velocity,
      });
    }
    const osc = this.ctx.createOscillator();
    osc.type = params?.type || 'sawtooth';
    const vca = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.frequency.value = params?.cutoff ?? 8000;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    const a = params?.attack ?? 0.005;
    const d = params?.decay ?? 0.08;
    const s = params?.sustain ?? 0.7;
    const r = params?.release ?? 0.15;
    vca.gain.setValueAtTime(0, when);
    const scaledVelocity = Math.max(
      0.1,
      Math.min(1.8, velocity * velocityScale)
    );
    vca.gain.linearRampToValueAtTime(scaledVelocity * outGain, when + a);
    vca.gain.linearRampToValueAtTime(
      scaledVelocity * outGain * s,
      when + a + d
    );
    vca.gain.setTargetAtTime(0, when + duration, r);
    osc.frequency.value = freq;
    osc.connect(filter).connect(vca).connect(p).connect(this.masterGain);
    osc.start(when);
    osc.stop(when + duration + 2.0);
  }

  playBuffer(
    when: number,
    buffer: AudioBuffer,
    duration: number,
    velocity = 1,
    pan = 0,
    gain = 0.8
  ) {
    this.resume();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const vca = this.ctx.createGain();
    const safeVelocity = Math.max(0.05, Math.min(1.8, velocity));
    const safeGain = Math.max(0.05, Math.min(1.5, gain));
    const attack = 0.002;
    const releaseTail = 0.012;
    const stopAt = Math.max(when + attack + releaseTail, when + duration);
    vca.gain.setValueAtTime(0, when);
    vca.gain.linearRampToValueAtTime(safeVelocity * safeGain, when + attack);
    vca.gain.setTargetAtTime(
      0,
      Math.max(when + duration - releaseTail, when + attack),
      releaseTail
    );
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(vca).connect(p).connect(this.masterGain);
    src.start(when);
    src.stop(stopAt);
  }

  setMasterOutputLevel(normalized: number) {
    this.masterGain.gain.setTargetAtTime(
      normalized,
      this.ctx.currentTime,
      0.01
    );
  }

  /**
   * Plays a metronome click at the specified time
   * @param when - AudioContext time to play the click
   * @param isDownbeat - True for downbeat (beat 1), false for other beats
   */
  playMetronomeClick(when: number, isDownbeat: boolean = false) {
    if (!this.metronomeEnabled()) return;
    this.resume();

    const osc = this.ctx.createOscillator();
    const vca = this.ctx.createGain();

    // Higher pitch for downbeat, lower for regular beats
    const frequency = isDownbeat ? 1200 : 800;
    const duration = 0.03;
    const volume = this.metronomeVolume();

    osc.type = 'sine';
    osc.frequency.value = frequency;

    // Sharp attack and quick decay for click sound
    vca.gain.setValueAtTime(0, when);
    vca.gain.linearRampToValueAtTime(volume, when + 0.002);
    vca.gain.exponentialRampToValueAtTime(0.001, when + duration);

    osc.connect(vca).connect(this.masterGain);
    osc.start(when);
    osc.stop(when + duration + 0.01);
  }

  /**
   * Toggle metronome on/off
   */
  toggleMetronome(): boolean {
    const newState = !this.metronomeEnabled();
    this.metronomeEnabled.set(newState);
    return newState;
  }

  /**
   * Set metronome volume (0-1)
   */
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
    duration = 0.01
  ) {
    const trimmedTrackId = `${trackId}`.trim();
    const isNumericTrackId =
      AudioEngineService.INTEGER_TRACK_ID_PATTERN.test(trimmedTrackId);
    const numericTrackId = isNumericTrackId ? Number(trimmedTrackId) : NaN;
    const track = isNumericTrackId
      ? this.tracks.get(numericTrackId)
      : undefined;
    const now = this.ctx.currentTime;
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

  // Aliases for compatibility
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
    const wasPlaying = deck.isPlaying;
    this.stopDeckSource(deck);
    deck.pauseOffset = seconds;
    if (wasPlaying) this.startDeckSource(deck, seconds);
  }
  getMasterStream(): MediaStreamAudioDestinationNode {
    if (!this.recordingDestination) {
      this.recordingDestination = this.ctx.createMediaStreamDestination();
      this.limiter.connect(this.recordingDestination);
    }
    return this.recordingDestination;
  }
}
