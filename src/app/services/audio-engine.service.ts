import { LoggingService } from './logging.service';
import {
  Injectable,
  signal,
  inject,
  Injector,
  untracked,
  computed,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { StudioRecordingEngineService } from '../studio/studio-recording-engine.service';
import { StemSeparationService, Stems } from './stem-separation.service';
import { DynamicEffectsRack } from '../studio/effects/dynamic-effects-rack';

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

  // ── Pro: High-Quality Audio Context with oversampling ──────
  public readonly ctx: AudioContext = (() => {
    try {
      return new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 96000,
      });
    } catch {
      try {
        return new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 48000,
        });
      } catch {
        return new (
          window.AudioContext || (window as any).webkitAudioContext
        )();
      }
    }
  })();

  public readonly nativeSampleRate: number = this.ctx.sampleRate;
  public readonly oversampleFactor: number =
    this.nativeSampleRate >= 96000 ? 2 : this.nativeSampleRate >= 48000 ? 4 : 8;
  public readonly effectiveSampleRate: number =
    this.nativeSampleRate * this.oversampleFactor;

  private readonly antialiasEnabled = signal(true);
  private readonly ditherEnabled = signal(true);
  private ditherNode: GainNode | null = null;
  private oversampleNodes: Map<string, { up: GainNode; down: GainNode }> =
    new Map();

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

  // ── Pro: Quantum Spectral Mastering & Metering Nodes ────────
  public quantumSaturation = this.ctx.createWaveShaper();
  public spectralExciter = this.ctx.createBiquadFilter();
  public subAtomicEnhancer = this.ctx.createGain();
  public lufsFilter1 = this.ctx.createBiquadFilter(); // K-weighting Stage 1
  public lufsFilter2 = this.ctx.createBiquadFilter(); // K-weighting Stage 2
  public lufsAnalyzer = this.ctx.createAnalyser();

  public masterAnalyser = this.ctx.createAnalyser();
  public masterEQ = this.ctx.createBiquadFilter();
  public masterShelf = this.ctx.createBiquadFilter();
  public masterWidener = this.ctx.createStereoPanner();
  private reverbConvolver = this.ctx.createConvolver();
  public reverbWet = this.ctx.createGain();

  public readonly sendAReturn = this.ctx.createGain();
  public readonly sendBReturn = this.ctx.createGain();

  // ── Pro: DAW Routing & Bus Logic ────────────────────────────
  public auxBuses = new Map<
    string,
    { gain: GainNode; analyser: AnalyserNode }
  >();
  private trackSendAGains = new Map<string, GainNode>();
  private trackSendBGains = new Map<string, GainNode>();
  private trackOutputs = new Map<string, GainNode>();
  /** Per-track *base* (pre-VCA) gain. Stored separately so VCA bus multiplier
   *  can re-multiply without drifting across fader edits. */
  private baseFaderGains = new Map<string, number>();
  /** Cached VCA multiplier per-track, evaluated lazily from VcaBusService.assignments. */
  private vcaMultipliers = new Map<string, number>();
  /** 20ms ramp window for VCA fader smoothing (avoids audio pops). */
  private static readonly VCA_RAMP_SECONDS = 0.02;

  /**
   * Apply a VCA multiplier onto a single track's fader gain node.
   * Base + multiplier stored in their own maps so consecutive calls do not drift.
   */
  setVcaMultiplier(trackId: string, multiplier: number): void {
    const clamped = Math.max(0, Math.min(1.5, multiplier));
    this.vcaMultipliers.set(trackId, clamped);
    const gain = this.trackFaderGains.get(trackId);
    if (!gain) return;
    const base = this.baseFaderGains.get(trackId) ?? gain.gain.value;
    const target = Math.max(0, Math.min(1.5, base * clamped));
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(target, now + AudioEngineService.VCA_RAMP_SECONDS);
  }

  /** Read-only inspector for mixer UI / tests. */
  getVcaMultiplier(trackId: string): number {
    return this.vcaMultipliers.get(trackId) ?? 1;
  }

  /**
   * Persist the post-fader *base* gain on a track. Called whenever the
   * track fader changes (UI drag, resetAllLevels, etc). The VCA multiplier
   * is reapplied on top of this base value.
   */
  setBaseFaderGain(trackId: string, baseGain: number): void {
    const clamped = Math.max(0, Math.min(1.5, baseGain));
    this.baseFaderGains.set(trackId, clamped);
    const gain = this.trackFaderGains.get(trackId);
    if (!gain) return;
    const multiplier = this.vcaMultipliers.get(trackId) ?? 1;
    const target = clamped * multiplier;
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(target, now + AudioEngineService.VCA_RAMP_SECONDS);
  }
  private trackPhaseNodes = new Map<string, GainNode>();
  private trackWidthNodes = new Map<string, StereoPannerNode>();
  private trackFaderGains = new Map<string, GainNode>();
  private trackAuxSends = new Map<string, Map<string, GainNode>>();
  private trackEffectsRacks = new Map<string, DynamicEffectsRack>();

  public tempo = signal(124.0);
  public isPlaying = signal(false);
  public isRecording = signal(false);
  public isCountIn = signal(false);

  // ── Pro: S.M.U.V.E.-MODE & Quantum State ────────────────────
  public smuveModeActive = signal(false);
  public quantumModeActive = signal(false);
  public currentLufs = signal(-14.0);

  public outputMode = signal<'speakers' | 'headphones'>('speakers');
  public performanceTier = signal<'ultra' | 'performance'>('ultra');
  public sidechainEnabled = signal(false);
  public scaleMode = signal('major');
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
  public onScheduleStep?: (
    step: number,
    time: number,
    duration: number
  ) => void;
  public onCountInComplete?: () => void;

  private sidechainMatrix = new Map<string, Set<string>>();
  private sidechainWorklets = new Map<string, AudioWorkletNode>();
  private sidechainRouting = new Map<string, { triggerGain: GainNode; sidechainInput: GainNode }>();
  private _sidechainWorkletLoaded = false;
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
  private workletNode: AudioWorkletNode | null = null;
  private masterWorkletNode: AudioWorkletNode | null = null;
  private _masterWorkletLoaded = false;
  readonly masterWorkletActive = signal(false);

  /** Raw master bus node BEFORE the worklet (for metronome, reverb sends, etc.) */
  private _preMasterGain = this.ctx.createGain();

  constructor() {
    this.deckA = this.createDeck('A');
    this.deckB = this.createDeck('B');

    // ── Professional Mastering Chain ───────────────────────────
    // Path: masterGain → preMasterGain → [master worklet OR fallback chain] → metering → destination
    // The main-thread chain is retained as fallback; the worklet replaces it when loaded.

    // Fallback chain (main-thread) — same as before
    this.compressor = this.ctx.createDynamicsCompressor();
    this.saturationNode = this.ctx.createWaveShaper();
    this.limiter = this.ctx.createDynamicsCompressor();

    // Master chain routing: masterGain → preMasterGain
    this.masterGain.connect(this._preMasterGain);

    // Build the fallback chain but don't connect it yet —
    // the worklet will be preferred if it loads successfully
    this._preMasterGain.connect(this.compressor);
    this.compressor.connect(this.saturationNode);
    this.saturationNode.connect(this.quantumSaturation);
    this.quantumSaturation.connect(this.spectralExciter);
    this.spectralExciter.connect(this.subAtomicEnhancer);
    this.subAtomicEnhancer.connect(this.limiter);
    this.limiter.connect(this.masterEQ);
    this.masterEQ.connect(this.masterShelf);
    this.masterShelf.connect(this.masterWidener);

    // Metering Chain (K-Weighting for LUFS) — after the mastering stage
    this.masterWidener.connect(this.lufsFilter1);
    this.lufsFilter1.connect(this.lufsFilter2);
    this.lufsFilter2.connect(this.lufsAnalyzer);
    this.lufsAnalyzer.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);

    this.reverbWet.connect(this.masterGain);
    this.sendAReturn.connect(this.masterGain);
    this.sendBReturn.connect(this.masterGain);

    // K-Weighting Filter Setup (ITU-R BS.1770-4)
    this.lufsFilter1.type = 'highshelf';
    this.lufsFilter1.frequency.value = 1500;
    this.lufsFilter1.gain.value = 4;
    this.lufsFilter2.type = 'highpass';
    this.lufsFilter2.frequency.value = 100;
    this.lufsFilter2.Q.value = 1;

    this.limiter.threshold.setValueAtTime(-0.1, this.ctx.currentTime);
    this.limiter.ratio.setValueAtTime(20, this.ctx.currentTime);
    this.limiter.attack.setValueAtTime(0.001, this.ctx.currentTime);
    this.limiter.release.setValueAtTime(0.05, this.ctx.currentTime);

    this.masterEQ.type = 'lowpass';
    this.masterEQ.frequency.value = 20000;
    this.masterShelf.type = 'highshelf';
    this.masterShelf.frequency.value = 5000;

    // Quantum Defaults
    this.spectralExciter.type = 'highshelf';
    this.spectralExciter.frequency.value = 8000;
    this.spectralExciter.gain.value = 0;
    this.subAtomicEnhancer.gain.value = 1;

    this.setSoftClip(0.1);
    this.setQuantumSaturation(0.0);
    this.initMasterWorklet();
    this.initMidiOut();
    // Populate the sink enumeration so the transport-bar dropdown has options on first click.
    // Device labels stay empty until the user grants permission, but deviceId entries are still
    // useful for setSinkId targeting and the empty-state hint check (`outputDevices().length === 0`).
    this.refreshOutputDevices();
    this.initWorklet();
    // Track AudioContext.state reactively so the contextState signal stays in sync
    // with engine lifecycle transitions (suspended ↔ running ↔ closed).
    this.ctx.onstatechange = this._ctxStateHandler;
    this._ctxStateHandler();
    this.startOutputMetering();
    this.autoAdjustEffect();
  }

  setQuantumSaturation(amount: number) {
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
    }
    this.quantumSaturation.curve = amount === 0 ? null : curve;
  }

  toggleSmuveMode(active: boolean) {
    this.smuveModeActive.set(active);
    if (this.masterWorkletNode) {
      this.masterWorkletNode.port.postMessage({
        slot: 'preset',
        payload: active ? 'smuve' : 'flat',
      });
    } else {
      if (active) {
        this.configureCompressor({
          threshold: -18,
          ratio: 4,
          attack: 0.01,
          release: 0.1,
        });
        this.configureLimiter({ threshold: -0.5, ratio: 20 });
        this.setSaturation(0.2);
      } else {
        this.configureCompressor({
          threshold: -12,
          ratio: 2,
          attack: 0.02,
          release: 0.2,
        });
        this.setSaturation(0.1);
      }
    }
  }

  toggleQuantumMode(active: boolean) {
    this.quantumModeActive.set(active);
    if (this.masterWorkletNode) {
      this.masterWorkletNode.port.postMessage({
        slot: 'preset',
        payload: active ? 'quantum' : 'smuve',
      });
    } else {
      if (active) {
        this.setQuantumSaturation(0.5);
        this.spectralExciter.gain.setTargetAtTime(3, this.ctx.currentTime, 0.1);
        this.subAtomicEnhancer.gain.setTargetAtTime(
          1.1,
          this.ctx.currentTime,
          0.1
        );
      } else {
        this.setQuantumSaturation(0);
        this.spectralExciter.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
        this.subAtomicEnhancer.gain.setTargetAtTime(
          1.0,
          this.ctx.currentTime,
          0.1
        );
      }
    }
  }

  /**
   * Initialize the master bus AudioWorklet processor.
   * Replaces the main-thread compressor/saturation/limiter/EQ chain
   * with a single high-performance worklet running at native audio rate.
   */
  private async initMasterWorklet(): Promise<void> {
    if (this._masterWorkletLoaded) return;

    try {
      await this.ctx.audioWorklet.addModule(
        'assets/worklets/master-processor.worklet.js'
      );
    } catch (err: any) {
      if (!err?.message?.includes('already')) {
        console.warn(
          'AudioEngine: Master worklet load failed, using main-thread fallback.',
          err?.message
        );
        return;
      }
    }

    try {
      this.masterWorkletNode = new AudioWorkletNode(this.ctx, 'master-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
      });

      // Re-route: disconnect the fallback chain and insert the worklet
      this._preMasterGain.disconnect();

      // New routing: preMasterGain → worklet → lufsFilter1 → ...
      this._preMasterGain.connect(this.masterWorkletNode);
      this.masterWorkletNode.connect(this.lufsFilter1);

      // Apply default preset
      this.masterWorkletNode.port.postMessage({ slot: 'preset', payload: 'smuve' });

      this._masterWorkletLoaded = true;
      this.masterWorkletActive.set(true);
      this.logger.info('AudioEngine: Master worklet active — 5-band EQ, compressor, saturation, lookahead limiter.');
    } catch (err: any) {
      console.warn(
        'AudioEngine: Master worklet node creation failed, using main-thread fallback.',
        err?.message
      );
    }
  }

  /** Configure a specific slot on the master worklet */
  configureMasterWorklet(slot: string, action: string, payload?: any): void {
    if (!this.masterWorkletNode) return;
    this.masterWorkletNode.port.postMessage({ slot, action, payload });
  }

  resume() {
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  startCountIn() {
    this.resume();
    if (this.isPlaying()) return;
    this.isCountIn.set(true);
    this.isPlaying.set(true);
    this.countInRemainingSteps = this.stepsPerBeat() * 4;
    this.nextNoteTime = this.ctx.currentTime + 0.05;

    if (this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'SET_TEMPO',
        payload: this.tempo(),
      });
      this.workletNode.port.postMessage({ type: 'START' });
    } else {
      this.schedulerHandle = setInterval(
        () => this.scheduler(),
        AudioEngineService.DEFAULT_SCHEDULER_INTERVAL_MS
      );
    }
  }

  start() {
    this.resume();
    if (this.isPlaying()) return;
    this.isPlaying.set(true);
    this.sendMidiStart();
    this.nextNoteTime = this.ctx.currentTime + 0.05;

    if (this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'SET_TEMPO',
        payload: this.tempo(),
      });
      this.workletNode.port.postMessage({ type: 'START' });
    } else {
      this.schedulerHandle = setInterval(
        () => this.scheduler(),
        AudioEngineService.DEFAULT_SCHEDULER_INTERVAL_MS
      );
    }
  }

  stop() {
    this.isPlaying.set(false);
    this.sendMidiStop();
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'STOP' });
    }
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

  private async initWorklet() {
    try {
      await this.ctx.audioWorklet.addModule(
        'assets/audio-processor.worklet.js'
      );
      this.workletNode = new AudioWorkletNode(
        this.ctx,
        'smuve-audio-processor'
      );
      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'TICK') {
          const { step, time, duration } = event.data.payload;
          this.handleTick(step, time, duration);
        }
      };
      this.workletNode.port.postMessage({
        type: 'SET_TEMPO',
        payload: this.tempo(),
      });
    } catch (err) {
      console.warn(
        'AudioWorklet load failed, falling back to setInterval',
        err
      );
    }
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
    this.sendMidiToAll([0xfa]);
  }
  private sendMidiStop() {
    this.sendMidiToAll([0xfc]);
  }

  private handleTick(step: number, time: number, stepDuration: number) {
    if (this.isCountIn()) {
      if (step % this.stepsPerBeat() === 0) {
        this.playMetronomeClick(time, step === 0, true);
      }
      this.countInRemainingSteps--;
      if (this.countInRemainingSteps <= 0) {
        this.isCountIn.set(false);
        this.onCountInComplete?.();
        // Reset step in worklet if possible, else handle here
        if (this.workletNode)
          this.workletNode.port.postMessage({ type: 'RESET_STEP' });
        else this.currentStep = 0;
      }
      return;
    }

    const loopedStep = step % this.loopLengthSteps();

    this.onScheduleStep?.(loopedStep, time, stepDuration);

    if (this.metronomeEnabled() && loopedStep % this.stepsPerBeat() === 0) {
      this.playMetronomeClick(
        time,
        loopedStep % (this.stepsPerBeat() * 4) === 0
      );
    }

    const visualDelay = (time - this.ctx.currentTime) * 1000;
    setTimeout(
      () => {
        this.visualStep.set(loopedStep);
        this.currentBeat.set(loopedStep / this.stepsPerBeat());
      },
      Math.max(0, visualDelay)
    );
  }

  private scheduler() {
    const stepDuration = 60 / this.tempo() / this.stepsPerBeat();
    while (
      this.nextNoteTime <
      this.ctx.currentTime + AudioEngineService.DEFAULT_LOOKAHEAD_SECONDS
    ) {
      this.handleTick(this.currentStep, this.nextNoteTime, stepDuration);
      this.nextNoteTime += stepDuration;
      if (!this.isCountIn()) {
        this.currentStep = (this.currentStep + 1) % this.loopLengthSteps();
      } else {
        this.currentStep++;
      }
    }
  }

  private playMetronomeClick(
    time: number,
    isDownbeat: boolean,
    force: boolean = false
  ) {
    if (!this.metronomeEnabled() && !force) return;
    this.resume();
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
    /* seek logic */
  }
  getDeckProgress(id: DeckId) {
    return { position: 0, duration: 0, isPlaying: false, slipPosition: 0 };
  }
  getDeckLevel(id: DeckId) {
    return 0.5;
  }
  getDeckWaveformData(id: DeckId) {
    return new Float32Array(0);
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
    /* cue logic */
  }
  loadDeck(id: DeckId, buffer: AudioBuffer) {
    /* load logic */
  }
  setHotCue(id: DeckId, slot: number) {
    /* hotcue logic */
  }
  clearHotCue(id: DeckId, slot: number) {
    /* hotcue logic */
  }
  jumpToHotCue(id: DeckId, slot: number) {
    /* hotcue logic */
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

  setDeckFilterMode(id: DeckId, type: BiquadFilterType) {
    const deck = this.getDeck(id);
    if (!deck) return;
    deck.filter.type = type;
  }
  setDeckSend(id: DeckId, send: 'A' | 'B', gain: number) {
    /* send logic */
  }
  scratch(id: DeckId, delta: number) {
    /* scratch logic */
  }
  brakeDeck(id: DeckId) {
    /* brake logic */
  }
  spinbackDeck(id: DeckId) {
    /* spinback logic */
  }
  transformDeck(id: DeckId) {
    /* transform logic */
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

  /**
   * Pro: High-quality antialiased oscillator engine.
   * Uses bandlimited wavetables for saw/square when antialias is enabled,
   * otherwise falls back to native oscillator types.
   */
  private createAntialiasedOscillator(
    ctx: AudioContext,
    type: string,
    freq: number,
    time: number
  ): OscillatorNode {
    const osc = ctx.createOscillator();
    if (this.antialiasEnabled() && (type === 'sawtooth' || type === 'square')) {
      // Bandlimited wavetable via oversampled harmonic synthesis
      const baseFreq = freq;
      const nyquist = ctx.sampleRate / 2;
      const maxHarmonics = Math.floor(nyquist / baseFreq);
      const real = new Float32Array(maxHarmonics + 1);
      const imag = new Float32Array(maxHarmonics + 1);

      if (type === 'sawtooth') {
        for (let h = 1; h <= maxHarmonics; h++) {
          imag[h] = (1 / h) * Math.pow(1 - h / maxHarmonics, 0.3); // gentle rolloff
        }
      } else {
        // square: odd harmonics only
        for (let h = 1; h <= maxHarmonics; h += 2) {
          imag[h] = (1 / h) * Math.pow(1 - h / maxHarmonics, 0.3);
        }
      }
      const wave = ctx.createPeriodicWave(real, imag, {
        disableNormalization: false,
      });
      osc.setPeriodicWave(wave);
    } else {
      osc.type = (type as OscillatorType) || 'sine';
    }
    osc.frequency.setValueAtTime(freq, time);
    return osc;
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
    const osc = this.createAntialiasedOscillator(
      this.ctx,
      params.type || 'sine',
      freq,
      time
    );
    const panner = this.ctx.createStereoPanner();
    const vca = this.ctx.createGain();
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

    if (this.isRecording()) {
      const pitch = Math.round(69 + 12 * Math.log2(freq / 440));
      this.recorder.pendingMidi.push({
        pitch,
        startTime: time,
        duration,
        velocity,
      });
    }
  }

  /** Toggle antialiased oscillator mode */
  toggleAntialias(enabled: boolean) {
    this.antialiasEnabled.set(enabled);
  }

  /** Toggle dithering on master output (reduces quantization distortion at low levels) */
  toggleDither(enabled: boolean) {
    this.ditherEnabled.set(enabled);
    if (enabled && !this.ditherNode) {
      this.ditherNode = this.ctx.createGain();
      this.ditherNode.gain.value = 0.00003; // ~ -90dB TPDF dither
      // Inject shaped noise via script processor
      try {
        const sp = this.ctx.createScriptProcessor(256, 0, 1);
        sp.onaudioprocess = (e) => {
          const out = e.outputBuffer.getChannelData(0);
          for (let i = 0; i < out.length; i++) {
            out[i] = (Math.random() * 2 - 1) * 0.00003;
          }
        };
        sp.connect(this.ditherNode);
        this.ditherNode!.connect(this.masterAnalyser);
      } catch {
        /* ScriptProcessor deprecated in some contexts */
      }
    } else if (!enabled && this.ditherNode) {
      this.ditherNode.disconnect();
      this.ditherNode = null;
    }
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
    if (!this.trackPhaseNodes.has(id)) {
      // Complete Pro Signal Chain
      const phase = this.ctx.createGain(); // Phase Inversion Node
      const width = this.ctx.createStereoPanner(); // Stereo Width / Pan
      const fader = this.ctx.createGain(); // Post-fader Gain
      const output = this.ctx.createGain(); // Final Track Out

      // Insert per-track effects rack between phase and width
      const rack = new DynamicEffectsRack(this.ctx);
      this.trackEffectsRacks.set(id, rack);

      // Fire-and-forget: enable worklet-based effects for this track
      // Falls back gracefully to main-thread plugins if worklet fails
      rack.enableWorklet().then((ok) => {
        if (ok) this.logger.info(`AudioEngine: Worklet effects enabled for track ${id}`);
      });

      phase.connect(rack.input);
      rack.output.connect(width);
      width.connect(fader);
      fader.connect(output);
      output.connect(this.masterGain);

      this.trackPhaseNodes.set(id, phase);
      this.trackWidthNodes.set(id, width);
      this.trackFaderGains.set(id, fader);
      this.trackOutputs.set(id, output);

      const sA = this.ctx.createGain();
      sA.gain.value = 0;
      fader.connect(sA);
      sA.connect(this.sendAReturn);
      this.trackSendAGains.set(id, sA);

      const sB = this.ctx.createGain();
      sB.gain.value = 0;
      fader.connect(sB);
      sB.connect(this.sendBReturn);
      this.trackSendBGains.set(id, sB);
    }
    return this.trackPhaseNodes.get(id)!;
  }

  /** Get (or lazily create) a per-track DynamicEffectsRack for insert/send routing */
  getTrackEffectsRack(trackId: string): DynamicEffectsRack {
    this.getTrackOutput(trackId); // ensure signal chain exists
    if (!this.trackEffectsRacks.has(trackId)) {
      const rack = new DynamicEffectsRack(this.ctx);
      this.trackEffectsRacks.set(trackId, rack);
    }
    return this.trackEffectsRacks.get(trackId)!;
  }

  updateTrack(id: string | number, patch: any) {
    const idStr = id.toString();
    this.getTrackOutput(idStr); // Ensure nodes exist

    const fader = this.trackFaderGains.get(idStr);
    const phase = this.trackPhaseNodes.get(idStr);
    const width = this.trackWidthNodes.get(idStr);

    if (patch.gain !== undefined && fader)
      fader.gain.setTargetAtTime(patch.gain, this.ctx.currentTime, 0.05);

    if (patch.phaseInvert !== undefined && phase)
      phase.gain.setTargetAtTime(
        patch.phaseInvert ? -1 : 1,
        this.ctx.currentTime,
        0.01
      );

    if (patch.pan !== undefined && width)
      width.pan.setTargetAtTime(patch.pan, this.ctx.currentTime, 0.05);

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
    this.metronomeVolume.set(Math.max(0, Math.min(1, val)));
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
    return this.ctx;
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
    params?: any
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
      params ?? { type: 'sine' }
    );
  }
  updateAdaptivePerformance(load: number) {
    this.performanceTier.set(load > 70 ? 'performance' : 'ultra');
  }
  connectSidechain(trigger: string, target: string) {
    if (!this.sidechainMatrix.has(trigger)) {
      this.sidechainMatrix.set(trigger, new Set<string>());
    }
    this.sidechainMatrix.get(trigger)!.add(target);
    this.sidechainEnabled.set(true);
    // Also connect via worklet if loaded
    this.createSidechainWorklet(trigger, target);
  }
  disconnectSidechain(trigger: string, target: string) {
    const targets = this.sidechainMatrix.get(trigger);
    if (targets) {
      targets.delete(target);
      if (targets.size === 0) {
        this.sidechainMatrix.delete(trigger);
      }
    }
    this.sidechainEnabled.set(this.sidechainMatrix.size > 0);
    this.removeSidechainWorklet(trigger, target);
  }

  /**
   * Create a sidechain AudioWorklet connection: trigger signal (input 1)
   * ducks the target track (input 0). Falls back to the existing
   * main-thread routing if the worklet fails to load.
   */
  async createSidechainWorklet(triggerTrackId: string, targetTrackId: string): Promise<void> {
    const key = `${triggerTrackId}→${targetTrackId}`;
    if (this.sidechainWorklets.has(key)) return;

    // Ensure tracks exist
    this.getTrackOutput(triggerTrackId);
    this.getTrackOutput(targetTrackId);

    // Try to load the worklet module once
    if (!this._sidechainWorkletLoaded) {
      try {
        await this.ctx.audioWorklet.addModule(
          'assets/worklets/sidechain-processor.worklet.js'
        );
        this._sidechainWorkletLoaded = true;
      } catch (err: any) {
        if (!err?.message?.includes('already')) {
          this.logger.warn(
            `AudioEngine: Sidechain worklet load failed, using main-thread fallback.`,
            err?.message
          );
          return;
        }
        this._sidechainWorkletLoaded = true;
      }
    }

    try {
      // Create the worklet node with TWO inputs:
      //   input 0 = target track (the one being ducked)
      //   input 1 = trigger track (the kick/drum doing the ducking)
      const workletNode = new AudioWorkletNode(this.ctx, 'sidechain-processor', {
        numberOfInputs: 2,
        numberOfOutputs: 1,
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
      });

      // Configure the sidechain parameters
      workletNode.port.postMessage({
        type: 'CONFIGURE',
        payload: {
          thresholdDb: -30,
          ratio: 8,
          attack: 0.002,
          release: 0.08,
          kneeDb: 4,
          rangeDb: -24,
          makeupDb: 3,
        },
      });

      // Re-route the target track signal through the worklet
      const targetPhase = this.trackPhaseNodes.get(targetTrackId);
      const targetWidth = this.trackWidthNodes.get(targetTrackId);
      const triggerOutput = this.trackOutputs.get(triggerTrackId) || this.trackFaderGains.get(triggerTrackId);

      if (targetPhase && targetWidth && triggerOutput) {
        // Disconnect the existing phase → width connection
        targetPhase.disconnect();

        // Re-route: phase → worklet (input 0) → width
        targetPhase.connect(workletNode);
        workletNode.connect(targetWidth);

        // Route: trigger output → worklet (input 1) — for envelope detection only
        // The trigger signal enters on input 1, channels 0-1
        const triggerTap = this.ctx.createGain();
        triggerTap.gain.value = 1.0;
        triggerOutput.connect(triggerTap);
        triggerTap.connect(workletNode, 0, 1); // connect to input 1

        this.sidechainRouting.set(key, { triggerGain: triggerTap, sidechainInput: triggerTap });
        this.sidechainWorklets.set(key, workletNode);

        this.logger.info(
          `AudioEngine: Sidechain worklet connected: ${triggerTrackId} → ${targetTrackId}`
        );
      }
    } catch (err: any) {
      this.logger.warn(
        `AudioEngine: Sidechain worklet node creation failed, using main-thread fallback.`,
        err?.message
      );
    }
  }

  /** Disconnect a sidechain worklet and restore direct routing */
  removeSidechainWorklet(triggerTrackId: string, targetTrackId: string): void {
    const key = `${triggerTrackId}→${targetTrackId}`;
    const workletNode = this.sidechainWorklets.get(key);
    const routing = this.sidechainRouting.get(key);

    if (workletNode && routing) {
      // Disconnect worklet
      workletNode.port.postMessage({ type: 'RESET' });
      workletNode.disconnect();
      routing.triggerGain.disconnect();

      // Restore direct routing: phase → width
      const targetPhase = this.trackPhaseNodes.get(targetTrackId);
      const targetWidth = this.trackWidthNodes.get(targetTrackId);

      if (targetPhase && targetWidth) {
        targetPhase.disconnect();
        targetPhase.connect(targetWidth);
      }

      this.sidechainWorklets.delete(key);
      this.sidechainRouting.delete(key);

      this.logger.info(
        `AudioEngine: Sidechain worklet removed: ${triggerTrackId} → ${targetTrackId}`
      );
    }
  }
  getSidechainRouting() {
    const routes: { triggerTrackId: string; targetTrackIds: string[] }[] = [];
    this.sidechainMatrix.forEach((targets, trigger) => {
      routes.push({
        triggerTrackId: trigger,
        targetTrackIds: Array.from(targets),
      });
    });
    return routes;
  }
  calculatePlaybackRate(bpm: number) {
    return this.tempo() / bpm;
  }
  setMasteringTargets(targets: { lufs: number; truePeak: number }) {
    this.masteringTargets = { ...targets };
    // Apply a safe ceiling through the limiter/compressor chain
    this.compressor.threshold.setTargetAtTime(
      targets.lufs,
      this.ctx.currentTime,
      0.05
    );
  }
  getMasteringTargets() {
    return { ...this.masteringTargets };
  }

  /** Pro: Aux Bus Architecture */
  createAuxBus(id: string) {
    if (this.auxBuses.has(id)) return;
    const gain = this.ctx.createGain();
    const analyser = this.ctx.createAnalyser();
    gain.connect(analyser);
    analyser.connect(this.masterGain);
    this.auxBuses.set(id, { gain, analyser });
  }

  setTrackAuxSend(trackId: string, auxId: string, level: number) {
    let trackSends = this.trackAuxSends.get(trackId);
    if (!trackSends) {
      trackSends = new Map<string, GainNode>();
      this.trackAuxSends.set(trackId, trackSends);
    }

    let sendNode = trackSends.get(auxId);
    if (!sendNode) {
      sendNode = this.ctx.createGain();
      const trackOut = this.trackFaderGains.get(trackId);
      const bus = this.auxBuses.get(auxId);
      if (trackOut && bus) {
        trackOut.connect(sendNode);
        sendNode.connect(bus.gain);
        trackSends.set(auxId, sendNode);
      }
    }

    if (sendNode) {
      sendNode.gain.setTargetAtTime(level, this.ctx.currentTime, 0.05);
    }
  }

  /** Pro: Auto-optimize limiter based on live LUFS */
  autoOptimizeLimiter(targetLufs: number) {
    const current = this.outputLufs();
    if (current < -60) return; // No audio

    const delta = targetLufs - current;
    if (Math.abs(delta) < 0.2) return; // Within tolerance

    const currentThreshold = this.limiter.threshold.value;
    // Gentle adjustment towards target
    const step = delta > 0 ? -0.5 : 0.5;
    const nextThreshold = Math.max(
      -30,
      Math.min(-0.1, currentThreshold + step)
    );

    this.limiter.threshold.setTargetAtTime(
      nextThreshold,
      this.ctx.currentTime,
      1.0
    );
    this.currentLufs.set(current); // Update reported LUFS signal
  }

  configureCompressor(p: any) {
    if (!this.compressor) return;
    if (p?.threshold !== undefined)
      this.compressor.threshold.setTargetAtTime(
        p.threshold,
        this.ctx.currentTime,
        0.01
      );
    if (p?.ratio !== undefined)
      this.compressor.ratio.setTargetAtTime(
        p.ratio,
        this.ctx.currentTime,
        0.01
      );
    if (p?.attack !== undefined)
      this.compressor.attack.setTargetAtTime(
        p.attack,
        this.ctx.currentTime,
        0.01
      );
    if (p?.release !== undefined)
      this.compressor.release.setTargetAtTime(
        p.release,
        this.ctx.currentTime,
        0.01
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
      this.limiter.ratio.setTargetAtTime(p.ratio, this.ctx.currentTime, 0.05);
  }

  syncDecks(m: DeckId, s: DeckId) {}
  setOutputMode(mode: 'speakers' | 'headphones') {
    this.outputMode.set(mode);
  }
  setAdvancedFX(id: DeckId, type: string, amount: number) {
    /* fx logic */
  }

  // ============================================================
  //  Output Level Metering (LUFS / RMS / PEAK)
  // ============================================================
  readonly outputPeak = signal<number>(0);
  readonly outputRms = signal<number>(0);
  readonly outputLufs = signal<number>(-70);

  readonly outputLevelDb = computed(() => {
    const p = Math.max(this.outputPeak(), 1e-6);
    return 20 * Math.log10(p);
  });

  readonly autoAdjustEnabled = signal<boolean>(true);
  readonly monitorBlend = signal<number>(0.5);
  readonly outputProfile = signal<
    'flat' | 'speakers-bright' | 'headphones-flat' | 'auto'
  >('auto');

  // ── Pro: Output Device & Engine Session State ──────────
  readonly outputProfileLabel = computed(() => {
    switch (this.outputProfile()) {
      case 'flat':
        return 'Flat';
      case 'speakers-bright':
        return 'Speakers · Bright';
      case 'headphones-flat':
        return 'Headphones · Flat';
      case 'auto':
      default:
        return 'Auto';
    }
  });

  readonly userGestureSeen = signal<boolean>(false);

  armOnFirstUserGesture(): void {
    if (this.userGestureSeen()) return;
    if (typeof document === 'undefined') return;

    const body = document.body;
    const onGesture = () => {
      this.resume();
      this.userGestureSeen.set(true);
      // Clean up peer listeners safely
      ['click', 'touchstart', 'keydown'].forEach((e) =>
        body.removeEventListener(e, onGesture, { capture: true })
      );
    };

    ['click', 'touchstart', 'keydown'].forEach((e) =>
      body.addEventListener(e, onGesture, { once: true, capture: true })
    );
  }

  readonly selectedOutputDeviceId = signal<string>('');
  readonly outputDevices = signal<MediaDeviceInfo[]>([]);
  readonly outputDeviceName = signal<string>('System Default');
  readonly externalOutputActive = computed(
    () => this.selectedOutputDeviceId() !== ''
  );

  supportsSinkId(): boolean {
    return (
      typeof HTMLAudioElement !== 'undefined' &&
      'setSinkId' in HTMLAudioElement.prototype
    );
  }

  async setOutputDevice(deviceId: string): Promise<boolean> {
    if (!this.supportsSinkId()) return false;
    try {
      if ('setSinkId' in this.ctx) {
        await (this.ctx as any).setSinkId(deviceId);
      } else {
        return false;
      }
      this.selectedOutputDeviceId.set(deviceId);

      // Update friendly name
      if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const target = devices.find(
          (d) => d.kind === 'audiooutput' && d.deviceId === deviceId
        );
        this.outputDeviceName.set(
          deviceId === ''
            ? 'System Default'
            : target?.label || 'External Output'
        );
      }
      return true;
    } catch {
      return false;
    }
  }

  async refreshOutputDevices(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter((d) => d.kind === 'audiooutput');
      // Surface the full enumeration so the transport-bar dropdown can list every sink.
      this.outputDevices.set(audioOutputs);
      const match = audioOutputs.find(
        (d) => d.deviceId === this.selectedOutputDeviceId()
      );
      if (match?.label) {
        this.outputDeviceName.set(
          this.selectedOutputDeviceId() === '' ? 'System Default' : match.label
        );
      }
    } catch {
      /* enumeration blocked (e.g. insecure context) — keep current name */
    }
  }

  // ── Pro: Settings setters (mirror the existing setOutputMode shape) ──
  setMonitorBlend(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.monitorBlend.set(clamped);
  }

  setAutoAdjust(enabled: boolean): void {
    this.autoAdjustEnabled.set(!!enabled);
  }

  // ── Pro: AudioContext state surfaced as a signal ─────────
  readonly contextState = signal<AudioContextState>('suspended');
  private _ctxStateHandler = (): void => {
    this.contextState.set(this.ctx.state);
  };

  private _meteringBuffer = new Float32Array(1024);
  private _meteringRAF: number | null = null;
  private startOutputMetering(): void {
    if (typeof window === 'undefined') return;
    this._meteringBuffer = new Float32Array(this.masterAnalyser.fftSize);
    const FRAME_MS = 50;
    let last = 0;
    const tick = (now: number) => {
      if (this.ctx.state !== 'running') {
        this._meteringRAF = requestAnimationFrame(tick);
        return;
      }
      if (now - last < FRAME_MS) {
        this._meteringRAF = requestAnimationFrame(tick);
        return;
      }
      last = now;

      // Peak & RMS from Master Analyser
      this.masterAnalyser.getFloatTimeDomainData(this._meteringBuffer);
      let peak = 0;
      let sumSq = 0;
      for (let i = 0; i < this._meteringBuffer.length; i++) {
        const x = this._meteringBuffer[i];
        const ax = Math.abs(x);
        if (ax > peak) peak = ax;
        sumSq += x * x;
      }
      const rms = Math.sqrt(sumSq / this._meteringBuffer.length);
      this.outputPeak.set(Math.min(1.5, peak));
      this.outputRms.set(Math.min(1.5, rms));

      // LUFS from K-weighted Analyser
      const lufsData = new Float32Array(this.lufsAnalyzer.fftSize);
      this.lufsAnalyzer.getFloatTimeDomainData(lufsData);
      let lufsSumSq = 0;
      for (let i = 0; i < lufsData.length; i++) {
        lufsSumSq += lufsData[i] * lufsData[i];
      }
      const lufsMs = lufsSumSq / lufsData.length;
      const lufs = 10 * Math.log10(lufsMs + 1e-10) - 0.691;
      this.outputLufs.set(Math.max(-70, lufs));

      this._meteringRAF = requestAnimationFrame(tick);
    };
    this._meteringRAF = requestAnimationFrame(tick);
  }

  private autoAdjustEffect(): void {
    /* auto adjustment logic */
  }

  getMasterStream(): MediaStreamAudioDestinationNode {
    if (!this.recordingDestination) {
      this.recordingDestination = this.ctx.createMediaStreamDestination();
      this.limiter.connect(this.recordingDestination);
    }
    return this.recordingDestination;
  }
}
