import { Injectable, signal, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { StemSeparationService, Stems } from './stem-separation.service';

export type NoteEvent = {
  time: number;
  duration: number;
  midi: number;
  velocity: number;
  channel?: number;
};

export type InstrumentType = 'sample' | 'synth';

export interface InstrumentDefinition {
  id: string;
  name: string;
  type: InstrumentType;
  sampleMapUrl?: string;
  params?: Record<string, number | string>;
}

export interface TrackState {
  id: number;
  name: string;
  instrumentId: string;
  gain: number;
  pan: number;
  sendA: number;
  sendB: number;
}

export type DeckId = 'A' | 'B';

interface DeckChannel {
  analyser: AnalyserNode;
  buffer?: AudioBuffer;
  stems?: Stems;
  sources: {
    vocals: AudioBufferSourceNode | null;
    drums: AudioBufferSourceNode | null;
    bass: AudioBufferSourceNode | null;
    melody: AudioBufferSourceNode | null;
  };
  gains: {
    vocals: GainNode;
    drums: GainNode;
    bass: GainNode;
    melody: GainNode;
  };
  pre: GainNode;
  gain: GainNode;
  pan: StereoPannerNode;
  filter: BiquadFilterNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  sendA: GainNode;
  sendB: GainNode;
  startTime: number;
  pauseOffset: number;
  rate: number;
  isPlaying: boolean;
  loopEnabled: boolean;
  loopStartSec: number;
  loopEndSec: number;
  hotCues: (number | null)[];
  keyLock: boolean;
}

@Injectable({ providedIn: 'root' })
export class AudioEngineService {
  private stemSeparationService = inject(StemSeparationService);
  private ctx: AudioContext;
  private masterGain: GainNode;
  private analyser: AnalyserNode;
  public compressor: DynamicsCompressorNode;
  public limiter: DynamicsCompressorNode;
  private limiterLookahead: DelayNode;
  private autoTuneDelay: DelayNode;
  private autoTuneFilter: BiquadFilterNode;
  private autoTuneWet: GainNode;
  private recordingDestination: MediaStreamAudioDestinationNode | null = null;

  private reverbConvolver: ConvolverNode;
  private delay: DelayNode;
  private delayFeedback: GainNode;
  private delayWet: GainNode;
  public reverbWet: GainNode;

  private lookahead = 0.1;
  private scheduleAheadTime = 0.2;
  private timerId: any = null;
  private nextNoteTime = 0;

  tempo = signal(120);
  isPlaying = signal(false);
  currentBeat = signal(0);
  loopStart = signal(0);
  loopEnd = signal(16);
  stepsPerBeat = signal(4);

  private tracks = new Map<number, TrackState>();

  private deckA!: DeckChannel;
  private deckB!: DeckChannel;
  private crossfaderValue = 0;
  private crossfaderCurve: 'linear' | 'power' | 'exp' | 'cut' = 'linear';
  private crossfaderHamster = false;

  constructor() {
    this.ctx = new (
      (window as any).AudioContext || (window as any).webkitAudioContext
    )();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.9;

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.ratio.value = 3;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.2;

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.08;

    this.limiterLookahead = this.ctx.createDelay(0.01);
    this.limiterLookahead.delayTime.value = 0.004;

    this.autoTuneDelay = this.ctx.createDelay(0.1);
    this.autoTuneFilter = this.ctx.createBiquadFilter();
    this.autoTuneWet = this.ctx.createGain();
    this.autoTuneWet.gain.value = 0;

    this.analyser = this.ctx.createAnalyser();

    this.reverbConvolver = this.ctx.createConvolver();
    this.reverbWet = this.ctx.createGain();
    this.reverbWet.gain.value = 0.15;
    this.delay = this.ctx.createDelay(5.0);
    this.delayFeedback = this.ctx.createGain();
    this.delayWet = this.ctx.createGain();

    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delay.connect(this.delayWet);
    this.reverbConvolver.connect(this.reverbWet);

    this.reverbWet.connect(this.compressor);
    this.delayWet.connect(this.compressor);
    this.masterGain.connect(this.compressor);

    this.compressor.connect(this.limiterLookahead);
    this.limiterLookahead.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    this.loadDefaultImpulse();
    this.initDeck('A');
    this.initDeck('B');
    this.applyCrossfader();
  }

  getAnalyser(): AnalyserNode { return this.analyser; }
  getContext(): AudioContext { return this.ctx; }

  resume() {
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private initDeck(id: DeckId) {
    const deck: DeckChannel = {
      analyser: this.ctx.createAnalyser(),
      sources: { vocals: null, drums: null, bass: null, melody: null },
      gains: {
        vocals: this.ctx.createGain(),
        drums: this.ctx.createGain(),
        bass: this.ctx.createGain(),
        melody: this.ctx.createGain(),
      },
      pre: this.ctx.createGain(),
      gain: this.ctx.createGain(),
      pan: this.ctx.createStereoPanner(),
      filter: this.ctx.createBiquadFilter(),
      eqLow: this.ctx.createBiquadFilter(),
      eqMid: this.ctx.createBiquadFilter(),
      eqHigh: this.ctx.createBiquadFilter(),
      sendA: this.ctx.createGain(),
      sendB: this.ctx.createGain(),
      startTime: 0,
      pauseOffset: 0,
      rate: 1.0,
      isPlaying: false,
      loopEnabled: false,
      loopStartSec: 0,
      loopEndSec: 0,
      hotCues: new Array(8).fill(null),
      keyLock: false,
    };

    deck.filter.type = 'lowpass';
    deck.filter.frequency.value = 20000;
    deck.eqLow.type = 'lowshelf';
    deck.eqLow.frequency.value = 200;
    deck.eqMid.type = 'peaking';
    deck.eqMid.frequency.value = 1000;
    deck.eqHigh.type = 'highshelf';
    deck.eqHigh.frequency.value = 5000;

    const stems = ['vocals', 'drums', 'bass', 'melody'] as const;
    stems.forEach((s) => deck.gains[s].connect(deck.pre));

    deck.pre.connect(deck.analyser);
    deck.pre
      .connect(deck.eqLow)
      .connect(deck.eqMid)
      .connect(deck.eqHigh)
      .connect(deck.filter)
      .connect(deck.pan)
      .connect(deck.gain)
      .connect(this.masterGain);

    if (id === 'A') this.deckA = deck;
    else this.deckB = deck;
  }

  async loadDeck(id: DeckId, buffer: AudioBuffer) {
    const deck = this.getDeck(id);
    this.stopDeck(id);
    deck.buffer = buffer;
    deck.pauseOffset = 0;
    try {
      deck.stems = await firstValueFrom(this.stemSeparationService.separate(buffer));
    } catch (e) {
      console.warn('Stem separation failed for deck', id, e);
    }
  }

  public getDeck(id: DeckId) { return id === 'A' ? this.deckA : this.deckB; }

  playDeck(id: DeckId) {
    this.resume();
    const deck = this.getDeck(id);
    if (deck.isPlaying) return;
    this.startDeckSource(deck, deck.pauseOffset);
  }

  pauseDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck.isPlaying) return;
    const elapsed = this.ctx.currentTime - deck.startTime;
    deck.pauseOffset += elapsed * deck.rate;
    this.stopDeckSource(deck);
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
        src.connect(deck.gains[k]);
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
        try { (deck.sources as any)[k].stop(); } catch (e) {}
        (deck.sources as any)[k] = null;
      }
    });
    deck.isPlaying = false;
  }

  setDeckRate(id: DeckId, rate: number) {
    const deck = this.getDeck(id);
    deck.rate = rate;
    ['vocals', 'drums', 'bass', 'melody'].forEach((k: any) => {
      if ((deck.sources as any)[k]) {
        (deck.sources as any)[k].playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.05);
      }
    });
  }

  setDeckGain(id: DeckId, gain: number) {
    this.getDeck(id).gain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.01);
  }

  setDeckStemGain(id: DeckId, stem: keyof Stems, gain: number) {
    this.getDeck(id).gains[stem].gain.setTargetAtTime(gain, this.ctx.currentTime, 0.01);
  }

  setDeckEq(id: DeckId, high: number, mid: number, low: number) {
    const deck = this.getDeck(id);
    deck.eqHigh.gain.setTargetAtTime(high, this.ctx.currentTime, 0.01);
    deck.eqMid.gain.setTargetAtTime(mid, this.ctx.currentTime, 0.01);
    deck.eqLow.gain.setTargetAtTime(low, this.ctx.currentTime, 0.01);
  }

  setDeckFilter(id: DeckId, freq: number, type: BiquadFilterType = 'lowpass') {
    const deck = this.getDeck(id);
    deck.filter.type = type;
    deck.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.02);
  }

  setCrossfader(value: number, curve: 'linear' | 'power' | 'exp' | 'cut' = 'linear', hamster = false) {
    this.crossfaderValue = Math.max(-1, Math.min(1, value));
    this.crossfaderCurve = curve;
    this.crossfaderHamster = hamster;
    this.applyCrossfader();
  }

  private applyCrossfader() {
    let a = 0, b = 0;
    const val = this.crossfaderHamster ? -this.crossfaderValue : this.crossfaderValue;
    switch (this.crossfaderCurve) {
      case 'linear': a = 0.5 * (1 - val); b = 0.5 * (1 + val); break;
      case 'power': a = Math.cos(0.25 * Math.PI * (val + 1)); b = Math.sin(0.25 * Math.PI * (val + 1)); break;
      case 'cut': a = val > -0.9 ? 1 : 0; b = val < 0.9 ? 1 : 0; break;
      default: a = 0.5 * (1 - val); b = 0.5 * (1 + val);
    }
    this.deckA.gain.gain.setTargetAtTime(a, this.ctx.currentTime, 0.01);
    this.deckB.gain.gain.setTargetAtTime(b, this.ctx.currentTime, 0.01);
  }

  getDeckProgress(id: DeckId) {
    const deck = this.getDeck(id);
    const dur = deck.buffer?.duration || 0;
    if (!deck.buffer) return { position: 0, duration: 0, isPlaying: false };
    let pos = deck.pauseOffset;
    if (deck.isPlaying) {
      const elapsed = this.ctx.currentTime - deck.startTime;
      pos = Math.max(0, Math.min(dur, deck.pauseOffset + elapsed * deck.rate));
    }
    return { position: pos, duration: dur, isPlaying: deck.isPlaying };
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

  start() {
    this.resume();
    if (this.isPlaying()) return;
    this.isPlaying.set(true);
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.timerId = setInterval(() => this.scheduleTick(), this.lookahead * 1000);
  }

  stop() {
    if (!this.isPlaying()) return;
    this.isPlaying.set(false);
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
  }

  private scheduleTick() {
    const spb = 60 / this.tempo();
    const stepDur = spb / this.stepsPerBeat();
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      const stepIndex = this.currentBeat();
      this.onScheduleStep?.(stepIndex, this.nextNoteTime, stepDur);
      const next = (stepIndex + 1) % this.loopEnd();
      this.currentBeat.set(next);
      this.nextNoteTime += stepDur;
    }
  }

  onScheduleStep?: (stepIndex: number, when: number, stepDur: number) => void;

  playSynth(when: number, freq: number, duration: number, velocity = 1, pan = 0, outGain = 0.6, sendA = 0.1, sendB = 0.05, params?: any) {
    this.resume();
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
    vca.gain.linearRampToValueAtTime(velocity * outGain, when + a);
    vca.gain.linearRampToValueAtTime(velocity * outGain * s, when + a + d);
    vca.gain.setTargetAtTime(0, when + duration, r);
    osc.frequency.value = freq;
    osc.connect(filter).connect(vca).connect(p).connect(this.masterGain);
    osc.start(when);
    osc.stop(when + duration + 2.0);
  }

  setMasterOutputLevel(normalized: number) {
    this.masterGain.gain.setTargetAtTime(normalized, this.ctx.currentTime, 0.01);
  }

  ensureTrack(track: any) { this.tracks.set(track.id, track); }
  updateTrack(id: number, patch: any) {
      const t = this.tracks.get(id);
      if (t) Object.assign(t, patch);
  }

  configureCompressor(params: any) {
    const { threshold, ratio, attack, release } = params;
    if (threshold !== undefined) this.compressor.threshold.setTargetAtTime(threshold, this.ctx.currentTime, 0.01);
    if (ratio !== undefined) this.compressor.ratio.setTargetAtTime(ratio, this.ctx.currentTime, 0.01);
    if (attack !== undefined) this.compressor.attack.setTargetAtTime(attack, this.ctx.currentTime, 0.01);
    if (release !== undefined) this.compressor.release.setTargetAtTime(release, this.ctx.currentTime, 0.01);
  }

  configureLimiter(params: any) {
    const { ceiling, release } = params;
    if (ceiling !== undefined) this.limiter.threshold.setTargetAtTime(ceiling, this.ctx.currentTime, 0.01);
    if (release !== undefined) this.limiter.release.setTargetAtTime(release, this.ctx.currentTime, 0.01);
  }

  // Aliases for compatibility
  setStemGain(id: DeckId, stem: keyof Stems, gain: number) { this.setDeckStemGain(id, stem, gain); }
  loadDeckBuffer(id: DeckId, buffer: AudioBuffer) { this.loadDeck(id, buffer); }
  setDeckFilterFreq(id: DeckId, freq: number) { this.setDeckFilter(id, freq); }
  getDeckLevel(id: DeckId): number {
      const deck = this.getDeck(id);
      const data = new Uint8Array(deck.analyser.frequencyBinCount);
      deck.analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      return sum / data.length / 255;
  }
  getDeckWaveformData(id: DeckId): Float32Array {
      const deck = this.getDeck(id);
      return deck.buffer ? deck.buffer.getChannelData(0) : new Float32Array(0);
  }
  setHotCue(id: DeckId, slot: number) {
      const pos = this.getDeckProgress(id).position;
      this.getDeck(id).hotCues[slot] = pos;
  }
  jumpToHotCue(id: DeckId, slot: number) {
      const pos = this.getDeck(id).hotCues[slot];
      if (pos !== null) this.seekDeck(id, pos);
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
