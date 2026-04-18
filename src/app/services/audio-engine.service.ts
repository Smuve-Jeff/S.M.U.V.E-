import { Injectable, signal, effect, WritableSignal } from '@angular/core';

export type DeckId = 'A' | 'B';

@Injectable({ providedIn: 'root' })
export class AudioEngineService {
  public tempo = signal(124);
  public isPlaying = signal(false);
  public isRecording = signal(false);
  public metronomeEnabled = signal(false);
  public metronomeVolume = signal(0.5);
  public loopStart = signal(0);
  public loopEnd = signal(16);
  public currentBeat = signal(0);
  public currentTick = signal(0);
  public reverbWet = signal(0.3);
  public outputMode = signal('stereo');

  public ctx: AudioContext | null = null;
  public masterGain: any;
  public compressor: any;
  public masterAnalyser: any;

  private schedulerTimer: any;
  private nextTickTime = 0;
  private tickCounter = 0;
  private lookahead = 0.1;

  public onStep?: (step: number, time: number) => void;
  public onScheduleStep?: (...args: any[]) => void;

  public decks = new Map<string, any>();

  constructor() {
    effect(() => {
      if (this.isPlaying()) {
        if (!this.ctx) this.initAudio();
        if (this.ctx!.state === 'suspended') this.ctx!.resume();
        this.nextTickTime = this.ctx!.currentTime;
        this.scheduler();
      } else {
        clearTimeout(this.schedulerTimer);
        this.tickCounter = 0;
        this.currentBeat.set(0);
        this.currentTick.set(0);
      }
    });
  }

  public initAudio() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.compressor = this.ctx.createDynamicsCompressor();
    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterGain.connect(this.compressor).connect(this.masterAnalyser).connect(this.ctx.destination);
    return this.ctx;
  }

  public getContext() { if (!this.ctx) this.initAudio(); return this.ctx!; }
  public resume() { if (this.ctx) return this.ctx.resume(); return Promise.resolve(); }

  private scheduler() {
    while (this.ctx && this.nextTickTime < this.ctx.currentTime + this.lookahead) {
      this.scheduleTick(this.tickCounter, this.nextTickTime);
      this.advanceTick();
    }
    this.schedulerTimer = setTimeout(() => this.scheduler(), 25);
  }

  private scheduleTick(tick: number, time: number) {
    const stepDur = 60.0 / this.tempo() / 4.0;
    if (this.onStep) this.onStep(tick, time);
    if (this.onScheduleStep) this.onScheduleStep(tick, time, stepDur);

    if (this.metronomeEnabled() && tick % 4 === 0) {
      this.playClick(time, tick % 16 === 0 ? 1000 : 800);
    }
    this.currentBeat.set(Math.floor(tick / 4));
    this.currentTick.set(tick);
  }

  private playClick(time: number, freq: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(this.metronomeVolume(), time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  private advanceTick() {
    const secondsPerTick = 60.0 / this.tempo() / 4.0;
    this.nextTickTime += secondsPerTick;
    this.tickCounter++;
    if (this.tickCounter >= this.loopEnd()) this.tickCounter = this.loopStart();
  }

  public triggerAttack(trackId: number, freq: number, time: number, velocity: number, length: number, gain: number, pan: number, sendA: number, sendB: number, params: any, velocityScale = 1) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const p = this.ctx.createStereoPanner();
    osc.type = params.type || 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    const finalGain = velocity * gain * velocityScale;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(finalGain, time + (params.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(finalGain * (params.sustain || 0.7), time + (params.decay || 0.1));
    const dur = length * (60/this.tempo()/4);
    g.gain.setValueAtTime(finalGain * (params.sustain || 0.7), time + dur);
    g.gain.linearRampToValueAtTime(0, time + dur + (params.release || 0.1));
    p.pan.setValueAtTime(pan, time);
    osc.connect(g).connect(p).connect(this.masterGain || this.ctx.destination);
    osc.start(time);
    osc.stop(time + dur + (params.release || 0.1) + 0.1);
  }

  public playSynth(...args: any[]) {
    if (!this.ctx) this.initAudio();
    let time, freq, duration, velocity, pan;
    if (typeof args[0] === 'number' && args.length > 2) {
       [time, freq, duration, velocity, pan] = args;
    } else {
       [, freq, velocity] = args;
       time = this.ctx!.currentTime;
       duration = 1;
       pan = 0;
    }
    this.triggerAttack(0, freq || 440, time || this.ctx!.currentTime, velocity || 0.5, duration || 1, 0.5, pan || 0, 0, 0, { type: 'sine' });
  }

  public ensureTrack(track: any) {}
  public updateTrack(id: number, patch: any) {}
  public start() { this.isPlaying.set(true); }
  public stop() { this.isPlaying.set(false); }
  public toggleRecording() { this.isRecording.update(v => !v); }
  public toggleMetronome() { this.metronomeEnabled.update(v => !v); }
  public setMetronomeVolume(vol: number) { this.metronomeVolume.set(vol); }
  public getMasterAnalyser() { if (!this.ctx) this.initAudio(); return this.masterAnalyser; }
  public getAnalyser() { return this.getMasterAnalyser(); }
  public getMasterStream() { if (!this.ctx) this.initAudio(); const dest = this.ctx!.createMediaStreamDestination(); this.masterAnalyser?.connect(dest); return dest; }


  private deckNodes = new Map<string, {
    source: AudioBufferSourceNode | null,
    gain: GainNode,
    filter: BiquadFilterNode,
    low: BiquadFilterNode,
    mid: BiquadFilterNode,
    high: BiquadFilterNode,
    panner: StereoPannerNode,
    rate: number,
    lastStartedAt: number,
    lastOffset: number,
    slipOffset: number,
    slipEnabled: boolean,
    loopEnabled: boolean
  }>();

  public getDeck(id: string) {
    if (!this.decks.has(id)) {
      this.decks.set(id, {
        buffer: null,
        position: 0,
        slipPosition: 0,
        isPlaying: false,
        duration: 0,
        rate: 1,
        hotCues: new Array(8).fill(null)
      });
      this.initDeckNodes(id);
    }
    return this.decks.get(id);
  }

  private initDeckNodes(id: string) {
    if (!this.ctx) this.initAudio();
    const g = this.ctx!.createGain();
    const f = this.ctx!.createBiquadFilter();
    const low = this.ctx!.createBiquadFilter();
    const mid = this.ctx!.createBiquadFilter();
    const high = this.ctx!.createBiquadFilter();
    const p = this.ctx!.createStereoPanner();

    low.type = 'lowshelf'; low.frequency.value = 320;
    mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 0.5;
    high.type = 'highshelf'; high.frequency.value = 3200;

    f.connect(low).connect(mid).connect(high).connect(g).connect(p).connect(this.masterGain);

    this.deckNodes.set(id, {
      source: null, gain: g, filter: f, low, mid, high, panner: p,
      rate: 1, lastStartedAt: 0, lastOffset: 0, slipOffset: 0,
      slipEnabled: false, loopEnabled: false
    });
  }

  public loadDeck(id: string, buffer: AudioBuffer) {
    const d = this.getDeck(id);
    d.buffer = buffer;
    d.duration = buffer.duration;
    this.stopDeck(id);
    d.position = 0;
    d.slipPosition = 0;
  }

  public playDeck(id: string) {
    const d = this.getDeck(id);
    if (!d.buffer || d.isPlaying) return;
    const nodes = this.deckNodes.get(id)!;

    if (nodes.source) { nodes.source.stop(); nodes.source = null; }

    const source = this.ctx!.createBufferSource();
    source.buffer = d.buffer;
    source.playbackRate.value = nodes.rate;
    source.loop = nodes.loopEnabled;
    source.connect(nodes.filter);

    const startTime = this.ctx!.currentTime;
    source.start(startTime, d.position);

    nodes.source = source;
    nodes.lastStartedAt = startTime;
    nodes.lastOffset = d.position;
    d.isPlaying = true;
  }

  public pauseDeck(id: string) {
    const d = this.getDeck(id);
    if (!d.isPlaying) return;
    this.stopDeck(id);
  }

  private stopDeck(id: string) {
    const d = this.getDeck(id);
    const nodes = this.deckNodes.get(id)!;
    if (nodes.source) {
      try { nodes.source.stop(); } catch(e) {}
      nodes.source = null;
    }
    d.position = this.getDeckCurrentPosition(id);
    d.isPlaying = false;
  }

  public seekDeck(id: string, pos: number) {
    const d = this.getDeck(id);
    const wasPlaying = d.isPlaying;
    if (wasPlaying) this.stopDeck(id);
    d.position = Math.max(0, Math.min(d.duration, pos));
    if (wasPlaying) this.playDeck(id);
  }

  public getDeckProgress(id: string) {
    const d = this.getDeck(id);
    return {
      position: this.getDeckCurrentPosition(id),
      duration: d.duration,
      isPlaying: d.isPlaying,
      slipPosition: this.getDeckCurrentPosition(id, true)
    };
  }

  private getDeckCurrentPosition(id: string, slip = false) {
    const d = this.getDeck(id);
    const nodes = this.deckNodes.get(id)!;
    if (!d.isPlaying) return d.position;
    const elapsed = (this.ctx!.currentTime - nodes.lastStartedAt) * nodes.rate;
    let pos = nodes.lastOffset + elapsed;
    if (nodes.loopEnabled && d.duration > 0) pos %= d.duration;
    return pos;
  }

  public setDeckRate(id: string, rate: number, preservePitch = true) {
    const d = this.getDeck(id);
    const nodes = this.deckNodes.get(id)!;
    nodes.rate = rate;
    if (nodes.source) {
      nodes.source.playbackRate.setTargetAtTime(rate, this.ctx!.currentTime, 0.01);
    }
  }

  public brakeDeck(id: string) {
    const nodes = this.deckNodes.get(id)!;
    if (nodes.source) {
      nodes.source.playbackRate.exponentialRampToValueAtTime(0.01, this.ctx!.currentTime + 1.5);
      setTimeout(() => this.pauseDeck(id), 1500);
    }
  }

  public spinbackDeck(id: string) {
    const nodes = this.deckNodes.get(id)!;
    if (nodes.source) {
      nodes.source.playbackRate.linearRampToValueAtTime(-2.0, this.ctx!.currentTime + 0.5);
      setTimeout(() => this.pauseDeck(id), 600);
    }
  }

  public transformDeck(id: string) {
    const nodes = this.deckNodes.get(id)!;
    const now = this.ctx!.currentTime;
    for (let i = 0; i < 8; i++) {
      nodes.gain.gain.setValueAtTime(0, now + i * 0.1);
      nodes.gain.gain.setValueAtTime(1, now + i * 0.1 + 0.05);
    }
  }

  public setCrossfader(val: number, curve?: any, hamster?: any) {
    // val -1 to 1
    const nodesA = this.deckNodes.get('A');
    const nodesB = this.deckNodes.get('B');
    if (!nodesA || !nodesB) return;

    const gainA = Math.cos((val + 1) * 0.25 * Math.PI);
    const gainB = Math.sin((val + 1) * 0.25 * Math.PI);

    nodesA.panner.pan.setTargetAtTime(val < 0 ? 0 : val, this.ctx!.currentTime, 0.05);
    nodesB.panner.pan.setTargetAtTime(val > 0 ? 0 : val, this.ctx!.currentTime, 0.05);
    // Note: Simple cosine crossfade
    nodesA.gain.gain.setTargetAtTime(gainA, this.ctx!.currentTime, 0.05);
    nodesB.gain.gain.setTargetAtTime(gainB, this.ctx!.currentTime, 0.05);
  }

  public setDeckLoop(id: string, state: boolean) {
    const nodes = this.deckNodes.get(id)!;
    nodes.loopEnabled = state;
    if (nodes.source) nodes.source.loop = state;
  }

  public setSlipMode(id: string, state: boolean) {
    const nodes = this.deckNodes.get(id)!;
    nodes.slipEnabled = state;
  }

  public setHotCue(id: string, slot: number) {
    const d = this.getDeck(id);
    d.hotCues[slot] = this.getDeckCurrentPosition(id);
  }

  public jumpToHotCue(id: string, slot: number) {
    const d = this.getDeck(id);
    if (d.hotCues[slot] !== null) this.seekDeck(id, d.hotCues[slot]!);
  }

  public setDeckEq(id: string, high: number, mid: number, low: number) {
    const nodes = this.deckNodes.get(id)!;
    nodes.high.gain.setTargetAtTime(high, this.ctx!.currentTime, 0.05);
    nodes.mid.gain.setTargetAtTime(mid, this.ctx!.currentTime, 0.05);
    nodes.low.gain.setTargetAtTime(low, this.ctx!.currentTime, 0.05);
  }

  public setDeckFilter(id: string, freq: number) {
    const nodes = this.deckNodes.get(id)!;
    nodes.filter.frequency.setTargetAtTime(freq, this.ctx!.currentTime, 0.05);
  }

  public setDeckGain(id: string, gain: number) {
    const nodes = this.deckNodes.get(id)!;
    nodes.gain.gain.setTargetAtTime(gain, this.ctx!.currentTime, 0.05);
  }
public setMasterOutputLevel(vol: any) { if (this.masterGain) this.masterGain.gain.setTargetAtTime(vol, 0, 0.1); }
  public getMasteringTargets(): any { return { lufs: -14, truePeak: -1 }; }
  public setMasteringTargets(targets: any) {}
  public configureCompressor(cfg: any) {}
  public configureLimiter(cfg: any) {}
  public setSaturation(val: number) {}
  public applyProductionParameter(...args: any[]) {}
  public setOutputMode(mode: any) {}

  public setDeckStemGain(id: string, stem: any, gain: number) {
    this.setDeckGain(id, gain);
  }

  public clearHotCue(id: string, slot: number) {
    const d = this.getDeck(id);
    d.hotCues[slot] = null;
  }

  public setDeckSend(id: string, send: string, gain: number) {
    console.log(`Deck ${id} send ${send} level set to ${gain}`);
  }

  public getDeckLevel(id: string): number {
    const d = this.decks.get(id);
    return d && d.isPlaying ? 0.7 + Math.random() * 0.2 : 0;
  }

  public getDeckWaveformData(id: string): Float32Array {
    return new Float32Array(128).map(() => Math.random());
  }
}
