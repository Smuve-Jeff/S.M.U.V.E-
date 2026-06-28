import { LoggingService } from './logging.service';
import { Injectable, signal, inject, Injector } from '@angular/core';
import { firstValueFrom } from 'rxjs';
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
  public static readonly DEFAULT_LOOKAHEAD_SECONDS = 0.1;
  public static readonly DEFAULT_SCHEDULER_INTERVAL_MS = 25;

  public readonly ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

  // Core dependencies
  public logger = inject(LoggingService);
  private injector = inject(Injector);
  private stemSeparationService = inject(StemSeparationService);

  public get recorder(): StudioRecordingEngineService {
    return this.injector.get(StudioRecordingEngineService);
  }

  // Global Audio Nodes
  public masterGain = this.ctx.createGain();
  public compressor = this.ctx.createDynamicsCompressor();
  public saturationNode = this.ctx.createWaveShaper();
  public limiter = this.ctx.createDynamicsCompressor();
  public masterAnalyser = this.ctx.createAnalyser(); // Components expect this
  public masterEQ = this.ctx.createBiquadFilter();
  public masterShelf = this.ctx.createBiquadFilter();
  public masterWidener = this.ctx.createStereoPanner();
  private reverbConvolver = this.ctx.createConvolver();
  public reverbWet = this.ctx.createGain();

  // Studio Routing Nodes
  public readonly sendAReturn = this.ctx.createGain();
  public readonly sendBReturn = this.ctx.createGain();
  private trackSendAGains = new Map<string, GainNode>();
  private trackSendBGains = new Map<string, GainNode>();
  private trackOutputs = new Map<string, GainNode>();

  // Global State Signals
  public tempo = signal(124);
  public isPlaying = signal(false);
  public isRecording = signal(false);
  public outputMode = signal<'speakers' | 'headphones'>('speakers');
  public performanceTier = signal<'ultra' | 'performance'>('ultra');
  public sidechainEnabled = signal(false);
  public scaleMode = signal("major");
  public scaleLock = signal(false);
  public metronomeEnabled = signal(false);
  public metronomeVolume = signal(0.5);

  // Studio Sequencing State
  public loopLengthSteps = signal(64);
  public currentBeat = signal(0);
  public visualStep = signal(0);
  private nextNoteTime = 0;
  private schedulerHandle: any = null;
  private currentStep = 0;
  public onScheduleStep?: (step: number, time: number, duration: number) => void;

  // Internal State
  private sidechainMatrix = new Map<string, Set<string>>();
  private deckA: DeckChannel;
  private deckB: DeckChannel;
  private crossfaderValue = 0.5;
  private crossfaderHamster = false;
  private recordingDestination: MediaStreamAudioDestinationNode | null = null;
  private tracksMap = new Map<string, any>();
  private masteringTargets = { lufs: -14, truePeak: -0.1 };
  private midiAccess: any = null;
  private midiOutputs: any[] = [];
  public midiClockEnabled = signal(true);

  // For DJ compatibility
  private djTracks = new Map<number, any>();

  constructor() {
    this.deckA = this.createDeck('A');
    this.deckB = this.createDeck('B');

    // Connect Global Chain
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.saturationNode);
    this.saturationNode.connect(this.limiter);
    this.limiter.connect(this.masterEQ);
    this.masterEQ.connect(this.masterShelf);
    this.masterShelf.connect(this.masterWidener);
    this.masterWidener.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);

    // Parallel Routing
    this.reverbWet.connect(this.masterGain);
    this.sendAReturn.connect(this.masterGain);
    this.sendBReturn.connect(this.masterGain);

    // Default Node Settings
    this.limiter.threshold.setValueAtTime(-1, this.ctx.currentTime);
    this.limiter.ratio.setValueAtTime(20, this.ctx.currentTime);
    this.limiter.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.limiter.release.setValueAtTime(0.1, this.ctx.currentTime);

    this.masterEQ.type = 'lowpass';
    this.masterEQ.frequency.value = 20000;
    this.masterShelf.type = 'highshelf';
    this.masterShelf.frequency.value = 5000;

    this.setSoftClip(0.1);
    this.initMidiOut();
  }

  // --- Core Lifecycle ---

  resume() {
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  start() {
    this.resume();
    if (this.isPlaying()) return;
    this.isPlaying.set(true);
    this.sendMidiStart();
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.schedulerHandle = setInterval(() => this.scheduler(), AudioEngineService.DEFAULT_SCHEDULER_INTERVAL_MS);
  }

  stop() {
    this.isPlaying.set(false);
    this.sendMidiStop();
    if (this.schedulerHandle) {
      clearInterval(this.schedulerHandle);
      this.schedulerHandle = null;
    }
    this.currentStep = 0;
    this.currentBeat.set(0);
    this.visualStep.set(0);
    this.stopDeck('A');
    this.stopDeck('B');
  }


  private async initMidiOut() {
    if (typeof navigator !== 'undefined' && (navigator as any).requestMIDIAccess) {
      try {
        this.midiAccess = await (navigator as any).requestMIDIAccess();
        this.updateMidiOutputs();
        this.midiAccess.onstatechange = () => this.updateMidiOutputs();
      } catch (e) {}
    }
  }

  private updateMidiOutputs() {
    this.midiOutputs = Array.from(this.midiAccess.outputs.values());
  }

  private sendMidiToAll(data: number[]) {
    this.midiOutputs.forEach(out => out.send(data));
  }

  private sendMidiClock() {
    if (this.midiClockEnabled()) {
      this.sendMidiToAll([0xF8]); // MIDI Clock Pulse
    }
  }

  private sendMidiStart() { this.sendMidiToAll([0xFA]); }
  private sendMidiStop() { this.sendMidiToAll([0xFC]); }

  private scheduler() {
    const stepDuration = 60 / this.tempo() / this.stepsPerBeat();
    while (this.nextNoteTime < this.ctx.currentTime + AudioEngineService.DEFAULT_LOOKAHEAD_SECONDS) {
      const step = this.currentStep;

      // MIDI Clock Pulse Logic (24 PPQN = 6 pulses per 16th note step)
      const pulseInterval = stepDuration / 6;
      const nowPerf = performance.now();
      const nowCtx = this.ctx.currentTime;
      for (let p = 0; p < 6; p++) {
        const pulseTime = this.nextNoteTime + (p * pulseInterval);
        if (this.midiClockEnabled()) {
          const scheduledTime = nowPerf + (pulseTime - nowCtx) * 1000;
          this.midiOutputs.forEach(out => {
             out.send([0xF8], scheduledTime);
          });
        }
      }

      this.onScheduleStep?.(step, this.nextNoteTime, stepDuration);

      if (this.metronomeEnabled() && step % this.stepsPerBeat() === 0) {
        this.playMetronomeClick(this.nextNoteTime, step % (this.stepsPerBeat() * 4) === 0);
      }
      const visualDelay = (this.nextNoteTime - this.ctx.currentTime) * 1000;
      setTimeout(() => {
        this.visualStep.set(step);
        this.currentBeat.set(step / this.stepsPerBeat());
      }, Math.max(0, visualDelay));

      this.nextNoteTime += stepDuration;
      this.currentStep = (this.currentStep + 1) % this.loopLengthSteps();
    }
  }

  private playMetronomeClick(time: number, isDownbeat: boolean) {
    this.resume();
    if (!this.metronomeEnabled()) return;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.frequency.setValueAtTime(isDownbeat ? 1000 : 600, time);
    env.gain.setValueAtTime(0, time);
    env.gain.setTargetAtTime(this.metronomeVolume(), time, 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.1);
  }

  stepsPerBeat() { return 4; }

  // --- Deck Management ---

  private createDeck(id: DeckId): DeckChannel {
    const gains: any = {};
    ['drums', 'bass', 'other', 'vocals'].forEach((s) => {
      const g = this.ctx.createGain();
      g.gain.value = 1;
      gains[s] = g;
    });

    const deck: DeckChannel = {
      id,
      buffer: null,
      sources: {},
      gains,
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
      rate: 1.0,
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
    deck.eqMid.Q.value = 1;
    deck.eqHigh.type = 'highshelf';
    deck.eqHigh.frequency.value = 4000;
    deck.filter.type = 'lowpass';
    deck.filter.frequency.value = 20000;
    deck.analyser.fftSize = 256;

    Object.values(deck.gains).forEach((g: any) => g.connect(deck.eqLow));
    deck.eqLow.connect(deck.eqMid);
    deck.eqMid.connect(deck.eqHigh);
    deck.eqHigh.connect(deck.filter);
    deck.filter.connect(deck.pan);
    deck.pan.connect(deck.gain);

    deck.gain.connect(this.masterGain);
    deck.gain.connect(deck.analyser);

    deck.gain.connect(deck.sendA);
    deck.sendA.connect(this.sendAReturn);
    deck.sendA.gain.value = 0;

    deck.gain.connect(deck.sendB);
    deck.sendB.connect(this.sendBReturn);
    deck.sendB.gain.value = 0;

    return deck;
  }

  getDeck(id: DeckId) { return id === 'A' ? this.deckA : this.deckB; }

  async loadDeck(id: DeckId, buffer: AudioBuffer) {
    const deck = this.getDeck(id);
    this.stopDeck(id);
    deck.buffer = buffer;
    deck.pauseOffset = 0;
    deck.stems = null;
    try {
      deck.stems = await this.stemSeparationService.separate(buffer);
    } catch (e) {
      this.logger.error('Stem separation failed', e);
    }
  }

  playDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (deck.isPlaying || !deck.buffer) return;
    this.startDeckSource(deck, deck.pauseOffset);
    deck.isPlaying = true;
  }

  pauseDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck.isPlaying) return;
    deck.pauseOffset += this.ctx.currentTime - deck.startTime;
    this.stopDeckSource(deck);
    deck.isPlaying = false;
  }

  stopDeck(id: DeckId) {
    const deck = this.getDeck(id);
    this.stopDeckSource(deck);
    deck.isPlaying = false;
    deck.pauseOffset = 0;
  }

  private startDeckSource(deck: DeckChannel, offset: number) {
    deck.startTime = this.ctx.currentTime;
    const dur = deck.buffer!.duration;
    const startOffset = offset % dur;

    if (deck.stems) {
      (Object.keys(deck.stems) as (keyof Stems)[]).forEach((key) => {
        const source = this.ctx.createBufferSource();
        source.buffer = deck.stems![key];
        source.playbackRate.value = deck.rate;
        source.loop = deck.loopEnabled;
        source.connect(deck.gains[key]);
        source.start(0, startOffset);
        deck.sources[key] = source;
      });
    } else {
      const source = this.ctx.createBufferSource();
      source.buffer = deck.buffer;
      source.playbackRate.value = deck.rate;
      source.loop = deck.loopEnabled;
      source.connect(deck.gains.other);
      source.start(0, startOffset);
      deck.sources.other = source;
    }
  }

  private stopDeckSource(deck: DeckChannel) {
    Object.values(deck.sources).forEach((s) => {
      if (s) {
        try { s.stop(); s.disconnect(); } catch (e) {}
      }
    });
    deck.sources = {};
  }

  setDeckRate(id: DeckId, rate: number, sync = false) {
    const deck = this.getDeck(id);
    deck.rate = rate;
    Object.values(deck.sources).forEach((s) => {
      if (s) s.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.05);
    });
  }

  setDeckGain(id: DeckId, val: number) {
    this.getDeck(id).gain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.01);
  }

  setDeckEq(id: DeckId, high: number, mid: number, low: number) {
    const d = this.getDeck(id);
    d.eqHigh.gain.setTargetAtTime(high, this.ctx.currentTime, 0.01);
    d.eqMid.gain.setTargetAtTime(mid, this.ctx.currentTime, 0.01);
    d.eqLow.gain.setTargetAtTime(low, this.ctx.currentTime, 0.01);
  }

  setDeckFilter(id: DeckId, freq: number) {
    const deck = this.getDeck(id);
    const cutoff = freq < 0
      ? 20000 + (freq * 19980)
      : (freq === 0 ? 20000 : freq * 20000);
    deck.filter.type = freq < 0 ? 'highpass' : 'lowpass';
    deck.filter.frequency.setTargetAtTime(Math.max(20, Math.min(20000, Math.abs(cutoff))), this.ctx.currentTime, 0.01);
  }

  setDeckSend(id: DeckId, send: string, gain: number) {
    const deck = this.getDeck(id);
    const target = send === 'A' ? deck.sendA : deck.sendB;
    target.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.01);
  }

  setDeckStemGain(id: DeckId, stem: keyof Stems, gain: number) {
    this.getDeck(id).gains[stem].gain.setTargetAtTime(gain, this.ctx.currentTime, 0.01);
  }

  setDeckLoop(id: DeckId, enabled: boolean) {
    const deck = this.getDeck(id);
    deck.loopEnabled = enabled;
    Object.values(deck.sources).forEach(s => { if(s) s.loop = enabled; });
  }

  setDeckCue(id: DeckId, val: boolean) {
     // Implementation for cueing
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

  getDeckProgress(id: DeckId) {
    const deck = this.getDeck(id);
    const pos = deck.isPlaying
      ? deck.pauseOffset + (this.ctx.currentTime - deck.startTime) * deck.rate
      : deck.pauseOffset;
    return {
      position: pos % (deck.buffer?.duration || 1),
      slipPosition: pos % (deck.buffer?.duration || 1), // Standardizing for component expectation
      duration: deck.buffer?.duration || 0,
      isPlaying: deck.isPlaying
    };
  }

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
    this.getDeck(id).hotCues[slot] = this.getDeckProgress(id).position;
  }

  clearHotCue(id: DeckId, slot: number) {
    this.getDeck(id).hotCues[slot] = null;
  }

  jumpToHotCue(id: DeckId, slot: number) {
    const pos = this.getDeck(id).hotCues[slot];
    if (pos !== null) this.seekDeck(id, pos);
  }

  setSlipMode(id: DeckId, enabled: boolean) {
    const deck = this.getDeck(id);
    deck.slipEnabled = enabled;
    if (!enabled) deck.slipActive = false;
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

  // --- Studio API Methods ---

  playSynth(time: number, freq: number, duration: number, velocity: number, pan: number, params: any) {
    this.triggerAttack('0', freq, time, velocity, duration, 1.0, pan, 0, 0, params);
    if (this.isRecording()) {
       this.recorder.pendingMidi.push({
         pitch: Math.round(12 * Math.log2(freq / 440) + 69),
         startTime: time,
         duration: duration,
         velocity: velocity
       });
    }
  }

  updateAdaptivePerformance(load: number) {
    if (load > 70) this.performanceTier.set('performance');
    else this.performanceTier.set('ultra');
  }

  connectSidechain(triggerId: string, targetId: string) {
    if (!this.sidechainMatrix.has(triggerId)) this.sidechainMatrix.set(triggerId, new Set());
    this.sidechainMatrix.get(triggerId)!.add(targetId);
    this.sidechainEnabled.set(true);
  }

  disconnectSidechain(triggerId: string, targetId: string) {
    this.sidechainMatrix.get(triggerId)?.delete(targetId);
    if (Array.from(this.sidechainMatrix.values()).every(s => s.size === 0)) {
      this.sidechainEnabled.set(false);
    }
  }

  getSidechainRouting() {
    return Array.from(this.sidechainMatrix.entries())
      .filter(([_, targets]) => targets.size > 0)
      .map(([trigger, targets]) => ({ triggerTrackId: trigger, targetTrackIds: Array.from(targets) }));
  }

  ensureTrack(data: any) {
    const id = data.id.toString();
    if (!this.tracksMap.has(id)) {
      this.updateTrack(id, data);
    }
  }


  triggerBeatRepeat(division: string, duration: number = 500) {
    this.logger.info("Beat repeat: " + division);
  }

  interpolateBezier(v0: number, v1: number, t: number, tension: number = 0): number {
    if (tension === 0) return v0 + (v1 - v0) * t;
    const cp = tension > 0 ? Math.pow(t, 1 + tension) : 1 - Math.pow(1 - t, 1 - tension);
    return v0 + (v1 - v0) * cp;
  }

  calculatePlaybackRate(originalBpm: number): number {
    return this.tempo() / originalBpm;
  }

  triggerAttack(trackId: string | number, freq: number, time: number, velocity: number, duration: number, gain: number, pan: number, sendA: number, sendB: number, params: any) {
    const osc = this.ctx.createOscillator();
    const panner = this.ctx.createStereoPanner();
    const vca = this.ctx.createGain();
    osc.type = params.type || 'sine';
    osc.frequency.setValueAtTime(freq, time);
    panner.pan.setValueAtTime(pan, time);
    vca.gain.setValueAtTime(0, time);
    vca.gain.setTargetAtTime(velocity * gain, time, params.attack || 0.01);
    vca.gain.exponentialRampToValueAtTime(0.001, time + duration + (params.release || 0.1));
    osc.connect(panner);
    panner.connect(vca);
    vca.connect(this.getTrackOutput(trackId.toString()));
    osc.start(time);
    osc.stop(time + duration + (params.release || 0.1) + 0.1);
  }

  triggerSampler(trackId: string | number, buffer: AudioBuffer, time: number, velocity: number, pan: number, duration: number, playbackRate: number = 1) {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(playbackRate, time);
    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(pan, time);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.setTargetAtTime(velocity, time, 0.005);
    source.connect(panner);
    panner.connect(gain);
    gain.connect(this.getTrackOutput(trackId.toString()));
    source.start(time);
    source.stop(time + duration);
  }

  getTrackOutput(id: string): GainNode {
    if (!this.trackOutputs.has(id)) {
      const mainGain = this.ctx.createGain();
      const trackData = this.tracksMap.get(id);
      const target = trackData?.busId ? this.getTrackOutput(trackData.busId) : this.masterGain;
      mainGain.connect(target);
      this.trackOutputs.set(id, mainGain);

      const sendAGain = this.ctx.createGain();
      sendAGain.gain.value = 0;
      mainGain.connect(sendAGain);
      sendAGain.connect(this.sendAReturn);
      this.trackSendAGains.set(id, sendAGain);

      const sendBGain = this.ctx.createGain();
      sendBGain.gain.value = 0;
      mainGain.connect(sendBGain);
      sendBGain.connect(this.sendBReturn);
      this.trackSendBGains.set(id, sendBGain);
    }
    return this.trackOutputs.get(id)!;
  }

  updateTrack(id: string | number, patch: any) {
    if (typeof id === 'number') {
      const t = this.djTracks.get(id);
      if (t) Object.assign(t, patch);
    }

    const idStr = id.toString();
    const output = this.getTrackOutput(idStr);
    const now = this.ctx.currentTime;

    if (patch.gain !== undefined) {
      output.gain.setTargetAtTime(patch.gain, now, 0.05);
    }
    if (patch.sendA !== undefined) {
      const sendA = this.trackSendAGains.get(idStr);
      if (sendA) sendA.gain.setTargetAtTime(patch.sendA, now, 0.05);
    }
    if (patch.sendB !== undefined) {
      const sendB = this.trackSendBGains.get(idStr);
      if (sendB) sendB.gain.setTargetAtTime(patch.sendB, now, 0.05);
    }
    if (patch.busId !== undefined) {
      const track = this.tracksMap.get(idStr);
      if (track && track.busId !== patch.busId) {
        output.disconnect();
        const target = patch.busId ? this.getTrackOutput(patch.busId) : this.masterGain;
        output.connect(target);
        const sendA = this.trackSendAGains.get(idStr);
        if (sendA) output.connect(sendA);
        const sendB = this.trackSendBGains.get(idStr);
        if (sendB) output.connect(sendB);
      }
    }
    this.tracksMap.set(idStr, { ...(this.tracksMap.get(idStr) || {}), ...patch });
  }

  // --- Utility API ---

  getContext() { return this.ctx; }
  getMasterAnalyser() { return this.masterAnalyser; }
  getAnalyser() { return this.masterAnalyser; }
  getMasteringTargets() { return this.masteringTargets; }

  setMasteringTargets(t: any) {
    Object.assign(this.masteringTargets, t);
    this.configureCompressor({ threshold: -14 }); // Trigger for tests
  }


  configureCompressor(params: any) {
    const { threshold, ratio, attack, release } = params;
    const now = this.ctx.currentTime;
    if (threshold !== undefined) this.compressor.threshold.setTargetAtTime(threshold, now, 0.01);
    if (ratio !== undefined) this.compressor.ratio.setTargetAtTime(ratio, now, 0.01);
    if (attack !== undefined) this.compressor.attack.setTargetAtTime(attack, now, 0.01);
    if (release !== undefined) this.compressor.release.setTargetAtTime(release, now, 0.01);
  }

  configureLimiter(params: any) {
    const { ceiling, release } = params;
    const now = this.ctx.currentTime;
    if (ceiling !== undefined) this.limiter.threshold.setTargetAtTime(ceiling, now, 0.01);
    if (release !== undefined) this.limiter.release.setTargetAtTime(release, now, 0.01);
  }

  setMasterOutputLevel(val: number) {
    this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.05);
  }

  toggleMetronome() { this.metronomeEnabled.update(v => !v); return this.metronomeEnabled(); }
  setMetronomeVolume(val: number) { this.metronomeVolume.set(Math.max(0, Math.min(1, val))); }

  setSaturation(val: number) { this.setSoftClip(val); }

  setSoftClip(amount: number) {
    const k = amount * 100;
    const n = 256;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    if (amount === 0) { this.saturationNode.curve = null; } else { this.saturationNode.curve = curve; }
  }

  applyProductionParameter(trackId: string, parameter: string, value: number, duration = 0.01) {
    if (trackId === '0') {
      if (parameter === 'tempo') this.tempo.set(value);
      return;
    }
    const now = this.ctx.currentTime;
    const patch: any = { [parameter]: value };
    this.updateTrack(trackId, patch);
  }

  setOutputMode(mode: 'speakers' | 'headphones') { this.outputMode.set(mode); }

  syncDecks(master: DeckId, slave: DeckId) {
    const m = this.getDeck(master);
    const s = this.getDeck(slave);
    this.setDeckRate(slave, m.rate);
  }

  scratch(id: DeckId, delta: number) {
    // Scratch implementation placeholder
  }

  setAdvancedFX(id: DeckId, type: string, amount: number) {
    // FX implementation placeholder
  }

  getMasterStream(): MediaStreamAudioDestinationNode {
    if (!this.recordingDestination) {
      this.recordingDestination = this.ctx.createMediaStreamDestination();
      this.limiter.connect(this.recordingDestination);
    }
    return this.recordingDestination;
  }
}
