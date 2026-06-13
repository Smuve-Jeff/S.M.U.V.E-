import { Injectable, inject } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';

export type SampleZone = {
  midiRange: [number, number];
  url: string;
  rr?: number;
  velLayers?: { threshold: number; url: string }[];
  quality?: 'standard' | 'high';
};

export type InstrumentArticulation = {
  attack: number;
  release: number;
  tone: number;
  character: number;
};

export interface InstrumentPreset {
  id: string;
  name: string;
  type: 'sample' | 'synth';
  category:
    | 'piano'
    | 'bass'
    | 'drum'
    | 'keys'
    | 'lead'
    | 'pad'
    | 'guitar'
    | 'strings'
    | 'vfx'
    | 'perc'
    | 'other';
  tags: string[];
  previewUrl?: string;
  sampleQuality?: 'standard' | 'high';
  fallbackPresetId?: string;
  articulation?: InstrumentArticulation;
  zones?: SampleZone[];
  defaultFx?: {
    id: string;
    type: string;
    params: any;
    enabled: boolean;
    mix?: number;
  }[];
  synth?: {
    type: OscillatorType;
    attack: number;
    decay: number;
    sustain: number;
    release: number;
    cutoff: number;
    q: number;
    resonance?: number;
    detune?: number;
    lfoRate?: number;
    lfoAmount?: number;
  };
}

@Injectable({ providedIn: 'root' })
export class InstrumentsService {
  private audioEngine = inject(AudioEngineService);

  presets: InstrumentPreset[] = [
    {
      id: 'grand-piano',
      name: 'Grand Piano Elite',
      type: 'sample',
      category: 'piano',
      tags: ['classic', 'acoustic', 'high-fidelity', 'elite'],
      sampleQuality: 'high',
      fallbackPresetId: 'stage-piano',
      zones: [
        {
          midiRange: [21, 108],
          url: 'https://tonejs.github.io/audio/salamander/C4.mp3',
          velLayers: [
            {
              threshold: 64,
              url: 'https://tonejs.github.io/audio/salamander/C4_vel1.mp3',
            },
            {
              threshold: 127,
              url: 'https://tonejs.github.io/audio/salamander/C4_vel2.mp3',
            },
          ],
        },
      ],
    },
    {
      id: 'strat-elite-clean',
      name: 'Strat Elite Clean',
      type: 'sample',
      category: 'guitar',
      tags: ['electric', 'clean', 'stratocaster', 'elite'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [40, 88],
          url: 'https://tonejs.github.io/audio/casio/G3.mp3', // Placeholder using available Tone.js assets
        },
      ],
    },
    {
      id: 'chamber-strings-elite',
      name: 'Chamber Strings Elite',
      type: 'sample',
      category: 'strings',
      tags: ['orchestral', 'ensemble', 'high-fidelity', 'elite'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [36, 96],
          url: 'https://tonejs.github.io/audio/berlin/strings_sustain_C4.mp3', // Representational URL
        },
      ],
    },
    {
      id: 'p-bass-elite',
      name: 'P-Bass Elite',
      type: 'sample',
      category: 'bass',
      tags: ['electric', 'bass', 'precision', 'elite'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [28, 64],
          url: 'https://tonejs.github.io/audio/casio/A1.mp3',
        },
      ],
    },
    {
      id: 'solo-violin-elite',
      name: 'Solo Violin Elite',
      type: 'sample',
      category: 'strings',
      tags: ['acoustic', 'solo', 'virtuoso', 'elite'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [55, 103],
          url: 'https://tonejs.github.io/audio/berlin/violin_sustain_C4.mp3',
        },
      ],
    },
    {
      id: 'analog-warmth',
      name: 'Analog Warmth',
      type: 'synth',
      category: 'lead',
      tags: ['analog', 'warm', 'moog-style'],
      synth: {
        type: 'sawtooth',
        attack: 0.1,
        decay: 0.2,
        sustain: 0.5,
        release: 0.4,
        cutoff: 800,
        q: 2.0, lfoRate: 5, lfoAmount: 20,
      },
    },
    {
      id: 'sub-commander',
      name: 'Sub Commander',
      type: 'synth',
      category: 'bass',
      tags: ['sub', 'deep', 'electronic'],
      synth: {
        type: 'sine',
        attack: 0.08,
        decay: 0.4,
        sustain: 0.8,
        release: 0.6,
        cutoff: 120,
        q: 1,
      },
    },
    {
      id: 'trap-808-elite',
      name: 'Trap 808 Elite',
      type: 'synth',
      category: 'bass',
      tags: ['808', 'trap', 'saturated'],
      synth: {
        type: 'triangle',
        attack: 0.001,
        decay: 0.8,
        sustain: 0.0,
        release: 0.8,
        cutoff: 400,
        q: 3.0,
        detune: 5,
      },
    },
    {
      id: 'ethereal-wind',
      name: 'Ethereal Wind',
      type: 'synth',
      category: 'pad',
      tags: ['ambient', 'wind', 'lush'],
      synth: {
        type: 'sawtooth',
        attack: 1.2,
        decay: 1.5,
        sustain: 0.8,
        release: 2.0,
        cutoff: 1500,
        q: 0.3,
      },
    },
    {
      id: 'cyber-stab',
      name: 'Cyber Stab',
      type: 'synth',
      category: 'vfx',
      tags: ['futuristic', 'impact', 'short'],
      synth: {
        type: 'square',
        attack: 0.01,
        decay: 0.1,
        sustain: 0,
        release: 0.1,
        cutoff: 4000,
        q: 8.0,
      },
    },
    {
      id: 'deep-orbit',
      name: 'Deep Orbit',
      type: 'synth',
      category: 'pad',
      tags: ['space', 'dark', 'evolve'],
      synth: {
        type: 'sawtooth',
        attack: 3.0,
        decay: 2.0,
        sustain: 0.9,
        release: 4.0,
        cutoff: 600,
        q: 0.5,
        detune: 12,
      },
    },
    {
      id: 'neon-shimmer',
      name: 'Neon Shimmer',
      type: 'synth',
      category: 'keys',
      tags: ['bright', 'digital', 'dreamy'],
      synth: {
        type: 'sine',
        attack: 0.05,
        decay: 0.5,
        sustain: 0.4,
        release: 1.2,
        cutoff: 3000,
        q: 1.5,
        detune: 2,
      },
    },
  ];

  getPresets() {
    return this.presets;
  }

  async audition(presetId: string) {
    const preset = this.presets.find((p) => p.id === presetId);
    if (!preset) return;

    const ctx = this.audioEngine.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.connect(ctx.destination);
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(0.3, now + 0.05);
    out.gain.linearRampToValueAtTime(0, now + 0.5);

    if (preset.type === 'synth' && preset.synth) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();

      osc.type = preset.synth.type;
      osc.frequency.setValueAtTime(preset.category === 'bass' ? 110 : 440, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(preset.synth.cutoff, now);
      filter.Q.setValueAtTime(preset.synth.q, now);

      osc.connect(filter);
      filter.connect(out);

      osc.start(now);
      osc.stop(now + 0.5);
    } else if (preset.type === 'sample' && preset.zones?.[0]) {
      this.audioEngine.logger.info(`Auditioning sample: ${preset.name}`);
      const osc = ctx.createOscillator();
      osc.connect(out);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  }
}
