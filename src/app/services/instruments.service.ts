import { Injectable } from '@angular/core';

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
  presets: InstrumentPreset[] = [
    {
      id: 'grand-piano',
      name: 'Grand Piano',
      type: 'sample',
      category: 'piano',
      tags: ['classic', 'acoustic', 'high-fidelity'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [21, 108],
          url: 'https://tonejs.github.io/audio/salamander/C4.mp3', // Fallback to hosted for now if local missing
          velLayers: [
            {
              threshold: 0.5,
              url: 'https://tonejs.github.io/audio/salamander/C4.mp3',
            },
          ],
        },
      ],
    },
    {
      id: 'deep-sub-bass',
      name: 'Deep Sub Bass',
      type: 'synth',
      category: 'bass',
      tags: ['sub', 'low-end', 'trap', 'minimal'],
      synth: {
        type: 'sine',
        attack: 0.05,
        decay: 0.3,
        sustain: 0.8,
        release: 0.4,
        cutoff: 150,
        q: 1,
      },
    },
    {
      id: 'hard-808',
      name: 'Hard 808',
      type: 'synth',
      category: 'bass',
      tags: ['distorted', 'trap', 'drill', 'kick'],
      synth: {
        type: 'square',
        attack: 0.002,
        decay: 0.6,
        sustain: 0.0,
        release: 0.8,
        cutoff: 500,
        q: 2.5,
      },
    },
    {
      id: 'plucky-bass',
      name: 'Plucky Bass',
      type: 'synth',
      category: 'bass',
      tags: ['pluck', 'house', 'dance'],
      synth: {
        type: 'sawtooth',
        attack: 0.005,
        decay: 0.2,
        sustain: 0.2,
        release: 0.2,
        cutoff: 2000,
        q: 1.2,
      },
    },
    {
      id: 'ethereal-pad',
      name: 'Ethereal Pad',
      type: 'synth',
      category: 'pad',
      tags: ['ambient', 'space', 'lush', 'chill'],
      synth: {
        type: 'sawtooth',
        attack: 0.8,
        decay: 1.2,
        sustain: 0.7,
        release: 1.5,
        cutoff: 1200,
        q: 0.5,
      },
    },
    {
      id: 'cyber-lead',
      name: 'Cyber Lead',
      type: 'synth',
      category: 'lead',
      tags: ['edm', 'future', 'aggressive'],
      synth: {
        type: 'sawtooth',
        attack: 0.02,
        decay: 0.1,
        sustain: 0.8,
        release: 0.2,
        cutoff: 6000,
        q: 1.5,
      },
    },
    {
      id: 'lofi-rhodes',
      name: 'Lo-Fi Rhodes',
      type: 'synth',
      category: 'keys',
      tags: ['warm', 'vintage', 'chill', 'jazzy'],
      synth: {
        type: 'sine',
        attack: 0.01,
        decay: 0.2,
        sustain: 0.6,
        release: 0.3,
        cutoff: 1800,
        q: 0.8,
      },
    },
    {
      id: 'solo-violin',
      name: 'Solo Violin',
      type: 'synth',
      category: 'strings',
      tags: ['classical', 'expressive', 'orchestral'],
      synth: {
        type: 'sawtooth',
        attack: 0.2,
        decay: 0.1,
        sustain: 0.8,
        release: 0.5,
        cutoff: 4000,
        q: 1.5,
      },
    },
    {
      id: 'cinematic-strings',
      name: 'Cinematic Strings',
      type: 'synth',
      category: 'strings',
      tags: ['orchestral', 'epic', 'pad'],
      synth: {
        type: 'sawtooth',
        attack: 1.5,
        decay: 2.0,
        sustain: 0.7,
        release: 2.0,
        cutoff: 2500,
        q: 0.5,
      },
    },
    {
      id: 'acoustic-guitar',
      name: 'Acoustic Guitar',
      type: 'synth',
      category: 'guitar',
      tags: ['folk', 'acoustic', 'pluck'],
      synth: {
        type: 'sine',
        attack: 0.005,
        decay: 0.8,
        sustain: 0.0,
        release: 0.8,
        cutoff: 3000,
        q: 1.0,
      },
    },
    {
      id: 'electric-guitar-clean',
      name: 'Electric Guitar (Clean)',
      type: 'synth',
      category: 'guitar',
      tags: ['clean', 'jazz', 'funk'],
      synth: {
        type: 'triangle',
        attack: 0.01,
        decay: 0.6,
        sustain: 0.2,
        release: 0.4,
        cutoff: 5000,
        q: 1.2,
      },
    },
    {
      id: 'kit-808-pro',
      name: '808 Pro Kit',
      type: 'sample',
      category: 'drum',
      tags: ['trap', 'drums', 'classic'],
      zones: [{ midiRange: [36, 48], url: '/assets/samples/808/kit.mp3' }],
    },
    {
      id: 'fx-riser',
      name: 'Titan Riser',
      type: 'synth',
      category: 'vfx',
      tags: ['fx', 'transition', 'cinematic'],
      synth: {
        type: 'sawtooth',
        attack: 4.0,
        decay: 0.1,
        sustain: 1.0,
        release: 0.5,
        cutoff: 12000,
        q: 2.0,
      },
    },
  ];

  getPresets() {
    return this.presets;
  }
}
