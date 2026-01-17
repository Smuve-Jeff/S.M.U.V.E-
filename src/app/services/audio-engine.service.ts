import { Injectable, signal, inject } from '@angular/core';
import { firstValueFrom, Subject } from 'rxjs';
import { StemSeparationService, Stems } from './stem-separation.service';

// High-precision WebAudio scheduler with lookahead and sample/synth playback
// Phase A foundation: transport, tempo, scheduler, sample player, basic synth, mixer buses

export type NoteEvent = {
  time: number; // seconds (AudioContext time)
  duration: number; // seconds
  midi: number; // 0-127
  velocity: number; // 0..1
  channel?: number; // track id
};

export type InstrumentType = 'sample' | 'synth';

export interface InstrumentDefinition {
  id: string;
  name: string;
  type: InstrumentType;
  // sample mapping or synth params
  sampleMapUrl?: string; // JSON map for multi-samples
  params?: Record<string, number | string>;
}

export interface TrackState {
  id: number;
  name: string;
  instrumentId: string;
  gain: number;
  pan: number;
  sendA: number; // reverb
  sendB: number; // delay
}

type DeckId = 'A' | 'B';

// Updated DeckChannel to support stems
interface DeckChannel {
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
  pre: GainNode; // point after EQ/filter for sends
  gain: GainNode; // deck output gain
  pan: StereoPannerNode; // deck pan
  filter: BiquadFilterNode; // LP/HP filter
  eqLow: BiquadFilterNode; // lowshelf
  eqMid: BiquadFilterNode; // peaking
  eqHigh: BiquadFilterNode; // highshelf
  sendA: GainNode; // reverb send
  sendB: GainNode; // delay send
  startTime: number; // when playback started in ctx time
  pauseOffset: number; // seconds offset into buffer when paused
  rate: number; // playbackRate
  isPlaying: boolean;
  loopEnabled: boolean;
  loopStartSec: number;
  loopEndSec: number;
  hotCues: number[];
}

@Injectable({ providedIn: 'root' })
export class AudioEngineService {
  private stemSeparationService = inject(StemSeparationService);
  private ctx: AudioContext;
  private masterGain: GainNode;
  private analyser: AnalyserNode;
  private compressor: DynamicsCompressorNode;
  private limiter: DynamicsCompressorNode;
  private limiterLookahead: DelayNode;
  private saturation: WaveShaperNode;
  private stereoWidener: StereoPannerNode;
  private autoTuneDelay: DelayNode;
  private autoTuneFilter: BiquadFilterNode;
  private autoTuneWet: GainNode;
  private recordingDestination: MediaStreamAudioDestinationNode | null = null;

  // FX buses
  private reverbConvolver: ConvolverNode;
  private delay: DelayNode;
  private delayFeedback: GainNode;
  private delayWet: GainNode;
  private reverbWet: GainNode;

  // scheduler
  private lookahead = 0.1; // s
  private scheduleAheadTime = 0.2; // s
  private timerId: number | null = null;
  private nextNoteTime = 0;

  // tempo/transport
  tempo = signal(120);
  isPlaying = signal(false);
  currentBeat = signal(0);
  loopStart = signal(0);
  loopEnd = signal(16); // 16 steps default
  stepsPerBeat = signal(4); // 16th notes

  // tracks
  private tracks = new Map<number, TrackState>();

  // DJ Decks and crossfader
  private deckA!: DeckChannel;
  private deckB!: DeckChannel;
  private crossfader = 0; // -1 (A) to +1 (B)
  private crossfaderCurve: 'linear' | 'power' | 'exp' | 'cut' = 'linear';
  private crossfaderHamster = false;

  constructor() {
    this.ctx = new (
      window.AudioContext || (window as any).webkitAudioContext
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
    this.autoTuneDelay.delayTime.value = 0.02;
    this.autoTuneFilter = this.ctx.createBiquadFilter();
    this.autoTuneFilter.type = 'bandpass';
    this.autoTuneFilter.frequency.value = 440;
    this.autoTuneFilter.Q.value = 5;
    this.autoTuneWet = this.ctx.createGain();
    this.autoTuneWet.gain.value = 0;

    this.analyser = this.ctx.createAnalyser();

    this.saturation = this.ctx.createWaveShaper();
    this.saturation.curve = this.makeSaturationCurve(400);

    this.stereoWidener = this.ctx.createStereoPanner();
    this.stereoWidener.pan.value = 0;

    // FX setup
    this.reverbConvolver = this.ctx.createConvolver();
    this.reverbWet = this.ctx.createGain();
    this.reverbWet.gain.value = 0.15;
    this.delay = this.ctx.createDelay(5.0);
    this.delay.delayTime.value = 0.25; // quarter note-ish
    this.delayFeedback = this.ctx.createGain();
    this.delayFeedback.gain.value = 0.3;
    this.delayWet = this.ctx.createGain();
    this.delayWet.gain.value = 0.2;

    // wire FX graph
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delay.connect(this.delayWet);
    this.reverbConvolver.connect(this.reverbWet);

    // master chain
    this.reverbWet.connect(this.compressor);
    this.delayWet.connect(this.compressor);
    this.masterGain.connect(this.compressor);

    // master dynamics chain
    this.compressor.connect(this.saturation);
    this.saturation.connect(this.stereoWidener);
    this.stereoWidener.connect(this.limiterLookahead);
    this.limiterLookahead.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Auto-tune style parallel bus (delay + filter blend)
    this.compressor.connect(this.autoTuneDelay);
    this.autoTuneDelay.connect(this.autoTuneFilter);
    this.autoTuneFilter.connect(this.autoTuneWet);
    this.autoTuneWet.connect(this.limiter);

    // basic small impulse for convolver placeholder
    this.loadDefaultImpulse();

    // initialize decks
    this.initDeck('A');
    this.initDeck('B');
    this.applyCrossfader();
  }

  getAnalyser(): AnalyserNode {
    return this.analyser;
  }
  getContext(): AudioContext {
    return this.ctx;
  }

  private initDeck(id: DeckId) {
    const pre = this.ctx.createGain();
    const gain = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 20000;

    const eqLow = this.ctx.createBiquadFilter();
    eqLow.type = 'lowshelf';
    eqLow.frequency.value = 120;
    const eqMid = this.ctx.createBiquadFilter();
    eqMid.type = 'peaking';
    eqMid.frequency.value = 1000;
    eqMid.Q.value = 1;
    const eqHigh = this.ctx.createBiquadFilter();
    eqHigh.type = 'highshelf';
    eqHigh.frequency.value = 8000;

    const sendA = this.ctx.createGain();
    sendA.gain.value = 0;
    const sendB = this.ctx.createGain();
    sendB.gain.value = 0;

    // Create gain nodes for each stem
    const stemGains = {
      vocals: this.ctx.createGain(),
      drums: this.ctx.createGain(),
      bass: this.ctx.createGain(),
      melody: this.ctx.createGain(),
    };

    // Route stems to EQ chain
    stemGains.vocals.connect(eqLow);
    stemGains.drums.connect(eqLow);
    stemGains.bass.connect(eqLow);
    stemGains.melody.connect(eqLow);

    // Route: eqLow -> eqMid -> eqHigh -> filter -> pre
    eqLow.connect(eqMid).connect(eqHigh).connect(filter).connect(pre);

    // pre -> gain -> pan -> master
    pre.connect(gain).connect(pan).connect(this.masterGain);
    // pre -> sendA -> reverbConvolver
    pre.connect(sendA).connect(this.reverbConvolver);
    // pre -> sendB -> delay
    pre.connect(sendB).connect(this.delay);

    const deck: DeckChannel = {
      pre,
      gain,
      pan,
      filter,
      eqLow,
      eqMid,
      eqHigh,
      sendA,
      sendB,
      buffer: undefined,
      stems: undefined,
      sources: { vocals: null, drums: null, bass: null, melody: null },
      gains: stemGains,
      startTime: 0,
      pauseOffset: 0,
      rate: 1,
      isPlaying: false,
      loopEnabled: false,
      loopStartSec: 0,
      loopEndSec: 0,
      hotCues: [],
    };

    if (id === 'A') this.deckA = deck;
    else this.deckB = deck;
  }

  private getDeck(id: DeckId): DeckChannel {
    return id === 'A' ? this.deckA : this.deckB;
  }

  // Crossfader control
  setCrossfader(
    value: number,
    curve: 'linear' | 'power' | 'exp' | 'cut' = this.crossfaderCurve,
    hamster = this.crossfaderHamster
  ) {
    this.crossfader = Math.max(-1, Math.min(1, value));
    this.crossfaderCurve = curve;
    this.crossfaderHamster = hamster;
    this.applyCrossfader();
  }

  private applyCrossfader() {
    let t = (this.crossfader + 1) / 2; // 0..1, 0=A,1=B
    if (this.crossfaderHamster) t = 1 - t;
    let gA = 1 - t;
    let gB = t;
    switch (this.crossfaderCurve) {
      case 'power':
        // equal power
        gA = Math.cos((t * Math.PI) / 2);
        gB = Math.sin((t * Math.PI) / 2);
        break;
      case 'exp':
        const k = 2.2;
        gA = Math.pow(1 - t, k);
        gB = Math.pow(t, k);
        break;
      case 'cut':
        const thr = 0.05;
        gA = t < 0.5 - thr ? 1 : t > 0.5 ? 0 : 0.5;
        gB = t > 0.5 + thr ? 1 : t < 0.5 ? 0 : 0.5;
        break;
      default:
        // linear
        gA = 1 - t;
        gB = t;
    }
    this.deckA.gain.gain.setTargetAtTime(gA, this.ctx.currentTime, 0.005);
    this.deckB.gain.gain.setTargetAtTime(gB, this.ctx.currentTime, 0.005);
  }

  // Deck operations
  async loadDeckBuffer(id: DeckId, buffer: AudioBuffer) {
    const deck = this.getDeck(id);
    deck.buffer = buffer;
    deck.stems = await firstValueFrom(this.stemSeparationService.separate(buffer));
    this.stemSeparationService.separate(buffer).subscribe(stems => {
      deck.stems = stems;
    });
    deck.pauseOffset = 0;
    if (deck.isPlaying) {
      this.stopDeckSource(deck);
      this.startDeckSource(deck, 0);
    }
  }

  playDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck.buffer || !deck.stems) return;
    if (deck.isPlaying) return;
    this.startDeckSource(deck, deck.pauseOffset);
  }

  pauseDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck.isPlaying) return;
    const elapsed = this.ctx.currentTime - deck.startTime;
    deck.pauseOffset = Math.max(0, deck.pauseOffset + elapsed * deck.rate);
    this.stopDeckSource(deck);
  }

  setDeckRate(id: DeckId, rate: number) {
    const deck = this.getDeck(id);
    deck.rate = Math.max(0.5, Math.min(1.5, rate));
    Object.values(deck.sources).forEach((source) => {
      if (source) {
        try {
          source.playbackRate.setTargetAtTime(
            deck.rate,
            this.ctx.currentTime,
            0.01
          );
        } catch {}
      }
    });
  }

  setStemGain(id: DeckId, stem: keyof Stems, gain: number) {
    const deck = this.getDeck(id);
    deck.gains[stem].gain.setTargetAtTime(
      Math.max(0, Math.min(1, gain)),
      this.ctx.currentTime,
      0.01
    );
  }

  automationEvents$ = new Subject<{ paramId: string, value: number, step: number }>();

  recordAutomation(paramId: string, value: number) {
    this.automationEvents$.next({
      paramId,
      value,
      step: this.currentBeat()
    });
  }

  setDeckEq(id: DeckId, highs: number, mids: number, lows: number) {
    const deck = this.getDeck(id);
    // highs/mids/lows expected -12..+12 dB
    deck.eqHigh.gain.setTargetAtTime(highs, this.ctx.currentTime, 0.02);
    deck.eqMid.gain.setTargetAtTime(mids, this.ctx.currentTime, 0.02);
    deck.eqLow.gain.setTargetAtTime(lows, this.ctx.currentTime, 0.02);
  }

  setDeckFilterFreq(id: DeckId, freq: number) {
    const deck = this.getDeck(id);
    deck.filter.frequency.setTargetAtTime(
      Math.max(20, Math.min(20000, freq)),
      this.ctx.currentTime,
      0.02
    );
  }

  setDeckGain(id: DeckId, gain: number) {
    const deck = this.getDeck(id);
    deck.gain.gain.setTargetAtTime(
      Math.max(0, Math.min(1, gain)),
      this.ctx.currentTime,
      0.01
    );
  }

  setDeckSends(id: DeckId, sendA: number, sendB: number) {
    const deck = this.getDeck(id);
    deck.sendA.gain.setTargetAtTime(
      Math.max(0, Math.min(1, sendA)),
      this.ctx.currentTime,
      0.01
    );
    deck.sendB.gain.setTargetAtTime(
      Math.max(0, Math.min(1, sendB)),
      this.ctx.currentTime,
      0.01
    );
  }

  private startDeckSource(deck: DeckChannel, offset: number) {
    if (!deck.stems) return;

    Object.keys(deck.stems).forEach((key) => {
      const stemName = key as keyof Stems;
      const source = this.ctx.createBufferSource();
      source.buffer = deck.stems![stemName];
      source.playbackRate.value = deck.rate;
      source.loop = deck.loopEnabled;
      if (deck.loopEnabled) {
        source.loopStart = deck.loopStartSec;
        source.loopEnd =
          deck.loopEndSec > 0 ? deck.loopEndSec : deck.buffer?.duration || 0;
      }
      source.connect(deck.gains[stemName]);

      const when = this.ctx.currentTime + 0.005;
      source.start(when, offset);
      deck.sources[stemName] = source;

      source.onended = () => {
        if (deck.sources[stemName] === source) {
          deck.isPlaying = false;
          deck.sources[stemName] = null;
          if (stemName === 'vocals') {
            // only reset pause offset once
            deck.pauseOffset = 0;
          }
        }
      };
    });

    deck.startTime = this.ctx.currentTime + 0.005;
    deck.isPlaying = true;
  }

  private stopDeckSource(deck: DeckChannel) {
    Object.values(deck.sources).forEach((source) => {
      if (source) {
        try {
          source.stop();
        } catch {}
        source.disconnect();
      }
    });
    deck.sources = { vocals: null, drums: null, bass: null, melody: null };
    deck.isPlaying = false;
  }

  seekDeck(id: DeckId, seconds: number) {
    const deck = this.getDeck(id);
    if (!deck.buffer) return;
    const dur = deck.buffer.duration;
    const pos = Math.max(0, Math.min(dur - 0.001, seconds));
    const wasPlaying = deck.isPlaying;
    if (deck.isPlaying) this.stopDeckSource(deck);
    deck.pauseOffset = pos;
    if (wasPlaying) this.startDeckSource(deck, deck.pauseOffset);
  }

  setHotCue(id: DeckId, index: number, seconds: number) {
    const deck = this.getDeck(id);
    deck.hotCues[index] = seconds;
  }

  jumpToHotCue(id: DeckId, index: number) {
    const deck = this.getDeck(id);
    const cue = deck.hotCues[index];
    if (cue !== undefined) {
      this.seekDeck(id, cue);
    }
  }

  setDeckLoop(id: DeckId, enabled: boolean, startSec: number, endSec: number) {
    const deck = this.getDeck(id);
    deck.loopEnabled = enabled;
    deck.loopStartSec = Math.max(0, startSec);
    deck.loopEndSec = Math.max(deck.loopStartSec + 0.01, endSec);
    if (deck.isPlaying) {
      // rebuild source to apply loop changes immediately
      const wasOffset = this.getDeckProgress(id).position;
      this.stopDeckSource(deck);
      this.startDeckSource(deck, wasOffset);
    }
  }

  getDeckProgress(id: DeckId): {
    position: number;
    duration: number;
    isPlaying: boolean;
  } {
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
        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2); // quick decay noise
      }
    }
    this.reverbConvolver.buffer = impulse;
  }

  ensureTrack(track: TrackState) {
    this.tracks.set(track.id, track);
  }

  updateTrack(id: number, patch: Partial<TrackState>) {
    const t = this.tracks.get(id);
    if (!t) return;
    Object.assign(t, patch);
  }

  // Scheduling
  private scheduleTick() {
    const spb = 60 / this.tempo();
    const stepDur = spb / this.stepsPerBeat();

    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      const stepIndex = this.currentBeat();
      // Emit hook or call registered callbacks per track to request notes for this step
      this.onScheduleStep?.(stepIndex, this.nextNoteTime, stepDur);
      // advance
      const next = (stepIndex + 1) % this.loopEnd();
      this.currentBeat.set(next);
      this.nextNoteTime += stepDur;
      if (next === this.loopStart()) {
        // loop wrap ensured by modulo
      }
    }
  }

  onScheduleStep?: (stepIndex: number, when: number, stepDur: number) => void;

  start() {
    if (this.isPlaying()) return;
    this.isPlaying.set(true);
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.timerId = window.setInterval(
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

  // Playback primitives
  playSample(
    buffer: AudioBuffer,
    when: number,
    velocity = 1,
    pan = 0,
    outGain = 1,
    sendA = 0,
    sendB = 0
  ) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const vca = this.ctx.createGain();
    vca.gain.value = velocity * outGain;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;

    src.connect(vca).connect(p).connect(this.masterGain);
    if (sendA > 0) vca.connect(this.reverbConvolver).connect(this.reverbWet);
    if (sendB > 0) vca.connect(this.delay).connect(this.delayWet);

    src.start(when);
  }

  playSynth(
    when: number,
    freq: number,
    duration: number,
    velocity = 1,
    pan = 0,
    outGain = 0.6,
    sendA = 0.1,
    sendB = 0.05,
    params?: {
      type?: OscillatorType;
      attack?: number;
      decay?: number;
      sustain?: number;
      release?: number;
      cutoff?: number;
      q?: number;
      detune?: number;
      lfoFreq?: number;
      lfoAmount?: number;
    }
  ) {
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const sub = this.ctx.createOscillator();

    osc1.type = params?.type || 'sawtooth';
    osc2.type = params?.type || 'sawtooth';
    sub.type = 'sine';

    osc1.frequency.setValueAtTime(freq, when);
    osc2.frequency.setValueAtTime(freq, when);
    sub.frequency.setValueAtTime(freq / 2, when);

    osc2.detune.setValueAtTime(params?.detune ?? 12, when);

    // LFO for Vibrato/Filter Mod
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.setValueAtTime(params?.lfoFreq ?? 5, when);
    lfoGain.gain.setValueAtTime(params?.lfoAmount ?? 10, when);
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);

    const vca = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = params?.cutoff ?? 8000;
    filter.Q.value = params?.q ?? 0.707;

    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;

    const a = params?.attack ?? 0.005;
    const d = params?.decay ?? 0.08;
    const s = params?.sustain ?? 0.7;
    const r = params?.release ?? 0.15;

    const now = when;
    vca.gain.setValueAtTime(0, now);
    vca.gain.linearRampToValueAtTime(velocity * outGain, now + a);
    vca.gain.linearRampToValueAtTime(velocity * outGain * s, now + a + d);
    vca.gain.setTargetAtTime(0, now + duration, r);

    osc1.connect(filter);
    osc2.connect(filter);
    sub.connect(filter);

    filter.connect(vca).connect(p).connect(this.masterGain);

    if (sendA > 0) vca.connect(this.reverbConvolver).connect(this.reverbWet);
    if (sendB > 0) vca.connect(this.delay).connect(this.delayWet);

    osc1.start(now);
    osc2.start(now);
    sub.start(now);
    lfo.start(now);

    const stopTime = now + duration + 2.0;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    sub.stop(stopTime);
    lfo.stop(stopTime);
  }

  midiToFreq(midi: number) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  setMasterOutputLevel(normalized: number) {
    const value = Math.min(Math.max(normalized, 0), 1);
    this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
  }

  connectExternalInput(node: AudioNode) {
    node.connect(this.masterGain);
  }

  disconnectExternalInput(node: AudioNode) {
    try {
      node.disconnect(this.masterGain);
    } catch (err) {
      console.warn('Failed to disconnect external input', err);
    }
  }

  configureCompressor(params: {
    threshold?: number;
    ratio?: number;
    attack?: number;
    release?: number;
    enabled?: boolean;
  }) {
    const { threshold, ratio, attack, release, enabled } = params;
    const active = enabled !== false;
    if (threshold !== undefined) {
      this.compressor.threshold.setTargetAtTime(
        threshold,
        this.ctx.currentTime,
        0.01
      );
    }
    if (ratio !== undefined) {
      this.compressor.ratio.setTargetAtTime(
        active ? ratio : 1,
        this.ctx.currentTime,
        0.01
      );
    } else if (!active) {
      this.compressor.ratio.setTargetAtTime(1, this.ctx.currentTime, 0.01);
    }
    if (attack !== undefined) {
      this.compressor.attack.setTargetAtTime(
        Math.max(attack, 0.0001),
        this.ctx.currentTime,
        0.01
      );
    }
    if (release !== undefined) {
      this.compressor.release.setTargetAtTime(
        Math.max(release, 0.0001),
        this.ctx.currentTime,
        0.01
      );
    }
  }

  configureLimiter(params: {
    ceiling?: number;
    lookahead?: number;
    release?: number;
    enabled?: boolean;
  }) {
    const { ceiling, lookahead, release, enabled } = params;
    const active = enabled !== false;
    if (ceiling !== undefined) {
      this.limiter.threshold.setTargetAtTime(
        active ? ceiling : 0,
        this.ctx.currentTime,
        0.01
      );
    } else if (!active) {
      this.limiter.threshold.setTargetAtTime(0, this.ctx.currentTime, 0.01);
    }
    if (release !== undefined) {
      this.limiter.release.setTargetAtTime(
        Math.max(release, 0.0001),
        this.ctx.currentTime,
        0.01
      );
    }
    if (lookahead !== undefined) {
      this.limiterLookahead.delayTime.setTargetAtTime(
        Math.min(Math.max(lookahead, 0), 0.01),
        this.ctx.currentTime,
        0.01
      );
    }
  }

  configureAutoTune(params: {
    mix?: number;
    retune?: number;
    humanize?: number;
    formant?: number;
    enabled?: boolean;
  }) {
    const { mix, retune, humanize, formant, enabled } = params;
    const active = enabled !== false;
    if (mix !== undefined) {
      this.autoTuneWet.gain.setTargetAtTime(
        active ? mix : 0,
        this.ctx.currentTime,
        0.01
      );
    } else if (!active) {
      this.autoTuneWet.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
    }
    if (retune !== undefined) {
      const delay = Math.max(0.001, (100 - retune) / 5000);
      this.autoTuneDelay.delayTime.setTargetAtTime(
        delay,
        this.ctx.currentTime,
        0.01
      );
    }
    if (humanize !== undefined) {
      const gain = Math.max(0, Math.min(1, humanize / 100));
      this.autoTuneWet.gain.setTargetAtTime(
        active ? gain : 0,
        this.ctx.currentTime,
        0.01
      );
    }
    if (formant !== undefined) {
      const centerFreq = 440 * Math.pow(2, formant / 12);
      this.autoTuneFilter.frequency.setTargetAtTime(
        centerFreq,
        this.ctx.currentTime,
        0.01
      );
    }
  }

  private makeSaturationCurve(amount: number) {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  setSaturation(amount: number) {
    this.saturation.curve = this.makeSaturationCurve(amount);
  }

  setStereoWidth(width: number) {
    this.stereoWidener.pan.setTargetAtTime(
      Math.max(-1, Math.min(1, width)),
      this.ctx.currentTime,
      0.01
    );
  }

  getVisualIntensity(): number {
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    return sum / dataArray.length / 255; // Normalize to 0-1
  }

  getMasterStream(): MediaStreamAudioDestinationNode {
    if (!this.recordingDestination) {
      this.recordingDestination = this.ctx.createMediaStreamDestination();
      this.limiter.connect(this.recordingDestination);
    }
    return this.recordingDestination;
  }
}
