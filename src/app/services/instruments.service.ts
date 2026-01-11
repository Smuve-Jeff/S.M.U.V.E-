import { Injectable } from '@angular/core';

export type SampleZone = {
  midiRange: [number, number];
  url: string; // Audio file URL
  rr?: number; // round-robin variants count
  velLayers?: { threshold: number; url: string }[]; // optional velocity layering
};

export interface InstrumentPreset {
  id: string;
  name: string;
  type: 'sample' | 'synth';
  zones?: SampleZone[]; // for sample-based instruments
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
      zones: [
        { midiRange: [21, 108], url: '/assets/samples/piano/piano_C4.mp3' },
      ],
    },
    {
      id: 'acoustic-guitar',
      name: 'Acoustic Guitar',
      type: 'sample',
      zones: [
        { midiRange: [40, 88], url: '/assets/samples/guitar/guitar_E3.mp3' },
      ],
    },
    {
      id: 'orchestra-strings',
      name: 'Orchestra Strings',
      type: 'sample',
      zones: [
        { midiRange: [40, 96], url: '/assets/samples/strings/strings_G3.mp3' },
      ],
    },
    {
      id: 'synth-lead',
      name: 'Synth Lead',
      type: 'synth',
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
      id: 'synth-pad',
      name: 'Synth Pad',
      type: 'synth',
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
  ];

  getPresets() {
    return this.presets;
  }
}
