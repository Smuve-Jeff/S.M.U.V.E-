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
  };
}

@Injectable({ providedIn: 'root' })
export class InstrumentsService {
  private audioEngine = inject(AudioEngineService);

  presets: InstrumentPreset[] = [
    {
      id: 'grand-piano-v2',
      name: 'Grand Piano Elite',
      type: 'sample',
      category: 'piano',
      tags: ['classic', 'acoustic', 'high-fidelity', 'elite'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [21, 108],
          url: 'https://tonejs.github.io/audio/salamander/C4.mp3',
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
        q: 2.0,
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
        detune: 5
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
    }
  ];

  getPresets() {
    return this.presets;
  }

  async audition(presetId: string) {
    const preset = this.presets.find(p => p.id === presetId);
    if (!preset) return;

    const ctx = this.audioEngine.ctx;
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.connect(ctx.destination);
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(0.5, now + 0.05);
    out.gain.linearRampToValueAtTime(0, now + 0.5);

    if (preset.type === 'synth' && preset.synth) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();

      osc.type = preset.synth.type;
      osc.frequency.setValueAtTime(440, now); // Audition A4

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(preset.synth.cutoff, now);

      osc.connect(filter);
      filter.connect(out);

      osc.start(now);
      osc.stop(now + 0.5);
    } else if (preset.type === 'sample' && preset.zones?.[0]) {
        // Sample audition logic would go here, simplified for now
        this.audioEngine.logger.info(`Auditioning sample: ${preset.name}`);
    }
  }
}
