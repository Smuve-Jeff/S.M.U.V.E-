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

  public logger = inject(LoggingService);
  private injector = inject(Injector);
  private stemSeparationService = inject(StemSeparationService);

  public get recorder(): StudioRecordingEngineService {
    return this.injector.get(StudioRecordingEngineService);
  }

  public masterGain = this.ctx.createGain();
  public compressor = this.ctx.createDynamicsCompressor();
  public saturationNode = this.ctx.createWaveShaper();
  public limiter = this.ctx.createDynamicsCompressor();
  public masterAnalyser = this.ctx.createAnalyser();
  public masterEQ = this.ctx.createBiquadFilter();
  public masterShelf = this.ctx.createBiquadFilter();
  public masterWidener = this.ctx.createStereoPanner();
  private reverbConvolver = this.ctx.createConvolver();
  public reverbWet = this.ctx.createGain();

  public readonly sendAReturn = this.ctx.createGain();
  public readonly sendBReturn = this.ctx.createGain();
  private trackSendAGains = new Map<string, GainNode>();
  private trackSendBGains = new Map<string, GainNode>();
  private trackOutputs = new Map<string, GainNode>();

  public tempo = signal(124.0);
  public isPlaying = signal(false);
  public isRecording = signal(false);
  public isCountIn = signal(false);
  public outputMode = signal<'speakers' | 'headphones'>('speakers');
  public performanceTier = signal<'ultra' | 'performance'>('ultra');
  public sidechainEnabled = signal(false);
  public scaleMode = signal("major");
  public scaleLock = signal(false);
  public metronomeEnabled = signal(false);
  public metronomeVolume = signal(0.5);

  public loopLengthSteps = signal(64);
  public currentBeat = signal(0);
  public visualStep = signal(0);
  private nextNoteTime = 0;
  private schedulerHandle: any = null;
  private currentStep = 0;
  private countInRemainingSteps = 0;
  public onScheduleStep?: (step: number, time: number, duration: number) => void;
  public onCountInComplete?: () => void;

  private sidechainMatrix = new Map<string, Set<string>>();
  private deckA!: DeckChannel;
  private deckB!: DeckChannel;
  private crossfaderValue = 0.5;
  private crossfaderHamster = false;
  private recordingDestination: MediaStreamAudioDestinationNode | null = null;
  private tracksMap = new Map<string, any>();
  private masteringTargets = { lufs: -14, truePeak: -0.1 };
  private midiAccess: any = null;
  private midiOutputs: any[] = [];
  public midiClockEnabled = signal(true);
  private djTracks = new Map<number, any>();

  constructor() {
    this.deckA = this.createDeck('A');
    this.deckB = this.createDeck('B');
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.saturationNode);
    this.saturationNode.connect(this.limiter);
    this.limiter.connect(this.masterEQ);
    this.masterEQ.connect(this.masterShelf);
    this.masterShelf.connect(this.masterWidener);
    this.masterWidener.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);
    this.reverbWet.connect(this.masterGain);
    this.sendAReturn.connect(this.masterGain);
    this.sendBReturn.connect(this.masterGain);
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

  resume() { if (this.ctx.state === 'suspended') this.ctx.resume(); }

  startCountIn() {
    this.resume();
    if (this.isPlaying()) return;
    this.isCountIn.set(true);
    this.isPlaying.set(true);
    this.countInRemainingSteps = this.stepsPerBeat() * 4;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.schedulerHandle = setInterval(() => this.scheduler(), AudioEngineService.DEFAULT_SCHEDULER_INTERVAL_MS);
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
    if (this.schedulerHandle) { clearInterval(this.schedulerHandle); this.schedulerHandle = null; }
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
  private updateMidiOutputs() { if (this.midiAccess) this.midiOutputs = Array.from(this.midiAccess.outputs.values()); }
  private sendMidiToAll(data: number[]) { this.midiOutputs.forEach(out => out.send(data)); }
  private sendMidiStart() { this.sendMidiToAll([0xFA]); }
  private sendMidiStop() { this.sendMidiToAll([0xFC]); }

  private scheduler() {
    const stepDuration = 60 / this.tempo() / this.stepsPerBeat();
    while (this.nextNoteTime < this.ctx.currentTime + AudioEngineService.DEFAULT_LOOKAHEAD_SECONDS) {
      const step = this.currentStep;
      if (this.isCountIn()) {
        if (step % this.stepsPerBeat() === 0) { this.playMetronomeClick(this.nextNoteTime, step === 0, true); }
        this.nextNoteTime += stepDuration;
        this.currentStep++;
        this.countInRemainingSteps--;
        if (this.countInRemainingSteps <= 0) {
          this.isCountIn.set(false);
          this.currentStep = 0;
          this.onCountInComplete?.();
        }
        continue;
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

  private playMetronomeClick(time: number, isDownbeat: boolean, force: boolean = false) {
    if (!this.metronomeEnabled() && !force) return;
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

  private createDeck(id: DeckId): DeckChannel {
    const gains: any = {};
    ['drums', 'bass', 'other', 'vocals'].forEach((s) => { gains[s] = this.ctx.createGain(); gains[s].gain.value = 1; });
    const deck: DeckChannel = {
      id, buffer: null, sources: {}, gains,
      eqLow: this.ctx.createBiquadFilter(), eqMid: this.ctx.createBiquadFilter(), eqHigh: this.ctx.createBiquadFilter(),
      filter: this.ctx.createBiquadFilter(), pan: this.ctx.createStereoPanner(), gain: this.ctx.createGain(),
      sendA: this.ctx.createGain(), sendB: this.ctx.createGain(), analyser: this.ctx.createAnalyser(),
      isPlaying: false, startTime: 0, pauseOffset: 0, rate: 1.0, stems: null, loopEnabled: false,
      slipEnabled: false, slipActive: false, slipStartTime: 0, slipStartOffset: 0, hotCues: new Array(8).fill(null),
    };
    deck.eqLow.type = 'lowshelf'; deck.eqLow.frequency.value = 250;
    deck.eqMid.type = 'peaking'; deck.eqMid.frequency.value = 1000;
    deck.eqHigh.type = 'highshelf'; deck.eqHigh.frequency.value = 4000;
    deck.filter.type = 'lowpass'; deck.filter.frequency.value = 20000;
    return deck;
  }

  getDeck(id: DeckId) { return id === 'A' ? this.deckA : this.deckB; }
  stopDeck(id: DeckId) { const deck = this.getDeck(id); if (!deck) return; deck.isPlaying = false; Object.values(deck.sources).forEach(s => { if(s) { try { s.stop(); } catch(e) {} } }); deck.sources = {}; }
  playDeck(id: DeckId) { const deck = this.getDeck(id); if (deck) deck.isPlaying = true; }
  pauseDeck(id: DeckId) { const deck = this.getDeck(id); if (deck) deck.isPlaying = false; }
  seekDeck(id: DeckId, pos: number) { /* seek logic */ }
  getDeckProgress(id: DeckId) { return { position: 0, duration: 0, isPlaying: false, slipPosition: 0 }; }
  getDeckLevel(id: DeckId) { return 0.5; }
  getDeckWaveformData(id: DeckId) { return new Float32Array(0); }
  setDeckGain(id: DeckId, val: number) { const deck = this.getDeck(id); if (deck) deck.gain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.01); }
  setDeckRate(id: DeckId, rate: number, sync: boolean = false) { const deck = this.getDeck(id); if (deck) deck.rate = rate; }
  setDeckLoop(id: DeckId, enabled: boolean) { const deck = this.getDeck(id); if (deck) deck.loopEnabled = enabled; }
  setSlipMode(id: DeckId, enabled: boolean) { const deck = this.getDeck(id); if (deck) { deck.slipEnabled = enabled; if (!enabled) deck.slipActive = false; } }
  setDeckStemGain(id: DeckId, stem: string, gain: number) { const deck = this.getDeck(id); if (deck && (deck.gains as any)[stem]) { (deck.gains as any)[stem].gain.setTargetAtTime(gain, this.ctx.currentTime, 0.01); } }
  setDeckCue(id: DeckId, active: boolean) { /* cue logic */ }
  loadDeck(id: DeckId, buffer: AudioBuffer) { /* load logic */ }
  setHotCue(id: DeckId, slot: number) { /* hotcue logic */ }
  clearHotCue(id: DeckId, slot: number) { /* hotcue logic */ }
  jumpToHotCue(id: DeckId, slot: number) { /* hotcue logic */ }
  setDeckEq(id: DeckId, high: number, mid: number, low: number) { /* eq logic */ }
  setDeckFilter(id: DeckId, freq: number) { /* filter logic */ }
  setDeckSend(id: DeckId, send: 'A'|'B', gain: number) { /* send logic */ }
  scratch(id: DeckId, delta: number) { /* scratch logic */ }
  brakeDeck(id: DeckId) { /* brake logic */ }
  spinbackDeck(id: DeckId) { /* spinback logic */ }
  transformDeck(id: DeckId) { /* transform logic */ }

  setCrossfader(val: number, curve: string = 'linear', hamster: boolean = false) {
    this.crossfaderValue = val; this.crossfaderHamster = hamster;
    let actualVal = hamster ? 1 - val : val;
    const left = Math.cos(actualVal * 0.5 * Math.PI);
    const right = Math.sin(actualVal * 0.5 * Math.PI);
    if (this.deckA) this.deckA.gain.gain.setTargetAtTime(left, this.ctx.currentTime, 0.01);
    if (this.deckB) this.deckB.gain.gain.setTargetAtTime(right, this.ctx.currentTime, 0.01);
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
    osc.connect(panner); panner.connect(vca);
    vca.connect(this.getTrackOutput(trackId.toString()));
    osc.start(time); osc.stop(time + duration + (params.release || 0.1) + 0.1);
  }

  triggerSampler(trackId: string | number, buffer: AudioBuffer, time: number, velocity: number, pan: number, duration: number, playbackRate: number = 1, fadeIn: number = 0, fadeOut: number = 0) {
    if (duration <= 0) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(playbackRate, time);
    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(pan, time);
    const gain = this.ctx.createGain();
    const minLevel = 0.0001;
    gain.gain.setValueAtTime(minLevel, time);

    const fadeInEnd = time + Math.min(fadeIn, duration * 0.5);
    if (fadeIn > 0) {
      gain.gain.linearRampToValueAtTime(velocity, fadeInEnd);
    } else {
      gain.gain.setValueAtTime(velocity, time);
    }

    const fadeOutStart = time + duration - Math.min(fadeOut, duration * 0.5);
    if (fadeOut > 0 && fadeOutStart > fadeInEnd) {
      gain.gain.setValueAtTime(velocity, fadeOutStart);
      gain.gain.linearRampToValueAtTime(minLevel, time + duration);
    } else {
      gain.gain.setTargetAtTime(minLevel, time + duration, 0.01);
    }

    source.connect(panner); panner.connect(gain);
    gain.connect(this.getTrackOutput(trackId.toString()));
    source.start(time);
    source.stop(time + duration);
  }

  getTrackOutput(id: string): GainNode {
    if (!this.trackOutputs.has(id)) {
      const g = this.ctx.createGain();
      g.connect(this.masterGain);
      this.trackOutputs.set(id, g);
      const sA = this.ctx.createGain(); sA.gain.value = 0; g.connect(sA); sA.connect(this.sendAReturn); this.trackSendAGains.set(id, sA);
      const sB = this.ctx.createGain(); sB.gain.value = 0; g.connect(sB); sB.connect(this.sendBReturn); this.trackSendBGains.set(id, sB);
    }
    return this.trackOutputs.get(id)!;
  }

  updateTrack(id: string | number, patch: any) {
    const idStr = id.toString();
    const output = this.getTrackOutput(idStr);
    if (patch.gain !== undefined) output.gain.setTargetAtTime(patch.gain, this.ctx.currentTime, 0.05);
    if (patch.sendA !== undefined) this.trackSendAGains.get(idStr)?.gain.setTargetAtTime(patch.sendA, this.ctx.currentTime, 0.05);
    if (patch.sendB !== undefined) this.trackSendBGains.get(idStr)?.gain.setTargetAtTime(patch.sendB, this.ctx.currentTime, 0.05);
    this.tracksMap.set(idStr, { ...(this.tracksMap.get(idStr) || {}), ...patch });
  }

  applyProductionParameter(trackId: string, parameter: string, value: number, duration: number = 0.01) {
    if (trackId === '0' && parameter === 'tempo') { this.tempo.set(value); return; }
    this.updateTrack(trackId, { [parameter]: value });
  }

  setMasterOutputLevel(val: number) { this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.05); }
  toggleMetronome() { this.metronomeEnabled.update(v => !v); return this.metronomeEnabled(); }
  setMetronomeVolume(val: number) { this.metronomeVolume.set(val); }
  setSoftClip(amount: number) {
    const k = amount * 100, n = 256, curve = new Float32Array(n), deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    this.saturationNode.curve = amount === 0 ? null : curve;
  }
  setSaturation(val: number) { this.setSoftClip(val); }
  getContext() { return this.ctx; }
  getMasterAnalyser() { return this.masterAnalyser; }
  getAnalyser() { return this.masterAnalyser; }
  ensureTrack(data: any) { if (!this.trackOutputs.has(data.id.toString())) this.updateTrack(data.id, data); }
  playSynth(time: number, freq: number, duration: number, velocity: number, pan: number, params: any) { this.triggerAttack('0', freq, time, velocity, duration, 1.0, pan, 0, 0, params); }
  updateAdaptivePerformance(load: number) { this.performanceTier.set(load > 70 ? 'performance' : 'ultra'); }
  connectSidechain(t: string, g: string) {}
  disconnectSidechain(t: string, g: string) {}
  getSidechainRouting() { return []; }
  calculatePlaybackRate(bpm: number) { return this.tempo() / bpm; }
  getMasteringTargets() { return { lufs: -14, truePeak: -0.1 }; }
  configureCompressor(p: any) {}
  configureLimiter(p: any) {}
  syncDecks(m: DeckId, s: DeckId) {}
  setOutputMode(mode: 'speakers' | 'headphones') { this.outputMode.set(mode); }
  setAdvancedFX(id: DeckId, type: string, amount: number) { /* fx logic */ }
  getMasterStream(): MediaStreamAudioDestinationNode {
    if (!this.recordingDestination) {
      this.recordingDestination = this.ctx.createMediaStreamDestination();
      this.limiter.connect(this.recordingDestination);
    }
    return this.recordingDestination;
  }
}