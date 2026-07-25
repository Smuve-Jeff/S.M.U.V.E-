import { LoggingService } from '../../services/logging.service';
import {
  Component,
  Input,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Clip } from '../instrument.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { HapticService } from '../../services/haptic.service';

interface SynthPatch {
  id: string;
  name: string;
  params: Record<string, any>;
}

interface LfoParams {
  wave: string;
  rate: number;
  depth: number;
  target: string;
}

@Component({
  selector: 'app-synthesizer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './synthesizer.component.html',
  styleUrls: ['./synthesizer.component.css'],
})
export class SynthesizerComponent implements OnInit {
  private logger = inject(LoggingService);
  private audioEngine = inject(AudioEngineService);
  private haptic = inject(HapticService);

  @Input() clip: Clip | null = null;

  // ── ADSR stages for template iteration ───────────────
  adStages = [
    { key: 'attack' as const,  label: 'Attack',  abbr: 'ATK' },
    { key: 'decay' as const,   label: 'Decay',   abbr: 'DEC' },
    { key: 'sustain' as const, label: 'Sustain', abbr: 'SUS' },
    { key: 'release' as const, label: 'Release', abbr: 'REL' },
  ];

  // ── LFO waveform icons ───────────────────────────────
  lfoWaves = [
    { value: 'sine',     label: 'Sine',     icon: '∿' },
    { value: 'triangle', label: 'Triangle', icon: '△' },
    { value: 'square',   label: 'Square',   icon: '⊓' },
    { value: 'sawtooth', label: 'Saw',      icon: '⋋' },
  ];

  // ── Default synthesizer parameters ───────────────────
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

  // ── Patch system ─────────────────────────────────────
  patches: SynthPatch[] = [
    {
      id: 'init',
      name: 'INIT',
      params: {
        oscillator: 'sawtooth', subOsc: true, subGain: 0.3,
        attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.8,
        cutoff: 2000, q: 1, distortion: 0.1,
      },
    },
    {
      id: 'bass',
      name: 'BASS',
      params: {
        oscillator: 'sawtooth', subOsc: true, subGain: 0.7,
        attack: 0.01, decay: 0.15, sustain: 0.6, release: 0.3,
        cutoff: 800, q: 3, distortion: 0.4,
      },
    },
    {
      id: 'lead',
      name: 'LEAD',
      params: {
        oscillator: 'square', subOsc: false, subGain: 0,
        attack: 0.02, decay: 0.3, sustain: 0.7, release: 0.6,
        cutoff: 4000, q: 1.5, distortion: 0.15,
      },
    },
    {
      id: 'pad',
      name: 'PAD',
      params: {
        oscillator: 'sine', subOsc: true, subGain: 0.4,
        attack: 0.3, decay: 0.5, sustain: 0.8, release: 1.5,
        cutoff: 3000, q: 0.5, distortion: 0.05,
      },
    },
    {
      id: 'pluck',
      name: 'PLUCK',
      params: {
        oscillator: 'triangle', subOsc: false, subGain: 0,
        attack: 0.001, decay: 0.08, sustain: 0, release: 0.15,
        cutoff: 6000, q: 0.8, distortion: 0.05,
      },
    },
  ];

  activePatchId = signal<string>('init');
  activePatch = signal<SynthPatch | null>(this.patches[0]);

  constructor() {}

  ngOnInit(): void {
    if (this.clip && this.clip.synthParams) {
      this.synthParams = { ...this.synthParams, ...this.clip.synthParams };
    }
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
    this.activePatchId.set('init'); // deviate from preset
  }

  // ── LFO param updates ────────────────────────────────
  updateLfoParam(param: string, value: any): void {
    (this.lfoParams as any)[param] = value;
    this.logger.info(`LFO ${param}: ${value}`);
    (this.audioEngine as any).setLfoParam?.(param, value);
  }
}
