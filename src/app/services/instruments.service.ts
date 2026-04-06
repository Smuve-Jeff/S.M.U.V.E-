import { Injectable } from '@angular/core';

export type SampleZone = {
  midiRange: [number, number];
  url: string; // Audio file URL
  rr?: number; // round-robin variants count
  velLayers?: { threshold: number; url: string }[]; // optional velocity layering
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
  category?: 'piano' | 'bass' | 'drum' | 'keys' | 'lead' | 'pad' | 'guitar' | 'strings' | 'other';
  sampleQuality?: 'standard' | 'high';
  fallbackPresetId?: string;
  articulation?: InstrumentArticulation;
  zones?: SampleZone[]; // for sample-based instruments
  defaultFx?: { id: string; type: string; params: any; enabled: boolean; mix?: number }[];
  synth?: {
    type: OscillatorType;
    attack: number;
    decay: number;
    sustain: number;
    release: number;
    cutoff: number;
    q: number;
  };
}

@Injectable({ providedIn: 'root' })
export class InstrumentsService {
  // Placeholder sample URLs; replace with your licensed sample paths in assets/samples
  presets: InstrumentPreset[] = [
    {
      id: 'grand-piano',
      name: 'Grand Piano',
      type: 'sample',
      category: 'piano',
      sampleQuality: 'high',
      fallbackPresetId: 'stage-piano',
      articulation: {
        attack: 0.02,
        release: 0.7,
        tone: 0.65,
        character: 0.5,
      },
      zones: [
        {
          midiRange: [21, 108],
          url: '/assets/samples/piano/piano_C4.mp3',
          rr: 3,
          quality: 'high',
          velLayers: [
            { threshold: 0.35, url: '/assets/samples/piano/piano_C4_soft.mp3' },
            { threshold: 0.75, url: '/assets/samples/piano/piano_C4_med.mp3' },
            { threshold: 1, url: '/assets/samples/piano/piano_C4_hard.mp3' },
          ],
        },
      ],
      defaultFx: [
        { id: 'eq', type: 'filter', params: { type: 'highpass', frequency: 30 }, enabled: true },
        { id: 'comp', type: 'compressor', params: { threshold: -22 }, enabled: true, mix: 0.3 },
      ],
    },
    {
      id: 'stage-piano',
      name: 'Stage Piano',
      type: 'sample',
      category: 'piano',
      sampleQuality: 'standard',
      articulation: {
        attack: 0.01,
        release: 0.45,
        tone: 0.72,
        character: 0.42,
      },
      zones: [
        {
          midiRange: [21, 108],
          url: '/assets/samples/piano/stage_C4.mp3',
          rr: 2,
          quality: 'standard',
          velLayers: [
            { threshold: 0.6, url: '/assets/samples/piano/stage_C4_soft.mp3' },
            { threshold: 1, url: '/assets/samples/piano/stage_C4_hard.mp3' },
          ],
        },
      ],
    },
    {
      id: 'acoustic-guitar',
      name: 'Acoustic Guitar',
      type: 'sample',
      category: 'guitar',
      sampleQuality: 'standard',
      articulation: {
        attack: 0.03,
        release: 0.38,
        tone: 0.57,
        character: 0.51,
      },
      zones: [
        { midiRange: [40, 88], url: '/assets/samples/guitar/guitar_E3.mp3' },
      ],
    },
    {
      id: 'orchestra-strings',
      name: 'Orchestra Strings',
      type: 'sample',
      category: 'strings',
      sampleQuality: 'high',
      fallbackPresetId: 'orchestra-ensemble',
      articulation: {
        attack: 0.16,
        release: 0.95,
        tone: 0.45,
        character: 0.7,
      },
      zones: [
        { midiRange: [40, 96], url: '/assets/samples/strings/strings_G3.mp3' },
      ],
    },
    {
      id: 'violin-solo',
      name: 'Violin Solo',
      type: 'synth',
      category: 'strings',
      articulation: {
        attack: 0.06,
        release: 0.6,
        tone: 0.56,
        character: 0.68,
      },
      synth: {
        type: 'sawtooth',
        attack: 0.02,
        decay: 0.2,
        sustain: 0.6,
        release: 0.6,
        cutoff: 5200,
        q: 1.1,
      },
    },
    {
      id: 'electric-guitar',
      name: 'Electric Guitar',
      type: 'synth',
      category: 'guitar',
      synth: {
        type: 'square',
        attack: 0.01,
        decay: 0.12,
        sustain: 0.5,
        release: 0.3,
        cutoff: 3800,
        q: 0.9,
      },
    },
    {
      id: 'orchestra-ensemble',
      name: 'Orchestra Ensemble',
      type: 'synth',
      category: 'strings',
      synth: {
        type: 'sawtooth',
        attack: 0.18,
        decay: 0.4,
        sustain: 0.8,
        release: 1.1,
        cutoff: 3600,
        q: 0.85,
      },
    },
    {
      id: 'synth-lead',
      name: 'Synth Lead',
      type: 'synth',
      category: 'lead',
      synth: {
        type: 'sawtooth',
        attack: 0.005,
        decay: 0.08,
        sustain: 0.7,
        release: 0.2,
        cutoff: 8000,
        q: 0.707,
      },
    },
    {
      id: 'synth-bass',
      name: 'Synth Bass',
      type: 'synth',
      category: 'bass',
      synth: {
        type: 'square',
        attack: 0.004,
        decay: 0.18,
        sustain: 0.7,
        release: 0.2,
        cutoff: 1400,
        q: 1.25,
      },
    },
    {
      id: 'bass-guitar',
      name: 'Bass Guitar',
      type: 'synth',
      category: 'bass',
      synth: {
        type: 'triangle',
        attack: 0.01,
        decay: 0.15,
        sustain: 0.65,
        release: 0.4,
        cutoff: 1800,
        q: 1,
      },
    },
    {
      id: 'synth-pad',
      name: 'Synth Pad',
      type: 'synth',
      category: 'pad',
      synth: {
        type: 'triangle',
        attack: 0.2,
        decay: 0.5,
        sustain: 0.8,
        release: 1.2,
        cutoff: 4000,
        q: 0.9,
      },
    },
    {
      id: 'kit-808',
      name: '808 Kit',
      type: 'sample',
      category: 'drum',
      sampleQuality: 'standard',
      articulation: {
        attack: 0.002,
        release: 0.22,
        tone: 0.68,
        character: 0.74,
      },
      zones: [
        { midiRange: [36, 36], url: '/assets/samples/808/kick.mp3' },
        { midiRange: [38, 38], url: '/assets/samples/808/snare.mp3' },
        { midiRange: [39, 39], url: '/assets/samples/808/clap.mp3' },
        { midiRange: [42, 42], url: '/assets/samples/808/hat-closed.mp3' },
        { midiRange: [46, 46], url: '/assets/samples/808/hat-open.mp3' },
      ],
    },
    {
      id: 'kit-studio',
      name: 'Studio Drums',
      type: 'sample',
      category: 'drum',
      sampleQuality: 'high',
      fallbackPresetId: 'kit-808',
      articulation: {
        attack: 0.002,
        release: 0.2,
        tone: 0.72,
        character: 0.58,
      },
      zones: [
        { midiRange: [36, 36], url: '/assets/samples/studio/kick.mp3' },
        { midiRange: [37, 37], url: '/assets/samples/studio/rim.mp3' },
        { midiRange: [38, 38], url: '/assets/samples/studio/snare.mp3' },
        { midiRange: [40, 40], url: '/assets/samples/studio/tom-low.mp3' },
        { midiRange: [43, 43], url: '/assets/samples/studio/tom-mid.mp3' },
        { midiRange: [47, 47], url: '/assets/samples/studio/tom-high.mp3' },
        { midiRange: [42, 42], url: '/assets/samples/studio/hhc.mp3' },
        { midiRange: [46, 46], url: '/assets/samples/studio/hho.mp3' },
        { midiRange: [49, 49], url: '/assets/samples/studio/crash.mp3' },
      ],
    },
    {
      id: 'afro-perc-kit',
      name: 'Afro Perc Kit',
      type: 'sample',
      category: 'drum',
      sampleQuality: 'high',
      fallbackPresetId: 'kit-studio',
      articulation: {
        attack: 0.003,
        release: 0.24,
        tone: 0.63,
        character: 0.71,
      },
      zones: [
        { midiRange: [36, 36], url: '/assets/samples/afro/kick.mp3', rr: 2 },
        { midiRange: [38, 38], url: '/assets/samples/afro/snare.mp3', rr: 2 },
        { midiRange: [42, 42], url: '/assets/samples/afro/shaker.mp3', rr: 3 },
        { midiRange: [46, 46], url: '/assets/samples/afro/hho.mp3', rr: 2 },
      ],
    },
  ];

  getPresets() {
    return this.presets;
  }
}
