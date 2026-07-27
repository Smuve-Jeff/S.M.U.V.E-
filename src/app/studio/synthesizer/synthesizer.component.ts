import { LoggingService } from '../../services/logging.service';
import {
  Component,
  Input,
  OnInit,
  AfterViewInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Clip } from '../instrument.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { HapticService } from '../../services/haptic.service';

interface SynthPatch {
  id: string;
  name: string;
  description: string;
  beginnerTip: string;
  params: Record<string, any>;
}

interface LfoParams {
  wave: string;
  rate: number;
  depth: number;
  target: string;
}

/** Tooltip metadata for each synth parameter */
interface ParamTooltip {
  label: string;
  plain: string;
  icon: string;
}

type MobileTab = 'osc' | 'env' | 'filter' | 'fx';

@Component({
  selector: 'app-synthesizer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './synthesizer.component.html',
  styleUrls: ['./synthesizer.component.css'],
})
export class SynthesizerComponent implements OnInit, AfterViewInit, OnDestroy {
  private logger = inject(LoggingService);
  private audioEngine = inject(AudioEngineService);
  private haptic = inject(HapticService);

  @Input() clip: Clip | null = null;

  @ViewChild('waveformCanvas', { static: false })
  waveformCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('adsrCanvas', { static: false })
  adsrCanvas?: ElementRef<HTMLCanvasElement>;

  private waveformRaf: number | null = null;
  private adsrRaf: number | null = null;

  // ── Beginner mode toggle ──────────────────────────────
  isBeginner = signal<boolean>(
    localStorage.getItem('synth_beginner') !== 'false'
  );

  toggleBeginner() {
    this.isBeginner.update((v) => !v);
    try {
      localStorage.setItem('synth_beginner', String(this.isBeginner()));
    } catch {}
    this.haptic.light();
  }

  // ── Mobile tabs ───────────────────────────────────────
  activeTab = signal<MobileTab>('osc');

  setTab(tab: MobileTab) {
    this.activeTab.set(tab);
    this.haptic.light();
    // Redraw canvases when switching to relevant tabs
    requestAnimationFrame(() => {
      if (tab === 'osc') this.drawWaveform();
      if (tab === 'env') this.drawAdsr();
    });
  }

  mobileTabs: { key: MobileTab; label: string; icon: string }[] = [
    { key: 'osc', label: 'Oscillator', icon: 'waves' },
    { key: 'env', label: 'Envelope', icon: 'equalizer' },
    { key: 'filter', label: 'Filter', icon: 'tune' },
    { key: 'fx', label: 'Effects', icon: 'magic_button' },
  ];

  // ── ADSR stages ──────────────────────────────────────
  adStages = [
    { key: 'attack' as const, label: 'Attack', abbr: 'ATK', icon: '⚡' },
    { key: 'decay' as const, label: 'Decay', abbr: 'DEC', icon: '📉' },
    { key: 'sustain' as const, label: 'Sustain', abbr: 'SUS', icon: '📏' },
    { key: 'release' as const, label: 'Release', abbr: 'REL', icon: '🌊' },
  ];

  // ── LFO waveforms ────────────────────────────────────
  lfoWaves = [
    { value: 'sine', label: 'Smooth', icon: '∿' },
    { value: 'triangle', label: 'Ramp', icon: '△' },
    { value: 'square', label: 'Chop', icon: '⊓' },
    { value: 'sawtooth', label: 'Buzz', icon: '⋋' },
  ];

  // ── Param tooltips (beginner-friendly) ───────────────
  tooltips: Record<string, ParamTooltip> = {
    oscillator: {
      label: 'Wave Shape',
      plain:
        'This changes the basic character of your sound — from smooth and round to buzzy and sharp.',
      icon: '🎵',
    },
    cutoff: {
      label: 'Brightness',
      plain:
        'Turn up to make the sound brighter and sharper. Turn down for a muffled, dark tone.',
      icon: '🔆',
    },
    q: {
      label: 'Sharpness',
      plain:
        'Adds a nasal, whistling quality at higher values. Great for funky filter sweeps!',
      icon: '🎯',
    },
    attack: {
      label: 'Fade In',
      plain:
        'How fast the sound reaches full volume when you press a key. Low = instant, High = slow swell.',
      icon: '⚡',
    },
    decay: {
      label: 'Drop Off',
      plain:
        'How quickly the sound fades after the initial hit, before it holds steady.',
      icon: '📉',
    },
    sustain: {
      label: 'Hold Level',
      plain: 'The volume level the sound stays at while you hold the key down.',
      icon: '📏',
    },
    release: {
      label: 'Fade Out',
      plain: 'How long the sound rings out after you let go of the key.',
      icon: '🌊',
    },
    distortion: {
      label: 'Drive / Grit',
      plain:
        'Adds crunch and warmth. Low = clean, High = overdriven and aggressive.',
      icon: '🔥',
    },
    subOsc: {
      label: 'Sub Bass',
      plain:
        'Adds deep low-end power underneath your sound. Great for bass and pads.',
      icon: '💪',
    },
    subGain: {
      label: 'Sub Volume',
      plain:
        'How loud the deep sub bass is. Be careful — too much can shake the speakers!',
      icon: '🔊',
    },
  };

  // ── Synth parameters ─────────────────────────────────
  synthParams: any = {
    oscillator: 'sawtooth' as OscillatorType,
    subOsc: true,
    subType: 'sine' as OscillatorType,
    subGain: 0.3,
    attack: 0.01,
    decay: 0.2,
    sustain: 0.5,
    release: 0.8,
    cutoff: 2000,
    q: 1,
    distortion: 0.1,
  };

  // ── LFO parameters ───────────────────────────────────
  lfoParams: LfoParams = {
    wave: 'sine',
    rate: 1.0,
    depth: 0.3,
    target: 'cutoff',
  };

  // ── Patch system with beginner descriptions ──────────
  patches: SynthPatch[] = [
    {
      id: 'init',
      name: 'INIT',
      description: 'Default starting point',
      beginnerTip: 'Start here and tweak to make your own sound!',
      params: {
        oscillator: 'sawtooth',
        subOsc: true,
        subGain: 0.3,
        attack: 0.01,
        decay: 0.2,
        sustain: 0.5,
        release: 0.8,
        cutoff: 2000,
        q: 1,
        distortion: 0.1,
      },
    },
    {
      id: 'bass',
      name: 'BASS',
      description: 'Deep, rumbling low-end',
      beginnerTip: 'Perfect for hip-hop, trap, and electronic bass lines.',
      params: {
        oscillator: 'sawtooth',
        subOsc: true,
        subGain: 0.7,
        attack: 0.01,
        decay: 0.15,
        sustain: 0.6,
        release: 0.3,
        cutoff: 800,
        q: 3,
        distortion: 0.4,
      },
    },
    {
      id: 'lead',
      name: 'LEAD',
      description: 'Bright, cutting melody',
      beginnerTip: 'Use this for catchy melodies that stand out in the mix.',
      params: {
        oscillator: 'square',
        subOsc: false,
        subGain: 0,
        attack: 0.02,
        decay: 0.3,
        sustain: 0.7,
        release: 0.6,
        cutoff: 4000,
        q: 1.5,
        distortion: 0.15,
      },
    },
    {
      id: 'pad',
      name: 'PAD',
      description: 'Warm, flowing background',
      beginnerTip:
        'Great for filling space behind your voice. Hold chords for a lush bed of sound.',
      params: {
        oscillator: 'sine',
        subOsc: true,
        subGain: 0.4,
        attack: 0.3,
        decay: 0.5,
        sustain: 0.8,
        release: 1.5,
        cutoff: 3000,
        q: 0.5,
        distortion: 0.05,
      },
    },
    {
      id: 'pluck',
      name: 'PLUCK',
      description: 'Quick, snappy hits',
      beginnerTip:
        'Perfect for arpeggios and fast rhythmic patterns. Think harp or guitar.',
      params: {
        oscillator: 'triangle',
        subOsc: false,
        subGain: 0,
        attack: 0.001,
        decay: 0.08,
        sustain: 0,
        release: 0.15,
        cutoff: 6000,
        q: 0.8,
        distortion: 0.05,
      },
    },
    {
      id: 'warm-keys',
      name: 'KEYS',
      description: 'Classic electric piano',
      beginnerTip:
        'Sounds like a Rhodes or Wurlitzer. Great for R&B, soul, and lo-fi.',
      params: {
        oscillator: 'triangle',
        subOsc: true,
        subGain: 0.2,
        attack: 0.005,
        decay: 0.4,
        sustain: 0.3,
        release: 0.7,
        cutoff: 2500,
        q: 0.8,
        distortion: 0.08,
      },
    },
    {
      id: 'strings',
      name: 'STRINGS',
      description: 'Orchestral string section',
      beginnerTip:
        'Adds cinematic drama. Layer with pads for a movie-soundtrack feel.',
      params: {
        oscillator: 'sawtooth',
        subOsc: true,
        subGain: 0.15,
        attack: 0.4,
        decay: 0.6,
        sustain: 0.75,
        release: 2.0,
        cutoff: 3500,
        q: 0.3,
        distortion: 0.02,
      },
    },
    {
      id: 'wobble',
      name: 'WOBBLE',
      description: 'Dubstep wobble bass',
      beginnerTip:
        'The classic "wub wub" sound. Turn up the LFO rate for faster wobbles!',
      params: {
        oscillator: 'sawtooth',
        subOsc: true,
        subGain: 0.5,
        attack: 0.01,
        decay: 0.3,
        sustain: 0.7,
        release: 0.4,
        cutoff: 600,
        q: 8,
        distortion: 0.3,
      },
    },
  ];

  activePatchId = signal<string>('init');
  activePatch = signal<SynthPatch | null>(this.patches[0]);

  // ── Active tooltip (for mobile tap-to-learn) ─────────
  activeTooltip = signal<string | null>(null);

  showTooltip(key: string) {
    this.activeTooltip.update((cur) => (cur === key ? null : key));
  }

  // ── Oscillator type descriptions ─────────────────────
  oscDescriptions: Record<string, string> = {
    sine: 'Pure & smooth — like a flute',
    square: 'Retro & hollow — like old video games',
    sawtooth: 'Bright & buzzy — most versatile',
    triangle: 'Soft & mellow — between sine and saw',
  };

  constructor() {}

  ngOnInit(): void {
    if (this.clip && this.clip.synthParams) {
      this.synthParams = { ...this.synthParams, ...this.clip.synthParams };
    }
  }

  ngAfterViewInit(): void {
    requestAnimationFrame(() => {
      this.drawWaveform();
      this.drawAdsr();
    });
  }

  ngOnDestroy(): void {
    if (this.waveformRaf !== null) cancelAnimationFrame(this.waveformRaf);
    if (this.adsrRaf !== null) cancelAnimationFrame(this.adsrRaf);
  }

  // ── Patch management ─────────────────────────────────
  loadPatch(patchId: string): void {
    const patch = this.patches.find((p) => p.id === patchId);
    if (!patch) return;
    this.haptic.light();
    this.activePatchId.set(patchId);
    this.activePatch.set(patch);
    this.synthParams = { ...this.synthParams, ...patch.params };
    this.logger.info(`Synth patch loaded: ${patch.name}`);
    requestAnimationFrame(() => {
      this.drawWaveform();
      this.drawAdsr();
    });
  }

  // ── Synth param updates ──────────────────────────────
  updateSynthParam(param: string, value: any): void {
    this.synthParams[param] = value;
    this.logger.info(`Synth ${param}: ${value}`);
    if (this.clip) {
      this.clip.synthParams = { ...this.synthParams };
    }
    if (param === 'distortion') {
      this.audioEngine.setSaturation(value);
    }
    this.activePatchId.set('init');
    // Redraw affected visualizations
    if (['attack', 'decay', 'sustain', 'release'].includes(param)) {
      this.drawAdsr();
    }
    if (['oscillator'].includes(param)) {
      this.drawWaveform();
    }
  }

  // ── LFO param updates ────────────────────────────────
  updateLfoParam(param: string, value: any): void {
    (this.lfoParams as any)[param] = value;
    this.logger.info(`LFO ${param}: ${value}`);
    (this.audioEngine as any).setLfoParam?.(param, value);
  }

  // ── Waveform visualization ───────────────────────────
  private drawWaveform(): void {
    const canvas = this.waveformCanvas?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const type = this.synthParams.oscillator as string;
    const mid = h / 2;
    const amp = h * 0.35;

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();

    // Draw waveform
    ctx.strokeStyle = '#0E7C7B';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(14, 124, 123, 0.5)';
    ctx.shadowBlur = 8;
    ctx.beginPath();

    for (let x = 0; x < w; x++) {
      const t = (x / w) * Math.PI * 4;
      let y = 0;

      switch (type) {
        case 'sine':
          y = Math.sin(t);
          break;
        case 'square':
          y = Math.sin(t) >= 0 ? 1 : -1;
          break;
        case 'sawtooth':
          y = 2 * ((t / (2 * Math.PI)) % 1) - 1;
          break;
        case 'triangle':
          y = Math.abs(4 * ((t / (2 * Math.PI)) % 1) - 2) - 1;
          break;
        default:
          y = Math.sin(t);
      }

      const py = mid - y * amp;
      if (x === 0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    }

    ctx.stroke();
    ctx.shadowBlur = 0;

    // Sub oscillator preview (dimmer)
    if (this.synthParams.subOsc) {
      ctx.strokeStyle = 'rgba(14, 124, 123, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const t = (x / w) * Math.PI * 2; // one octave lower
        const y = Math.sin(t) * this.synthParams.subGain;
        const py = mid - y * amp;
        if (x === 0) ctx.moveTo(x, py);
        else ctx.lineTo(x, py);
      }
      ctx.stroke();
    }

    // Oscillator type label
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '900 10px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(type.toUpperCase(), w - 8, 16);
  }

  // ── ADSR envelope visualization ──────────────────────
  private drawAdsr(): void {
    const canvas = this.adsrCanvas?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const a = Math.max(0.001, this.synthParams.attack);
    const d = Math.max(0.001, this.synthParams.decay);
    const s = Math.max(0, Math.min(1, this.synthParams.sustain));
    const r = Math.max(0.001, this.synthParams.release);

    // Normalize to fit canvas width
    const total = a + d + 0.5 + r; // 0.5 = arbitrary sustain hold width
    const ax = (a / total) * w * 0.8;
    const dx = (d / total) * w * 0.8;
    const sx = (0.5 / total) * w * 0.8;
    const rx = (r / total) * w * 0.8;
    const startX = (w - (ax + dx + sx + rx)) / 2;

    const top = h * 0.15;
    const bottom = h * 0.85;
    const sustainY = bottom - s * (bottom - top);

    // Fill area under curve
    ctx.fillStyle = 'rgba(14, 124, 123, 0.12)';
    ctx.beginPath();
    ctx.moveTo(startX, bottom);
    ctx.lineTo(startX + ax, top);
    ctx.lineTo(startX + ax + dx, sustainY);
    ctx.lineTo(startX + ax + dx + sx, sustainY);
    ctx.lineTo(startX + ax + dx + sx + rx, bottom);
    ctx.closePath();
    ctx.fill();

    // Draw curve
    ctx.strokeStyle = '#0E7C7B';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(14, 124, 123, 0.5)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(startX, bottom);
    ctx.lineTo(startX + ax, top);
    ctx.lineTo(startX + ax + dx, sustainY);
    ctx.lineTo(startX + ax + dx + sx, sustainY);
    ctx.lineTo(startX + ax + dx + sx + rx, bottom);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Stage labels
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '700 8px system-ui';
    ctx.textAlign = 'center';
    const labels = ['A', 'D', 'S', 'R'];
    const labelXs = [
      startX + ax / 2,
      startX + ax + dx / 2,
      startX + ax + dx + sx / 2,
      startX + ax + dx + sx + rx / 2,
    ];
    labels.forEach((l, i) => ctx.fillText(l, labelXs[i], bottom - 6));
  }

  // ── Helper: format Hz for display ────────────────────
  formatHz(val: number): string {
    if (val >= 1000) return (val / 1000).toFixed(1) + ' kHz';
    return val.toFixed(0) + ' Hz';
  }
}
