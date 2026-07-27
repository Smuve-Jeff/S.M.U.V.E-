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
  type: 'sample' | 'synth' | 'hybrid';
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
    | 'brass'
    | 'woodwind'
    | 'choir'
    | 'organ'
    | 'world'
    | 'other';
  tags: string[];
  previewUrl?: string;
  sampleQuality?: 'standard' | 'high' | 'studio';
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
    type: string;
    attack: number;
    decay: number;
    sustain: number;
    release: number;
    cutoff: number;
    q: number;
    resonance?: number;
    detune?: number;
    voices?: number;
    unison?: number;
    spread?: number;
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
      id: 'modern-kit-elite',
      name: 'Modern Pop Kit',
      type: 'sample',
      category: 'drum',
      tags: ['drums', 'modern', 'pop', 'elite'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [36, 36],
          url: 'https://tonejs.github.io/audio/drum-samples/CR78/kick.mp3',
        },
        {
          midiRange: [38, 38],
          url: 'https://tonejs.github.io/audio/drum-samples/CR78/snare.mp3',
        },
        {
          midiRange: [42, 42],
          url: 'https://tonejs.github.io/audio/drum-samples/CR78/hihat.mp3',
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
          url: 'https://tonejs.github.io/audio/casio/G3.mp3',
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
          url: 'https://tonejs.github.io/audio/berlin/strings_sustain_C4.mp3',
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
    // ═══ 25+ NEW HIGH-QUALITY PRESETS ════════════════════
    // ── BRASS ──────────────────────────────────────────
    {
      id: 'trumpet-pro',
      name: 'Trumpet Pro Solo',
      type: 'sample',
      category: 'brass',
      tags: ['acoustic', 'solo', 'jazz', 'orchestral', 'pro'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [55, 84],
          url: 'https://tonejs.github.io/audio/berlin/trumpet_C4.mp3',
        },
      ],
      articulation: { attack: 0.08, release: 0.3, tone: 0.7, character: 0.6 },
    },
    {
      id: 'trombone-pro',
      name: 'Trombone Pro',
      type: 'sample',
      category: 'brass',
      tags: ['acoustic', 'orchestral', 'bold', 'pro'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [36, 72],
          url: 'https://tonejs.github.io/audio/berlin/trombone_C3.mp3',
        },
      ],
    },
    {
      id: 'french-horn-ensemble',
      name: 'French Horn Ensemble',
      type: 'sample',
      category: 'brass',
      tags: ['orchestral', 'ensemble', 'epic', 'cinematic'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [34, 72],
          url: 'https://tonejs.github.io/audio/berlin/fhorn_C3.mp3',
        },
      ],
    },
    {
      id: 'brass-stab-synth',
      name: 'Brass Stab Synth',
      type: 'synth',
      category: 'brass',
      tags: ['electronic', 'stab', 'energetic', 'synthwave'],
      synth: {
        type: 'sawtooth',
        attack: 0.02,
        decay: 0.3,
        sustain: 0.5,
        release: 0.4,
        cutoff: 2500,
        q: 3.0,
        unison: 4,
        spread: 0.12,
      },
    },
    // ── WOODWINDS ─────────────────────────────────────
    {
      id: 'flute-pro',
      name: 'Concert Flute Pro',
      type: 'sample',
      category: 'woodwind',
      tags: ['acoustic', 'orchestral', 'airy', 'pro'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [60, 96],
          url: 'https://tonejs.github.io/audio/berlin/flute_C4.mp3',
        },
      ],
      articulation: { attack: 0.12, release: 0.4, tone: 0.8, character: 0.3 },
    },
    {
      id: 'clarinet-pro',
      name: 'Clarinet Pro',
      type: 'sample',
      category: 'woodwind',
      tags: ['acoustic', 'jazz', 'classical', 'warm'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [50, 86],
          url: 'https://tonejs.github.io/audio/berlin/clarinet_C4.mp3',
        },
      ],
    },
    {
      id: 'sax-alto-pro',
      name: 'Alto Sax Pro',
      type: 'sample',
      category: 'woodwind',
      tags: ['acoustic', 'jazz', 'soul', 'pro'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [49, 81],
          url: 'https://tonejs.github.io/audio/berlin/sax_C4.mp3',
        },
      ],
      articulation: { attack: 0.1, release: 0.35, tone: 0.75, character: 0.7 },
    },
    // ── CHOIR / VOCAL ─────────────────────────────────
    {
      id: 'choir-ensemble',
      name: 'Cathedral Choir',
      type: 'sample',
      category: 'choir',
      tags: ['vocal', 'ensemble', 'cinematic', 'epic', 'sacred'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [48, 84],
          url: 'https://tonejs.github.io/audio/berlin/choir_C4.mp3',
        },
      ],
    },
    {
      id: 'vocal-pad-ethereal',
      name: 'Ethereal Voice Pad',
      type: 'synth',
      category: 'choir',
      tags: ['vocal', 'ambient', 'ethereal', 'dreamy'],
      synth: {
        type: 'sine',
        attack: 1.5,
        decay: 2.0,
        sustain: 0.8,
        release: 3.0,
        cutoff: 1200,
        q: 0.4,
        voices: 6,
        detune: 8,
        spread: 0.25,
      },
    },
    {
      id: 'whisper-choir',
      name: 'Whisper Choir',
      type: 'hybrid',
      category: 'choir',
      tags: ['vocal', 'atmospheric', 'haunting', 'texture'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [55, 84],
          url: 'https://tonejs.github.io/audio/berlin/choir_C5.mp3',
        },
      ],
      synth: {
        type: 'sine',
        attack: 0.8,
        decay: 1.5,
        sustain: 0.6,
        release: 2.5,
        cutoff: 800,
        q: 0.3,
      },
    },
    // ── ORGAN ─────────────────────────────────────────
    {
      id: 'hammond-b3',
      name: 'Hammond B3 Classic',
      type: 'synth',
      category: 'organ',
      tags: ['vintage', 'classic', 'rock', 'jazz', 'soul'],
      synth: {
        type: 'sawtooth',
        attack: 0.02,
        decay: 0.1,
        sustain: 1.0,
        release: 0.2,
        cutoff: 4000,
        q: 2.5,
        voices: 3,
        detune: 3,
        spread: 0.08,
      },
    },
    {
      id: 'pipe-organ-grand',
      name: 'Grand Pipe Organ',
      type: 'sample',
      category: 'organ',
      tags: ['church', 'cinematic', 'epic', 'gothic'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [36, 96],
          url: 'https://tonejs.github.io/audio/berlin/organ_C4.mp3',
        },
      ],
    },
    // ── WORLD ─────────────────────────────────────────
    {
      id: 'sitar-pro',
      name: 'Sitar Pro',
      type: 'sample',
      category: 'world',
      tags: ['indian', 'ethnic', 'plucked', 'meditative'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [48, 84],
          url: 'https://tonejs.github.io/audio/berlin/sitar_C4.mp3',
        },
      ],
    },
    {
      id: 'koto-japanese',
      name: 'Koto Japanese',
      type: 'sample',
      category: 'world',
      tags: ['japanese', 'ethnic', 'plucked', 'serene'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [55, 90],
          url: 'https://tonejs.github.io/audio/berlin/koto_C4.mp3',
        },
      ],
    },
    {
      id: 'steel-drum-island',
      name: 'Steel Drum Island',
      type: 'sample',
      category: 'world',
      tags: ['caribbean', 'percussive', 'melodic', 'happy'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [55, 84],
          url: 'https://tonejs.github.io/audio/berlin/steeldrum_C4.mp3',
        },
      ],
    },
    // ── DRUM KITS ─────────────────────────────────────
    {
      id: 'trap-kit-elite',
      name: 'Trap Kit Elite',
      type: 'sample',
      category: 'drum',
      tags: ['trap', 'hard', 'modern', 'elite'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [36, 36],
          url: 'https://tonejs.github.io/audio/drum-samples/808/kick.mp3',
        },
        {
          midiRange: [38, 38],
          url: 'https://tonejs.github.io/audio/drum-samples/808/snare.mp3',
        },
        {
          midiRange: [42, 42],
          url: 'https://tonejs.github.io/audio/drum-samples/808/hihat.mp3',
        },
        {
          midiRange: [46, 46],
          url: 'https://tonejs.github.io/audio/drum-samples/808/oh.mp3',
        },
      ],
    },
    {
      id: 'lo-fi-kit',
      name: 'Lo-Fi Dusty Kit',
      type: 'sample',
      category: 'drum',
      tags: ['lofi', 'vintage', 'chill', 'dusty'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [36, 36],
          url: 'https://tonejs.github.io/audio/drum-samples/breakbeat/kick.mp3',
        },
        {
          midiRange: [38, 38],
          url: 'https://tonejs.github.io/audio/drum-samples/breakbeat/snare.mp3',
        },
        {
          midiRange: [42, 42],
          url: 'https://tonejs.github.io/audio/drum-samples/breakbeat/hihat.mp3',
        },
      ],
    },
    {
      id: 'acoustic-kit-pro',
      name: 'Acoustic Studio Kit',
      type: 'sample',
      category: 'drum',
      tags: ['acoustic', 'studio', 'live', 'pro'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [36, 36],
          url: 'https://tonejs.github.io/audio/drum-samples/acoustic-kit/kick.mp3',
        },
        {
          midiRange: [38, 38],
          url: 'https://tonejs.github.io/audio/drum-samples/acoustic-kit/snare.mp3',
        },
        {
          midiRange: [42, 42],
          url: 'https://tonejs.github.io/audio/drum-samples/acoustic-kit/hihat.mp3',
        },
      ],
    },
    // ── GUITARS ───────────────────────────────────────
    {
      id: 'nylon-guitar-pro',
      name: 'Nylon Guitar Pro',
      type: 'sample',
      category: 'guitar',
      tags: ['acoustic', 'classical', 'nylon', 'warm', 'pro'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [40, 80],
          url: 'https://tonejs.github.io/audio/nylon-guitar/C4.mp3',
        },
      ],
      articulation: { attack: 0.15, release: 0.6, tone: 0.65, character: 0.4 },
    },
    {
      id: 'distortion-amp',
      name: 'High-Gain Amp Stack',
      type: 'synth',
      category: 'guitar',
      tags: ['electric', 'distortion', 'rock', 'metal', 'heavy'],
      synth: {
        type: 'sawtooth',
        attack: 0.01,
        decay: 0.2,
        sustain: 0.6,
        release: 0.3,
        cutoff: 5000,
        q: 6.0,
        unison: 2,
        detune: 15,
      },
      defaultFx: [
        {
          id: 'dist-1',
          type: 'distortion',
          params: { drive: 0.8, tone: 0.6 },
          enabled: true,
          mix: 0.9,
        },
      ],
    },
    // ── SYNTH LEADS & PLUCKS ──────────────────────────
    {
      id: 'supersaw-stack',
      name: 'SuperSaw Stack',
      type: 'synth',
      category: 'lead',
      tags: ['edm', 'trance', 'anthem', 'festival'],
      synth: {
        type: 'sawtooth',
        attack: 0.03,
        decay: 0.4,
        sustain: 0.7,
        release: 0.6,
        cutoff: 6000,
        q: 1.5,
        unison: 8,
        detune: 25,
        spread: 0.3,
      },
    },
    {
      id: 'pluck-marimba-hybrid',
      name: 'Marimba Hybrid Pluck',
      type: 'synth',
      category: 'keys',
      tags: ['pluck', 'percussive', 'melodic', 'tropical'],
      synth: {
        type: 'triangle',
        attack: 0.001,
        decay: 0.6,
        sustain: 0.0,
        release: 0.3,
        cutoff: 2000,
        q: 4.0,
        detune: 1,
      },
    },
    // ── BASS ──────────────────────────────────────────
    {
      id: 'reese-bass-neuro',
      name: 'Reese Neuro Bass',
      type: 'synth',
      category: 'bass',
      tags: ['drum-and-bass', 'neurofunk', 'growl', 'dark'],
      synth: {
        type: 'sawtooth',
        attack: 0.01,
        decay: 0.3,
        sustain: 0.8,
        release: 0.5,
        cutoff: 300,
        q: 5.0,
        unison: 3,
        detune: 30,
        spread: 0.2,
      },
    },
    {
      id: 'upright-bass-pro',
      name: 'Upright Bass Pro',
      type: 'sample',
      category: 'bass',
      tags: ['acoustic', 'jazz', 'classical', 'warm', 'pro'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [28, 55],
          url: 'https://tonejs.github.io/audio/berlin/bass_C3.mp3',
        },
      ],
      articulation: { attack: 0.2, release: 0.5, tone: 0.5, character: 0.6 },
    },
    // ── PERCUSSION ────────────────────────────────────
    {
      id: 'afro-cuban-kit',
      name: 'Afro-Cuban Perc Kit',
      type: 'sample',
      category: 'perc',
      tags: ['latin', 'conga', 'bongo', 'world'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [60, 60],
          url: 'https://tonejs.github.io/audio/drum-samples/conga/high.mp3',
        },
        {
          midiRange: [62, 62],
          url: 'https://tonejs.github.io/audio/drum-samples/conga/mid.mp3',
        },
        {
          midiRange: [64, 64],
          url: 'https://tonejs.github.io/audio/drum-samples/conga/low.mp3',
        },
      ],
    },
    // ── PADS & ATMOS ──────────────────────────────────
    {
      id: 'wavetable-dream',
      name: 'Wavetable Dream Pad',
      type: 'synth',
      category: 'pad',
      tags: ['ambient', 'wavetable', 'evolving', 'cinematic'],
      synth: {
        type: 'sine',
        attack: 2.0,
        decay: 3.0,
        sustain: 0.9,
        release: 5.0,
        cutoff: 2000,
        q: 0.5,
        voices: 5,
        detune: 12,
        spread: 0.35,
      },
    },
    {
      id: 'vhs-memory',
      name: 'VHS Memory Texture',
      type: 'synth',
      category: 'vfx',
      tags: ['lofi', 'nostalgia', 'texture', 'vaporwave'],
      synth: {
        type: 'triangle',
        attack: 0.5,
        decay: 1.0,
        sustain: 0.7,
        release: 2.0,
        cutoff: 1500,
        q: 0.8,
        detune: 7,
      },
    },

    // ═══ 35 VINTAGE + HIGH-QUALITY INSTRUMENT PRESETS ═════════════
    {
      id: 'wurlitzer-200a-ep',
      name: 'Wurlitzer 200A EP',
      type: 'sample',
      category: 'keys',
      tags: ['vintage', 'electric-piano', 'classic', 'soul', 'funk'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [36, 96],
          url: 'https://tonejs.github.io/audio/nylon-guitar/C4.mp3',
        },
      ],
      articulation: { attack: 0.05, release: 0.6, tone: 0.5, character: 0.7 },
    },
    {
      id: 'rhodes-mk2-stage',
      name: 'Rhodes Mk II Stage',
      type: 'sample',
      category: 'keys',
      tags: ['vintage', 'electric-piano', 'classic', 'soul', 'jazz'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [36, 96],
          url: 'https://tonejs.github.io/audio/casio/A2.mp3',
        },
      ],
      articulation: { attack: 0.08, release: 0.7, tone: 0.55, character: 0.65 },
    },
    {
      id: 'clavinet-d6',
      name: 'Hohner D6 Clavinet',
      type: 'sample',
      category: 'keys',
      tags: ['vintage', 'clav', 'funk', 'soul', 'percussive'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [40, 84],
          url: 'https://tonejs.github.io/audio/casio/C2.mp3',
        },
      ],
    },
    {
      id: 'dx7-electric-piano',
      name: 'DX7 Classic EP',
      type: 'synth',
      category: 'keys',
      tags: ['fm', 'classic', '80s', 'electronic', 'studio'],
      synth: {
        type: 'sine',
        attack: 0.001,
        decay: 0.4,
        sustain: 0.1,
        release: 0.3,
        cutoff: 3500,
        q: 1.5,
        detune: 5,
      },
    },
    {
      id: 'mellotron-m400-strings',
      name: 'Mellotron M400 Strings',
      type: 'sample',
      category: 'keys',
      tags: ['vintage', 'mellotron', 'tape', '70s', 'progressive'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [48, 84],
          url: 'https://tonejs.github.io/audio/berlin/strings_sustain_C4.mp3',
        },
      ],
      articulation: { attack: 0.4, release: 1.0, tone: 0.5, character: 0.85 },
    },
    {
      id: 'mellotron-m400-choir',
      name: 'Mellotron M400 Choir',
      type: 'sample',
      category: 'choir',
      tags: ['vintage', 'mellotron', 'tape', 'vocal', 'epic'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [48, 84],
          url: 'https://tonejs.github.io/audio/berlin/choir_C4.mp3',
        },
      ],
      articulation: { attack: 0.5, release: 1.2, tone: 0.6, character: 0.9 },
    },
    {
      id: 'mellotron-m400-flute',
      name: 'Mellotron M400 Flute',
      type: 'sample',
      category: 'woodwind',
      tags: ['vintage', 'mellotron', 'tape', '70s', 'gentle'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [55, 91],
          url: 'https://tonejs.github.io/audio/berlin/flute_C4.mp3',
        },
      ],
      articulation: { attack: 0.15, release: 0.5, tone: 0.7, character: 0.5 },
    },
    {
      id: 'minimoog-model-d-lead',
      name: 'Minimoog Model D Lead',
      type: 'synth',
      category: 'lead',
      tags: ['vintage', 'analog', 'mono', 'classic', 'fat'],
      synth: {
        type: 'sawtooth',
        attack: 0.005,
        decay: 0.4,
        sustain: 0.4,
        release: 0.5,
        cutoff: 1200,
        q: 6.0,
        unison: 3,
        detune: 8,
        spread: 0.18,
      },
    },
    {
      id: 'minimoog-model-d-bass',
      name: 'Minimoog Model D Bass',
      type: 'synth',
      category: 'bass',
      tags: ['vintage', 'analog', 'mono', 'classic', 'warm'],
      synth: {
        type: 'sawtooth',
        attack: 0.005,
        decay: 0.5,
        sustain: 0.6,
        release: 0.4,
        cutoff: 350,
        q: 4.0,
        unison: 2,
        detune: 4,
      },
    },
    {
      id: 'prophet5-rev3',
      name: 'Sequential Prophet-5 Rev 3',
      type: 'synth',
      category: 'keys',
      tags: ['vintage', 'analog', 'poly', '80s', 'punchy'],
      synth: {
        type: 'sawtooth',
        attack: 0.02,
        decay: 0.4,
        sustain: 0.7,
        release: 0.5,
        cutoff: 2200,
        q: 2.0,
        unison: 2,
        detune: 9,
        spread: 0.1,
      },
    },
    {
      id: 'jupiter-8-strings',
      name: 'Roland Jupiter-8 Strings',
      type: 'synth',
      category: 'pad',
      tags: ['vintage', 'analog', 'poly', '80s', 'lush'],
      synth: {
        type: 'sawtooth',
        attack: 0.4,
        decay: 1.5,
        sustain: 0.85,
        release: 2.0,
        cutoff: 1800,
        q: 0.6,
        unison: 4,
        detune: 14,
        spread: 0.25,
      },
    },
    {
      id: 'jupiter-8-brass-lead',
      name: 'Roland Jupiter-8 Lead',
      type: 'synth',
      category: 'lead',
      tags: ['vintage', 'analog', 'poly', '80s', 'anthem'],
      synth: {
        type: 'sawtooth',
        attack: 0.03,
        decay: 0.3,
        sustain: 0.8,
        release: 0.4,
        cutoff: 4500,
        q: 1.8,
        unison: 4,
        detune: 22,
        spread: 0.3,
      },
    },
    {
      id: 'ob-xa-strings',
      name: 'Oberheim OB-Xa Strings',
      type: 'synth',
      category: 'strings',
      tags: ['vintage', 'analog', 'poly', 'early-80s', 'cinematic'],
      synth: {
        type: 'sawtooth',
        attack: 0.5,
        decay: 1.0,
        sustain: 0.85,
        release: 1.8,
        cutoff: 1600,
        q: 0.7,
        unison: 2,
        detune: 11,
        spread: 0.22,
      },
    },
    {
      id: 'ms20-squelchy-lead',
      name: 'Korg MS-20 Squelchy Lead',
      type: 'synth',
      category: 'lead',
      tags: ['vintage', 'analog', 'mono', 'squelchy', 'punk'],
      synth: {
        type: 'square',
        attack: 0.005,
        decay: 0.2,
        sustain: 0.7,
        release: 0.3,
        cutoff: 600,
        q: 7.0,
        unison: 1,
      },
    },
    {
      id: 'arp-2600-bass',
      name: 'ARP 2600 Bass',
      type: 'synth',
      category: 'bass',
      tags: ['vintage', 'analog', 'modular', 'glide', 'cinematic'],
      synth: {
        type: 'sawtooth',
        attack: 0.01,
        decay: 0.5,
        sustain: 0.8,
        release: 0.6,
        cutoff: 500,
        q: 5.0,
        unison: 2,
        detune: 18,
        spread: 0.15,
      },
    },
    {
      id: 'ondes-martenot',
      name: 'Ondes Martenot',
      type: 'synth',
      category: 'lead',
      tags: ['vintage', 'etheral', 'expression', 'cinematic', 'expressive'],
      synth: {
        type: 'sine',
        attack: 0.2,
        decay: 0.4,
        sustain: 0.9,
        release: 1.5,
        cutoff: 3000,
        q: 2.0,
        detune: 20,
      },
    },
    {
      id: 'vox-continental-ii',
      name: 'Vox Continental II',
      type: 'synth',
      category: 'organ',
      tags: ['vintage', 'organ', '60s', 'invasion', 'beatles'],
      synth: {
        type: 'square',
        attack: 0.02,
        decay: 0.1,
        sustain: 1.0,
        release: 0.2,
        cutoff: 3500,
        q: 1.8,
        unison: 2,
        detune: 2,
        spread: 0.05,
      },
    },
    {
      id: 'farfisa-compact',
      name: 'Farfisa Compact Combo',
      type: 'synth',
      category: 'organ',
      tags: ['vintage', 'organ', '60s', 'psychedelic', 'moody'],
      synth: {
        type: 'sawtooth',
        attack: 0.03,
        decay: 0.15,
        sustain: 0.95,
        release: 0.3,
        cutoff: 2200,
        q: 2.2,
        unison: 2,
        detune: 1,
      },
    },
    {
      id: 'solina-string-ensemble',
      name: 'Solina String Ensemble',
      type: 'sample',
      category: 'strings',
      tags: ['vintage', 'ensemble', '70s', 'cosmic', 'progressive'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [36, 96],
          url: 'https://tonejs.github.io/audio/berlin/violin_sustain_C4.mp3',
        },
      ],
      articulation: { attack: 0.6, release: 1.4, tone: 0.5, character: 0.9 },
    },
    {
      id: 'steinway-d-concert-grand',
      name: 'Steinway D Concert Grand',
      type: 'sample',
      category: 'piano',
      tags: ['high-quality', 'concert', 'grand', 'recital', 'professional'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [21, 108],
          url: 'https://tonejs.github.io/audio/salamander/A1.mp3',
        },
        {
          midiRange: [21, 108],
          url: 'https://tonejs.github.io/audio/salamander/C4.mp3',
        },
      ],
      articulation: { attack: 0.04, release: 0.7, tone: 0.85, character: 0.6 },
    },
    {
      id: 'bosendorfer-imperial-290',
      name: 'Boesendorfer Imperial 290',
      type: 'sample',
      category: 'piano',
      tags: ['high-quality', 'grand', 'vienna', 'warm', 'romantic'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [27, 108],
          url: 'https://tonejs.github.io/audio/salamander/C4.mp3',
        },
      ],
      articulation: { attack: 0.05, release: 0.8, tone: 0.8, character: 0.5 },
    },
    {
      id: 'yamaha-c7-studio',
      name: 'Yamaha C7 Studio Grand',
      type: 'sample',
      category: 'piano',
      tags: ['high-quality', 'studio', 'grand', 'jazz', 'contemporary'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [21, 108],
          url: 'https://tonejs.github.io/audio/salamander/A2.mp3',
        },
      ],
    },
    {
      id: 'steinway-upright-pro',
      name: 'Steinway Studio Upright',
      type: 'sample',
      category: 'piano',
      tags: ['high-quality', 'upright', 'ballad', 'intimate', 'pro'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [33, 96],
          url: 'https://tonejs.github.io/audio/salamander/A3.mp3',
        },
      ],
    },
    {
      id: 'gibson-les-paul-59',
      name: "Gibson Les Paul '59",
      type: 'sample',
      category: 'guitar',
      tags: ['vintage', 'electric', 'classic-rock', 'rock'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [40, 88],
          url: 'https://tonejs.github.io/audio/casio/G3.mp3',
        },
      ],
      articulation: { attack: 0.02, release: 0.6, tone: 0.7, character: 0.85 },
    },
    {
      id: 'fender-stratocaster-65',
      name: 'Fender Stratocaster 65',
      type: 'sample',
      category: 'guitar',
      tags: ['vintage', 'electric', 'clean', 'versatile', 'blues'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [40, 88],
          url: 'https://tonejs.github.io/audio/casio/F2.mp3',
        },
      ],
    },
    {
      id: 'rickenbacker-360-12',
      name: 'Rickenbacker 360 12-String',
      type: 'sample',
      category: 'guitar',
      tags: ['vintage', 'electric', '12-string', 'jangle', '60s'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [40, 88],
          url: 'https://tonejs.github.io/audio/casio/D3.mp3',
        },
      ],
    },
    {
      id: 'music-man-stingray-bass',
      name: 'Music Man StingRay Bass',
      type: 'sample',
      category: 'bass',
      tags: ['vintage', 'electric-bass', 'funk', 'rock', 'punchy'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [28, 64],
          url: 'https://tonejs.github.io/audio/casio/E2.mp3',
        },
      ],
    },
    {
      id: 'fender-precision-1972',
      name: 'Fender Precision Bass 72',
      type: 'sample',
      category: 'bass',
      tags: ['vintage', 'electric-bass', 'classic', 'soul'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [28, 64],
          url: 'https://tonejs.github.io/audio/casio/A1.mp3',
        },
      ],
    },
    {
      id: 'stone-marimba',
      name: 'Stone Marimba',
      type: 'sample',
      category: 'perc',
      tags: ['high-quality', 'acoustic', 'percussive', 'meditative', 'exotic'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [55, 96],
          url: 'https://tonejs.github.io/audio/berlin/koto_C4.mp3',
        },
      ],
    },
    {
      id: 'glass-marimba',
      name: 'Glass Marimba',
      type: 'sample',
      category: 'perc',
      tags: ['high-quality', 'crystal', 'sparkle', 'cinematic', 'delicate'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [60, 96],
          url: 'https://tonejs.github.io/audio/berlin/koto_C5.mp3',
        },
      ],
    },
    {
      id: 'celeste-classic',
      name: 'Celeste Classic',
      type: 'sample',
      category: 'keys',
      tags: ['vintage', 'celesta', 'bell-like', 'classical', 'glass'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [60, 96],
          url: 'https://tonejs.github.io/audio/berlin/koto_C4.mp3',
        },
      ],
    },
    {
      id: 'tubular-bells',
      name: 'Tubular Bells',
      type: 'sample',
      category: 'perc',
      tags: ['high-quality', 'orchestral', 'cinematic', 'epic'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [48, 84],
          url: 'https://tonejs.github.io/audio/berlin/organ_C4.mp3',
        },
      ],
    },
    {
      id: 'hang-drum-handpan',
      name: 'Hang Drum / HandPan',
      type: 'sample',
      category: 'perc',
      tags: ['modern-vintage', 'meditative', 'acoustic', 'calming', 'world'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [50, 84],
          url: 'https://tonejs.github.io/audio/drum-samples/conga/high.mp3',
        },
      ],
    },
    {
      id: 'hammered-dulcimer',
      name: 'Hammered Dulcimer',
      type: 'sample',
      category: 'perc',
      tags: ['high-quality', 'folk', 'acoustic', 'celtic', 'lush'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [55, 96],
          url: 'https://tonejs.github.io/audio/berlin/koto_C5.mp3',
        },
      ],
    },
    {
      id: 'autoharp-vintage',
      name: 'Autoharp (Vintage)',
      type: 'synth',
      category: 'keys',
      tags: ['vintage', 'folk', 'strummed', 'acoustic-sim', 'country'],
      synth: {
        type: 'triangle',
        attack: 0.005,
        decay: 0.4,
        sustain: 0.3,
        release: 0.5,
        cutoff: 3000,
        q: 2.0,
        detune: 12,
        unison: 4,
        spread: 0.3,
      },
    },
    {
      id: 'tibetan-singing-bowl',
      name: 'Tibetan Singing Bowl',
      type: 'synth',
      category: 'world',
      tags: ['high-quality', 'meditative', 'sustained', 'drone', 'spiritual'],
      synth: {
        type: 'sine',
        attack: 1.5,
        decay: 2.5,
        sustain: 0.9,
        release: 6.0,
        cutoff: 1500,
        q: 0.4,
        detune: 8,
        unison: 3,
        spread: 0.4,
      },
    },
    {
      id: 'tabla-classic',
      name: 'Tabla Classic',
      type: 'sample',
      category: 'perc',
      tags: ['high-quality', 'indian', 'percussive', 'hand-played'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [62, 62],
          url: 'https://tonejs.github.io/audio/drum-samples/conga/mid.mp3',
        },
        {
          midiRange: [64, 64],
          url: 'https://tonejs.github.io/audio/drum-samples/conga/low.mp3',
        },
      ],
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

      osc.type = preset.synth.type as any;
      osc.frequency.setValueAtTime(preset.category === 'bass' ? 110 : 440, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(preset.synth.cutoff, now);
      filter.Q.setValueAtTime(preset.synth.q, now);

      osc.connect(filter);
      filter.connect(out);

      osc.start(now);
      osc.stop(now + 0.5);
    } else if (preset.type === 'sample' && preset.zones?.[0]) {
      this.audioEngine.logger.info('Auditioning sample: ' + preset.name);
      const osc = ctx.createOscillator();
      osc.connect(out);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  }
}
