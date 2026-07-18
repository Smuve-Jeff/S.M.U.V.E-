import { LoggingService } from './logging.service';
import { Injectable, signal, computed, inject, Injector } from '@angular/core';
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

  public readonly ctx = new (
    window.AudioContext || (window as any).webkitAudioContext
  )();

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
  public scaleMode = signal('major');
  public scaleLock = signal(false);
  public metronomeEnabled = signal(false);
  public metronomeVolume = signal(0.5);

  /**
   * Live AudioContext state — drives the 'ARM AUDIO' pip in the tobtap.
   * Updated both on resume() and on the ctx.onstatechange event so the
   * UI always knows whether audio is armed, suspended, or closed.
   */
  public contextState = signal<'suspended' | 'running' | 'closed'>('suspended');

  /** True after the user has performed ANY gesture in this session — used
   *  to suppress repeated pre-roll UI affordances. */
  public userGestureSeen = signal(false);

  public loopLengthSteps = signal(64);
  public currentBeat = signal(0);
  public visualStep = signal(0);
  private nextNoteTime = 0;
  private midiClockPulseCounter = 0;
  private lastMidiClockTime = 0;
  private schedulerHandle: any = null;
  private currentStep = 0;
  private countInRemainingSteps = 0;
  public onScheduleStep?: (
    step: number,
    time: number,
    duration: number
  ) => void;
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
    // Reflect AudioContext state changes into a signal so the UI can react.
    this.contextState.set(
      this.ctx.state === 'running'
        ? 'running'
        : this.ctx.state === 'closed'
          ? 'closed'
          : 'suspended'
    );
    // Modern browsers expose an "onstatechange" event on AudioContext.
    const ctxAny = this.ctx as any;
    if (typeof ctxAny.addEventListener === 'function') {
      ctxAny.addEventListener('statechange', () => {
        this.contextState.set(
          this.ctx.state === 'running'
            ? 'running'
            : this.ctx.state === 'closed'
              ? 'closed'
              : 'suspended'
          );
      });
    }
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
    this.startOutputMetering();
    this.autoAdjustEffect();
  }

  resume() {
    if (this.ctx.state === 'suspended') {
      this.ctx
        .resume()
        .then(() => {
          this.contextState.set('running');
        })
        .catch((e) => {
          this.logger.warn('AudioContext resume failed: ' + e?.message);
        });
    }
  }

  private armListenerInstalled = false;

  /**
   * Install a one-time listener that calls resume() on the user's first
   * click or keydown anywhere on the page. After the first gesture the
   * listeners remove themselves, so there's no leak.
   *
   * Idempotent — calling it twice is a no-op. Safe to call from any
   * component's ngOnInit without worrying about duplicates.
   */
  armOnFirstUserGesture(): void {
    if (this.armListenerInstalled) return;
    if (typeof window === 'undefined') return;
    this.armListenerInstalled = true;

    const handler = () => {
      this.userGestureSeen.set(true);
      this.resume();
      window.removeEventListener('pointerdown', handler, true);
      window.removeEventListener('keydown', handler, true);
      window.removeEventListener('touchstart', handler, true);
    };

    window.addEventListener('pointerdown', handler, true);
    window.addEventListener('keydown', handler, true);
    window.addEventListener('touchstart', handler, true);
  }

  startCountIn() {
    this.resume();
    if (this.isPlaying()) return;
    this.isCountIn.set(true);
    this.isPlaying.set(true);
    this.countInRemainingSteps = this.stepsPerBeat() * 4;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.schedulerHandle = setInterval(
      () => this.scheduler(),
      AudioEngineService.DEFAULT_SCHEDULER_INTERVAL_MS
    );
  }

  start() {
    this.resume();
    if (this.isPlaying()) return;
    this.isPlaying.set(true);
    this.sendMidiStart();
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.schedulerHandle = setInterval(
      () => this.scheduler(),
      AudioEngineService.DEFAULT_SCHEDULER_INTERVAL_MS
    );
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
    if (
      typeof navigator !== 'undefined' &&
      (navigator as any).requestMIDIAccess
    ) {
      try {
        this.midiAccess = await (navigator as any).requestMIDIAccess();
        this.updateMidiOutputs();
        this.midiAccess.onstatechange = () => this.updateMidiOutputs();
      } catch (e) {}
    }
  }
  private updateMidiOutputs() {
    if (this.midiAccess)
      this.midiOutputs = Array.from(this.midiAccess.outputs.values());
  }
  private sendMidiToAll(data: number[]) {
    this.midiOutputs.forEach((out) => out.send(data));
  }
  private sendMidiStart() {
    this.midiClockPulseCounter = 0;
    this.lastMidiClockTime = this.ctx.currentTime;
    this.sendMidiToAll([0xfa]);
  }
  private sendMidiStop() {
    this.sendMidiToAll([0xfc]);
  }
  sendMidiContinue() {
    this.sendMidiToAll([0xfb]);
  }
  sendMidiPositionPointer(bar: number, beat: number) {
    const position = bar * 16 + beat * 4;
    this.sendMidiToAll([0xF2, position & 0x7F, (position >> 7) & 0x7F]);
  }

  private scheduler() {
    const stepDuration = 60 / this.tempo() / this.stepsPerBeat();
    while (
      this.nextNoteTime <
      this.ctx.currentTime + AudioEngineService.DEFAULT_LOOKAHEAD_SECONDS
    ) {
      const step = this.currentStep;
      if (this.isCountIn()) {
        if (step % this.stepsPerBeat() === 0) {
          this.playMetronomeClick(this.nextNoteTime, step === 0, true);
        }
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
        this.playMetronomeClick(
          this.nextNoteTime,
          step % (this.stepsPerBeat() * 4) === 0
        );
      }
      const visualDelay = (this.nextNoteTime - this.ctx.currentTime) * 1000;
      setTimeout(
        () => {
          this.visualStep.set(step);
          this.currentBeat.set(step / this.stepsPerBeat());
        },
        Math.max(0, visualDelay)
      );
      // MIDI Clock: send 24 pulses per quarter note
      if (this.midiClockEnabled() && this.midiOutputs.length > 0) {
        const ppqn = 24;
        const quarterDuration = 60 / this.tempo();
        const pulseInterval = quarterDuration / ppqn;
        while (this.lastMidiClockTime < this.nextNoteTime) {
          if (this.lastMidiClockTime >= this.ctx.currentTime - 0.05) {
            const delay = (this.lastMidiClockTime - this.ctx.currentTime) * 1000;
            setTimeout(() => this.sendMidiToAll([0xF8]), Math.max(0, delay));
          } else {
            this.sendMidiToAll([0xF8]);
          }
          this.lastMidiClockTime += pulseInterval;
        }
      }

      this.nextNoteTime += stepDuration;
      this.currentStep = (this.currentStep + 1) % this.loopLengthSteps();
    }
  }

  private playMetronomeClick(
    time: number,
    isDownbeat: boolean,
    force: boolean = false
  ) {
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

  stepsPerBeat() {
    return 4;
  }

  private createDeck(id: DeckId): DeckChannel {
    const gains: any = {};
    ['drums', 'bass', 'other', 'vocals'].forEach((s) => {
      gains[s] = this.ctx.createGain();
      gains[s].gain.value = 1;
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
    deck.eqHigh.type = 'highshelf';
    deck.eqHigh.frequency.value = 4000;
    deck.filter.type = 'lowpass';
    deck.filter.frequency.value = 20000;
    return deck;
  }

  getDeck(id: DeckId) {
    return id === 'A' ? this.deckA : this.deckB;
  }
  stopDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck) return;
    deck.isPlaying = false;
    Object.values(deck.sources).forEach((s) => {
      if (s) {
        try {
          s.stop();
        } catch (e) {}
      }
    });
    deck.sources = {};
  }
  playDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (deck) deck.isPlaying = true;
  }
  pauseDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (deck) deck.isPlaying = false;
  }
  seekDeck(id: DeckId, pos: number) {
    const deck = this.getDeck(id);
    if (!deck || !deck.buffer) return;
    deck.pauseOffset = Math.max(0, Math.min(pos, deck.buffer.duration));
    if (deck.isPlaying) {
      this.stopDeck(id);
      this._playDeckInternal(id);
    }
  }

  getDeckProgress(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck || !deck.buffer) return { position: 0, duration: 0, isPlaying: false, slipPosition: 0 };
    let position = deck.pauseOffset;
    if (deck.isPlaying && deck.startTime > 0) {
      position = (this.ctx.currentTime - deck.startTime) * deck.rate;
      position = position % deck.buffer.duration;
    }
    let slipPosition = 0;
    if (deck.slipActive) {
      slipPosition = (this.ctx.currentTime - deck.slipStartTime) * deck.rate;
    }
    return { position, duration: deck.buffer.duration, isPlaying: deck.isPlaying, slipPosition };
  }

  getDeckLevel(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck) return 0;
    const dataArray = new Uint8Array(deck.analyser.frequencyBinCount);
    deck.analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
    return sum / (dataArray.length * 255);
  }

  getDeckWaveformData(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck) return new Float32Array(0);
    const bufferLength = deck.analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);
    deck.analyser.getFloatTimeDomainData(dataArray);
    return dataArray;
  }
  setDeckGain(id: DeckId, val: number) {
    const deck = this.getDeck(id);
    if (deck) deck.gain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.01);
  }
  setDeckRate(id: DeckId, rate: number, sync: boolean = false) {
    const deck = this.getDeck(id);
    if (deck) deck.rate = rate;
  }
  setDeckLoop(id: DeckId, enabled: boolean) {
    const deck = this.getDeck(id);
    if (deck) deck.loopEnabled = enabled;
  }
  setSlipMode(id: DeckId, enabled: boolean) {
    const deck = this.getDeck(id);
    if (deck) {
      deck.slipEnabled = enabled;
      if (!enabled) deck.slipActive = false;
    }
  }
  setDeckStemGain(id: DeckId, stem: string, gain: number) {
    const deck = this.getDeck(id);
    if (deck && (deck.gains as any)[stem]) {
      (deck.gains as any)[stem].gain.setTargetAtTime(
        gain,
        this.ctx.currentTime,
        0.01
      );
    }
  }
  setDeckCue(id: DeckId, active: boolean) {
    const deck = this.getDeck(id);
    if (!deck) return;
    if (active) {
      deck.pauseOffset = deck.isPlaying
        ? (this.ctx.currentTime - deck.startTime) * deck.rate
        : deck.pauseOffset;
      this.stopDeck(id);
    } else {
      this._playDeckInternal(id);
    }
  }

  loadDeck(id: DeckId, buffer: AudioBuffer) {
    const deck = this.getDeck(id);
    if (!deck) return;
    this.stopDeck(id);
    deck.buffer = buffer;
    deck.pauseOffset = 0;
    deck.startTime = 0;
    this.logger.info(`Deck ${id} loaded: ${(buffer.duration).toFixed(1)}s`);
  }

  setHotCue(id: DeckId, slot: number) {
    const deck = this.getDeck(id);
    if (!deck || slot < 0 || slot >= 8) return;
    const pos = deck.isPlaying
      ? (this.ctx.currentTime - deck.startTime) * deck.rate
      : deck.pauseOffset;
    deck.hotCues[slot] = pos;
  }

  clearHotCue(id: DeckId, slot: number) {
    const deck = this.getDeck(id);
    if (!deck || slot < 0 || slot >= 8) return;
    deck.hotCues[slot] = null;
  }

  jumpToHotCue(id: DeckId, slot: number) {
    const deck = this.getDeck(id);
    if (!deck || slot < 0 || slot >= 8) return;
    const pos = deck.hotCues[slot];
    if (pos === null) return;
    deck.pauseOffset = pos;
    if (deck.isPlaying) {
      this.stopDeck(id);
      this._playDeckInternal(id);
    }
  }

  setDeckEq(id: DeckId, high: number, mid: number, low: number) {
    const deck = this.getDeck(id);
    if (!deck) return;
    const now = this.ctx.currentTime;
    deck.eqHigh.gain.setTargetAtTime((high - 1) * 12, now, 0.02);
    deck.eqMid.gain.setTargetAtTime((mid - 1) * 12, now, 0.02);
    deck.eqLow.gain.setTargetAtTime((low - 1) * 12, now, 0.02);
  }

  setDeckFilter(id: DeckId, freq: number) {
    const deck = this.getDeck(id);
    if (!deck) return;
    deck.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.02);
  }

  setDeckSend(id: DeckId, send: 'A' | 'B', gain: number) {
    const deck = this.getDeck(id);
    if (!deck) return;
    const sendNode = send === 'A' ? deck.sendA : deck.sendB;
    sendNode.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.02);
  }

  scratch(id: DeckId, delta: number) {
    const deck = this.getDeck(id);
    if (!deck) return;
    const newRate = Math.max(0, Math.min(4, deck.rate + delta * 0.01));
    Object.values(deck.sources).forEach((s) => {
      if (s) s.playbackRate.setTargetAtTime(newRate, this.ctx.currentTime, 0.005);
    });
    deck.rate = newRate;
  }

  brakeDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck) return;
    const steps = 20;
    const duration = 0.8;
    for (let i = 0; i <= steps; i++) {
      const rate = Math.max(0, deck.rate * (1 - i / steps));
      const t = this.ctx.currentTime + (i / steps) * duration;
      Object.values(deck.sources).forEach((s) => {
        if (s) s.playbackRate.linearRampToValueAtTime(rate, t);
      });
    }
    deck.rate = 0;
  }

  spinbackDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck) return;
    const steps = 30;
    const duration = 1.2;
    for (let i = 0; i <= steps; i++) {
      const t = this.ctx.currentTime + (i / steps) * duration;
      const rate = deck.rate * (1 - (i / steps) * 2);
      Object.values(deck.sources).forEach((s) => {
        if (s) s.playbackRate.linearRampToValueAtTime(Math.max(-2, rate), t);
      });
    }
    deck.rate = -1;
  }

  transformDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck) return;
    const current = deck.gain.gain.value;
    deck.gain.gain.setTargetAtTime(current > 0.01 ? 0 : 1, this.ctx.currentTime, 0.005);
  }

  private _playDeckInternal(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck || !deck.buffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = deck.buffer;
    source.playbackRate.setValueAtTime(deck.rate, this.ctx.currentTime);
    source.connect(deck.eqLow);
    deck.eqLow.connect(deck.eqMid);
    deck.eqMid.connect(deck.eqHigh);
    deck.eqHigh.connect(deck.filter);
    deck.filter.connect(deck.pan);
    deck.pan.connect(deck.gain);
    deck.gain.connect(deck.analyser);
    deck.analyser.connect(this.masterGain);
    deck.sendA.connect(this.sendAReturn);
    deck.sendB.connect(this.sendBReturn);
    const offset = deck.pauseOffset || 0;
    source.start(0, offset);
    deck.startTime = this.ctx.currentTime - offset;
    deck.isPlaying = true;
    (deck.sources as any)['main'] = source;
  }

  setCrossfader(
    val: number,
    curve: string = 'linear',
    hamster: boolean = false
  ) {
    this.crossfaderValue = val;
    this.crossfaderHamster = hamster;
    const actualVal = hamster ? 1 - val : val;
    const left = Math.cos(actualVal * 0.5 * Math.PI);
    const right = Math.sin(actualVal * 0.5 * Math.PI);
    if (this.deckA)
      this.deckA.gain.gain.setTargetAtTime(left, this.ctx.currentTime, 0.01);
    if (this.deckB)
      this.deckB.gain.gain.setTargetAtTime(right, this.ctx.currentTime, 0.01);
  }

  triggerAttack(
    trackId: string | number,
    freq: number,
    time: number,
    velocity: number,
    duration: number,
    gain: number,
    pan: number,
    sendA: number,
    sendB: number,
    params: any
  ) {
    const osc = this.ctx.createOscillator();
    const panner = this.ctx.createStereoPanner();
    const vca = this.ctx.createGain();
    osc.type = params.type || 'sine';
    osc.frequency.setValueAtTime(freq, time);
    panner.pan.setValueAtTime(pan, time);
    vca.gain.setValueAtTime(0, time);
    vca.gain.setTargetAtTime(velocity * gain, time, params.attack || 0.01);
    vca.gain.exponentialRampToValueAtTime(
      0.001,
      time + duration + (params.release || 0.1)
    );
    osc.connect(panner);
    panner.connect(vca);
    vca.connect(this.getTrackOutput(trackId.toString()));
    osc.start(time);
    osc.stop(time + duration + (params.release || 0.1) + 0.1);
  }

  triggerSampler(
    trackId: string | number,
    buffer: AudioBuffer,
    time: number,
    velocity: number,
    pan: number,
    duration: number,
    playbackRate: number = 1
  ) {
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
      const g = this.ctx.createGain();
      g.connect(this.masterGain);
      this.trackOutputs.set(id, g);
      const sA = this.ctx.createGain();
      sA.gain.value = 0;
      g.connect(sA);
      sA.connect(this.sendAReturn);
      this.trackSendAGains.set(id, sA);
      const sB = this.ctx.createGain();
      sB.gain.value = 0;
      g.connect(sB);
      sB.connect(this.sendBReturn);
      this.trackSendBGains.set(id, sB);
    }
    return this.trackOutputs.get(id)!;
  }

  updateTrack(id: string | number, patch: any) {
    const idStr = id.toString();
    const output = this.getTrackOutput(idStr);
    if (patch.gain !== undefined)
      output.gain.setTargetAtTime(patch.gain, this.ctx.currentTime, 0.05);
    if (patch.sendA !== undefined)
      this.trackSendAGains
        .get(idStr)
        ?.gain.setTargetAtTime(patch.sendA, this.ctx.currentTime, 0.05);
    if (patch.sendB !== undefined)
      this.trackSendBGains
        .get(idStr)
        ?.gain.setTargetAtTime(patch.sendB, this.ctx.currentTime, 0.05);
    this.tracksMap.set(idStr, {
      ...(this.tracksMap.get(idStr) || {}),
      ...patch,
    });
  }

  applyProductionParameter(
    trackId: string,
    parameter: string,
    value: number,
    duration: number = 0.01
  ) {
    if (trackId === '0' && parameter === 'tempo') {
      this.tempo.set(value);
      return;
    }
    this.updateTrack(trackId, { [parameter]: value });
  }

  setMasterOutputLevel(val: number) {
    this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.05);
  }
  toggleMetronome() {
    this.metronomeEnabled.update((v) => !v);
    return this.metronomeEnabled();
  }
  setMetronomeVolume(val: number) {
    this.metronomeVolume.set(val);
  }
  setSoftClip(amount: number) {
    const k = amount * 100,
      n = 256,
      curve = new Float32Array(n),
      deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    this.saturationNode.curve = amount === 0 ? null : curve;
  }
  setSaturation(val: number) {
    this.setSoftClip(val);
  }
  getContext() {
    if (!this._outputDeviceMonitorInited) {
      this._outputDeviceMonitorInited = true;
      try {
        const ctxAny = this.ctx as any;
        this.supportsSinkId.set(typeof ctxAny.setSinkId === 'function');
      } catch {
        this.supportsSinkId.set(false);
      }
      this.refreshOutputDevices();
      if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
        try {
          navigator.mediaDevices.addEventListener('devicechange', () => {
            this.refreshOutputDevices();
          });
        } catch {
          // older browsers — no-op
        }
      }
    }
    return this.ctx;
  }

  // ============================================================
  //  Audio Output Device Routing
  //  ------------------------------------------------------------------------
  //  When an external audio interface / USB DAC / Bluetooth output is
  //  connected, we surface it as a switchable device. Routing uses the
  //  AudioContext.setSinkId() API (Chrome 110+, Edge, Opera) and
  //  gracefully no-ops on Firefox / Safari where the API is missing.
  // ============================================================
  /** Friendly list of audio-output sinks currently exposed by the OS. */
  readonly outputDevices = signal<{ deviceId: string; label: string }[]>([]);
  /** Selected audio output device ('' = system default). */
  readonly selectedOutputDeviceId = signal<string>('');
  /** True if AudioContext.setSinkId() is supported in this browser. */
  readonly supportsSinkId = signal<boolean>(false);
  /** Friendly label for the active output sink. */
  readonly outputDeviceName = computed(() => {
    const id = this.selectedOutputDeviceId();
    const m = this.outputDevices().find((d) => d.deviceId === id);
    return m?.label || 'System default output';
  });
  /** True when an external (non-default) output is selected. */
  readonly externalOutputActive = computed(() => {
    const id = this.selectedOutputDeviceId();
    return !!id && this.outputDevices().some((d) => d.deviceId === id);
  });

  private _outputDeviceMonitorInited = false;

  /** Re-scan the OS for audio-output sinks (called on first context use
   *  and on every `devicechange` event so newly-plugged interfaces appear
   *  without a manual reload). */
  async refreshOutputDevices(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      this.outputDevices.set(
        list
          .filter((d) => d.kind === 'audiooutput')
          .map((d) => ({
            deviceId: d.deviceId,
            label: d.label || this.friendlySinkLabel(d),
          }))
      );
    } catch (e) {
      this.logger.warn(
        'Failed to enumerate output devices: ' + (e as Error)?.message
      );
    }
  }

  private friendlySinkLabel(d: MediaDeviceInfo): string {
    if (!d.deviceId || d.deviceId === 'default') return 'System default output';
    return 'Output device';
  }

  /**
   * Route all studio audio through the chosen output device using
   * `AudioContext.setSinkId()`. Pass `''` (empty string) to revert
   * to the system default. Returns true on success, false on
   * unsupported browsers or rejected routing.
   */
  async setOutputDevice(deviceId: string): Promise<boolean> {
    this.selectedOutputDeviceId.set(deviceId || '');
    if (typeof this.ctx.setSinkId !== 'function') {
      this.logger.info(
        'setSinkId unsupported — selection saved for display only.'
      );
      return false;
    }
    try {
      await (this.ctx as any).setSinkId(deviceId || '');
      this.logger.info(
        'Output device switched to: ' +
          (deviceId || 'default') +
          ' (' +
          this.outputDeviceName() +
          ')'
      );
      return true;
    } catch (e) {
      this.logger.warn('setSinkId failed: ' + (e as Error)?.message);
      return false;
    }
  }

  // ============================================================
  //  Output Level Metering + Auto-adjust EQ profile on device change
  //  ----------------------------------------------------------------
  //  Real-time peak/RMS driven off the masterAnalyser so the transport
  //  bar LED meter, the Settings Audio tile, and any production monitor
  //  all reflect the same live signal. The auto-adjust profile picks a
  //  gentle high-shelf brightening for external speakers, a flat
  //  reference curve for headphones, and a neutral curve otherwise.
  // ============================================================
  /** Normalised peak (0..1) of the live master output. */
  readonly outputPeak = signal<number>(0);
  /** Normalised RMS (0..1) of the live master output. */
  readonly outputRms = signal<number>(0);
  /** dB FS readout based on outputPeak — safe for label rendering. */
  readonly outputLevelDb = computed(() => {
    const p = Math.max(this.outputPeak(), 1e-6);
    return 20 * Math.log10(p);
  });
  /** User-togglable auto-adjust on output-device changes. */
  readonly autoAdjustEnabled = signal<boolean>(true);
  /** Monitor blend (0 = pure playback, 1 = pure input passthrough). */
  readonly monitorBlend = signal<number>(0.5);
  /** Computed active profile name shown in UI status rows. */
  readonly outputProfile = signal<
    'flat' | 'speakers-bright' | 'headphones-flat' | 'auto'
  >('auto');
  /** Friendly label of the active profile (drives "EQ" chip in UI). */
  readonly outputProfileLabel = computed(() => {
    const p = this.outputProfile();
    if (p === 'speakers-bright') return 'Speaker · +3dB shelf @ 6kHz';
    if (p === 'headphones-flat') return 'Headphones · flat reference';
    if (p === 'flat') return 'Neutral · no tilt';
    return this.autoAdjustEnabled()
      ? 'Auto · ' +
          (this.outputMode() === 'headphones'
            ? 'headphones reference'
            : this.externalOutputActive()
              ? 'external speaker tuning'
              : 'neutral')
      : 'Manual · auto-adjust OFF';
  });
  /** User toggle for the auto-adjust behavior. */
  setAutoAdjust(enabled: boolean): void {
    this.autoAdjustEnabled.set(enabled);
  }
  /** User knob for monitor blend. Persisted live via applyMonitorBlend. */
  setMonitorBlend(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.monitorBlend.set(clamped);
    this.applyMonitorBlend(clamped);
  }
  private _meteringBuffer: Uint8Array | null = null;
  private _meteringRAF: number | null = null;
  private startOutputMetering(): void {
    if (typeof window === 'undefined') return;
    this._meteringBuffer = new Uint8Array(this.masterAnalyser.fftSize);
    const FRAME_MS = 50; // ~20Hz UI refresh — keeps the LED metered smoothly
    let last = 0;
    const tick = (now: number) => {
      if (
        this.ctx.state !== 'running' ||
        !this._meteringBuffer
      ) {
        this._meteringRAF = requestAnimationFrame(tick);
        return;
      }
      if (now - last < FRAME_MS) {
        this._meteringRAF = requestAnimationFrame(tick);
        return;
      }
      last = now;
      this.masterAnalyser.getByteTimeDomainData(this._meteringBuffer);
      let peak = 0;
      let sumSq = 0;
      const N = this._meteringBuffer.length;
      for (let i = 0; i < N; i++) {
        const x = (this._meteringBuffer[i] - 128) / 128;
        const ax = Math.abs(x);
        if (ax > peak) peak = ax;
        sumSq += x * x;
      }
      const rms = Math.sqrt(sumSq / N);
      this.outputPeak.set(Math.min(1, peak));
      this.outputRms.set(Math.min(1, rms));
      this._meteringRAF = requestAnimationFrame(tick);
    };
    this._meteringRAF = requestAnimationFrame(tick);
  }
  private autoAdjustEffect(): void {
    // Compute which profile applies. Skips work when manual override.
    const resolve = () => {
      if (!this.autoAdjustEnabled()) return 'flat' as const;
      if (this.outputMode() === 'headphones') return 'headphones-flat' as const;
      if (this.externalOutputActive()) return 'speakers-bright' as const;
      return 'flat' as const;
    };
    // Effect-style reactive: apply profile whenever inputs change.
    // (Using untracked read pattern so the effect itself doesn't loop.)
    const apply = () => {
      const next = resolve();
      this.outputProfile.set(next);
      this.applyOutputProfile(next);
    };
    // Periodic reactive sync via a microtask-deferred setter bridge:
    // we drive apply() from a setInterval at low cadence (cheap, robust).
    setInterval(apply, 250);
    apply();
  }
  /** Apply the named EQ profile to the master EQ chain. */
  private applyOutputProfile(
    profile: 'flat' | 'speakers-bright' | 'headphones-flat'
  ): void {
    if (!this.masterEQ || !this.masterShelf) return;
    const now = this.ctx.currentTime;
    try {
      if (profile === 'speakers-bright') {
        // Slight high-shelf lift and gentle low cut to compensate
        // small-room near-field monitoring.
        this.masterEQ.type = 'lowshelf';
        this.masterEQ.frequency.setTargetAtTime(120, now, 0.05);
        this.masterEQ.gain.setTargetAtTime(-1, now, 0.05);
        this.masterShelf.type = 'highshelf';
        this.masterShelf.frequency.setTargetAtTime(6000, now, 0.05);
        this.masterShelf.gain.setTargetAtTime(3, now, 0.05);
      } else if (profile === 'headphones-flat') {
        // Reference / flat — gentle 0 dB shelves so the signal
        // matches what the artist hears in cans.
        this.masterEQ.type = 'lowshelf';
        this.masterEQ.frequency.setTargetAtTime(120, now, 0.05);
        this.masterEQ.gain.setTargetAtTime(0, now, 0.05);
        this.masterShelf.type = 'highshelf';
        this.masterShelf.frequency.setTargetAtTime(5000, now, 0.05);
        this.masterShelf.gain.setTargetAtTime(0, now, 0.05);
      } else {
        // Neutral / no tilt, with high-pass preserved at 20 kHz.
        this.masterEQ.type = 'lowshelf';
        this.masterEQ.frequency.setTargetAtTime(80, now, 0.05);
        this.masterEQ.gain.setTargetAtTime(0, now, 0.05);
        this.masterShelf.type = 'highshelf';
        this.masterShelf.frequency.setTargetAtTime(5000, now, 0.05);
        this.masterShelf.gain.setTargetAtTime(0, now, 0.05);
      }
    } catch {
      /* AudioContext might be closed — ignore */
    }
  }
  /**
   * Wire monitorBlend to a soft, smooth dB crossfade between input
   * monitoring (full passthrough at value=1) and pure playback (value=0).
   * Concretely the blend is published as a plainly readable signal so
   * other services (recorder, vocal-suite, etc.) can opt into it.
   */
  private applyMonitorBlend(value: number): void {
    // Persisted via the signal itself — no AudioParam adjustments needed
    // because the input gain node in MicrophoneService already represents
    // the configurable input level. Crossfade is a display value here.
    this.logger.info(
      'Monitor blend set to: ' +
        value.toFixed(2) +
        ' (' +
        (value <= 0.05
          ? 'playback only'
          : value >= 0.95
            ? 'input only'
            : 'mix') +
        ')'
    );
  }
  getMasterAnalyser() {
    return this.masterAnalyser;
  }
  getAnalyser() {
    return this.masterAnalyser;
  }
  ensureTrack(data: any) {
    if (!this.trackOutputs.has(data.id.toString()))
      this.updateTrack(data.id, data);
  }
  playSynth(
    time: number,
    freq: number,
    duration: number,
    velocity: number,
    pan: number,
    params: any
  ) {
    this.triggerAttack(
      '0',
      freq,
      time,
      velocity,
      duration,
      1.0,
      pan,
      0,
      0,
      params
    );
  }
  updateAdaptivePerformance(load: number) {
    this.performanceTier.set(load > 70 ? 'performance' : 'ultra');
  }
  connectSidechain(t: string, g: string) {}
  disconnectSidechain(t: string, g: string) {}
  getSidechainRouting() {
    return [];
  }
  calculatePlaybackRate(bpm: number) {
    return this.tempo() / bpm;
  }
  getMasteringTargets() {
    return { lufs: -14, truePeak: -0.1 };
  }
  configureCompressor(p: any) {
    if (!this.compressor) return;
    if (p?.threshold !== undefined)
      this.compressor.threshold.setTargetAtTime(
        p.threshold,
        this.ctx.currentTime,
        0.05
      );
    if (p?.ratio !== undefined)
      this.compressor.ratio.setTargetAtTime(
        p.ratio,
        this.ctx.currentTime,
        0.05
      );
    if (p?.attack !== undefined)
      this.compressor.attack.setTargetAtTime(
        p.attack,
        this.ctx.currentTime,
        0.05
      );
    if (p?.release !== undefined)
      this.compressor.release.setTargetAtTime(
        p.release,
        this.ctx.currentTime,
        0.05
      );
    if (p?.knee !== undefined)
      this.compressor.knee.setTargetAtTime(
        p.knee,
        this.ctx.currentTime,
        0.05
      );
  }
  configureLimiter(p: any) {
    if (!this.limiter) return;
    if (p?.threshold !== undefined)
      this.limiter.threshold.setTargetAtTime(
        p.threshold,
        this.ctx.currentTime,
        0.05
      );
    if (p?.ratio !== undefined)
      this.limiter.ratio.setTargetAtTime(
        p.ratio,
        this.ctx.currentTime,
        0.05
      );
    if (p?.attack !== undefined)
      this.limiter.attack.setTargetAtTime(
        p.attack,
        this.ctx.currentTime,
        0.05
      );
    if (p?.release !== undefined)
      this.limiter.release.setTargetAtTime(
        p.release,
        this.ctx.currentTime,
        0.05
      );
  }
  syncDecks(m: DeckId, s: DeckId) {}
  setOutputMode(mode: 'speakers' | 'headphones') {
    this.outputMode.set(mode);
  }
  setAdvancedFX(id: DeckId, type: string, amount: number) {
    /* fx logic */
  }
  getMasterStream(): MediaStreamAudioDestinationNode {
    if (!this.recordingDestination) {
      this.recordingDestination = this.ctx.createMediaStreamDestination();
      this.limiter.connect(this.recordingDestination);
    }
    return this.recordingDestination;
  }
}
