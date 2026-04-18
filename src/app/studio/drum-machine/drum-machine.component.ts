import {
  Component,
  inject,
  signal,
  effect,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  computed,
  Input,
  Output,
  EventEmitter,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { MicrophoneService } from '../../services/microphone.service';
import { AiService } from '../../services/ai.service';
import { LoggingService } from '../../services/logging.service';

interface DrumStep {
  active: boolean;
  velocity: number; // 0-1
}

interface DrumPad {
  id: string;
  name: string;
  type:
    | 'kick'
    | 'snare'
    | 'hihat'
    | 'bass'
    | 'clap'
    | 'tom'
    | 'rim'
    | 'crash'
    | 'cowbell'
    | 'shaker'
    | 'tambourine'
    | 'ride';
  color: string;
  active: boolean;
  params: any;
  steps: DrumStep[];
  sampledBuffer: AudioBuffer | null;
}

const DRUM_MACHINE_BARS = 4;
const STEPS_PER_BAR = 16;
const TOTAL_STEPS = DRUM_MACHINE_BARS * STEPS_PER_BAR;

const DEFAULT_STEPS = (): DrumStep[] =>
  Array.from({ length: TOTAL_STEPS }, () => ({
    active: false,
    velocity: 0.85,
  }));

@Component({
  selector: 'app-drum-machine',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './drum-machine.component.html',
  styleUrls: ['./drum-machine.component.css'],
})
export class DrumMachineComponent implements AfterViewInit, OnDestroy {
  readonly audioEngine = inject(AudioEngineService);
  private readonly micService = inject(MicrophoneService);
  private readonly aiService = inject(AiService);
  private readonly musicManager = inject(MusicManagerService);
  private readonly logger = inject(LoggingService);

  pads = signal<DrumPad[]>([
    {
      id: 'p1',
      name: 'KICK',
      type: 'kick',
      color: '#ec5b13',
      active: false,
      params: { pitch: 150, decay: 0.5, gain: 1.0, punch: 0.5, semitone: 0 },
      steps: DEFAULT_STEPS(),
      sampledBuffer: null,
    },
    {
      id: 'p2',
      name: 'SNARE',
      type: 'snare',
      color: '#a855f7',
      active: false,
      params: { frequency: 250, decay: 0.2, gain: 0.8, snap: 0.6, semitone: 0 },
      steps: DEFAULT_STEPS(),
      sampledBuffer: null,
    },
    {
      id: 'p3',
      name: 'HI-HAT (C)',
      type: 'hihat',
      color: '#10b981',
      active: false,
      params: {
        frequency: 10000,
        decay: 0.1,
        gain: 0.5,
        crispness: 0.8,
        semitone: 0,
      },
      steps: DEFAULT_STEPS(),
      sampledBuffer: null,
    },
    {
      id: 'p4',
      name: 'HI-HAT (O)',
      type: 'hihat',
      color: '#06b6d4',
      active: false,
      params: {
        frequency: 9000,
        decay: 0.6,
        gain: 0.45,
        crispness: 0.6,
        semitone: 0,
      },
      steps: DEFAULT_STEPS(),
      sampledBuffer: null,
    },
    {
      id: 'p5',
      name: 'CLAP',
      type: 'clap',
      color: '#ec5b13',
      active: false,
      params: {
        frequency: 1200,
        decay: 0.15,
        gain: 0.7,
        width: 0.5,
        semitone: 0,
      },
      steps: DEFAULT_STEPS(),
      sampledBuffer: null,
    },
    {
      id: 'p6',
      name: 'TOM HI',
      type: 'tom',
      color: '#a855f7',
      active: false,
      params: { pitch: 100, decay: 0.4, gain: 0.8, thump: 0.4, semitone: 0 },
      steps: DEFAULT_STEPS(),
      sampledBuffer: null,
    },
    {
      id: 'p7',
      name: 'TOM LO',
      type: 'tom',
      color: '#8b5cf6',
      active: false,
      params: { pitch: 70, decay: 0.5, gain: 0.8, thump: 0.5, semitone: 0 },
      steps: DEFAULT_STEPS(),
      sampledBuffer: null,
    },
    {
      id: 'p8',
      name: 'RIM',
      type: 'rim',
      color: '#10b981',
      active: false,
      params: {
        frequency: 5000,
        decay: 0.05,
        gain: 0.6,
        click: 0.9,
        semitone: 0,
      },
      steps: DEFAULT_STEPS(),
      sampledBuffer: null,
    },
    {
      id: 'p9',
      name: 'CRASH',
      type: 'crash',
      color: '#d946ef',
      active: false,
      params: {
        frequency: 8000,
        decay: 1.5,
        gain: 0.4,
        shimmer: 0.6,
        semitone: 0,
      },
      steps: DEFAULT_STEPS(),
      sampledBuffer: null,
    },
    {
      id: 'p10',
      name: 'RIDE',
      type: 'ride',
      color: '#f59e0b',
      active: false,
      params: {
        frequency: 6500,
        decay: 0.8,
        gain: 0.4,
        shimmer: 0.4,
        semitone: 0,
      },
      steps: DEFAULT_STEPS(),
      sampledBuffer: null,
    },
    {
      id: 'p11',
      name: 'COWBELL',
      type: 'cowbell',
      color: '#ef4444',
      active: false,
      params: { pitch: 562, decay: 0.7, gain: 0.5, tone: 0.6, semitone: 0 },
      steps: DEFAULT_STEPS(),
      sampledBuffer: null,
    },
    {
      id: 'p12',
      name: 'SHAKER',
      type: 'shaker',
      color: '#84cc16',
      active: false,
      params: {
        frequency: 6000,
        decay: 0.12,
        gain: 0.4,
        rattle: 0.7,
        semitone: 0,
      },
      steps: DEFAULT_STEPS(),
      sampledBuffer: null,
    },
  ]);

  selectedPad = signal<DrumPad | null>(this.pads()[0]);
  currentStep = signal(-1);
  isSequencerRunning = computed(() => this.audioEngine.isPlaying());

  // Microphone state
  micStatus = signal<'idle' | 'armed' | 'recording' | 'done'>('idle');
  micCountdown = signal(0);
  private micCountdownTimer: any = null;

  // AI generation state
  isGeneratingPattern = signal(false);
  @Input() isStudioOverlay = false;
  activeTab = signal<'sequencer' | 'pads' | 'params'>('sequencer');
  @Output() closeOverlay = new EventEmitter<void>();

  velocityDragStep = signal<{ padId: string; stepIdx: number } | null>(null);

  @ViewChild('visualizer') visualizerRef!: ElementRef<HTMLCanvasElement>;

  private prevSchedulerHook:
    | ((si: number, when: number, sd: number) => void)
    | undefined;
  private animationId: number | null = null;
  readonly patternBars = DRUM_MACHINE_BARS;
  readonly stepsPerBar = STEPS_PER_BAR;
  readonly stepRange = Array.from({ length: TOTAL_STEPS }, (_, i) => i);

  constructor() {
    // Wire into the audio engine scheduler to trigger steps
    effect(() => {
      const running = this.audioEngine.isPlaying();
      if (!running) {
        this.currentStep.set(-1);
      }
    });

    this.prevSchedulerHook = this.audioEngine.onScheduleStep;
    const origHook = this.prevSchedulerHook;
    this.audioEngine.onScheduleStep = (stepIndex, when, stepDur) => {
      origHook?.(stepIndex, when, stepDur);
      const drumStep = stepIndex % this.stepRange.length;
      this.currentStep.set(drumStep);
      for (const pad of this.pads()) {
        const step = pad.steps[drumStep];
        if (step?.active) {
          this.schedulePad(pad, when, step.velocity);
        }
      }
    };
  }

  ngAfterViewInit() {
    if (this.visualizerRef) {
      this.startVisualizer();
    }
  }

  ngOnDestroy() {
    // Restore previous hook
    this.audioEngine.onScheduleStep = this.prevSchedulerHook;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    clearTimeout(this.micCountdownTimer);
  }

  selectPad(pad: DrumPad) {
    this.selectedPad.set(pad);
  }

  toggleStep(pad: DrumPad, stepIdx: number) {
    this.pads.update((pads) =>
      pads.map((p) => {
        if (p.id !== pad.id) return p;
        const newSteps = [...p.steps];
        newSteps[stepIdx] = {
          ...newSteps[stepIdx],
          active: !newSteps[stepIdx].active,
        };
        return { ...p, steps: newSteps };
      })
    );
    // Keep selectedPad in sync
    if (this.selectedPad()?.id === pad.id) {
      this.selectedPad.set(this.pads().find((p) => p.id === pad.id) ?? null);
    }

    // Sync with MusicManagerService
    const track = this.musicManager
      .tracks()
      .find((t) => t.name.toLowerCase().includes(pad.name.toLowerCase()));
    if (track) {
      this.musicManager.toggleStep(track.id, stepIdx);
    }
  }

  setStepVelocity(pad: DrumPad, stepIdx: number, velocity: number) {
    this.pads.update((pads) =>
      pads.map((p) => {
        if (p.id !== pad.id) return p;
        const newSteps = [...p.steps];
        newSteps[stepIdx] = {
          ...newSteps[stepIdx],
          velocity: Math.max(0.05, Math.min(1, velocity)),
        };
        return { ...p, steps: newSteps };
      })
    );
  }

  triggerPad(pad: DrumPad) {
    pad.active = true;
    setTimeout(() => (pad.active = false), 100);
    const ctx = this.audioEngine.ctx;
    this.schedulePad(pad, ctx.currentTime, 1.0);
  }

  private schedulePad(pad: DrumPad, when: number, velocity: number) {
    // If this pad has a sampled buffer, play that
    if (pad.sampledBuffer) {
      this.playSampledBuffer(pad.sampledBuffer, when, velocity, pad.params);
      return;
    }

    const ctx = this.audioEngine.ctx;
    const dest = this.audioEngine.masterGain;
    const p = pad.params;
    const semitoneRatio = Math.pow(2, (p.semitone || 0) / 12);

    if (pad.type === 'kick' || pad.type === 'tom') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(dest);
      const basePitch = Math.max(10, (p.pitch || 150) * semitoneRatio);
      osc.frequency.setValueAtTime(basePitch, when);
      osc.frequency.exponentialRampToValueAtTime(0.01, when + p.decay);
      gain.gain.setValueAtTime(p.gain * velocity, when);
      gain.gain.exponentialRampToValueAtTime(0.01, when + p.decay);
      osc.start(when);
      osc.stop(when + p.decay);

      if (pad.type === 'kick' && (p.punch || 0) > 0) {
        const punchOsc = ctx.createOscillator();
        const punchGain = ctx.createGain();
        punchOsc.connect(punchGain);
        punchGain.connect(dest);
        punchOsc.frequency.setValueAtTime(400, when);
        punchOsc.frequency.exponentialRampToValueAtTime(100, when + 0.02);
        punchGain.gain.setValueAtTime(p.punch * p.gain * velocity, when);
        punchGain.gain.exponentialRampToValueAtTime(0.01, when + 0.02);
        punchOsc.start(when);
        punchOsc.stop(when + 0.02);
      }
    } else if (pad.type === 'snare') {
      const bufferSize = Math.ceil(ctx.sampleRate * p.decay);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.value = 1000 + (p.snap || 0) * 2000;
      const noiseGain = ctx.createGain();
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(dest);
      noiseGain.gain.setValueAtTime(p.gain * velocity, when);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, when + p.decay);
      noise.start(when);

      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'triangle';
      osc.connect(oscGain);
      oscGain.connect(dest);
      osc.frequency.setValueAtTime(
        Math.max(10, (p.frequency || 250) * semitoneRatio),
        when
      );
      oscGain.gain.setValueAtTime(p.gain * velocity * 0.5, when);
      oscGain.gain.exponentialRampToValueAtTime(0.01, when + p.decay);
      osc.start(when);
      osc.stop(when + p.decay);
    } else if (pad.type === 'clap') {
      // Multi-burst noise for clap
      for (let b = 0; b < 3; b++) {
        const offset = b * 0.012;
        const bufferSize = Math.ceil(ctx.sampleRate * 0.04);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const bandpass = ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = (p.frequency || 1200) * semitoneRatio;
        bandpass.Q.value = 1 + (p.width || 0.5) * 4;
        const cGain = ctx.createGain();
        noise.connect(bandpass).connect(cGain).connect(dest);
        cGain.gain.setValueAtTime(p.gain * velocity, when + offset);
        cGain.gain.exponentialRampToValueAtTime(0.01, when + offset + 0.04);
        noise.start(when + offset);
      }
    } else if (pad.type === 'hihat' || pad.type === 'rim') {
      const bufferSize = Math.ceil(ctx.sampleRate * p.decay);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = (p.frequency || 10000) * semitoneRatio;
      bandpass.Q.value = 5 + (p.crispness || p.click || 0) * 10;
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 7000;
      const gain = ctx.createGain();
      noise.connect(bandpass);
      bandpass.connect(highpass);
      highpass.connect(gain);
      gain.connect(dest);
      gain.gain.setValueAtTime(p.gain * velocity * 0.5, when);
      gain.gain.exponentialRampToValueAtTime(0.01, when + p.decay);
      noise.start(when);
    } else if (pad.type === 'crash' || pad.type === 'ride') {
      const bufferSize = Math.ceil(ctx.sampleRate * p.decay);
      const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < bufferSize; i++)
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 0.5);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const hipass = ctx.createBiquadFilter();
      hipass.type = 'highpass';
      hipass.frequency.value = (p.frequency || 8000) * semitoneRatio;
      const gain = ctx.createGain();
      noise.connect(hipass).connect(gain).connect(dest);
      gain.gain.setValueAtTime(p.gain * velocity * 0.6, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + p.decay);
      noise.start(when);
    } else if (pad.type === 'cowbell') {
      const freq1 = Math.max(10, (p.pitch || 562) * semitoneRatio);
      const freq2 = freq1 * 1.47;
      [freq1, freq2].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = freq;
        const flt = ctx.createBiquadFilter();
        flt.type = 'bandpass';
        flt.frequency.value = freq;
        flt.Q.value = 5 + (p.tone || 0.5) * 10;
        const gn = ctx.createGain();
        osc.connect(flt).connect(gn).connect(dest);
        gn.gain.setValueAtTime(p.gain * velocity * (i === 0 ? 0.6 : 0.4), when);
        gn.gain.exponentialRampToValueAtTime(0.001, when + p.decay);
        osc.start(when);
        osc.stop(when + p.decay);
      });
    } else if (pad.type === 'shaker' || pad.type === 'tambourine') {
      // Repeated short noise bursts
      const numBursts = pad.type === 'tambourine' ? 4 : 2;
      for (let b = 0; b < numBursts; b++) {
        const offset = b * (p.decay / numBursts) * 0.6;
        const bSize = Math.ceil(ctx.sampleRate * 0.02);
        const buf = ctx.createBuffer(1, bSize, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bSize; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = (p.frequency || 6000) * semitoneRatio;
        const gn = ctx.createGain();
        src.connect(hp).connect(gn).connect(dest);
        gn.gain.setValueAtTime(
          p.gain * velocity * (p.rattle || 0.7),
          when + offset
        );
        gn.gain.exponentialRampToValueAtTime(0.001, when + offset + 0.02);
        src.start(when + offset);
      }
    } else {
      // Fallback: kick-like
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain).connect(dest);
      osc.frequency.setValueAtTime(100, when);
      gain.gain.setValueAtTime(p.gain * velocity, when);
      gain.gain.exponentialRampToValueAtTime(0.01, when + 0.3);
      osc.start(when);
      osc.stop(when + 0.3);
    }
  }

  private playSampledBuffer(
    buffer: AudioBuffer,
    when: number,
    velocity: number,
    params: any
  ) {
    const ctx = this.audioEngine.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const semitoneRatio = Math.pow(2, (params.semitone || 0) / 12);
    src.playbackRate.value = semitoneRatio;
    const gain = ctx.createGain();
    gain.gain.value = (params.gain || 1) * velocity;
    src.connect(gain).connect(this.audioEngine.masterGain);
    src.start(when);
  }

  // ─── AI Pattern Generation ─────────────────────────────────────────────────

  async generateAiPattern() {
    if (this.isGeneratingPattern()) return;
    this.isGeneratingPattern.set(true);
    try {
      // Use genre-aware heuristic patterns, optionally enhanced by AI
      const style = await this.getPatternStyle();
      this.applyPatternStyle(style);
    } catch (e) {
      this.logger.warn('AI pattern generation failed, using heuristic', e);
      this.applyPatternStyle('standard');
    } finally {
      this.isGeneratingPattern.set(false);
    }
  }

  private async getPatternStyle(): Promise<string> {
    try {
      const resp = await this.aiService.generateAiResponse(
        'Name ONE beat pattern style in one word (e.g. "trap", "boom-bap", "house", "reggaeton", "drill", "afrobeats"). Only the style name, nothing else.'
      );
      const word = resp
        .trim()
        .toLowerCase()
        .replace(/[^a-z-]/g, '');
      return word || 'standard';
    } catch {
      return 'standard';
    }
  }

  private applyPatternStyle(style: string) {
    // Pre-defined patterns indexed by pad type
    const patterns: Record<string, Record<string, number[]>> = {
      standard: {
        kick: [0, 8],
        snare: [4, 12],
        'hi-hat (c)': [0, 2, 4, 6, 8, 10, 12, 14],
        'hi-hat (o)': [6, 14],
      },
      trap: {
        kick: [0, 3, 6, 10],
        snare: [4, 12],
        'hi-hat (c)': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        'hi-hat (o)': [7],
      },
      'boom-bap': {
        kick: [0, 6, 10],
        snare: [4, 12],
        'hi-hat (c)': [0, 2, 4, 6, 8, 10, 12, 14],
        clap: [4, 12],
      },
      house: {
        kick: [0, 4, 8, 12],
        snare: [4, 12],
        'hi-hat (c)': [2, 6, 10, 14],
        'hi-hat (o)': [2, 10],
      },
      drill: {
        kick: [0, 5, 8, 11],
        snare: [4, 12],
        'hi-hat (c)': [0, 2, 4, 6, 8, 10, 12, 14],
        'hi-hat (o)': [6],
      },
      reggaeton: {
        kick: [0, 3, 8, 11],
        snare: [4, 12],
        'hi-hat (c)': [0, 4, 8, 12],
        clap: [2, 6, 10, 14],
      },
      afrobeats: {
        kick: [0, 6, 10],
        snare: [4, 8, 12],
        'hi-hat (c)': [0, 2, 4, 6, 8, 10, 12, 14],
        shaker: [1, 3, 5, 7, 9, 11, 13, 15],
      },
    };

    const chosen = patterns[style] || patterns['standard'];

    this.pads.update((pads) =>
      pads.map((pad) => {
        const padNameKey = pad.name.toLowerCase();
        const matchKey = Object.keys(chosen).find((k) =>
          padNameKey.includes(k)
        );
        const activeSteps = matchKey ? chosen[matchKey] : [];
        const newSteps = DEFAULT_STEPS();
        for (let bar = 0; bar < this.patternBars; bar++) {
          for (const s of activeSteps) {
            const stepIndex = s + bar * this.stepsPerBar;
            if (stepIndex < this.stepRange.length) {
              newSteps[stepIndex].active = true;
              newSteps[stepIndex].velocity = 0.7 + Math.random() * 0.3;
            }
          }
        }
        if (activeSteps.length > 0 && Math.random() > 0.8) {
          const rnd = Math.floor(Math.random() * this.stepRange.length);
          newSteps[rnd].active = true;
          newSteps[rnd].velocity = 0.5 + Math.random() * 0.3;
        }
        return { ...pad, steps: newSteps };
      })
    );
  }

  clearPattern() {
    this.pads.update((pads) =>
      pads.map((pad) => ({ ...pad, steps: DEFAULT_STEPS() }))
    );
  }

  // ─── Microphone Sampling ───────────────────────────────────────────────────

  async armMicSample() {
    const pad = this.selectedPad();
    if (!pad) return;

    this.micStatus.set('armed');
    await this.micService.initialize();
    if (!this.micService.isInitialized()) {
      this.micStatus.set('idle');
      return;
    }

    this.micCountdown.set(3);
    this.micStatus.set('armed');
    const tick = () => {
      const n = this.micCountdown() - 1;
      if (n <= 0) {
        this.startMicRecording(pad);
      } else {
        this.micCountdown.set(n);
        this.micCountdownTimer = setTimeout(tick, 1000);
      }
    };
    this.micCountdownTimer = setTimeout(tick, 1000);
  }

  private startMicRecording(pad: DrumPad) {
    this.micStatus.set('recording');
    this.micService.startRecording();
    setTimeout(() => this.finishMicRecording(pad), 1000);
  }

  private async finishMicRecording(pad: DrumPad) {
    this.micService.stopRecording();
    // Wait for blob
    await new Promise((r) => setTimeout(r, 300));
    const blob = this.micService.recordedBlob();
    if (blob) {
      const arrayBuffer = await blob.arrayBuffer();
      try {
        const decoded = await this.audioEngine.ctx.decodeAudioData(arrayBuffer);
        this.pads.update((pads) =>
          pads.map((p) =>
            p.id === pad.id ? { ...p, sampledBuffer: decoded } : p
          )
        );
        if (this.selectedPad()?.id === pad.id) {
          const updated = this.pads().find((p) => p.id === pad.id);
          this.selectedPad.set(updated ?? null);
        }
        this.logger.info(
          'DrumMachine: Microphone sample loaded for pad',
          pad.name
        );
      } catch (e) {
        this.logger.error('DrumMachine: Failed to decode mic sample', e);
      }
    }
    this.micStatus.set('done');
    this.micService.stop();
    setTimeout(() => this.micStatus.set('idle'), 2000);
  }

  cancelMicArm() {
    clearTimeout(this.micCountdownTimer);
    this.micService.stop();
    this.micStatus.set('idle');
  }

  clearPadSample(pad: DrumPad) {
    this.pads.update((pads) =>
      pads.map((p) => (p.id === pad.id ? { ...p, sampledBuffer: null } : p))
    );
    if (this.selectedPad()?.id === pad.id) {
      const updated = this.pads().find((p) => p.id === pad.id);
      this.selectedPad.set(updated ?? null);
    }
  }

  // ─── Visualizer ───────────────────────────────────────────────────────────

  private startVisualizer() {
    const canvas = this.visualizerRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    const analyser = this.audioEngine.getMasterAnalyser();
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      this.animationId = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      ctx.fillStyle = '#0d0d0d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i] / 2;
        const r = 236;
        const g = 91 + dataArray[i] / 2;
        const b = 19 + dataArray[i] / 4;
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };
    draw();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  getStepColor(pad: DrumPad, stepIdx: number): string {
    const step = pad.steps[stepIdx];
    if (!step.active) return 'rgba(255,255,255,0.05)';
    const alpha = 0.4 + step.velocity * 0.6;
    return pad.color.startsWith('#')
      ? this.hexWithAlpha(pad.color, alpha)
      : pad.color;
  }

  getStepLabel(step: number): string {
    if (step % this.stepsPerBar === 0) {
      return `B${step / this.stepsPerBar + 1}`;
    }
    if (step % 4 === 0) {
      return `${(step % this.stepsPerBar) / 4 + 1}`;
    }
    return '·';
  }

  hexToRgb(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
  }

  private hexWithAlpha(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
}
