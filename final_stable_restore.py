import os
import re

file_path = 'src/app/services/audio-engine.service.ts'
with open('audio_engine_backup.ts', 'r') as f:
    backup = f.read()

# We'll re-read the original file to get a clean state if possible,
# but I've already modified it many times.
# Let's try to reconstruct the class properly.

# 1. Start with the core structure and imports from a known good state or the backup.
# The backup seems mostly complete for DAW.

header = """import { LoggingService } from './logging.service';
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
  // DJ Expansion
  cueGain: GainNode;
  flangerNode: BiquadFilterNode;
  phaserNode: BiquadFilterNode;
  pingPongDelay: DelayNode;
  pingPongFeedback: GainNode;
  pingPongPan: StereoPannerNode;
  detectedBpm: number;
  isCueing: boolean;
}

interface MasteringTargets {
  lufs: number;
  truePeak: number;
}
"""

class_start = """
@Injectable({
  providedIn: 'root',
})
export class AudioEngineService {
  public cueMaster!: GainNode;
  public headphoneGain = signal(0.7);

  private static readonly INTEGER_TRACK_ID_PATTERN = /^-?\\d+$/;
  private static readonly STEM_ORDER: (keyof Stems)[] = [
    'vocals',
    'drums',
    'bass',
    'instrumental',
    'other',
  ];
  private static readonly DEFAULT_LOOKAHEAD_SECONDS = 0.2;
  private static readonly DEFAULT_SCHEDULER_INTERVAL_MS = 25;

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
  private tracks = new Map<number, any>();

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
      ceiling: this.masteringTargets.truePeak,
      release: 0.25,
    });

    this.setupSaturation(0);
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
    deck.flangerNode.type = 'allpass';
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

    if (id === 'A') this.deckA = deck;
    else this.deckB = deck;

    this.applyDeckOutputGain(deck);
  }

  getContext() { return this.ctx; }
  resume() { if (this.ctx.state === 'suspended') void this.ctx.resume(); }
  isPlayingStatus() { return this.isPlaying(); }
  stepsPerBeat() { return 4; }

  start() {
    this.resume();
    this.isPlaying.set(true);
    if (this.nextNoteTime <= this.ctx.currentTime) this.nextNoteTime = this.ctx.currentTime + 0.05;
    if (!this.schedulerHandle) {
      this.schedulerHandle = setInterval(() => this.scheduler(), AudioEngineService.DEFAULT_SCHEDULER_INTERVAL_MS);
    }
  }

  stop() {
    this.isPlaying.set(false);
    if (this.schedulerHandle) {
      clearInterval(this.schedulerHandle);
      this.schedulerHandle = null;
    }
  }

  setLoopLengthBars(bars: number) {
    const nextLength = bars * 16;
    this.loopLengthSteps.set(nextLength);
    if (this.currentStep >= nextLength) this.currentStep = 0;
  }

  private scheduler() {
    const stepDuration = 60 / this.tempo() / 4;
    while (this.nextNoteTime < this.ctx.currentTime + AudioEngineService.DEFAULT_LOOKAHEAD_SECONDS) {
      const step = this.currentStep;
      this.onScheduleStep?.(step, this.nextNoteTime, stepDuration);
      this.currentBeat.set(step / 4);
      this.playMetronomeClick(this.nextNoteTime, step % 4 === 0);
      this.nextNoteTime += stepDuration;
      this.currentStep = (this.currentStep + 1) % this.loopLengthSteps();
    }
  }

  private playMetronomeClick(when: number, accent: boolean) {
    if (!this.metronomeEnabled()) return;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.frequency.setValueAtTime(accent ? 1000 : 500, when);
    env.gain.setValueAtTime(this.metronomeVolume(), when);
    env.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
    osc.connect(env).connect(this.masterGain);
    osc.start(when);
    osc.stop(when + 0.05);
  }

  toggleMetronome() { this.metronomeEnabled.set(!this.metronomeEnabled()); }
  setMetronomeVolume(val: number) { this.metronomeVolume.set(this.clamp(val, 0, 1)); }

  getTrackOutput(id: number): GainNode {
    if (!this.trackOutputs.has(id)) {
      const gain = this.ctx.createGain();
      gain.connect(this.masterGain);
      this.trackOutputs.set(id, gain);
    }
    return this.trackOutputs.get(id)!;
  }

  updateTrack(id: number, data: any) {
    const t = this.tracks.get(id);
    if (t) Object.assign(t, data);
    else this.tracks.set(id, data);
  }

  connectSidechain(sourceId: string, targetId: string) {
    if (!this.sidechainMatrix.has(sourceId)) this.sidechainMatrix.set(sourceId, new Set());
    this.sidechainMatrix.get(sourceId)!.add(targetId);
    this.sidechainEnabled.set(true);
  }

  getDeck(id: DeckId): DeckChannel { return id === 'A' ? this.deckA : this.deckB; }

  async loadDeck(id: DeckId, buffer: AudioBuffer) {
    const deck = this.getDeck(id);
    this.stopDeckSources(deck);
    deck.buffer = buffer;
    deck.stems = await this.stemSeparationService.separate(buffer);
    deck.pauseOffset = 0;
    deck.startTime = this.ctx.currentTime;
    deck.rate = 1;
    deck.isPlaying = false;
    deck.hotCues = new Array(8).fill(null);
  }

  getDeckProgress(id: DeckId) {
    const deck = this.getDeck(id);
    const duration = deck.buffer?.duration || 0;
    const position = this.getDeckPosition(deck);
    return { duration, position, isPlaying: deck.isPlaying, slipPosition: deck.slipActive ? this.getSlipPosition(deck) : position };
  }

  seekDeck(id: DeckId, pos: number) {
    const deck = this.getDeck(id);
    const duration = deck.buffer?.duration || 0;
    if (!duration) return;
    const clamped = this.clamp(pos, 0, duration);
    deck.pauseOffset = clamped;
    if (deck.isPlaying) this.restartDeckPlayback(deck, clamped);
  }

  playDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck.buffer || deck.isPlaying) return;
    this.resume();
    const startOffset = (deck.buffer.duration && deck.pauseOffset >= deck.buffer.duration) ? 0 : deck.pauseOffset;
    deck.pauseOffset = startOffset;
    deck.startTime = this.ctx.currentTime - startOffset / Math.max(0.05, Math.abs(deck.rate));
    deck.isPlaying = true;
    this.startDeckSources(deck, startOffset);
  }

  pauseDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck.isPlaying) return;
    const pos = this.getDeckPosition(deck);
    deck.pauseOffset = pos;
    deck.isPlaying = false;
    this.stopDeckSources(deck);
    if (deck.slipEnabled) {
      deck.slipActive = true;
      deck.slipStartTime = this.ctx.currentTime;
      deck.slipStartOffset = pos;
    }
  }

  setDeckGain(id: DeckId, gain: number) {
    const deck = this.getDeck(id);
    deck.channelGain = this.clamp(gain, 0, 2);
    this.applyDeckOutputGain(deck);
  }

  setCrossfader(val: number, curve: string = 'linear', hamster = false) {
    const pos = this.clamp(hamster ? -val : val, -1, 1);
    this.deckA.crossfadeGain = this.getCrossfadeGain(pos, curve, 'A');
    this.deckB.crossfadeGain = this.getCrossfadeGain(pos, curve, 'B');
    this.applyDeckOutputGain(this.deckA);
    this.applyDeckOutputGain(this.deckB);
  }

  private getCrossfadeGain(val: number, curve: string, deckId: DeckId) {
    const norm = (val + 1) / 2;
    if (curve === 'power') return deckId === 'A' ? Math.cos(norm * Math.PI * 0.5) : Math.sin(norm * Math.PI * 0.5);
    return deckId === 'A' ? 1 - norm : norm;
  }

  setDeckRate(id: DeckId, rate: number, smooth = true) {
    const deck = this.getDeck(id);
    const pos = this.getDeckPosition(deck);
    const safeRate = this.clamp(Math.abs(rate) || 0.05, 0.05, 3);
    deck.rate = safeRate;
    if (deck.isPlaying) deck.startTime = this.ctx.currentTime - pos / safeRate;
    for (const stem of AudioEngineService.STEM_ORDER) {
      const source = deck.sources[stem];
      if (source) {
        if (smooth) source.playbackRate.setTargetAtTime(safeRate, this.ctx.currentTime, 0.01);
        else source.playbackRate.setValueAtTime(safeRate, this.ctx.currentTime);
      }
    }
  }

  setDeckLoop(id: DeckId, state: boolean) {
    const deck = this.getDeck(id);
    deck.loopEnabled = state;
    for (const stem of AudioEngineService.STEM_ORDER) {
      if (deck.sources[stem]) deck.sources[stem]!.loop = state;
    }
  }

  setSlipMode(id: DeckId, state: boolean) {
    const deck = this.getDeck(id);
    deck.slipEnabled = state;
    if (!state) deck.slipActive = false;
  }

  setDeckStemGain(id: DeckId, stem: keyof Stems, gain: number) {
    this.getDeck(id).gains[stem].gain.setTargetAtTime(this.clamp(gain, 0, 2), this.ctx.currentTime, 0.01);
  }

  setHotCue(id: DeckId, slot: number) { this.getDeck(id).hotCues[slot] = this.getDeckPosition(this.getDeck(id)); }
  clearHotCue(id: DeckId, slot: number) { this.getDeck(id).hotCues[slot] = null; }
  jumpToHotCue(id: DeckId, slot: number) { const cue = this.getDeck(id).hotCues[slot]; if (cue !== null) this.seekDeck(id, cue); }

  setDeckEq(id: DeckId, high: number, mid: number, low: number) {
    const deck = this.getDeck(id);
    deck.eqHigh.gain.setTargetAtTime(this.eqValueToDb(high), this.ctx.currentTime, 0.01);
    deck.eqMid.gain.setTargetAtTime(this.eqValueToDb(mid), this.ctx.currentTime, 0.01);
    deck.eqLow.gain.setTargetAtTime(this.eqValueToDb(low), this.ctx.currentTime, 0.01);
  }

  setDeckFilter(id: DeckId, freq: number) {
    this.getDeck(id).filter.frequency.setTargetAtTime(this.clamp(freq, 20, 20000), this.ctx.currentTime, 0.01);
  }

  setDeckSend(id: DeckId, send: 'A' | 'B', gain: number) {
    const target = send === 'A' ? this.getDeck(id).sendA : this.getDeck(id).sendB;
    target.gain.setTargetAtTime(this.clamp(gain, 0, 1), this.ctx.currentTime, 0.01);
  }

  applyProductionParameter(trackId: string, parameter: string, value: number, duration = 0.01, scheduledTime?: number) {
    if (trackId === '0' && parameter === 'tempo') { this.tempo.set(value); return; }
    if (!AudioEngineService.INTEGER_TRACK_ID_PATTERN.test(trackId)) return;
    const id = Number(trackId);
    this.updateTrack(id, { [parameter]: value });
    if (parameter === 'gain') this.getTrackOutput(id).gain.setTargetAtTime(value, scheduledTime ?? this.ctx.currentTime, duration);
  }

  private applyDeckOutputGain(deck: DeckChannel) { deck.gain.gain.setTargetAtTime(deck.channelGain * deck.crossfadeGain, this.ctx.currentTime, 0.01); }

  private getDeckPosition(deck: DeckChannel) {
    const duration = deck.buffer?.duration || 0;
    if (!deck.isPlaying) return this.clamp(deck.pauseOffset, 0, duration || deck.pauseOffset);
    const elapsed = (this.ctx.currentTime - deck.startTime) * deck.rate;
    if (deck.loopEnabled && duration > 0) return ((deck.pauseOffset + elapsed) % duration + duration) % duration;
    return this.clamp(deck.pauseOffset + elapsed, 0, duration || elapsed);
  }

  private getSlipPosition(deck: DeckChannel) {
    const duration = deck.buffer?.duration || 0;
    const elapsed = (this.ctx.currentTime - deck.slipStartTime) * deck.rate;
    if (deck.loopEnabled && duration > 0) return ((deck.slipStartOffset + elapsed) % duration + duration) % duration;
    return this.clamp(deck.slipStartOffset + elapsed, 0, duration || elapsed);
  }

  private startDeckSources(deck: DeckChannel, offset: number) {
    for (const stem of AudioEngineService.STEM_ORDER) {
      const buf = deck.stems?.[stem] ?? (stem === 'instrumental' ? deck.buffer : null);
      if (!buf) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.loop = deck.loopEnabled; src.playbackRate.value = deck.rate;
      src.connect(deck.gains[stem]); src.start(0, offset); deck.sources[stem] = src;
    }
  }

  private stopDeckSources(deck: DeckChannel) {
    for (const stem of AudioEngineService.STEM_ORDER) {
      const src = deck.sources[stem];
      if (src) { try { src.stop(); } catch {} src.disconnect(); deck.sources[stem] = null; }
    }
  }

  private restartDeckPlayback(deck: DeckChannel, offset: number) { this.stopDeckSources(deck); deck.pauseOffset = offset; deck.startTime = this.ctx.currentTime - offset / deck.rate; this.startDeckSources(deck, offset); }

  private clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)); }
  private eqValueToDb(v: number) { return (this.clamp(v, 0, 2) - 1) * 18; }

  setDeckCue(id: DeckId, active: boolean) { this.getDeck(id).isCueing = active; this.getDeck(id).cueGain.gain.setTargetAtTime(active ? 1 : 0, this.ctx.currentTime, 0.05); }
  setHeadphoneGain(val: number) { this.headphoneGain.set(val); this.cueMaster.gain.setTargetAtTime(val, this.ctx.currentTime, 0.05); }

  async detectBpm(id: DeckId): Promise<number> { this.getDeck(id).detectedBpm = 124; return 124; }
  scratch(id: DeckId, delta: number) { const deck = this.getDeck(id); if (!deck.buffer) return; this.setDeckRate(id, delta * 25, false); this.seekDeck(id, this.getDeckPosition(deck) + delta); }

  setAdvancedFX(id: DeckId, type: 'flanger' | 'phaser' | 'delay', value: number) {
    const deck = this.getDeck(id); const now = this.ctx.currentTime;
    if (type === 'flanger') { deck.flangerNode.frequency.setTargetAtTime(500 + value * 5000, now, 0.1); deck.flangerNode.Q.setTargetAtTime(value * 10, now, 0.1); }
    else if (type === 'phaser') { deck.phaserNode.frequency.setTargetAtTime(200 + value * 3000, now, 0.1); deck.phaserNode.Q.setTargetAtTime(value * 20, now, 0.1); }
    else if (type === 'delay') { deck.pingPongDelay.delayTime.setTargetAtTime(0.1 + value * 0.9, now, 0.1); deck.pingPongFeedback.gain.setTargetAtTime(value * 0.8, now, 0.1); }
  }

  syncDecks(masterId: DeckId, slaveId: DeckId) {
    const m = this.getDeck(masterId); const s = this.getDeck(slaveId);
    if (m.detectedBpm && s.detectedBpm) this.setDeckRate(slaveId, m.detectedBpm / s.detectedBpm);
  }

  async setOutputDevice(deviceId: string) { if (typeof (this.ctx as any).setSinkId === 'function') await (this.ctx as any).setSinkId(deviceId); }
  public setSaturation(amount: number) { this.setupSaturation(amount); }
  private setupSaturation(amount: number) {
    const k = amount * 100, n = 256, curve = new Float32Array(n), deg = Math.PI / 180;
    for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x)); }
    this.saturationNode.curve = curve;
  }
  setMasterOutputLevel(normalized: number) { this.masterGain.gain.setTargetAtTime(normalized, this.ctx.currentTime, 0.01); }
  getAnalyser() { return this.masterGain; }
  setOutputMode(mode: 'speakers' | 'headphones') { this.outputMode.set(mode); }

  triggerAttack(trackId: number, freq: number, when: number, velocity: number, duration: number, gain: number, pan: number, sendA: number, sendB: number, synthParams: any, velocityScale: number = 1, customCtx?: BaseAudioContext) {
    const ctx = customCtx || this.ctx; this.resume();
    const osc = ctx.createOscillator(), vca = ctx.createGain(), panner = ctx.createStereoPanner(), filter = ctx.createBiquadFilter();
    osc.type = synthParams.type || 'sine'; osc.frequency.setValueAtTime(freq, when);
    filter.type = 'lowpass'; filter.frequency.setValueAtTime(synthParams.cutoff || 20000, when); filter.Q.setValueAtTime(synthParams.q || 1, when);
    const actualVel = velocity * velocityScale, attack = synthParams.attack || 0.005, release = synthParams.release || 0.1;
    vca.gain.setValueAtTime(0, when); vca.gain.linearRampToValueAtTime(actualVel * gain, when + attack); vca.gain.setValueAtTime(actualVel * gain, when + duration); vca.gain.exponentialRampToValueAtTime(0.001, when + duration + release);
    panner.pan.setValueAtTime(pan, when);
    const dest = customCtx ? (customCtx as any).destination : this.masterGain;
    osc.connect(filter).connect(vca).connect(panner).connect(dest);
    osc.start(when); osc.stop(when + duration + release + 0.1);
  }

  brakeDeck(id: DeckId) { this.setDeckRate(id, 0.001, false); setTimeout(() => this.stopDeck(id), 500); }
  spinbackDeck(id: DeckId) { this.setDeckRate(id, -2, false); setTimeout(() => this.stopDeck(id), 500); }
  transformDeck(id: DeckId) { const deck = this.getDeck(id); const now = this.ctx.currentTime; for (let i = 0; i < 8; i++) { deck.gain.gain.setValueAtTime(0, now + i * 0.1); deck.gain.gain.setValueAtTime(1, now + i * 0.1 + 0.05); } }
  getDeckLevel(id: DeckId): number { const deck = this.getDeck(id); const values = new Uint8Array(deck.analyser.frequencyBinCount); deck.analyser.getByteTimeDomainData(values); let sum = 0; for (const v of values) { const c = (v - 128) / 128; sum += c * c; } return Math.min(1, Math.sqrt(sum / values.length) * 2.5); }
  getDeckWaveformData(id: DeckId): Float32Array { const deck = this.getDeck(id); if (!deck.buffer) return new Float32Array(0); const chan = deck.buffer.getChannelData(0); const bucks = 256, seg = Math.max(1, Math.floor(chan.length / bucks)), wf = new Float32Array(bucks); for (let i = 0; i < bucks; i++) { const start = i * seg, end = Math.min(chan.length, start + seg); let peak = 0; for (let j = start; j < end; j++) peak = Math.max(peak, Math.abs(chan[j])); wf[i] = peak; } return wf; }
  private stopDeck(id: DeckId) { this.pauseDeck(id); this.setDeckRate(id, 1); }

  configureLimiter(config: any) {
    if (config.ceiling !== undefined) this.limiter.threshold.setTargetAtTime(config.ceiling, this.ctx.currentTime, 0.01);
    if (config.release !== undefined) this.limiter.release.setTargetAtTime(config.release, this.ctx.currentTime, 0.01);
    if (config.threshold !== undefined) this.limiter.threshold.setValueAtTime(config.threshold, this.ctx.currentTime);
    if (config.ratio !== undefined) this.limiter.ratio.setValueAtTime(config.ratio, this.ctx.currentTime);
    if (config.attack !== undefined) this.limiter.attack.setValueAtTime(config.attack, this.ctx.currentTime);
  }
}
